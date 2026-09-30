export type VehicleStatus = 'Ready' | 'Pending Inspection' | 'Grounded';

export type TruckCategory = 'Feeder' | 'Small Truck';

export interface Vehicle {
  no: number;
  vehicleNo: string; // License Plate
  cardNo: string;
  pinNo: string;
  litre: number | string;
  limitRm: number | string;
  area: string;
  branch: string; // Depot code (e.g., KL, KJ, GB, NL, BL, etc.)
  costCenter: string;
  brand: string;
  logoDate?: string;
  advertisement?: string;
  yearOfMade: string | number;
  model: string;
  engineNo: string;
  chassisNo: string;
  registrationDate: string;
  truckCategory: TruckCategory; // 'Feeder' (Big Truck / APAD) or 'Small Truck' (Local)
  tonnage?: number | string;
  capacity: number | string;
  permit: string;
  tyreSize: string;
  batteryType: string;
  ages?: string | number;
  currentStatus: VehicleStatus;
  lastInspectionDate?: string;
  lastInspectionCode?: string;
  lastDriverName?: string;
  currentOdometer?: number;
  assignedRoute?: string;
}

export interface Driver {
  no: number;
  employeeId: string; // e.g. SF7620
  loginId: string;    // e.g. 7620
  password: string;    // e.g. 762001
  name: string;
  designation: string; // SALESMAN, SPV, DRIVER
  depot: string;      // BL, KL, KJ, etc.
  depotName?: string; // BALAKONG, KUALA LUMPUR, etc.
  licenseType: string; // GDL Heavy, Class E, Class D, etc.
  phone: string;
  dateCreated: string;
  status: 'A' | 'I';  // Active, Inactive
  avatarUrl?: string;
  failedAttempts?: number;
  lockedUntil?: string | null;
}

export interface AdminUser {
  username: string; // admin1, admin2, admin3
  name: string;
  role: string;
}

export type CheckStatus = 'Pass' | 'Fail' | 'NA';

export interface InspectionCheckItem {
  id: string;
  code: number;
  category: string;
  title: string;
  subtext: string;
  status: CheckStatus;
  defectNote?: string;
  photoUrl?: string;
  photos?: string[];
  dashboardChecks?: {
    engineLightOff: boolean;
    doubleSignalOk: boolean;
    batteryLightOff: boolean;
    oilLightOff: boolean;
  };
  systemChecks?: Record<string, boolean>;
}

export interface InspectionPhoto {
  url: string;
  itemId?: string;
  itemTitle?: string;
  isDefect?: boolean;
  caption?: string;
  slotIndex?: number;
  slotName?: string;
  timestamp: string;
  gps?: {
    lat: number;
    lng: number;
    accuracy?: number;
    address?: string;
  };
}

export interface InspectionRecord {
  id: string; // e.g. INSP-20260819-0142
  timestamp: string;
  formattedDate: string;
  driverId: string;
  driverName: string;
  driverDesignation: string;
  driverDepot: string;
  vehicleNo: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleBranch: string;
  truckCategory?: TruckCategory;
  route?: string;
  odometer: number;
  fuelLevel: number; // 0 to 100%
  healthDeclaration: boolean;
  overallResult: 'Pass' | 'Fail';
  items: InspectionCheckItem[];
  quickChecks?: Record<string, boolean>;
  safetyEquipment?: { id: string; name: string; required: boolean; present: boolean; conditionOk: boolean; unit: string }[];
  driverDeclaration?: {
    uniformAndLicense: boolean;
    fitAndRested: boolean;
    substanceFree: boolean;
    scheduleAndRestAcknowledged: boolean;
    cargoSafeBDM: boolean;
  };
  defectCount: number;
  defectSummary?: string;
  photos: InspectionPhoto[];
  gpsLocation?: {
    lat: number;
    lng: number;
    accuracy?: number;
    address?: string;
  };
  checkpoints?: any[];
  defects?: any[];
  signature?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  eventType: string;
  operator: string;
  ip: string;
  details: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
}

export interface DepotCompletionItem {
  branch: string;
  total: number;
  inspected: number;
  pending: number;
  passed: number;
  defects: number;
  completionRate: number;
}

