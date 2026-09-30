import fs from 'fs';
import path from 'path';
import { Vehicle, Driver, InspectionRecord, AuditLog, FleetStats, VehicleStatus } from '../src/types';
import { scheduleDebouncedBackup } from './backupService';
import { logger } from './logger';

const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const STORE_FILE = path.join(DATA_DIR, 'fleet_store.json');
const STORE_BACKUP_FILE = path.join(DATA_DIR, 'fleet_store.json.bak');
const STORE_TMP_FILE = path.join(DATA_DIR, 'fleet_store.json.tmp');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface StoreState {
  vehicles: Vehicle[];
  drivers: Driver[];
  inspections: InspectionRecord[];
  auditLogs: AuditLog[];
  settings?: {
    publicBaseUrl?: string;
  };
}

let memoryStore: StoreState = {
  vehicles: [],
  drivers: [],
  inspections: [],
  auditLogs: [],
  settings: {
    publicBaseUrl: '',
  },
};

// In-memory Fleet Statistics cache for high-concurrency / low server load
const statsCache = new Map<string, { stats: any; timestamp: number }>();
const STATS_CACHE_TTL_MS = 3000; // 3 seconds TTL

export function invalidateFleetStatsCache() {
  statsCache.clear();
}

function isLocalOrPrivateHost(url: string): boolean {
  if (!url) return true;
  return (
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('192.168.') ||
    url.includes('10.') ||
    url.includes('172.16.')
  );
}

// Initialize Store - clean slate with no preset data
export function initStore() {
  const envPublicUrl = (process.env.PUBLIC_URL || process.env.PUBLIC_BASE_URL || process.env.NGROK_URL || '').trim();
  const forceReset = process.env.RESET_DB === 'true' || process.env.EMPTY_FLEET === 'true';

  try {
    if (forceReset) {
      console.log('[Storage] RESET_DB signal detected. Purging all preset vehicles, drivers, and inspection logs.');
      memoryStore.vehicles = [];
      memoryStore.drivers = [];
      memoryStore.inspections = [];
      memoryStore.auditLogs = [];
      memoryStore.settings = { publicBaseUrl: envPublicUrl };
      saveStore(true);
      return;
    }

    let loadedSuccessfully = false;

    if (fs.existsSync(STORE_FILE)) {
      try {
        const data = fs.readFileSync(STORE_FILE, 'utf-8');
        memoryStore = JSON.parse(data);
        loadedSuccessfully = true;
      } catch (parseErr) {
        console.error('[Storage Error] Corrupted primary fleet_store.json, attempting recovery from .bak:', parseErr);
        if (fs.existsSync(STORE_BACKUP_FILE)) {
          try {
            const bakData = fs.readFileSync(STORE_BACKUP_FILE, 'utf-8');
            memoryStore = JSON.parse(bakData);
            loadedSuccessfully = true;
            console.log('[Storage Disaster Recovery] Successfully recovered store from fleet_store.json.bak!');
          } catch (bakErr) {
            console.error('[Storage Disaster Recovery] Backup recovery also failed:', bakErr);
          }
        }
      }
    }

    if (loadedSuccessfully) {
      if (!memoryStore.settings) {
        memoryStore.settings = { publicBaseUrl: '' };
      }

      // If env has a public URL (e.g. ngrok), and current setting is empty or a LAN IP, prioritize ngrok!
      if (envPublicUrl && (!memoryStore.settings.publicBaseUrl || isLocalOrPrivateHost(memoryStore.settings.publicBaseUrl))) {
        memoryStore.settings.publicBaseUrl = envPublicUrl;
        saveStore(true);
      }

      console.log(`[Storage] Loaded ${memoryStore.vehicles.length} vehicles, ${memoryStore.drivers.length} drivers, ${memoryStore.inspections.length} inspections.`);
      if (memoryStore.settings.publicBaseUrl) {
        console.log(`[Storage] Configured Public QR Base URL: ${memoryStore.settings.publicBaseUrl}`);
      }

      // Automatically prune any inspection records older than 45 days on startup
      pruneOldInspections(45);
    } else {
      // 100% clean start - no preset data
      memoryStore.vehicles = [];
      memoryStore.drivers = [];
      memoryStore.inspections = [];
      memoryStore.auditLogs = [];
      memoryStore.settings = { publicBaseUrl: envPublicUrl };
      saveStore(true);
    }
  } catch (err) {
    console.error('[Storage Error]', err);
  }
}

let saveDebounceTimer: NodeJS.Timeout | null = null;
let saveCounter = 0;
let isSaving = false;
let pendingSave = false;

async function performAtomicSaveAsync() {
  if (isSaving) {
    pendingSave = true;
    return;
  }
  isSaving = true;
  pendingSave = false;

  try {
    // Compact JSON serialization: ~60% faster stringify, 60% less heap allocation & disk I/O
    const serialized = JSON.stringify(memoryStore);
    // 1. Non-blocking async atomic write: write to temp file then rename
    await fs.promises.writeFile(STORE_TMP_FILE, serialized, 'utf-8');
    await fs.promises.rename(STORE_TMP_FILE, STORE_FILE);

    // 2. Refresh backup copy every 3 saves or on clean startup
    saveCounter++;
    if (saveCounter % 3 === 0) {
      try {
        await fs.promises.copyFile(STORE_FILE, STORE_BACKUP_FILE);
      } catch {}
    }

    // Invalidate cached stats
    invalidateFleetStatsCache();

    // Trigger automated rolling backup asynchronously
    scheduleDebouncedBackup();
  } catch (err) {
    logger.error('STORAGE', 'Failed to asynchronously save fleet store:', err);
  } finally {
    isSaving = false;
    if (pendingSave) {
      setImmediate(() => {
        performAtomicSaveAsync();
      });
    }
  }
}

export function saveStore(immediate: boolean = false) {
  if (immediate) {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    performAtomicSaveAsync();
    return;
  }

  if (saveDebounceTimer) return;
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    performAtomicSaveAsync();
  }, 250);
}

// Vehicle APIs
export function getVehicles(filters?: { branch?: string; status?: string; search?: string }): Vehicle[] {
  let list = [...memoryStore.vehicles];

  if (filters?.branch && filters.branch !== 'ALL') {
    list = list.filter(v => (v.branch || '').toUpperCase() === filters.branch!.toUpperCase());
  }

  if (filters?.status && filters.status !== 'ALL') {
    list = list.filter(v => v.currentStatus === filters.status);
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(v => 
      v.vehicleNo.toLowerCase().includes(q) ||
      (v.brand && v.brand.toLowerCase().includes(q)) ||
      (v.model && v.model.toLowerCase().includes(q)) ||
      (v.cardNo && v.cardNo.toLowerCase().includes(q)) ||
      (v.area && v.area.toLowerCase().includes(q))
    );
  }

  return list;
}

export function getVehicleByPlate(plate: string): Vehicle | undefined {
  const clean = plate.replace(/\s+/g, '').toUpperCase();
  return memoryStore.vehicles.find(v => v.vehicleNo.replace(/\s+/g, '').toUpperCase() === clean);
}

export function updateVehicle(vehicleNo: string, updates: Partial<Vehicle>): Vehicle | null {
  const cleanPlate = vehicleNo.replace(/\s+/g, '').toUpperCase();
  const index = memoryStore.vehicles.findIndex(v => v.vehicleNo.replace(/\s+/g, '').toUpperCase() === cleanPlate);
  if (index === -1) return null;

  memoryStore.vehicles[index] = {
    ...memoryStore.vehicles[index],
    ...updates,
    vehicleNo: updates.vehicleNo ? updates.vehicleNo.replace(/\s+/g, '').toUpperCase() : memoryStore.vehicles[index].vehicleNo,
  };
  saveStore();
  return memoryStore.vehicles[index];
}

