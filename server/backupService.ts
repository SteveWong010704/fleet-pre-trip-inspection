import fs from 'fs';
import path from 'path';
import { InspectionRecord, AuditLog } from '../src/types';
import { logger } from './logger';

// Safe dynamic loader for AdmZip so server never crashes if user hasn't run npm install adm-zip yet
export function getAdmZip(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('adm-zip');
    return mod.default || mod;
  } catch {
    return null;
  }
}

export interface DayBackupDetail {
  date: string; // YYYY-MM-DD
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

export interface BackupStatus {
  backupRootDir: string;
  retentionDays: number;
  existingDays: DayBackupDetail[];
  lastBackupTime: string | null;
  lastBackupSizeKb: number;
  totalBackupsRun: number;
  status: 'idle' | 'running' | 'error';
  lastError?: string;
}

let lastBackupTime: string | null = null;
let lastBackupSizeKb: number = 0;
let totalBackupsRun: number = 0;
let debounceTimer: NodeJS.Timeout | null = null;
let cachedBackupStatus: { status: BackupStatus; timestamp: number } | null = null;
const BACKUP_STATUS_CACHE_TTL_MS = 5000; // 5 seconds cache

export function invalidateBackupStatusCache() {
  cachedBackupStatus = null;
}

/**
 * Determines backup root directory:
 * Prefers C:\FleetInspection_Backup on Windows, with fallback to ./backups on non-Windows/containers.
 * Can be overridden with process.env.BACKUP_DIR
 */
export function getBackupRootDir(): string {
  if (process.env.BACKUP_DIR) {
    const custom = process.env.BACKUP_DIR.trim();
    if (!fs.existsSync(custom)) {
      try {
        fs.mkdirSync(custom, { recursive: true });
      } catch {}
    }
    return custom;
  }

  // Test if Windows C:\ is available and writable
  if (process.platform === 'win32' || fs.existsSync('C:\\')) {
    try {
      const winDir = 'C:\\FleetInspection_Backup';
      if (!fs.existsSync(winDir)) {
        fs.mkdirSync(winDir, { recursive: true });
      }
      return winDir;
    } catch {
      // Fall through to project directory fallback
    }
  }

  const fallbackDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  return fallbackDir;
}

/**
 * Helper to generate CSV string for Inspection Records
 */
function generateInspectionsCsv(inspections: InspectionRecord[]): string {
  const headers = [
    'Inspection ID',
    'Date & Time',
    'Vehicle Plate',
    'Make & Model',
    'Depot',
    'Driver Name',
    'Driver ID',
    'Result',
    'Defects Count',
    'Defect Summary',
    'Odometer (KM)',
    'Fuel / Energy (%)',
    'GPS Lat',
    'GPS Lng',
    'GPS Address',
    'Photos Count',
  ];

  const rows = inspections.map((r) => [
    `"${r.id || ''}"`,
    `"${r.formattedDate || r.timestamp || ''}"`,
    `"${r.vehicleNo || ''}"`,
    `"${r.vehicleBrand || ''} ${r.vehicleModel || ''}"`,
    `"${r.vehicleBranch || r.driverDepot || ''}"`,
    `"${r.driverName || ''}"`,
    `"${r.driverId || ''}"`,
    `"${r.overallResult || ''}"`,
    r.defectCount || 0,
    `"${(r.defectSummary || '').replace(/"/g, '""')}"`,
    r.odometer || 0,
    r.fuelLevel || 0,
    r.gpsLocation?.lat || '',
    r.gpsLocation?.lng || '',
    `"${(r.gpsLocation?.address || '').replace(/"/g, '""')}"`,
    Array.isArray(r.photos) ? r.photos.length : 0,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Helper to generate CSV string for Audit Logs
 */
function generateAuditLogsCsv(logs: AuditLog[]): string {
  const headers = ['Log ID', 'Timestamp', 'Event Type', 'Operator', 'IP Address', 'Severity', 'Details'];

  const rows = logs.map((l) => [
    `"${l.id || ''}"`,
    `"${l.timestamp || ''}"`,
    `"${l.eventType || ''}"`,
    `"${l.operator || ''}"`,
    `"${l.ip || ''}"`,
    `"${l.severity || ''}"`,
    `"${(l.details || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Helper to calculate total directory size in bytes
 */
function getDirectorySizeBytes(dirPath: string): number {
  let total = 0;
  if (!fs.existsSync(dirPath)) return 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const f of files) {
      const full = path.join(dirPath, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        total += getDirectorySizeBytes(full);
      } else {
        total += stat.size;
      }
    }
  } catch {}
  return total;
}

/**
 * Executes an automated date-organized backup:
 * - Backs up according to date: photos, audit logs, and inspection records.
 * - Extracts all base64 photos into actual .jpg image files.
 * - Saves both JSON and Excel-friendly CSV tables.
 * - Enforces the 5-day retention policy (auto-deleting day 6 and older).
 */
export function performDailyBackup(reason: string = 'scheduled'): {
  success: boolean;
  backupRootDir: string;
  backedUpDates: string[];
  retainedDays: string[];
  purgedDays: string[];
  totalPhotosSaved: number;
  error?: string;
} {
  const rootDir = getBackupRootDir();
  const storeSource = path.join(process.cwd(), 'data', 'fleet_store.json');

  if (!fs.existsSync(storeSource)) {
    return {
      success: false,
      backupRootDir: rootDir,
      backedUpDates: [],
      retainedDays: [],
      purgedDays: [],
      totalPhotosSaved: 0,
      error: 'Source data/fleet_store.json not found yet',
    };
  }

  try {
    const storeRaw = fs.readFileSync(storeSource, 'utf-8');
    const storeData = JSON.parse(storeRaw);
    const inspections: InspectionRecord[] = storeData.inspections || [];
    const auditLogs: AuditLog[] = storeData.auditLogs || [];

    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Collect all dates that exist in current data, ensuring today is included
    const allDatesSet = new Set<string>();
    allDatesSet.add(todayStr);
    inspections.forEach((i) => {
      if (i.timestamp) {
        allDatesSet.add(i.timestamp.slice(0, 10));
      }
    });
    auditLogs.forEach((l) => {
      if (l.timestamp) {
        allDatesSet.add(l.timestamp.slice(0, 10));
      }
    });

    const datesToBackup = Array.from(allDatesSet).sort();
    const backedUpDates: string[] = [];
    let totalPhotosSaved = 0;

    for (const dateStr of datesToBackup) {
      const dayFolder = path.join(rootDir, `backup_${dateStr}`);
      if (!fs.existsSync(dayFolder)) {
        fs.mkdirSync(dayFolder, { recursive: true });
      }

      // Filter inspection records and audit logs for this specific date
      const dateInspections = inspections.filter((i) => (i.timestamp || '').slice(0, 10) === dateStr);
      const dateAuditLogs = auditLogs.filter((l) => (l.timestamp || '').slice(0, 10) === dateStr);

      // 1. Save Inspection Records for this date (JSON & CSV)
      const inspJsonFile = path.join(dayFolder, `inspections_${dateStr}.json`);
      fs.writeFileSync(inspJsonFile, JSON.stringify(dateInspections, null, 2), 'utf-8');

      const inspCsvFile = path.join(dayFolder, `inspections_${dateStr}.csv`);
      fs.writeFileSync(inspCsvFile, generateInspectionsCsv(dateInspections), 'utf-8');

      // 2. Save Audit Logs for this date (JSON & CSV)
      const auditJsonFile = path.join(dayFolder, `audit_logs_${dateStr}.json`);
      fs.writeFileSync(auditJsonFile, JSON.stringify(dateAuditLogs, null, 2), 'utf-8');

      const auditCsvFile = path.join(dayFolder, `audit_logs_${dateStr}.csv`);
      fs.writeFileSync(auditCsvFile, generateAuditLogsCsv(dateAuditLogs), 'utf-8');

      // 3. Extract & Backup ALL Photos for this date organized cleanly as:
      // upload/[date]/[number_plate]/01_Tires_Wheels.jpg ... 10_Fluids_Powertrain.jpg
      const standardTitles: Record<string, { code: number; title: string }> = {
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

      // Track filenames used per vehicle plate directory so NO photo overwrites another (Fix: saves all 5 tyres, 4 body sides, etc.)
      const plateUsedNames = new Map<string, Set<string>>();

      const getUniqueFileName = (
        cleanPlate: string,
        code: number,
        title?: string,
        photo?: any,
        photoIdx?: number
      ): string => {
        if (!plateUsedNames.has(cleanPlate)) {
          plateUsedNames.set(cleanPlate, new Set<string>());
        }
        const usedSet = plateUsedNames.get(cleanPlate)!;

        const codePrefix = String(code).padStart(2, '0');
        const cleanTitle = (title || `Item_${code}`)
          .replace(/^[0-9]+\.\s*/, '')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');

        let slotSuffix = '';
        if (photo?.slotName) {
          const cleanSlot = photo.slotName
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
          const slotNum = typeof photo.slotIndex === 'number' ? `_Slot${photo.slotIndex + 1}` : '';
          slotSuffix = `${slotNum}_${cleanSlot}`;
        } else if (typeof photo?.slotIndex === 'number') {
          slotSuffix = `_Slot${photo.slotIndex + 1}`;
        } else if (photo?.isDefect) {
          slotSuffix = `_Defect`;
        }

        let baseCandidate = `${codePrefix}_${cleanTitle}${slotSuffix}`;
        let candidate = `${baseCandidate}.jpg`;

        let counter = 2;
        while (usedSet.has(candidate)) {
          candidate = `${baseCandidate}_${counter}.jpg`;
          counter++;
        }

        usedSet.add(candidate);
        return candidate;
      };

      const photosCatalog: Array<{
        fileName: string;
        filePath: string;
        relativePath: string;
        photoUrl: string;
        fileSizeKb: number;
        vehicleNo: string;
        driverName: string;
        driverId: string;
        inspectionId: string;
        itemId: string;
        itemTitle: string;
        caption?: string;
        timestamp?: string;
      }> = [];

      for (const insp of dateInspections) {
        const cleanPlate = (insp.vehicleNo || 'VEHICLE').trim().toUpperCase().replace(/[^a-zA-Z0-9]/g, '_');

        // Create organized directories: upload/date/number_plate AND photos/number_plate
        const uploadPlateDir = path.join(dayFolder, 'upload', dateStr, cleanPlate);
        const photosPlateDir = path.join(dayFolder, 'photos', cleanPlate);
        if (!fs.existsSync(uploadPlateDir)) {
          fs.mkdirSync(uploadPlateDir, { recursive: true });
        }
        if (!fs.existsSync(photosPlateDir)) {
          fs.mkdirSync(photosPlateDir, { recursive: true });
        }

        // Helper to extract buffer from either base64 or local uploads path
        const extractBuffer = (photoUrl: string): Buffer | null => {
          if (!photoUrl) return null;
          if (photoUrl.startsWith('data:image/')) {
            try {
              const base64Data = photoUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
              return Buffer.from(base64Data, 'base64');
            } catch {
              return null;
            }
          } else if (photoUrl.startsWith('/uploads/')) {
            const localSrc = path.join(process.cwd(), photoUrl.replace(/^\//, ''));
            if (fs.existsSync(localSrc)) {
              try {
                return fs.readFileSync(localSrc);
              } catch {
                return null;
              }
            }
          }
          return null;
        };

        // 3.1 Save 10 Checkpoint Inspection Photos (Saves ALL photos: 5 tyres, 4 cargo doors, fluids, etc. uniquely)
        if (Array.isArray(insp.photos)) {
          insp.photos.forEach((photo, idx) => {
            const itemInfo = photo.itemId ? standardTitles[photo.itemId] : undefined;
            const code = itemInfo?.code || (idx + 1);
            const title = itemInfo?.title || photo.itemTitle || `Checkpoint_${code}`;
            const fileName = getUniqueFileName(cleanPlate, code, title, photo, idx);

            const buffer = extractBuffer(photo.url);
            if (buffer) {
              const uploadDest = path.join(uploadPlateDir, fileName);
              const photosDest = path.join(photosPlateDir, fileName);

              try {
                fs.writeFileSync(uploadDest, buffer);
                fs.writeFileSync(photosDest, buffer);

                // Parity guarantee: if photo.url was a local /uploads/ path with a different basename,
                // also save a copy under that exact original filename so both old & new URLs resolve perfectly
                if (photo.url && photo.url.startsWith('/uploads/')) {
                  const origBase = path.basename(photo.url);
                  if (origBase && origBase !== fileName) {
                    try {
                      fs.writeFileSync(path.join(uploadPlateDir, origBase), buffer);
                      fs.writeFileSync(path.join(photosPlateDir, origBase), buffer);
                    } catch {}
                  }
                }

                totalPhotosSaved += 1;
                photosCatalog.push({
                  fileName,
                  filePath: `upload/${dateStr}/${cleanPlate}/${fileName}`,
                  relativePath: `upload/${dateStr}/${cleanPlate}/${fileName}`,
                  photoUrl: `/api/backup/photos/${dateStr}/${cleanPlate}/${fileName}`,
                  fileSizeKb: Math.round(buffer.length / 1024),
                  vehicleNo: insp.vehicleNo,
                  driverName: insp.driverName,
                  driverId: insp.driverId,
                  inspectionId: insp.id,
                  itemId: photo.itemId,
                  itemTitle: photo.itemTitle || title,
                  caption: photo.caption,
                  timestamp: photo.timestamp || insp.timestamp,
                });
              } catch (photoErr) {
                console.error(`[Backup Photo Error] Failed to write ${fileName}:`, photoErr);
              }
            }
          });
        }

        // 3.2 Save driver signature if present
        if (insp.signature) {
          const sigBuffer = extractBuffer(insp.signature);
          if (sigBuffer) {
            try {
              fs.writeFileSync(path.join(uploadPlateDir, 'signature.png'), sigBuffer);
              fs.writeFileSync(path.join(photosPlateDir, 'signature.png'), sigBuffer);
            } catch {}
          }
        }
      }

      // Save photos catalog index
      fs.writeFileSync(
        path.join(dayFolder, 'photos_catalog.json'),
        JSON.stringify(photosCatalog, null, 2),
        'utf-8'
      );

      // 4. Save full store snapshot for total disaster recovery
      const storeSnapshotFile = path.join(dayFolder, 'fleet_store_snapshot.json');
      fs.writeFileSync(storeSnapshotFile, storeRaw, 'utf-8');

      // 5. Create human-readable summary text file
      const summaryText = [
        '================================================================================',
        `FLEET PRE-TRIP INSPECTION SYSTEM - DAILY DATE BACKUP: ${dateStr}`,
        '================================================================================',
        `Backup Created: ${new Date().toLocaleString('en-US')}`,
        `Trigger Reason: ${reason}`,
        `Storage Location: ${dayFolder}`,
        '',
        '--- 1. INSPECTION RECORDS ---',
        `Total Inspections Conducted on ${dateStr}: ${dateInspections.length}`,
        `Passed: ${dateInspections.filter((i) => i.overallResult === 'Pass').length}`,
        `Defects / Grounded: ${dateInspections.filter((i) => i.overallResult === 'Fail').length}`,
        `JSON File: inspections_${dateStr}.json`,
        `Excel/CSV File: inspections_${dateStr}.csv`,
        '',
        '--- 2. SECURITY AUDIT LOGS ---',
        `Total Audit Trail Events Logged on ${dateStr}: ${dateAuditLogs.length}`,
        `JSON File: audit_logs_${dateStr}.json`,
        `Excel/CSV File: audit_logs_${dateStr}.csv`,
        '',
        '--- 3. PHOTO EVIDENCE ARCHIVE (HIERARCHICAL BY VEHICLE) ---',
        `Total Checkpoint Photos Backed Up: ${photosCatalog.length} image files`,
        `Directory Hierarchy:`,
        `  upload/${dateStr}/[NUMBER_PLATE]/ (10 Checkpoint Inspection Photos per Truck)`,
        `  photos/[NUMBER_PLATE]/ (10 Checkpoint Inspection Photos per Truck)`,
        `Example:`,
        `  upload/${dateStr}/VFH2715/01_Tires_Wheels.jpg`,
        `  upload/${dateStr}/VFH2715/02_Brake_System.jpg`,
        `  ...`,
        `  upload/${dateStr}/VFH2715/10_Fluids_Powertrain.jpg`,
        `Photo Index Catalog: photos_catalog.json`,
        '',
        '--- 4. FULL SYSTEM RESTORE SNAPSHOT ---',
        `Snapshot File: fleet_store_snapshot.json (contains full fleet & driver registry)`,
        '',
        '--- 5. RETENTION POLICY ---',
        'Automatic rolling retention archives. Backups preserved for 90 days.',
        '================================================================================',
      ].join('\n');

      fs.writeFileSync(path.join(dayFolder, 'SUMMARY.txt'), summaryText, 'utf-8');

      // 6. Write manifest
      const dirSizeBytes = getDirectorySizeBytes(dayFolder);
      const manifest = {
        backupDate: dateStr,
        timestamp: new Date().toISOString(),
        inspectionsCount: dateInspections.length,
        auditLogsCount: dateAuditLogs.length,
        photosCount: photosCatalog.length,
        folderSizeKb: Math.round(dirSizeBytes / 1024),
        triggerReason: reason,
        platform: process.platform,
        backupRootDir: rootDir,
      };
      fs.writeFileSync(path.join(dayFolder, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

      // 7. Create ZIP archive for easy single-click download (if adm-zip is installed)
      const AdmZipClass = getAdmZip();
      if (AdmZipClass) {
        try {
          const zip = new AdmZipClass();
          zip.addLocalFolder(dayFolder);
          zip.writeZip(path.join(rootDir, `backup_${dateStr}.zip`));
        } catch (zipErr) {
          console.warn(`[Backup Zip Warning] Failed to build zip for ${dateStr}:`, zipErr);
        }
      }

      backedUpDates.push(dateStr);
    }

    // 8. Enforce 90-Day Retention Policy:
    // Scan all backup_YYYY-MM-DD folders, sort chronologically, and purge any older than the 90 latest days (Day 91 auto-purged)
    const allEntries = fs.readdirSync(rootDir);
    const dayFolders = allEntries
      .filter((name) => name.startsWith('backup_') && /^\d{4}-\d{2}-\d{2}$/.test(name.replace('backup_', '')))
      .sort(); // Lexicographical sort on YYYY-MM-DD is chronological

    const MAX_RETENTION_DAYS = 90;
    const purgedDays: string[] = [];

    if (dayFolders.length > MAX_RETENTION_DAYS) {
      const foldersToDelete = dayFolders.slice(0, dayFolders.length - MAX_RETENTION_DAYS);
      for (const oldFolder of foldersToDelete) {
        const fullFolderPath = path.join(rootDir, oldFolder);
        const fullZipPath = path.join(rootDir, `${oldFolder}.zip`);

        try {
          if (fs.existsSync(fullFolderPath)) {
            fs.rmSync(fullFolderPath, { recursive: true, force: true });
          }
          if (fs.existsSync(fullZipPath)) {
            fs.rmSync(fullZipPath, { force: true });
          }
          purgedDays.push(oldFolder);
          logger.info(
            'BACKUP',
            `[Backup Retention] Purged expired backup: ${oldFolder} (strictly retaining latest ${MAX_RETENTION_DAYS} days).`
          );
        } catch (delErr) {
          logger.error('BACKUP', `[Backup Retention Error] Failed to delete ${oldFolder}:`, delErr);
        }
      }
    }

    const retainedDays = dayFolders.filter((f) => !purgedDays.includes(f));
    lastBackupTime = new Date().toISOString();
    lastBackupSizeKb = Math.round(getDirectorySizeBytes(rootDir) / 1024);
    totalBackupsRun += 1;

    logger.info(
      'BACKUP',
      `Completed date-organized backup to ${rootDir}. Retained ${retainedDays.length} day(s), purged ${purgedDays.length} day(s), total photos saved: ${totalPhotosSaved}.`
    );

    invalidateBackupStatusCache();

    return {
      success: true,
      backupRootDir: rootDir,
      backedUpDates,
      retainedDays,
      purgedDays,
      totalPhotosSaved,
    };
  } catch (err: any) {
    logger.error('BACKUP', 'Failed to execute daily backup:', err);
    return {
      success: false,
      backupRootDir: rootDir,
      backedUpDates: [],
      retainedDays: [],
      purgedDays: [],
      totalPhotosSaved: 0,
      error: err.message,
    };
  }
}

/**
 * Debounced backup triggered after data mutations.
 * Protects 400-driver morning peak hours (06:00 - 10:00) from heavy ZIP CPU spikes.
 */
export function scheduleDebouncedBackup(delayMs: number = 300000) {
  const currentHour = new Date().getHours();
  // During peak morning / evening inspection rush (06:00-09:30 & 17:00-19:30), defer CPU-heavy ZIP compression
  if ((currentHour >= 6 && currentHour <= 9) || (currentHour >= 17 && currentHour <= 19)) {
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    performDailyBackup('data_change_auto');
  }, delayMs);
}

/**
 * Returns current backup status with full day-by-day inspection, photo, and audit log telemetry
 */
export function getBackupStatus(): BackupStatus {
  const now = Date.now();
  if (cachedBackupStatus && now - cachedBackupStatus.timestamp < BACKUP_STATUS_CACHE_TTL_MS) {
    return cachedBackupStatus.status;
  }

  const rootDir = getBackupRootDir();
  const existingDays: DayBackupDetail[] = [];

  try {
    if (fs.existsSync(rootDir)) {
      const entries = fs
        .readdirSync(rootDir)
        .filter((name) => name.startsWith('backup_') && /^\d{4}-\d{2}-\d{2}$/.test(name.replace('backup_', '')))
        .sort()
        .reverse(); // Newest first

      for (const folderName of entries) {
        const dateStr = folderName.replace('backup_', '');
        const folderPath = path.join(rootDir, folderName);
        const zipPath = path.join(rootDir, `${folderName}.zip`);
        const hasZip = fs.existsSync(zipPath);

        let inspectionsCount = 0;
        let auditLogsCount = 0;
        let photosCount = 0;
        let lastUpdated = '';

        // Read manifest if available
        const manifestPath = path.join(folderPath, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            inspectionsCount = manifest.inspectionsCount || 0;
            auditLogsCount = manifest.auditLogsCount || 0;
            photosCount = manifest.photosCount || 0;
            lastUpdated = manifest.timestamp || '';
          } catch {}
        } else {
          // Count files directly
          const inspJson = path.join(folderPath, `inspections_${dateStr}.json`);
          if (fs.existsSync(inspJson)) {
            try {
              inspectionsCount = JSON.parse(fs.readFileSync(inspJson, 'utf-8')).length;
            } catch {}
          }
          const photosDir = path.join(folderPath, 'photos');
          if (fs.existsSync(photosDir)) {
            try {
              photosCount = fs.readdirSync(photosDir).length;
            } catch {}
          }
        }

        const folderSizeBytes = getDirectorySizeBytes(folderPath);

        existingDays.push({
          date: dateStr,
          folderName,
          folderPath,
          inspectionsCount,
          auditLogsCount,
          photosCount,
          totalSizeKb: Math.round(folderSizeBytes / 1024),
          hasZip,
          zipPath: hasZip ? zipPath : undefined,
          lastUpdated: lastUpdated || new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error('[Get Backup Status Error]', err);
  }

  const result: BackupStatus = {
    backupRootDir: rootDir,
    retentionDays: 90,
    existingDays,
    lastBackupTime,
    lastBackupSizeKb,
    totalBackupsRun,
    status: 'idle',
  };

  cachedBackupStatus = { status: result, timestamp: now };
  return result;
}

/**
 * Restores a specific day's data & photos from an uploaded backup ZIP archive
 */
export async function restoreFromBackupZip(zipBuffer: Buffer, originalFilename?: string): Promise<{
  success: boolean;
  backupDate?: string;
  inspectionsRestored: number;
  photosRestored: number;
  message: string;
}> {
  const AdmZipClass = getAdmZip();
  if (!AdmZipClass) {
    throw new Error('The adm-zip library is not available. Please run "npm install adm-zip" on the server to enable ZIP restore.');
  }

  const zip = new AdmZipClass(zipBuffer);
  const zipEntries = zip.getEntries();
  const rootDir = getBackupRootDir();
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // 1. Detect date from filename or entries
  let backupDate = '';
  if (originalFilename) {
    const match = originalFilename.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) backupDate = match[1];
  }

  let inspectionsList: InspectionRecord[] = [];
  let photosRestored = 0;
  interface PhotoEntry {
    entryName: string;
    basename: string;
    data: Buffer;
    dateStr?: string;
    cleanPlate?: string;
    codePrefix?: string;
  }
  const photoEntries: PhotoEntry[] = [];

  // 2. Iterate through entries
  for (const entry of zipEntries) {
    const entryName = entry.entryName.replace(/\\/g, '/');

    // If inspections JSON file
    if (entryName.includes('inspections_') && entryName.endsWith('.json')) {
      try {
        const content = entry.getData().toString('utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          inspectionsList = parsed;
          if (!backupDate) {
            const dateMatch = entryName.match(/(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) backupDate = dateMatch[1];
          }
        }
      } catch (err) {
        console.warn('[Restore] Error parsing inspections json:', err);
      }
    }

    // If photo file
    if (
      !entry.isDirectory &&
      /\.(jpe?g|png|webp)$/i.test(entryName)
    ) {
      try {
        const basename = path.basename(entryName);
        const dateMatch = entryName.match(/(\d{4}-\d{2}-\d{2})/);
        const dateStr = dateMatch ? dateMatch[1] : backupDate;
        
        let cleanPlate = '';
        const plateMatch = entryName.match(/(?:upload\/\d{4}-\d{2}-\d{2}|photos|uploads\/\d{4}-\d{2}-\d{2}|upload|uploads)\/([^\/]+)\/([^\/]+)$/i);
        if (plateMatch) {
          cleanPlate = plateMatch[1].trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
        }

        const codeMatch = basename.match(/^(\d{2})_/);
        const codePrefix = codeMatch ? codeMatch[1] : undefined;

        const data = entry.getData();
        photoEntries.push({
          entryName,
          basename,
          data,
          dateStr,
          cleanPlate,
          codePrefix,
        });

        // Write to primary uploads location
        const targetDate = dateStr || backupDate || new Date().toISOString().slice(0, 10);
        const subPath = cleanPlate ? path.join(targetDate, cleanPlate, basename) : path.join(targetDate, basename);
        const targetUploadPath = path.join(uploadsDir, subPath);
        const targetDir = path.dirname(targetUploadPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(targetUploadPath, data);
        photosRestored++;
      } catch (photoErr) {
        console.warn('[Restore] Error extracting photo:', photoErr);
      }
    }
  }

  // Fallback: if inspections_*.json not found, check for fleet_store_snapshot.json
  if (inspectionsList.length === 0) {
    const snapshotEntry = zipEntries.find((e: any) => e.entryName.endsWith('fleet_store_snapshot.json'));
    if (snapshotEntry) {
      try {
        const snap = JSON.parse(snapshotEntry.getData().toString('utf-8'));
        if (Array.isArray(snap.inspections)) {
          inspectionsList = snap.inspections;
        }
      } catch {}
    }
  }

  // 2.5 Cross-reference every inspection record's photo URLs to guarantee they exist on disk at the exact expected path
  if (inspectionsList.length > 0 && photoEntries.length > 0) {
    for (const insp of inspectionsList) {
      const inspDate = (insp.timestamp ? insp.timestamp.slice(0, 10) : backupDate) || backupDate || new Date().toISOString().slice(0, 10);
      const cleanPlate = (insp.vehicleNo || 'FLEET').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');

      const ensurePhotoOnDisk = (photoUrl?: string, itemCode?: number | string) => {
        if (!photoUrl || !photoUrl.startsWith('/uploads/')) return;
        const subPath = photoUrl.replace(/^\/uploads\//, '');
        const fullExpectedPath = path.join(uploadsDir, ...subPath.split('/'));
        if (fs.existsSync(fullExpectedPath)) return;

        const targetBase = path.basename(subPath);
        const targetCode = String(itemCode || '').padStart(2, '0');

        const isRadiator =
          targetBase.toLowerCase().includes('radiator') ||
          targetBase.toLowerCase().includes('coolant') ||
          targetCode === '05' ||
          targetCode === '03';

        const isDiesel =
          targetBase.toLowerCase().includes('diesel') ||
          targetBase.toLowerCase().includes('fuel') ||
          targetBase.toLowerCase().includes('cap') ||
          targetCode === '09' ||
          targetCode === '07' ||
          targetCode === '04';

        // Find match in extracted photos
        const match =
          photoEntries.find((p) => p.cleanPlate === cleanPlate && p.basename.toLowerCase() === targetBase.toLowerCase()) ||
          photoEntries.find((p) => p.basename.toLowerCase() === targetBase.toLowerCase()) ||
          (isRadiator
            ? photoEntries.find(
                (p) =>
                  (p.cleanPlate === cleanPlate || !p.cleanPlate) &&
                  (p.basename.toLowerCase().includes('radiator') ||
                    p.basename.toLowerCase().includes('coolant') ||
                    p.codePrefix === '05' ||
                    p.codePrefix === '03')
              )
            : null) ||
          (isDiesel
            ? photoEntries.find(
                (p) =>
                  (p.cleanPlate === cleanPlate || !p.cleanPlate) &&
                  (p.basename.toLowerCase().includes('diesel') ||
                    p.basename.toLowerCase().includes('fuel') ||
                    p.basename.toLowerCase().includes('cap') ||
                    p.codePrefix === '09' ||
                    p.codePrefix === '07' ||
                    p.codePrefix === '04')
              )
            : null) ||
          photoEntries.find((p) => p.cleanPlate === cleanPlate && targetCode && p.codePrefix === targetCode) ||
          photoEntries.find((p) => p.cleanPlate === cleanPlate);

        if (match) {
          try {
            fs.mkdirSync(path.dirname(fullExpectedPath), { recursive: true });
            fs.writeFileSync(fullExpectedPath, match.data);
          } catch {}
        }
      };

      if (Array.isArray(insp.photos)) {
        insp.photos.forEach((p, idx) => ensurePhotoOnDisk(p.url, idx + 1));
      }
      if (Array.isArray(insp.items)) {
        insp.items.forEach((it, idx) => ensurePhotoOnDisk(it.photoUrl, it.code || idx + 1));
      }
      if (Array.isArray(insp.checkpoints)) {
        insp.checkpoints.forEach((cp, idx) => ensurePhotoOnDisk(cp.photoUrl, cp.code || idx + 1));
      }
      if (Array.isArray(insp.defects)) {
        insp.defects.forEach((def) => ensurePhotoOnDisk(def.photoUrl));
      }
      if (insp.signature) {
        ensurePhotoOnDisk(insp.signature);
      }
    }
  }

  if (inspectionsList.length === 0 && photosRestored === 0) {
    throw new Error('No valid inspection records or photos were found inside the uploaded backup ZIP archive.');
  }

  // 3. Merge inspections into active database
  const { mergeRestoredInspections } = await import('./storage');
  const mergeResult = mergeRestoredInspections(inspectionsList);

  // 4. Also preserve the restored backup folder in C:\FleetInspection_Backup
  if (backupDate) {
    try {
      const targetFolder = path.join(rootDir, `backup_${backupDate}`);
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }
      zip.extractAllTo(targetFolder, true);
    } catch (extractErr) {
      console.warn('[Restore] Note: Could not extract full zip to backup dir:', extractErr);
    }
  }

  invalidateBackupStatusCache();

  return {
    success: true,
    backupDate: backupDate || 'Target Date',
    inspectionsRestored: mergeResult.added + mergeResult.updated,
    photosRestored,
    message: `Successfully restored ${mergeResult.added} new records, updated ${mergeResult.updated} records, and recovered ${photosRestored} photo evidence file(s).`,
  };
}

/**
 * Initializes the automated backup service:
 * - Runs backup 3 seconds after boot
 * - Sets hourly interval to perform daily rolling backup, 90-day pruning, and 45-day DB maintenance
 */
export function initBackupService() {
  console.log(`[Backup Engine] Initializing automated backup service. Root: ${getBackupRootDir()}`);

  // Initial backup shortly after startup
  setTimeout(() => {
    performDailyBackup('server_boot');
  }, 3000);

  // Hourly recurring backup & retention pruning check
  setInterval(async () => {
    performDailyBackup('hourly_auto_check');
    try {
      const { pruneOldInspections } = await import('./storage');
      pruneOldInspections(45);
    } catch (err) {
      console.warn('[DB Prune Check Warning]', err);
    }
  }, 60 * 60 * 1000);
}
