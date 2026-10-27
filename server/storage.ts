import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  Vehicle,
  Driver,
  InspectionRecord,
  AuditLog,
  FleetStats,
  VehicleStatus,
  PhotoQuality,
  AssessmentAccuracy,
  PhotoQaAudit,
  DriverQaReportResult,
  DriverQaPatternSummary,
  DepotQaPatternGroup,
  DriverMistakeItem,
  InspectionPhoto,
  DriverAuditedInspectionRef,
} from '../src/types';
import { INITIAL_VEHICLES, INITIAL_DRIVERS } from './seedData';
import { scheduleDebouncedBackup } from './backupService';
import { logger } from './logger';
import { generateHistoricalInspections, calculateExecutiveAnalytics, ExecutiveAnalyticsResult } from './analyticsService';
import {
  initOperationsStore,
  getRegions as opGetRegions,
  createRegion as opCreateRegion,
  updateRegion as opUpdateRegion,
  deleteRegion as opDeleteRegion,
  getDepots as opGetDepots,
  createDepot as opCreateDepot,
  updateDepot as opUpdateDepot,
  deleteDepot as opDeleteDepot,
  getRoutes as opGetRoutes,
  createRoute as opCreateRoute,
  updateRoute as opUpdateRoute,
  deleteRoute as opDeleteRoute,
  syncRoutesFromVehicles,
  linkVehicleToOperations,
  linkAllVehiclesToOperations,
} from './operationsService';
import {
  initRbacStore,
  verifyRbacLogin,
  getRbacRoles,
  createRbacRole,
  updateRbacRole,
  deleteRbacRole,
  getRbacUsers,
  createRbacUser,
  updateRbacUser,
  deleteRbacUser,
} from './rbacService';
import {
  connectMssql,
  isMssqlConnected,
  getMssqlConfig,
  dbLoadVehicles,
  dbSaveVehicle,
  dbDeleteVehicle,
  dbBulkSaveVehicles,
  dbLoadDrivers,
  dbSaveDriver,
  dbDeleteDriver,
  dbBulkSaveDrivers,
  dbLoadInspections,
  dbSaveInspection,
  dbDeleteInspection,
  dbLoadAuditLogs,
  dbSaveAuditLog,
  dbClearDrivers,
  dbClearVehicles,
  dbClearInspections,
} from './mssql';

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

// Generates a 12-character high-entropy static secret QR token (e.g., 'E9B71C40A83F')
// Impossible to enumerate or guess, providing anti-spoofing security for windshield decals.
export function generateVehicleQrToken(): string {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
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

      if (memoryStore.settings.publicBaseUrl) {
        console.log(`[Storage] Configured Public QR Base URL: ${memoryStore.settings.publicBaseUrl}`);
      }

      if (memoryStore.vehicles.length === 0 && memoryStore.drivers.length === 0) {
        memoryStore.vehicles = [...INITIAL_VEHICLES];
        memoryStore.drivers = [...INITIAL_DRIVERS];
        memoryStore.vehicles.forEach((v) => {
          if (!v.qrToken) v.qrToken = generateVehicleQrToken();
        });
        seedHistoricalInspections(20);
        seedSampleDriverQaAudits();
        saveStoreSync();
        console.log(`[Storage] Re-seeded with ${memoryStore.vehicles.length} vehicles, ${memoryStore.drivers.length} drivers, and sample audits.`);
      }

      // Ensure all vehicles (including legacy/existing) have a unified static QR security token
      let legacyMigrated = false;
      memoryStore.vehicles.forEach((v) => {
        if (!v.qrToken || typeof v.qrToken !== 'string' || !v.qrToken.trim()) {
          v.qrToken = generateVehicleQrToken();
          legacyMigrated = true;
        }
      });
      if (legacyMigrated) {
        console.log(`[Storage] Automatically assigned unique static QR security tokens to ${memoryStore.vehicles.length} existing vehicles.`);
        saveStore(true);
      }

      // Automatically prune any inspection records older than 45 days on startup
      pruneOldInspections(45);

      // Seed initial sample inspections and QA audits if store is empty
      if (memoryStore.inspections.length === 0) {
        seedHistoricalInspections(20);
        seedSampleDriverQaAudits();
        console.log(`[Storage] Auto-seeded initial inspections with driver QA audits.`);
      }
    } else {
      // Clean start with starter vehicles, drivers, and pre-trip inspection audits
      memoryStore.vehicles = [...INITIAL_VEHICLES];
      memoryStore.drivers = [...INITIAL_DRIVERS];
      memoryStore.vehicles.forEach((v) => {
        if (!v.qrToken) v.qrToken = generateVehicleQrToken();
      });
      memoryStore.inspections = [];
      memoryStore.auditLogs = [];
      memoryStore.settings = { publicBaseUrl: envPublicUrl };
      seedHistoricalInspections(20);
      seedSampleDriverQaAudits();
      saveStoreSync();
      console.log(`[Storage] Initialized store with starter vehicles, drivers, and inspection audits.`);
    }

    // Initialize Master Operations Hierarchy (Regions, Depots, Routes)
    initOperationsStore(memoryStore.vehicles);
    linkAllVehiclesToOperations(memoryStore.vehicles);

    // Initialize Role-Based Access Control & Staff Accounts
    initRbacStore();

    // Connect to Microsoft SQL Server (SSMS) and synchronize data
    if (process.env.DB_TYPE !== 'json') {
      connectMssql().then(async (connected) => {
        if (connected) {
          try {
            const [dbV, dbD, dbI, dbA] = await Promise.all([
              dbLoadVehicles(),
              dbLoadDrivers(),
              dbLoadInspections(),
              dbLoadAuditLogs(),
            ]);
            // When connected to production SQL Server:
            // 1. Never push mock/seed data to the production database!
            // 2. Mark demoPurged = true so local demo seed data is permanently disabled.
            if (!memoryStore.settings) memoryStore.settings = {};
            (memoryStore.settings as any).demoPurged = true;
            (memoryStore.settings as any).productionDbActive = true;

            if (dbV.length > 0) {
              memoryStore.vehicles = dbV;
              let mssqlTokenMigrated = 0;
              for (const v of memoryStore.vehicles) {
                if (!v.qrToken || typeof v.qrToken !== 'string' || !v.qrToken.trim()) {
                  v.qrToken = generateVehicleQrToken();
                  dbSaveVehicle(v).catch((e) => console.error(`[MSSQL] Failed to save generated token for ${v.vehicleNo}:`, e));
                  mssqlTokenMigrated++;
                }
              }
              if (mssqlTokenMigrated > 0) {
                console.log(`[Storage] Auto-generated static QR security tokens for ${mssqlTokenMigrated} vehicles in SQL Server.`);
              }
            } else {
              // Production DB connected but Vehicles table is empty: do not auto-push demo data!
              console.log(`[MSSQL Production Safe Sync] SQL Server Vehicles table is empty. Keeping clean 0 vehicles in production; discarded local mock vehicles.`);
              memoryStore.vehicles = [];
            }

            if (dbD.length > 0) {
              memoryStore.drivers = dbD;
            } else {
              console.log(`[MSSQL Production Safe Sync] SQL Server Drivers table is empty. Discarded local mock drivers.`);
              memoryStore.drivers = [];
            }

            if (dbI.length > 0) {
              // Intelligent Merge: Retain QA audits, photo mistake audits, and non-overwritten fields
              const localMap = new Map<string, InspectionRecord>();
              for (const loc of memoryStore.inspections) {
                if (loc && loc.id) localMap.set(loc.id, loc);
              }

              const mergedList: InspectionRecord[] = [];
              const seenIds = new Set<string>();

              for (const dbRec of dbI) {
                seenIds.add(dbRec.id);
                const localRec = localMap.get(dbRec.id);
                if (localRec) {
                  // If local record has QA audit decisions, preserve them!
                  const hasLocalQa = localRec.qaAudits && Object.keys(localRec.qaAudits).length > 0;
                  const hasDbQa = dbRec.qaAudits && Object.keys(dbRec.qaAudits).length > 0;

                  const mergedQaAudits = hasDbQa ? { ...localRec.qaAudits, ...dbRec.qaAudits } : (localRec.qaAudits || dbRec.qaAudits);
                  const mergedQaAuditedAt = dbRec.qaAuditedAt || localRec.qaAuditedAt;
                  const mergedQaAuditedBy = dbRec.qaAuditedBy || localRec.qaAuditedBy;

                  // Merge photos: keep local photos if DB photos array is empty
                  let mergedPhotos = (dbRec.photos && dbRec.photos.length > 0) ? dbRec.photos : (localRec.photos || []);
                  if (localRec.photos && localRec.photos.length > 0 && mergedPhotos.length > 0) {
                    mergedPhotos = mergedPhotos.map(p => {
                      const lp = localRec.photos.find(x => x.url === p.url || x.slotName === p.slotName || x.itemId === p.itemId);
                      return {
                        ...p,
                        qaAudit: p.qaAudit || lp?.qaAudit,
                      };
                    });
                  }

                  mergedList.push({
                    ...dbRec,
                    qaAudits: mergedQaAudits,
                    qaAuditedAt: mergedQaAuditedAt,
                    qaAuditedBy: mergedQaAuditedBy,
                    photos: mergedPhotos,
                    items: (dbRec.items && dbRec.items.length > 0) ? dbRec.items : (localRec.items || []),
                  });
                } else {
                  mergedList.push(dbRec);
                }
              }

              // Preserve any locally created inspections not yet in DB
              for (const [id, localRec] of localMap.entries()) {
                if (!seenIds.has(id)) {
                  mergedList.push(localRec);
                }
              }

              memoryStore.inspections = mergedList;
            } else {
              // If SQL Server Inspections table is empty, do NOT discard local inspections with audits!
              if (memoryStore.inspections.length > 0) {
                console.log(`[MSSQL Safe Sync] SQL Server Inspections table has 0 rows. Preserving ${memoryStore.inspections.length} local inspection records with QA audits.`);
              }
            }

            if (dbA.length > 0) {
              memoryStore.auditLogs = dbA;
            } else {
              memoryStore.auditLogs = [];
            }

            console.log(`[MSSQL Sync] Successfully synchronized with SQL Server: ${memoryStore.vehicles.length} Vehicles, ${memoryStore.drivers.length} Drivers, ${memoryStore.inspections.length} Inspections.`);
            saveStore(true);
            invalidateFleetStatsCache();
          } catch (syncErr) {
            console.error('[MSSQL Sync Error] Failed to populate cache from SQL Server:', syncErr);
          }
        }
      }).catch(err => {
        console.warn('[MSSQL Connection Warning] Startup connection failed, running on local cache:', err);
      });
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

export function saveStoreSync() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  try {
    const serialized = JSON.stringify(memoryStore);
    fs.writeFileSync(STORE_TMP_FILE, serialized, 'utf-8');
    fs.renameSync(STORE_TMP_FILE, STORE_FILE);
    try {
      fs.copyFileSync(STORE_FILE, STORE_BACKUP_FILE);
    } catch {}
    invalidateFleetStatsCache();
  } catch (err) {
    logger.error('STORAGE', 'Failed to synchronously save fleet store:', err);
  }
}

