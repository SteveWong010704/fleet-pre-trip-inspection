import { Vehicle, Driver, InspectionRecord, InspectionCheckItem, WEEKDAY_6_POINT_ITEMS, SATURDAY_FULL_ITEMS, APAD_SAFETY_EQUIPMENT_SPEC, DailyDepotMetric, RouteItem } from '../src/types';

export interface DailyTrendPoint {
  date: string;         // YYYY-MM-DD
  dayLabel: string;     // e.g. "Mon 12 Oct"
  shortDate: string;    // e.g. "12 Oct"
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
  depot: string;        // e.g. "KJ"
  depotName: string;    // e.g. "KJ"
  assignedVehicles: number;
  totalRoutes: number;
  completedRoutes: number;
  totalInspections: number;
  passedCount: number;
  defectCount: number;
  groundedVehicles: number; // Grounded vehicles
  completionRate: number; // e.g. 96.5%
  passRate: number;       // e.g. 95.0%
  complianceRate: number; // based on: (completedRoutes / totalRoutes) * 100
  defectRate: number;     // based on: (defectCount / totalInspections) * 100
  complianceScore: number;// combined score from route compliance and grounded vehicles
  statusTier: 'Exceptional' | 'Compliant' | 'Needs Attention';
}

export interface DefectHotspotItem {
  checkpointId: string;
  title: string;
  category: string;
  defectCount: number;
  percentage: number;     // Share of total defects %
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  commonIssues: string[];
  topRemarks: string[];
  affectedVehicles: string[];
}

