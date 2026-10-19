import fs from 'fs';
import path from 'path';
import { RegionItem, DepotItem, RouteItem, Vehicle } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const REGIONS_FILE = path.join(DATA_DIR, 'master_regions.json');
const DEPOTS_FILE = path.join(DATA_DIR, 'master_depots.json');
const ROUTES_FILE = path.join(DATA_DIR, 'master_routes.json');

// Initial baseline strictly matching user's pure codes
export const INITIAL_REGIONS: RegionItem[] = [
  { id: 'NORTHERN', name: 'NORTHERN', description: 'NORTHERN' },
  { id: 'CENTRAL', name: 'CENTRAL', description: 'CENTRAL' },
  { id: 'EAST', name: 'EAST', description: 'EAST' },
  { id: 'SOUTH', name: 'SOUTH', description: 'SOUTH' },
];

export const INITIAL_DEPOTS: DepotItem[] = [
  // NORTHERN
  { id: 'LW', code: 'LW', name: 'LW', regionId: 'NORTHERN', active: true },
  { id: 'AS', code: 'AS', name: 'AS', regionId: 'NORTHERN', active: true },
  { id: 'SP', code: 'SP', name: 'SP', regionId: 'NORTHERN', active: true },
  { id: 'LN', code: 'LN', name: 'LN', regionId: 'NORTHERN', active: true },
  { id: 'PN', code: 'PN', name: 'PN', regionId: 'NORTHERN', active: true },
  { id: 'TP', code: 'TP', name: 'TP', regionId: 'NORTHERN', active: true },
  { id: 'IP', code: 'IP', name: 'IP', regionId: 'NORTHERN', active: true },
  { id: 'TI', code: 'TI', name: 'TI', regionId: 'NORTHERN', active: true },

  // CENTRAL
  { id: 'GB', code: 'GB', name: 'GB', regionId: 'CENTRAL', active: true },
  { id: 'PG', code: 'PG', name: 'PG', regionId: 'CENTRAL', active: true },
  { id: 'KJ', code: 'KJ', name: 'KJ', regionId: 'CENTRAL', active: true },
  { id: 'NL', code: 'NL', name: 'NL', regionId: 'CENTRAL', active: true },
  { id: 'MN', code: 'MN', name: 'MN', regionId: 'CENTRAL', active: true },
  { id: 'SB', code: 'SB', name: 'SB', regionId: 'CENTRAL', active: true },
  { id: 'BL', code: 'BL', name: 'BL', regionId: 'CENTRAL', active: true },
  { id: 'KL', code: 'KL', name: 'KL', regionId: 'CENTRAL', active: true },

  // EAST
  { id: 'KB', code: 'KB', name: 'KB', regionId: 'EAST', active: true },
  { id: 'MC', code: 'MC', name: 'MC', regionId: 'EAST', active: true },
  { id: 'GM', code: 'GM', name: 'GM', regionId: 'EAST', active: true },
  { id: 'MT', code: 'MT', name: 'MT', regionId: 'EAST', active: true },
  { id: 'KN', code: 'KN', name: 'KN', regionId: 'EAST', active: true },
  { id: 'KA', code: 'KA', name: 'KA', regionId: 'EAST', active: true },
  { id: 'TG', code: 'TG', name: 'TG', regionId: 'EAST', active: true },
  { id: 'RP', code: 'RP', name: 'RP', regionId: 'EAST', active: true },

  // SOUTH
  { id: 'AG', code: 'AG', name: 'AG', regionId: 'SOUTH', active: true },
  { id: 'MK', code: 'MK', name: 'MK', regionId: 'SOUTH', active: true },
  { id: 'LB', code: 'LB', name: 'LB', regionId: 'SOUTH', active: true },
  { id: 'KG', code: 'KG', name: 'KG', regionId: 'SOUTH', active: true },
  { id: 'KU', code: 'KU', name: 'KU', regionId: 'SOUTH', active: true },
  { id: 'JB', code: 'JB', name: 'JB', regionId: 'SOUTH', active: true },
];

let memoryRegions: RegionItem[] = [];
let memoryDepots: DepotItem[] = [];
let memoryRoutes: RouteItem[] = [];

