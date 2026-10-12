export interface ExamplePhotoGuide {
  id: string;
  title: string;
  description: string;
  exampleImageSvg: string; // fallback SVG diagram
  realPhotoPath?: string;  // official real photo in /sample-photos/
  fileName?: string;       // exact expected filename, e.g. "engine_oil_dipstick.jpg"
  instructions: string[];
  slots?: Record<number, { title: string; hint: string; fileName: string; realPhotoPath?: string }>;
}

// Crisp, lightweight standalone inline SVGs formatted as Data URIs for offline instant loading
const createSvgDataUri = (svgContent: string): string => {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
};

// 1. Engine Oil Dipstick
const engineOilSvg = createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#0f172a"/>
  <!-- Engine Bay Background Tone -->
  <rect x="20" y="20" width="360" height="200" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="35" y="45" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold">SAMPLE GUIDE: ENGINE OIL DIPSTICK</text>
  
  <!-- Dipstick Blade -->
  <rect x="185" y="55" width="30" height="140" rx="4" fill="#94a3b8" stroke="#cbd5e1" stroke-width="2"/>
  
  <!-- Hash marks / Crosshatch area -->
  <rect x="190" y="95" width="20" height="80" fill="#64748b" opacity="0.3"/>
  <line x1="190" y1="100" x2="210" y2="100" stroke="#f1f5f9" stroke-width="2"/>
  <text x="218" y="104" fill="#4ade80" font-family="monospace" font-size="11" font-weight="bold">MAX</text>
  
  <line x1="190" y1="165" x2="210" y2="165" stroke="#f1f5f9" stroke-width="2"/>
  <text x="218" y="169" fill="#f87171" font-family="monospace" font-size="11" font-weight="bold">MIN</text>
  
  <!-- Amber Oil Film -->
  <rect x="187" y="115" width="26" height="60" rx="2" fill="#d97706" opacity="0.85"/>
  <line x1="187" y1="115" x2="213" y2="115" stroke="#fbbf24" stroke-width="3"/>
  <text x="95" y="120" fill="#fbbf24" font-family="sans-serif" font-size="11" font-weight="bold">OIL LEVEL LINE ►</text>
  
  <!-- Focus Box & Flashlight Banner -->
  <rect x="50" y="75" width="300" height="115" rx="8" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="6,4"/>
  <circle x="70" y="195" r="5" fill="#f59e0b"/>
  <text x="82" y="198" fill="#f59e0b" font-family="sans-serif" font-size="10" font-weight="bold">⚡ USE FLASHLIGHT FOR CLEAR OIL LINE</text>
</svg>
`);

// 2. Tyres & Tread
const tireSvg = createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#0f172a"/>
  <rect x="20" y="20" width="360" height="200" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="35" y="45" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold">SAMPLE GUIDE: TYRE &amp; TREAD DEPTH</text>
  
  <!-- Heavy Duty Tyre -->
  <circle cx="200" cy="130" r="70" fill="#0f172a" stroke="#475569" stroke-width="14"/>
  <!-- Rim & Lug nuts -->
  <circle cx="200" cy="130" r="42" fill="#334155" stroke="#94a3b8" stroke-width="3"/>
  <circle cx="200" cy="130" r="16" fill="#1e293b"/>
  <!-- 6 Lug nuts -->
  <circle cx="200" cy="100" r="4" fill="#fbbf24"/>
  <circle cx="226" cy="115" r="4" fill="#fbbf24"/>
  <circle cx="226" cy="145" r="4" fill="#fbbf24"/>
  <circle cx="200" cy="160" r="4" fill="#fbbf24"/>
  <circle cx="174" cy="145" r="4" fill="#fbbf24"/>
  <circle cx="174" cy="115" r="4" fill="#fbbf24"/>
  
  <!-- Tread Groove Highlight -->
  <path d="M 190 53 Q 200 48 210 53" stroke="#22c55e" stroke-width="4" fill="none"/>
  <text x="140" y="38" fill="#22c55e" font-family="sans-serif" font-size="10" font-weight="bold">▲ TREAD DEPTH &gt; 1.6mm</text>
  <text x="250" y="134" fill="#fbbf24" font-family="sans-serif" font-size="10" font-weight="bold">◄ LUG NUTS OK</text>
  
  <!-- Focus Box -->
  <rect x="110" y="50" width="180" height="160" rx="8" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="95" y="210" fill="#f59e0b" font-family="sans-serif" font-size="10" font-weight="bold">⚡ USE FLASHLIGHT UNDER WHEEL ARCH</text>
</svg>
`);