// Vehicle APIs
export function getVehicleEffectiveStatus(v: Vehicle, targetDate: Date | string = new Date()): VehicleStatus {
  // 1. Check if the vehicle has completed an inspection on the target calendar date
  const cleanPlate = v.vehicleNo.replace(/\s+/g, '').toUpperCase();
  const insp = memoryStore.inspections.find(i => 
    i.vehicleNo.replace(/\s+/g, '').toUpperCase() === cleanPlate &&
    isSameDay(i.timestamp, targetDate)
  );

  if (insp) {
    return insp.overallResult === 'Pass' ? 'Ready' : 'Grounded';
  }

  // 2. If no inspection on target date:
  // If the vehicle was grounded for maintenance or safety, it remains Grounded
  if (v.currentStatus === 'Grounded') {
    return 'Grounded';
  }

  // 3. New calendar day with no inspection performed yet: strictly Pending Inspection!
  return 'Pending Inspection';
}

export function getVehicles(filters?: { branch?: string; status?: string; search?: string }): Vehicle[] {
  const today = new Date();
  let list = memoryStore.vehicles.map(v => ({
    ...v,
    currentStatus: getVehicleEffectiveStatus(v, today),
  }));

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
  const v = memoryStore.vehicles.find(item => item.vehicleNo.replace(/\s+/g, '').toUpperCase() === clean);
  if (!v) return undefined;
  return {
    ...v,
    currentStatus: getVehicleEffectiveStatus(v, new Date()),
  };
}

export function updateVehicle(vehicleNo: string, updates: Partial<Vehicle>, isInspectionSystem: boolean = false): Vehicle | null {
  const cleanPlate = vehicleNo.replace(/\s+/g, '').toUpperCase();
  const index = memoryStore.vehicles.findIndex(v => v.vehicleNo.replace(/\s+/g, '').toUpperCase() === cleanPlate);
  if (index === -1) return null;

  const currentStatus = memoryStore.vehicles[index].currentStatus;
  const newStatus = updates.currentStatus;

  if (!isInspectionSystem && newStatus && newStatus !== currentStatus) {
    // Admin Rule 1: Admin CANNOT manually set a vehicle to 'Ready'
    // Ready can ONLY be achieved when a driver completes and passes a verified pre-trip inspection
    if (newStatus === 'Ready') {
      throw new Error(`Data Integrity Rule: Direct manual change to 'Ready' is prohibited. A vehicle can only achieve 'Ready' certification when a driver conducts and passes today's pre-trip inspection.`);
    }

    // Admin Rule 2: Admin CANNOT manually change a 'Ready' vehicle to 'Pending Inspection'
    // If a Ready vehicle has an issue, Admin must ground it instead
    if (currentStatus === 'Ready' && newStatus === 'Pending Inspection') {
      throw new Error(`Data Integrity Rule: Admin cannot change 'Ready' to 'Pending Inspection'. If maintenance or repair is required, change it to 'Grounded'.`);
    }

    // Admin Rule 3: Allowed transitions for Admin:
    // - 'Grounded' -> 'Pending Inspection' (Released from maintenance, waiting for driver inspection)
    // - 'Ready' -> 'Grounded' (Immediate grounding for fault/defect)
    // - 'Pending Inspection' -> 'Grounded' (Hold for maintenance)
  }

  memoryStore.vehicles[index] = {
    ...memoryStore.vehicles[index],
    ...updates,
    vehicleNo: updates.vehicleNo ? updates.vehicleNo.replace(/\s+/g, '').toUpperCase() : memoryStore.vehicles[index].vehicleNo,
  };
  linkVehicleToOperations(memoryStore.vehicles[index]);
  invalidateFleetStatsCache();
  saveStore();
  dbSaveVehicle(memoryStore.vehicles[index]).catch(e => console.error('[MSSQL Error] saveVehicle:', e));
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
    qrToken: vehicleData.qrToken || generateVehicleQrToken(),
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

  linkVehicleToOperations(newVehicle);
  memoryStore.vehicles.push(newVehicle);
  addAuditLog({
    eventType: 'VEHICLE_CREATED',
    operator: 'Admin',
    ip: '127.0.0.1',
    details: `Vehicle ${newVehicle.vehicleNo} (${newVehicle.brand} ${newVehicle.model}) added to fleet.`,
    severity: 'info',
  });

  saveStore();
  dbSaveVehicle(newVehicle).catch(e => console.error('[MSSQL Error] createVehicle:', e));
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
    dbDeleteVehicle(cleanPlate).catch(e => console.error('[MSSQL Error] deleteVehicle:', e));
    return true;
  }
  return false;
}