export interface FleetStats {
  totalVehicles: number;
  totalFilteredVehicles?: number;
  totalFleet?: number;
  readyVehicles: number;
  pendingVehicles: number;
  groundedVehicles: number;
  totalDrivers: number;
  todayInspections: number;
  inspectedCount?: number;
  todayPassCount: number;
  todayDefectCount: number;
  completionRate?: number;
  selectedDate?: string;
  selectedBranch?: string;
  branchBreakdown?: Record<string, { total: number; ready: number; pending: number; grounded: number }>;
  depotBreakdown?: DepotCompletionItem[];
  pendingVehicleList?: Vehicle[];
}

export const STANDARD_10_POINT_ITEMS: Omit<InspectionCheckItem, 'status' | 'defectNote' | 'photoUrl'>[] = [
  {
    id: 'tires_wheels',
    code: 1,
    category: 'Chassis & Rolling Gear',
    title: 'Tires & Wheels (5 Photos: 4 Tyres + 1 Spare)',
    subtext: 'Mandatory 5 photos: Front-Left, Front-Right, Rear-Left, Rear-Right, and Spare Tyre. Check pressure & tread depth.',
  },
  {
    id: 'brake_system',
    code: 2,
    category: 'Control & Stopping',
    title: 'Brake System (Brake Fluid Level Photo Required)',
    subtext: 'Mandatory photo of brake fluid level reservoir (MIN/MAX). Check foot brake pedal response, air buildup, and parking brake hold.',
  },
  {
    id: 'lights_indicators',
    code: 3,
    category: 'Visibility & Signals',
    title: 'Lights & Indicators',
    subtext: 'Headlights (high/low), brake lights, left/right turn signals, hazard flashers, and reverse buzzer.',
  },
  {
    id: 'steering_handling',
    code: 4,
    category: 'Control & Stopping',
    title: 'Steering & Handling (Power Steering Fluid Photo Required)',
    subtext: 'Mandatory photo of power steering fluid reservoir & level. Verify steering wheel free play and smooth hydraulic response.',
  },
  {
    id: 'radiator_coolant',
    code: 5,
    category: 'Engine & Cooling',
    title: 'Radiator & Coolant Level (Photo Required)',
    subtext: 'Inspect radiator tank, coolant reservoir fluid level, cap condition, hose connections, and check for leaks.',
  },
  {
    id: 'dashboard_warnings',
    code: 6,
    category: 'Instruments & Electronics',
    title: 'Dashboard & Warnings (Cluster Checklist Required)',
    subtext: 'Upload cluster photo, then confirm instrument status: Engine Check light, Double Signal, Battery & Oil lamps.',
    dashboardChecks: {
      engineLightOff: true,
      doubleSignalOk: true,
      batteryLightOff: true,
      oilLightOff: true,
    },
  },
  {
    id: 'emergency_equipment',
    code: 7,
    category: 'Safety & Emergency',
    title: 'Emergency Equipment',
    subtext: 'Fire extinguisher validity and pressure pin, emergency triangle, first aid kit, and seatbelts.',
  },
  {
    id: 'body_passenger_doors',
    code: 8,
    category: 'Cargo & Body (4 Sides Walkaround)',
    title: 'Cargo & Body (4 Photos: Front, Back, Left, Right)',
    subtext: 'Mandatory 4 photos covering all 4 sides of the lorry (Front, Rear, Left, Right). Pinch/zoom camera enabled.',
  },
  {
    id: 'diesel_fuel_cap',
    code: 9,
    category: 'Fuel & Security',
    title: 'Diesel Fuel Tank & Cap (Photo Required)',
    subtext: 'Photo of diesel fuel filler cap and tank seal. Ensure fuel cap is tightly locked, seal intact, and no diesel leakage.',
  },
  {
    id: 'fluids_powertrain',
    code: 10,
    category: 'Engine & Fluids',
    title: 'Engine Oil & Powertrain (Engine Oil Photo Required)',
    subtext: 'Mandatory photo of engine oil dipstick & level. Verify battery terminal condition, transmission, and fluid leaks.',
  },
];

export interface SafetyEquipmentSpec {
  id: string;
  name: string;
  unit: string;
  feederOnly: boolean;
  description: string;
}