export function seedDefaultDepotRoutes(vehicles: Vehicle[] = []): { added: number; total: number } {
  let added = 0;
  const routeMap = new Map<string, RouteItem>();
  memoryRoutes.forEach(r => routeMap.set(r.code, r));

  // 1. Populate/link existing vehicle routes
  vehicles.forEach(v => {
    const area = (v.area || v.assignedRoute || '').trim().toUpperCase();
    const branch = (v.branch || 'KL').trim().toUpperCase();
    if (area && !routeMap.has(area)) {
      routeMap.set(area, {
        id: area,
        code: area,
        name: area,
        depotId: branch,
        assignedVehiclePlate: v.vehicleNo,
        active: true,
      });
      added++;
    } else if (area && routeMap.has(area) && !routeMap.get(area)!.assignedVehiclePlate) {
      routeMap.get(area)!.assignedVehiclePlate = v.vehicleNo;
    }
  });

  // 2. Ensure every depot has at least 2 default routes (e.g. BL01, BL02, KJ01, KJ02)
  memoryDepots.forEach(depot => {
    const dCode = depot.code;
    const r1 = `${dCode}01`;
    const r2 = `${dCode}02`;
    if (!routeMap.has(r1)) {
      routeMap.set(r1, {
        id: r1,
        code: r1,
        name: r1,
        depotId: dCode,
        active: true,
      });
      added++;
    }
    if (!routeMap.has(r2)) {
      routeMap.set(r2, {
        id: r2,
        code: r2,
        name: r2,
        depotId: dCode,
        active: true,
      });
      added++;
    }
  });

  memoryRoutes = Array.from(routeMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  saveRoutes();
  return { added, total: memoryRoutes.length };
}

export function initOperationsStore(vehicles: Vehicle[]) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load Regions
  if (fs.existsSync(REGIONS_FILE)) {
    try {
      memoryRegions = JSON.parse(fs.readFileSync(REGIONS_FILE, 'utf-8'));
    } catch {
      memoryRegions = [...INITIAL_REGIONS];
    }
  } else {
    memoryRegions = [...INITIAL_REGIONS];
    saveRegions();
  }

  // Load Depots
  if (fs.existsSync(DEPOTS_FILE)) {
    try {
      memoryDepots = JSON.parse(fs.readFileSync(DEPOTS_FILE, 'utf-8'));
    } catch {
      memoryDepots = [...INITIAL_DEPOTS];
    }
  } else {
    memoryDepots = [...INITIAL_DEPOTS];
    saveDepots();
  }

  // Load Routes
  if (fs.existsSync(ROUTES_FILE)) {
    try {
      memoryRoutes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf-8'));
    } catch {
      memoryRoutes = [];
    }
  }

  // Ensure every depot has routes and vehicles are integrated
  if (memoryRoutes.length === 0) {
    seedDefaultDepotRoutes(vehicles);
  }
}