export async function bulkImportVehicles(vehiclesList: Partial<Vehicle>[]): Promise<{ added: number; updated: number; dbSaved?: number }> {
  let added = 0;
  let updated = 0;

  vehiclesList.forEach(item => {
    if (!item.vehicleNo) return;
    const cleanPlate = item.vehicleNo.replace(/\s+/g, '').toUpperCase();
    const existingIndex = memoryStore.vehicles.findIndex(v => v.vehicleNo.replace(/\s+/g, '').toUpperCase() === cleanPlate);

    if (existingIndex >= 0) {
      const existingVehicle = memoryStore.vehicles[existingIndex];
      memoryStore.vehicles[existingIndex] = {
        ...existingVehicle,
        ...item,
        vehicleNo: cleanPlate,
        qrToken: item.qrToken || existingVehicle.qrToken || generateVehicleQrToken(),
      };
      updated++;
    } else {
      const newVehicle: Vehicle = {
        no: memoryStore.vehicles.length + 1,
        vehicleNo: cleanPlate,
        qrToken: item.qrToken || generateVehicleQrToken(),
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

  const vehiclesToSave: Vehicle[] = [];
  vehiclesList.forEach(v => {
    if (v.vehicleNo) {
      const fullV = getVehicleByPlate(v.vehicleNo);
      if (fullV && !vehiclesToSave.some(x => x.vehicleNo === fullV.vehicleNo)) {
        vehiclesToSave.push(fullV);
      }
    }
  });

  let dbSaved = 0;
  if (vehiclesToSave.length > 0) {
    const res = await dbBulkSaveVehicles(vehiclesToSave);
    dbSaved = res.saved;
  }

  return { added, updated, dbSaved };
}

export function regenerateVehicleQrToken(vehicleNo: string): Vehicle | null {
  const cleanPlate = vehicleNo.replace(/\s+/g, '').toUpperCase();
  const index = memoryStore.vehicles.findIndex(v => v.vehicleNo.replace(/\s+/g, '').toUpperCase() === cleanPlate);
  if (index === -1) return null;

  const newToken = generateVehicleQrToken();
  memoryStore.vehicles[index] = {
    ...memoryStore.vehicles[index],
    qrToken: newToken,
  };

  addAuditLog({
    eventType: 'VEHICLE_UPDATED',
    operator: 'Admin',
    ip: '127.0.0.1',
    details: `Regenerated static QR security token for vehicle ${cleanPlate}.`,
    severity: 'warning',
  });

  saveStore();
  dbSaveVehicle(memoryStore.vehicles[index]).catch(e => console.error('[MSSQL Error] regenerateVehicleQrToken:', e));
  return memoryStore.vehicles[index];
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
  const clean = String(loginId || '').trim().toUpperCase();
  if (!clean) return undefined;
  return memoryStore.drivers.find(d => {
    const dLogin = String(d.loginId || '').trim().toUpperCase();
    const dEmp = String(d.employeeId || '').trim().toUpperCase();
    return dLogin === clean || dEmp === clean;
  });
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
    const remaining = Math.max(0, 30 - driver.failedAttempts);

    if (driver.failedAttempts >= 30) {
      // Lock account after 30 failed attempts until admin unlocks or 24 hours pass
      driver.lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      addAuditLog({
        eventType: 'LOCKOUT_TRIGGERED',
        operator: `${driver.employeeId} (${driver.name})`,
        ip: '192.168.1.100',
        details: 'Security lockout initiated: 30 consecutive invalid password entries.',
        severity: 'danger',
      });
      saveStore();
      dbSaveDriver(driver).catch(e => console.error('[MSSQL Error] saveDriverLockout:', e));
      return { success: false, locked: true, message: 'Account locked: 30 consecutive invalid password attempts reached. Please contact dispatch administrator to unlock your account.' };
    }

    saveStore();
    return { success: false, remainingAttempts: remaining, message: `Invalid password. ${remaining} attempt(s) remaining before security lockout.` };
  }
}

export async function bulkImportDrivers(driversList: Partial<Driver>[]): Promise<{ added: number; updated: number; dbSaved?: number }> {
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

  const driversToSave: Driver[] = [];
  driversList.forEach(item => {
    const key = (item.loginId || item.employeeId || '').toUpperCase().trim();
    if (key) {
      const fullD = getDriverByLogin(key);
      if (fullD && !driversToSave.some(x => x.employeeId === fullD.employeeId)) {
        driversToSave.push(fullD);
      }
    }
  });

  let dbSaved = 0;
  if (driversToSave.length > 0) {
    const res = await dbBulkSaveDrivers(driversToSave);
    dbSaved = res.saved;
  }

  return { added, updated, dbSaved };
}

export function updateDriver(
  identifier: string,
  updates: Partial<Driver>,
  options?: {
    originalEmployeeId?: string;
    originalLoginId?: string;
    fallbackIdentifier?: string;
  }
): Driver | null {
  const cleanKey = String(identifier || '').trim().toUpperCase();
  const cleanOrigEmp = String(options?.originalEmployeeId || '').trim().toUpperCase();
  const cleanOrigLogin = String(options?.originalLoginId || '').trim().toUpperCase();
  const cleanFallback = String(options?.fallbackIdentifier || '').trim().toUpperCase();
  const cleanNewEmp = String(updates.employeeId || '').trim().toUpperCase();
  const cleanNewLogin = String(updates.loginId || '').trim().toUpperCase();

  const index = memoryStore.drivers.findIndex(d => {
    const dLogin = String(d.loginId || '').trim().toUpperCase();
    const dEmp = String(d.employeeId || '').trim().toUpperCase();

    // 1. Match original identifier
    if (cleanKey && (dLogin === cleanKey || dEmp === cleanKey)) return true;
    // 2. Match original employee ID if provided
    if (cleanOrigEmp && dEmp === cleanOrigEmp) return true;
    // 3. Match original login ID if provided
    if (cleanOrigLogin && dLogin === cleanOrigLogin) return true;
    // 4. Match fallback identifier
    if (cleanFallback && (dLogin === cleanFallback || dEmp === cleanFallback)) return true;
    // 5. Match by driver number if provided
    if (typeof updates.no === 'number' && typeof d.no === 'number' && d.no === updates.no) return true;
    // 6. Match by new employee ID if already matching
    if (cleanNewEmp && dEmp === cleanNewEmp) return true;
    // 7. Match by new login ID if already matching
    if (cleanNewLogin && dLogin === cleanNewLogin) return true;

    return false;
  });

  if (index === -1) return null;

  const originalDriver = { ...memoryStore.drivers[index] };

  memoryStore.drivers[index] = {
    ...memoryStore.drivers[index],
    ...updates,
    loginId: updates.loginId !== undefined ? String(updates.loginId).trim() : memoryStore.drivers[index].loginId,
    employeeId: updates.employeeId !== undefined ? String(updates.employeeId).trim().toUpperCase() : memoryStore.drivers[index].employeeId,
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
  dbSaveDriver(memoryStore.drivers[index], {
    origEmployeeId: originalDriver.employeeId,
    origLoginId: originalDriver.loginId,
  }).catch(e => console.error('[MSSQL Error] updateDriver:', e));

  return memoryStore.drivers[index];
}

export function unlockDriver(identifier: string): { success: boolean; message: string; driver?: Driver } {
  const cleanKey = String(identifier || '').trim().toUpperCase();
  const index = memoryStore.drivers.findIndex(d => {
    const dLogin = String(d.loginId || '').trim().toUpperCase();
    const dEmp = String(d.employeeId || '').trim().toUpperCase();
    return dLogin === cleanKey || dEmp === cleanKey;
  });
  if (index === -1) {
    return { success: false, message: `Driver with ID ${identifier} not found.` };
  }

  memoryStore.drivers[index].failedAttempts = 0;
  memoryStore.drivers[index].lockedUntil = null;

  addAuditLog({
    eventType: 'DRIVER_UNLOCKED',
    operator: 'Admin Dispatcher',
    ip: '127.0.0.1',
    details: `Driver account ${memoryStore.drivers[index].employeeId} (${memoryStore.drivers[index].name}) unlocked by admin. Security counters reset.`,
    severity: 'info',
  });

  saveStore();
  dbSaveDriver(memoryStore.drivers[index]).catch(e => console.error('[MSSQL Error] unlockDriver:', e));
  return {
    success: true,
    message: `Driver ${memoryStore.drivers[index].name} (${memoryStore.drivers[index].employeeId}) unlocked successfully. Attempts reset to 0.`,
    driver: memoryStore.drivers[index],
  };
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
  dbSaveDriver(newDriver).catch(e => console.error('[MSSQL Error] createDriver:', e));
  return newDriver;
}

export function deleteDriver(identifier: string): boolean {
  const cleanKey = String(identifier || '').trim().toUpperCase();
  if (!cleanKey) return false;
  const prevLen = memoryStore.drivers.length;
  memoryStore.drivers = memoryStore.drivers.filter(d => {
    const dLogin = String(d.loginId || '').trim().toUpperCase();
    const dEmp = String(d.employeeId || '').trim().toUpperCase();
    return dLogin !== cleanKey && dEmp !== cleanKey;
  });
  if (memoryStore.drivers.length < prevLen) {
    addAuditLog({
      eventType: 'DRIVER_DELETED',
      operator: 'Admin',
      ip: '127.0.0.1',
      details: `Driver ${cleanKey} removed from directory.`,
      severity: 'warning',
    });
    saveStore();
    dbDeleteDriver(cleanKey).catch(e => console.error('[MSSQL Error] deleteDriver:', e));
    return true;
  }
  return false;
}

// Admin & RBAC Authentication APIs
export function verifyAdminLogin(
  usernameAttempt: string,
  passwordAttempt: string
): {
  success: boolean;
  admin?: {
    username: string;
    name: string;
    role: string;
    assignedDepot?: string;
    permissions?: string[];
  };
  message?: string;
} {
  const result = verifyRbacLogin(usernameAttempt, passwordAttempt);
  if (result.success && result.admin) {
    addAuditLog({
      eventType: 'ADMIN_LOGIN',
      operator: `${result.admin.username} (${result.admin.name} - ${result.admin.role})`,
      ip: '127.0.0.1',
      details: `Staff logged into admin portal. Role: [${result.admin.role}], Assigned Depot: [${result.admin.assignedDepot || 'ALL'}]`,
      severity: 'info',
    });
    return result;
  }
  return { success: false, message: result.message || 'Invalid admin username or password.' };
}

export {
  getRbacRoles,
  createRbacRole,
  updateRbacRole,
  deleteRbacRole,
  getRbacUsers,
  createRbacUser,
  updateRbacUser,
  deleteRbacUser,
};

// Helper to extract calendar date string (YYYY-MM-DD) in local / Asia/Kuala_Lumpur (UTC+8) timezone
export function getCalendarDateString(val: Date | string | InspectionRecord | any = new Date()): string {
  if (!val) return '';

  // 1. If an inspection object is passed, follow Inspection Audit (formattedDate first)
  if (typeof val === 'object' && !(val instanceof Date)) {
    const formatted = String(val.formattedDate || val.FormattedDate || '').trim();
    if (formatted) {
      const dmy = formatted.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
      const ymd = formatted.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    }
    const raw = val.timestamp ?? val.Timestamp;
    if (raw) return getCalendarDateString(raw);
    const idMatch = String(val.id || val.InspectionId || '').match(/INSP-(\d{4})(\d{2})(\d{2})/i);
    if (idMatch) return `${idMatch[1]}-${idMatch[2]}-${idMatch[3]}`;
    return '';
  }

  // 2. If a string is passed
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return '';
    // Check DD/MM/YYYY format
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    // Check YYYY-MM-DD local format without Z or timezone offset
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd && !s.includes('Z') && !/[+\-]\d{2}:?\d{2}$/.test(s)) {
      return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    }
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kuala_Lumpur',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
      }
    } catch {}
    return ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : '';
  }

  // 3. Date instance
  try {
    if (isNaN(val.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(val);
  } catch {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

// Helper to check if two dates/timestamps/records are on the exact same calendar day in UTC+8
export function isSameDay(val1: any, val2: any = new Date()): boolean {
  if (!val1) return false;
  try {
    const date1 = getCalendarDateString(val1);
    const date2 = getCalendarDateString(val2);
    return Boolean(date1 && date2 && date1 === date2);
  } catch {
    return false;
  }
}

// Helper to determine if a driver is a Supervisor (SPV / SUPERVISOR)
export function isSupervisor(designation?: string | null): boolean {
  if (!designation) return false;
  const d = String(designation).trim().toUpperCase();
  return d === 'SPV' || d.includes('SUPERVISOR') || d.includes('SPV');
}

// Get all inspections completed by driver today
export function getDriverDailyInspections(driverIdentifier: string): InspectionRecord[] {
  if (!driverIdentifier) return [];
  const clean = driverIdentifier.trim().toUpperCase();
  const driver = getDriverByLogin(driverIdentifier);
  const employeeId = (driver?.employeeId || '').trim().toUpperCase();
  const loginId = (driver?.loginId || '').trim().toUpperCase();
  const now = new Date();

  return memoryStore.inspections.filter(i => {
    const inspDriverId = (i.driverId || '').trim().toUpperCase();
    const isSameDriver =
      inspDriverId === clean ||
      (employeeId && inspDriverId === employeeId) ||
      (loginId && inspDriverId === loginId);
    return isSameDriver && isSameDay(i, now);
  });
}

// Check Driver Daily Inspection (returns latest today inspection record if exists)
export function getDriverDailyInspection(driverId: string): InspectionRecord | null {
  const list = getDriverDailyInspections(driverId);
  return list[0] || null;
}

// Check Driver Inspection Status with Role-Based Limits (Supervisor up to 3, others 1)
export function getDriverInspectionStatus(driverId: string, customDesignation?: string): {
  isSupervisor: boolean;
  maxAllowed: number;
  currentCount: number;
  hasReachedLimit: boolean;
  latestInspection: InspectionRecord | null;
  inspections: InspectionRecord[];
} {
  const driver = getDriverByLogin(driverId);
  const designation = customDesignation || driver?.designation || '';
  const isSpv = isSupervisor(designation);
  const maxAllowed = isSpv ? 3 : 1;
  const todayInspections = getDriverDailyInspections(driverId);
  const currentCount = todayInspections.length;
  const hasReachedLimit = currentCount >= maxAllowed;

  return {
    isSupervisor: isSpv,
    maxAllowed,
    currentCount,
    hasReachedLimit,
    latestInspection: todayInspections[0] || null,
    inspections: todayInspections,
  };
}

// Check Vehicle Daily Inspection (returns latest today inspection record if exists)
export function getVehicleDailyInspection(vehicleNo: string): InspectionRecord | null {
  if (!vehicleNo) return null;
  const cleanPlate = vehicleNo.trim().toUpperCase().replace(/\s+/g, '');
  const now = new Date();
  const existing = memoryStore.inspections.find(i => {
    const isSameVehicle = (i.vehicleNo || '').trim().toUpperCase().replace(/\s+/g, '') === cleanPlate;
    return isSameVehicle && isSameDay(i, now);
  });
  return existing || null;
}

// Inspection APIs
export function addInspection(inspectionData: Omit<InspectionRecord, 'id' | 'timestamp' | 'formattedDate'>): InspectionRecord {
  const todayStr = getCalendarDateString(new Date());

  const driver = getDriverByLogin(inspectionData.driverId);
  const designation = inspectionData.driverDesignation || driver?.designation || '';
  const isSpv = isSupervisor(designation);
  const maxAllowed = isSpv ? 3 : 1;
  const todayDriverInspections = getDriverDailyInspections(inspectionData.driverId);

  // 1. Enforce driver daily inspection limit:
  // Supervisor: up to 3 inspections per calendar day
  // Regular drivers: strictly 1 inspection per calendar day
  if (todayDriverInspections.length >= maxAllowed) {
    if (isSpv) {
      throw new Error(`Supervisor Daily Limit Reached: Supervisor ${inspectionData.driverName || inspectionData.driverId} has reached the maximum daily limit of 3 vehicle inspections for date ${todayStr}.`);
    } else {
      const first = todayDriverInspections[0];
      throw new Error(`Daily Inspection Limit Reached: Driver ${inspectionData.driverName || inspectionData.driverId} has already completed daily inspection for date ${todayStr} (Cert #${first?.id || 'DONE'}) for vehicle ${first?.vehicleNo || inspectionData.vehicleNo}. Each driver is restricted to 1 vehicle inspection per calendar day.`);
    }
  }

  // 2. Enforce vehicle check:
  // Regular drivers cannot inspect a truck already inspected today.
  // Supervisors CAN inspect/re-inspect/audit vehicles (up to their 3 daily inspections quota).
  const existingVehicleToday = getVehicleDailyInspection(inspectionData.vehicleNo);
  if (existingVehicleToday && !isSpv) {
    throw new Error(`Vehicle Already Inspected Today: Truck ${inspectionData.vehicleNo} has already completed daily inspection for date ${todayStr} (Cert #${existingVehicleToday.id}) by driver ${existingVehicleToday.driverName || existingVehicleToday.driverId}. Each truck is limited to 1 inspection per calendar day.`);
  }

  const dateObj = new Date();
  const timestamp = dateObj.toISOString(); // Store absolute timestamp in UTC; convert for business dates/display.
  const dateStr = getCalendarDateString(dateObj);
  const yyyymmdd = dateStr.replace(/-/g, '');
  const seq = String(memoryStore.inspections.length + 1).padStart(4, '0');
  const id = `INSP-${yyyymmdd}-${seq}`;
  const formattedDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(dateObj);

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
  const primaryPhotoUrl = cleanPhotos?.[0]?.url || cleanItems?.find(i => i.photoUrl)?.photoUrl || '';
  const photoCount = cleanPhotos?.length || 0;

  const record: InspectionRecord = {
    ...inspectionData,
    vehicleBranch: inspectionData.vehicleBranch || vehicleObj?.branch || 'KL',
    route: inspectionData.route || vehicleObj?.assignedRoute || (vehicleObj as any)?.route || 'Default Route',
    items: cleanItems || [],
    photos: cleanPhotos || [],
    primaryPhotoUrl,
    photoCount,
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
  }, true);

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
  dbSaveInspection(record).catch(e => console.error('[MSSQL Error] saveInspection:', e));
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
    list = list.filter(r => getCalendarDateString(r) === d);
  }

  if (filters?.dateFrom || filters?.dateTo) {
    const fromKey = filters?.dateFrom?.trim() || '';
    const toKey = filters?.dateTo?.trim() || '9999-12-31';
    list = list.filter(r => {
      const localDateKey = getCalendarDateString(r);
      return Boolean(localDateKey) && localDateKey >= fromKey && localDateKey <= toKey;
    });
  }

  return list;
}

// ----------------- PHOTO QA & DRIVER PATTERN AUDIT FUNCTIONS -----------------

export function updateInspectionPhotoQa(
  inspectionId: string,
  photoUrlOrSlot: string,
  qaAudit: PhotoQaAudit
): InspectionRecord | null {
  const index = memoryStore.inspections.findIndex(r => r.id === inspectionId);
  if (index === -1) return null;

  const record = memoryStore.inspections[index];
  if (!record.photos) record.photos = [];

  const isResetClean = qaAudit.photoQuality === 'correct' && qaAudit.accuracyType === 'accurate' && !qaAudit.adminNote?.trim();

  let matched = false;
  for (const photo of record.photos) {
    if (
      photo.url === photoUrlOrSlot ||
      photo.slotName === photoUrlOrSlot ||
      photo.itemId === photoUrlOrSlot ||
      (photo.url && photoUrlOrSlot && photo.url.includes(photoUrlOrSlot))
    ) {
      if (isResetClean) {
        photo.qaAudit = undefined;
      } else {
        photo.qaAudit = {
          photoQuality: qaAudit.photoQuality,
          accuracyType: qaAudit.accuracyType,
          adminNote: qaAudit.adminNote?.trim() || '',
          auditedBy: qaAudit.auditedBy || 'Admin',
          auditedAt: qaAudit.auditedAt || new Date().toISOString(),
        };
      }
      matched = true;
      break;
    }
  }

  // If not matched directly on existing photo object and a mistake was flagged, push it
  if (!matched && !isResetClean) {
    record.photos.push({
      url: photoUrlOrSlot.startsWith('http') || photoUrlOrSlot.startsWith('/') || photoUrlOrSlot.startsWith('data:') ? photoUrlOrSlot : '/sample-photos/front_left_tyre.jpg',
      slotName: photoUrlOrSlot,
      itemId: photoUrlOrSlot,
      itemTitle: photoUrlOrSlot,
      timestamp: record.timestamp,
      qaAudit: {
        photoQuality: qaAudit.photoQuality,
        accuracyType: qaAudit.accuracyType,
        adminNote: qaAudit.adminNote?.trim() || '',
        auditedBy: qaAudit.auditedBy || 'Admin',
        auditedAt: qaAudit.auditedAt || new Date().toISOString(),
      },
    });
  }

  if (!record.qaAudits) record.qaAudits = {};
  if (isResetClean) {
    delete record.qaAudits[photoUrlOrSlot];
  } else {
    record.qaAudits[photoUrlOrSlot] = {
      photoQuality: qaAudit.photoQuality,
      accuracyType: qaAudit.accuracyType,
      adminNote: qaAudit.adminNote?.trim() || '',
      auditedBy: qaAudit.auditedBy || 'Admin',
      auditedAt: qaAudit.auditedAt || new Date().toISOString(),
    };
  }
  record.qaAuditedAt = new Date().toISOString();
  record.qaAuditedBy = qaAudit.auditedBy || 'Admin';

  saveStoreSync();
  scheduleDebouncedBackup();
  dbSaveInspection(record).catch(e => console.error('[MSSQL Error] Saving QA audit to SQL Server:', e));

  addAuditLog({
    eventType: 'PHOTO_QA_AUDIT',
    operator: qaAudit.auditedBy || 'Admin',
    ip: '127.0.0.1',
    details: `QA Audit for ${record.vehicleNo} (${inspectionId}): PhotoQuality=${qaAudit.photoQuality}, Accuracy=${qaAudit.accuracyType}. Note: ${qaAudit.adminNote || 'None'}`,
    severity: qaAudit.accuracyType === 'false_negative' ? 'danger' : qaAudit.photoQuality !== 'correct' ? 'warning' : 'info',
  });

  return record;
}

export function getDriverQaPatternReport(filters?: {
  dateFrom?: string;
  dateTo?: string;
  depot?: string;
  driverId?: string;
}): DriverQaReportResult {
  const inspections = getInspections({
    dateFrom: filters?.dateFrom?.trim() || undefined,
    dateTo: filters?.dateTo?.trim() || undefined,
    branch: filters?.depot,
    driverId: filters?.driverId,
  });

  // Group by depot then driver
  const depotMap = new Map<string, Map<string, { driver: Driver | null; inspections: InspectionRecord[] }>>();

  for (const insp of inspections) {
    const drvId = (insp.driverId || 'UNKNOWN').trim().toUpperCase();
    const drvObj = memoryStore.drivers.find(d => 
      (d.employeeId && d.employeeId.trim().toUpperCase() === drvId) ||
      (d.loginId && d.loginId.trim().toUpperCase() === drvId) ||
      (d.name && d.name.trim().toLowerCase() === (insp.driverName || '').trim().toLowerCase())
    ) || null;

    const depotCode = (drvObj?.depot || insp.driverDepot || insp.vehicleBranch || 'BL').trim().toUpperCase();
    if (!depotMap.has(depotCode)) {
      depotMap.set(depotCode, new Map());
    }
    const driverMap = depotMap.get(depotCode)!;
    if (!driverMap.has(drvId)) {
      driverMap.set(drvId, { driver: drvObj, inspections: [] });
    }
    driverMap.get(drvId)!.inspections.push(insp);
  }

  const depotGroups: DepotQaPatternGroup[] = [];
  let totalAuditedPhotos = 0;
  let correctPhotosCount = 0;
  let wrongPartCount = 0;
  let wrongPositionCount = 0;
  let falsePositivesCount = 0;
  let falseNegativesCount = 0;
  let totalDriversAudited = 0;

  for (const [depotCode, driverMap] of depotMap.entries()) {
    const driverSummaries: DriverQaPatternSummary[] = [];
    let depotAuditedPhotos = 0;
    let depotWrongPart = 0;
    let depotWrongPos = 0;
    let depotFalsePos = 0;
    let depotFalseNeg = 0;

    for (const [drvId, entry] of driverMap.entries()) {
      const drvInspections = entry.inspections;
      const drvName = entry.driver?.name || drvInspections[0]?.driverName || drvId;
      const mistakes: DriverMistakeItem[] = [];
      const drvRecentInspections: DriverAuditedInspectionRef[] = [];

      let drvTotalAudited = 0;
      let drvCorrectPhotos = 0;
      let drvWrongPart = 0;
      let drvWrongPos = 0;
      let drvAccurate = 0;
      let drvFalsePos = 0;
      let drvFalseNeg = 0;

      for (const insp of drvInspections) {
        // Collect audited items from both insp.photos AND insp.qaAudits
        const photoList: Array<{ photo: InspectionPhoto; qa: PhotoQaAudit }> = [];

        if (insp.photos && Array.isArray(insp.photos)) {
          for (const photo of insp.photos) {
            const qa = photo.qaAudit || (insp.qaAudits ? (
              insp.qaAudits[photo.url] ||
              (photo.slotName && insp.qaAudits[photo.slotName]) ||
              (photo.itemId && insp.qaAudits[photo.itemId]) ||
              Object.entries(insp.qaAudits).find(([k]) => photo.url && (photo.url.includes(k) || k.includes(photo.url)))?.[1]
            ) : undefined);
            if (qa) {
              photoList.push({ photo, qa });
            }
          }
        }

        if (insp.qaAudits) {
          for (const [key, qa] of Object.entries(insp.qaAudits)) {
            const already = photoList.some(item => item.photo.url === key || item.photo.slotName === key || item.photo.itemId === key);
            if (!already && qa) {
              const matchedItem = insp.items?.find(i => i.id === key);
              photoList.push({
                photo: {
                  url: key.startsWith('http') || key.startsWith('/') ? key : '/sample-photos/front_left_tyre.jpg',
                  slotName: key,
                  itemId: key,
                  itemTitle: matchedItem?.title || key,
                  timestamp: insp.timestamp,
                },
                qa,
              });
            }
          }
        }

        let inspMistakesCount = 0;
        for (const { photo, qa } of photoList) {
          drvTotalAudited++;

          if (qa.photoQuality === 'wrong_part') {
            drvWrongPart++;
          } else if (qa.photoQuality === 'wrong_position') {
            drvWrongPos++;
          } else {
            drvCorrectPhotos++;
          }

          if (qa.accuracyType === 'false_positive') {
            drvFalsePos++;
          } else if (qa.accuracyType === 'false_negative') {
            drvFalseNeg++;
          } else {
            drvAccurate++;
          }

          // Mistake detected
          if (qa.photoQuality === 'wrong_part' || qa.photoQuality === 'wrong_position' || qa.accuracyType === 'false_positive' || qa.accuracyType === 'false_negative') {
            inspMistakesCount++;
            const checkItem = insp.items?.find(i => i.id === photo.itemId);
            mistakes.push({
              id: `${insp.id}-${photo.slotName || photo.itemId || Math.random().toString(36).slice(2, 6)}`,
              inspectionId: insp.id,
              formattedDate: insp.formattedDate || insp.timestamp,
              timestamp: insp.timestamp,
              vehicleNo: insp.vehicleNo,
              vehicleBranch: insp.vehicleBranch || depotCode,
              driverId: drvId,
              driverName: drvName,
              driverDepot: depotCode,
              itemId: photo.itemId || 'general',
              itemTitle: photo.itemTitle || photo.slotName || 'Vehicle Component',
              photoUrl: photo.url,
              driverClaimStatus: (checkItem?.status === 'Fail' || photo.isDefect) ? 'Fail' : 'Pass',
              photoQuality: qa.photoQuality,
              accuracyType: qa.accuracyType,
              adminNote: qa.adminNote,
              auditedBy: qa.auditedBy,
              auditedAt: qa.auditedAt,
            });
          }
        }

        if (photoList.length > 0 || insp.overallResult === 'Fail') {
          drvRecentInspections.push({
            id: insp.id,
            formattedDate: insp.formattedDate || insp.timestamp,
            timestamp: insp.timestamp,
            vehicleNo: insp.vehicleNo,
            vehicleBranch: insp.vehicleBranch || depotCode,
            overallResult: insp.overallResult,
            auditedPhotosCount: photoList.length,
            mistakesCount: inspMistakesCount,
          });
        }
      }

      if (drvTotalAudited > 0) {
        totalDriversAudited++;
      }

      // Pattern identification heuristics
      const identifiedPatterns: string[] = [];
      if (drvWrongPart >= 2) {
        identifiedPatterns.push(`Habitual wrong spare part photographed (${drvWrongPart}x)`);
      } else if (drvWrongPart === 1) {
        identifiedPatterns.push(`1x wrong spare part photo captured`);
      }

      if (drvWrongPos >= 2) {
        identifiedPatterns.push(`Camera angle/lighting/distance issues (${drvWrongPos}x)`);
      } else if (drvWrongPos === 1) {
        identifiedPatterns.push(`1x improper camera angle`);
      }

      if (drvFalsePos >= 2) {
        identifiedPatterns.push(`High false alarm rate: reports good parts as defective (${drvFalsePos}x)`);
      } else if (drvFalsePos === 1) {
        identifiedPatterns.push(`1x false positive (spare part had no issue)`);
      }

      if (drvFalseNeg >= 1) {
        identifiedPatterns.push(`🚨 CRITICAL SAFETY RISK: Missed defect on vehicle inspection (${drvFalseNeg}x)`);
      }

      if (identifiedPatterns.length === 0 && drvTotalAudited > 0) {
        identifiedPatterns.push('High inspection precision: 100% compliant with standard operating procedure');
      }

      const photoValidityRate = drvTotalAudited > 0 ? Math.round((drvCorrectPhotos / drvTotalAudited) * 100) : 100;
      const assessmentAccuracyRate = drvTotalAudited > 0 ? Math.round((drvAccurate / drvTotalAudited) * 100) : 100;
      const overallQualityScore = drvTotalAudited > 0
        ? Math.round(((drvCorrectPhotos + drvAccurate) / (drvTotalAudited * 2)) * 100)
        : 100;

      depotAuditedPhotos += drvTotalAudited;
      depotWrongPart += drvWrongPart;
      depotWrongPos += drvWrongPos;
      depotFalsePos += drvFalsePos;
      depotFalseNeg += drvFalseNeg;

      totalAuditedPhotos += drvTotalAudited;
      correctPhotosCount += drvCorrectPhotos;
      wrongPartCount += drvWrongPart;
      wrongPositionCount += drvWrongPos;
      falsePositivesCount += drvFalsePos;
      falseNegativesCount += drvFalseNeg;

      driverSummaries.push({
        driverId: drvId,
        driverName: drvName,
        driverDepot: depotCode,
        totalInspections: drvInspections.length,
        totalPhotosAudited: drvTotalAudited,
        correctPhotosCount: drvCorrectPhotos,
        wrongPartCount: drvWrongPart,
        wrongPositionCount: drvWrongPos,
        accurateAssessmentsCount: drvAccurate,
        falsePositivesCount: drvFalsePos,
        falseNegativesCount: drvFalseNeg,
        photoValidityRate,
        assessmentAccuracyRate,
        overallQualityScore,
        identifiedPatterns,
        mistakes,
        inspections: drvRecentInspections,
      });
    }

    // Sort drivers: lowest quality score first
    driverSummaries.sort((a, b) => a.overallQualityScore - b.overallQualityScore);

    const depotAccuracyRate = depotAuditedPhotos > 0
      ? Math.round((((depotAuditedPhotos - depotWrongPart - depotWrongPos) + (depotAuditedPhotos - depotFalsePos - depotFalseNeg)) / (depotAuditedPhotos * 2)) * 100)
      : 100;

    depotGroups.push({
      depotCode,
      depotName: depotCode,
      totalDrivers: driverSummaries.length,
      totalInspections: driverSummaries.reduce((acc, d) => acc + d.totalInspections, 0),
      totalPhotosAudited: depotAuditedPhotos,
      wrongPartCount: depotWrongPart,
      wrongPositionCount: depotWrongPos,
      falsePositivesCount: depotFalsePos,
      falseNegativesCount: depotFalseNeg,
      depotAccuracyRate,
      drivers: driverSummaries,
    });
  }

  // Sort depots by compliance ascending (worst first)
  depotGroups.sort((a, b) => a.depotAccuracyRate - b.depotAccuracyRate);

  const overallAccuracyRate = totalAuditedPhotos > 0
    ? Math.round((((totalAuditedPhotos - wrongPartCount - wrongPositionCount) + (totalAuditedPhotos - falsePositivesCount - falseNegativesCount)) / (totalAuditedPhotos * 2)) * 100)
    : 100;
  const photoValidityRate = totalAuditedPhotos > 0
    ? Math.round((correctPhotosCount / totalAuditedPhotos) * 100)
    : 100;

  return {
    summary: {
      totalInspections: inspections.length,
      totalAuditedPhotos,
      totalDriversAudited,
      correctPhotosCount,
      wrongPartCount,
      wrongPositionCount,
      falsePositivesCount,
      falseNegativesCount,
      overallAccuracyRate,
      photoValidityRate,
    },
    depotGroups,
    dateRange: {
      dateFrom: filters?.dateFrom || '',
      dateTo: filters?.dateTo || '',
    },
  };
}

export function seedSampleDriverQaAudits(): { seededInspections: number; auditedPhotosCount: number } {
  // If memoryStore has no inspections, seed historical inspections first
  if (memoryStore.inspections.length === 0) {
    seedHistoricalInspections(14);
  }

  const samplePhotoUrls = [
    { url: '/sample-photos/front_left_tyre.jpg', itemId: 'tires_wheels', itemTitle: 'Tires & Wheels', slotName: 'Front-Left Tyre', slotIndex: 0 },
    { url: '/sample-photos/front_right_tyre.jpg', itemId: 'tires_wheels', itemTitle: 'Tires & Wheels', slotName: 'Front-Right Tyre', slotIndex: 1 },
    { url: '/sample-photos/radiator_coolant.jpg', itemId: 'radiator_coolant', itemTitle: 'Radiator Core & Coolant Reservoir', slotName: 'Radiator Core', slotIndex: 0 },
    { url: '/sample-photos/engine_oil_dipstick.jpg', itemId: 'fluids_powertrain', itemTitle: 'Engine Oil Dipstick & Fluid Levels', slotName: 'Engine Oil Dipstick', slotIndex: 0 },
    { url: '/sample-photos/diesel_fuel_cap.jpg', itemId: 'diesel_fuel_cap', itemTitle: 'Diesel Fuel Tank Cap & Seal', slotName: 'Fuel Tank Cap', slotIndex: 0 },
    { url: '/sample-photos/dashboard_cluster_odometer.jpg', itemId: 'dashboard_warnings', itemTitle: 'Meter Cluster & Warning Lights', slotName: 'Dashboard Meter Cluster', slotIndex: 0 },
  ];

  let auditedPhotosCount = 0;
  let seededInspections = 0;

  // Ensure recent inspections have photos
  const targetInspections = memoryStore.inspections.slice(0, 15);

  targetInspections.forEach((insp, inspIndex) => {
    seededInspections++;
    if (!insp.photos || insp.photos.length === 0) {
      insp.photos = samplePhotoUrls.map((sp) => ({
        url: sp.url,
        itemId: sp.itemId,
        itemTitle: sp.itemTitle,
        slotName: sp.slotName,
        slotIndex: sp.slotIndex,
        isDefect: false,
        timestamp: insp.timestamp,
        caption: `Watermark GPS Verified - ${insp.vehicleNo}`,
        gps: insp.gpsLocation || { lat: 3.0334, lng: 101.7511, accuracy: 5, address: 'Balakong Inspection Bay' },
      }));
    }

    // Assign realistic QA audits based on driver to show clear mistake patterns
    const drvName = (insp.driverName || '').toUpperCase();
    const isAzimul = drvName.includes('AZIMUL');
    const isNizai = drvName.includes('NIZAI');
    const isKhairil = drvName.includes('KHAIRIL');

    insp.photos.forEach((photo, pIdx) => {
      auditedPhotosCount++;
      if (isAzimul) {
        // High quality: 5 correct, 1 wrong position
        if (pIdx === 2) {
          photo.qaAudit = {
            photoQuality: 'wrong_position',
            accuracyType: 'accurate',
            adminNote: 'Radiator photo taken too far; cannot see reservoir level clearly. Please retake closer.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 3600000 * (pIdx + 1)).toISOString(),
          };
        } else {
          photo.qaAudit = {
            photoQuality: 'correct',
            accuracyType: 'accurate',
            adminNote: 'Clear component angle, tread depth and markings legible.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 3600000 * (pIdx + 1)).toISOString(),
          };
        }
      } else if (isNizai) {
        // Driver Nizai: False alarms (False Positives) and 1 wrong part
        if (pIdx === 0) {
          photo.qaAudit = {
            photoQuality: 'wrong_part',
            accuracyType: 'accurate',
            adminNote: 'Wrong spare part photographed: driver snapped mudguard instead of brake rotor / tyre tread.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 7200000).toISOString(),
          };
        } else if (pIdx === 1) {
          photo.qaAudit = {
            photoQuality: 'correct',
            accuracyType: 'false_positive',
            adminNote: 'Driver reported low tyre tread defect, but photo and workshop gauge verify 3.2mm tread depth. Spare part has NO issue.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 7200000).toISOString(),
          };
        } else if (pIdx === 4) {
          photo.qaAudit = {
            photoQuality: 'correct',
            accuracyType: 'false_positive',
            adminNote: 'Driver claimed diesel fuel cap gasket missing; photo clearly shows gasket intact and tight.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 7200000).toISOString(),
          };
        } else {
          photo.qaAudit = {
            photoQuality: 'correct',
            accuracyType: 'accurate',
            adminNote: 'Verified compliant.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 7200000).toISOString(),
          };
        }
      } else if (isKhairil) {
        // Driver Khairil: 1 False Negative (CRITICAL MISSED DEFECT) and 1 wrong angle
        if (pIdx === 0) {
          photo.qaAudit = {
            photoQuality: 'correct',
            accuracyType: 'false_negative',
            adminNote: 'CRITICAL: Driver marked PASS, but photo clearly shows severe sidewall cut and low inflation! Vehicle must be checked immediately.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 10800000).toISOString(),
          };
        } else if (pIdx === 3) {
          photo.qaAudit = {
            photoQuality: 'wrong_position',
            accuracyType: 'accurate',
            adminNote: 'Engine dipstick photo severely blurred with camera glare; level unreadable.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 10800000).toISOString(),
          };
        } else {
          photo.qaAudit = {
            photoQuality: 'correct',
            accuracyType: 'accurate',
            adminNote: 'Checked and compliant.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 10800000).toISOString(),
          };
        }
      } else {
        // Default pattern for other drivers
        if (pIdx === 0 && inspIndex % 3 === 0) {
          photo.qaAudit = {
            photoQuality: 'wrong_part',
            accuracyType: 'accurate',
            adminNote: 'Wrong part captured; photographed wheel rim surface instead of tire tread depth.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 14400000).toISOString(),
          };
        } else if (pIdx === 1 && inspIndex % 4 === 0) {
          photo.qaAudit = {
            photoQuality: 'correct',
            accuracyType: 'false_positive',
            adminNote: 'False alarm: driver reported fluid leak, but confirmed to be water dripping from A/C condenser drain pipe.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 14400000).toISOString(),
          };
        } else {
          photo.qaAudit = {
            photoQuality: 'correct',
            accuracyType: 'accurate',
            adminNote: 'Verified compliant photo and part condition.',
            auditedBy: 'Steve Wong (Admin)',
            auditedAt: new Date(Date.now() - 14400000).toISOString(),
          };
        }
      }
    });

    insp.qaAuditedAt = new Date().toISOString();
    insp.qaAuditedBy = 'Steve Wong (Admin)';
  });

  saveStore(true);
  scheduleDebouncedBackup();

  addAuditLog({
    eventType: 'QA_DEMO_SEED',
    operator: 'Admin Executive Portal',
    ip: '127.0.0.1',
    details: `Seeded ${auditedPhotosCount} sample QA audits across ${seededInspections} inspections illustrating mistake patterns, false alarms, and wrong photo positions.`,
    severity: 'info',
  });

  return { seededInspections, auditedPhotosCount };
}

// ----------------- UNINSPECTED DRIVERS AUDIT COMPLIANCE REPORT -----------------

export interface UninspectedDriverItem {
  employeeId: string;
  loginId: string;
  name: string;
  depot: string;
  depotName: string;
  designation: string;
  phone: string;
  status: 'A' | 'I';
  avatarUrl?: string;
  totalDays: number;
  missedCount: number;
  inspectedCount: number;
  missedDates: string[];
  inspectedDates: string[];
  complianceRate: number;
  complianceStatus: 'Non-Compliant' | 'Partially Compliant' | 'Fully Compliant';
  latestInspectionDate?: string;
  assignedRoute?: string;
  assignedVehicle?: string;
}

export interface UninspectedDriversReportResult {
  summary: {
    totalActiveDrivers: number;
    uninspectedDriversCount: number;
    fullyCompliantCount: number;
    overallComplianceRate: number;
    dateFrom: string;
    dateTo: string;
    depot: string;
    totalDays: number;
  };
  drivers: UninspectedDriverItem[];
  dailyRoster: {
    date: string;
    formattedDate: string;
    dayOfWeek: string;
    totalDrivers: number;
    uninspectedCount: number;
    compliantCount: number;
    missingDrivers: {
      employeeId: string;
      loginId: string;
      name: string;
      depot: string;
      designation: string;
      phone: string;
    }[];
  }[];
}

export function getUninspectedDriversReport(filters?: {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  depot?: string;
  search?: string;
  designation?: string;
  sortBy?: 'missedCount' | 'name' | 'depot' | 'employeeId';
  sortOrder?: 'asc' | 'desc';
}): UninspectedDriversReportResult {
  const todayStr = getCalendarDateString(new Date());

  let fromStr = (filters?.dateFrom || filters?.date || todayStr).trim();
  let toStr = (filters?.dateTo || filters?.date || fromStr).trim();

  // Validate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) fromStr = todayStr;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toStr)) toStr = fromStr;

  if (fromStr > toStr) {
    const temp = fromStr;
    fromStr = toStr;
    toStr = temp;
  }

  // Cap at 60 days to prevent excessive loops
  const dateList: string[] = [];
  const cur = new Date(fromStr + 'T00:00:00Z');
  const end = new Date(toStr + 'T00:00:00Z');

  let loopLimit = 60;
  while (cur <= end && loopLimit > 0) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    dateList.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
    loopLimit--;
  }

  if (dateList.length === 0) {
    dateList.push(todayStr);
  }

  // Pre-index inspections by driver and calendar date for fast lookup
  const inspectionMap = new Map<string, InspectionRecord[]>();

  for (const insp of memoryStore.inspections) {
    const dStr = getCalendarDateString(insp);
    if (!dStr) continue;

    const keys: string[] = [];
    if (insp.driverId) {
      keys.push(`${insp.driverId.trim().toUpperCase()}_${dStr}`);
    }
    if (insp.driverName) {
      keys.push(`${insp.driverName.trim().toUpperCase()}_${dStr}`);
    }

    for (const k of keys) {
      if (!inspectionMap.has(k)) {
        inspectionMap.set(k, []);
      }
      inspectionMap.get(k)!.push(insp);
    }
  }

  const driverVehicleMap = new Map<string, string>();
  for (const v of memoryStore.vehicles) {
    if (v.lastDriverName && v.vehicleNo) {
      driverVehicleMap.set(v.lastDriverName.trim().toUpperCase(), v.vehicleNo);
    }
  }

  const filterDepot = (filters?.depot && filters.depot !== 'ALL') ? filters.depot.trim().toUpperCase() : null;
  const searchFilter = (filters?.search || '').trim().toLowerCase();
  const desigFilter = (filters?.designation && filters.designation !== 'ALL') ? filters.designation.trim().toUpperCase() : null;

  let activeDrivers = memoryStore.drivers.filter(d => (d.status || 'A') === 'A');

  if (filterDepot) {
    activeDrivers = activeDrivers.filter(d => (d.depot || '').toUpperCase() === filterDepot);
  }

  if (desigFilter) {
    activeDrivers = activeDrivers.filter(d => (d.designation || '').toUpperCase().includes(desigFilter));
  }

  if (searchFilter) {
    activeDrivers = activeDrivers.filter(d =>
      (d.name || '').toLowerCase().includes(searchFilter) ||
      (d.employeeId || '').toLowerCase().includes(searchFilter) ||
      (d.loginId || '').toLowerCase().includes(searchFilter) ||
      (d.phone || '').toLowerCase().includes(searchFilter) ||
      (d.depot || '').toLowerCase().includes(searchFilter)
    );
  }

  const driverResults: UninspectedDriverItem[] = [];
  let totalDriverDays = 0;
  let totalInspectedDays = 0;

  for (const drv of activeDrivers) {
    const missedDates: string[] = [];
    const inspectedDates: string[] = [];
    let latestInspDate: string | undefined = undefined;

    const empKey = (drv.employeeId || '').trim().toUpperCase();
    const logKey = (drv.loginId || '').trim().toUpperCase();
    const nameKey = (drv.name || '').trim().toUpperCase();

    for (const d of dateList) {
      const hasInsp =
        (empKey && inspectionMap.has(`${empKey}_${d}`)) ||
        (logKey && inspectionMap.has(`${logKey}_${d}`)) ||
        (nameKey && inspectionMap.has(`${nameKey}_${d}`));

      if (hasInsp) {
        inspectedDates.push(d);
        if (!latestInspDate || d > latestInspDate) {
          latestInspDate = d;
        }
      } else {
        missedDates.push(d);
      }
    }

    totalDriverDays += dateList.length;
    totalInspectedDays += inspectedDates.length;

    const missedCount = missedDates.length;
    const inspectedCount = inspectedDates.length;
    const complianceRate = Math.round((inspectedCount / dateList.length) * 100);

    const complianceStatus: 'Non-Compliant' | 'Partially Compliant' | 'Fully Compliant' =
      missedCount === 0
        ? 'Fully Compliant'
        : inspectedCount === 0
        ? 'Non-Compliant'
        : 'Partially Compliant';

    driverResults.push({
      employeeId: drv.employeeId || drv.loginId,
      loginId: drv.loginId,
      name: drv.name,
      depot: drv.depot,
      depotName: drv.depotName || drv.depot,
      designation: drv.designation || 'DRIVER',
      phone: drv.phone || '',
      status: drv.status || 'A',
      avatarUrl: drv.avatarUrl,
      totalDays: dateList.length,
      missedCount,
      inspectedCount,
      missedDates,
      inspectedDates,
      complianceRate,
      complianceStatus,
      latestInspectionDate: latestInspDate,
      assignedVehicle: driverVehicleMap.get(nameKey) || undefined,
    });
  }

  // Sorting
  const sortBy = filters?.sortBy || 'missedCount';
  const sortOrder = filters?.sortOrder || 'desc';

  driverResults.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'missedCount') {
      cmp = a.missedCount - b.missedCount;
      if (cmp === 0) cmp = a.name.localeCompare(b.name);
    } else if (sortBy === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortBy === 'depot') {
      cmp = a.depot.localeCompare(b.depot);
    } else if (sortBy === 'employeeId') {
      cmp = a.employeeId.localeCompare(b.employeeId);
    }
    return sortOrder === 'desc' ? -cmp : cmp;
  });

  // Daily roster
  const dailyRoster = dateList.map(dateStr => {
    const missingForDay = driverResults.filter(d => d.missedDates.includes(dateStr)).map(d => ({
      employeeId: d.employeeId,
      loginId: d.loginId,
      name: d.name,
      depot: d.depot,
      designation: d.designation,
      phone: d.phone,
    }));

    const dateObj = new Date(dateStr + 'T00:00:00Z');
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getUTCDay()];
    const parts = dateStr.split('-');
    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

    return {
      date: dateStr,
      formattedDate,
      dayOfWeek,
      totalDrivers: activeDrivers.length,
      uninspectedCount: missingForDay.length,
      compliantCount: activeDrivers.length - missingForDay.length,
      missingDrivers: missingForDay,
    };
  });

  const uninspectedOnly = driverResults.filter(d => d.missedCount > 0);
  const fullyCompliant = driverResults.filter(d => d.missedCount === 0);
  const overallComplianceRate = totalDriverDays > 0
    ? Math.round((totalInspectedDays / totalDriverDays) * 100)
    : 100;

  return {
    summary: {
      totalActiveDrivers: activeDrivers.length,
      uninspectedDriversCount: uninspectedOnly.length,
      fullyCompliantCount: fullyCompliant.length,
      overallComplianceRate,
      dateFrom: fromStr,
      dateTo: toStr,
      depot: filterDepot || 'ALL',
      totalDays: dateList.length,
    },
    drivers: driverResults,
    dailyRoster,
  };
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
  dbClearInspections().catch(e => console.error('[MSSQL Error] clearInspections:', e));
}