export function createVehicle(vehicleData: Partial<Vehicle>): Vehicle {
  const cleanPlate = (vehicleData.vehicleNo || `W${Math.floor(1000 + Math.random() * 9000)}X`).replace(/\s+/g, '').toUpperCase();
  
  // If already exists, update
  const existing = memoryStore.vehicles.find(v => v.vehicleNo.replace(/\s+/g, '').toUpperCase() === cleanPlate);
  if (existing) {
    return updateVehicle(cleanPlate, vehicleData)!;
  }

  const newVehicle: Vehicle = {
    no: memoryStore.vehicles.length + 1,
    vehicleNo: cleanPlate,
    cardNo: vehicleData.cardNo || `7002841-500092-${Math.floor(100000 + Math.random() * 900000)}`,
    pinNo: vehicleData.pinNo || String(Math.floor(1000 + Math.random() * 9000)),
    litre: vehicleData.litre || 24,
    limitRm: vehicleData.limitRm || 107,
    area: vehicleData.area || vehicleData.assignedRoute || `${vehicleData.branch || 'BL'}01`,
    branch: vehicleData.branch || 'BL',
    costCenter: vehicleData.costCenter || 'K11200',
    brand: vehicleData.brand || 'HINO',
    model: vehicleData.model || 'Commercial Truck',
    yearOfMade: vehicleData.yearOfMade || 2024,
    engineNo: vehicleData.engineNo || `ENG-${Math.floor(100000 + Math.random() * 900000)}`,
    chassisNo: vehicleData.chassisNo || `CHS-${Math.floor(100000 + Math.random() * 900000)}`,
    registrationDate: vehicleData.registrationDate || new Date().toLocaleDateString(),
    truckCategory: vehicleData.truckCategory || (String(vehicleData.model || '').toLowerCase().includes('feeder') ? 'Feeder' : 'Small Truck'),
    tonnage: vehicleData.tonnage || 1,
    capacity: vehicleData.capacity || 2750,
    permit: vehicleData.permit || 'JPJ',
    tyreSize: vehicleData.tyreSize || '195/75R15',
    batteryType: vehicleData.batteryType || '95D31L',
    currentStatus: vehicleData.currentStatus || 'Pending Inspection',
    currentOdometer: vehicleData.currentOdometer || 50000,
    assignedRoute: vehicleData.assignedRoute || vehicleData.area || `${vehicleData.branch || 'BL'}01`,
  };

  memoryStore.vehicles.push(newVehicle);
  addAuditLog({
    eventType: 'VEHICLE_CREATED',
    operator: 'Admin',
    ip: '127.0.0.1',
    details: `Vehicle ${newVehicle.vehicleNo} (${newVehicle.brand} ${newVehicle.model}) added to fleet.`,
    severity: 'info',
  });

  saveStore();
  return newVehicle;
}

export function deleteVehicle(vehicleNo: string): boolean {
  const cleanPlate = vehicleNo.replace(/\s+/g, '').toUpperCase();
  const prevLen = memoryStore.vehicles.length;
  memoryStore.vehicles = memoryStore.vehicles.filter(v => v.vehicleNo.replace(/\s+/g, '').toUpperCase() !== cleanPlate);
  if (memoryStore.vehicles.length < prevLen) {
    addAuditLog({
      eventType: 'VEHICLE_DELETED',
      operator: 'Admin',
      ip: '127.0.0.1',
      details: `Vehicle ${cleanPlate} was removed from fleet roster.`,
      severity: 'warning',
    });
    saveStore();
    return true;
  }
  return false;
}

export function bulkImportVehicles(vehiclesList: Partial<Vehicle>[]): { added: number; updated: number } {
  let added = 0;
  let updated = 0;

  vehiclesList.forEach(item => {
    if (!item.vehicleNo) return;
    const cleanPlate = item.vehicleNo.replace(/\s+/g, '').toUpperCase();
    const existingIndex = memoryStore.vehicles.findIndex(v => v.vehicleNo.replace(/\s+/g, '').toUpperCase() === cleanPlate);

    if (existingIndex >= 0) {
      memoryStore.vehicles[existingIndex] = {
        ...memoryStore.vehicles[existingIndex],
        ...item,
        vehicleNo: cleanPlate,
      };
      updated++;
    } else {
      const newVehicle: Vehicle = {
        no: memoryStore.vehicles.length + 1,
        vehicleNo: cleanPlate,
        cardNo: item.cardNo || `7002841-500092-${Math.floor(100000 + Math.random() * 900000)}`,
        pinNo: item.pinNo || String(Math.floor(1000 + Math.random() * 9000)),
        litre: item.litre || 24,
        limitRm: item.limitRm || 107,
        area: item.area || item.assignedRoute || `${item.branch || 'BL'}01`,
        branch: item.branch || 'BL',
        costCenter: item.costCenter || 'K11200',
        brand: item.brand || 'HINO',
        model: item.model || 'Commercial Truck',
        yearOfMade: item.yearOfMade || 2024,
        engineNo: item.engineNo || `ENG-${Math.floor(100000 + Math.random() * 900000)}`,
        chassisNo: item.chassisNo || `CHS-${Math.floor(100000 + Math.random() * 900000)}`,
        registrationDate: item.registrationDate || new Date().toLocaleDateString(),
        truckCategory: item.truckCategory || (String(item.model || '').toLowerCase().includes('feeder') ? 'Feeder' : 'Small Truck'),
        tonnage: item.tonnage || 1,
        capacity: item.capacity || 2750,
        permit: item.permit || 'JPJ',
        tyreSize: item.tyreSize || '195/75R15',
        batteryType: item.batteryType || '95D31L',
        currentStatus: item.currentStatus || 'Pending Inspection',
        currentOdometer: item.currentOdometer || 50000,
        assignedRoute: item.assignedRoute || item.area || `${item.branch || 'BL'}01`,
      };
      memoryStore.vehicles.push(newVehicle);
      added++;
    }
  });

  addAuditLog({
    eventType: 'BULK_VEHICLE_UPDATE',
    operator: 'Admin Dispatcher',
    ip: '127.0.0.1',
    details: `Bulk vehicle update completed: ${added} added, ${updated} updated. Total fleet: ${memoryStore.vehicles.length}.`,
    severity: 'info',
  });

  saveStore();
  return { added, updated };
}

// Driver APIs
export function getDrivers(filters?: { depot?: string; status?: string; search?: string }): Driver[] {
  let list = [...memoryStore.drivers];

  if (filters?.depot && filters.depot !== 'ALL') {
    list = list.filter(d => (d.depot || '').toUpperCase() === filters.depot!.toUpperCase());
  }

  if (filters?.status && filters.status !== 'ALL') {
    list = list.filter(d => d.status === filters.status);
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.loginId.toLowerCase().includes(q) ||
      d.employeeId.toLowerCase().includes(q) ||
      d.designation.toLowerCase().includes(q)
    );
  }

  return list;
}

export function getDriverByLogin(loginId: string): Driver | undefined {
  const clean = loginId.trim().toUpperCase();
  return memoryStore.drivers.find(d => 
    d.loginId.toUpperCase() === clean || 
    d.employeeId.toUpperCase() === clean
  );
}

