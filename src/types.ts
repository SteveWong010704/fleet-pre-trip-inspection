export type VehicleStatus = 'Ready' | 'Pending Inspection' | 'Grounded';

export type TruckCategory = 'Feeder' | 'Small Truck';

export interface Vehicle {
  no: number;
  vehicleNo: string; // License Plate
  qrToken?: string; // Static randomized secret token for anti-guessing/anti-spoofing QR validation
  cardNo: string;
  pinNo: string;
  litre: number | string;
  limitRm: number | string;
  area: string;
  branch: string; // Depot code (e.g., KL, KJ, GB, NL, BL, etc.)
  region?: string; // Regional territory (e.g., NORTHERN, CENTRAL, EAST, SOUTH)
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

/**
 * Checks if a driver holds a supervisor designation (SPV / SUPERVISOR)
 */
export function isSupervisor(designation?: string | null): boolean {
  if (!designation) return false;
  const d = String(designation).trim().toUpperCase();
  return d === 'SPV' || d.includes('SUPERVISOR') || d.includes('SPV');
}

/**
 * Returns the maximum allowed daily inspections:
 * - Supervisor: up to 3 inspections per day
 * - Regular drivers / salesmen: 1 inspection per day
 */
export function getDailyInspectionLimit(designation?: string | null): number {
  return isSupervisor(designation) ? 3 : 1;
}

export interface AdminUser {
  username: string; // e.g. steve, admin, etc.
  name: string;
  role: string;
  assignedDepot?: string; // 'ALL' or specific depot code
  permissions?: string[]; // Allowed tab/feature IDs
}

export interface RbacFeature {
  id: string;
  label: string;
  category: 'Analytics' | 'Fleet & Assets' | 'Operations' | 'Audits & Security' | 'System';
  description: string;
}

export const ADMIN_FEATURES: RbacFeature[] = [
  { id: 'analytics', label: 'Executive Analytics', category: 'Analytics', description: 'Statutory compliance KPI overview, failure hotspots, and executive audit summaries' },
  { id: 'fleet', label: 'Vehicles Catalog', category: 'Fleet & Assets', description: 'Fleet roadworthiness status, chassis, registration, and depot assignment' },
  { id: 'drivers', label: 'Drivers & Accounts', category: 'Operations', description: 'Driver directory, PIN resets, SPV multi-trip designations, and accounts' },
  { id: 'operations', label: 'Manage Route, Depo, Region', category: 'Operations', description: 'Depot hubs, geographic regions, delivery route allocations, and master sync' },
  { id: 'history', label: 'Inspection Audit & Export', category: 'Audits & Security', description: 'Pre-trip log archive, digital certificates, fault records, and statutory PDF/Excel exports' },
  { id: 'bulk', label: 'Bulk Upload & Auto-QR', category: 'Fleet & Assets', description: 'Spreadsheet import batch processor and automatic QR code generation' },
  { id: 'qr', label: 'QR Label Generator', category: 'Fleet & Assets', description: 'Physical high-entropy QR windshield decals and printable label sheets' },
  { id: 'logs', label: 'Security Audit Logs', category: 'Audits & Security', description: 'Forensic tamper-evident audit trails, operator logins, and IP tracking' },
  { id: 'backup', label: 'Daily Backup (C:\\ Drive)', category: 'System', description: 'Local offline database backups, automated snapshots, and retention manager' },
  { id: 'users', label: 'User Management & RBAC', category: 'System', description: 'Staff account provisioning, depot assignment, custom positions, and permission matrix' },
];

export interface RbacRole {
  id: string;            // unique identifier (e.g. 'global_admin', 'logistic_admin')
  name: string;          // display name (e.g. 'Global Admin', 'Logistic Admin')
  description: string;
  isSystem?: boolean;    // true for Global Admin (cannot be deleted)
  permissions: string[]; // array of feature ids: ['analytics', 'fleet', ...]
  createdAt: string;
  updatedAt?: string;
}

export interface RbacUser {
  username: string;
  name: string;
  password?: string;
  role: string;          // corresponds to role name
  assignedDepot: string; // 'ALL' or specific depot code
  active: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface RegionItem {
  id: string;       // e.g. 'NORTHERN', 'CENTRAL', 'EAST', 'SOUTH'
  name: string;     // e.g. 'NORTHERN', 'CENTRAL', 'EAST', 'SOUTH'
  description?: string;
  depotsCount?: number;
  vehiclesCount?: number;
}

export interface DepotItem {
  id: string;       // e.g. 'KJ', 'BL', 'KL'
  code: string;     // e.g. 'KJ', 'BL', 'KL'
  name?: string;    // e.g. 'KJ'
  regionId: string; // e.g. 'NORTHERN', 'CENTRAL', 'EAST', 'SOUTH'
  address?: string;
  supervisorName?: string;
  phone?: string;
  active: boolean;
  routesCount?: number;
  vehiclesCount?: number;
  assignedVehiclePlates?: string[];
}

export interface RouteItem {
  id: string;       // e.g. '7K01', 'BL01'
  code: string;     // e.g. '7K01', 'BL01'
  name?: string;    // e.g. '7K01'
  depotId: string;  // e.g. 'KJ', 'BL'
  assignedVehiclePlate?: string;
  assignedDriverId?: string;
  active: boolean;
  description?: string;
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
  defectTags?: string[];
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
  primaryPhotoUrl?: string;
  photoCount?: number;
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

// ============================================================================
// INSPECTION CHECKPOINTS: WEEKDAY (MONDAY - FRIDAY: 6 PHOTOS) VS SATURDAY (FULL SET)
// ============================================================================

// 1. WEEKDAY ROUTINE (MONDAY - FRIDAY): EXACTLY 5 CHECKPOINTS, 6 PHOTOS
export const WEEKDAY_6_POINT_ITEMS: Omit<InspectionCheckItem, 'status' | 'defectNote' | 'photoUrl'>[] = [
  {
    id: 'tires_wheels',
    code: 1,
    category: 'Chassis & Rolling Gear',
    title: 'Front Tires (Front-Left & Front-Right: 2 Photos)',
    subtext: 'Mandatory 2 photos: Front-Left and Front-Right tires. Check inflation pressure, tread depth, and wheel nuts.',
  },
  {
    id: 'fluids_powertrain',
    code: 2,
    category: 'Engine & Fluids',
    title: 'Engine Oil Dipstick Level (Photo Required)',
    subtext: 'Pull dipstick, wipe clean, re-insert and inspect oil level between MIN and MAX notches.',
  },
  {
    id: 'radiator_coolant',
    code: 3,
    category: 'Engine & Cooling',
    title: 'Radiator & Coolant Level (Photo Required)',
    subtext: 'Inspect radiator core, coolant expansion tank fluid level, cap tightness, and check for hose leaks.',
  },
  {
    id: 'diesel_fuel_cap',
    code: 4,
    category: 'Fuel & Security',
    title: 'Diesel Fuel Tank & Cap (Photo Required)',
    subtext: 'Photo of diesel tank and filler neck. Verify cap is firmly locked and no diesel leaks around tank.',
  },
  {
    id: 'dashboard_warnings',
    code: 5,
    category: 'Instruments & Electronics',
    title: 'Meter & Dashboard (START VEHICLE ENGINE FIRST)',
    subtext: 'MANDATORY: Turn key ON and start engine before taking photo. Ensure odometer digits and gauges are fully lit. Turn ON camera flash (⚡).',
    dashboardChecks: {
      engineLightOff: true,
      doubleSignalOk: true,
      batteryLightOff: true,
      oilLightOff: true,
    },
  },
];

// 2. SATURDAY AUDIT (WEEKLY DEEP AUDIT: FULL SET WITH DASHBOARD LAST)
export const SATURDAY_FULL_ITEMS: Omit<InspectionCheckItem, 'status' | 'defectNote' | 'photoUrl'>[] = [
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
    id: 'fluids_powertrain',
    code: 6,
    category: 'Engine & Fluids',
    title: 'Engine Oil & Powertrain (Engine Oil Photo Required)',
    subtext: 'Mandatory photo of engine oil dipstick & level. Verify battery terminal condition, transmission, and fluid leaks.',
  },
  {
    id: 'diesel_fuel_cap',
    code: 7,
    category: 'Fuel & Security',
    title: 'Diesel Fuel Tank & Cap (Photo Required)',
    subtext: 'Photo of diesel fuel filler cap and tank seal. Ensure fuel cap is tightly locked, seal intact, and no diesel leakage.',
  },
  {
    id: 'emergency_equipment',
    code: 8,
    category: 'Safety & Emergency',
    title: 'Emergency Equipment',
    subtext: 'Fire extinguisher validity and pressure pin, emergency triangle, first aid kit, and seatbelts.',
  },
  {
    id: 'body_passenger_doors',
    code: 9,
    category: 'Cargo & Body (4 Sides Walkaround)',
    title: 'Cargo & Body (4 Photos: Front, Back, Left, Right)',
    subtext: 'Mandatory 4 photos covering all 4 sides of the lorry (Front, Rear, Left, Right). Pinch/zoom camera enabled.',
  },
  {
    id: 'dashboard_warnings',
    code: 10,
    category: 'Instruments & Electronics',
    title: 'Meter & Dashboard (START VEHICLE ENGINE FIRST)',
    subtext: 'MANDATORY: Turn key ON and start engine before taking photo. Ensure odometer digits and gauges are fully lit. Turn ON camera flash (⚡).',
    dashboardChecks: {
      engineLightOff: true,
      doubleSignalOk: true,
      batteryLightOff: true,
      oilLightOff: true,
    },
  },
];

export function isSaturdayInspection(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'saturday') return true;
      if (params.get('mode') === 'weekday') return false;
    } catch {}
  }
  return new Date().getDay() === 6;
}