// Full fleet database wipe - resets to 100% clean state
export function clearAllFleetData(): { success: boolean; message: string } {
  memoryStore.vehicles = [];
  memoryStore.drivers = [];
  memoryStore.inspections = [];
  memoryStore.auditLogs = [];
  if (!memoryStore.settings) {
    memoryStore.settings = {};
  }
  (memoryStore.settings as any).demoPurged = true;
  saveStoreSync();
  dbClearVehicles().catch(e => console.error('[MSSQL Error] clearVehicles:', e));
  dbClearDrivers().catch(e => console.error('[MSSQL Error] clearDrivers:', e));
  dbClearInspections().catch(e => console.error('[MSSQL Error] clearInspections:', e));
  return { success: true, message: 'All fleet vehicles, drivers, and inspection logs successfully cleared. Ready for your own data upload.' };
}

export function clearAllVehicles(): { success: boolean; message: string } {
  memoryStore.vehicles = [];
  memoryStore.inspections = [];
  if (!memoryStore.settings) {
    memoryStore.settings = {};
  }
  (memoryStore.settings as any).demoPurged = true;
  saveStoreSync();
  dbClearVehicles().catch(e => console.error('[MSSQL Error] clearVehicles:', e));
  dbClearInspections().catch(e => console.error('[MSSQL Error] clearInspections:', e));
  return { success: true, message: 'All vehicles successfully cleared from database.' };
}

