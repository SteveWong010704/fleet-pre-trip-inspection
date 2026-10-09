  import React, { useState, useEffect, useRef } from 'react';
  import { Vehicle, Driver, InspectionRecord } from '../../types';
  import { fetchVehicles, fetchVehicleByPlate, checkVehicleDailyInspection } from '../../lib/api';
  import { QrCode, Camera, Search, Truck, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, X, Shield, Fuel, ShieldAlert, ShieldCheck } from 'lucide-react';
  import jsQR from 'jsqr';

  interface VehicleScannerProps {
    activeDriver: Driver;
    onVehicleSelected: (vehicle: Vehicle) => void;
    selectedVehicle: Vehicle | null;
    onViewCertificate?: (record: InspectionRecord) => void;
  }

  export const VehicleScanner: React.FC<VehicleScannerProps> = ({
    activeDriver,
    onVehicleSelected,
    selectedVehicle,
    onViewCertificate,
  }) => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [search, setSearch] = useState<string>('');
    const [depotFilter, setDepotFilter] = useState<string>(activeDriver.depot || 'ALL');
    const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
    const [cameraError, setCameraError] = useState<string>('');
    const [isScanning, setIsScanning] = useState<boolean>(false);
    const [blockedInspection, setBlockedInspection] = useState<{ vehicle: Vehicle; inspection: InspectionRecord } | null>(null);
    const [checkingPlate, setCheckingPlate] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
      loadVehicles();
      return () => {
        stopCamera();
      };
    }, []);

    const loadVehicles = async () => {
      setLoading(true);
      try {
        const list = await fetchVehicles();
        setVehicles(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const startCamera = async () => {
      setIsCameraActive(true);
      setCameraError('');
      setIsScanning(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.play();
          requestAnimationFrame(tickScan);
        }
      } catch (err: any) {
        console.warn('Camera access issue:', err);
        setCameraError('Camera access unavailable. Please choose your vehicle plate from the fleet roster below.');
        setIsScanning(false);
      }
    };

    const stopCamera = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setIsCameraActive(false);
      setIsScanning(false);
    };

    const tickScan = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data) {
            handleScannedData(code.data);
            return;
          }
        }
      }
      animationFrameRef.current = requestAnimationFrame(tickScan);
    };

    const handleScannedData = async (data: string) => {
      let plate = '';
      let token = '';

      try {
        if (data.includes('?plate=') || data.includes('&plate=')) {
          const url = new URL(data, window.location.origin);
          plate = url.searchParams.get('plate') || '';
          token = (url.searchParams.get('token') || url.searchParams.get('qrToken') || url.searchParams.get('t') || '').trim().toUpperCase();
        } else if (data.startsWith('{')) {
          const parsed = JSON.parse(data);
          plate = parsed.plate || parsed.vehicleNo || '';
          token = (parsed.token || parsed.qrToken || parsed.t || '').trim().toUpperCase();
        } else {
          plate = data.trim();
        }
      } catch {
        plate = data.trim();
      }

      if (plate) {
        const cleanPlate = plate.replace(/\s+/g, '').toUpperCase();
        
        // Secure validation: fetch vehicle with scanned token
        const verifiedResult = await fetchVehicleByPlate(cleanPlate, token);

        if (!verifiedResult) {
          setCameraError(`Vehicle ${cleanPlate} not recognized in fleet records.`);
          return;
        }

        // If the vehicle has an active security token, verify token validity
        if (token && !verifiedResult.qrVerified) {
          setCameraError(`QR verification failed for ${cleanPlate}. Please scan the physical QR code on the vehicle.`);
          return;
        }

        stopCamera();
        await handleSelectWithInspectionCheck(verifiedResult);
      }
    };

    const handleSelectWithInspectionCheck = async (v: Vehicle) => {
      setCheckingPlate(v.vehicleNo);
      try {
        const vCheck = await checkVehicleDailyInspection(v.vehicleNo);
        if (vCheck.hasInspectedToday && vCheck.inspection) {
          setBlockedInspection({ vehicle: v, inspection: vCheck.inspection });
          return;
        }
        onVehicleSelected(v);
      } catch {
        onVehicleSelected(v);
      } finally {
        setCheckingPlate(null);
      }
    };

    // Filter vehicles
    const depots = Array.from(new Set(vehicles.map(v => v.branch))).filter(Boolean).sort();
    const filteredVehicles = vehicles.filter(v => {
      const matchDepot = depotFilter === 'ALL' || v.branch.toUpperCase() === depotFilter.toUpperCase();
      const matchSearch = !search || (
        v.vehicleNo.toLowerCase().includes(search.toLowerCase()) ||
        v.brand.toLowerCase().includes(search.toLowerCase()) ||
        v.model.toLowerCase().includes(search.toLowerCase()) ||
        (v.area && v.area.toLowerCase().includes(search.toLowerCase()))
      );
      return matchDepot && matchSearch;
    });

    return (
      <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 overflow-hidden px-1 sm:px-0">
        {/* Header Banner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm text-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm flex-shrink-0">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                  Step 1: Vehicle Assignment
                </span>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  Scan QR Code or Select Vehicle Plate
                </h2>
                <p className="text-xs text-slate-500">
                  Driver: <strong className="text-slate-800">{activeDriver.name}</strong> ({activeDriver.employeeId} • Depot {activeDriver.depot})
                </p>
              </div>
            </div>

            <button
              onClick={isCameraActive ? stopCamera : startCamera}
              className={`font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-sm transition cursor-pointer self-start sm:self-auto w-full sm:w-auto ${
                isCameraActive
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>{isCameraActive ? 'Close QR Scanner' : 'Scan Vehicle QR'}</span>
            </button>
          </div>
        </div>

        {/* Live Camera Scanner Box */}
        {isCameraActive && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 text-white text-center space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-blue-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                <span>Point Camera at Vehicle Windshield QR Label</span>
              </div>
              <button onClick={stopCamera} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative max-w-sm mx-auto aspect-square rounded-2xl overflow-hidden bg-black border-2 border-dashed border-blue-500/50 flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                className="w-full h-full object-cover"
              />
              {/* Viewfinder Target Frame */}
              <div className="absolute inset-8 border-2 border-blue-400 rounded-2xl pointer-events-none shadow-2xl animate-pulse flex items-center justify-center">
                <div className="w-full h-0.5 bg-blue-400/80 absolute top-1/2 -translate-y-1/2 animate-bounce"></div>
              </div>
            </div>

            {cameraError && (
              <p className="text-xs text-rose-400 font-semibold">{cameraError}</p>
            )}

            <p className="text-xs text-slate-400">
              Scanning QR code automatically binds vehicle specifications.
            </p>
          </div>
        )}

        {/* Manual Search & Depot Roster */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 text-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search plate (e.g. VFH2715, WVA, HINO)..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
              />
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-500 uppercase text-[10px]">Depot:</span>
              <select
                value={depotFilter}
                onChange={(e) => setDepotFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">All Depots</option>
                {depots.map(d => (
                  <option key={d} value={d}>Depot {d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Responsive Vehicle List / Cards */}
          {loading ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
              <div className="text-xs">Loading depot fleet list...</div>
            </div>
          ) : vehicles.length === 0 ? (
            <div className="py-12 px-4 text-center max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
                <Truck className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-slate-800">Fleet Roster is Empty (Zero Presets)</div>
              <p className="text-xs text-slate-500 leading-relaxed">
                No vehicles have been registered in the system yet. Please contact fleet dispatch.
              </p>
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
              No vehicles found matching "{search}".
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredVehicles.map((v) => (
                <div
                  key={v.vehicleNo}
                  onClick={() => handleSelectWithInspectionCheck(v)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer text-left space-y-2.5 relative group hover:border-blue-500 hover:shadow-md ${
                    selectedVehicle?.vehicleNo === v.vehicleNo
                      ? 'bg-blue-50/50 border-blue-500 ring-2 ring-blue-500/20'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-mono font-black text-sm text-slate-900 tracking-tight">
                          {v.vehicleNo}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          Depot {v.branch} • {v.area || 'General'}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        v.currentStatus === 'Ready'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : v.currentStatus === 'Grounded'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {v.currentStatus}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <div>Make: <strong className="text-slate-800">{v.brand}</strong></div>
                    <div>Type: <strong className="text-slate-800">{(v.truckCategory === 'Feeder' || String(v.model || '').toLowerCase().includes('feeder')) ? 'Feeder' : 'Small Truck'}</strong></div>
                    <div className="col-span-2 truncate">Card: {v.cardNo?.slice(-6) || 'N/A'} • PIN {v.pinNo || '****'}</div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-blue-600 font-bold pt-1">
                    {checkingPlate === v.vehicleNo ? (
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Checking Status...</span>
                      </span>
                    ) : (
                      <>
                        <span>Start Inspection</span>
                        <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Blocked Daily Inspection Modal */}
        {blockedInspection && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
                <ShieldAlert className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 font-mono">
                  Daily Inspection Limit Enforced
                </span>
                <h3 className="text-lg font-black text-slate-900 font-mono">
                  {blockedInspection.vehicle.vehicleNo}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  This truck has <strong>already completed its daily pre-trip inspection today</strong>.
                  Each commercial vehicle is restricted to <strong>1 inspection per day</strong> across all drivers.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Inspected By:</span>
                  <strong className="text-slate-900">{blockedInspection.inspection.driverName} ({blockedInspection.inspection.driverId})</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Inspection Pass ID:</span>
                  <strong className="text-blue-600">{blockedInspection.inspection.id}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Overall Status:</span>
                  <span className={`font-bold ${blockedInspection.inspection.overallResult === 'Pass' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {blockedInspection.inspection.overallResult}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Timestamp:</span>
                  <span className="text-slate-700">{new Date(blockedInspection.inspection.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                {onViewCertificate && (
                  <button
                    type="button"
                    onClick={() => {
                      const record = blockedInspection.inspection;
                      setBlockedInspection(null);
                      onViewCertificate(record);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center space-x-2 transition cursor-pointer shadow-sm"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>View Today's Inspection Certificate</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setBlockedInspection(null)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
                >
                  Select Another Vehicle
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