/**
 * Helper to identify if a vehicle is classified as a Feeder (Long-haul / Heavy).
 */
export function isFeederVehicle(veh?: { truckCategory?: string; model?: string } | null): boolean {
  if (!veh) return false;
  const cat = String(veh.truckCategory || '').trim().toLowerCase();
  const model = String(veh.model || '').trim().toLowerCase();
  return cat === 'feeder' || model.includes('feeder');
}

/**
 * Inspection photo requirement rules:
 * - Feeder trucks: ALWAYS require 15 photos fullset every day (Monday through Saturday/Sunday).
 * - Sales trucks (Small Truck):
 *   - Mon ~ Fri: 6 photos routine (5 checkpoints, 6 photos)
 *   - Saturday: 15 photos fullset (10 checkpoints, 15 photos)
 */
export function requiresFull15PhotoInspection(
  target?: boolean | { truckCategory?: string; model?: string } | null,
  isSaturday: boolean = isSaturdayInspection()
): boolean {
  if (typeof target === 'boolean') return target;
  if (isFeederVehicle(target)) return true;
  return isSaturday;
}

export function getActiveInspectionItems(
  target?: boolean | { truckCategory?: string; model?: string } | null,
  isSaturday: boolean = isSaturdayInspection()
): Omit<InspectionCheckItem, 'status' | 'defectNote' | 'photoUrl'>[] {
  const isFullSet = requiresFull15PhotoInspection(target, isSaturday);
  return isFullSet ? SATURDAY_FULL_ITEMS : WEEKDAY_6_POINT_ITEMS;
}