// 3. Radiator & Coolant Tank
const coolantSvg = createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#0f172a"/>
  <rect x="20" y="20" width="360" height="200" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="35" y="45" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold">SAMPLE GUIDE: RADIATOR &amp; COOLANT TANK</text>
  
  <!-- Radiator Core -->
  <rect x="70" y="70" width="120" height="120" rx="6" fill="#1e293b" stroke="#475569" stroke-width="3"/>
  <line x1="80" y1="90" x2="180" y2="90" stroke="#334155" stroke-width="2"/>
  <line x1="80" y1="110" x2="180" y2="110" stroke="#334155" stroke-width="2"/>
  <line x1="80" y1="130" x2="180" y2="130" stroke="#334155" stroke-width="2"/>
  <line x1="80" y1="150" x2="180" y2="150" stroke="#334155" stroke-width="2"/>
  <rect x="110" y="58" width="40" height="14" rx="3" fill="#e2e8f0" stroke="#64748b" stroke-width="2"/>
  <text x="95" y="52" fill="#94a3b8" font-family="sans-serif" font-size="9" font-weight="bold">CAP SEALED</text>
  
  <!-- Coolant Expansion Reservoir Tank -->
  <rect x="230" y="80" width="80" height="105" rx="10" fill="#334155" stroke="#cbd5e1" stroke-width="2"/>
  <!-- Coolant Liquid (Greenish-Cyan) -->
  <path d="M 232 125 L 308 125 L 308 175 Q 308 183 298 183 L 242 183 Q 232 183 232 175 Z" fill="#10b981" opacity="0.85"/>
  <line x1="225" y1="110" x2="235" y2="110" stroke="#f87171" stroke-width="2"/>
  <text x="200" y="113" fill="#f87171" font-family="monospace" font-size="10" font-weight="bold">MAX</text>
  <line x1="225" y1="150" x2="235" y2="150" stroke="#fbbf24" stroke-width="2"/>
  <text x="200" y="153" fill="#fbbf24" font-family="monospace" font-size="10" font-weight="bold">MIN</text>
  
  <!-- Focus Box -->
  <rect x="55" y="50" width="280" height="150" rx="8" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="95" y="215" fill="#f59e0b" font-family="sans-serif" font-size="10" font-weight="bold">⚡ USE FLASHLIGHT BEHIND TRANSLUCENT TANK</text>
</svg>
`);

// 4. Diesel Fuel Tank & Cap
const dieselSvg = createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#0f172a"/>
  <rect x="20" y="20" width="360" height="200" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="35" y="45" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold">SAMPLE GUIDE: DIESEL TANK &amp; FILLER CAP</text>
  
  <!-- Cylindrical Fuel Tank Body -->
  <rect x="80" y="90" width="240" height="85" rx="18" fill="#334155" stroke="#64748b" stroke-width="3"/>
  <line x1="140" y1="90" x2="140" y2="175" stroke="#1e293b" stroke-width="6"/>
  <line x1="260" y1="90" x2="260" y2="175" stroke="#1e293b" stroke-width="6"/>
  
  <!-- Filler Neck & Green Cap -->
  <rect x="180" y="70" width="40" height="22" fill="#475569" stroke="#94a3b8" stroke-width="2"/>
  <rect x="175" y="58" width="50" height="16" rx="4" fill="#15803d" stroke="#4ade80" stroke-width="2"/>
  <text x="186" y="70" fill="#ffffff" font-family="sans-serif" font-size="9" font-weight="bold">DIESEL</text>
  
  <!-- Lock Symbol -->
  <circle cx="200" cy="80" r="4" fill="#fbbf24"/>
  <path d="M 197 78 L 197 75 Q 200 72 203 75 L 203 78" stroke="#fbbf24" stroke-width="2" fill="none"/>
  <text x="235" y="68" fill="#4ade80" font-family="sans-serif" font-size="10" font-weight="bold">◄ LOCKED CAP</text>
  
  <!-- Focus Box -->
  <rect x="150" y="50" width="160" height="120" rx="8" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="85" y="205" fill="#f59e0b" font-family="sans-serif" font-size="10" font-weight="bold">⚡ USE FLASHLIGHT ON CAP TO CHECK FOR LEAKS</text>
</svg>
`);