export interface ExecutiveAnalyticsResult {
  summary: {
    totalInspections: number;
    passedCount: number;
    defectCount: number;
    totalRoutes: number;
    completedRoutes: number;
    complianceRate: number; // based on: (completedRoutes / totalRoutes) * 100
    defectRate: number;     // based on: (defectCount / totalInspections) * 100
    complianceScore: number;// combined score
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


/** 
 * Return the calendar date in Malaysia (UTC+08:00), strictly aligned with Inspection Audit (InspectionHistory.tsx).
 * 1. Checks formattedDate first (as displayed in Inspection Audit, e.g. "22/10/2026, 08:30:00" -> "2026-10-22").
 * 2. Checks timestamp / Timestamp, recognizing local Malaysia strings or converting UTC ISO with Asia/Kuala_Lumpur.
 * 3. Falls back to certificate ID (INSP-YYYYMMDD-XXXX).
 */
export function getInspectionDateKey(inspection: InspectionRecord | any): string {
  if (!inspection) return '';

  // 1. Follow Inspection Audit Date & Time (formattedDate)
  const formatted = String(inspection.formattedDate || inspection.FormattedDate || '').trim();
  if (formatted) {
    // DB FormattedDate is commonly produced with en-US toLocaleString():
    // "10/20/2026, 18:02:33" = MM/DD/YYYY, HH:mm:ss.
    // Support both en-US and Malaysian DD/MM/YYYY safely (never rely on Date.parse).
    const slashDate = formatted.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (slashDate) {
      const first = Number(slashDate[1]);
      const second = Number(slashDate[2]);
      let month: number;
      let day: number;
      if (first > 12 && second <= 12) { day = first; month = second; } // DD/MM/YYYY
      else if (second > 12 && first <= 12) { month = first; day = second; } // MM/DD/YYYY
      else { month = first; day = second; } // Ambiguous values default to DB's en-US format
      const year = Number(slashDate[3]);
      const check = new Date(Date.UTC(year, month - 1, day));
      if (month >= 1 && month <= 12 && day >= 1 && check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    // Check YYYY-MM-DD format
    const ymdMatch = formatted.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // 2. Check timestamp / Timestamp with proper UTC+8 (Asia/Kuala_Lumpur) handling
  const raw = inspection.timestamp ?? inspection.Timestamp;
  if (raw != null && raw !== '') {
    // If it's a string in "YYYY-MM-DD HH:mm:ss" without Z or offset, it was already recorded in Malaysia local time
    if (typeof raw === 'string') {
      const rawTrim = raw.trim();
      const localYmd = rawTrim.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (localYmd && !rawTrim.includes('Z') && !/[+\-]\d{2}:?\d{2}$/.test(rawTrim)) {
        return `${localYmd[1]}-${localYmd[2]}-${localYmd[3]}`;
      }
    }

    const value = raw instanceof Date ? raw : new Date(String(raw));
    if (!Number.isNaN(value.getTime())) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(value);
      const part = (type: string) => parts.find(p => p.type === type)?.value || '';
      const res = `${part('year')}-${part('month')}-${part('day')}`;
      if (res && res.length === 10) return res;
    }
  }

  // 3. Fallback: Extract date from standard Certificate ID (e.g. INSP-20261022-0001)
  const id = String(inspection.id || inspection.InspectionId || '').trim();
  const idMatch = id.match(/INSP-(\d{4})(\d{2})(\d{2})/i);
  if (idMatch) {
    return `${idMatch[1]}-${idMatch[2]}-${idMatch[3]}`;
  }

  return '';
}

export function formatLocalDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Pure depot codes without town assumptions


const DEPOT_GPS: Record<string, { lat: number; lng: number; address: string }> = {
  BL: { lat: 3.0319, lng: 101.7511, address: 'Kawasan Perindustrian Balakong, 43300 Seri Kembangan, Selangor' },
  KL: { lat: 3.1390, lng: 101.6869, address: 'Jalan Chan Sow Lin Industrial Area, 55200 Kuala Lumpur' },
  KJ: { lat: 2.9935, lng: 101.7874, address: 'Kawasan Perindustrian Bukit Angkat, 43000 Kajang, Selangor' },
  GB: { lat: 3.9922, lng: 103.3512, address: 'Kawasan Perindustrian Gebeng, 26080 Kuantan, Pahang' },
  NL: { lat: 2.8168, lng: 101.7944, address: 'Kawasan Perindustrian Nilai 3, 71800 Nilai, Negeri Sembilan' },
};

interface DefectTemplate {
  checkpointId: string;
  category: string;
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  issues: string[];
  remarks: string[];
}

const DEFECT_TEMPLATES: DefectTemplate[] = [
  {
    checkpointId: 'tires_wheels',
    category: 'Chassis & Rolling Gear',
    title: 'Tires & Wheels Pressure & Tread',
    severity: 'High',
    issues: ['Low Inflation Pressure (<30 PSI)', 'Tread Depth Below 1.6mm Limit', 'Sidewall Scuff / Cut', 'Wheel Nut Torquing Warning'],
    remarks: [
      'Front-Left tyre pressure measured low at 28 PSI (specified 36 PSI), valve stem cap missing.',
      'Rear-Right inner tyre tread depth 1.4mm below JPJ/APAD statutory 1.6mm limit.',
      'Front-Right tyre detected small embedded screw on outer tread block; needs plug repair.',
      'Rear-Left tyre sidewall shows minor curb abrasion scuff mark; monitored for bulge.',
    ],
  },
  {
    checkpointId: 'radiator_coolant',
    category: 'Engine & Cooling',
    title: 'Radiator Core & Coolant Reservoir',
    severity: 'High',
    issues: ['Coolant Fluid Below MIN Mark', 'Upper Hose Seepage', 'Expansion Tank Cap Worn', 'Radiator Fin Debris'],
    remarks: [
      'Coolant expansion tank level 1.5cm below MIN notch; topped up with pre-mixed coolant.',
      'Minor coolant residue visible around upper radiator hose clamp; clamp tightened.',
      'Radiator pressure cap rubber gasket brittle; recommended replacement before long haul.',
    ],
  },
  {
    checkpointId: 'fluids_powertrain',
    category: 'Engine & Fluids',
    title: 'Engine Oil Dipstick & Fluid Levels',
    severity: 'Medium',
    issues: ['Oil Dipstick Touching MIN Notch', 'Dark / Viscous Oil', 'Slight Valve Cover Weepage', 'Battery Terminal Oxidation'],
    remarks: [
      'Engine oil dipstick level touching lower MIN notch; topped up 1 quart 15W-40 diesel oil.',
      'Engine oil dark and due for scheduled 10,000 KM lube service.',
      'Slight oil weeping detected around valve cover gasket rear corner.',
    ],
  },
  {
    checkpointId: 'brake_system',
    category: 'Control & Stopping',
    title: 'Brake Fluid & Air Pressure System',
    severity: 'Critical',
    issues: ['Brake Fluid Below MIN Level', 'Air Build-up Slower Than 3 Min', 'Brake Pedal Spongy', 'Parking Brake Holds at High Notch'],
    remarks: [
      'Brake fluid level reservoir slightly below MIN line; brake pads inspected for wear.',
      'Dual air tank pressure buildup takes ~3.5 minutes from cold start; governor check needed.',
      'Parking brake lever pulls up 8 clicks before holding firmly; cable adjustment required.',
    ],
  },
  {
    checkpointId: 'dashboard_warnings',
    category: 'Instruments & Electronics',
    title: 'Meter Cluster & Warning Lights',
    severity: 'High',
    issues: ['Amber Check Engine Light ON', 'Battery Charging Light Flashing', 'Odometer Backlight Dim', 'ABS Warning Intermittent'],
    remarks: [
      'Amber Check Engine light remained illuminated after engine crank and idle.',
      'Battery charging warning icon flashed intermittently at low idle speed.',
      'Digital odometer display segments dim when headlights switched on.',
    ],
  },
  {
    checkpointId: 'emergency_equipment',
    category: 'Safety & Emergency',
    title: 'APAD Safety Equipment & Extinguisher',
    severity: 'Medium',
    issues: ['Fire Extinguisher Tag Expired', 'Reflector Triangle Base Loose', 'Cones Set Incomplete (4/5)', 'Flashlight Battery Depleted'],
    remarks: [
      '9kg dry chemical fire extinguisher inspection tag expired; sent for BOMBA recertification.',
      'Emergency warning triangle reflective hinge broken; replacement unit issued.',
      'High-visibility safety vest missing from driver door pocket.',
    ],
  },
  {
    checkpointId: 'diesel_fuel_cap',
    category: 'Fuel & Security',
    title: 'Diesel Fuel Tank & Filler Cap',
    severity: 'Medium',
    issues: ['Cap Rubber Seal Cracked', 'Filler Neck Weepage', 'Tank Anti-Theft Lock Stiff'],
    remarks: [
      'Diesel fuel filler cap rubber O-ring seal cracked; diesel smell noticeable around tank.',
      'Fuel cap lock cylinder stiff to turn with ignition key; lubricated.',
    ],
  },
  {
    checkpointId: 'lights_indicators',
    category: 'Visibility & Signals',
    title: 'Exterior Lights & Turn Indicators',
    severity: 'Low',
    issues: ['Brake Light Bulb Blown', 'Turn Flasher Blinking Fast', 'Headlight Low Beam Dim'],
    remarks: [
      'Left rear brake lamp bulb not illuminating on foot pedal depression; bulb replaced.',
      'Right front turn indicator blinks rapidly; rear bulb socket loose contact.',
    ],
  },
  {
    checkpointId: 'steering_handling',
    category: 'Control & Stopping',
    title: 'Power Steering & Free Play',
    severity: 'Critical',
    issues: ['Power Steering Fluid Low', 'Excessive Wheel Free Play (>35mm)', 'Hydraulic Pump Whine'],
    remarks: [
      'Power steering reservoir fluid brownish and below ADD mark; topped up Dexron III ATF.',
      'Steering wheel free play approx 35mm; tie rod end inspection scheduled.',
    ],
  },
  {
    checkpointId: 'body_passenger_doors',
    category: 'Cargo & Body (4 Sides)',
    title: 'Cargo Body & Container Door Latches',
    severity: 'Low',
    issues: ['Door Latch Stiff', 'Reflective Strips Peeling', 'Side Bumper Scratched'],
    remarks: [
      'Rear container left door latch lever stiff to engage properly.',
      'Side red/yellow reflective marking tape partially peeled at bottom corner.',
    ],
  },
];

/**
 * Generates realistic 30-day historical inspection data across vehicles and drivers.
 */
export function generateHistoricalInspections(
  vehicles: Vehicle[],
  drivers: Driver[],
  daysBack: number = 30
): InspectionRecord[] {
  if (!vehicles || vehicles.length === 0 || !drivers || drivers.length === 0) {
    return [];
  }

  const inspections: InspectionRecord[] = [];
  const now = new Date();
  
  // Sort drivers by depot for consistent driver assignment
  const driversByDepot: Record<string, Driver[]> = {};
  drivers.forEach(d => {
    const dep = (d.depot || 'BL').toUpperCase();
    if (!driversByDepot[dep]) driversByDepot[dep] = [];
    driversByDepot[dep].push(d);
  });

  // Base odometer counter per vehicle
  const odoCounters: Record<string, number> = {};
  vehicles.forEach(v => {
    odoCounters[v.vehicleNo] = Number(v.currentOdometer) || (100000 + (v.no * 8500));
  });

  let counterId = 100;

  for (let dayOffset = daysBack; dayOffset >= 0; dayOffset--) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() - dayOffset);
    const dateStr = formatLocalDateKey(targetDate);
    const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // Malaysia calendar day
    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;

    // Sundays have light dispatch (~30% fleet), weekdays ~95%, Saturdays ~90%
    const dispatchRate = isSunday ? 0.3 : (isSaturday ? 0.90 : 0.96);

    for (const vehicle of vehicles) {
      // Deterministic pseudo-random based on vehicle and date
      const seedVal = Math.sin(dayOffset * 37 + vehicle.no * 17) * 10000;
      const rand = seedVal - Math.floor(seedVal);

      if (rand > dispatchRate) {
        continue; // Vehicle off-duty on this day
      }

      const depot = (vehicle.branch || 'BL').toUpperCase();
      const depotDrivers = driversByDepot[depot] || drivers;
      const driverIndex = (vehicle.no + dayOffset) % depotDrivers.length;
      const driver = depotDrivers[driverIndex] || drivers[0];

      // Defect probability: ~7.5% failure rate
      const defectSeed = Math.sin(dayOffset * 53 + vehicle.no * 29) * 10000;
      const defectRand = defectSeed - Math.floor(defectSeed);
      const isDefective = defectRand < 0.075;

      // Inspection time between 06:45 AM and 08:25 AM
      const hour = 6 + Math.floor(rand * 2); // 6 or 7
      const minute = Math.floor(rand * 60);
      const second = Math.floor((rand * 100) % 60);
      // Synthetic inspection clock time is Malaysia local time (UTC+08:00).
      const inspDate = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+08:00`);

      const isFeeder = vehicle.truckCategory === 'Feeder' || String(vehicle.model || '').toLowerCase().includes('feeder');
      const isFullAudit = isFeeder || isSaturday;
      const baseChecklist = isFullAudit ? SATURDAY_FULL_ITEMS : WEEKDAY_6_POINT_ITEMS;

      // Odometer increment (50 - 150 km per day)
      const dailyKm = Math.floor(60 + (rand * 90));
      odoCounters[vehicle.vehicleNo] = (odoCounters[vehicle.vehicleNo] || 80000) + dailyKm;
      const currentOdo = odoCounters[vehicle.vehicleNo];

      let defectItem: DefectTemplate | null = null;
      let defectRemark = '';
      if (isDefective) {
        const templateIdx = Math.floor(defectRand * 100) % DEFECT_TEMPLATES.length;
        defectItem = DEFECT_TEMPLATES[templateIdx];
        const remarkIdx = Math.floor(rand * 10) % defectItem.remarks.length;
        defectRemark = defectItem.remarks[remarkIdx];
      }

      const checkItems: InspectionCheckItem[] = baseChecklist.map(base => {
        const itemFailed = isDefective && defectItem && defectItem.checkpointId === base.id;
        return {
          ...base,
          status: itemFailed ? 'Fail' : 'Pass',
          defectNote: itemFailed ? defectRemark : undefined,
          defectTags: itemFailed ? defectItem!.issues.slice(0, 2) : undefined,
          dashboardChecks: base.id === 'dashboard_warnings' ? {
            engineLightOff: !itemFailed,
            doubleSignalOk: true,
            batteryLightOff: true,
            oilLightOff: true,
          } : undefined,
        };
      });

      const gps = DEPOT_GPS[depot] || DEPOT_GPS.BL;
      const cleanDateTag = dateStr.replace(/-/g, '');
      const recId = `INSP-${cleanDateTag}-${String(counterId++).padStart(4, '0')}`;

      const rec: InspectionRecord = {
        id: recId,
        timestamp: inspDate.toISOString(),
        formattedDate: `${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
        driverId: driver.employeeId || `DRV-${driver.loginId}`,
        driverName: driver.name,
        driverDesignation: driver.designation || 'DRIVER',
        driverDepot: depot,
        vehicleNo: vehicle.vehicleNo,
        vehicleBrand: vehicle.brand || 'ISUZU',
        vehicleModel: vehicle.model || 'NPR75',
        vehicleBranch: depot,
        truckCategory: vehicle.truckCategory || (isFeeder ? 'Feeder' : 'Small Truck'),
        route: vehicle.assignedRoute || `${depot}01`,
        odometer: currentOdo,
        fuelLevel: 60 + Math.floor(rand * 40),
        healthDeclaration: true,
        overallResult: isDefective ? 'Fail' : 'Pass',
        defectCount: isDefective ? 1 : 0,
        defectSummary: isDefective ? defectRemark : undefined,
        items: checkItems,
        safetyEquipment: APAD_SAFETY_EQUIPMENT_SPEC.map(eq => ({
          id: eq.id,
          name: eq.name,
          required: isFeeder ? true : !eq.feederOnly,
          present: true,
          conditionOk: !(isDefective && defectItem?.checkpointId === 'emergency_equipment'),
          unit: eq.unit,
        })),
        driverDeclaration: {
          uniformAndLicense: true,
          fitAndRested: true,
          substanceFree: true,
          scheduleAndRestAcknowledged: true,
          cargoSafeBDM: true,
        },
        gpsLocation: {
          lat: gps.lat + (rand - 0.5) * 0.002,
          lng: gps.lng + (rand - 0.5) * 0.002,
          accuracy: 5 + Math.floor(rand * 8),
          address: gps.address,
        },
        photos: [],
      };

      inspections.push(rec);
    }
  }

  // Sort descending by timestamp
  inspections.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return inspections;
}

/**
 * Calculates executive compliance analytics, rankings, and defect hotspots.
 */
export function calculateExecutiveAnalytics(
  inspections: InspectionRecord[],
  vehicles: Vehicle[],
  drivers: Driver[],
  routes: RouteItem[] = [],
  filters?: {
    timeframe?: string; // '7d' | '14d' | '30d' | 'all'
    branch?: string;    // 'ALL' or specific depot code
    truckCategory?: string; // 'ALL' | 'Small Truck' | 'Feeder'
    dateFrom?: string;
    dateTo?: string;
  }
): ExecutiveAnalyticsResult {
  const timeframe = filters?.timeframe || '30d';
  const branchFilter = filters?.branch && filters.branch !== 'ALL' ? filters.branch.toUpperCase() : null;
  const categoryFilter = filters?.truckCategory && filters.truckCategory !== 'ALL' ? filters.truckCategory : null;

  // Determine the report range by Malaysia calendar dates, not the server's timezone.
  const todayKey = formatLocalDateKey(new Date());
  let startDateKey: string;
  let endDateKey: string;

  if (filters?.dateFrom) {
    startDateKey = /^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom) ? filters.dateFrom : todayKey;
    endDateKey = filters.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)
      ? filters.dateTo : startDateKey;
  } else if (timeframe === 'all') {
    // Find earliest inspection date in fleet records (or fallback to 90 days back)
    const validKeys = inspections.map(i => getInspectionDateKey(i)).filter(Boolean).sort();
    startDateKey = validKeys.length > 0 ? validKeys[0] : shiftDateKey(todayKey, -90);
    endDateKey = todayKey;
  } else if (timeframe === 'today' || timeframe === '1d') {
    startDateKey = todayKey;
    endDateKey = todayKey;
  } else if (timeframe === 'yesterday') {
    startDateKey = shiftDateKey(todayKey, -1);
    endDateKey = shiftDateKey(todayKey, -1);
  } else {
    endDateKey = todayKey;
    const daysBack = timeframe === '7d' ? 7
      : timeframe === '14d' ? 14
      : 30;
    startDateKey = shiftDateKey(todayKey, -daysBack);
  }

