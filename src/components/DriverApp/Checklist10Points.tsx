import React, { useState, useRef, useEffect } from 'react';
import { Vehicle, Driver, InspectionCheckItem, InspectionPhoto, CheckStatus, isSaturdayInspection, requiresFull15PhotoInspection } from '../../types';
import { getCurrentGps, applyWatermarkToImage } from '../../lib/cameraWatermark';
import { getCheckpointRequiredPhotoCount, getCheckpointSlots } from '../../lib/checkpointConfig';
import { CHECKPOINT_EXAMPLES, ExamplePhotoGuide } from '../../lib/checkpointExamples';
import {
  getCheckpointSystemChecks,
  getDefaultSystemChecks,
} from '../../lib/quickChecklistConfig';
import {
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Trash2,
  X,
  Zap,
  ZoomIn,
  RefreshCw,
  Info,
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

  // Active photo capture target for native camera
  const [activeTarget, setActiveTarget] = useState<ActiveTarget | null>(null);
  const [activeNote, setActiveNote] = useState<string>('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  const [cardError, setCardError] = useState<string>('');

  // Enlarged sample photo preview modal
  const [previewExample, setPreviewExample] = useState<ExamplePhotoGuide | null>(null);

  // Active slot index for checkpoints with multiple slots (e.g. tyres, body)
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);

  // Reset active slot index when switching checkpoint cards
  useEffect(() => {
    setActiveSlotIndex(0);
  }, [currentCardIndex]);

  // Meter engine start reminder confirmation modal state
  const [pendingMeterTarget, setPendingMeterTarget] = useState<ActiveTarget | null>(null);

  // Hidden native camera file input
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

  const isSaturday = isSaturdayInspection();
  const isFullAudit = requiresFull15PhotoInspection(vehicle, isSaturday);
  const currentItem = items[currentCardIndex] || items[0];
  const requiredPhotoCount = getCheckpointRequiredPhotoCount(currentItem?.id, isFullAudit);
  const slots = getCheckpointSlots(currentItem?.id, isFullAudit);
  const itemPhotos = photos.filter((p) => p.itemId === currentItem?.id);
  // Card 3 (Lights & Indicators) and Card 8 (Emergency Equipment) do not need example photos
  const isExcludedFromExamplePhoto =
    currentItem?.id === 'lights_indicators' ||
    currentItem?.id === 'emergency_equipment' ||
    currentItem?.code === 3 ||
    currentItem?.code === 8;
  const exampleGuide: ExamplePhotoGuide | undefined =
    currentItem && !isExcludedFromExamplePhoto ? CHECKPOINT_EXAMPLES[currentItem.id] : undefined;
  
  // Resolve slot-specific example photo (e.g. Front-Right tyre vs Front-Left tyre)
  const currentSlot = slots?.find((s) => s.index === activeSlotIndex) || slots?.[0];
  const activeSlotExample = currentSlot && exampleGuide?.slots?.[currentSlot.index];
  const displayExamplePhoto = activeSlotExample?.realPhotoPath || exampleGuide?.realPhotoPath || exampleGuide?.exampleImageSvg;
  const displayExampleFileName = activeSlotExample?.fileName || exampleGuide?.fileName;
  const displayExampleTitle = activeSlotExample?.title ? `${exampleGuide?.title} (${activeSlotExample.title})` : (exampleGuide?.title || '');

  // DIRECT ONE-CLICK NATIVE CAMERA LAUNCH
  const executeNativeCameraLaunch = (target: ActiveTarget, existingNote: string = '') => {
    setActiveTarget(target);
    setActiveNote(existingNote);
    setCardError('');
    if (nativeCameraInputRef.current) {
      nativeCameraInputRef.current.value = '';
      nativeCameraInputRef.current.click();
    }
  };

  const triggerNativeCamera = (target: ActiveTarget, existingNote: string = '') => {
    if (target.id === 'dashboard_warnings') {
      // Driver MUST start engine before taking meter photo
      setPendingMeterTarget(target);
      setActiveNote(existingNote);
      return;
    }
    executeNativeCameraLaunch(target, existingNote);
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
      } catch (err: any) {
        alert('Failed to stamp watermark: ' + (err?.message || 'Unknown error'));
      } finally {
        setIsProcessingPhoto(false);
        setActiveTarget(null);
        setActiveNote('');
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
        defectNote: '',
        systemChecks: allPassedChecks,
      };

      if (itemId === 'dashboard_warnings') {
        patch.dashboardChecks = {
          engineLightOff: true,
          doubleSignalOk: true,
          batteryLightOff: true,
          oilLightOff: true,
        };
      }
      updateItemField(itemId, patch);
    } else {
      updateItemField(itemId, { status: newStatus });
    }
  };

  const handleDefectNoteChange = (itemId: string, note: string) => {
    updateItemField(itemId, { defectNote: note });
  };

  const handleTagClick = (itemId: string, currentNote: string, tag: string) => {
    if (currentNote.includes(tag)) {
      const updated = currentNote
        .replace(tag, '')
        .replace(/,\s*,/g, ',')
        .replace(/^,\s*|\s*,\s*$/g, '')
        .trim();
      updateItemField(itemId, { defectNote: updated });
    } else {
      const updated = currentNote ? `${currentNote}, ${tag}` : tag;
      updateItemField(itemId, { defectNote: updated });
    }
  };

  const handleToggleFailedPart = (itemId: string, partName: string) => {
    const current = currentItem.defectNote || '';
    const tag = `[Failed: ${partName}]`;
    if (current.includes(tag)) {
      const updated = current.replace(tag, '').trim();
      updateItemField(itemId, { defectNote: updated });
    } else {
      const updated = current ? `${tag} ${current}` : `${tag} Component defect detected`;
      updateItemField(itemId, { defectNote: updated });
    }
  };

  const handleSystemCheckToggle = (itemId: string, checkKey: string, checkLabel: string, checked: boolean) => {
    const currentSysChecks = currentItem.systemChecks || {};
    const updatedChecks = { ...currentSysChecks, [checkKey]: checked };

    const patch: Partial<InspectionCheckItem> = { systemChecks: updatedChecks };

    if (!checked) {
      patch.status = 'Fail';
      const defectNotice = `[Failed: ${checkLabel}]`;
      if (!currentItem.defectNote?.includes(defectNotice)) {
        patch.defectNote = currentItem.defectNote
          ? `${defectNotice} ${currentItem.defectNote}`
          : `${defectNotice} Component failure observed`;
      }
    } else {
      const hasOtherFailures = Object.entries(updatedChecks).some(([k, v]) => v === false && k !== checkKey);
      if (!hasOtherFailures) {
        patch.status = 'Pass';
        patch.defectNote = '';
      }
    }

    updateItemField(itemId, patch);
  };

  const handleNextCard = () => {
    setCardError('');

    // Check mandatory photos
    if (requiredPhotoCount > 0) {
      if (slots && slots.length > 0) {
        const missingSlots = slots.filter(
          (s) => !photos.some((p) => p.itemId === currentItem.id && p.slotIndex === s.index)
        );
        if (missingSlots.length > 0) {
          const names = missingSlots.map((s) => s.shortLabel || s.name).join(', ');
          setCardError(`Missing mandatory photos: ${names}. Driver must photograph all slots before next card.`);
          return;
        }
      } else {
        if (itemPhotos.length < requiredPhotoCount) {
          setCardError(`Checkpoint #${currentItem.code} requires photo evidence. Tap "Launch Camera" to take photo.`);
          return;
        }
      }
    }

    // Check defect note if Fail
    if (currentItem.status === 'Fail') {
      if (!currentItem.defectNote || currentItem.defectNote.trim().length === 0) {
        setCardError('Defect description is required when checkpoint status is Fail.');
        return;
      }
    }

    // Auto-fill Pass checks if not set
    if (!currentItem.systemChecks || Object.keys(currentItem.systemChecks).length === 0) {
      const defaults: Record<string, boolean> = {};
      activeCheckList.forEach((chk) => {
        defaults[chk.key] = true;
      });
      updateItemField(currentItem.id, { systemChecks: defaults });
    }

    if (currentCardIndex < items.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
    } else {
      // Completed all checkpoints -> Proceed to Declaration & Meter
      if (onProceed) onProceed();
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
    const req = getCheckpointRequiredPhotoCount(it.id, isFullAudit);
    const count = photos.filter((p) => p.itemId === it.id).length;
    return count >= req;
  };

  const getSystemCheckList = () => {
    return getCheckpointSystemChecks(currentItem.id, isFeeder);
  };

  const activeCheckList = getSystemCheckList();
  const currentDashChecks = currentItem.dashboardChecks || {
    engineLightOff: true,
    doubleSignalOk: true,
    batteryLightOff: true,
    oilLightOff: true,
  };

  return (
    <div className="max-w-2xl mx-auto h-[calc(100dvh-5.5rem)] min-h-[580px] max-h-[820px] flex flex-col justify-between overflow-hidden">
      {/* ================= TOP CARD DECK STEPPER ================= */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2.5 sm:p-3 shadow-xs text-slate-800 space-y-1.5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
              {currentCardIndex + 1}
            </span>
            <div className="flex items-baseline space-x-1.5 truncate">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                Card {currentCardIndex + 1}/{items.length}:
              </span>
              <h2 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                {currentItem.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
              {Math.round(((currentCardIndex + 1) / items.length) * 100)}%
            </span>
            <span className="text-[10px] text-slate-400 font-mono font-bold">{vehicle.vehicleNo}</span>
          </div>
        </div>

        {/* Routine Type Label */}
        <div className="flex items-center justify-between text-[10px] font-mono font-bold px-1">
          <span className={isFullAudit ? 'text-amber-700 font-semibold' : 'text-slate-500'}>
            {isFullAudit
              ? (isFeeder ? '🚚 Feeder Daily Audit (Full Set • 15 Photos)' : '⚡ Saturday Deep Audit (Full Set • 15 Photos)')
              : '🚐 Sales Truck Routine (5 Points • 6 Photos • Meter Last)'}
          </span>
          <span className="text-slate-400">
            {currentCardIndex + 1} of {items.length} Checkpoints
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-blue-600 h-full rounded-full transition-all duration-300"
            style={{ width: `${((currentCardIndex + 1) / items.length) * 100}%` }}
          />
        </div>

        {/* Card Selector Buttons */}
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

      {/* ================= ACTIVE CHECKPOINT CARD BODY ================= */}
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

        {/* PROMINENT MANDATORY NOTICE BANNER */}
        {currentItem.id === 'dashboard_warnings' ? (
          <div className="bg-amber-400 text-slate-950 p-2.5 rounded-xl text-xs font-black shadow-xs border-2 border-amber-500 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl flex-shrink-0">🔑</span>
              <div>
                <span className="text-[11px] uppercase tracking-wider font-black block">
                  START ENGINE FIRST (Truck running)
                </span>
                <span className="text-[10px] font-bold text-slate-900 block">
                  Keep cluster lit + Flashlight ON (⚡)
                </span>
              </div>
            </div>
            <div className="bg-slate-950 text-amber-400 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 flex-shrink-0">
              <Zap className="w-3.5 h-3.5 fill-current animate-pulse" />
              <span>FLASH ON</span>
            </div>
          </div>
        ) : (
          <div className="bg-amber-400 text-slate-950 px-3 py-2 rounded-xl text-xs font-black flex items-center justify-between shadow-xs border-2 border-amber-500">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-slate-950 text-amber-400 rounded-lg flex-shrink-0">
                <Zap className="w-3.5 h-3.5 fill-current animate-pulse" />
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider font-black block">
                  ⚡ MANDATORY: FLASHLIGHT ON (⚡)
                </span>
                <span className="text-[10px] font-bold text-slate-900 block">
                  Turn on camera flash before capturing
                </span>
              </div>
            </div>
          </div>
        )}

        {/* EXAMPLE PHOTO GUIDE FOR THIS CHECKPOINT */}
        {exampleGuide && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-white space-y-2 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300 font-mono truncate">
                  📸 Example Photo: {displayExampleTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPreviewExample({
                    ...exampleGuide,
                    title: displayExampleTitle,
                    realPhotoPath: displayExamplePhoto,
                    fileName: displayExampleFileName,
                  })
                }
                className="text-[10px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 cursor-pointer bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 flex-shrink-0"
              >
                <ZoomIn className="w-3 h-3" />
                <span>Enlarge</span>
              </button>
            </div>

            {/* If checkpoint has multiple slots (e.g. Tyres: Front-L, Front-R, Rear-L, Rear-R): Provide quick switcher buttons */}
            {slots && slots.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-[9px] font-bold text-slate-400 font-mono uppercase tracking-wider mr-0.5 flex-shrink-0">
                  Select Tyre/Slot:
                </span>
                {slots.map((s) => {
                  const isSelected = activeSlotIndex === s.index;
                  return (
                    <button
                      key={s.index}
                      type="button"
                      onClick={() => setActiveSlotIndex(s.index)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg transition border cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-xs'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      <span>{s.shortLabel || s.name}</span>
                      {exampleGuide?.slots?.[s.index] && (
                        <span className="text-[8px] opacity-75">📸</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Clickable Large Example Photo Preview Thumbnail (h-48 sm:h-56 for big, clear visual guide) */}
            <div
              onClick={() =>
                setPreviewExample({
                  ...exampleGuide,
                  title: displayExampleTitle,
                  realPhotoPath: displayExamplePhoto,
                  fileName: displayExampleFileName,
                })
              }
              className="relative w-full h-48 sm:h-56 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center cursor-pointer group shadow-inner"
              title="Click to zoom standard example"
            >
              <img
                src={displayExamplePhoto}
                alt={displayExampleTitle}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== exampleGuide.exampleImageSvg) {
                    target.src = exampleGuide.exampleImageSvg;
                  }
                }}
                className="w-full h-full object-contain group-hover:scale-102 transition duration-200"
              />
              <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition" />
              <div className="absolute bottom-2 left-2 bg-black/85 backdrop-blur-xs px-2.5 py-1 rounded-md text-[10px] text-slate-200 font-mono flex items-center gap-1.5 border border-white/10 shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-bold">{displayExampleFileName || 'Standard Example'}</span>
                <span className="text-slate-400 text-[9px]">• Tap to zoom</span>
              </div>
            </div>

            {/* Short & Simple Guideline Instructions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-0.5">
              {exampleGuide.instructions.map((inst, i) => (
                <div key={i} className="text-[11px] text-slate-200 flex items-center gap-1.5 font-medium leading-tight">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span>{inst}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 1. PHOTO SECTION: DIRECT NATIVE CAMERA LAUNCH */}
        {slots && slots.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <span>Photo Slots ({slots.length} Required) *</span>
              <span className="text-slate-400 font-normal">Tap button to open native camera</span>
            </div>

            <div className={`grid gap-2 ${slots.length > 2 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {slots.map((slot) => {
                const photo = photos.find(
                  (p) => p.itemId === currentItem.id && p.slotIndex === slot.index
                );

                return (
                  <div
                    key={slot.index}
                    onClick={() => setActiveSlotIndex(slot.index)}
                    className={`border rounded-xl p-2 space-y-1.5 shadow-2xs transition cursor-pointer ${
                      activeSlotIndex === slot.index
                        ? 'bg-blue-50/70 border-blue-400 ring-1 ring-blue-400'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-bold text-slate-800 truncate" title={slot.name}>
                          {slot.shortLabel || slot.name}
                        </span>
                        {exampleGuide?.slots?.[slot.index]?.fileName && (
                          <span className="text-[9px] text-slate-400 font-mono truncate">
                            {exampleGuide.slots[slot.index].fileName}
                          </span>
                        )}
                      </div>
                      {photo ? (
                        <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1 rounded flex-shrink-0">
                          ✓ Done
                        </span>
                      ) : (
                        <span className="text-[9px] text-amber-600 font-bold flex-shrink-0">Required</span>
                      )}
                    </div>

                    {photo ? (
                      <div className="relative rounded-lg overflow-hidden h-24 bg-slate-900 shadow-xs">
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
                        <div className="absolute bottom-1 left-1 text-[8px] text-white bg-black/70 px-1 py-0.2 rounded font-mono">
                          ✓ Stamped Frame
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          triggerNativeCamera({
                            id: currentItem.id,
                            title: currentItem.title,
                            isDefect: false,
                            code: currentItem.code,
                            slotIndex: slot.index,
                            slotName: slot.name,
                          })
                        }
                        className={`w-full h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition p-2 active:scale-98 ${
                          currentItem.id === 'dashboard_warnings'
                            ? 'border-amber-500 bg-amber-50/70 hover:bg-amber-100 text-amber-950'
                            : 'border-blue-400 bg-blue-50/40 hover:bg-blue-100/60 text-blue-700'
                        }`}
                      >
                        <div className="flex items-center gap-1 bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full text-[9px] font-black shadow-xs">
                          {currentItem.id === 'dashboard_warnings' ? (
                            <>
                              <span>🔑 START ENGINE</span>
                              <span>•</span>
                              <Zap className="w-3 h-3 fill-current" />
                              <span>FLASH ON</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3 h-3 fill-current" />
                              <span>FLASH ON (⚡)</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-black">
                          <Camera className="w-4 h-4 text-blue-600" />
                          <span>{currentItem.id === 'dashboard_warnings' ? 'Start Engine & Take Meter Photo' : `Capture ${slot.shortLabel || slot.name}`}</span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-medium">
                          {currentItem.id === 'dashboard_warnings' ? 'Start engine + flash ON' : 'Turn ON camera flash (⚡)'}
                        </span>
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
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Verification Photo (Mandatory) *
              </label>
              {exampleGuide?.fileName && (
                <span className="text-[10px] text-slate-500 font-mono font-medium">
                  File: {exampleGuide.fileName}
                </span>
              )}
            </div>
            {itemPhotos.length > 0 ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 h-32 shadow-xs">
                <img
                  src={itemPhotos[0].url}
                  alt={currentItem.title}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteSlotPhoto(currentItem.id)}
                  className="absolute top-2 right-2 p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer shadow-sm"
                  title="Retake photo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="absolute bottom-2 left-2 text-[9px] text-white bg-black/70 px-2 py-0.5 rounded font-mono">
                  ✓ Anti-Tamper Frame & Watermark Stamped
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  triggerNativeCamera({
                    id: currentItem.id,
                    title: currentItem.title,
                    isDefect: false,
                    code: currentItem.code,
                  })
                }
                className={`w-full h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition p-2 active:scale-98 ${
                  currentItem.id === 'dashboard_warnings'
                    ? 'border-amber-500 bg-amber-50/70 hover:bg-amber-100 text-amber-950'
                    : 'border-blue-400 bg-blue-50/40 hover:bg-blue-100/60 text-blue-700'
                }`}
              >
                <div className="flex items-center gap-1 bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-xs">
                  {currentItem.id === 'dashboard_warnings' ? (
                    <>
                      <span>🔑 START ENGINE</span>
                      <span>•</span>
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>FLASH ON</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>FLASH ON (⚡)</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-black">
                  <Camera className="w-4 h-4 text-blue-600" />
                  <span>{currentItem.id === 'dashboard_warnings' ? 'Start Engine & Open Camera' : 'Launch Camera & Take Photo'}</span>
                </div>
                <span className="text-[9px] text-slate-500 font-medium">
                  {currentItem.id === 'dashboard_warnings' ? 'Start engine + flash ON' : 'Turn ON camera flash (⚡)'}
                </span>
              </button>
            )}
          </div>
        ) : null}

        {/* 2. CHECKBOXES SECTION */}
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

          {/* DEFECT DETAILS SECTION IF FAIL */}
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
              <span>Complete All ({items.length}) Checkpoints & Proceed</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* ================= ENLARGED SAMPLE GUIDE MODAL ================= */}
      {previewExample && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col text-white">
            <div className="p-3.5 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-xs font-black truncate">{previewExample.title} - Standard Sample</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewExample(null)}
                className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 space-y-3 overflow-y-auto max-h-[75vh]">
              <div className="w-full aspect-[16/10] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center p-1 relative">
                <img
                  src={previewExample.realPhotoPath || previewExample.exampleImageSvg}
                  alt={previewExample.title}
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src !== previewExample.exampleImageSvg) {
                      target.src = previewExample.exampleImageSvg;
                    }
                  }}
                  className="w-full h-full object-contain"
                />
                {previewExample.fileName && (
                  <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-xs text-[10px] font-mono text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/30">
                    File: {previewExample.fileName}
                  </div>
                )}
              </div>

              {/* MANDATORY FLASHLIGHT & ENGINE NOTICE IN PREVIEW */}
              {previewExample.id === 'dashboard_warnings' ? (
                <div className="bg-amber-400 text-slate-950 p-2.5 rounded-xl border-2 border-amber-500 flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔑</span>
                    <div>
                      <span className="text-xs font-black uppercase block">
                        Start engine first (Truck running)
                      </span>
                      <span className="text-[10px] font-bold text-slate-900 block">
                        Turn ON camera flash (⚡)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-400 text-slate-950 p-2 rounded-xl border border-amber-500 flex items-center gap-2 text-xs font-black shadow-xs">
                  <Zap className="w-3.5 h-3.5 fill-current flex-shrink-0 animate-pulse" />
                  <span>Turn ON camera flashlight (⚡)</span>
                </div>
              )}

              <div className="space-y-1 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                  Guide:
                </span>
                <p className="text-xs text-slate-200">
                  {previewExample.description}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-current" />
                  <span>Instructions:</span>
                </span>
                <div className="space-y-1">
                  {previewExample.instructions.map((inst, i) => (
                    <div key={i} className="text-xs text-slate-200 flex items-center gap-2 bg-slate-800/40 p-2 rounded-lg border border-slate-700/40 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                      <span>{inst}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewExample(null)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-black text-white transition cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= METER START ENGINE MANDATORY CONFIRMATION MODAL ================= */}
      {pendingMeterTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-amber-400 rounded-3xl p-4 text-white shadow-2xl space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center text-slate-950 text-xl font-black shadow-md flex-shrink-0">
                🔑
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-amber-400 leading-tight">
                  START VEHICLE ENGINE FIRST!
                </h3>
                <p className="text-[10px] text-slate-300">
                  Truck engine must be running
                </p>
              </div>
            </div>

            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3 space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center flex-shrink-0 text-[10px]">
                  1
                </span>
                <p className="text-slate-200 font-medium">
                  <strong>Start engine:</strong> Dashboard & odometer must be lit.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center flex-shrink-0 text-[10px]">
                  2
                </span>
                <p className="text-slate-200 font-medium">
                  <strong>Flash ON (⚡):</strong> Camera flash required for clear digits.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  const target = pendingMeterTarget;
                  setPendingMeterTarget(null);
                  executeNativeCameraLaunch(target);
                }}
                className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-98"
              >
                <span>🚗 YES, ENGINE STARTED — OPEN CAMERA</span>
              </button>
              <button
                type="button"
                onClick={() => setPendingMeterTarget(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-[11px] font-bold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= PROCESSING & STAMPING OVERLAY ================= */}
      {isProcessingPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-xs text-white space-y-3">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-sm font-black">Stamping Verification Frame & Watermark...</p>
          <p className="text-xs text-slate-400 font-mono">Adding Live GPS Coordinates & Anti-Tamper Stamp</p>
        </div>
      )}

      {/* ================= HIDDEN NATIVE CAMERA FILE INPUT ================= */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleNativeCameraCapture}
        className="hidden"
      />
    </div>
  );
};