// 5. Dashboard Meter & Odometer
const dashboardSvg = createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#0f172a"/>
  <rect x="20" y="20" width="360" height="200" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="35" y="45" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold">SAMPLE GUIDE: METER &amp; ODOMETER (KEY ON)</text>
  
  <!-- Cluster Housing -->
  <rect x="60" y="65" width="280" height="115" rx="16" fill="#0f172a" stroke="#475569" stroke-width="3"/>
  
  <!-- Speedometer & Tachometer Dials -->
  <circle cx="120" cy="120" r="38" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
  <line x1="120" y1="120" x2="105" y2="100" stroke="#f87171" stroke-width="2"/>
  <text x="105" y="138" fill="#94a3b8" font-family="sans-serif" font-size="8">km/h</text>
  
  <circle cx="280" cy="120" r="38" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
  <line x1="280" y1="120" x2="295" y2="105" stroke="#f87171" stroke-width="2"/>
  <text x="268" y="138" fill="#94a3b8" font-family="sans-serif" font-size="8">RPM x100</text>
  
  <!-- Digital Center Odometer Box -->
  <rect x="170" y="100" width="60" height="30" rx="4" fill="#020617" stroke="#22c55e" stroke-width="1.5"/>
  <text x="176" y="120" fill="#22c55e" font-family="monospace" font-size="11" font-weight="bold">128450</text>
  <text x="178" y="93" fill="#38bdf8" font-family="sans-serif" font-size="9" font-weight="bold">ODOMETER</text>
  
  <!-- Warning Lamps: All Normal (Off) -->
  <circle cx="180" cy="145" r="4" fill="#1e293b" stroke="#64748b"/>
  <circle cx="200" cy="145" r="4" fill="#1e293b" stroke="#64748b"/>
  <circle cx="220" cy="145" r="4" fill="#1e293b" stroke="#64748b"/>
  <text x="165" y="160" fill="#94a3b8" font-family="sans-serif" font-size="8">LAMPS OFF</text>
  
  <!-- Focus Box -->
  <rect x="50" y="55" width="300" height="135" rx="10" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="80" y="210" fill="#f59e0b" font-family="sans-serif" font-size="10" font-weight="bold">⚡ ENGINE STARTED • ODOMETER MUST BE READABLE</text>
</svg>
`);

// 6. Brake System Reservoir
const brakeSvg = createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#0f172a"/>
  <rect x="20" y="20" width="360" height="200" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="35" y="45" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold">SAMPLE GUIDE: BRAKE FLUID RESERVOIR</text>
  
  <rect x="150" y="80" width="100" height="85" rx="8" fill="#334155" stroke="#cbd5e1" stroke-width="2"/>
  <rect x="180" y="65" width="40" height="18" rx="4" fill="#1e293b" stroke="#94a3b8" stroke-width="2"/>
  
  <!-- Fluid line -->
  <rect x="152" y="110" width="96" height="53" fill="#eab308" opacity="0.6"/>
  <line x1="140" y1="102" x2="152" y2="102" stroke="#4ade80" stroke-width="2"/>
  <text x="115" y="105" fill="#4ade80" font-family="monospace" font-size="10" font-weight="bold">MAX</text>
  
  <line x1="140" y1="142" x2="152" y2="142" stroke="#f87171" stroke-width="2"/>
  <text x="115" y="145" fill="#f87171" font-family="monospace" font-size="10" font-weight="bold">MIN</text>
  
  <rect x="100" y="60" width="200" height="130" rx="8" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="95" y="205" fill="#f59e0b" font-family="sans-serif" font-size="10" font-weight="bold">⚡ USE FLASHLIGHT TO ILLUMINATE MIN/MAX LEVEL</text>
</svg>
`);