  // Date keys are compared lexicographically (YYYY-MM-DD), avoiding UTC/local
  // midnight drift and making date filters inclusive in Malaysia time.
  const startDate = new Date(`${startDateKey}T00:00:00Z`);
  const endDate = new Date(`${endDateKey}T00:00:00Z`);

  // Map vehicles by plate. Keep analytics branch/route resolution consistent with
  // getInspections() so records with missing legacy fields are attributed identically
  // in Inspection Audit and Executive Analytics.
  const vehicleMap: Record<string, Vehicle> = {};
  vehicles.forEach(v => {
    if (v.vehicleNo) vehicleMap[v.vehicleNo.replace(/\s+/g, '').toUpperCase()] = v;
  });

  const normalizedInspections = inspections.map(insp => {
    const cleanPlate = (insp.vehicleNo || '').replace(/\s+/g, '').toUpperCase();
    const vehicle = vehicleMap[cleanPlate];
    const resolvedBranch = (insp.vehicleBranch || vehicle?.branch || 'BL').trim().toUpperCase();
    const resolvedRoute = (insp.route && insp.route !== 'General Route' && !insp.route.startsWith('Route-'))
      ? insp.route.trim().toUpperCase()
      : (vehicle?.area || vehicle?.assignedRoute || `${resolvedBranch}01`).trim().toUpperCase();

    return {
      ...insp,
      vehicleBranch: resolvedBranch,
      route: resolvedRoute,
      truckCategory: insp.truckCategory || vehicle?.truckCategory || 'Small Truck',
    };
  });