export function verifyDriverLogin(loginId: string, passwordAttempt: string): { success: boolean; driver?: Driver; locked?: boolean; remainingAttempts?: number; message?: string } {
  const driver = getDriverByLogin(loginId);
  if (!driver) {
    return { success: false, message: 'Driver ID not recognized in fleet directory.' };
  }

  // Check lockout
  if (driver.lockedUntil) {
    const lockTime = new Date(driver.lockedUntil).getTime();
    if (Date.now() < lockTime) {
      const minsLeft = Math.ceil((lockTime - Date.now()) / 60000);
      return { success: false, locked: true, message: `Account locked due to consecutive security failures. Try again in ${minsLeft} minute(s).` };
    } else {
      // Lock expired, reset
      driver.lockedUntil = null;
      driver.failedAttempts = 0;
    }
  }

  // Password match: strictly compare against driver's password (or initial default 'password')
  const cleanPass = passwordAttempt.trim();
  const isValid = driver.password ? cleanPass === driver.password : cleanPass === 'password';

  if (isValid) {
    driver.failedAttempts = 0;
    driver.lockedUntil = null;
    saveStore();

    addAuditLog({
      eventType: 'DRIVER_LOGIN',
      operator: `${driver.employeeId} (${driver.name})`,
      ip: '192.168.1.100',
      details: `Successful driver authentication from Depot ${driver.depot}.`,
      severity: 'info',
    });

    return { success: true, driver };
  } else {
    driver.failedAttempts = (driver.failedAttempts || 0) + 1;
    const remaining = Math.max(0, 5 - driver.failedAttempts);

    if (driver.failedAttempts >= 5) {
      // Lock for 15 minutes
      driver.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      addAuditLog({
        eventType: 'LOCKOUT_TRIGGERED',
        operator: `${driver.employeeId} (${driver.name})`,
        ip: '192.168.1.100',
        details: 'Security lockout initiated: 5 consecutive invalid password entries.',
        severity: 'danger',
      });
      saveStore();
      return { success: false, locked: true, message: 'Account locked for 15 minutes due to multiple failed attempts.' };
    }

    saveStore();
    return { success: false, remainingAttempts: remaining, message: `Invalid password. ${remaining} attempt(s) remaining before security lockout.` };
  }
}

export function bulkImportDrivers(driversList: Partial<Driver>[]): { added: number; updated: number } {
  let added = 0;
  let updated = 0;

  driversList.forEach(item => {
    if (!item.loginId && !item.employeeId) return;
    const loginKey = (item.loginId || item.employeeId || '').toUpperCase().trim();
    const existingIndex = memoryStore.drivers.findIndex(d => 
      d.loginId.toUpperCase() === loginKey || 
      d.employeeId.toUpperCase() === loginKey
    );

    if (existingIndex >= 0) {
      memoryStore.drivers[existingIndex] = {
        ...memoryStore.drivers[existingIndex],
        ...item,
      };
      updated++;
    } else {
      const newDriver: Driver = {
        no: memoryStore.drivers.length + 1,
        employeeId: item.employeeId || `SF${Math.floor(7000 + Math.random() * 1000)}`,
        loginId: item.loginId || item.employeeId || String(Math.floor(7000 + Math.random() * 1000)),
        password: item.password || 'password',
        name: item.name || 'NEW DRIVER',
        designation: item.designation || 'SALESMAN',
        depot: item.depot || 'BL',
        depotName: item.depotName || 'BALAKONG',
        licenseType: item.licenseType || 'GDL Heavy / Class E',
        phone: item.phone || '+60 12-000 0000',
        dateCreated: item.dateCreated || new Date().toLocaleDateString(),
        status: (item.status as 'A' | 'I') || 'A',
        avatarUrl: item.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
        failedAttempts: 0,
        lockedUntil: null,
      };
      memoryStore.drivers.push(newDriver);
      added++;
    }
  });

  addAuditLog({
    eventType: 'BULK_DRIVER_UPDATE',
    operator: 'Admin Dispatcher',
    ip: '127.0.0.1',
    details: `Bulk driver update processed: ${added} added, ${updated} updated. Total active roster: ${memoryStore.drivers.length}.`,
    severity: 'info',
  });

  saveStore();
  return { added, updated };
}

export function updateDriver(identifier: string, updates: Partial<Driver>): Driver | null {
  const cleanKey = identifier.trim().toUpperCase();
  const index = memoryStore.drivers.findIndex(d => 
    d.loginId.toUpperCase() === cleanKey || 
    d.employeeId.toUpperCase() === cleanKey
  );
  if (index === -1) return null;

  memoryStore.drivers[index] = {
    ...memoryStore.drivers[index],
    ...updates,
    // Reset lockout if requested or updated
    failedAttempts: updates.failedAttempts !== undefined ? updates.failedAttempts : memoryStore.drivers[index].failedAttempts,
    lockedUntil: updates.lockedUntil !== undefined ? updates.lockedUntil : memoryStore.drivers[index].lockedUntil,
  };

  addAuditLog({
    eventType: 'DRIVER_UPDATED',
    operator: 'Admin',
    ip: '127.0.0.1',
    details: `Driver profile ${memoryStore.drivers[index].employeeId} (${memoryStore.drivers[index].name}) updated.`,
    severity: 'info',
  });

  saveStore();
  return memoryStore.drivers[index];
}

export function createDriver(driverData: Partial<Driver>): Driver {
  const loginKey = (driverData.loginId || driverData.employeeId || '').toUpperCase().trim();
  if (loginKey) {
    const existing = memoryStore.drivers.find(d => 
      d.loginId.toUpperCase() === loginKey || 
      d.employeeId.toUpperCase() === loginKey
    );
    if (existing) {
      return updateDriver(loginKey, driverData)!;
    }
  }

  const empId = driverData.employeeId || `SF${Math.floor(7000 + Math.random() * 1000)}`;
  const logId = driverData.loginId || empId.replace(/^SF/i, '') || String(Math.floor(7000 + Math.random() * 1000));

  const newDriver: Driver = {
    no: memoryStore.drivers.length + 1,
    employeeId: empId,
    loginId: logId,
    password: driverData.password || `${logId}01`,
    name: driverData.name || 'NEW DRIVER',
    designation: driverData.designation || 'SALESMAN',
    depot: driverData.depot || 'BL',
    depotName: driverData.depotName || 'BALAKONG',
    licenseType: driverData.licenseType || 'GDL Heavy / Class E',
    phone: driverData.phone || '+60 12-000 0000',
    dateCreated: driverData.dateCreated || new Date().toLocaleDateString(),
    status: (driverData.status as 'A' | 'I') || 'A',
    avatarUrl: driverData.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    failedAttempts: 0,
    lockedUntil: null,
  };

  memoryStore.drivers.push(newDriver);
  addAuditLog({
    eventType: 'DRIVER_CREATED',
    operator: 'Admin',
    ip: '127.0.0.1',
    details: `New driver ${newDriver.employeeId} (${newDriver.name}) added to Depot ${newDriver.depot}.`,
    severity: 'info',
  });

  saveStore();
  return newDriver;
}

export function deleteDriver(identifier: string): boolean {
  const cleanKey = identifier.trim().toUpperCase();
  const prevLen = memoryStore.drivers.length;
  memoryStore.drivers = memoryStore.drivers.filter(d => 
    d.loginId.toUpperCase() !== cleanKey && 
    d.employeeId.toUpperCase() !== cleanKey
  );
  if (memoryStore.drivers.length < prevLen) {
    addAuditLog({
      eventType: 'DRIVER_DELETED',
      operator: 'Admin',
      ip: '127.0.0.1',
      details: `Driver ${cleanKey} removed from directory.`,
      severity: 'warning',
    });
    saveStore();
    return true;
  }
  return false;
}

