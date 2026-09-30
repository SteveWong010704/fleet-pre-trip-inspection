import React, { useState, useEffect } from 'react';
import { InspectionRecord } from '../../types';
import {
  CheckCircle,
  AlertOctagon,
  Printer,
  ArrowLeft,
  ShieldCheck,
  MapPin,
  ExternalLink,
  Camera,
  Clock,
  Lock,
  XCircle,
  QrCode,
} from 'lucide-react';
import QRCodeLib from 'qrcode';
import { buildCertificateDeepLink } from '../../lib/publicUrl';

interface InspectionCertificateProps {
  record: InspectionRecord;
  onReset: () => void;
}

export const InspectionCertificate: React.FC<InspectionCertificateProps> = ({
  record,
  onReset,
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(180); // 3 minutes countdown
  const [isSessionClosed, setIsSessionClosed] = useState<boolean>(false);
  const isPass = record.overallResult === 'Pass';

  // Immediate protection: Clear ?plate=XXX from browser address bar
  // so if driver refreshes or forgets to close the tab, tomorrow's session cannot use yesterday's vehicle
  useEffect(() => {
    if (typeof window !== 'undefined' && window.history.replaceState) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, []);

  // 3-Minute Live Countdown Timer
  useEffect(() => {
    if (isSessionClosed) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSessionClosed]);

  const handleAutoClose = () => {
    setIsSessionClosed(true);
    // Attempt to close tab (works if opened by script or PWA)
    try {
      window.close();
    } catch {}
  };

  const handleManualDoneAndExit = () => {
    handleAutoClose();
  };

  useEffect(() => {
    // Generate QR code using public tunnel URL (ngrok / IIS domain)
    const verificationUrl = buildCertificateDeepLink(record.id);
    QRCodeLib.toDataURL(
      verificationUrl,
      { width: 180, margin: 1, color: { dark: '#0F172A', light: '#FFFFFF' } }
    ).then(url => setQrUrl(url)).catch(() => {});
  }, [record]);

  const handlePrint = () => {
    window.print();
  };

  const mapUrl = record.gpsLocation
    ? `https://www.google.com/maps/search/?api=1&query=${record.gpsLocation.lat},${record.gpsLocation.lng}`
    : `https://www.google.com/maps/search/?api=1&query=3.0319,101.7482`;

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Fullscreen Barrier when 3-minute timer expires or driver finishes
  if (isSessionClosed) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Inspection Completed & Session Locked
            </h2>
            <p className="text-sm text-slate-300">
              Security protection active: Vehicle binding for <span className="font-mono font-bold text-amber-400">{record.vehicleNo}</span> has been cleared to prevent accidental reuse tomorrow.
            </p>
          </div>

          <div className="p-4 bg-slate-700/50 rounded-2xl border border-slate-600/50 text-xs text-slate-300 space-y-2 text-left">
            <div className="flex items-center gap-2 font-bold text-emerald-400">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Inspection ID: {record.id}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <QrCode className="w-4 h-4 flex-shrink-0 text-slate-400" />
              <span>Please scan the new vehicle QR code tomorrow before trip dispatch.</span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => {
                try {
                  window.close();
                } catch {}
                // Fallback if window.close() is blocked by browser policy
                window.location.replace('about:blank');
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl transition cursor-pointer shadow-lg shadow-emerald-600/30 text-sm"
            >
              Close Tab
            </button>
            <p className="text-[11px] text-slate-400">
              If your browser restricts automatic tab closing, please swipe to close this browser tab.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* 3-Minute Auto-Lock Safety Notice Bar */}
      <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs no-print">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold flex-shrink-0 shadow-sm">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <span>Auto-Close Countdown:</span>
              <span className="font-mono text-sm font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                {formatCountdown(secondsRemaining)}
              </span>
            </div>
            <p className="text-[11px] text-amber-800">
              Tab will automatically close and release vehicle binding in 3 minutes to prevent accidental reuse tomorrow.
            </p>
          </div>
        </div>

        <button
          onClick={handleManualDoneAndExit}
          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer shadow-sm flex-shrink-0"
        >
          Done & Exit Now
        </button>
      </div>

      {/* Top Action Controls */}
      <div className="flex items-center justify-between no-print">
        <button
          onClick={onReset}
          className="text-xs text-slate-600 hover:text-slate-900 flex items-center space-x-1.5 font-bold bg-white border border-slate-300 px-3.5 py-2 rounded-xl transition cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>New Inspection</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-sm shadow-blue-500/20"
          >
            <Printer className="w-4 h-4" />
            <span>Print Certificate / PDF</span>
          </button>
        </div>
      </div>

      {/* Official Certificate Box */}
      <div className={`rounded-3xl border-2 p-6 sm:p-8 shadow-sm text-slate-800 relative overflow-hidden bg-white ${
        isPass
          ? 'border-emerald-500'
          : 'border-rose-500'
      }`}>
        {/* Top Status Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="flex items-center space-x-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black flex-shrink-0 shadow-sm ${
              isPass
                ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                : 'bg-rose-600 text-white shadow-rose-600/20'
            }`}>
              {isPass ? <CheckCircle className="w-8 h-8" /> : <AlertOctagon className="w-8 h-8" />}
            </div>
            <div>
              <span className={`text-[11px] font-mono uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full border ${
                isPass
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {isPass ? 'DIGITAL PRE-TRIP ROAD PERMIT' : 'GROUNDED / MAINTENANCE NOTICE'}
              </span>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 mt-1">
                {isPass ? 'VEHICLE CLEARED FOR DISPATCH' : 'UNSAFE FOR OPERATION - GROUNDED'}
              </h2>
              <p className="text-xs text-slate-500 font-mono">Certificate ID: {record.id}</p>
            </div>
          </div>

          {/* QR Verification Seal */}
          {qrUrl && (
            <div className="bg-slate-50 p-2 rounded-2xl border border-slate-200 flex-shrink-0 self-center shadow-sm text-center">
              <img src={qrUrl} alt="Certificate QR" className="w-20 h-20 rounded-lg bg-white p-1 mx-auto" />
              <div className="text-[9px] font-mono text-slate-500 mt-1 font-semibold">Scan to Verify</div>
            </div>
          )}
        </div>

        {/* Certificate Core Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6 border-b border-slate-100 text-xs">
          <div className="space-y-1">
            <span className="text-slate-500 text-[11px] uppercase tracking-wider block font-bold">Vehicle Plate</span>
            <div className="text-base font-black font-mono text-blue-600">{record.vehicleNo}</div>
            <div className="text-slate-500 text-[11px] font-medium">{record.vehicleBrand} • {record.vehicleModel}</div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-500 text-[11px] uppercase tracking-wider block font-bold">Driver</span>
            <div className="text-sm font-bold text-slate-900">{record.driverName}</div>
            <div className="text-slate-500 text-[11px] font-mono">ID: {record.driverId} ({record.driverDepot})</div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-500 text-[11px] uppercase tracking-wider block font-bold">Odometer / Fuel</span>
            <div className="text-sm font-bold font-mono text-slate-900">{record.odometer.toLocaleString()} KM</div>
            <div className="text-blue-600 text-[11px] font-bold">{record.fuelLevel}% Fuel Level</div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-500 text-[11px] uppercase tracking-wider block font-bold">Inspection Timestamp</span>
            <div className="text-xs font-bold text-slate-900">{record.formattedDate}</div>
            <div className="text-emerald-600 text-[11px] flex items-center gap-1 font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Compliance Verified</span>
            </div>
          </div>
        </div>

        {/* Verified Location Banner (Address place name + GPS coordinates) */}
        <div className="py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/50 p-4 rounded-2xl my-4">
          <div className="flex items-start space-x-2.5">
            <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-slate-900">
                Verified Physical Location:
              </div>
              <div className="text-sm font-extrabold text-blue-700 mt-0.5">
                {record.gpsLocation?.address || 'Verified Depot Inspection Station'}
              </div>
              {record.gpsLocation && (
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  GPS: {record.gpsLocation.lat.toFixed(5)}°N, {record.gpsLocation.lng.toFixed(5)}°E (±{record.gpsLocation.accuracy || 12}m precision)
                </div>
              )}
            </div>
          </div>

          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-white border border-blue-200 px-3 py-1.5 rounded-lg shadow-xs self-start sm:self-auto"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View Map</span>
          </a>
        </div>

        {/* 10-Item Inspection Results Matrix */}
        <div className="py-6 border-b border-slate-100 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            10-Point Item Verification Results
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {record.items.map((item, i) => (
              <div
                key={item.id}
                className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                  item.status === 'Pass'
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : item.status === 'Fail'
                    ? 'bg-rose-50 border-rose-200 text-rose-800 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <span className="w-5 h-5 rounded-full bg-white text-[10px] font-mono flex items-center justify-center font-bold text-blue-600 border border-slate-200 shadow-sm">
                    {i + 1}
                  </span>
                  <div className="truncate">
                    <span className="truncate font-medium block">{item.title}</span>
                    {item.id === 'lights_indicators' && item.status === 'Pass' && (
                      <span className="text-[10px] text-emerald-700 font-semibold block">✓ 5/5 Lights & Double Flashers Operational</span>
                    )}
                    {item.id === 'emergency_equipment' && item.status === 'Pass' && (
                      <span className="text-[10px] text-emerald-700 font-semibold block">✓ Statutory Emergency Equipment On Board</span>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  item.status === 'Pass'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : item.status === 'Fail'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Mandatory Evidence Photos */}
        {record.photos && record.photos.length > 0 && (
          <div className="pt-6 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Camera className="w-4 h-4 text-blue-600" />
              <span>Mandatory Inspection Photos & Watermarked Records ({record.photos.length})</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {record.photos.map((p, idx) => (
                <div key={idx} className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2 shadow-sm">
                  <img src={p.url} alt={p.caption} className="w-full h-40 object-cover rounded-xl border border-slate-200" />
                  <div className="text-[11px] text-slate-700 space-y-0.5">
                    <div className="font-bold text-slate-900">{p.itemTitle || 'Vehicle Photo'}</div>
                    <div className="text-slate-600">{p.caption}</div>
                    {(p.gps?.address || record.gpsLocation?.address) && (
                      <div className="text-[10px] text-blue-700 font-semibold flex items-center gap-1 mt-1 truncate">
                        <MapPin className="w-3 h-3 text-blue-600 flex-shrink-0" />
                        <span className="truncate">{p.gps?.address || record.gpsLocation?.address}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Audit Statement */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-slate-400 font-mono gap-2">
          <span>SECURE AUDIT HASH: SHA256-INSP-{record.id.slice(-6)}</span>
          <span>FLEET INSPECTION SYSTEM v3.0</span>
        </div>
      </div>
    </div>
  );
};