  // Map routes by depot
  const depotRoutesMap: Record<string, Set<string>> = {};
  routes.forEach(r => {
    if (r.active !== false && r.code) {
      const dep = (r.depotId || 'OTHER').toUpperCase();
      if (!depotRoutesMap[dep]) depotRoutesMap[dep] = new Set();
      depotRoutesMap[dep].add(r.code.toUpperCase());
    }
  });
  vehicles.forEach(v => {
    const dep = (v.branch || 'OTHER').toUpperCase();
    const rCode = (v.assignedRoute || v.area || '').trim().toUpperCase();
    if (rCode) {
      if (!depotRoutesMap[dep]) depotRoutesMap[dep] = new Set();
      depotRoutesMap[dep].add(rCode);
    }
  });

  // Filter vehicles matching fleet scope
  const scopedVehicles = vehicles.filter(v => {
    if (branchFilter && (v.branch || '').toUpperCase() !== branchFilter) return false;
    if (categoryFilter && (v.truckCategory || 'Small Truck') !== categoryFilter) return false;
    return true;
  });

  // Total active routes in scope
  const allScopedRoutes = new Set<string>();
  Object.keys(depotRoutesMap).forEach(dep => {
    if (!branchFilter || dep === branchFilter) {
      depotRoutesMap[dep].forEach(r => allScopedRoutes.add(r));
    }
  });
  const totalRoutesCount = allScopedRoutes.size || scopedVehicles.length || 1;