export const STANDARD_10_POINT_ITEMS = SATURDAY_FULL_ITEMS;

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
    feederOnly: false,
    description: 'Dry chemical powder extinguisher with valid inspection tag & pressure needle in green zone.',
  },
  {
    id: 'warning_triangle',
    name: 'Emergency Warning Triangle',
    unit: '1 unit',
    feederOnly: false,
    description: 'Foldable retro-reflective red safety triangle in good working condition.',
  },
  {
    id: 'first_aid_kit',
    name: 'First Aid Kit (Peti Kecemasan)',
    unit: '1 unit',
    feederOnly: true,
    description: 'Standard emergency medical first aid box with valid dressings and antiseptic supplies.',
  },
  {
    id: 'safety_vest',
    name: 'High-Visibility Safety Vest (Jaket Keselamatan)',
    unit: '1 unit',
    feederOnly: true,
    description: 'Fluorescent high-visibility reflective vest for emergency roadside visibility.',
  },
  {
    id: 'flashlight',
    name: 'Heavy-Duty Flashlight (Lampu Suluh)',
    unit: '1 unit',
    feederOnly: true,
    description: 'Handheld inspection torchlight with tested charged batteries.',
  },
  {
    id: 'reflective_string',
    name: '50m Reflective Line (Rentetan Reflektif 50m)',
    unit: '1 unit',
    feederOnly: true,
    description: '50-meter perimeter reflective safety cord / warning ribbon for hazard cordoning.',
  },
  {
    id: 'safety_cones',
    name: 'Safety Warning Cones (Kon Keselamatan)',
    unit: '5 units',
    feederOnly: true,
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

export interface DailyTrendPoint {
  date: string;
  dayLabel: string;
  shortDate: string;
  inspected: number;
  passed: number;
  defects: number;
  totalRoutes?: number;
  completedRoutes?: number;
  complianceRate: number; // Route compliance %: (completedRoutes / totalRoutes) * 100
  defectRate?: number;     // Defect %: (defects / inspected) * 100
  score?: number;          // Combined score from route compliance & grounded vehicles/defects
}

export interface DepotRankingItem {
  rank: number;
  depot: string;
  depotName: string;
  assignedVehicles: number;
  totalRoutes: number;
  completedRoutes: number;
  totalInspections: number;
  passedCount: number;
  defectCount: number;
  groundedVehicles: number; // Grounded vehicles
  completionRate: number;
  passRate: number;
  complianceRate: number; // based on: (completedRoutes / totalRoutes) * 100
  defectRate: number;     // based on: (defectCount / totalInspections) * 100
  complianceScore: number;// combined score from route compliance and grounded vehicles (groundedVehicles & defectRate)
  statusTier: 'Exceptional' | 'Compliant' | 'Needs Attention';
}

export interface DefectHotspotItem {
  checkpointId: string;
  title: string;
  category: string;
  defectCount: number;
  percentage: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  commonIssues: string[];
  topRemarks: string[];
  affectedVehicles: string[];
}

export interface DailyDepotMetric {
  date: string;
  formattedDate: string;
  depot: string;
  region?: string;
  assignedVehicles: number;
  totalRoutes: number;
  completedRoutes: number;
  totalInspections: number;
  passedCount: number;
  defectCount: number;
  groundedVehicles: number; // Grounded vehicles
  complianceRate: number;   // based on: (completedRoutes / totalRoutes) * 100
  defectRate: number;       // based on: (defectCount / totalInspections) * 100
  score: number;            // combined from: complianceRate, grounded vehicles, and defectRate
  statusTier: 'Exceptional' | 'Compliant' | 'Needs Attention';
}

export interface ExecutiveAnalyticsData {
  summary: {
    totalInspections: number;
    passedCount: number;
    defectCount: number;
    totalRoutes: number;
    completedRoutes: number;
    complianceRate: number; // based on: (completedRoutes / totalRoutes) * 100
    defectRate: number;     // based on: (defectCount / totalInspections) * 100
    complianceScore: number;// combined score from route compliance and grounded vehicles
    firstTimePassRate: number;
    activeVehiclesInspected: number;
    totalFleetVehicles: number;
    fleetCoverageRate: number;
    groundedVehiclesNow: number; // Grounded vehicles
    totalDefectItemsLogged: number;
    avgInspectionsPerDay: number;
  };
  dailyTrends: DailyTrendPoint[];
  depotRankings: DepotRankingItem[];
  dailyDepotMetrics: DailyDepotMetric[];
  defectHotspots: DefectHotspotItem[];
  recentDefectLogs: {
    id: string;
    timestamp: string;
    formattedDate: string;
    vehicleNo: string;
    vehicleBranch: string;
    truckCategory?: string;
    driverName: string;
    driverDepot: string;
    defectCount: number;
    defectSummary: string;
    failedItems: { id: string; title: string; defectNote: string }[];
  }[];
  meta: {
    timeframe: string;
    startDate: string;
    endDate: string;
    selectedBranch: string;
    selectedCategory: string;
    generatedAt: string;
  };
}