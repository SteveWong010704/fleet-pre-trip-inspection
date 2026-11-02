# FOMS Odometer OCR POC (v0.1)

This is an isolated, self-hosted OCR service. It does not change the production inspection submit flow or SQL Server schema.

## Scope

- Accept JPG, PNG, and WebP photos from a trusted backend.
- Run PaddleOCR locally on the WMS server.
- Return detected text and numeric mileage candidates.
- Require the driver/admin to confirm the reading.
- Support a meter type hint: digital, mechanical, or both.

Mechanical rolling-digit meters can be difficult for general OCR because digits may sit between positions. Treat the returned mileage as a suggestion, not a verified value.

## Windows setup

Use 64-bit Python 3.10 for this pinned POC environment.

```powershell
cd C:\path\to\fleet-pre-trip-inspection\ocr-poc
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

The first startup downloads the PaddleOCR English model files. Allow outbound internet access during initial model download, or pre-cache the model files before moving the service to a network-isolated server.

## Start locally

```powershell
$env:OCR_API_KEY = "replace-with-a-long-random-secret"
uvicorn main:app --host 127.0.0.1 --port 8010
```

Keep the service bound to 127.0.0.1. Do not expose port 8010 directly to the public internet. The existing Node.js backend should call it server-to-server and keep the API key on the server.

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/health
```

Recognition test:

```powershell
curl.exe -X POST "http://127.0.0.1:8010/api/odometer/recognize?meter_type=both" `
  -H "X-OCR-API-Key: replace-with-a-long-random-secret" `
  -F "file=@C:\temp\odometer-sample.jpg"
```

## Response behavior

The API returns recognized text lines, ranked numeric mileage candidates, the top suggested mileage (or null), and a mandatory driver confirmation flag. It does not write to SQL Server.

## POC acceptance test

Collect at least 50–100 representative photos, including:

- Digital odometers in daylight and low light.
- Mechanical rolling-digit odometers.
- Different dashboard angles and reflections.
- Photos where Trip A / Trip B appears beside total Odometer.

For each photo, record the true total odometer reading and compare it with the top candidate. Report exact-match accuracy separately for digital and mechanical meters. Do not enable automatic submission until measured accuracy and false-read rate are acceptable.

## Next integration stage

After testing real FOMS photos, add an authenticated Node.js endpoint that forwards the image to 127.0.0.1:8010, returns the candidate to the React form, and saves only the driver's confirmed mileage through the existing inspection submission API. Preserve the original photo URL and audit both the OCR suggestion and confirmed value.
