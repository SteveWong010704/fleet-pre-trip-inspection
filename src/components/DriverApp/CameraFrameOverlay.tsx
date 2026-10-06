import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  itemId?: string;
  slotIndex?: number;
  slotName?: string;
  isDefect?: boolean;
  vehicleBrand?: string;
  vehicleModel?: string;
}

export const CameraFrameOverlay: React.FC<Props> = ({
  itemId = '',
  slotIndex,
  slotName = '',
  isDefect = false,
  vehicleBrand = '',
  vehicleModel = '',
}) => {
  const [showGuide, setShowGuide] = useState<boolean>(true);

  const cleanId = (itemId || '').toLowerCase();
  const cleanSlot = (slotName || '').toLowerCase();
  const brand = (vehicleBrand || '').toUpperCase();
  const model = (vehicleModel || '').toUpperCase();

  // Detect specific truck family from fleet database
  const isHino = brand.includes('HINO') || model.includes('XZU') || model.includes('GDY') || model.includes('WU302');
  const isIsuzu = brand.includes('ISUZU') || model.includes('NKR');
  const isFuso = brand.includes('FUSO') || model.includes('CANTER') || model.includes('FE71');
  const isDaihatsu = brand.includes('DAIHATSU') || model.includes('DELTA') || model.includes('V58');

  // Detect wheel size (15" on GDY231 vs 16"/17.5" on XZU600)
  const is15Inch = model.includes('GDY') || model.includes('195/75R15');

  // Determine frame type
  type FrameType = 'tyre' | 'spare_tyre' | 'body_front' | 'body_rear' | 'body_side' | 'dipstick' | 'diesel_tank' | 'dashboard' | 'simple_box' | 'generic';
  let frameType: FrameType = 'generic';
  let shortHint = 'Align inside frame';
  let modelBadge = isHino ? 'HINO 300/200' : isIsuzu ? 'ISUZU ELF/NKR' : isFuso ? 'FUSO CANTER' : isDaihatsu ? 'DAIHATSU DELTA' : 'COMMERCIAL TRUCK';

  const isSpare = slotIndex === 4 || cleanSlot.includes('spare') || cleanSlot.includes('underbody');

  if (isDefect) {
    frameType = 'generic';
    shortHint = 'Focus on defect';
  } else if (cleanId === 'tires_wheels') {
    if (isSpare) {
      frameType = 'spare_tyre';
      shortHint = 'Crouch down & aim spare tyre';
    } else {
      frameType = 'tyre';
      shortHint = is15Inch ? '15" Wheel • Fit in circle' : '16"/17.5" Wheel • Fit in circle';
    }
  } else if (cleanId === 'diesel_fuel_cap') {
    // Tank + Cap Frame (Framing entire fuel tank and locked cap)
    frameType = 'diesel_tank';
    shortHint = 'Fit fuel tank & cap in frame';
  } else if (cleanId === 'body_passenger_doors') {
    if (cleanSlot.includes('front') || slotIndex === 0) {
      frameType = 'body_front';
      shortHint = 'Step back, fit front cabin';
    } else if (cleanSlot.includes('rear') || slotIndex === 1) {
      frameType = 'body_rear';
      shortHint = 'Step back, fit box van rear';
    } else {
      frameType = 'body_side';
      shortHint = 'Step back, fit whole lorry';
    }
  } else if (cleanId === 'fluids_powertrain') {
    frameType = 'dipstick';
    shortHint = 'Dipstick: MIN / MAX';
  } else if (cleanId === 'dashboard_warnings') {
    frameType = 'dashboard';
    shortHint = 'Key ON, show dashboard';
  } else if (cleanId === 'radiator_coolant' || cleanId === 'brake_system' || cleanId === 'steering_handling') {
    // Clean, simple focus frame for Brake, Steering, Radiator
    frameType = 'simple_box';
    shortHint = 'Fit tank in frame';
  }

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar with Truck Model Tag & Guideline Toggle */}
      <div className="pt-2 px-3 flex items-center justify-between w-full">
        {/* Model-Specific Blueprint Pill */}
        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-emerald-400/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-black tracking-wider text-emerald-300 font-mono">
            CAD • {modelBadge}
          </span>
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

      {/* Center High-Precision Industrial CAD Wireframe Overlay */}
      {showGuide && (
        <div className="relative flex-1 w-full flex items-center justify-center p-3">
          <svg
            className="w-full h-full max-w-[340px] max-h-[340px] overflow-visible drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]"
            viewBox="0 0 320 320"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* 4 Corner Outer Viewfinder Brackets */}
            <path d="M 20 45 L 20 20 L 45 20" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 300 45 L 300 20 L 275 20" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 20 275 L 20 300 L 45 300" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 300 275 L 300 300 L 275 300" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />

            {/* ============================================================== */}
            {/* 1. FRONT CABIN: EXACT BLUEPRINT ACCORDING TO BRAND/MODEL      */}
            {/* ============================================================== */}
            {frameType === 'body_front' && (
              <g stroke="#ffffff" strokeWidth="1.8" opacity="0.9" strokeLinejoin="round">
                {/* Roof Contour & Wind Deflector (Aerofoil for Box Van) */}
                <path d="M 65 55 Q 160 46 255 55 L 265 95 L 55 95 Z" stroke="#34d399" strokeWidth="2" strokeDasharray="6 4" />

                {/* Main Cabin Frame */}
                <path d="M 68 95 L 52 235 L 268 235 L 252 95 Z" strokeWidth="2" />

                {/* Large Front Windshield */}
                <path d="M 75 102 L 64 165 L 256 165 L 245 102 Q 160 98 75 102 Z" stroke="#38bdf8" strokeWidth="1.8" strokeDasharray="8 4" />

                {/* Wiper Base Line */}
                <line x1="68" y1="172" x2="252" y2="172" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />

                {/* BRAND SPECIFIC FRONT GRILLE & LIGHTS */}
                {isHino && (
                  <g stroke="#34d399">
                    <path d="M 110 182 L 210 182 L 198 220 L 122 220 Z" strokeWidth="2" />
                    <line x1="116" y1="195" x2="204" y2="195" strokeWidth="1.5" strokeDasharray="4 2" />
                    <line x1="120" y1="208" x2="200" y2="208" strokeWidth="1.5" strokeDasharray="4 2" />
                    <rect x="58" y="195" width="22" height="38" rx="3" stroke="#f59e0b" strokeWidth="1.8" />
                    <rect x="240" y="195" width="22" height="38" rx="3" stroke="#f59e0b" strokeWidth="1.8" />
                  </g>
                )}

                {isIsuzu && (
                  <g stroke="#34d399">
                    <rect x="105" y="184" width="110" height="32" rx="2" strokeWidth="1.8" />
                    <line x1="105" y1="200" x2="215" y2="200" strokeWidth="1.5" />
                    <line x1="141" y1="184" x2="141" y2="216" strokeWidth="1" strokeDasharray="2 2" />
                    <line x1="178" y1="184" x2="178" y2="216" strokeWidth="1" strokeDasharray="2 2" />
                    <rect x="56" y="190" width="22" height="42" rx="3" stroke="#f59e0b" strokeWidth="1.8" />
                    <line x1="56" y1="210" x2="78" y2="210" stroke="#f59e0b" strokeWidth="1" />
                    <rect x="242" y="190" width="22" height="42" rx="3" stroke="#f59e0b" strokeWidth="1.8" />
                    <line x1="242" y1="210" x2="264" y2="210" stroke="#f59e0b" strokeWidth="1" />
                  </g>
                )}

                {isFuso && (
                  <g stroke="#34d399">
                    <path d="M 98 185 L 160 196 L 222 185 L 215 218 L 105 218 Z" strokeWidth="2" />
                    <polygon points="56,198 84,198 80,225 54,220" stroke="#f59e0b" strokeWidth="1.8" />
                    <polygon points="264,198 236,198 240,225 266,220" stroke="#f59e0b" strokeWidth="1.8" />
                  </g>
                )}

                {!isHino && !isIsuzu && !isFuso && (
                  <g stroke="#34d399">
                    <rect x="100" y="185" width="120" height="30" rx="3" strokeWidth="1.8" />
                    <line x1="100" y1="195" x2="220" y2="195" strokeWidth="1" strokeDasharray="4 2" />
                    <line x1="100" y1="205" x2="220" y2="205" strokeWidth="1" strokeDasharray="4 2" />
                    <rect x="58" y="196" width="22" height="26" rx="2" stroke="#f59e0b" strokeWidth="1.8" />
                    <rect x="240" y="196" width="22" height="26" rx="2" stroke="#f59e0b" strokeWidth="1.8" />
                  </g>
                )}

                {/* Bumper & Plate */}
                <rect x="44" y="235" width="232" height="30" rx="4" stroke="#ffffff" strokeWidth="2" />
                <rect x="120" y="240" width="80" height="20" rx="3" stroke="#f59e0b" strokeWidth="1.8" fill="rgba(245,158,11,0.15)" />
                <rect x="52" y="265" width="24" height="15" rx="3" stroke="#64748b" strokeWidth="1.5" />
                <rect x="244" y="265" width="24" height="15" rx="3" stroke="#64748b" strokeWidth="1.5" />
              </g>
            )}

            {/* ============================================================== */}
            {/* 2. REAR VIEW: EXACT BAKERY ALUMINIUM BOX VAN TWIN DOORS       */}
            {/* ============================================================== */}
            {frameType === 'body_rear' && (
              <g stroke="#ffffff" strokeWidth="1.8" opacity="0.9">
                <rect x="50" y="45" width="220" height="18" rx="2" stroke="#34d399" strokeWidth="2" />
                <circle cx="80" cy="54" r="3" stroke="#f59e0b" strokeWidth="1.5" fill="#f59e0b" />
                <circle cx="160" cy="54" r="3" stroke="#f59e0b" strokeWidth="1.5" fill="#f59e0b" />
                <circle cx="240" cy="54" r="3" stroke="#f59e0b" strokeWidth="1.5" fill="#f59e0b" />

                <rect x="50" y="63" width="220" height="185" strokeWidth="2" />
                <line x1="160" y1="63" x2="160" y2="248" stroke="#38bdf8" strokeWidth="2" />

                <line x1="140" y1="63" x2="140" y2="248" stroke="#34d399" strokeWidth="2" strokeDasharray="16 4" />
                <rect x="135" y="160" width="10" height="18" rx="2" stroke="#f59e0b" strokeWidth="1.5" fill="rgba(245,158,11,0.2)" />

                <line x1="180" y1="63" x2="180" y2="248" stroke="#34d399" strokeWidth="2" strokeDasharray="16 4" />
                <rect x="175" y="160" width="10" height="18" rx="2" stroke="#f59e0b" strokeWidth="1.5" fill="rgba(245,158,11,0.2)" />

                <rect x="47" y="80" width="8" height="14" rx="1" stroke="#38bdf8" strokeWidth="1.5" fill="#38bdf8" />
                <rect x="47" y="215" width="8" height="14" rx="1" stroke="#38bdf8" strokeWidth="1.5" fill="#38bdf8" />
                <rect x="265" y="80" width="8" height="14" rx="1" stroke="#38bdf8" strokeWidth="1.5" fill="#38bdf8" />
                <rect x="265" y="215" width="8" height="14" rx="1" stroke="#38bdf8" strokeWidth="1.5" fill="#38bdf8" />

                <rect x="44" y="248" width="232" height="24" rx="3" stroke="#ffffff" strokeWidth="2" />
                <rect x="52" y="252" width="30" height="16" rx="2" stroke="#ef4444" strokeWidth="1.5" fill="rgba(239,68,68,0.2)" />
                <rect x="238" y="252" width="30" height="16" rx="2" stroke="#ef4444" strokeWidth="1.5" fill="rgba(239,68,68,0.2)" />
                <rect x="125" y="252" width="70" height="16" rx="2" stroke="#f59e0b" strokeWidth="1.5" />
                <rect x="56" y="272" width="26" height="16" rx="3" stroke="#64748b" strokeWidth="1.5" />
                <rect x="238" y="272" width="26" height="16" rx="3" stroke="#64748b" strokeWidth="1.5" />
              </g>
            )}

            {/* ============================================================== */}
            {/* 3. SIDE VIEW: EXACT DELIVERY BOX LORRY PROFILE WITH WIND ROOF */}
            {/* ============================================================== */}
            {frameType === 'body_side' && (
              <g stroke="#ffffff" strokeWidth="1.8" opacity="0.9" strokeLinejoin="round">
                <path d="M 40 195 L 32 125 L 55 85 L 105 85 L 105 195 Z" strokeWidth="2" />
                <path d="M 55 85 Q 85 62 105 58 L 105 85 Z" stroke="#34d399" strokeWidth="1.8" strokeDasharray="4 2" />
                <path d="M 56 94 L 43 125 L 96 125 L 96 94 Z" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="6 3" />

                <rect x="105" y="55" width="180" height="140" rx="3" stroke="#34d399" strokeWidth="2" />
                <line x1="165" y1="55" x2="165" y2="195" stroke="#34d399" strokeWidth="1" strokeDasharray="8 6" opacity="0.6" />
                <line x1="225" y1="55" x2="225" y2="195" stroke="#34d399" strokeWidth="1" strokeDasharray="8 6" opacity="0.6" />

                <line x1="32" y1="195" x2="285" y2="195" strokeWidth="2.5" />
                <rect x="115" y="198" width="45" height="18" rx="2" stroke="#f59e0b" strokeWidth="1.5" fill="rgba(245,158,11,0.15)" />
                <rect x="170" y="198" width="25" height="16" rx="2" stroke="#94a3b8" strokeWidth="1.5" />

                <path d="M 42 195 A 24 24 0 0 1 90 195" strokeWidth="2" />
                <circle cx="66" cy="195" r="22" stroke="#38bdf8" strokeWidth="2" strokeDasharray="6 3" />
                <circle cx="66" cy="195" r="10" stroke="#38bdf8" strokeWidth="1.5" />

                <path d="M 215 195 A 24 24 0 0 1 263 195" strokeWidth="2" />
                <circle cx="239" cy="195" r="22" stroke="#38bdf8" strokeWidth="2" strokeDasharray="6 3" />
                <circle cx="239" cy="195" r="10" stroke="#38bdf8" strokeWidth="1.5" />
              </g>
            )}

            {/* ============================================================== */}
            {/* 4. TYRE & WHEEL: 15"/16"/17.5" LUG-NUT INDUSTRIAL CAD CIRCLE   */}
            {/* ============================================================== */}
            {frameType === 'tyre' && (
              <g stroke="#ffffff">
                <circle cx="160" cy="160" r="110" stroke="#ffffff" strokeWidth="2.5" strokeDasharray="12 6" opacity="0.85" />
                <circle cx="160" cy="160" r="110" stroke="#10b981" strokeWidth="3.5" strokeDasharray="40 133" strokeLinecap="round" />
                <circle cx="160" cy="160" r="70" stroke="#38bdf8" strokeWidth="2" strokeDasharray="6 4" opacity="0.8" />

                <circle cx="160" cy="160" r="40" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
                <circle cx="160" cy="120" r="4.5" fill="#f59e0b" stroke="#f59e0b" />
                <circle cx="198" cy="140" r="4.5" fill="#f59e0b" stroke="#f59e0b" />
                <circle cx="198" cy="180" r="4.5" fill="#f59e0b" stroke="#f59e0b" />
                <circle cx="160" cy="200" r="4.5" fill="#f59e0b" stroke="#f59e0b" />
                <circle cx="122" cy="180" r="4.5" fill="#f59e0b" stroke="#f59e0b" />
                <circle cx="122" cy="140" r="4.5" fill="#f59e0b" stroke="#f59e0b" />

                <circle cx="160" cy="160" r="18" fill="rgba(56,189,248,0.2)" stroke="#38bdf8" strokeWidth="2" />
                <line x1="160" y1="40" x2="160" y2="52" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
                <line x1="160" y1="268" x2="160" y2="280" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
                <line x1="40" y1="160" x2="52" y2="160" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
                <line x1="268" y1="160" x2="280" y2="160" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
              </g>
            )}

            {/* ============================================================== */}
            {/* 5. SPARE TYRE: CHASSIS UNDERBODY WINCH & HANGER                */}
            {/* ============================================================== */}
            {frameType === 'spare_tyre' && (
              <g stroke="#ffffff" opacity="0.9">
                <line x1="30" y1="90" x2="290" y2="90" stroke="#94a3b8" strokeWidth="3" strokeDasharray="8 4" />
                <rect x="135" y="80" width="50" height="18" rx="2" stroke="#f59e0b" strokeWidth="2" fill="rgba(245,158,11,0.2)" />
                <line x1="160" y1="98" x2="160" y2="135" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 2" />

                <ellipse cx="160" cy="180" rx="115" ry="65" stroke="#ffffff" strokeWidth="2.5" strokeDasharray="10 6" />
                <ellipse cx="160" cy="180" rx="65" ry="36" stroke="#38bdf8" strokeWidth="2" strokeDasharray="6 3" />
                <ellipse cx="160" cy="180" rx="22" ry="12" fill="rgba(56,189,248,0.25)" stroke="#38bdf8" strokeWidth="2" />

                <path d="M 35 125 L 35 105 L 60 105" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
                <path d="M 285 125 L 285 105 L 260 105" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
                <path d="M 35 235 L 35 255 L 60 255" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
                <path d="M 285 235 L 285 255 L 260 255" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
              </g>
            )}

            {/* ============================================================== */}
            {/* 6. DIESEL TANK + CAP: WIDE FRAME TO CAPTURE WHOLE TANK & CAP   */}
            {/* ============================================================== */}
            {frameType === 'diesel_tank' && (
              <g stroke="#ffffff" opacity="0.9">
                {/* Horizontal Diesel Fuel Tank Cylinder / Box Profile */}
                <rect x="40" y="85" width="240" height="145" rx="18" stroke="#34d399" strokeWidth="2.5" strokeDasharray="10 6" />
                {/* Tank Mounting Straps (Metal Brackets holding tank to chassis) */}
                <line x1="90" y1="85" x2="90" y2="230" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4 4" opacity="0.7" />
                <line x1="230" y1="85" x2="230" y2="230" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4 4" opacity="0.7" />

                {/* Fuel Cap Marker (Positioned on top-right of the tank) */}
                <circle cx="215" cy="115" r="28" stroke="#38bdf8" strokeWidth="2.5" />
                <circle cx="215" cy="115" r="14" stroke="#f59e0b" strokeWidth="1.8" fill="rgba(245,158,11,0.25)" />
                <line x1="202" y1="115" x2="228" y2="115" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />

                {/* 4 Corner Markers */}
                <path d="M 40 115 L 40 85 L 70 85" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M 280 115 L 280 85 L 250 85" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M 40 200 L 40 230 L 70 230" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M 280 200 L 280 230 L 250 230" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />
              </g>
            )}

            {/* ============================================================== */}
            {/* 7. ENGINE OIL: STEEL DIPSTICK BLADE WITH PRECISE MAX / MIN     */}
            {/* ============================================================== */}
            {frameType === 'dipstick' && (
              <g opacity="0.95">
                {/* Vertical Steel Dipstick Blade */}
                <rect x="148" y="40" width="24" height="230" rx="3" fill="rgba(148,163,184,0.15)" stroke="#94a3b8" strokeWidth="2" />

                {/* Safe Operating Zone (Crosshatched between MAX and MIN) */}
                <rect x="148" y="105" width="24" height="95" fill="rgba(16,185,129,0.25)" stroke="#10b981" strokeWidth="1.5" />
                <line x1="148" y1="125" x2="172" y2="145" stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
                <line x1="148" y1="145" x2="172" y2="165" stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
                <line x1="148" y1="165" x2="172" y2="185" stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />

                {/* Upper Level: MAX Notch Line & Label */}
                <line x1="90" y1="105" x2="230" y2="105" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />
                <circle cx="160" cy="105" r="3.5" fill="#f59e0b" />
                <text x="80" y="109" textAnchor="end" fill="#f59e0b" fontSize="12" fontWeight="black" fontFamily="monospace">
                  MAX
                </text>

                {/* Lower Level: MIN Notch Line & Label */}
                <line x1="90" y1="200" x2="230" y2="200" stroke="#f87171" strokeWidth="2" strokeDasharray="4 3" />
                <circle cx="160" cy="200" r="3.5" fill="#f87171" />
                <text x="80" y="204" textAnchor="end" fill="#f87171" fontSize="12" fontWeight="black" fontFamily="monospace">
                  MIN
                </text>

                {/* Safe Zone Indicator on Right */}
                <text x="180" y="156" fill="#34d399" fontSize="10" fontWeight="black" fontFamily="monospace">
                  ◀ SAFE
                </text>

                {/* Dipstick Tip */}
                <circle cx="160" cy="255" r="5" fill="#64748b" />
              </g>
            )}

            {/* ============================================================== */}
            {/* 8. BRAKE / STEERING / RADIATOR: CLEAN SIMPLE VERSATILE FRAME   */}
            {/* ============================================================== */}
            {frameType === 'simple_box' && (
              <g stroke="#ffffff" opacity="0.85">
                {/* Clean, simple focus frame without forced bottle shape */}
                <rect x="55" y="65" width="210" height="190" rx="16" stroke="#ffffff" strokeWidth="2" strokeDasharray="10 6" />

                {/* 4 Professional Corner Brackets */}
                <path d="M 55 95 L 55 65 L 85 65" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M 265 95 L 265 65 L 235 65" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M 55 225 L 55 255 L 85 255" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M 265 225 L 265 255 L 235 255" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />

                {/* Center subtle crosshair */}
                <circle cx="160" cy="160" r="14" stroke="#10b981" strokeWidth="1.8" opacity="0.7" />
                <line x1="160" y1="150" x2="160" y2="170" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="150" y1="160" x2="170" y2="160" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
              </g>
            )}

            {/* ============================================================== */}
            {/* 9. DASHBOARD: CLUSTER VIEW WITH DUAL METERS                    */}
            {/* ============================================================== */}
            {frameType === 'dashboard' && (
              <g stroke="#ffffff" opacity="0.9">
                <rect x="30" y="75" width="260" height="160" rx="16" stroke="#ffffff" strokeWidth="2" strokeDasharray="12 6" />
                <circle cx="110" cy="155" r="38" stroke="#38bdf8" strokeWidth="1.8" strokeDasharray="6 3" />
                <circle cx="210" cy="155" r="38" stroke="#38bdf8" strokeWidth="1.8" strokeDasharray="6 3" />
                <rect x="135" y="180" width="50" height="22" rx="4" stroke="#f59e0b" strokeWidth="1.8" fill="rgba(245,158,11,0.2)" />
              </g>
            )}

            {/* ============================================================== */}
            {/* 10. GENERIC / DEFECT                                           */}
            {/* ============================================================== */}
            {frameType === 'generic' && (
              <g stroke="#ffffff" opacity="0.85">
                <rect x="55" y="55" width="210" height="210" rx="14" strokeWidth="2" strokeDasharray="8 6" />
                <circle cx="160" cy="160" r="14" stroke="#10b981" strokeWidth="2" opacity="0.7" />
              </g>
            )}
          </svg>
        </div>
      )}

      {/* Bottom Ultra-Short Hint (Elementary English) */}
      {showGuide && (
        <div className="pb-3 px-3 flex justify-center w-full">
          <div className="bg-black/75 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 shadow-md flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-bold text-white tracking-wide font-sans">
              {shortHint}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