function saveRegions() {
  try {
    fs.writeFileSync(REGIONS_FILE, JSON.stringify(memoryRegions, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Operations] Failed to save regions:', err);
  }
}

function saveDepots() {
  try {
    fs.writeFileSync(DEPOTS_FILE, JSON.stringify(memoryDepots, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Operations] Failed to save depots:', err);
  }
}

function saveRoutes() {
  try {
    fs.writeFileSync(ROUTES_FILE, JSON.stringify(memoryRoutes, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Operations] Failed to save routes:', err);
  }
}

// ----------------- REGIONS CRUD -----------------
export function getRegions(vehicles: Vehicle[] = []): RegionItem[] {
  return memoryRegions.map(r => {
    const rDepots = memoryDepots.filter(d => d.regionId === r.id);
    const rDepotCodes = new Set(rDepots.map(d => d.code));
    const rVehicles = vehicles.filter(v => rDepotCodes.has((v.branch || '').toUpperCase()));
    return {
      ...r,
      depotsCount: rDepots.length,
      vehiclesCount: rVehicles.length,
    };
  });
}

export function createRegion(item: Partial<RegionItem>): RegionItem {
  const code = (item.id || item.name || '').trim().toUpperCase();
  if (!code) throw new Error('Region code is required');
  if (memoryRegions.some(r => r.id === code)) {
    throw new Error(`Region ${code} already exists`);
  }
  const newReg: RegionItem = {
    id: code,
    name: code,
    description: item.description || `${code} Region`,
  };
  memoryRegions.push(newReg);
  saveRegions();
  return newReg;
}

export function updateRegion(id: string, updates: Partial<RegionItem>): RegionItem {
  const idx = memoryRegions.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`Region ${id} not found`);
  memoryRegions[idx] = {
    ...memoryRegions[idx],
    ...updates,
    id: updates.id ? updates.id.trim().toUpperCase() : memoryRegions[idx].id,
    name: updates.name ? updates.name.trim().toUpperCase() : memoryRegions[idx].name,
  };
  saveRegions();
  return memoryRegions[idx];
}

export function deleteRegion(id: string): boolean {
  const initial = memoryRegions.length;
  memoryRegions = memoryRegions.filter(r => r.id !== id);
  if (memoryRegions.length !== initial) {
    saveRegions();
    return true;
  }
  return false;
}

// ----------------- DEPOTS CRUD -----------------
export function getDepots(vehicles: Vehicle[] = []): DepotItem[] {
  return memoryDepots.map(d => {
    const dRoutes = memoryRoutes.filter(r => r.depotId === d.code);
    const dVehicles = vehicles.filter(v => (v.branch || '').toUpperCase() === d.code);
    return {
      ...d,
      routesCount: dRoutes.length,
      vehiclesCount: dVehicles.length,
    };
  });
}

export function createDepot(item: Partial<DepotItem>): DepotItem {
  const code = (item.code || item.id || '').trim().toUpperCase();
  if (!code) throw new Error('Depot code is required');
  if (memoryDepots.some(d => d.code === code)) {
    throw new Error(`Depot ${code} already exists`);
  }
  const regionId = (item.regionId || 'CENTRAL').trim().toUpperCase();
  const newDep: DepotItem = {
    id: code,
    code: code,
    name: item.name ? item.name.trim().toUpperCase() : code,
    regionId: regionId,
    address: item.address || '',
    supervisorName: item.supervisorName || '',
    phone: item.phone || '',
    active: item.active !== false,
  };
  memoryDepots.push(newDep);
  saveDepots();
  return newDep;
}

export function updateDepot(id: string, updates: Partial<DepotItem>): DepotItem {
  const idx = memoryDepots.findIndex(d => d.id === id || d.code === id);
  if (idx === -1) throw new Error(`Depot ${id} not found`);
  const oldCode = memoryDepots[idx].code;
  const newCode = updates.code ? updates.code.trim().toUpperCase() : oldCode;
  
  memoryDepots[idx] = {
    ...memoryDepots[idx],
    ...updates,
    id: newCode,
    code: newCode,
    name: newCode,
    regionId: updates.regionId ? updates.regionId.trim().toUpperCase() : memoryDepots[idx].regionId,
  };
  saveDepots();

  // Update routes referencing old depot code
  if (oldCode !== newCode) {
    let routesUpdated = false;
    memoryRoutes.forEach(r => {
      if (r.depotId === oldCode) {
        r.depotId = newCode;
        routesUpdated = true;
      }
    });
    if (routesUpdated) saveRoutes();
  }

  return memoryDepots[idx];
}

export function deleteDepot(id: string): boolean {
  const initial = memoryDepots.length;
  memoryDepots = memoryDepots.filter(d => d.id !== id && d.code !== id);
  if (memoryDepots.length !== initial) {
    saveDepots();
    return true;
  }
  return false;
}

// ----------------- ROUTES CRUD -----------------
export function getRoutes(vehicles: Vehicle[] = []): RouteItem[] {
  const vehicleByPlate = new Map<string, Vehicle>();
  vehicles.forEach(v => vehicleByPlate.set(v.vehicleNo.toUpperCase(), v));

  return memoryRoutes.map(r => {
    return {
      ...r,
    };
  });
}

export function createRoute(item: Partial<RouteItem>): RouteItem {
  const code = (item.code || item.id || '').trim().toUpperCase();
  if (!code) throw new Error('Route code is required');
  if (memoryRoutes.some(r => r.code === code)) {
    throw new Error(`Route ${code} already exists`);
  }
  const depotId = (item.depotId || 'KL').trim().toUpperCase();
  const newRoute: RouteItem = {
    id: code,
    code: code,
    name: item.name ? item.name.trim().toUpperCase() : code,
    depotId: depotId,
    assignedVehiclePlate: item.assignedVehiclePlate ? item.assignedVehiclePlate.trim().toUpperCase() : undefined,
    assignedDriverId: item.assignedDriverId || undefined,
    active: item.active !== false,
    description: item.description || '',
  };
  memoryRoutes.push(newRoute);
  saveRoutes();
  return newRoute;
}

export function updateRoute(id: string, updates: Partial<RouteItem>): RouteItem {
  const idx = memoryRoutes.findIndex(r => r.id === id || r.code === id);
  if (idx === -1) throw new Error(`Route ${id} not found`);
  const newCode = updates.code ? updates.code.trim().toUpperCase() : memoryRoutes[idx].code;
  
  memoryRoutes[idx] = {
    ...memoryRoutes[idx],
    ...updates,
    id: newCode,
    code: newCode,
    name: newCode,
    depotId: updates.depotId ? updates.depotId.trim().toUpperCase() : memoryRoutes[idx].depotId,
    assignedVehiclePlate: updates.assignedVehiclePlate !== undefined ? (updates.assignedVehiclePlate ? updates.assignedVehiclePlate.trim().toUpperCase() : undefined) : memoryRoutes[idx].assignedVehiclePlate,
  };
  saveRoutes();
  return memoryRoutes[idx];
}

export function deleteRoute(id: string): boolean {
  const initial = memoryRoutes.length;
  memoryRoutes = memoryRoutes.filter(r => r.id !== id && r.code !== id);
  if (memoryRoutes.length !== initial) {
    saveRoutes();
    return true;
  }
  return false;
}

// Bulk sync routes from vehicles
export function syncRoutesFromVehicles(vehicles: Vehicle[]): { added: number; total: number } {
  let added = 0;
  const existingCodes = new Set(memoryRoutes.map(r => r.code));
  vehicles.forEach(v => {
    const area = (v.area || v.assignedRoute || '').trim().toUpperCase();
    const branch = (v.branch || 'OTHER').trim().toUpperCase();
    if (area && !existingCodes.has(area)) {
      memoryRoutes.push({
        id: area,
        code: area,
        name: area,
        depotId: branch,
        assignedVehiclePlate: v.vehicleNo,
        active: true,
      });
      existingCodes.add(area);
      added++;
    }
  });
  if (added > 0) {
    memoryRoutes.sort((a, b) => a.code.localeCompare(b.code));
    saveRoutes();
  }
  return { added, total: memoryRoutes.length };
}
