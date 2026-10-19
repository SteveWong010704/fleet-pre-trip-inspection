import { Vehicle, Driver, InspectionRecord, AuditLog, FleetStats, ExecutiveAnalyticsData, RegionItem, DepotItem, RouteItem } from '../types';

const AUTH_TOKEN_KEY = 'FLEET_SESSION_JWT';

export function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    try {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {}
  } else {
    try {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {}
  }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearAuthToken() {
  setAuthToken(null);
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

export async function fetchStats(filters?: { branch?: string; date?: string; route?: string; truckCategory?: string; category?: string; tonnage?: string | number }): Promise<FleetStats> {
  const params = new URLSearchParams();
  if (filters?.branch && filters.branch !== 'ALL') params.append('branch', filters.branch);
  if (filters?.date) params.append('date', filters.date);
  if (filters?.route && filters.route !== 'ALL') params.append('route', filters.route);
  if (filters?.truckCategory && filters.truckCategory !== 'ALL') params.append('truckCategory', filters.truckCategory);
  if (filters?.category && filters.category !== 'ALL') params.append('category', filters.category);
  if (filters?.tonnage && filters.tonnage !== 'ALL') params.append('tonnage', String(filters.tonnage));

  const res = await authFetch(`/api/stats?${params.toString()}`);
  const data = await res.json();
  return data.stats;
}

export async function fetchVehicles(filters?: { branch?: string; status?: string; search?: string; truckCategory?: string; category?: string }): Promise<Vehicle[]> {
  const params = new URLSearchParams();
  if (filters?.branch && filters.branch !== 'ALL') params.append('branch', filters.branch);
  if (filters?.status && filters.status !== 'ALL') params.append('status', filters.status);
  if (filters?.truckCategory && filters.truckCategory !== 'ALL') params.append('truckCategory', filters.truckCategory);
  if (filters?.category && filters.category !== 'ALL') params.append('category', filters.category);
  if (filters?.search) params.append('search', filters.search);

  const res = await authFetch(`/api/vehicles?${params.toString()}`);
  const data = await res.json();
  return data.vehicles || [];
}

export async function fetchVehicleByPlate(plate: string, token?: string): Promise<(Vehicle & { qrVerified?: boolean }) | null> {
  const params = new URLSearchParams();
  if (token) params.append('token', token);
  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await authFetch(`/api/vehicles/${encodeURIComponent(plate)}${queryStr}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.vehicle) return null;
  return {
    ...data.vehicle,
    qrVerified: data.qrVerified ?? false,
  };
}

export async function verifyVehicleQr(plate: string, token: string): Promise<{ valid: boolean; vehicle?: Vehicle; message?: string }> {
  const params = new URLSearchParams({ plate, token });
  const res = await authFetch(`/api/vehicles/verify-qr?${params.toString()}`);
  const data = await res.json();
  return { valid: data.valid ?? false, vehicle: data.vehicle, message: data.message };
}

export async function regenerateVehicleQrToken(plate: string, securityPassword?: string): Promise<Vehicle> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (securityPassword) {
    headers['X-Security-Password'] = securityPassword;
  }
  const res = await authFetch(`/api/vehicles/${encodeURIComponent(plate)}/regenerate-qr-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ securityPassword }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to regenerate vehicle QR token');
  return data.vehicle;
}

export async function createVehicle(vehicleData: Partial<Vehicle>): Promise<Vehicle> {
  const res = await authFetch('/api/vehicles/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vehicleData),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to create vehicle');
  return data.vehicle;
}

export async function updateVehicle(vehicleNo: string, updates: Partial<Vehicle>, securityPassword?: string): Promise<Vehicle> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (securityPassword) {
    headers['X-Security-Password'] = securityPassword;
  }
  const res = await authFetch('/api/vehicles/update', {
    method: 'POST',
    headers,
    body: JSON.stringify({ vehicleNo, updates, securityPassword }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to update vehicle');
  return data.vehicle;
}

export async function deleteVehicle(plate: string): Promise<boolean> {
  const res = await authFetch(`/api/vehicles/${encodeURIComponent(plate)}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function updateVehicleStatus(vehicleNo: string, updates: Partial<Vehicle>): Promise<Vehicle> {
  return updateVehicle(vehicleNo, updates);
}

export async function createDriver(driverData: Partial<Driver>): Promise<Driver> {
  const res = await authFetch('/api/drivers/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(driverData),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to create driver');
  return data.driver;
}

export async function updateDriver(
  identifier: string, 
  updates: Partial<Driver>,
  options?: {
    originalIdentifier?: string;
    originalEmployeeId?: string;
    originalLoginId?: string;
  }
): Promise<Driver> {
  const res = await authFetch('/api/drivers/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier,
      updates,
      originalIdentifier: options?.originalIdentifier,
      originalEmployeeId: options?.originalEmployeeId,
      originalLoginId: options?.originalLoginId,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to update driver');
  return data.driver;
}

export async function deleteDriver(identifier: string): Promise<boolean> {
  const res = await authFetch(`/api/drivers/${encodeURIComponent(identifier)}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function fetchDrivers(filters?: { depot?: string; status?: string; search?: string }): Promise<Driver[]> {
  const params = new URLSearchParams();
  if (filters?.depot && filters.depot !== 'ALL') params.append('depot', filters.depot);
  if (filters?.status && filters.status !== 'ALL') params.append('status', filters.status);
  if (filters?.search) params.append('search', filters.search);

  const res = await authFetch(`/api/drivers?${params.toString()}`);
  const data = await res.json();
  return data.drivers || [];
}

export async function loginAdmin(username: string, passwordAttempt: string) {
  const res = await authFetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: passwordAttempt }),
  });
  const data = await res.json();
  if (data.success && data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export interface DriverDailyCheckResponse {
  hasInspectedToday: boolean;
  hasReachedLimit?: boolean;
  inspectionCount?: number;
  maxAllowed?: number;
  isSupervisor?: boolean;
  designation?: string;
  inspection?: InspectionRecord;
  inspections?: InspectionRecord[];
}

export async function checkDriverDailyInspection(driverId: string): Promise<DriverDailyCheckResponse> {
  const res = await authFetch(`/api/drivers/daily-check/${encodeURIComponent(driverId)}`);
  const data = await res.json();
  return {
    hasInspectedToday: data.hasInspectedToday ?? false,
    hasReachedLimit: data.hasReachedLimit ?? data.hasInspectedToday ?? false,
    inspectionCount: data.inspectionCount ?? 0,
    maxAllowed: data.maxAllowed ?? (data.isSupervisor ? 3 : 1),
    isSupervisor: data.isSupervisor ?? false,
    designation: data.designation,
    inspection: data.inspection,
    inspections: data.inspections,
  };
}

export async function checkVehicleDailyInspection(vehicleNo: string): Promise<{ hasInspectedToday: boolean; inspection?: InspectionRecord }> {
  const res = await authFetch(`/api/vehicles/daily-check/${encodeURIComponent(vehicleNo)}`);
  const data = await res.json();
  return { hasInspectedToday: data.hasInspectedToday, inspection: data.inspection };
}

export async function loginDriver(loginId: string, passwordAttempt: string) {
  const res = await authFetch('/api/drivers/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId, password: passwordAttempt }),
  });
  const data = await res.json();
  if (data.success && data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function submitInspection(record: Omit<InspectionRecord, 'id' | 'timestamp' | 'formattedDate'>): Promise<InspectionRecord> {
  const res = await authFetch('/api/inspections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || data.message || 'Failed to submit inspection');
  }
  return data.inspection;
}

export async function fetchInspections(filters?: {
  vehicleNo?: string;
  driverId?: string;
  result?: string;
  branch?: string;
  route?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<InspectionRecord[]> {
  const params = new URLSearchParams();
  if (filters?.vehicleNo) params.append('vehicleNo', filters.vehicleNo);
  if (filters?.driverId) params.append('driverId', filters.driverId);
  if (filters?.result && filters.result !== 'ALL') params.append('result', filters.result);
  if (filters?.branch && filters.branch !== 'ALL') params.append('branch', filters.branch);
  if (filters?.route && filters.route !== 'ALL') params.append('route', filters.route);
  if (filters?.date) params.append('date', filters.date);
  if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.append('dateTo', filters.dateTo);

  const res = await authFetch(`/api/inspections?${params.toString()}`);
  const data = await res.json();
  return data.inspections || [];
}

export async function uploadWatermarkedPhoto(imageBase64: string, metadata: { vehicleNo?: string; driverName?: string; gps?: any }): Promise<string> {
  const res = await authFetch('/api/upload-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, ...metadata }),
  });
  const data = await res.json();
  return data.url || imageBase64;
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const res = await authFetch('/api/audit-logs');
  const data = await res.json();
  return data.logs || [];
}

export async function clearAllInspections(securityPassword?: string): Promise<boolean> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (securityPassword) {
    headers['X-Security-Password'] = securityPassword;
  }
  const res = await authFetch('/api/inspections', {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ securityPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to clear inspection records');
  }
  return true;
}

export async function clearAllFleetData(securityPassword?: string): Promise<{ success: boolean; message: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (securityPassword) {
    headers['X-Security-Password'] = securityPassword;
  }
  const res = await authFetch('/api/storage/clear-all', {
    method: 'POST',
    headers,
    body: JSON.stringify({ securityPassword }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || data.error || 'Failed to clear fleet data');
  return data;
}

export async function clearAllVehicles(securityPassword?: string): Promise<{ success: boolean; message: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (securityPassword) {
    headers['X-Security-Password'] = securityPassword;
  }
  const res = await authFetch('/api/vehicles/clear-all', {
    method: 'POST',
    headers,
    body: JSON.stringify({ securityPassword }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || data.error || 'Failed to clear vehicles');
  return data;
}

export async function clearAllDrivers(securityPassword?: string): Promise<{ success: boolean; message: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (securityPassword) {
    headers['X-Security-Password'] = securityPassword;
  }
  const res = await authFetch('/api/drivers/clear-all', {
    method: 'POST',
    headers,
    body: JSON.stringify({ securityPassword }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || data.error || 'Failed to clear drivers');
  return data;
}

export async function bulkUploadVehicles(vehicles: Partial<Vehicle>[]) {
  const res = await authFetch('/api/vehicles/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicles }),
  });
  return await res.json();
}

export async function bulkUploadDrivers(drivers: Partial<Driver>[]) {
  const res = await authFetch('/api/drivers/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drivers }),
  });
  return await res.json();
}

export async function bulkUploadInspections(inspections: Partial<InspectionRecord>[]) {
  const res = await authFetch('/api/inspections/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspections }),
  });
  return await res.json();
}

export interface DayBackupDetail {
  date: string;
  folderName: string;
  folderPath: string;
  inspectionsCount: number;
  auditLogsCount: number;
  photosCount: number;
  totalSizeKb: number;
  hasZip: boolean;
  zipPath?: string;
  lastUpdated: string;
}

export interface BackupStatusResponse {
  success: boolean;
  backupRootDir: string;
  retentionDays: number;
  existingDays: DayBackupDetail[];
  lastBackupTime: string | null;
  lastBackupSizeKb: number;
  totalBackupsRun: number;
  status: 'idle' | 'running' | 'error';
  lastError?: string;
}

export async function fetchBackupStatus(): Promise<BackupStatusResponse> {
  const res = await authFetch('/api/backup/status');
  return await res.json();
}

export async function runManualBackup(): Promise<{
  success: boolean;
  backupRootDir: string;
  backedUpDates: string[];
  retainedDays: string[];
  purgedDays: string[];
  totalPhotosSaved: number;
  error?: string;
}> {
  const res = await authFetch('/api/backup/run', {
    method: 'POST',
  });
  return await res.json();
}

export function getBackupDownloadUrl(date: string): string {
  const token = getAuthToken();
  const base = `/api/backup/download/${encodeURIComponent(date)}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getBackupFileUrl(date: string, filename: string): string {
  const token = getAuthToken();
  const base = `/api/backup/file/${encodeURIComponent(date)}/${encodeURIComponent(filename)}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getBackupPhotoUrl(date: string, photoPath: string): string {
  const cleanPath = (photoPath || '').replace(/^\/+/, '');
  const encodedParts = cleanPath.split('/').map(encodeURIComponent).join('/');
  return `/api/backup/photos/${encodeURIComponent(date)}/${encodedParts}`;
}

export async function restoreBackupZip(file: File): Promise<{
  success: boolean;
  message: string;
  backupDate?: string;
  inspectionsRestored?: number;
  photosRestored?: number;
  error?: string;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const res = await authFetch('/api/backup/restore', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'X-Filename': encodeURIComponent(file.name),
    },
    body: arrayBuffer,
  });
  return await res.json();
}

export async function pruneActiveDbInspections(maxDays: number = 45): Promise<{
  success: boolean;
  prunedCount: number;
  remainingCount: number;
  message: string;
}> {
  const res = await authFetch('/api/storage/prune-inspections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxDays }),
  });
  return await res.json();
}

export async function fetchExecutiveAnalytics(filters?: {
  timeframe?: string;
  branch?: string;
  truckCategory?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ExecutiveAnalyticsData> {
  const params = new URLSearchParams();
  if (filters?.timeframe) params.append('timeframe', filters.timeframe);
  if (filters?.branch && filters.branch !== 'ALL') params.append('branch', filters.branch);
  if (filters?.truckCategory && filters.truckCategory !== 'ALL') params.append('truckCategory', filters.truckCategory);
  if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.append('dateTo', filters.dateTo);

  const res = await authFetch(`/api/analytics?${params.toString()}`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch analytics');
  }
  return data.data;
}

export async function seedDemoInspections(daysBack: number = 30): Promise<{
  success: boolean;
  message: string;
  seededCount: number;
  totalInspections: number;
}> {
  const res = await authFetch('/api/analytics/seed-demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysBack }),
  });
  return await res.json();
}

// ----------------- OPERATIONS HIERARCHY API CLIENT -----------------
export async function fetchRegions(): Promise<RegionItem[]> {
  const res = await authFetch('/api/operations/regions');
  const d = await res.json();
  return d.data || [];
}

export async function createRegionApi(item: Partial<RegionItem>): Promise<RegionItem> {
  const res = await authFetch('/api/operations/regions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Failed to create region');
  return d.data;
}

export async function updateRegionApi(id: string, updates: Partial<RegionItem>): Promise<RegionItem> {
  const res = await authFetch(`/api/operations/regions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Failed to update region');
  return d.data;
}

export async function deleteRegionApi(id: string): Promise<boolean> {
  const res = await authFetch(`/api/operations/regions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Failed to delete region');
  return d.deleted;
}

export async function fetchDepots(): Promise<DepotItem[]> {
  const res = await authFetch('/api/operations/depots');
  const d = await res.json();
  return d.data || [];
}

export async function createDepotApi(item: Partial<DepotItem>): Promise<DepotItem> {
  const res = await authFetch('/api/operations/depots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Failed to create depot');
  return d.data;
}

export async function updateDepotApi(id: string, updates: Partial<DepotItem>): Promise<DepotItem> {
  const res = await authFetch(`/api/operations/depots/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Failed to update depot');
  return d.data;
}

export async function deleteDepotApi(id: string): Promise<boolean> {
  const res = await authFetch(`/api/operations/depots/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Failed to delete depot');
  return d.deleted;
}

export async function fetchRoutes(): Promise<RouteItem[]> {
  const res = await authFetch('/api/operations/routes');
  const d = await res.json();
  return d.data || [];
}

export async function createRouteApi(item: Partial<RouteItem>): Promise<RouteItem> {
  const res = await authFetch('/api/operations/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Failed to create route');
  return d.data;
}

export async function updateRouteApi(id: string, updates: Partial<RouteItem>): Promise<RouteItem> {
  const res = await authFetch(`/api/operations/routes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Failed to update route');
  return d.data;
}

export async function deleteRouteApi(id: string): Promise<boolean> {
  const res = await authFetch(`/api/operations/routes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const d = await res.json();
  if (!d.success) throw new Error(d.error || 'Failed to delete route');
  return d.deleted;
}

export async function syncRoutesFromVehiclesApi(): Promise<{ added: number; total: number }> {
  const res = await authFetch('/api/operations/routes/sync', { method: 'POST' });
  return await res.json();
}