// 7. Steering Handling Fluid
const steeringSvg = createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#0f172a"/>
  <rect x="20" y="20" width="360" height="200" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="35" y="45" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold">SAMPLE GUIDE: POWER STEERING RESERVOIR</text>
  <rect x="160" y="85" width="80" height="85" rx="12" fill="#334155" stroke="#cbd5e1" stroke-width="2"/>
  <circle cx="200" cy="75" r="18" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
  <text x="188" y="78" fill="#f59e0b" font-family="sans-serif" font-size="8" font-weight="bold">STEER</text>
  <rect x="162" y="115" width="76" height="53" fill="#dc2626" opacity="0.6"/>
  <rect x="120" y="60" width="160" height="130" rx="8" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="95" y="205" fill="#f59e0b" font-family="sans-serif" font-size="10" font-weight="bold">⚡ USE FLASHLIGHT FOR FLUID CLARITY</text>
</svg>
`);

// 8. Vehicle Body & Cabin
const bodySvg = createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#0f172a"/>
  <rect x="20" y="20" width="360" height="200" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="35" y="45" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold">SAMPLE GUIDE: BODY &amp; CARGO DOORS</text>
  <!-- Truck Body Silhouette -->
  <rect x="60" y="75" width="190" height="95" rx="4" fill="#334155" stroke="#64748b" stroke-width="2"/>
  <rect x="250" y="95" width="70" height="75" rx="6" fill="#1e293b" stroke="#64748b" stroke-width="2"/>
  <circle cx="110" cy="175" r="14" fill="#0f172a" stroke="#64748b" stroke-width="3"/>
  <circle cx="280" cy="175" r="14" fill="#0f172a" stroke="#64748b" stroke-width="3"/>
  <rect x="50" y="65" width="280" height="125" rx="8" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="95" y="205" fill="#f59e0b" font-family="sans-serif" font-size="10" font-weight="bold">⚡ VERIFY CARGO SHUTTER LATCHES LOCKED</text>
</svg>
`);

// 9. Lights & Indicators
const lightsSvg = createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#0f172a"/>
  <rect x="20" y="20" width="360" height="200" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="35" y="45" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold">SAMPLE GUIDE: HEADLIGHTS &amp; SIGNALS</text>
  <rect x="90" y="80" width="220" height="85" rx="12" fill="#1e293b" stroke="#475569" stroke-width="2"/>
  <!-- Headlights illuminated -->
  <circle cx="120" cy="115" r="16" fill="#fef08a" stroke="#facc15" stroke-width="3"/>
  <circle cx="280" cy="115" r="16" fill="#fef08a" stroke="#facc15" stroke-width="3"/>
  <!-- Turn Signals flashing -->
  <rect x="95" y="135" width="25" height="12" rx="3" fill="#f97316"/>
  <rect x="280" y="135" width="25" height="12" rx="3" fill="#f97316"/>
  <rect x="75" y="65" width="250" height="120" rx="8" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="110" y="205" fill="#f59e0b" font-family="sans-serif" font-size="10" font-weight="bold">⚡ TURN ON HEADLIGHTS &amp; HAZARD SIGNALS</text>