  // Filter inspections in date range and vehicle scope
  const scopedInspections = normalizedInspections.filter(insp => {
    const inspectionDateKey = getInspectionDateKey(insp);
    if (!inspectionDateKey || inspectionDateKey < startDateKey || inspectionDateKey > endDateKey) return false;
    if (branchFilter && (insp.vehicleBranch || '').trim().toUpperCase() !== branchFilter) return false;
    if (categoryFilter && (insp.truckCategory || 'Small Truck') !== categoryFilter) return false;
    return true;
  });

  // 1. Summary KPIs
  const totalInspections = scopedInspections.length;
  const passedCount = scopedInspections.filter(i => i.overallResult === 'Pass').length;
  const defectCount = scopedInspections.filter(i => i.overallResult === 'Fail').length;

  // Track completed routes from inspections
  const inspectedRoutesSet = new Set<string>();
  scopedInspections.forEach(insp => {
    const v = vehicleMap[insp.vehicleNo?.replace(/\s+/g, '').toUpperCase()];
    const r = (insp.route || v?.assignedRoute || v?.area || '').trim().toUpperCase();
    if (r) inspectedRoutesSet.add(r);
  });
  const completedRoutesCount = inspectedRoutesSet.size;

  // Route-based compliance rate: (completedRoutes / totalRoutes) * 100
  const complianceRate = totalRoutesCount > 0 
    ? Number(Math.min(100, (completedRoutesCount / totalRoutesCount) * 100).toFixed(1)) 
    : 100;

  // Defect rate: (defectCount / totalInspections) * 100
  const defectRate = totalInspections > 0 
    ? Number(((defectCount / totalInspections) * 100).toFixed(1)) 
    : 0;

  // Count currently grounded vehicles in scoped fleet
  const groundedVehiclesNow = scopedVehicles.filter(v => v.currentStatus === 'Grounded').length;

  // Score combines grounded vehicles & defects and compliance rate:
  const vehicleHealthScore = Math.max(0, 100 - defectRate - (groundedVehiclesNow * 8));
  const complianceScore = Number(((complianceRate * 0.6) + (vehicleHealthScore * 0.4)).toFixed(1));
  const firstTimePassRate = complianceRate;