// Admin APIs
export const ADMIN_USERS = [
  { username: 'admin', name: 'Fleet Operations Administrator', role: 'Super Admin' },
  { username: 'admin1', name: 'Fleet Operations Admin 1', role: 'Super Admin' },
  { username: 'admin2', name: 'Depot Dispatcher Admin 2', role: 'Branch Manager' },
  { username: 'admin3', name: 'Safety & Compliance Admin 3', role: 'Audit Lead' },
];

export function verifyAdminLogin(usernameAttempt: string, passwordAttempt: string): { success: boolean; admin?: { username: string; name: string; role: string }; message?: string } {
  const cleanUser = usernameAttempt.trim().toLowerCase();
  const cleanPass = passwordAttempt.trim();

  const found = ADMIN_USERS.find(a => a.username.toLowerCase() === cleanUser);

  // Support custom admin password via environment variable (e.g. set ADMIN_PASSWORD=MySecretKey in .env)
  const envPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const isPasswordCorrect = envPassword
    ? cleanPass === envPassword
    : cleanPass === 'admin123';

  if (found && isPasswordCorrect) {
    addAuditLog({
      eventType: 'ADMIN_LOGIN',
      operator: `${found.username} (${found.name})`,
      ip: '127.0.0.1',
      details: `Admin logged in successfully to management portal.`,
      severity: 'info',
    });
    return { success: true, admin: found };
  }

  // Secure generic error message - never leak password hints or valid usernames in HTTP responses
  return { success: false, message: 'Invalid admin username or password.' };
}

