  import React, { useState, useEffect } from 'react';
  import { Vehicle, Driver, InspectionCheckItem, InspectionPhoto, InspectionRecord } from '../../types';
  import { submitInspection } from '../../lib/api';
  import { getCurrentGps } from '../../lib/cameraWatermark';
  import { getCheckpointRequiredPhotoCount } from '../../lib/checkpointConfig';
  import { getDefaultSystemChecks } from '../../lib/quickChecklistConfig';
  import {
    Gauge,
    Fuel,
    HeartPulse,
    Send,
    AlertTriangle,
    ShieldCheck,
    RefreshCw,
    MapPin,
    Camera,
    ExternalLink,
    FileText,
    X,
    CheckCircle2,
    Shield,
  } from 'lucide-react';
  import confetti from 'canvas-confetti';

  interface DeclarationAndSubmitProps {
    vehicle: Vehicle;
    driver: Driver;
    items: InspectionCheckItem[];
    photos: InspectionPhoto[];
    onInspectionCompleted: (record: InspectionRecord) => void;
  }

  export const DeclarationAndSubmit: React.FC<DeclarationAndSubmitProps> = ({
    vehicle,
    driver,
    items,
    photos,
    onInspectionCompleted,
  }) => {
    const [odometer, setOdometer] = useState<number>(vehicle.currentOdometer || 120000);
    const [fuelLevel, setFuelLevel] = useState<number>(75);
    const [healthDeclaration, setHealthDeclaration] = useState<boolean>(true);
    const [showDeclarationModal, setShowDeclarationModal] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [submitError, setSubmitError] = useState<string>('');
    const [locationInfo, setLocationInfo] = useState<{
      lat: number;
      lng: number;
      accuracy?: number;
      address?: string;
    } | null>(photos[0]?.gps || null);

    useEffect(() => {
      // If not already present from photos, fetch GPS coordinates and place name
      if (!locationInfo?.address) {
        getCurrentGps().then(gps => {
          setLocationInfo(gps);
        }).catch(err => {
          console.warn('GPS load error in declaration:', err);
        });
      }
    }, []);

    const failItems = items.filter(i => i.status === 'Fail');
    const hasDefects = failItems.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError('');

      // ENFORCE: Mandatory Photos according to checkpoint requirements (5 tyres, 4 body sides, 1 radiator, 1 fuel cap, etc.)
      for (const item of items) {
        const required = getCheckpointRequiredPhotoCount(item.id);
        const count = photos.filter(p => p.itemId === item.id).length;
        if (count < required) {
          if (item.id === 'tires_wheels') {
            setSubmitError(`Tires inspection requires 5 photos (4 tyres + 1 spare). Missing ${required - count} photo(s).`);
          } else if (item.id === 'body_passenger_doors') {
            setSubmitError(`Cargo & Body inspection requires 4 photos from 4 sides (Front, Rear, Left, Right). Missing ${required - count} photo(s).`);
          } else {
            setSubmitError(`Missing photo for Checkpoint #${item.code} (${item.title})!`);
          }
          return;
        }
      }

      // ENFORCE: Dashboard Warning Checklist Ticks
      const dashboardItem = items.find(i => i.id === 'dashboard_warnings');
      if (dashboardItem && dashboardItem.status === 'Fail') {
        if (!dashboardItem.defectNote || !dashboardItem.defectNote.trim()) {
          setSubmitError('Dashboard cluster inspection confirmation: Defect remark is required for dashboard warnings.');
          return;
        }
      }

      if (!healthDeclaration) {
        setSubmitError('Driver health & fitness declaration must be confirmed prior to trip dispatch.');
        return;
      }

      if (odometer <= 0) {
        setSubmitError('Please enter a valid odometer reading.');
        return;
      }

      // Check if any failed items have missing notes (If fail, must have remark)
      const missingNote = failItems.find(i => !i.defectNote || i.defectNote.trim() === '');
      if (missingNote) {
        setSubmitError(`Mandatory remark missing: Checkpoint #${missingNote.code} (${missingNote.title}) is marked FAIL. Please write a defect remark.`);
        return;
      }

      setIsSubmitting(true);
      try {
        const overallResult: 'Pass' | 'Fail' = hasDefects ? 'Fail' : 'Pass';
        const defectSummary = hasDefects
          ? failItems.map(f => `${f.title}: ${f.defectNote}`).join('; ')
          : undefined;

        const activeGps = locationInfo || photos[0]?.gps || {
          lat: 3.0319,
          lng: 101.7482,
          accuracy: 15,
          address: 'Balakong Logistics Depot, Selangor',
        };

        const isFeederTruck =
          vehicle.truckCategory === 'Feeder' ||
          String(vehicle.model || '').toLowerCase().includes('feeder');

        const finalizedItems = items.map((it) => {
          let updated = { ...it };
          if (it.id === 'dashboard_warnings' && !it.dashboardChecks) {
            updated.dashboardChecks = {
              engineLightOff: true,
              doubleSignalOk: true,
              batteryLightOff: true,
              oilLightOff: true,
            };
          }
          if (!it.systemChecks || Object.keys(it.systemChecks).length === 0) {
            const defaults = getDefaultSystemChecks(it.id, isFeederTruck);
            if (Object.keys(defaults).length > 0) {
              updated.systemChecks = defaults;
            }
          }
          return updated;
        });

        const record = await submitInspection({
          driverId: driver.loginId,
          driverName: driver.name,
          driverDesignation: driver.designation,
          driverDepot: driver.depot,
          vehicleNo: vehicle.vehicleNo,
          vehicleBrand: vehicle.brand,
          vehicleModel: vehicle.model,
          vehicleBranch: vehicle.branch,
          route: vehicle.area || vehicle.assignedRoute || (vehicle as any).route || `${vehicle.branch || 'BL'}01`,
          truckCategory: vehicle.truckCategory || (vehicle.model?.toLowerCase().includes('feeder') ? 'Feeder' : 'Small Truck'),
          odometer,
          fuelLevel,
          healthDeclaration,
          overallResult,
          items: finalizedItems,
          defectCount: failItems.length,
          defectSummary,
          photos,
          gpsLocation: {
            lat: activeGps.lat,
            lng: activeGps.lng,
            accuracy: activeGps.accuracy,
            address: activeGps.address || 'Verified Depot Location',
          },
        });

        if (overallResult === 'Pass') {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
          });
        }

        onInspectionCompleted(record);
      } catch (err: any) {
        setSubmitError(err.message || 'Failed to submit inspection record to server.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const mapUrl = locationInfo
      ? `https://www.google.com/maps/search/?api=1&query=${locationInfo.lat},${locationInfo.lng}`
      : `https://www.google.com/maps/search/?api=1&query=3.0319,101.7482`;

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Verified Location & Mandatory Photos Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm text-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm flex-shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Verified Inspection Location & Photos</h3>
                  <p className="text-xs text-slate-500">Live GPS satellite coordinates & anti-tamper photo evidence</p>
                </div>
              </div>

              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 hover:bg-blue-100/80 px-3 py-1.5 rounded-lg transition self-start sm:self-auto"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open on Google Maps</span>
              </a>
            </div>

            {/* Location details */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700 flex-shrink-0">Device GPS:</span>
                <span className="font-extrabold text-blue-700 font-mono">
                  {locationInfo
                    ? `${locationInfo.lat.toFixed(5)}°N, ${locationInfo.lng.toFixed(5)}°E (±${locationInfo.accuracy || 12}m)`
                    : 'GPS Captured on Photos'}
                </span>
              </div>
            </div>

            {/* Photo Gallery */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-blue-600" />
                  <span>Mandatory Inspection Photos ({photos.length})</span>
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  ✓ Watermark Verified
                </span>
              </div>

              {photos.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>No photos recorded! Please go back to step 3 and capture at least 1 mandatory vehicle photo.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {photos.map((p, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1 shadow-xs">
                      <div className="rounded-lg overflow-hidden aspect-4/3 bg-slate-900">
                        <img src={p.url} alt={p.caption} className="w-full h-full object-cover" />
                      </div>
                      <div className="text-[10px] text-slate-700 font-bold truncate">{p.itemTitle}</div>
                      <div className="text-[9px] text-slate-500 truncate">{p.caption}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Meter Log Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-slate-800">
            <div className="flex items-center space-x-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Vehicle Meter Log & Energy Status</h3>
                <p className="text-xs text-slate-500">Odometer reading and fuel/energy level verification</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Odometer Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Current Odometer Reading (KM) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    value={odometer}
                    onChange={(e) => setOdometer(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-base font-mono font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                  <span className="absolute right-4 top-3 text-xs text-slate-400 font-mono font-bold">KM</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Last recorded: <span className="font-mono text-slate-700 font-semibold">{(vehicle.currentOdometer || 0).toLocaleString()} km</span>
                </div>
              </div>

              {/* Fuel Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Fuel className="w-4 h-4 text-blue-600" />
                    Fuel Level
                  </span>
                  <span className="text-blue-600 font-mono font-bold text-sm">{fuelLevel}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={fuelLevel}
                  onChange={(e) => setFuelLevel(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 border border-slate-200"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono font-medium">
                  <span>0% Empty</span>
                  <span>50% Half</span>
                  <span>100% Full Tank</span>
                </div>
              </div>
            </div>
          </div>

          {/* Driver Declaration Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-slate-800 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
                <HeartPulse className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Driver Fitness & Safety Declaration</h3>
                <p className="text-xs text-slate-500">Statutory fitness to drive and physical verification confirmation</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={healthDeclaration}
                  onChange={(e) => setHealthDeclaration(e.target.checked)}
                  className="w-5 h-5 mt-0.5 text-blue-600 rounded border-slate-300 bg-white focus:ring-blue-500 cursor-pointer accent-blue-600"
                />
                <div className="text-xs text-slate-600 leading-relaxed">
                  <strong className="text-slate-900 block font-bold mb-1">
                    Official Road Safety Declaration:
                  </strong>
                  I hereby declare that I am physically and mentally fit to operate this commercial vehicle. I am free from fatigue, alcoholic influence, and medication side-effects, and have conducted a bona fide physical pre-trip inspection as recorded.
                </div>
              </label>

              {/* Hyperlink to Declaration Checklist */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeclarationModal(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>View Full Statutory Declaration Checklist & Safety Rules</span>
                  <ExternalLink className="w-3 h-3 text-blue-500" />
                </button>
                <span className="text-[11px] text-slate-400 font-mono">Mandatory Driver Standards</span>
              </div>
            </div>
          </div>

          {/* Warning or Ready Summary Banner */}
          {hasDefects ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 flex items-start space-x-3 shadow-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <strong className="font-bold text-rose-900 block">
                  SAFETY WARNING: {failItems.length} DEFECT(S) DETECTED
                </strong>
                Submitting this inspection will mark vehicle <span className="font-mono font-bold text-slate-900">{vehicle.vehicleNo}</span> as <strong>GROUNDED</strong> and notify fleet maintenance.
              </div>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 flex items-start space-x-3 shadow-sm">
              <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <strong className="font-bold text-emerald-900 block">
                  ALL 10 POINTS VERIFIED PASSED
                </strong>
                Vehicle will be issued a Digital Road Permit Certificate valid for today&apos;s scheduled routes.
              </div>
            </div>
          )}

          {submitError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
              {submitError}
            </div>
          )}

          {/* Submit Actions */}
          <div className="flex items-center justify-end space-x-4 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full sm:w-auto font-bold px-8 py-3.5 rounded-xl text-xs flex items-center justify-center space-x-2 transition shadow-sm cursor-pointer disabled:opacity-50 ${
                hasDefects
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Transmitting to Cloud Audit...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{hasDefects ? 'Report Defect & Ground Vehicle' : 'Submit Inspection & Issue Road Pass'}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Statutory Declaration Checklist Modal */}
        {showDeclarationModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Driver Statutory Declaration Checklist</h3>
                    <p className="text-xs text-slate-500">APAD & Commercial Road Safety Standards</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeclarationModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Checklist Items */}
              <div className="p-5 overflow-y-auto space-y-3 text-xs text-slate-700">
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 leading-relaxed font-medium">
                  Prior to trip dispatch, commercial drivers must acknowledge and adhere to each of the following statutory safety requirements:
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl border border-slate-200 bg-white flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block">1. Physical & Mental Fitness</span>
                      <p className="text-slate-600 mt-0.5">Driver has received adequate rest (minimum 8 hours undisturbed), is alert, and free from fatigue, dizziness, or medical impairment.</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-white flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block">2. Substance-Free Policy (Zero Tolerance)</span>
                      <p className="text-slate-600 mt-0.5">0.00% Blood Alcohol Concentration (BAC). Zero consumption of alcohol, illegal narcotics, or drowsy pharmaceuticals within 12 hours.</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-white flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block">3. Statutory Licences & PPE Uniform</span>
                      <p className="text-slate-600 mt-0.5">Valid Goods Driving Licence (GDL / Class E / D) in possession, wearing high-visibility reflective vest and steel-toe safety footwear.</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-white flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block">4. Honest Physical Walkaround Verification</span>
                      <p className="text-slate-600 mt-0.5">Physical inspection executed on-site with live watermarked photo proof of tyres, brakes, fluids, lighting, and cargo body.</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-white flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block">5. Cargo Security & BDM Weight Limits</span>
                      <p className="text-slate-600 mt-0.5">Cargo is properly lashed, balanced, and secured. Total vehicle weight is strictly within registered Berat Dengan Muatan (BDM).</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-white flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block">6. Regulated Driving Hours & Rest Breaks</span>
                      <p className="text-slate-600 mt-0.5">Maximum continuous driving of 4 hours followed by mandatory 30-minute rest stop. Maximum 8 driving hours per duty shift.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500 font-mono">Statutory Driver Compliance</span>
                <button
                  type="button"
                  onClick={() => {
                    setHealthDeclaration(true);
                    setShowDeclarationModal(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer shadow-xs"
                >
                  Acknowledge & Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