  // Unique vehicles inspected
  const uniquePlates = new Set(scopedInspections.map(i => i.vehicleNo.toUpperCase()));
  const activeVehiclesInspected = uniquePlates.size;
  const totalFleetVehicles = scopedVehicles.length;
  const fleetCoverageRate = totalFleetVehicles > 0 ? Number(((activeVehiclesInspected / totalFleetVehicles) * 100).toFixed(1)) : 100;

  // Total defect items logged across all inspections
  let totalDefectItemsLogged = 0;
  scopedInspections.forEach(insp => {
    if (Array.isArray(insp.items)) {
      insp.items.forEach(it => {
        if (it.status === 'Fail') totalDefectItemsLogged++;
      });
    }
  });

  // Inclusive calendar-day count for the selected reporting range.
  const startDayUtc = Date.parse(`${startDateKey}T00:00:00Z`);
  const endDayUtc = Date.parse(`${endDateKey}T00:00:00Z`);
  const daysDiff = Math.max(1, Math.floor((endDayUtc - startDayUtc) / 86400000) + 1);
  const avgInspectionsPerDay = Number((totalInspections / daysDiff).toFixed(1));

  // 2. Daily Trends
  const trendMap: Record<string, { inspected: number; passed: number; defects: number; routes: Set<string> }> = {};
  