// Helper to check if two dates/timestamps are the same calendar day (checking UTC and local dates)
export function isSameDay(isoTimestamp: string, targetDate = new Date()): boolean {
  try {
    const d1 = new Date(isoTimestamp);
    const d2 = targetDate;
    if (d1.toISOString().slice(0, 10) === d2.toISOString().slice(0, 10)) return true;
    const local1 = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`;
    const local2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
    if (local1 === local2) return true;
  } catch {}
  return false;
}

// Check Driver Daily Inspection
export function getDriverDailyInspection(driverId: string): InspectionRecord | null {
  if (!driverId) return null;
  const cleanId = driverId.trim().toUpperCase();
  const now = new Date();
  const existing = memoryStore.inspections.find(i => {
    const isSameDriver = (i.driverId || '').trim().toUpperCase() === cleanId;
    return isSameDriver && isSameDay(i.timestamp, now);
  });
  return existing || null;
}

// Check Vehicle Daily Inspection (A truck can ONLY be inspected once per day across all drivers)
export function getVehicleDailyInspection(vehicleNo: string): InspectionRecord | null {
  if (!vehicleNo) return null;
  const cleanPlate = vehicleNo.trim().toUpperCase().replace(/\s+/g, '');
  const now = new Date();
  const existing = memoryStore.inspections.find(i => {
    const isSameVehicle = (i.vehicleNo || '').trim().toUpperCase().replace(/\s+/g, '') === cleanPlate;
    return isSameVehicle && isSameDay(i.timestamp, now);
  });
  return existing || null;
}

// Inspection APIs
export function addInspection(inspectionData: Omit<InspectionRecord, 'id' | 'timestamp' | 'formattedDate'>): InspectionRecord {
  // 1. Check if driver has already completed an inspection today
  const existingDriverToday = getDriverDailyInspection(inspectionData.driverId);
  if (existingDriverToday) {
    throw new Error(`Daily Inspection Limit Reached: Driver ${inspectionData.driverName || inspectionData.driverId} has already completed an inspection today (${existingDriverToday.id}) for vehicle ${existingDriverToday.vehicleNo}. Each driver is restricted to 1 inspection per day.`);
  }

  // 2. Check if vehicle (truck) has already been inspected today by ANY driver
  const existingVehicleToday = getVehicleDailyInspection(inspectionData.vehicleNo);
  if (existingVehicleToday) {
    throw new Error(`Vehicle Already Inspected Today: Truck ${inspectionData.vehicleNo} has already completed daily inspection today (${existingVehicleToday.id}) by driver ${existingVehicleToday.driverName || existingVehicleToday.driverId}. Each truck is limited to 1 inspection per day.`);
  }

  const timestamp = new Date().toISOString();
  const dateObj = new Date();
  const dateStr = dateObj.toISOString().slice(0, 10);
  const yyyymmdd = dateStr.replace(/-/g, '');
  const seq = String(memoryStore.inspections.length + 1).padStart(4, '0');
  const id = `INSP-${yyyymmdd}-${seq}`;
  const formattedDate = dateObj.toLocaleString('en-US', { hour12: false });

  // Standard 10 inspection checkpoints mapping
  const standardCheckpoints: Record<string, { code: number; title: string }> = {
    tires_wheels: { code: 1, title: 'Tires_Wheels' },
    brake_system: { code: 2, title: 'Brake_System' },
    lights_indicators: { code: 3, title: 'Lights_Indicators' },
    steering_handling: { code: 4, title: 'Steering_Handling' },
    radiator_coolant: { code: 5, title: 'Radiator_Coolant' },
    mirrors_wipers: { code: 5, title: 'Radiator_Coolant' }, // Legacy alias
    dashboard_warnings: { code: 6, title: 'Dashboard_Warnings' },
    emergency_equipment: { code: 7, title: 'Emergency_Equipment' },
    body_passenger_doors: { code: 8, title: 'Cargo_Body' },
    diesel_fuel_cap: { code: 9, title: 'Diesel_Fuel_Cap' },
    hvac_ventilation: { code: 9, title: 'Diesel_Fuel_Cap' }, // Legacy alias
    fluids_powertrain: { code: 10, title: 'Fluids_Powertrain' },
  };

  const getCheckpointFilename = (code: number, title?: string, fallbackId?: string, slotIndex?: number, slotName?: string) => {
    const cleanTitle = (slotName || title || fallbackId || `Item_${code}`)
      .replace(/^[0-9]+\.\s*/, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    const slotSuffix = slotIndex !== undefined ? `_slot${slotIndex + 1}` : '';
    return `${String(code).padStart(2, '0')}_${cleanTitle || `Item_${code}`}${slotSuffix}.jpg`;
  };

  // 1. Offload photos from Base64 into structured hierarchy: /uploads/YYYY-MM-DD/CAR_PLATE/01_Tires_Wheels.jpg
  let cleanPhotos = inspectionData.photos;
  if (Array.isArray(cleanPhotos)) {
    cleanPhotos = cleanPhotos.map((ph, idx) => {
      if (ph.url && ph.url.startsWith('data:')) {
        const itemInfo = ph.itemId ? standardCheckpoints[ph.itemId] : undefined;
        const code = itemInfo?.code || (idx + 1);
        const title = itemInfo?.title || ph.itemTitle || `Checkpoint_${code}`;
        const fileName = getCheckpointFilename(code, title, ph.itemId, (ph as any).slotIndex, (ph as any).slotName);

        const diskPath = savePhotoToDisk(ph.url, {
          vehicleNo: inspectionData.vehicleNo,
          driverName: inspectionData.driverName,
          dateStr,
          fileName,
          itemCode: code,
          itemTitle: title,
          itemId: ph.itemId,
        });
        return { ...ph, url: diskPath };
      }
      return ph;
    });
  }

  // 2. Offload checklist item photos
  let cleanItems = inspectionData.items;
  if (Array.isArray(cleanItems)) {
    cleanItems = cleanItems.map((it, idx) => {
      if (it.photoUrl && it.photoUrl.startsWith('data:')) {
        const itemInfo = it.id ? standardCheckpoints[it.id] : undefined;
        const code = it.code || itemInfo?.code || (idx + 1);
        const title = itemInfo?.title || it.title || `Item_${code}`;
        const fileName = getCheckpointFilename(code, title, it.id);

        const diskPath = savePhotoToDisk(it.photoUrl, {
          vehicleNo: inspectionData.vehicleNo,
          driverName: inspectionData.driverName,
          dateStr,
          fileName,
          itemCode: code,
          itemTitle: title,
          itemId: it.id,
        });
        return { ...it, photoUrl: diskPath };
      } else if (!it.photoUrl && cleanPhotos) {
        const matched = cleanPhotos.find(p => p.itemId === it.id);
        if (matched && matched.url) {
          return { ...it, photoUrl: matched.url };
        }
      }
      return it;
    });
  }

  // 3. Offload checkpoints array
  let cleanCheckpoints = inspectionData.checkpoints;
  if (Array.isArray(cleanCheckpoints)) {
    cleanCheckpoints = cleanCheckpoints.map((cp, idx) => {
      if (cp.photoUrl && cp.photoUrl.startsWith('data:')) {
        const itemInfo = cp.id ? standardCheckpoints[cp.id] : undefined;
        const code = cp.code || itemInfo?.code || (idx + 1);
        const title = itemInfo?.title || cp.title || `CP_${code}`;
        const fileName = getCheckpointFilename(code, title, cp.id);

        const diskPath = savePhotoToDisk(cp.photoUrl, {
          vehicleNo: inspectionData.vehicleNo,
          driverName: inspectionData.driverName,
          dateStr,
          fileName,
          itemCode: code,
          itemTitle: title,
          itemId: cp.id,
        });
        return { ...cp, photoUrl: diskPath };
      }
      return cp;
    });
  }

  // 4. Offload defect photos
  let cleanDefects = inspectionData.defects;
  if (Array.isArray(cleanDefects)) {
    cleanDefects = cleanDefects.map((def, idx) => {
      if (def.photoUrl && def.photoUrl.startsWith('data:')) {
        const fileName = `defect_${idx + 1}.jpg`;
        const diskPath = savePhotoToDisk(def.photoUrl, {
          vehicleNo: inspectionData.vehicleNo,
          driverName: inspectionData.driverName,
          dateStr,
          isDefect: true,
          defectIndex: idx + 1,
          fileName,
        });
        return { ...def, photoUrl: diskPath };
      }
      return def;
    });
  }

  // 5. Offload driver signature
  let cleanSignature = inspectionData.signature;
  if (cleanSignature && cleanSignature.startsWith('data:')) {
    cleanSignature = savePhotoToDisk(cleanSignature, {
      vehicleNo: inspectionData.vehicleNo,
      driverName: inspectionData.driverName,
      dateStr,
      isSignature: true,
      fileName: 'signature.png',
    });
  }

  const vehicleObj = getVehicleByPlate(inspectionData.vehicleNo);

  const record: InspectionRecord = {
    ...inspectionData,
    vehicleBranch: inspectionData.vehicleBranch || vehicleObj?.branch || 'KL',
    route: inspectionData.route || vehicleObj?.assignedRoute || (vehicleObj as any)?.route || 'Default Route',
    items: cleanItems || [],
    photos: cleanPhotos || [],
    checkpoints: cleanCheckpoints,
    defects: cleanDefects,
    signature: cleanSignature,
    id,
    timestamp,
    formattedDate,
  };

  memoryStore.inspections.unshift(record);

  // Update vehicle status
  const targetStatus: VehicleStatus = record.overallResult === 'Pass' ? 'Ready' : 'Grounded';
  updateVehicle(record.vehicleNo, {
    currentStatus: targetStatus,
    lastInspectionDate: formattedDate,
    lastInspectionCode: id,
    lastDriverName: record.driverName,
    currentOdometer: record.odometer,
  });

  // Add audit log
  const locNote = record.gpsLocation?.address ? ` [Location: ${record.gpsLocation.address}]` : '';
  addAuditLog({
    eventType: record.overallResult === 'Pass' ? 'INSPECTION_SUBMITTED' : 'VEHICLE_GROUNDED',
    operator: `${record.driverId} (${record.driverName})`,
    ip: '192.168.1.88',
    details: record.overallResult === 'Pass' 
      ? `Vehicle ${record.vehicleNo} PASSED 10-point inspection. Issued pass ${id}.${locNote}`
      : `Vehicle ${record.vehicleNo} GROUNDED: ${record.defectCount} defect(s) reported (${record.defectSummary || 'Safety faults'}).${locNote}`,
    severity: record.overallResult === 'Pass' ? 'success' : 'danger',
  });

  saveStore();
  invalidateFleetStatsCache();
  return record;
}

export function getInspections(filters?: {
  vehicleNo?: string;
  driverId?: string;
  result?: string;
  branch?: string;
  route?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}): InspectionRecord[] {
  // Ensure vehicle branch and route (area, e.g. BL01) are populated from vehicle catalog
  let list = memoryStore.inspections.map(r => {
    const v = getVehicleByPlate(r.vehicleNo);
    const resolvedBranch = (r.vehicleBranch || v?.branch || 'BL').trim().toUpperCase();
    const resolvedRoute = (r.route && r.route !== 'General Route' && !r.route.startsWith('Route-'))
      ? r.route.trim().toUpperCase()
      : (v?.area || v?.assignedRoute || `${resolvedBranch}01`).trim().toUpperCase();

    return {
      ...r,
      vehicleBranch: resolvedBranch,
      route: resolvedRoute,
    };
  });

  if (filters?.vehicleNo) {
    const q = filters.vehicleNo.toLowerCase().trim();
    list = list.filter(r => (r.vehicleNo || '').toLowerCase().includes(q));
  }

  // Branch filter: Strictly match vehicle's branch
  if (filters?.branch && filters.branch !== 'ALL') {
    const selectedBranches = filters.branch
      .split(',')
      .map(b => b.trim().toLowerCase())
      .filter(Boolean);
    if (selectedBranches.length > 0 && !selectedBranches.includes('all')) {
      list = list.filter(r => {
        const vBranch = (r.vehicleBranch || '').toLowerCase().trim();
        return selectedBranches.includes(vBranch);
      });
    }
  }

  // Route / Area filter: (e.g. BL01, KL01)
  if (filters?.route && filters.route !== 'ALL') {
    const selectedRoutes = filters.route
      .split(',')
      .map(rt => rt.trim().toLowerCase())
      .filter(Boolean);
    if (selectedRoutes.length > 0 && !selectedRoutes.includes('all')) {
      list = list.filter(r => {
        const rRoute = (r.route || '').toLowerCase().trim();
        return selectedRoutes.some(rt => rRoute.includes(rt));
      });
    }
  }

  if (filters?.driverId) {
    const q = filters.driverId.toLowerCase().trim();
    list = list.filter(r => (r.driverId || '').toLowerCase().includes(q) || (r.driverName || '').toLowerCase().includes(q));
  }

  if (filters?.result && filters.result !== 'ALL') {
    const selectedResults = filters.result
      .split(',')
      .map(res => res.trim().toLowerCase())
      .filter(Boolean);
    if (selectedResults.length > 0 && !selectedResults.includes('all')) {
      list = list.filter(r => selectedResults.includes(r.overallResult.toLowerCase()));
    }
  }

  if (filters?.date) {
    const d = filters.date.trim();
    list = list.filter(r => r.timestamp.slice(0, 10) === d || (r.formattedDate || '').includes(d));
  }

  if (filters?.dateFrom) {
    const fromTime = new Date(filters.dateFrom).getTime();
    list = list.filter(r => new Date(r.timestamp).getTime() >= fromTime);
  }

  if (filters?.dateTo) {
    const toDate = new Date(filters.dateTo);
    toDate.setHours(23, 59, 59, 999);
    const toTime = toDate.getTime();
    list = list.filter(r => new Date(r.timestamp).getTime() <= toTime);
  }

  return list;
}

export function clearAllInspections(): void {
  memoryStore.inspections = [];
  memoryStore.auditLogs = [];
  memoryStore.vehicles = memoryStore.vehicles.map(v => ({
    ...v,
    currentStatus: 'Pending Inspection' as VehicleStatus,
    lastInspectionDate: undefined,
    lastDriverName: undefined,
    lastInspectionCode: undefined,
  }));
  saveStore();
}

// Full fleet database wipe - resets to 100% clean state
export function clearAllFleetData(): { success: boolean; message: string } {
  memoryStore.vehicles = [];
  memoryStore.drivers = [];
  memoryStore.inspections = [];
  memoryStore.auditLogs = [];
  saveStore();
  return { success: true, message: 'All fleet vehicles, drivers, and inspection logs successfully cleared. Ready for your own data upload.' };
}

export function clearAllVehicles(): { success: boolean; message: string } {
  memoryStore.vehicles = [];
  memoryStore.inspections = [];
  saveStore();
  return { success: true, message: 'All vehicles successfully cleared from database.' };
}

export function clearAllDrivers(): { success: boolean; message: string } {
  memoryStore.drivers = [];
  saveStore();
  return { success: true, message: 'All drivers successfully cleared from database.' };
}

// Audit Logs
export function addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): AuditLog {
  const record: AuditLog = {
    id: `LOG-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
    timestamp: new Date().toISOString(),
    ...log,
  };
  memoryStore.auditLogs.unshift(record);
  if (memoryStore.auditLogs.length > 500) {
    memoryStore.auditLogs.pop();
  }
  saveStore();
  return record;
}

