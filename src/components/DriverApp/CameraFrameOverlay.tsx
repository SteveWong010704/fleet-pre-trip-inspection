import React, { useState } from 'react';
import { Eye, EyeOff, Zap } from 'lucide-react';

interface Props {
  itemId?: string;
  slotIndex?: number;
  slotName?: string;
  isDefect?: boolean;
  vehicleBrand?: string;
  vehicleModel?: string;
  torchActive?: boolean;
}

export const CameraFrameOverlay: React.FC<Props> = ({
  itemId = '',
  slotIndex,
  slotName = '',
  isDefect = false,
  torchActive = false,
}) => {
  const [showGuide, setShowGuide] = useState<boolean>(true);

  const cleanId = (itemId || '').toLowerCase();
  const cleanSlot = (slotName || '').toLowerCase();

  // Determine short concise hint
  let shortHint = 'Center target inside frame • Keep close for high clarity';

  if (isDefect) {
    shortHint = 'Defect focus • Align problem area inside frame';
  } else if (cleanId === 'tires_wheels') {
    if (cleanSlot.includes('left') || slotIndex === 0) {
      shortHint = 'Front-Left Tyre • Fit close in frame';
    } else if (cleanSlot.includes('right') || slotIndex === 1) {
      shortHint = 'Front-Right Tyre • Fit close in frame';
    } else if (cleanSlot.includes('spare') || slotIndex === 4) {
      shortHint = 'Spare Tyre • Fit wheel in frame';
    } else {
      shortHint = 'Tyre & Tread • Fit close in frame';
    }
  } else if (cleanId === 'fluids_powertrain') {
    shortHint = 'Engine Oil: Align dipstick oil level in frame';
  } else if (cleanId === 'radiator_coolant') {
    shortHint = 'Radiator & Coolant • Align core & reservoir in frame';
  } else if (cleanId === 'diesel_fuel_cap') {
    shortHint = 'Diesel Tank & Cap • Keep close, align cap in frame';
  } else if (cleanId === 'dashboard_warnings') {
    shortHint = 'Key ON / Engine Started • Align meter & warning lamps';
  } else if (cleanId === 'body_passenger_doors') {
    shortHint = 'Lorry body • Keep close in frame';
  } else if (cleanId === 'brake_system') {
    shortHint = 'Brake Fluid • Align reservoir MIN/MAX in frame';
  } else if (cleanId === 'steering_handling') {
    shortHint = 'Steering Fluid • Align reservoir in frame';
  }

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar with Flashlight Indicator & Guide Toggle */}
      <div className="pt-2 px-3 flex items-center justify-between w-full">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-emerald-400/40 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-black tracking-wider text-emerald-300 font-mono uppercase">
              VIEWFINDER
            </span>
          </div>

          {/* Flashlight status pill for early morning / dawn inspection */}
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-md border shadow-sm ${
              torchActive
                ? 'bg-amber-500/80 border-amber-300 text-slate-950 font-black'
                : 'bg-black/60 border-amber-400/40 text-amber-300'
            }`}
          >
            <Zap className={`w-3 h-3 ${torchActive ? 'fill-current text-slate-950' : 'text-amber-400'}`} />
            <span>{torchActive ? 'FLASHLIGHT ON' : 'DAWN INSPECTION'}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowGuide(!showGuide)}
          className="pointer-events-auto p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white/80 hover:text-white border border-white/20 backdrop-blur-md transition cursor-pointer"
          title={showGuide ? 'Hide guideline' : 'Show guideline'}
        >
          {showGuide ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-white/50" />}
        </button>
      </div>

      {/* Large Center Frame: NO ugly internal drawings, clean wide viewfinder box covering ~88% of screen */}
      {showGuide && (
        <div className="relative flex-1 w-full flex items-center justify-center p-3">
          <div className="relative w-[90%] h-[85%] max-w-[420px] max-h-[380px] rounded-2xl border-2 border-dashed border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)] flex items-center justify-center">
            {/* 4 Prominent High-Visibility Corner Brackets */}
            {/* Top-Left */}
            <div className="absolute -top-[2px] -left-[2px] w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            {/* Top-Right */}
            <div className="absolute -top-[2px] -right-[2px] w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            {/* Bottom-Left */}
            <div className="absolute -bottom-[2px] -left-[2px] w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            {/* Bottom-Right */}
            <div className="absolute -bottom-[2px] -right-[2px] w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]" />

            {/* Clean Center Crosshair (+) */}
            <div className="relative w-6 h-6 flex items-center justify-center opacity-60">
              <div className="absolute w-full h-[1.5px] bg-white" />
              <div className="absolute h-full w-[1.5px] bg-white" />
            </div>

            {/* Target Slot Tag Inside Frame (Subtle) */}
            {slotName && (
              <div className="absolute top-2 left-3 bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded text-[10px] font-bold text-white/90 font-mono tracking-wide">
                TARGET: {slotName}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Guidance Instruction Pill */}
      {showGuide && (
        <div className="pb-3 px-3 flex flex-col items-center gap-1 w-full">
          <div className="bg-black/85 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20 shadow-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-xs font-black text-white tracking-wide font-sans text-center">
              {shortHint}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