  // Initialize all days in the range so there are no empty gaps in charts
  const cursor = new Date(startDate);
  while (formatLocalDateKey(cursor) <= endDateKey) {
    const key = formatLocalDateKey(cursor);
    trendMap[key] = { inspected: 0, passed: 0, defects: 0, routes: new Set() };
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  scopedInspections.forEach(insp => {
    const key = getInspectionDateKey(insp);
    if (!key) return;
    if (!trendMap[key]) {
      trendMap[key] = { inspected: 0, passed: 0, defects: 0, routes: new Set() };
    }
    trendMap[key].inspected++;
    if (insp.overallResult === 'Pass') {
      trendMap[key].passed++;
    } else {
      trendMap[key].defects++;
    }
    const v = vehicleMap[insp.vehicleNo?.replace(/\s+/g, '').toUpperCase()];
    const r = (insp.route || v?.assignedRoute || v?.area || '').trim().toUpperCase();
    if (r) trendMap[key].routes.add(r);
  });

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const dailyTrends: DailyTrendPoint[] = Object.keys(trendMap)
    .sort()
    .map(dateKey => {
      const data = trendMap[dateKey];
      const d = new Date(`${dateKey}T00:00:00Z`);
      const dayName = dayNames[d.getUTCDay()];
      const dayNum = d.getUTCDate();
      const monthName = monthNames[d.getUTCMonth()];
      const dayCompletedRoutes = data.routes.size;
      const dayComplianceRate = totalRoutesCount > 0
        ? Number(Math.min(100, (dayCompletedRoutes / totalRoutesCount) * 100).toFixed(1))
        : (data.inspected > 0 ? 100 : 0);
      const dayDefectRate = data.inspected > 0
        ? Number(((data.defects / data.inspected) * 100).toFixed(1))
        : 0;
      const dayVehicleHealth = Math.max(0, 100 - dayDefectRate - (data.defects > 0 ? 10 : 0));
      const dayScore = Number(((dayComplianceRate * 0.6) + (dayVehicleHealth * 0.4)).toFixed(1));

      return {
        date: dateKey,
        dayLabel: `${dayName} ${dayNum} ${monthName}`,
        shortDate: `${dayNum} ${monthName}`,
        inspected: data.inspected,
        passed: data.passed,
        defects: data.defects,
        totalRoutes: totalRoutesCount,
        completedRoutes: dayCompletedRoutes,
        complianceRate: dayComplianceRate,
        defectRate: dayDefectRate,
        score: dayScore,
      };
    });

  // 3. Depot Rankings
  const depotVehicleCounts: Record<string, number> = {};
  vehicles.forEach(v => {
    const dep = (v.branch || 'OTHER').toUpperCase();
    depotVehicleCounts[dep] = (depotVehicleCounts[dep] || 0) + 1;
  });

  // Include any depots configured in master routes
  Object.keys(depotRoutesMap).forEach(dep => {
    if (!depotVehicleCounts[dep]) depotVehicleCounts[dep] = 0;
  });

  const depotInspMap: Record<string, { total: number; passed: number; defects: number; inspectedRoutes: Set<string>; groundedVehicles: number }> = {};
  Object.keys(depotVehicleCounts).forEach(code => {
    const depGrounded = vehicles.filter(v => (v.branch || '').toUpperCase() === code && v.currentStatus === 'Grounded').length;
    depotInspMap[code] = { total: 0, passed: 0, defects: 0, inspectedRoutes: new Set(), groundedVehicles: depGrounded };
  });

  scopedInspections.forEach(insp => {
    const dep = (insp.vehicleBranch || 'BL').toUpperCase();
    if (!depotInspMap[dep]) {
      depotInspMap[dep] = { total: 0, passed: 0, defects: 0, inspectedRoutes: new Set(), groundedVehicles: 0 };
    }
    depotInspMap[dep].total++;
    if (insp.overallResult === 'Pass') {
      depotInspMap[dep].passed++;
    } else {
      depotInspMap[dep].defects++;
    }
    const v = vehicleMap[insp.vehicleNo?.replace(/\s+/g, '').toUpperCase()];
    const r = (insp.route || v?.assignedRoute || v?.area || '').trim().toUpperCase();
    if (r) depotInspMap[dep].inspectedRoutes.add(r);
  });

  const depotRankings: DepotRankingItem[] = Object.keys(depotInspMap)
    .filter(dep => branchFilter ? dep === branchFilter : true)
    .map(dep => {
      const stats = depotInspMap[dep];
      const assigned = depotVehicleCounts[dep] || 0;
      const depotTotalRoutes = depotRoutesMap[dep]?.size || assigned || 1;
      const completedRoutes = stats.inspectedRoutes.size;
      
      // Compliance rate based strictly on routes: (completedRoutes / totalRoutes) * 100
      const depComplianceRate = depotTotalRoutes > 0 
        ? Number(Math.min(100, (completedRoutes / depotTotalRoutes) * 100).toFixed(1)) 
        : (stats.total > 0 ? 100 : 0);

      // Defect rate: (defects / totalInspections) * 100
      const depDefectRate = stats.total > 0 
        ? Number(((stats.defects / stats.total) * 100).toFixed(1)) 
        : 0;

      const groundedCount = stats.groundedVehicles;

      // Score combines grounded vehicles & defect rate and compliance rate
      const vehicleHealthScore = Math.max(0, 100 - depDefectRate - (groundedCount * 10));
      const depComplianceScore = Number(((depComplianceRate * 0.6) + (vehicleHealthScore * 0.4)).toFixed(1));

      let statusTier: 'Exceptional' | 'Compliant' | 'Needs Attention' = 'Compliant';
      if (depComplianceScore >= 95 && groundedCount === 0 && depDefectRate < 5) statusTier = 'Exceptional';
      else if (depComplianceScore < 85 || groundedCount > 0 || depDefectRate >= 10) statusTier = 'Needs Attention';

      return {
        rank: 1, // Will be set after sorting
        depot: dep,
        depotName: dep,
        assignedVehicles: assigned,
        totalRoutes: depotTotalRoutes,
        completedRoutes,
        totalInspections: stats.total,
        passedCount: stats.passed,
        defectCount: stats.defects,
        groundedVehicles: groundedCount,
        completionRate: depComplianceRate,
        passRate: stats.total > 0 ? Number(((stats.passed / stats.total) * 100).toFixed(1)) : 100,
        complianceRate: depComplianceRate,
        defectRate: depDefectRate,
        complianceScore: depComplianceScore,
        statusTier,
      };
    })
    .sort((a, b) => b.complianceScore - a.complianceScore)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  // 3b. Daily Metrics per Depot (Daily Compliance Breakdown by Depot)
  const dailyDepotMetrics: DailyDepotMetric[] = [];
  const sortedDatesDesc = Object.keys(trendMap).sort((a, b) => b.localeCompare(a));
  
  sortedDatesDesc.forEach(dateKey => {
    const d = new Date(dateKey + 'T00:00:00Z');
    const dayName = dayNames[d.getUTCDay()];
    const dayNum = d.getUTCDate();
    const monthName = monthNames[d.getUTCMonth()];
    const formattedDate = `${dayName}, ${dayNum} ${monthName} ${d.getUTCFullYear()}`;

    depotRankings.forEach(dr => {
      const dep = dr.depot;
      const dayInspections = scopedInspections.filter(insp => {
        const iDate = getInspectionDateKey(insp);
        const iDep = (insp.vehicleBranch || 'BL').toUpperCase();
        return iDate === dateKey && iDep === dep;
      });

      const total = dayInspections.length;
      let passed = 0;
      let defects = 0;
      const dayInspectedRoutes = new Set<string>();

      dayInspections.forEach(insp => {
        if (insp.overallResult === 'Pass') passed++;
        else defects++;
        const v = vehicleMap[insp.vehicleNo?.replace(/\s+/g, '').toUpperCase()];
        const r = (insp.route || v?.assignedRoute || v?.area || '').trim().toUpperCase();
        if (r) dayInspectedRoutes.add(r);
      });

      const assigned = dr.assignedVehicles || 0;
      const totalRoutes = dr.totalRoutes || 1;
      const completedRoutes = dayInspectedRoutes.size;

      // Compliance rate based on routes done:
      const dayComplianceRate = totalRoutes > 0 
        ? Number(Math.min(100, (completedRoutes / totalRoutes) * 100).toFixed(1))
        : (total > 0 ? 100 : 0);

      // Defect rate:
      const dayDefectRate = total > 0 ? Number(((defects / total) * 100).toFixed(1)) : 0;
      const groundedVehicles = dr.groundedVehicles;
      // Daily score combining compliance rate and grounded vehicles / defect rate:
      const healthRate = Math.max(0, 100 - dayDefectRate - (groundedVehicles * 10) - (defects > 0 ? 10 : 0));
      const score = Number(((dayComplianceRate * 0.6) + (healthRate * 0.4)).toFixed(1));

      let statusTier: 'Exceptional' | 'Compliant' | 'Needs Attention' = 'Compliant';
      if (score >= 95 && defects === 0) statusTier = 'Exceptional';
      else if (score < 85 || defects > 0) statusTier = 'Needs Attention';

      dailyDepotMetrics.push({
        date: dateKey,
        formattedDate,
        depot: dep,
        assignedVehicles: assigned,
        totalRoutes,
        completedRoutes,
        totalInspections: total,
        passedCount: passed,
        defectCount: defects,
        groundedVehicles,
        complianceRate: dayComplianceRate,
        defectRate: dayDefectRate,
        score,
        statusTier,
      });
    });
  });

  // 4. Defect Hotspots
  const defectAggMap: Record<string, {
    checkpointId: string;
    title: string;
    category: string;
    defectCount: number;
    severity: 'Critical' | 'High' | 'Medium' | 'Low';
    commonIssues: Set<string>;
    topRemarks: string[];
    affectedVehicles: Set<string>;
  }> = {};

  DEFECT_TEMPLATES.forEach(tmpl => {
    defectAggMap[tmpl.checkpointId] = {
      checkpointId: tmpl.checkpointId,
      title: tmpl.title,
      category: tmpl.category,
      defectCount: 0,
      severity: tmpl.severity,
      commonIssues: new Set(tmpl.issues),
      topRemarks: [],
      affectedVehicles: new Set(),
    };
  });

  scopedInspections.forEach(insp => {
    if (insp.overallResult === 'Fail' && Array.isArray(insp.items)) {
      insp.items.forEach(item => {
        if (item.status === 'Fail') {
          if (!defectAggMap[item.id]) {
            defectAggMap[item.id] = {
              checkpointId: item.id,
              title: item.title,
              category: item.category || 'Inspection Checkpoint',
              defectCount: 0,
              severity: 'Medium',
              commonIssues: new Set(),
              topRemarks: [],
              affectedVehicles: new Set(),
            };
          }
          const entry = defectAggMap[item.id];
          entry.defectCount++;
          entry.affectedVehicles.add(insp.vehicleNo);
          if (item.defectNote && !entry.topRemarks.includes(item.defectNote)) {
            entry.topRemarks.push(item.defectNote);
          }
          if (Array.isArray(item.defectTags)) {
            item.defectTags.forEach(t => entry.commonIssues.add(t));
          }
        }
      });
    }
  });

  const totalDefectsCounted = Object.values(defectAggMap).reduce((acc, curr) => acc + curr.defectCount, 0);

  const defectHotspots: DefectHotspotItem[] = Object.values(defectAggMap)
    .filter(item => item.defectCount > 0)
    .map(item => ({
      checkpointId: item.checkpointId,
      title: item.title,
      category: item.category,
      defectCount: item.defectCount,
      percentage: totalDefectsCounted > 0 ? Number(((item.defectCount / totalDefectsCounted) * 100).toFixed(1)) : 0,
      severity: item.severity,
      commonIssues: Array.from(item.commonIssues).slice(0, 3),
      topRemarks: item.topRemarks.slice(0, 3),
      affectedVehicles: Array.from(item.affectedVehicles).slice(0, 5),
    }))
    .sort((a, b) => b.defectCount - a.defectCount);

  // 5. Recent Defect Logs (for immediate executive action register)
  const recentDefectLogs = scopedInspections
    .filter(i => i.overallResult === 'Fail')
    .slice(0, 15)
    .map(i => ({
      id: i.id,
      timestamp: i.timestamp,
      formattedDate: i.formattedDate || (i.timestamp ? (() => {
        try {
          const d = new Date(i.timestamp);
          return isNaN(d.getTime()) ? String(i.timestamp) : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
        } catch {
          return String(i.timestamp);
        }
      })() : ''),
      vehicleNo: i.vehicleNo,
      vehicleBranch: i.vehicleBranch,
      truckCategory: i.truckCategory,
      driverName: i.driverName,
      driverDepot: i.driverDepot,
      defectCount: i.defectCount || 1,
      defectSummary: i.defectSummary || 'Defects reported during pre-trip checklist',
      failedItems: (i.items || [])
        .filter(it => it.status === 'Fail')
        .map(it => ({
          id: it.id,
          title: it.title,
          defectNote: it.defectNote || 'Check failed',
        })),
    }));

  return {
    summary: {
      totalInspections,
      passedCount,
      defectCount,
      totalRoutes: totalRoutesCount,
      completedRoutes: completedRoutesCount,
      complianceRate,
      defectRate,
      complianceScore,
      firstTimePassRate,
      activeVehiclesInspected,
      totalFleetVehicles,
      fleetCoverageRate,
      groundedVehiclesNow,
      totalDefectItemsLogged,
      avgInspectionsPerDay,
    },
    dailyTrends,
    depotRankings,
    dailyDepotMetrics,
    defectHotspots,
    recentDefectLogs,
    meta: {
      timeframe,
      startDate: startDateKey,
      endDate: endDateKey,
      selectedBranch: branchFilter || 'ALL DEPOTS',
      selectedCategory: categoryFilter || 'ALL TRUCKS',
      generatedAt: new Date().toISOString(),
    },
  };
}