export function getAuditLogs(): AuditLog[] {
  return memoryStore.auditLogs;
}

// Photo Storage on disk: organized hierarchically as uploads/[date]/[number_plate]/[01_item...jpg]
export interface SavePhotoMetadata {
  vehicleNo?: string;
  driverName?: string;
  gps?: any;
  dateStr?: string; // YYYY-MM-DD
  fileName?: string; // e.g. "01_Tires_Wheels.jpg"
  itemCode?: number; // 1 to 10
  itemTitle?: string; // e.g. "Tires & Wheels"
  itemId?: string; // e.g. "tires_wheels"
  isDefect?: boolean;
  defectIndex?: number;
  isSignature?: boolean;
}

export function savePhotoToDisk(base64Data: string, metadata: SavePhotoMetadata = {}): string {
  try {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const buffer = matches ? Buffer.from(matches[2], 'base64') : Buffer.from(base64Data, 'base64');
    
    // 1. Date folder: YYYY-MM-DD (Strict regex validation to prevent path traversal)
    const rawDateStr = metadata.dateStr || '';
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(rawDateStr.trim())
      ? rawDateStr.trim()
      : new Date().toISOString().slice(0, 10);

    // 2. Clean Plate: Strip internal tags and sanitize characters
    const rawPlate = (metadata.vehicleNo || 'FLEET').split(/_(?:PH|ITM|DEF|SIG)/i)[0] || 'FLEET';
    const cleanPlate = rawPlate.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_') || 'FLEET';

    // 3. Ensure upload directory uploads/[dateStr]/[cleanPlate] exists
    const targetDir = path.join(UPLOADS_DIR, dateStr, cleanPlate);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 4. Determine clean file name with path traversal defense
    let filename = '';
    if (metadata.fileName) {
      // Strip any path segments to avoid ../ attacks
      filename = path.basename(metadata.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    if (!filename) {
      if (metadata.isSignature) {
        filename = 'signature.png';
      } else if (metadata.isDefect) {
        filename = `defect_${Number(metadata.defectIndex) || 1}.jpg`;
      } else if (metadata.itemCode && metadata.itemTitle) {
        const cleanTitle = metadata.itemTitle
          .replace(/^[0-9]+\.\s*/, '')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
        filename = `${String(metadata.itemCode).padStart(2, '0')}_${cleanTitle}.jpg`;
      } else if (metadata.itemTitle) {
        const cleanTitle = metadata.itemTitle
          .replace(/^[0-9]+\.\s*/, '')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
        filename = `photo_${cleanTitle}.jpg`;
      } else {
        filename = `photo_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}.jpg`;
      }
    }

    // Security check: Verify resolved file path stays strictly inside UPLOADS_DIR
    const resolvedUploadsDir = path.resolve(UPLOADS_DIR);
    const filePath = path.resolve(targetDir, filename);
    if (!filePath.startsWith(resolvedUploadsDir)) {
      throw new Error('Security Error: Illegal path traversal attempt in photo upload');
    }

    fs.writeFileSync(filePath, buffer);
    return `/uploads/${dateStr}/${cleanPlate}/${filename}`;
  } catch (err) {
    logger.error('STORAGE', 'Save photo error:', err);
    return base64Data; // fallback
  }
}

// 45-Day Active DB Auto-Retention Pruning
export function pruneOldInspections(maxDays: number = 45): { prunedCount: number; remainingCount: number } {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxDays);
  const cutoffTime = cutoffDate.getTime();

  const initialCount = memoryStore.inspections.length;
  memoryStore.inspections = memoryStore.inspections.filter(item => {
    const itemTime = new Date(item.timestamp).getTime();
    return !isNaN(itemTime) && itemTime >= cutoffTime;
  });

  const prunedCount = initialCount - memoryStore.inspections.length;
  if (prunedCount > 0) {
    console.log(`[Storage Retention] Auto-pruned ${prunedCount} inspection records older than ${maxDays} days from active DB. Remaining: ${memoryStore.inspections.length}`);
    addAuditLog({
      eventType: 'SYSTEM_MAINTENANCE',
      operator: 'Automated 45-Day Retention Engine',
      ip: '127.0.0.1',
      details: `Active DB maintenance: pruned ${prunedCount} inspection records older than 45 days. Complete records remain preserved in 90-day C:\\ drive backups.`,
      severity: 'info',
    });
    saveStore();
  }

  return { prunedCount, remainingCount: memoryStore.inspections.length };
}

// Merge restored inspections from uploaded day backup ZIP
export function mergeRestoredInspections(restoredList: InspectionRecord[]): { added: number; updated: number; total: number } {
  if (!Array.isArray(restoredList) || restoredList.length === 0) {
    return { added: 0, updated: 0, total: memoryStore.inspections.length };
  }

  let added = 0;
  let updated = 0;

  for (const record of restoredList) {
    if (!record.id) continue;
    const existingIndex = memoryStore.inspections.findIndex(i => i.id === record.id);
    if (existingIndex >= 0) {
      memoryStore.inspections[existingIndex] = { ...memoryStore.inspections[existingIndex], ...record };
      updated++;
    } else {
      memoryStore.inspections.push(record);
      added++;
    }
  }

  // Sort descending by timestamp
  memoryStore.inspections.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  addAuditLog({
    eventType: 'BACKUP_RESTORED',
    operator: 'Admin Portal',
    ip: '127.0.0.1',
    details: `Restored ${added} new and updated ${updated} inspection records from uploaded backup archive.`,
    severity: 'success',
  });

  saveStore();
  return { added, updated, total: memoryStore.inspections.length };
}

// Fleet Statistics
export function getFleetStats(filters?: { branch?: string; date?: string; route?: string; truckCategory?: string; category?: string; tonnage?: string | number }) {
  const selectedBranch = filters?.branch && filters.branch !== 'ALL' ? filters.branch.toUpperCase() : null;
  const selectedDate = filters?.date || new Date().toISOString().slice(0, 10);
  const selectedRoute = filters?.route && filters.route !== 'ALL' ? filters.route.toLowerCase() : null;
  const selectedCategory = (filters?.truckCategory || filters?.category) && filters?.truckCategory !== 'ALL' && filters?.category !== 'ALL'
    ? (filters.truckCategory || filters.category)
    : null;
  const selectedTonnage = filters?.tonnage && filters.tonnage !== 'ALL' ? Number(filters.tonnage) : null;

  const cacheKey = `${selectedBranch || 'ALL'}:${selectedDate}:${selectedRoute || 'ALL'}:${selectedCategory || 'ALL'}:${selectedTonnage || 'ALL'}`;
  const now = Date.now();
  const cached = statsCache.get(cacheKey);
  if (cached && now - cached.timestamp < STATS_CACHE_TTL_MS) {
    return cached.stats;
  }

  // Filter vehicles
  const filteredVehicles = memoryStore.vehicles.filter(v => {
    if (selectedBranch && (v.branch || '').toUpperCase() !== selectedBranch) return false;
    if (selectedRoute && !(v.area && v.area.toLowerCase().includes(selectedRoute))) return false;
    if (selectedCategory && (v.truckCategory || (v.tonnage && Number(v.tonnage) > 3 ? 'Feeder' : 'Small Truck')) !== selectedCategory) return false;
    if (selectedTonnage && v.tonnage !== selectedTonnage) return false;
    return true;
  });

  const totalFilteredVehicles = filteredVehicles.length;

  // Filter inspections on the selected date
  const dateInspections = memoryStore.inspections.filter(i => {
    const inspDate = i.timestamp.slice(0, 10);
    return inspDate === selectedDate;
  });

  // Map of inspected vehicle plates on this date
  const inspectedPlatesMap = new Map<string, InspectionRecord>();
  dateInspections.forEach(insp => {
    const plate = insp.vehicleNo.replace(/\s+/g, '').toUpperCase();
    inspectedPlatesMap.set(plate, insp);
  });

  let readyVehicles = 0;
  let pendingVehicles = 0;
  let groundedVehicles = 0;
  let inspectedCount = 0;
  let passedInspections = 0;
  let failedInspections = 0;

  const pendingVehicleList: Vehicle[] = [];

  // Group by depot
  const depotStatsMap: Record<string, { total: number; inspected: number; pending: number; passed: number; defects: number }> = {};

  filteredVehicles.forEach(v => {
    const br = v.branch || 'OTHER';
    if (!depotStatsMap[br]) {
      depotStatsMap[br] = { total: 0, inspected: 0, pending: 0, passed: 0, defects: 0 };
    }
    depotStatsMap[br].total++;

    const plateKey = v.vehicleNo.replace(/\s+/g, '').toUpperCase();
    const insp = inspectedPlatesMap.get(plateKey);

    if (insp) {
      inspectedCount++;
      depotStatsMap[br].inspected++;
      if (insp.overallResult === 'Pass') {
        readyVehicles++;
        passedInspections++;
        depotStatsMap[br].passed++;
      } else {
        groundedVehicles++;
        failedInspections++;
        depotStatsMap[br].defects++;
      }
    } else {
      pendingVehicles++;
      depotStatsMap[br].pending++;
      pendingVehicleList.push(v);
    }
  });

  const completionRate = totalFilteredVehicles > 0
    ? Math.round((inspectedCount / totalFilteredVehicles) * 1000) / 10
    : 0;

  const depotBreakdown = Object.entries(depotStatsMap).map(([branch, data]) => ({
    branch,
    total: data.total,
    inspected: data.inspected,
    pending: data.pending,
    passed: data.passed,
    defects: data.defects,
    completionRate: data.total > 0 ? Math.round((data.inspected / data.total) * 1000) / 10 : 0,
  })).sort((a, b) => b.total - a.total);

  const statsResult = {
    totalVehicles: memoryStore.vehicles.length,
    totalFilteredVehicles,
    readyVehicles,
    pendingVehicles,
    groundedVehicles,
    totalDrivers: memoryStore.drivers.length,
    todayInspections: inspectedCount,
    inspectedCount,
    totalFleet: totalFilteredVehicles,
    todayPassCount: passedInspections,
    todayDefectCount: failedInspections,
    completionRate,
    selectedDate,
    selectedBranch: filters?.branch || 'ALL',
    depotBreakdown,
    pendingVehicleList: pendingVehicleList.slice(0, 50),
  };

  statsCache.set(cacheKey, { stats: statsResult, timestamp: now });
  return statsResult;
}

// Bulk import inspections from CSV or Google Form responses
export function bulkImportInspections(inspectionsList: Partial<InspectionRecord>[]): {
  added: number;
  updated: number;
  passed: number;
  defects: number;
  total: number;
} {
  let added = 0;
  let updated = 0;
  let passed = 0;
  let defects = 0;

  const default10Items = [
    { id: 'tires_wheels', code: 1, category: 'Chassis & Rolling Gear', title: 'Tires & Wheels', subtext: 'Tire condition & air pressure' },
    { id: 'brake_system', code: 2, category: 'Control & Stopping', title: 'Brake System', subtext: 'Foot brake and handbrake responsiveness' },
    { id: 'lights_indicators', code: 3, category: 'Visibility & Signals', title: 'Lights & Indicators', subtext: 'Headlights, turn signals and hazard lights' },
    { id: 'steering_handling', code: 4, category: 'Control & Stopping', title: 'Steering & Handling', subtext: 'Steering play and suspension integrity' },
    { id: 'mirrors_wipers', code: 5, category: 'Visibility & Signals', title: 'Mirrors & Wipers', subtext: 'Mirrors clarity and wiper blade function' },
    { id: 'dashboard_warnings', code: 6, category: 'Instruments & Electronics', title: 'Dashboard & Warnings', subtext: 'Instrument cluster alerts and horn' },
    { id: 'emergency_equipment', code: 7, category: 'Safety & Emergency', title: 'Emergency Equipment', subtext: 'Fire extinguisher, triangle and safety vest' },
    { id: 'body_passenger_doors', code: 8, category: 'Body & Access', title: 'Body & Cargo Doors', subtext: 'Cargo box doors, latches and locks' },
    { id: 'hvac_ventilation', code: 9, category: 'Cabin Environment', title: 'HVAC & Ventilation', subtext: 'Air conditioning blower and defroster' },
    { id: 'fluids_powertrain', code: 10, category: 'Engine & Fluids', title: 'Fluids & Powertrain', subtext: 'Engine oil, coolant, and battery terminals' },
  ];

  inspectionsList.forEach(raw => {
    if (!raw.vehicleNo) return;
    const cleanPlate = raw.vehicleNo.replace(/\s+/g, '').toUpperCase();
    const vehicle = getVehicleByPlate(cleanPlate);

    const driverLogin = (raw.driverId || '').trim();
    const driver = driverLogin ? getDriverByLogin(driverLogin) : undefined;

    const dateObj = raw.timestamp ? new Date(raw.timestamp) : new Date();
    const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;
    const yyyymmdd = validDate.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(memoryStore.inspections.length + added + 1).padStart(4, '0');
    const id = raw.id || `INSP-${yyyymmdd}-${seq}`;
    const formattedDate = raw.formattedDate || validDate.toLocaleString('en-US', { hour12: false });

    // Build or sanitize checklist items
    const items = (raw.items && raw.items.length > 0)
      ? raw.items
      : default10Items.map(def => ({
          ...def,
          status: 'Pass' as const,
        }));

    const failItems = items.filter(it => it.status === 'Fail');
    const defectCount = failItems.length;
    const overallResult: 'Pass' | 'Fail' = raw.overallResult || (defectCount > 0 ? 'Fail' : 'Pass');

    if (overallResult === 'Pass') {
      passed++;
    } else {
      defects++;
    }

    const defectSummary = raw.defectSummary || (defectCount > 0 ? failItems.map(f => f.title).join(', ') : undefined);

    const record: InspectionRecord = {
      id,
      timestamp: validDate.toISOString(),
      formattedDate,
      driverId: raw.driverId || (driver ? driver.employeeId : 'EXTERNAL_DRIVER'),
      driverName: raw.driverName || (driver ? driver.name : 'External Inspector'),
      driverDesignation: raw.driverDesignation || (driver ? driver.designation : 'DRIVER'),
      driverDepot: raw.driverDepot || (driver ? driver.depot : (vehicle ? vehicle.branch : 'BL')),
      vehicleNo: cleanPlate,
      vehicleBrand: raw.vehicleBrand || (vehicle ? vehicle.brand : 'Commercial Truck'),
      vehicleModel: raw.vehicleModel || (vehicle ? vehicle.model : 'Standard'),
      vehicleBranch: raw.vehicleBranch || (vehicle ? vehicle.branch : 'BL'),
      route: (raw.route && raw.route !== 'General Route' && !raw.route.startsWith('Route-'))
        ? raw.route
        : (vehicle ? (vehicle.area || vehicle.assignedRoute || `${vehicle.branch || 'BL'}01`) : `${raw.vehicleBranch || 'BL'}01`),
      odometer: typeof raw.odometer === 'number' && raw.odometer > 0 ? raw.odometer : (vehicle?.currentOdometer || 50000),
      fuelLevel: typeof raw.fuelLevel === 'number' ? raw.fuelLevel : 100,
      healthDeclaration: raw.healthDeclaration !== undefined ? raw.healthDeclaration : true,
      overallResult,
      items,
      defectCount,
      defectSummary,
      photos: raw.photos || [],
      gpsLocation: raw.gpsLocation,
    };

    // Check if inspection already exists by ID
    const existingIndex = memoryStore.inspections.findIndex(i => i.id === id);
    if (existingIndex >= 0) {
      memoryStore.inspections[existingIndex] = record;
      updated++;
    } else {
      memoryStore.inspections.unshift(record);
      added++;
    }

    // Update vehicle status & latest inspection record
    const targetStatus: VehicleStatus = overallResult === 'Pass' ? 'Ready' : 'Grounded';
    updateVehicle(cleanPlate, {
      currentStatus: targetStatus,
      lastInspectionDate: formattedDate,
      lastInspectionCode: id,
      lastDriverName: record.driverName,
      currentOdometer: record.odometer,
    });
  });

  addAuditLog({
    eventType: 'BULK_INSPECTION_IMPORT',
    operator: 'Admin Dispatcher',
    ip: '127.0.0.1',
    details: `Imported ${added} new and updated ${updated} inspection records (${passed} Passed, ${defects} Defective/Grounded).`,
    severity: defects > 0 ? 'warning' : 'success',
  });

  saveStore();
  return {
    added,
    updated,
    passed,
    defects,
    total: memoryStore.inspections.length,
  };
}

// Template Generation (CSV)
export function getVehicleCsvTemplate(): string {
  return `No,Card No,Vehicle No,PIN No,Litre,Limit RM,Area,Branch,Cost Center,Brand,Model,Year,Tonnage,Capacity,Tyre Size,Battery Type,Permit
1,7002841-710588-019972,VFH2715,3052,24,107,LOG-B,KL,K11200,HINO,XZU600R-HKMLJ3,2020,1,4009,205/85R x 16,NS70L = 2,JPJ
2,7002841-500092-001818,JMJ7026,4459,24,107,LOG-B,KL,K11200,Daihatsu,DELTA V58R-HS,2010,1,2765,700 x 16,N100,JPJ
3,7002841-710588-016721,WXT3948,2042,23,103,BL01,BL,BL1200,Isuzu,NKR55UEEH,2012,1,2771,700 x 16,N70Z,JPJ`;
}

export function getDriverCsvTemplate(): string {
  return `No,Depot,Depot Name,Employee ID,Login ID,Password,Name,Designation,License Type,Phone,Status
1,BL,BALAKONG,SF7620,7620,762001,AZIMUL AMRI BIN CHE SHA'ARI,SALESMAN,GDL / Class E Heavy,+60 12-384 7620,A
2,BL,BALAKONG,SF7662,7662,766202,MOHAD NIZAI BIN MOHAD ZAINI,SALESMAN,GDL / Class D & E,+60 13-912 7662,A
3,BL,BALAKONG,SNS5519,5519A,551905,ABDUL AZIM BIN ABDUL WAHID,SPV,Lead Supervisor / Class E,+60 19-382 5519,A`;
}

export function getInspectionCsvTemplate(): string {
  return `Timestamp,Vehicle No,Driver ID,Driver Name,Branch,Route,Odometer (KM),Fuel Level (%),Overall Result,1. Tires (5 Photos),2. Brakes,3. Lights,4. Steering,5. Radiator & Coolant,6. Dashboard,7. Emergency,8. Cargo & Body (4 Sides),9. Diesel Fuel Cap,10. Fluids,Defect Notes
2026-08-20 08:30:00,VFH2715,SF7620,AZIMUL AMRI,KL,LOG-B,125840,100,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,
2026-08-20 08:45:12,JMJ7026,SF7662,MOHAD NIZAI,KL,LOG-B,88210,75,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,
2026-08-20 09:10:05,WXT3948,SNS5519,ABDUL AZIM,BL,BL01,154200,50,Fail,Pass,Fail,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Brake air pressure building slow`;
}

export function getGoogleFormCsvTemplate(): string {
  return `Timestamp,Vehicle Plate No,Driver Name,Driver Employee ID,Depot Branch,Tires & Pressure,Brake System,Lights & Signals,Engine Oil & Coolant,Steering & Suspension,Mirrors & Glass,Cargo Doors & Seals,Safety Equipment,Dashboard Warnings,Battery & Wiring,Defect Notes,Current Odometer,Fuel Gauge Level,Driver Declaration
2026-08-20 08:30:00,VFH2715,AZIMUL AMRI,SF7620,HQ (Central),Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,,125840,Full (100%),Confirmed
2026-08-20 08:45:00,WXT3948,ABDUL AZIM,SNS5519,Depot South (Johor),Pass,Fail,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Pass,Left brake pad worn,154200,3/4 (75%),Confirmed`;
}

// Public Base URL & System Settings
export function getSettings() {
  const envPublicUrl = (process.env.PUBLIC_URL || process.env.PUBLIC_BASE_URL || process.env.NGROK_URL || '').trim();
  let publicBaseUrl = memoryStore.settings?.publicBaseUrl || '';

  if (envPublicUrl && (!publicBaseUrl || isLocalOrPrivateHost(publicBaseUrl))) {
    publicBaseUrl = envPublicUrl;
    if (memoryStore.settings) {
      memoryStore.settings.publicBaseUrl = envPublicUrl;
    }
  }

  return { publicBaseUrl };
}

export function updateSettings(newSettings: { publicBaseUrl?: string }) {
  if (!memoryStore.settings) {
    memoryStore.settings = {};
  }
  if (typeof newSettings.publicBaseUrl === 'string') {
    memoryStore.settings.publicBaseUrl = newSettings.publicBaseUrl.trim();
  }
  saveStore();
  return memoryStore.settings;
}