export const APAD_SAFETY_EQUIPMENT_SPEC: SafetyEquipmentSpec[] = [
  {
    id: 'fire_extinguisher',
    name: 'Fire Extinguisher',
    unit: '1 unit (9kg for Feeder)',
    feederOnly: false, // Required for both Small Truck & Feeder
    description: 'Dry chemical powder extinguisher with valid inspection tag & pressure needle in green zone.',
  },
  {
    id: 'warning_triangle',
    name: 'Emergency Warning Triangle',
    unit: '1 unit',
    feederOnly: false, // Required for both Small Truck & Feeder
    description: 'Foldable retro-reflective red safety triangle in good working condition.',
  },
  {
    id: 'first_aid_kit',
    name: 'First Aid Kit (Peti Kecemasan)',
    unit: '1 unit',
    feederOnly: true, // Mandatory for Feeder per APAD
    description: 'Standard emergency medical first aid box with valid dressings and antiseptic supplies.',
  },
  {
    id: 'safety_vest',
    name: 'High-Visibility Safety Vest (Jaket Keselamatan)',
    unit: '1 unit',
    feederOnly: true, // Mandatory for Feeder per APAD
    description: 'Fluorescent high-visibility reflective vest for emergency roadside visibility.',
  },
  {
    id: 'flashlight',
    name: 'Heavy-Duty Flashlight (Lampu Suluh)',
    unit: '1 unit',
    feederOnly: true, // Mandatory for Feeder per APAD
    description: 'Handheld inspection torchlight with tested charged batteries.',
  },
  {
    id: 'reflective_string',
    name: '50m Reflective Line (Rentetan Reflektif 50m)',
    unit: '1 unit',
    feederOnly: true, // Mandatory for Feeder per APAD
    description: '50-meter perimeter reflective safety cord / warning ribbon for hazard cordoning.',
  },
  {
    id: 'safety_cones',
    name: 'Safety Warning Cones (Kon Keselamatan)',
    unit: '5 units',
    feederOnly: true, // Mandatory for Feeder per APAD (5 units)
    description: 'Standard 5-unit set of reflective orange traffic safety cones for perimeter marking.',
  },
];

export interface QuickSystemCheckItem {
  id: string;
  group: 'Lights & Signals' | 'Cab & Controls' | 'Drive & Mechanical';
  label: string;
  detail: string;
}

export const APAD_QUICK_SYSTEMS: QuickSystemCheckItem[] = [
  { id: 'light_headlights', group: 'Lights & Signals', label: 'Headlights (High & Low Beam)', detail: 'Both front headlights operational without cracked lenses' },
  { id: 'light_brakes', group: 'Lights & Signals', label: 'Brake Lamps', detail: 'Both rear red stop lights illuminate upon foot brake pedal press' },
  { id: 'light_signals', group: 'Lights & Signals', label: 'Turn Signal Flashers (Left & Right)', detail: 'Front and rear blinkers cycle steadily at normal rhythm' },
  { id: 'light_hazard', group: 'Lights & Signals', label: 'Hazard Warning Double Signals', detail: 'Emergency hazard switch flashes all indicators simultaneously' },
  { id: 'cab_horn', group: 'Cab & Controls', label: 'Audible Horn', detail: 'Horn horn sounds loudly and clearly when pressed' },
  { id: 'cab_mirrors', group: 'Cab & Controls', label: 'Side & Rearview Mirrors', detail: 'Mirrors clean, undamaged, and securely positioned for driver blindspots' },
  { id: 'cab_wipers', group: 'Cab & Controls', label: 'Windshield Wipers & Washer Fluid', detail: 'Wiper arms sweep smoothly across glass without rubber tearing' },
  { id: 'cab_seatbelt', group: 'Cab & Controls', label: 'Driver & Passenger Seatbelts', detail: 'Seatbelt webbings intact and inertial retractors lock firmly' },
  { id: 'mech_brakes', group: 'Drive & Mechanical', label: 'Foot Service & Parking Brakes', detail: 'Brake pedal has firm resistance and parking brake holds securely on slope' },
  { id: 'mech_steering', group: 'Drive & Mechanical', label: 'Power Steering Handling', detail: 'Steering wheel turns freely without excessive play, stiffness, or vibration' },
  { id: 'mech_leaks_noise', group: 'Drive & Mechanical', label: 'No Fluid Leaks & Abnormal Noise', detail: 'No knocking sounds or oil/fluid drips underneath engine and chassis' },
];

