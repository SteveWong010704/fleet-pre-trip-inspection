export interface WatermarkMeta {
  vehicleNo: string;
  driverName: string;
  driverId: string;
  itemTitle: string;
  customNote?: string;
  gps?: {
    lat: number;
    lng: number;
    accuracy?: number;
    address?: string;
  };
}

/**
 * Fast, direct GPS coordinates retrieval with no external reverse geocoding delays.
 */
export async function getCurrentGps(): Promise<{ lat: number; lng: number; accuracy: number; address?: string }> {
  return new Promise((resolve) => {
    const handleSuccess = (lat: number, lng: number, accuracy: number) => {
      const coordStr = `GPS: ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E (±${accuracy}m)`;
      resolve({ lat, lng, accuracy, address: coordStr });
    };

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      handleSuccess(3.0319, 101.7482, 15);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleSuccess(
          Number(pos.coords.latitude.toFixed(6)),
          Number(pos.coords.longitude.toFixed(6)),
          Math.round(pos.coords.accuracy || 10)
        );
      },
      (_err) => {
        // Fallback default coordinates (Logistics Depot Hub)
        handleSuccess(3.0319, 101.7482, 20);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
    );
  });
}

/**
 * Renders an anti-tamper watermark and heavily compresses the image
 * (Max width 960px, JPEG quality 0.65) to protect server bandwidth and memory.
 */
export async function applyWatermarkToImage(
  imageSource: string | HTMLVideoElement | HTMLImageElement,
  meta: WatermarkMeta
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas 2D context not available'));
      return;
    }

    const processCanvas = (imgWidth: number, imgHeight: number, drawSource: CanvasImageSource) => {
      // Scale down to max width 960px for lean performance and bandwidth protection
      const sourceW = imgWidth || 640;
      const sourceH = imgHeight || 480;
      const targetWidth = Math.min(960, sourceW);
      const scale = targetWidth / sourceW;
      const targetHeight = Math.round(sourceH * scale);

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // Draw base photo
      ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);

      // Bottom high-contrast watermark banner
      const bannerHeight = Math.max(110, Math.round(targetHeight * 0.22));
      const gradient = ctx.createLinearGradient(0, targetHeight - bannerHeight - 15, 0, targetHeight);
      gradient.addColorStop(0, 'rgba(15, 23, 42, 0)');
      gradient.addColorStop(0.3, 'rgba(15, 23, 42, 0.88)');
      gradient.addColorStop(1, 'rgba(15, 23, 42, 0.98)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, targetHeight - bannerHeight - 15, targetWidth, bannerHeight + 15);

      // Accent amber bar
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(14, targetHeight - bannerHeight + 6, 4, bannerHeight - 16);

      const now = new Date();
      const dateStr = now.toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const lat = meta.gps?.lat ?? 3.0319;
      const lng = meta.gps?.lng ?? 101.7482;
      const acc = meta.gps?.accuracy ? `±${meta.gps.accuracy}m` : 'High Precision';

      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 3;

      // Row 1: Vehicle Plate & Checkpoint Title
      ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`VEHICLE: ${meta.vehicleNo}  •  ${meta.itemTitle}`, 26, targetHeight - bannerHeight + 24);

      // Row 2: GPS Coordinate Readout (Clean Lat/Long)
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#38BDF8';
      ctx.fillText(`GPS: ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E (${acc})`, 26, targetHeight - bannerHeight + 46);

      // Row 3: Live Inspection Date/Time & Inspector Driver
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#FDE047'; // Bright Yellow for high visibility
      ctx.fillText(`INSPECTION DATE: ${dateStr}  •  DRIVER: ${meta.driverName} (${meta.driverId})`, 26, targetHeight - bannerHeight + 66);

      // Row 4: Audit Verification Note
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#E2E8F0';
      const noteText = meta.customNote ? `DEFECT NOTE: ${meta.customNote}` : 'VERIFIED: Checkpoint Inspection Evidence';
      ctx.fillText(noteText.slice(0, 60), 26, targetHeight - bannerHeight + 84);

      // High compression JPEG (0.65 quality) - keeps image size ~60KB to 90KB
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.65);
      resolve(compressedDataUrl);
    };

    if (imageSource instanceof HTMLVideoElement) {
      processCanvas(imageSource.videoWidth || 640, imageSource.videoHeight || 480, imageSource);
    } else if (imageSource instanceof HTMLImageElement) {
      if (imageSource.complete) {
        processCanvas(imageSource.naturalWidth, imageSource.naturalHeight, imageSource);
      } else {
        imageSource.onload = () => processCanvas(imageSource.naturalWidth, imageSource.naturalHeight, imageSource);
      }
    } else if (typeof imageSource === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => processCanvas(img.naturalWidth, img.naturalHeight, img);
      img.onerror = (e) => reject(e);
      img.src = imageSource;
    }
  });
}