export function clearAllDrivers(): { success: boolean; message: string } {
  memoryStore.drivers = [];
  saveStore(true);
  dbClearDrivers().catch(e => console.error('[MSSQL Error] clearDrivers:', e));
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
  dbSaveAuditLog(record).catch(e => console.error('[MSSQL Error] saveAuditLog:', e));
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
  const todayStr = getCalendarDateString(new Date());
  const selectedDate = (filters?.date || todayStr).trim();
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

  // Filter inspections on the selected date (strictly matching local calendar day YYYY-MM-DD)
  const dateInspections = memoryStore.inspections.filter(i => {
    return isSameDay(i, selectedDate);
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

    // Case 1: Inspection completed on selectedDate
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
      // Case 2: No inspection completed on selectedDate
      // If the vehicle was previously grounded for unresolved defects, count as Grounded
      if (v.currentStatus === 'Grounded') {
        groundedVehicles++;
        failedInspections++;
        depotStatsMap[br].defects++;
      } else {
        // A brand new day with no inspection yet: strictly Pending Inspection!
        pendingVehicles++;
        depotStatsMap[br].pending++;
        pendingVehicleList.push({
          ...v,
          currentStatus: 'Pending Inspection',
        });
      }
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
    { id: 'brake_system', code: 2, category: 'Control & Stopping', title: 'Brake System', subtext: 'Foot brake, handbrake, and brake fluid level' },
    { id: 'lights_indicators', code: 3, category: 'Visibility & Signals', title: 'Lights & Indicators', subtext: 'Headlights, turn signals and hazard lights' },
    { id: 'steering_handling', code: 4, category: 'Control & Stopping', title: 'Steering & Handling', subtext: 'Steering play and suspension integrity' },
    { id: 'mirrors_wipers', code: 5, category: 'Visibility & Signals', title: 'Mirrors & Wipers', subtext: 'Mirrors clarity and wiper blade function' },
    { id: 'dashboard_warnings', code: 6, category: 'Instruments & Electronics', title: 'Dashboard & Warnings', subtext: 'Instrument cluster alerts and horn' },
    { id: 'emergency_equipment', code: 7, category: 'Safety & Emergency', title: 'Emergency Equipment', subtext: 'Fire extinguisher, triangle and safety vest' },
    { id: 'body_passenger_doors', code: 8, category: 'Body & Access', title: 'Body & Cargo Doors', subtext: 'Cargo box doors, latches and locks' },
    { id: 'hvac_ventilation', code: 9, category: 'Cabin Environment', title: 'HVAC & Ventilation', subtext: 'Air conditioning blower and defroster' },
    { id: 'fluids_powertrain', code: 10, category: 'Engine & Fluids', title: 'Fluids & Powertrain', subtext: 'Engine oil, transmission, and battery terminals' },
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
    const formattedDate = raw.formattedDate || new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(validDate);

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
    }, true);
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

export function getDatabaseStatus() {
  const cfg = getMssqlConfig();
  return {
    mode: process.env.DB_TYPE === 'json' ? 'JSON' : 'MSSQL',
    isMssqlConnected: isMssqlConnected(),
    server: cfg.server,
    database: cfg.database,
    user: cfg.user,
    demoPurged: Boolean((memoryStore.settings as any)?.demoPurged),
    productionDbActive: Boolean((memoryStore.settings as any)?.productionDbActive),
  };
}

export function getExecutiveAnalytics(filters?: {
  timeframe?: string;
  branch?: string;
  truckCategory?: string;
  dateFrom?: string;
  dateTo?: string;
}): ExecutiveAnalyticsResult {
  const routes = opGetRoutes(memoryStore.vehicles);
  return calculateExecutiveAnalytics(
    memoryStore.inspections,
    memoryStore.vehicles,
    memoryStore.drivers,
    routes,
    filters
  );
}

export function seedHistoricalInspections(daysBack: number = 30): { seededCount: number; totalInspections: number } {
  if (memoryStore.vehicles.length === 0) {
    memoryStore.vehicles = [...INITIAL_VEHICLES];
    memoryStore.vehicles.forEach((v) => {
      if (!v.qrToken) v.qrToken = generateVehicleQrToken();
    });
  }
  if (memoryStore.drivers.length === 0) {
    memoryStore.drivers = [...INITIAL_DRIVERS];
  }
  if (memoryStore.settings) {
    delete (memoryStore.settings as any).demoPurged;
  }
  linkAllVehiclesToOperations(memoryStore.vehicles);

  const generated = generateHistoricalInspections(memoryStore.vehicles, memoryStore.drivers, daysBack);
  memoryStore.inspections = generated;
  saveStore(true);
  invalidateFleetStatsCache();
  addAuditLog({
    eventType: 'DATA_MANAGEMENT',
    operator: 'Admin Executive Portal',
    ip: '127.0.0.1',
    details: `Seeded ${generated.length} demo historical pre-trip inspection records for 30-day analytics across ${memoryStore.vehicles.length} vehicles.`,
    severity: 'info',
  });
  return { seededCount: generated.length, totalInspections: memoryStore.inspections.length };
}

// ----------------- OPERATIONS HIERARCHY CRUD EXPORTS -----------------
export function getRegions() { return opGetRegions(memoryStore.vehicles); }
export function createRegion(item: any) { return opCreateRegion(item); }
export function updateRegion(id: string, updates: any) { return opUpdateRegion(id, updates); }
export function deleteRegion(id: string) { return opDeleteRegion(id); }

export function getDepots() { return opGetDepots(memoryStore.vehicles); }
export function createDepot(item: any) { return opCreateDepot(item); }
export function updateDepot(id: string, updates: any) { return opUpdateDepot(id, updates); }
export function deleteDepot(id: string) { return opDeleteDepot(id); }

export function getRoutes() { return opGetRoutes(memoryStore.vehicles); }

function syncVehicleWithRoute(route: any) {
  if (!route || !route.assignedVehiclePlate) return;
  const cleanPlate = route.assignedVehiclePlate.replace(/\s+/g, '').toUpperCase();
  const v = memoryStore.vehicles.find(veh => veh.vehicleNo.replace(/\s+/g, '').toUpperCase() === cleanPlate);
  if (v) {
    v.assignedRoute = route.code;
    v.area = route.code;
    if (route.depotId) {
      v.branch = route.depotId;
      const depots = opGetDepots(memoryStore.vehicles);
      const matchDepot = depots.find(d => d.code === route.depotId);
      if (matchDepot) {
        v.region = matchDepot.regionId;
      }
    }
    saveStore();
  }
}

export function createRoute(item: any) {
  const r = opCreateRoute(item);
  syncVehicleWithRoute(r);
  return r;
}

export function updateRoute(id: string, updates: any) {
  const r = opUpdateRoute(id, updates);
  syncVehicleWithRoute(r);
  return r;
}

export function deleteRoute(id: string) { return opDeleteRoute(id); }
export function syncRoutes() { return syncRoutesFromVehicles(memoryStore.vehicles); }

export function getDemoStatus(): {
  isDemoActive: boolean;
  demoPurged: boolean;
  totalVehicles: number;
  totalDrivers: number;
  totalInspections: number;
} {
  const isPurged = Boolean((memoryStore.settings as any)?.demoPurged);
  const isDemo = !isPurged && (memoryStore.inspections.length > 500 || memoryStore.vehicles.length === 26);
  return {
    isDemoActive: isDemo,
    demoPurged: isPurged,
    totalVehicles: memoryStore.vehicles.length,
    totalDrivers: memoryStore.drivers.length,
    totalInspections: memoryStore.inspections.length,
  };
}

export function purgeAllDemoData(): { success: boolean; message: string } {
  memoryStore.vehicles = [];
  memoryStore.drivers = [];
  memoryStore.inspections = [];
  memoryStore.auditLogs = [];
  if (!memoryStore.settings) {
    memoryStore.settings = {};
  }
  (memoryStore.settings as any).demoPurged = true;
  invalidateFleetStatsCache();
  saveStoreSync();
  logger.info('STORAGE', 'Purged all demo seed vehicles, drivers and inspections from store.');
  return { success: true, message: 'All demo seed vehicles, drivers, and inspection records successfully purged. Ready for real database.' };
}



