import React, { useState, useRef, useEffect } from 'react';
import { Vehicle, Driver, InspectionCheckItem, InspectionPhoto, CheckStatus } from '../../types';
import { getCurrentGps, applyWatermarkToImage } from '../../lib/cameraWatermark';
import { getCheckpointRequiredPhotoCount, getCheckpointSlots } from '../../lib/checkpointConfig';
import {
  LIGHTS_CHECKS,
  BRAKES_CHECKS,
  STEERING_CHECKS,
  FLUIDS_CHECKS,
  FEEDER_APAD_SAFETY_EQUIPMENT,
  SMALL_TRUCK_SAFETY_EQUIPMENT,
  getCheckpointSystemChecks,
  getDefaultSystemChecks,
} from '../../lib/quickChecklistConfig';
import {
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Trash2,
  X,
  ChevronRight,
  ChevronLeft,
  CheckSquare,
  Square,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  Check,
} from 'lucide-react';

interface Props {
  vehicle: Vehicle;
  driver: Driver;
  items: InspectionCheckItem[];
  onItemsChange?: (items: InspectionCheckItem[]) => void;
  onChange?: (items: InspectionCheckItem[]) => void;
  photos: InspectionPhoto[];
  onPhotosChange: (photos: InspectionPhoto[]) => void;
  onProceed?: () => void;
  onBackToScanner?: () => void;
  onInspectionCompleted?: (record: any) => void;
}

interface ActiveTarget {
  id: string;
  title: string;
  isDefect: boolean;
  code: number;
  slotIndex?: number;
  slotName?: string;
}

const COMMON_DEFECT_TAGS: Record<string, string[]> = {
  tires_wheels: ['Low Air Pressure / Flat', 'Tread Depth < 1.6mm', 'Sidewall Bulge / Cut', 'Wheel Lug Nut Loose', 'Spare Tyre Missing/Flat'],
  brake_system: ['Soft / Spongy Pedal', 'Air Pressure Slow to Build', 'Parking Brake Ineffective', 'Brake Noise / Grinding'],
  lights_indicators: ['Headlight Bulb Failed', 'Brake Light Inoperative', 'Turn Signal Not Blinking', 'Hazard Flashers Faulty', 'Reverse Lamp Inactive'],
  steering_handling: ['Excessive Steering Play', 'Front Vibration / Wobble', 'Power Steering Fluid Low', 'Stiff Steering Response'],
  radiator_coolant: ['Coolant Leak Below Radiator', 'Expansion Tank Below Min', 'Radiator Cap Missing/Damaged', 'Hose Swollen / Cracked'],
  dashboard_warnings: ['Check Engine Warning Lamp ON', 'Hazard / Double Signal Faulty', 'Alternator / Battery Lamp ON', 'Engine Oil Pressure Lamp ON'],
  emergency_equipment: ['Fire Extinguisher Expired', 'Extinguisher Gauge in RED', 'Reflective Triangle Missing', 'First Aid Kit Incomplete'],
  body_passenger_doors: ['Cargo Door Latch Broken', 'Body Panel Dented', 'Side Curtain / Panel Torn', 'Roller Shutter Sticking'],
  diesel_fuel_cap: ['Diesel Cap Missing', 'Tank Filler Cap Damaged', 'Diesel Leak Around Neck', 'Fuel Odor / Spill Detected'],
  fluids_powertrain: ['Engine Oil Dipstick Low', 'Brake Fluid Below Min', 'Battery Terminals Corroded', 'Transmission Fluid Leak'],
};