</svg>
`);

// 10. Emergency Safety Equipment
const emergencySvg = createSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
  <rect width="400" height="240" fill="#0f172a"/>
  <rect x="20" y="20" width="360" height="200" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="35" y="45" fill="#38bdf8" font-family="sans-serif" font-size="12" font-weight="bold">SAMPLE GUIDE: FIRE EXTINGUISHER &amp; KIT</text>
  <!-- Extinguisher Body -->
  <rect x="130" y="85" width="45" height="85" rx="10" fill="#dc2626" stroke="#991b1b" stroke-width="2"/>
  <circle cx="152" cy="72" r="8" fill="#e2e8f0"/>
  <rect x="145" y="115" width="15" height="15" rx="3" fill="#ffffff"/>
  <circle cx="152" cy="122" r="5" fill="#22c55e"/>
  <text x="110" y="185" fill="#22c55e" font-family="sans-serif" font-size="9" font-weight="bold">GAUGE IN GREEN</text>
  <!-- Triangle -->
  <polygon points="250,85 285,155 215,155" fill="none" stroke="#f97316" stroke-width="8"/>
  <rect x="90" y="60" width="220" height="135" rx="8" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="85" y="210" fill="#f59e0b" font-family="sans-serif" font-size="10" font-weight="bold">⚡ USE FLASHLIGHT ON PRESSURE GAUGE</text>
</svg>
`);

