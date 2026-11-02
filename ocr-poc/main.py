import os
import re
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from paddleocr import PaddleOCR

APP_NAME = "FOMS Odometer OCR POC"
MAX_UPLOAD_BYTES = int(os.getenv("OCR_MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))
API_KEY = os.getenv("OCR_API_KEY", "").strip()

app = FastAPI(title=APP_NAME, version="0.1.0")
ocr_engine: PaddleOCR | None = None


@app.on_event("startup")
def load_ocr_engine() -> None:
    global ocr_engine
    ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"success": True, "service": APP_NAME, "model_loaded": ocr_engine is not None}


def extract_candidates(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line in lines:
        raw_text = str(line["text"])
        for match in re.finditer(r"(?<!\d)(\d[\d,\.\s]{2,10}\d)(?!\d)", raw_text):
            raw_value = match.group(1).strip()
            digits = re.sub(r"\D", "", raw_value)
            if not 4 <= len(digits) <= 8 or digits in seen:
                continue
            seen.add(digits)
            candidates.append({
                "value": int(digits),
                "display": raw_value,
                "digits": digits,
                "ocrConfidence": round(float(line["confidence"]), 4),
                "sourceText": raw_text,
            })
    candidates.sort(
        key=lambda item: (
            1 if 5 <= len(item["digits"]) <= 7 else 0,
            item["ocrConfidence"],
            len(item["digits"]),
        ),
        reverse=True,
    )
    return candidates[:10]


@app.post("/api/odometer/recognize")
async def recognize_odometer(
    file: UploadFile = File(...),
    meter_type: str = "both",
    x_ocr_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
    if API_KEY and x_ocr_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid OCR service API key")
    if meter_type not in {"digital", "mechanical", "both"}:
        raise HTTPException(status_code=400, detail="meter_type must be digital, mechanical, or both")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WebP image")

    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded image is empty")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Image exceeds {MAX_UPLOAD_BYTES} bytes")

    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="The uploaded file is not a readable image")
    height, width = image.shape[:2]
    if width < 100 or height < 60:
        raise HTTPException(status_code=400, detail="Image resolution is too small for reliable recognition")
    if ocr_engine is None:
        raise HTTPException(status_code=503, detail="OCR model is still loading")

    try:
        result = ocr_engine.ocr(image, cls=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {type(exc).__name__}") from exc

    lines: list[dict[str, Any]] = []
    for page in result or []:
        for entry in page or []:
            if entry and len(entry) >= 2:
                text_value, confidence = entry[1]
                lines.append({"text": str(text_value), "confidence": float(confidence)})

    candidates = extract_candidates(lines)
    best = candidates[0] if candidates else None
    return {
        "success": True,
        "meterType": meter_type,
        "image": {"width": width, "height": height, "bytes": len(raw)},
        "recognizedText": lines,
        "mileageCandidates": candidates,
        "suggestedMileage": best["value"] if best else None,
        "ocrConfidence": best["ocrConfidence"] if best else None,
        "requiresDriverConfirmation": True,
        "recognitionStatus": "candidate_found" if best else "manual_entry_required",
    }