export const Checklist10Points: React.FC<Props> = ({
  vehicle,
  driver,
  items,
  onItemsChange,
  onChange,
  photos,
  onPhotosChange,
  onProceed,
  onBackToScanner,
}) => {
  // Current active card index: 0 to 9 (Card 1 to 10)
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);

  // Live GPS Coordinates
  const [gpsInfo, setGpsInfo] = useState<{ lat: number; lng: number; accuracy: number; address?: string } | null>(null);

  // Active photo capture target
  const [activeTarget, setActiveTarget] = useState<ActiveTarget | null>(null);
  const [activeNote, setActiveNote] = useState<string>('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  const [cardError, setCardError] = useState<string>('');

  // Camera stream state
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  const isFeeder =
    vehicle.truckCategory === 'Feeder' ||
    String(vehicle.model || '').toLowerCase().includes('feeder');

  // Acquire live device GPS on mount
  useEffect(() => {
    getCurrentGps()
      .then((gps) => {
        setGpsInfo(gps);
      })
      .catch(() => {
        setGpsInfo({ lat: 3.0319, lng: 101.7482, accuracy: 15, address: 'Balakong Logistics Depot, Selangor' });
      });
  }, []);

  // Cleanup camera stream when component unmounts
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Ensure dashboard and system checkpoints have default valid checks
  useEffect(() => {
    let hasChanges = false;
    const updated = items.map((it) => {
      let patch: Partial<InspectionCheckItem> | null = null;
      if (it.id === 'dashboard_warnings' && !it.dashboardChecks) {
        patch = {
          dashboardChecks: {
            engineLightOff: true,
            doubleSignalOk: true,
            batteryLightOff: true,
            oilLightOff: true,
          },
        };
      }
      const defaultChecks = getDefaultSystemChecks(it.id, isFeeder);
      if (Object.keys(defaultChecks).length > 0 && (!it.systemChecks || Object.keys(it.systemChecks).length === 0)) {
        patch = { ...(patch || {}), systemChecks: defaultChecks };
      }
      if (patch) {
        hasChanges = true;
        return { ...it, ...patch };
      }
      return it;
    });

    if (hasChanges) {
      if (onItemsChange) onItemsChange(updated);
      if (onChange) onChange(updated);
    }
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
  };

  const applyZoomToTrack = async (targetZoom: number) => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      if (capabilities.zoom) {
        const clamped = Math.min(Math.max(targetZoom, capabilities.zoom.min || 1), capabilities.zoom.max || 3);
        await videoTrack.applyConstraints({
          advanced: [{ zoom: clamped } as any],
        });
        setZoomLevel(clamped);
      } else {
        setZoomLevel(targetZoom);
      }
    } catch {
      setZoomLevel(targetZoom);
    }
  };

  const startCamera = async () => {
    setCameraError('');
    stopCamera();
    setZoomLevel(1);
    setCameraLoading(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Live camera stream not supported on this browser. Please use native device camera.');
      setCameraLoading(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
          setCameraActive(true);
          setCameraLoading(false);
        };
      } else {
        setCameraActive(true);
        setCameraLoading(false);
      }
    } catch {
      setCameraError('Camera access declined or unavailable. Use the device camera button below.');
      setCameraLoading(false);
    }
  };

  const openCameraModal = (target: ActiveTarget, existingNote: string = '') => {
    setActiveTarget(target);
    setActiveNote(existingNote);
    setCardError('');
    startCamera();
  };

  const closeCameraModal = () => {
    stopCamera();
    setActiveTarget(null);
    setActiveNote('');
  };

  const captureLivePhoto = async () => {
    if (!activeTarget) return;

    let base64Image = '';

    if (videoRef.current && cameraActive) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        base64Image = canvas.toDataURL('image/jpeg', 0.85);
      }
    }

    if (!base64Image) {
      nativeCameraInputRef.current?.click();
      return;
    }

    setIsProcessingPhoto(true);
    try {
      const watermarked = await applyWatermarkToImage(base64Image, {
        vehicleNo: vehicle.vehicleNo,
        driverName: driver.name,
        driverId: driver.loginId,
        itemTitle: `${activeTarget.code}. ${activeTarget.title}${activeTarget.slotName ? ` - ${activeTarget.slotName}` : ''}`,
        customNote: activeTarget.slotName
          ? `${activeTarget.slotName} ${activeTarget.isDefect ? '(DEFECT)' : '(OK)'}`
          : activeTarget.isDefect
          ? 'DEFECT'
          : undefined,
        gps: gpsInfo ? { lat: gpsInfo.lat, lng: gpsInfo.lng, accuracy: gpsInfo.accuracy } : undefined,
      });

      saveCapturedPhoto(watermarked);
      closeCameraModal();
    } catch {
      alert('Error stamping watermark on photo. Please try again.');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleNativeCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTarget) return;

    setIsProcessingPhoto(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rawBase64 = reader.result as string;
        const watermarked = await applyWatermarkToImage(rawBase64, {
          vehicleNo: vehicle.vehicleNo,
          driverName: driver.name,
          driverId: driver.loginId,
          itemTitle: `${activeTarget.code}. ${activeTarget.title}${activeTarget.slotName ? ` - ${activeTarget.slotName}` : ''}`,
          customNote: activeTarget.slotName
            ? `${activeTarget.slotName} ${activeTarget.isDefect ? '(DEFECT)' : '(OK)'}`
            : activeTarget.isDefect
            ? 'DEFECT'
            : undefined,
          gps: gpsInfo ? { lat: gpsInfo.lat, lng: gpsInfo.lng, accuracy: gpsInfo.accuracy } : undefined,
        });

        saveCapturedPhoto(watermarked);
        closeCameraModal();
      } catch (err: any) {
        alert('Failed to process image: ' + err.message);
      } finally {
        setIsProcessingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const saveCapturedPhoto = (watermarkedBase64: string) => {
    if (!activeTarget) return;

    const newPhoto: InspectionPhoto = {
      url: watermarkedBase64,
      itemId: activeTarget.id,
      itemTitle: activeTarget.title,
      isDefect: activeTarget.isDefect,
      caption: activeTarget.slotName
        ? `${activeTarget.slotName} (${activeTarget.isDefect ? 'Defect' : 'Pass'})`
        : activeNote || (activeTarget.isDefect ? 'Defect evidence' : 'Verified condition'),
      slotIndex: activeTarget.slotIndex,
      slotName: activeTarget.slotName,
      timestamp: new Date().toISOString(),
      gps: gpsInfo
        ? {
            lat: gpsInfo.lat,
            lng: gpsInfo.lng,
            accuracy: gpsInfo.accuracy,
            address: gpsInfo.address || 'Verified Logistics Depot',
          }
        : undefined,
    };

    const updatedPhotos = photos.filter((p) => {
      if (p.itemId !== activeTarget.id) return true;
      if (activeTarget.slotIndex !== undefined) {
        return p.slotIndex !== activeTarget.slotIndex;
      }
      return false;
    });

    updatedPhotos.push(newPhoto);
    onPhotosChange(updatedPhotos);

    if (activeTarget.isDefect && activeNote) {
      updateItemField(activeTarget.id, { defectNote: activeNote });
    }
  };

  const handleDeleteSlotPhoto = (itemId: string, slotIndex?: number) => {
    const updated = photos.filter((p) => {
      if (p.itemId !== itemId) return true;
      if (slotIndex !== undefined) {
        return p.slotIndex !== slotIndex;
      }
      return false;
    });
    onPhotosChange(updated);
  };

  const updateItemField = (itemId: string, patch: Partial<InspectionCheckItem>) => {
    const updated = items.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
    if (onItemsChange) onItemsChange(updated);
    if (onChange) onChange(updated);
  };

  const handleStatusChange = (itemId: string, newStatus: CheckStatus) => {
    if (newStatus === 'Pass') {
      const activeList = getSystemCheckList();
      const allPassedChecks: Record<string, boolean> = {};
      activeList.forEach((c) => {
        allPassedChecks[c.key] = true;
      });

      const patch: Partial<InspectionCheckItem> = {
        status: 'Pass',
        defectNote: '', // Defect remark cleared when driver chooses Pass!
      };

      if (activeList.length > 0) {
        patch.systemChecks = allPassedChecks;
      }

      if (itemId === 'dashboard_warnings') {
        patch.dashboardChecks = {
          engineLightOff: true,
          doubleSignalOk: true,
          batteryLightOff: true,
          oilLightOff: true,
        };
      }

      updateItemField(itemId, patch);
      setCardError('');
    } else {
      updateItemField(itemId, { status: 'Fail' });
    }
  };

  const handleDefectNoteChange = (itemId: string, note: string) => {
    const it = items.find((i) => i.id === itemId);
    if (it?.status === 'Fail') {
      updateItemField(itemId, { defectNote: note });
    }
  };

  // Toggle defect tag in remark
  const handleTagClick = (itemId: string, currentNote: string, tag: string) => {
    let newNote = '';
    if (!currentNote) {
      newNote = tag;
    } else if (currentNote.includes(tag)) {
      newNote = currentNote
        .split('; ')
        .filter((t) => t !== tag)
        .join('; ');
    } else {
      newNote = `${currentNote}; ${tag}`;
    }
    updateItemField(itemId, { status: 'Fail', defectNote: newNote });
  };

  // Toggle specific failed part or slot in remark
  const handleToggleFailedPart = (itemId: string, partLabel: string) => {
    const it = items.find((i) => i.id === itemId);
    const currentNote = it?.defectNote || '';
    const prefix = `[Failed: ${partLabel}]`;

    let newNote = '';
    if (currentNote.includes(prefix)) {
      newNote = currentNote.replace(prefix, '').replace(/;\s*;\s*/g, '; ').trim();
    } else {
      newNote = currentNote ? `${prefix} ${currentNote}` : `${prefix} Issue identified`;
    }
    updateItemField(itemId, { status: 'Fail', defectNote: newNote });
  };

  const handleSystemCheckToggle = (
    itemId: string,
    checkKey: string,
    checkLabel?: string,
    forceValue?: boolean
  ) => {
    const currentItem = items.find((i) => i.id === itemId);
    if (!currentItem) return;

    const currentChecks = currentItem.systemChecks || {};
    const willBeChecked = forceValue !== undefined ? forceValue : !(currentChecks[checkKey] !== false);
    const updatedChecks = {
      ...currentChecks,
      [checkKey]: willBeChecked,
    };

    const patch: Partial<InspectionCheckItem> = { systemChecks: updatedChecks };

    const activeList = getSystemCheckList();
    const hasAnyDefect = activeList.some((c) => {
      if (c.key === checkKey) return !willBeChecked;
      return updatedChecks[c.key] === false;
    });

    if (hasAnyDefect) {
      patch.status = 'Fail';
      if (!willBeChecked && checkLabel) {
        const existingNote = currentItem.defectNote || '';
        const partTag = `[${checkLabel} Faulty]`;
        if (!existingNote.includes(partTag)) {
          patch.defectNote = existingNote ? `${partTag}; ${existingNote}` : `${partTag} Inoperative / Needs repair`;
        }
      }
    } else {
      // All items operational -> restore Pass and clear defectNote!
      patch.status = 'Pass';
      patch.defectNote = '';
    }

    updateItemField(itemId, patch);
  };

  // The active checkpoint item for the current card (0 to 9)
  const currentItem = items[currentCardIndex] || items[0];
  const requiredPhotoCount = getCheckpointRequiredPhotoCount(currentItem.id);
  const itemPhotos = photos.filter((p) => p.itemId === currentItem.id);
  const slots = getCheckpointSlots(currentItem.id);

  // Checkpoint #6: Dashboard checks default object
  const currentDashChecks = currentItem.dashboardChecks || {
    engineLightOff: true,
    doubleSignalOk: true,
    batteryLightOff: true,
    oilLightOff: true,
  };

  // Validate current card before advancing
  const validateCurrentCard = (): boolean => {
    setCardError('');

    // 1. Check mandatory photos
    if (requiredPhotoCount > 0 && itemPhotos.length < requiredPhotoCount) {
      setCardError(
        `This checkpoint requires ${requiredPhotoCount} photo(s) (${itemPhotos.length} captured). Please take the required photo(s) to proceed.`
      );
      return false;
    }

    // 2. Check defect note if status is Fail
    if (currentItem.status === 'Fail' && (!currentItem.defectNote || currentItem.defectNote.trim() === '')) {
      setCardError('This checkpoint is marked as FAIL. Please select the failed part or enter a defect remark.');
      return false;
    }

    // 3. Check dashboard specific checklist on card #6 (checkpoint #6)
    if (currentItem.id === 'dashboard_warnings' && currentItem.status === 'Fail') {
      if (!currentItem.defectNote || !currentItem.defectNote.trim()) {
        setCardError('Dashboard warning indicated. Please enter a defect remark before continuing.');
        return false;
      }
    }

    return true;
  };

  const handleNextCard = () => {
    if (validateCurrentCard()) {
      // Ensure systemChecks for current card are captured if not set
      if (activeCheckList.length > 0 && (!currentItem.systemChecks || Object.keys(currentItem.systemChecks).length === 0)) {
        const defaults: Record<string, boolean> = {};
        activeCheckList.forEach((c) => {
          defaults[c.key] = true;
        });
        updateItemField(currentItem.id, { systemChecks: defaults });
      }

      if (currentCardIndex < items.length - 1) {
        setCurrentCardIndex(currentCardIndex + 1);
      } else {
        // Completed all 10 cards -> Proceed to Declaration & Meter
        if (onProceed) onProceed();
      }
    }
  };

  const handlePrevCard = () => {
    setCardError('');
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
    } else if (onBackToScanner) {
      onBackToScanner();
    }
  };

  // Helper check for completed card
  const isCardCompleted = (idx: number) => {
    const it = items[idx];
    if (!it) return false;
    const req = getCheckpointRequiredPhotoCount(it.id);
    const count = photos.filter((p) => p.itemId === it.id).length;
    return count >= req;
  };

  // Get active system check list for current card
  const getSystemCheckList = () => {
    if (currentItem.id === 'lights_indicators') return LIGHTS_CHECKS;
    if (currentItem.id === 'brake_system') return BRAKES_CHECKS;
    if (currentItem.id === 'steering_handling') return STEERING_CHECKS;
    if (currentItem.id === 'fluids_powertrain') return FLUIDS_CHECKS;
    if (currentItem.id === 'emergency_equipment') {
      return isFeeder ? FEEDER_APAD_SAFETY_EQUIPMENT : SMALL_TRUCK_SAFETY_EQUIPMENT;
    }
    return [];
  };

  const activeCheckList = getSystemCheckList();

  return (
    <div className="max-w-2xl mx-auto h-[calc(100dvh-5.5rem)] min-h-[580px] max-h-[820px] flex flex-col justify-between overflow-hidden">
      {/* ================= TOP CARD DECK STEPPER (COMPACT) ================= */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2.5 sm:p-3 shadow-xs text-slate-800 space-y-1.5 flex-shrink-0">
        {/* Header & Percentage */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
              {currentCardIndex + 1}
            </span>
            <div className="flex items-baseline space-x-1.5 truncate">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                Card {currentCardIndex + 1}/10:
              </span>
              <h2 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                {currentItem.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
              {Math.round(((currentCardIndex + 1) / 10) * 100)}%
            </span>
            <span className="text-[10px] text-slate-400 font-mono font-bold">{vehicle.vehicleNo}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-blue-600 h-full rounded-full transition-all duration-300"
            style={{ width: `${((currentCardIndex + 1) / 10) * 100}%` }}
          />
        </div>

        {/* 10 Card Quick Selector Dots */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
          {items.map((it, idx) => {
            const completed = isCardCompleted(idx);
            const isCurrent = currentCardIndex === idx;

            return (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  setCardError('');
                  setCurrentCardIndex(idx);
                }}
                className={`flex-1 h-6 rounded-md text-[10px] font-bold font-mono transition flex items-center justify-center cursor-pointer ${
                  isCurrent
                    ? 'bg-blue-600 text-white shadow-xs'
                    : completed
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                title={`#${it.code} ${it.title}`}
              >
                {completed ? '✓' : idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* ================= INLINE VALIDATION WARNING ================= */}
      {cardError && (
        <div className="mt-1 p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-bold flex items-center justify-between shadow-xs flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{cardError}</span>
          </div>
          <button
            type="button"
            onClick={() => setCardError('')}
            className="text-amber-700 hover:text-amber-900 font-bold text-xs p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ================= ACTIVE CHECKPOINT CARD BODY (ONE PAGE FIT) ================= */}
      <div className="my-1.5 flex-1 min-h-0 overflow-y-auto bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs text-slate-800">
        {/* Checkpoint Meta Info */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                {currentItem.category}
              </span>
              <span className="text-[11px] font-mono font-bold text-blue-600">
                Checkpoint #{currentItem.code}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
              {currentItem.subtext}
            </p>
          </div>

          {requiredPhotoCount > 0 && (
            <div className="flex-shrink-0 flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-bold px-2 py-1 rounded-lg">
              <Camera className="w-3.5 h-3.5" />
              <span>{itemPhotos.length}/{requiredPhotoCount} Photos</span>
            </div>
          )}
        </div>

        {/* 1. PHOTO SECTION */}
        {slots && slots.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <span>Photo Slots ({slots.length} Required) *</span>
              <span className="text-slate-400 font-normal">Tap slot to capture</span>
            </div>

            <div className={`grid gap-2 ${slots.length > 2 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {slots.map((slot) => {
                const photo = photos.find(
                  (p) => p.itemId === currentItem.id && p.slotIndex === slot.index
                );

                return (
                  <div
                    key={slot.index}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800 truncate" title={slot.name}>
                        {slot.shortLabel || slot.name}
                      </span>
                      {photo ? (
                        <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1 rounded">
                          ✓ Done
                        </span>
                      ) : (
                        <span className="text-[9px] text-amber-600 font-bold">Required</span>
                      )}
                    </div>

                    {photo ? (
                      <div className="relative rounded-lg overflow-hidden h-20 bg-slate-900 shadow-xs">
                        <img
                          src={photo.url}
                          alt={slot.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteSlotPhoto(currentItem.id, slot.index)}
                          className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded hover:bg-rose-700 cursor-pointer shadow-sm"
                          title="Retake photo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <div className="absolute bottom-1 left-1 text-[8px] text-white bg-black/60 px-1 py-0.2 rounded font-mono">
                          ✓ Stamped
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          openCameraModal({
                            id: currentItem.id,
                            title: currentItem.title,
                            isDefect: false,
                            code: currentItem.code,
                            slotIndex: slot.index,
                            slotName: slot.name,
                          })
                        }
                        className="w-full h-20 border border-dashed border-blue-300 bg-white hover:bg-blue-50/50 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition text-blue-600 p-1"
                      >
                        <Camera className="w-5 h-5 text-blue-500" />
                        <span className="text-[10px] font-bold text-center leading-tight">Capture {slot.shortLabel || slot.name}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : requiredPhotoCount > 0 ? (
          /* Single photo slot */
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Verification Photo (Mandatory) *
            </label>
            {itemPhotos.length > 0 ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 h-28 shadow-xs">
                <img
                  src={itemPhotos[0].url}
                  alt={currentItem.title}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteSlotPhoto(currentItem.id)}
                  className="absolute top-1.5 right-1.5 p-1 bg-rose-600 text-white rounded-lg shadow-sm hover:bg-rose-700 cursor-pointer"
                  title="Retake photo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="absolute bottom-1.5 left-1.5 text-[9px] text-white bg-black/60 px-1.5 py-0.5 rounded font-mono">
                  ✓ Verified & Watermarked
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  openCameraModal({
                    id: currentItem.id,
                    title: currentItem.title,
                    isDefect: false,
                    code: currentItem.code,
                    slotName: currentItem.title,
                  })
                }
                className="w-full py-4 border border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer text-blue-700 text-xs font-bold"
              >
                <Camera className="w-5 h-5 text-blue-600" />
                <span>Tap to Launch Camera & Capture Photo</span>
              </button>
            )}
          </div>
        ) : null}

        {/* 2. CHECKBOXES SECTION (COMPACT) */}
        {activeCheckList.length > 0 && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
            <span className="font-bold text-slate-800 text-[11px] block">
              Verification Checks (All operational by default; untick if defective):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {activeCheckList.map((chk) => {
                const isChecked = currentItem.systemChecks?.[chk.key] !== false;
                return (
                  <label
                    key={chk.key}
                    className={`flex items-center gap-2 p-1.5 rounded-lg border cursor-pointer transition select-none ${
                      isChecked
                        ? 'bg-white border-slate-200 hover:bg-slate-50'
                        : 'bg-rose-50 border-rose-300 text-rose-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        handleSystemCheckToggle(currentItem.id, chk.key, chk.label, e.target.checked)
                      }
                      className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 cursor-pointer accent-blue-600"
                    />
                    <div className="truncate flex-1">
                      <div className={`text-[11px] font-bold truncate ${isChecked ? 'text-slate-800' : 'text-rose-800 font-black'}`}>
                        {chk.label}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Dashboard cluster check for card #6 */}
        {currentItem.id === 'dashboard_warnings' && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
            <span className="font-bold text-slate-800 text-[11px] block">
              Instrument Cluster Warnings & Status Check:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {[
                { id: 'engineLightOff', label: 'Check Engine Lamp OFF' },
                { id: 'doubleSignalOk', label: 'Hazard Double Signal OK' },
                { id: 'oilLightOff', label: 'Oil Pressure Normal' },
                { id: 'batteryLightOff', label: 'Alternator / Battery Normal' },
              ].map((chk) => {
                const isChecked = (currentDashChecks as any)[chk.id] ?? true;

                return (
                  <label
                    key={chk.id}
                    className={`flex items-center gap-2 p-1.5 rounded-lg border cursor-pointer transition select-none ${
                      isChecked
                        ? 'bg-white border-slate-200 hover:bg-slate-50'
                        : 'bg-rose-50 border-rose-300 text-rose-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const updated = {
                          ...currentDashChecks,
                          [chk.id]: e.target.checked,
                        };
                        const hasAnyDefect =
                          !updated.engineLightOff ||
                          !updated.doubleSignalOk ||
                          !updated.oilLightOff ||
                          !updated.batteryLightOff;

                        const patch: Partial<InspectionCheckItem> = { dashboardChecks: updated };
                        if (hasAnyDefect) {
                          patch.status = 'Fail';
                          if (!e.target.checked) {
                            patch.defectNote = `[${chk.label}] Abnormal indicator detected`;
                          }
                        } else {
                          patch.status = 'Pass';
                          patch.defectNote = '';
                        }
                        updateItemField('dashboard_warnings', patch);
                      }}
                      className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 cursor-pointer accent-blue-600"
                    />
                    <span className="text-[11px] font-medium text-slate-800 truncate">{chk.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. PASS / FAIL STATUS SELECTOR */}
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Assessment Result:
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              {currentItem.status === 'Fail' ? 'Defects specified below' : 'Cleared standard'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleStatusChange(currentItem.id, 'Pass')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                currentItem.status === 'Pass'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Normal (Pass)</span>
            </button>

            <button
              type="button"
              onClick={() => handleStatusChange(currentItem.id, 'Fail')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                currentItem.status === 'Fail'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Defect (Fail)</span>
            </button>
          </div>

          {/* DEFECT DETAILS SECTION IF FAIL (REQUEST #7 IMPLEMENTATION) */}
          {currentItem.status === 'Fail' && (
            <div className="space-y-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs">
              {/* If multiple photo slots: choose which part/slot failed */}
              {slots && slots.length > 1 && (
                <div className="space-y-1">
                  <span className="font-bold text-rose-900 text-[10px] uppercase tracking-wider block">
                    Choose Which Photo Slot / Part Failed:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {slots.map((s) => {
                      const isSelected = (currentItem.defectNote || '').includes(`[Failed: ${s.name}]`);
                      return (
                        <button
                          key={s.index}
                          type="button"
                          onClick={() => handleToggleFailedPart(currentItem.id, s.name)}
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition border cursor-pointer ${
                            isSelected
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                              : 'bg-white text-rose-800 border-rose-300 hover:bg-rose-100'
                          }`}
                        >
                          {isSelected ? `✓ ${s.shortLabel || s.name}` : `+ ${s.shortLabel || s.name}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* If checklist items: choose which check failed */}
              {activeCheckList.length > 0 && (
                <div className="space-y-1">
                  <span className="font-bold text-rose-900 text-[10px] uppercase tracking-wider block">
                    Choose Which Component Failed:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {activeCheckList.map((chk) => {
                      const isSelected = (currentItem.defectNote || '').includes(`[Failed: ${chk.label}]`);
                      return (
                        <button
                          key={chk.key}
                          type="button"
                          onClick={() => handleToggleFailedPart(currentItem.id, chk.label)}
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition border cursor-pointer ${
                            isSelected
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                              : 'bg-white text-rose-800 border-rose-300 hover:bg-rose-100'
                          }`}
                        >
                          {isSelected ? `✓ ${chk.label}` : `+ ${chk.label}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick defect tags */}
              {COMMON_DEFECT_TAGS[currentItem.id] && (
                <div className="space-y-1">
                  <span className="font-bold text-rose-900 text-[10px] uppercase tracking-wider block">
                    Quick Defect Tags:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {COMMON_DEFECT_TAGS[currentItem.id].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleTagClick(currentItem.id, currentItem.defectNote || '', tag)}
                        className={`text-[10px] px-2 py-0.5 rounded-md font-medium transition cursor-pointer border ${
                          (currentItem.defectNote || '').includes(tag)
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-100'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Defect remark text */}
              <div className="space-y-1">
                <span className="font-bold text-rose-900 text-[10px] uppercase tracking-wider block">
                  Defect Remark (Required):
                </span>
                <textarea
                  rows={2}
                  value={currentItem.defectNote || ''}
                  onChange={(e) => handleDefectNoteChange(currentItem.id, e.target.value)}
                  placeholder="Selected failed parts and defect remark will be logged for maintenance..."
                  className="w-full bg-white border border-rose-300 rounded-lg p-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= FIXED BOTTOM NAVIGATION FOOTER ================= */}
      <div className="flex items-center justify-between gap-2 pt-1 flex-shrink-0">
        <button
          type="button"
          onClick={handlePrevCard}
          className="px-3.5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-xs"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{currentCardIndex === 0 ? 'Vehicle Scan' : `Card #${currentCardIndex}`}</span>
        </button>

        <button
          type="button"
          onClick={handleNextCard}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-sm shadow-blue-500/20"
        >
          {currentCardIndex < items.length - 1 ? (
            <>
              <span>Next (Card #{currentCardIndex + 2})</span>
              <ChevronRight className="w-4 h-4" />
            </>
          ) : (
            <>
              <span>Complete 10 Cards & Proceed</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* ================= CAMERA CAPTURE MODAL (FIXED DIMENSIONS, ZERO RESIZE POP) ================= */}
      {activeTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 backdrop-blur-xs">
          <div className="w-full max-w-md h-[500px] max-h-[85vh] bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-3 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between text-white flex-shrink-0">
              <div className="truncate mr-2">
                <div className="text-[10px] font-mono text-blue-400 font-bold uppercase truncate">
                  {activeTarget.slotName ? `${activeTarget.slotName}` : `Checkpoint #${activeTarget.code}`}
                </div>
                <h4 className="text-xs font-black truncate">{activeTarget.title}</h4>
              </div>
              <button
                type="button"
                onClick={closeCameraModal}
                className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 hover:text-white cursor-pointer flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Camera Viewport with FIXED Dimensions */}
            <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`w-full h-full object-cover transition-opacity duration-200 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
                style={{ transform: `scale(${zoomLevel})` }}
              />

              {/* Instant Loading State (Prevents small-then-big layout jump) */}
              {!cameraActive && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-slate-400 space-y-2 p-4">
                  <RefreshCw className="w-7 h-7 text-blue-500 animate-spin" />
                  <span className="text-xs font-mono font-medium">Initializing camera stream...</span>
                </div>
              )}

              {/* Watermark Live Stamp Badge */}
              {cameraActive && (
                <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-xs px-2 py-1 rounded-lg text-[9px] text-white font-mono space-y-0.5 border border-white/10 pointer-events-none">
                  <div className="font-bold text-amber-400">{vehicle.vehicleNo}</div>
                  <div>{driver.name} ({driver.loginId})</div>
                  <div className="text-slate-300">
                    {gpsInfo ? `${gpsInfo.lat.toFixed(4)}°N, ${gpsInfo.lng.toFixed(4)}°E` : 'Live GPS Stamping'}
                  </div>
                </div>
              )}

              {/* Zoom Buttons */}
              {cameraActive && (
                <div className="absolute top-2 right-2 flex flex-col gap-1">
                  {[1, 2, 3].map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => applyZoomToTrack(z)}
                      className={`w-7 h-7 rounded-lg text-[10px] font-black font-mono transition cursor-pointer ${
                        zoomLevel === z ? 'bg-blue-600 text-white' : 'bg-black/60 text-white hover:bg-black/80'
                      }`}
                    >
                      {z}x
                    </button>
                  ))}
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 bg-slate-900/95 p-4 flex flex-col items-center justify-center text-center text-white space-y-2">
                  <AlertTriangle className="w-7 h-7 text-amber-400" />
                  <p className="text-xs text-slate-300 max-w-xs">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    className="bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Open Device Camera
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-3 bg-slate-800 border-t border-slate-700 flex items-center justify-between gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="text-[11px] text-slate-300 hover:text-white bg-slate-700 px-3 py-2 rounded-xl transition cursor-pointer"
              >
                Device Camera / File
              </button>

              <button
                type="button"
                disabled={isProcessingPhoto}
                onClick={captureLivePhoto}
                className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-blue-600/30 cursor-pointer disabled:opacity-50"
              >
                {isProcessingPhoto ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Watermarking...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    <span>Capture & Stamp</span>
                  </>
                )}
              </button>

              <input
                ref={nativeCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleNativeCameraCapture}
                className="hidden"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