export const CHECKPOINT_EXAMPLES: Record<string, ExamplePhotoGuide> = {
  fluids_powertrain: {
    id: 'fluids_powertrain',
    title: 'Engine Oil Dipstick Level',
    description: 'Pull dipstick, wipe, re-insert, check level.',
    exampleImageSvg: engineOilSvg,
    fileName: 'engine_oil_dipstick.jpg',
    realPhotoPath: '/sample-photos/engine_oil_dipstick.jpg',
    instructions: [
      '⚡ Turn ON flashlight',
      'Oil level between MIN and MAX',
    ],
  },
  tires_wheels: {
    id: 'tires_wheels',
    title: 'Tyre & Wheel Assembly',
    description: 'Check tread depth, sidewall, rim, and wheel nuts.',
    exampleImageSvg: tireSvg,
    fileName: 'front_left_tyre.jpg',
    realPhotoPath: '/sample-photos/front_left_tyre.jpg',
    instructions: [
      '⚡ Turn ON flashlight',
      'Clear tread grooves & all nuts present',
    ],
    slots: {
      0: {
        title: 'Front-Left Tyre',
        hint: 'Front-Left tread, sidewall, and nuts',
        fileName: 'front_left_tyre.jpg',
        realPhotoPath: '/sample-photos/front_left_tyre.jpg',
      },
      1: {
        title: 'Front-Right Tyre',
        hint: 'Front-Right tread, sidewall, and nuts',
        fileName: 'front_right_tyre.jpg',
        realPhotoPath: '/sample-photos/front_right_tyre.jpg',
      },
      2: {
        title: 'Rear-Left Tyre',
        hint: 'Rear-Left wheel, sidewall, and tread',
        fileName: 'rear_left_tyre.jpg',
        realPhotoPath: '/sample-photos/rear_left_tyre.jpg',
      },
      3: {
        title: 'Rear-Right Tyre',
        hint: 'Rear-Right wheel, sidewall, and tread',
        fileName: 'rear_right_tyre.jpg',
        realPhotoPath: '/sample-photos/rear_right_tyre.jpg',
      },
      4: {
        title: 'Spare Tyre',
        hint: 'Spare tyre tread and bracket',
        fileName: 'spare_tyre.jpg',
        realPhotoPath: '/sample-photos/spare_tyre.jpg',
      },
    },
  },
  radiator_coolant: {
    id: 'radiator_coolant',
    title: 'Radiator & Coolant Level',
    description: 'Check coolant level and sealed cap.',
    exampleImageSvg: coolantSvg,
    fileName: 'radiator_coolant.jpg',
    realPhotoPath: '/sample-photos/radiator_coolant.jpg',
    instructions: [
      '⚡ Turn ON flashlight',
      'Coolant between MIN and MAX',
    ],
  },
  diesel_fuel_cap: {
    id: 'diesel_fuel_cap',
    title: 'Diesel Fuel Tank & Filler Cap',
    description: 'Check tank neck, lock cap, and no leaks.',
    exampleImageSvg: dieselSvg,
    fileName: 'diesel_fuel_cap.jpg',
    realPhotoPath: '/sample-photos/diesel_fuel_cap.jpg',
    instructions: [
      '⚡ Turn ON flashlight',
      'Cap locked tight & zero fuel leak',
    ],
  },
  dashboard_warnings: {
    id: 'dashboard_warnings',
    title: 'Meter Cluster & Odometer',
    description: 'Start vehicle engine, then take photo.',
    exampleImageSvg: dashboardSvg,
    fileName: 'dashboard_cluster_odometer.jpg',
    realPhotoPath: '/sample-photos/dashboard_cluster_odometer.jpg',
    instructions: [
      '🔑 Start engine FIRST (Truck running)',
      '⚡ Turn ON flashlight (Sharp odometer)',
    ],
  },
  brake_system: {
    id: 'brake_system',
    title: 'Brake Fluid Reservoir',
    description: 'Check brake fluid reservoir level.',
    exampleImageSvg: brakeSvg,
    fileName: 'brake_fluid_reservoir.jpg',
    realPhotoPath: '/sample-photos/brake_fluid_reservoir.jpg',
    instructions: [
      '⚡ Turn ON flashlight',
      'Fluid level between MIN and MAX',
    ],
  },
  steering_handling: {
    id: 'steering_handling',
    title: 'Power Steering Fluid',
    description: 'Check power steering fluid and hoses.',
    exampleImageSvg: steeringSvg,
    fileName: 'steering_fluid_reservoir.jpg',
    realPhotoPath: '/sample-photos/steering_fluid_reservoir.jpg',
    instructions: [
      '⚡ Turn ON flashlight',
      'Fluid level in normal zone',
    ],
  },
  body_passenger_doors: {
    id: 'body_passenger_doors',
    title: 'Body, Cabin & Cargo Latches',
    description: 'Check cargo doors, locks, curtains, stickers.',
    exampleImageSvg: bodySvg,
    fileName: 'cargo_rear_shutter.jpg',
    realPhotoPath: '/sample-photos/cargo_rear_shutter.jpg',
    instructions: [
      '⚡ Turn ON flashlight',
      'All doors & latches secured',
    ],
    slots: {
      0: {
        title: 'Front View',
        hint: 'Cabin front, windshield, bumper',
        fileName: 'vehicle_front_view.jpg',
        realPhotoPath: '/sample-photos/vehicle_front_view.jpg',
      },
      1: {
        title: 'Rear View',
        hint: 'Rear cargo doors and locks',
        fileName: 'vehicle_rear_view.jpg',
        realPhotoPath: '/sample-photos/vehicle_rear_view.jpg',
      },
      2: {
        title: 'Left Side View',
        hint: 'Left cargo side and reflectors',
        fileName: 'vehicle_left_side.jpg',
        realPhotoPath: '/sample-photos/vehicle_left_side.jpg',
      },
      3: {
        title: 'Right Side View',
        hint: 'Right cargo side and reflectors',
        fileName: 'vehicle_right_side.jpg',
        realPhotoPath: '/sample-photos/vehicle_right_side.jpg',
      },
    },
  },
  lights_indicators: {
    id: 'lights_indicators',
    title: 'Vehicle Lighting & Signals',
    description: 'Turn on headlights and hazard flashers.',
    exampleImageSvg: lightsSvg,
    fileName: 'headlights_illuminated.jpg',
    realPhotoPath: '/sample-photos/headlights_illuminated.jpg',
    instructions: [
      'Turn lights & hazard signals ON',
      'Bright lamps & clear lenses',
    ],
  },
  emergency_equipment: {
    id: 'emergency_equipment',
    title: 'Fire Extinguisher & Safety Kit',
    description: 'Check extinguisher gauge, triangle, kit.',
    exampleImageSvg: emergencySvg,
    fileName: 'fire_extinguisher_kit.jpg',
    realPhotoPath: '/sample-photos/fire_extinguisher_kit.jpg',
    instructions: [
      '⚡ Turn ON flashlight on gauge',
      'Needle in GREEN zone with pin',
    ],
  },
};
