import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  initStore,
  saveStore,
  saveStoreSync,
  getVehicles,
  getVehicleByPlate,
  updateVehicle,
  createVehicle,
  deleteVehicle,
  regenerateVehicleQrToken,
  bulkImportVehicles,
  getDrivers,
  getDriverByLogin,
  verifyDriverLogin,
  updateDriver,
  createDriver,
  deleteDriver,
  bulkImportDrivers,
  unlockDriver,
  verifyAdminLogin,
  getDriverDailyInspection,
  getDriverDailyInspections,
  getDriverInspectionStatus,
  isSupervisor,
  getVehicleDailyInspection,
  getInspections,
  addInspection,
  getAuditLogs,
  getFleetStats,
  savePhotoToDisk,
  getVehicleCsvTemplate,
  getDriverCsvTemplate,
  getInspectionCsvTemplate,
  getGoogleFormCsvTemplate,
  bulkImportInspections,
  clearAllInspections,
  clearAllFleetData,
  clearAllVehicles,
  clearAllDrivers,
  purgeAllDemoData,
  getDemoStatus,
  getSettings,
  updateSettings,
  pruneOldInspections,
  getDatabaseStatus,
  getExecutiveAnalytics,
  seedHistoricalInspections,
  updateInspectionPhotoQa,
  getDriverQaPatternReport,
  getUninspectedDriversReport,
  seedSampleDriverQaAudits,
  getRegions,
  createRegion,
  updateRegion,
  deleteRegion,
  getDepots,
  createDepot,
  updateDepot,
  deleteDepot,
  getRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  syncRoutes,
  getRbacRoles,
  createRbacRole,
  updateRbacRole,
  deleteRbacRole,
  getRbacUsers,
  createRbacUser,
  updateRbacUser,
  deleteRbacUser,
} from './server/storage';
import { ADMIN_FEATURES } from './src/types';
import {
  initBackupService,
  getBackupStatus,
  performDailyBackup,
  getBackupRootDir,
  getAdmZip,
  restoreFromBackupZip,
} from './server/backupService';
import { logger } from './server/logger';
import { passwordForStorage, safeEqual } from './server/passwordHash';
import { requestContext } from './server/requestContext';

// Process resilience: catch unhandled exceptions to prevent container crash
process.on('uncaughtException', (err) => {
  logger.error('PROCESS', 'Uncaught Exception handled:', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('PROCESS', 'Unhandled Promise Rejection handled:', reason);
});

import {
  authRateLimiter,
  photoUploadLimiter,
  backupHeavyLimiter,
  generalApiLimiter,
  tryGetAuthUser,
  requireAuth,
  requireAdmin,
  requireSecurityPassword,
  signToken,
  type AuthTokenPayload,
} from './server/http/security';
import { registerOperationsRoutes } from './server/routes/operations';
import { registerRbacRoutes } from './server/routes/rbac';
import { registerBackupRoutes } from './server/routes/backup';
import { registerVehicleRoutes } from './server/routes/vehicles';
import { registerDriverRoutes } from './server/routes/drivers';
import { registerInspectionRoutes } from './server/routes/inspections';


function getCompressionMiddleware(): express.RequestHandler | null {
  try {
    // Dynamic require so missing optional dependency never prevents server boot
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const comp = require('compression');
    return comp({
      level: 6,
      threshold: 1024,
      filter: (req: any, res: any) => {
        if (req.headers['x-no-compression']) return false;
        return comp.filter ? comp.filter(req, res) : true;
      },
    });
  } catch {
    console.log('[Server] Note: "compression" module not installed in local environment, running with standard HTTP streaming.');
    return null;
  }
}

async function startServer() {
  // Windows QuickEdit auto-mitigation to prevent console click freeze
  if (process.platform === 'win32') {
    try {
      import('child_process').then(({ exec }) => {
        exec('reg add "HKCU\\Console" /v QuickEdit /t REG_DWORD /d 0 /f', () => {});
        exec('reg add "HKCU\\Console" /v InsertMode /t REG_DWORD /d 0 /f', () => {});
        exec('reg add "HKCU\\Console\\%SystemRoot%_System32_cmd.exe" /v QuickEdit /t REG_DWORD /d 0 /f', () => {});
      }).catch(() => {});
    } catch {}
  }

  // Initialize storage & automated rolling backup service
  initStore();
  initBackupService();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Security hardening: hide Express identity
  app.disable('x-powered-by');
  // Only trust X-Forwarded-For from a local reverse proxy / tunnel (e.g. ngrok); LAN clients cannot spoof it
  app.set('trust proxy', 'loopback');

  // Request logger middleware: logs every HTTP request with response time, IP, and status
  app.use((req, res, next) => {
    const start = Date.now();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    res.on('finish', () => {
      const duration = Date.now() - start;
      // Skip logging static bundle files in dev to avoid noise
      if (
        req.url.startsWith('/@vite') ||
        req.url.startsWith('/@fs') ||
        req.url.startsWith('/src/') ||
        req.url.startsWith('/node_modules')
      ) {
        return;
      }
      logger.http(req.method, req.originalUrl || req.url, res.statusCode, duration, clientIp);
    });

    next();
  });

  // Request context: lets audit logs record the real client IP and the authenticated user
  app.use((req, res, next) => {
    const ctx: { ip: string; user?: { username: string; name: string; role: string } } = {
      ip: req.ip || req.socket.remoteAddress || 'unknown',
    };
    const payload = tryGetAuthUser(req);
    if (payload) ctx.user = { username: payload.sub, name: payload.name, role: payload.role };
    requestContext.run(ctx, next);
  });

  // Security HTTP Headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
    if (req.url.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  // Gzip / Deflate compression for all responses to minimize network transit & server load
  const compMiddleware = getCompressionMiddleware();
  if (compMiddleware) {
    app.use(compMiddleware);
  }

  // JSON & URL-encoded payload parsers for base64 camera image uploads
  // Large limit only where base64 photos / bulk imports are expected; tiny for unauthenticated login.
  const jsonTiny = express.json({ limit: '100kb' });
  const jsonDefault = express.json({ limit: '10mb' });
  const jsonLarge = express.json({ limit: '100mb' });
  const LARGE_BODY_PATHS = /^\/api\/(inspections|upload-photo|vehicles\/bulk|drivers\/bulk|backup\/restore)(\/|\?|$)/;
  const LOGIN_PATHS = /^\/api\/(admin|drivers)\/login(\?|$)/;
  app.use((req, res, next) => {
    const url = req.url;
    if (LOGIN_PATHS.test(url)) return jsonTiny(req, res, next);
    if (LARGE_BODY_PATHS.test(url)) return jsonLarge(req, res, next);
    return jsonDefault(req, res, next);
  });
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Raw binary body parser for direct backup ZIP archive uploads (up to 300MB)
  app.use(
    express.raw({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      limit: '300mb',
    })
  );

  // Static sample-photos directory for official inspection guidelines
  const samplePhotosDir = path.join(process.cwd(), 'public', 'sample-photos');
  if (!fs.existsSync(samplePhotosDir)) {
    try {
      fs.mkdirSync(samplePhotosDir, { recursive: true });
    } catch {}
  }
  app.use(
    '/sample-photos',
    express.static(samplePhotosDir, {
      maxAge: '7d',
      etag: true,
      lastModified: true,
    })
  );
  // Static uploads directory with caching headers to eliminate redundant image re-downloads
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
    } catch {}
  }
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      maxAge: '7d',
      etag: true,
      lastModified: true,
    })
  );

  // Smart photo resolver & fallback for /uploads:
  // If static file was not found directly in uploads/ (e.g. after database restore, slight naming variation, or pruned from active DB):
  // Search the backup archives (getBackupRootDir()) and uploads directory variations, auto-repair uploads/ on disk, and serve the image!
  app.use('/uploads', (req, res, next) => {
    try {
      const decodedPath = decodeURIComponent(req.path).replace(/\\/g, '/').replace(/^\/+/, '');
      if (!decodedPath || !/\.(jpe?g|png|webp|gif|svg)$/i.test(decodedPath)) {
        return next();
      }
      // Reject path traversal attempts outright
      if (decodedPath.split('/').some((seg) => seg === '..' || seg === '.') || decodedPath.includes('\0')) {
        return res.status(400).end();
      }

      // 1. Direct check in uploadsDir (handles potential Windows/Linux path separator issues)
      const directPath = path.join(uploadsDir, ...decodedPath.split('/'));
      if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(directPath);
      }

      const rootBackupDir = getBackupRootDir();
      const pathSegments = decodedPath.split('/').filter(Boolean);
      // Example path: "2026-10-09/VFH2715/01_Tires_Wheels.jpg"
      // segments: ["2026-10-09", "VFH2715", "01_Tires_Wheels.jpg"]
      let targetDate = '';
      let targetPlate = '';
      const targetFilename = pathSegments[pathSegments.length - 1];

      for (const seg of pathSegments) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(seg)) {
          targetDate = seg;
        } else if (seg !== targetFilename && !targetPlate) {
          targetPlate = seg.toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
        }
      }

      // Candidate paths to search across rootBackupDir and uploadsDir
      const candidatePaths: string[] = [];

      if (targetDate) {
        const dayFolder = path.join(rootBackupDir, `backup_${targetDate}`);
        if (targetPlate) {
          candidatePaths.push(
            path.join(dayFolder, 'upload', targetDate, targetPlate, targetFilename),
            path.join(dayFolder, 'photos', targetPlate, targetFilename),
            path.join(dayFolder, targetPlate, targetFilename),
            path.join(uploadsDir, targetDate, targetPlate, targetFilename)
          );
        }
        candidatePaths.push(
          path.join(dayFolder, 'upload', targetDate, targetFilename),
          path.join(dayFolder, 'photos', targetFilename),
          path.join(dayFolder, targetFilename)
        );
      }

      // Check candidate paths first
      for (const cp of candidatePaths) {
        if (fs.existsSync(cp) && fs.statSync(cp).isFile()) {
          try {
            const destPath = path.join(uploadsDir, ...decodedPath.split('/'));
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            if (!fs.existsSync(destPath)) {
              fs.copyFileSync(cp, destPath);
            }
          } catch {}
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.sendFile(cp);
        }
      }

      // Check for code prefix variations in the plate directory
      // (e.g. searching for 01_Tires_Wheels.jpg when file is 01_Tires_Wheels_Slot1_Front_Left.jpg)
      const codeMatch = targetFilename.match(/^(\d{2})_/);
      const codePrefix = codeMatch ? codeMatch[1] : '';

      const isRadReq = targetFilename.toLowerCase().includes('radiator') || targetFilename.toLowerCase().includes('coolant') || codePrefix === '05' || codePrefix === '03';
      const isDieselReq = targetFilename.toLowerCase().includes('diesel') || targetFilename.toLowerCase().includes('fuel') || targetFilename.toLowerCase().includes('cap') || codePrefix === '09' || codePrefix === '07' || codePrefix === '04';

      const searchInFolder = (dir: string): string | null => {
        if (!fs.existsSync(dir)) return null;
        try {
          const files = fs.readdirSync(dir);
          // Exact filename case-insensitive match
          const exactCi = files.find(f => f.toLowerCase() === targetFilename.toLowerCase());
          if (exactCi) return path.join(dir, exactCi);

          // If codePrefix exists, match files starting with that code prefix
          if (codePrefix) {
            const prefixMatch = files.find(f => f.startsWith(`${codePrefix}_`));
            if (prefixMatch) return path.join(dir, prefixMatch);
          }

          // Keyword fallbacks for Checkpoint 5 (Radiator) and Checkpoint 9 (Diesel Cap)
          if (isRadReq) {
            const radMatch = files.find(f => {
              const lower = f.toLowerCase();
              return lower.includes('radiator') || lower.includes('coolant') || f.startsWith('05_') || f.startsWith('03_');
            });
            if (radMatch) return path.join(dir, radMatch);
          }

          if (isDieselReq) {
            const dieselMatch = files.find(f => {
              const lower = f.toLowerCase();
              return lower.includes('diesel') || lower.includes('fuel') || lower.includes('cap') || f.startsWith('09_') || f.startsWith('07_') || f.startsWith('04_');
            });
            if (dieselMatch) return path.join(dir, dieselMatch);
          }
        } catch {}
        return null;
      };

      if (targetDate && targetPlate) {
        const dayFolder = path.join(rootBackupDir, `backup_${targetDate}`);
        const foldersToSearch = [
          path.join(uploadsDir, targetDate, targetPlate),
          path.join(dayFolder, 'upload', targetDate, targetPlate),
          path.join(dayFolder, 'photos', targetPlate),
          path.join(dayFolder, targetPlate),
        ];
        for (const dir of foldersToSearch) {
          const found = searchInFolder(dir);
          if (found && fs.statSync(found).isFile()) {
            try {
              const destPath = path.join(uploadsDir, ...decodedPath.split('/'));
              fs.mkdirSync(path.dirname(destPath), { recursive: true });
              if (!fs.existsSync(destPath)) {
                fs.copyFileSync(found, destPath);
              }
            } catch {}
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.sendFile(found);
          }
        }
      }

      // Recursive search inside targetDate backup by filename or prefix
      const searchRecursive = (dir: string, maxDepth = 4): string | null => {
        if (!fs.existsSync(dir) || maxDepth <= 0) return null;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isFile()) {
              if (entry.name.toLowerCase() === targetFilename.toLowerCase()) {
                return full;
              }
              if (codePrefix && targetPlate && full.toUpperCase().includes(targetPlate) && entry.name.startsWith(`${codePrefix}_`)) {
                return full;
              }
            } else if (entry.isDirectory()) {
              const resFile = searchRecursive(full, maxDepth - 1);
              if (resFile) return resFile;
            }
          }
        } catch {}
        return null;
      };

      if (targetDate) {
        const dayFolder = path.join(rootBackupDir, `backup_${targetDate}`);
        const found = searchRecursive(dayFolder);
        if (found) {
          try {
            const destPath = path.join(uploadsDir, ...decodedPath.split('/'));
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            if (!fs.existsSync(destPath)) {
              fs.copyFileSync(found, destPath);
            }
          } catch {}
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.sendFile(found);
        }
      }

      return next();
    } catch (err) {
      console.warn('[Uploads Resolver Warning]', err);
      return next();
    }
  });

  // Apply general API limiter to all /api routes
  app.use('/api', generalApiLimiter);

  // --- API Endpoints ---

  // Health & Telemetry check endpoint
  app.get('/api/health', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      memoryMb: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      },
      system: 'Fleet Pre-Trip Inspection Engine',
    });
  });

  // Database Connection Status (MSSQL SSMS vs JSON)
  app.get('/api/database/status', requireAdmin, (req, res) => {
    res.json(getDatabaseStatus());
  });

  // System Logs Viewer endpoint (in-memory circular buffer with level filtering)
  app.get('/api/system/logs', requireAdmin, (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 150;
      const level = req.query.level as any;
      const logs = logger.getRecentLogs(limit, level);
      res.json({ success: true, count: logs.length, logs });
    } catch (err: any) {
      logger.error('SYSTEM_LOGS', 'Failed to retrieve system logs:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // System Logs File Download endpoint (foms.log or error.log)
  app.get('/api/system/logs/download', requireAdmin, (req, res) => {
    try {
      const type = (req.query.type === 'error' ? 'error' : 'app') as 'app' | 'error';
      const filePath = logger.getLogFilePath(type);
      if (fs.existsSync(filePath)) {
        res.download(filePath, `foms_${type}_${new Date().toISOString().slice(0, 10)}.log`);
      } else {
        res.status(404).send('Log file not found on server');
      }
    } catch (err: any) {
      logger.error('SYSTEM_LOGS', 'Failed to download log file:', err);
      res.status(500).send('Error downloading log file');
    }
  });

  // Admin Authentication (with brute-force protection & JWT token issuance)
  app.post('/api/admin/login', authRateLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
      }
      const result = await verifyAdminLogin(String(username), String(password));
      if (!result.success || !result.admin) {
        return res.status(401).json(result);
      }
      const token = signToken({
        sub: result.admin.username,
        name: result.admin.name,
        role: 'admin',
      });
      res.json({ ...result, token });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Check driver daily inspection status (Supervisor up to 3, others 1)
  app.get('/api/drivers/daily-check/:driverId', (req, res) => {
    try {
      const status = getDriverInspectionStatus(req.params.driverId);
      res.json({
        success: true,
        hasInspectedToday: status.hasReachedLimit,
        hasReachedLimit: status.hasReachedLimit,
        inspectionCount: status.currentCount,
        maxAllowed: status.maxAllowed,
        isSupervisor: status.isSupervisor,
        inspection: status.latestInspection,
        inspections: status.inspections,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Check vehicle daily inspection status (Enforces 1 inspection per truck per day)
  app.get('/api/vehicles/daily-check/:plate', (req, res) => {
    try {
      const existing = getVehicleDailyInspection(req.params.plate);
      res.json({ success: true, hasInspectedToday: !!existing, inspection: existing });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Fleet overview statistics with real-time completion filtering
  app.get('/api/stats', requireAuth, (req, res) => {
    try {
      const { branch, date, route, category, truckCategory, tonnage } = req.query;
      const stats = getFleetStats({
        branch: branch as string,
        date: date as string,
        route: route as string,
        truckCategory: (truckCategory || category) as string,
        tonnage: tonnage as string,
      });
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Executive Compliance & Fleet Analytics
  app.get('/api/analytics', requireAdmin, (req, res) => {
    try {
      const { timeframe, branch, truckCategory, dateFrom, dateTo } = req.query;
      const analytics = getExecutiveAnalytics({
        timeframe: timeframe as string,
        branch: branch as string,
        truckCategory: truckCategory as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
      });
      res.json({ success: true, data: analytics });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Seed / Refresh demo historical inspection records for executive analytics
  app.post('/api/analytics/seed-demo', requireAdmin, (req, res) => {
    try {
      const daysBack = Number(req.body?.daysBack) || 30;
      const result = seedHistoricalInspections(daysBack);
      res.json({ success: true, message: `Successfully seeded ${result.seededCount} historical inspections for 30-day analytics.`, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  registerOperationsRoutes(app);
  registerRbacRoutes(app);

  registerVehicleRoutes(app);
  registerDriverRoutes(app);

  registerInspectionRoutes(app);

  // Wipe entire fleet database (Admin & Master Password protected)
  app.post('/api/storage/clear-all', requireAdmin, requireSecurityPassword, (req, res) => {
    try {
      const result = clearAllFleetData();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear all vehicles (Admin & Master Password protected)
  app.post('/api/vehicles/clear-all', requireAdmin, requireSecurityPassword, (req, res) => {
    try {
      const result = clearAllVehicles();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear all drivers (Admin & Master Password protected)
  app.post('/api/drivers/clear-all', requireAdmin, requireSecurityPassword, (req, res) => {
    try {
      const result = clearAllDrivers();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Purge all demo seed data (Admin protected)
  app.post('/api/storage/purge-demo', requireAdmin, (req, res) => {
    try {
      const result = purgeAllDemoData();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get demo seed data status
  app.get('/api/storage/demo-status', requireAdmin, (req, res) => {
    try {
      const status = getDemoStatus();
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Upload Photo (Requires authentication, rate limiting & payload validation)
  app.post('/api/upload-photo', requireAuth, photoUploadLimiter, (req, res) => {
    try {
      const { imageBase64, vehicleNo, driverName, gps, itemCode, itemTitle, dateStr, fileName, isSignature, isDefect, defectIndex } = req.body;
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ success: false, message: 'Missing image data' });
      }
      // Security check: Payload limit 15MB
      if (imageBase64.length > 15 * 1024 * 1024) {
        return res.status(413).json({ success: false, message: 'Image payload exceeds 15MB size limit' });
      }
      // Security check: Verify image format prefix
      if (!imageBase64.startsWith('data:image/') && !imageBase64.startsWith('/9j/') && !imageBase64.startsWith('iVBORw')) {
        return res.status(400).json({ success: false, message: 'Invalid image format. Supported formats: JPEG, PNG, WEBP' });
      }
      const fileUrl = savePhotoToDisk(imageBase64, {
        vehicleNo,
        driverName,
        gps,
        itemCode,
        itemTitle,
        dateStr,
        fileName,
        isSignature,
        isDefect,
        defectIndex,
      });
      res.json({ success: true, url: fileUrl });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reverse Geocoding API (OpenStreetMap Nominatim with in-memory caching)
  const reverseGeoCache = new Map<string, string>();
  app.get('/api/reverse-geocode', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ success: false, message: 'Invalid lat/lng parameters' });
      }

      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (reverseGeoCache.has(key)) {
        return res.json({ success: true, address: reverseGeoCache.get(key) });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      try {
        const nominatimRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'FleetInspectionSystem/1.0 (fleet-audit-transport)',
              'Accept-Language': 'en, ms',
            },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (nominatimRes.ok) {
          const data: any = await nominatimRes.json();
          const addr = data.address || {};
          const parts = [
            addr.industrial || addr.commercial || addr.road || addr.building,
            addr.suburb || addr.neighbourhood || addr.city_district || addr.village,
            addr.city || addr.town || addr.district || addr.county,
            addr.state,
          ].filter(Boolean);

          const formatted = parts.length > 0 ? parts.join(', ') : data.display_name?.split(',').slice(0, 3).join(', ');
          if (formatted) {
            reverseGeoCache.set(key, formatted);
            return res.json({ success: true, address: formatted });
          }
        }
      } catch {
        clearTimeout(timeout);
      }

      // Fast, non-blocking GPS coordinate fallback
      const fallback = `GPS: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;
      reverseGeoCache.set(key, fallback);
      res.json({ success: true, address: fallback });
    } catch (err: any) {
      res.json({ success: false, address: `GPS: ${req.query.lat}°N, ${req.query.lng}°E`, error: err.message });
    }
  });

  // Settings: Public Base URL (Admin only)
  app.get('/api/settings/public-url', (req, res) => {
    try {
      const settings = getSettings();
      res.json({ success: true, publicBaseUrl: settings.publicBaseUrl || '' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/settings/public-url', requireAdmin, requireSecurityPassword, (req, res) => {
    try {
      const { publicBaseUrl } = req.body;
      const updated = updateSettings({ publicBaseUrl });
      res.json({ success: true, settings: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  registerBackupRoutes(app);

  // Manual maintenance trigger: prune active DB inspections older than X days (Admin only)
  app.post('/api/storage/prune-inspections', requireAdmin, (req, res) => {
    try {
      const maxDays = Number(req.body?.maxDays) || 45;
      const result = pruneOldInspections(maxDays);
      res.json({
        success: true,
        prunedCount: result.prunedCount,
        remainingCount: result.remainingCount,
        message: `Pruned ${result.prunedCount} inspection records older than ${maxDays} days from active DB. Remaining in active DB: ${result.remainingCount}. Complete records remain preserved in 90-day C:\\ backups.`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Audit Logs (Admin only)
  app.get('/api/audit-logs', requireAdmin, (req, res) => {
    try {
      const logs = getAuditLogs();
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Templates download
  app.get('/api/templates/vehicles.csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vehicle_bulk_template.csv"');
    res.send(getVehicleCsvTemplate());
  });

  app.get('/api/templates/drivers.csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="driver_bulk_template.csv"');
    res.send(getDriverCsvTemplate());
  });

  app.get('/api/templates/inspections.csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inspection_bulk_template.csv"');
    res.send(getInspectionCsvTemplate());
  });

  app.get('/api/templates/google-form.csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="google_form_response_template.csv"');
    res.send(getGoogleFormCsvTemplate());
  });

  // Catch-all for undefined /api/* endpoints so they return clear JSON errors instead of HTML
  app.all('/api/*', (req, res) => {
    logger.warn('ROUTER', `404 Not Found for API endpoint: ${req.method} ${req.originalUrl || req.url}`);
    res.status(404).json({
      success: false,
      error: `API route not found: ${req.method} ${req.originalUrl || req.url}`,
    });
  });

  // Global Express Error Middleware: catches any uncaught errors in API handlers and logs them cleanly
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('EXPRESS', `Error in ${req.method} ${req.originalUrl || req.url}:`, err);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  });

  // --- Vite & Client Frontend Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        if (vite) vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Fleet Pre-Trip Inspection System running on http://0.0.0.0:${PORT}`);
  });

  // If the port is already taken another instance is running. Exit instead of lingering as a
  // zombie: it would otherwise keep its backup timers and write to the same data files.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error('PROCESS', `Port ${PORT} is already in use (another instance running?). Exiting.`);
      process.exit(1);
    }
    logger.error('PROCESS', 'HTTP server error:', err);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`[Server] ${signal} received. Synchronously flushing data store to disk and shutting down gracefully...`);
    try {
      saveStoreSync();
    } catch (saveErr) {
      console.error('[Server Shutdown Flush Error]', saveErr);
    }
    server.close(() => {
      console.log('[Server] HTTP server closed cleanly.');
      process.exit(0);
    });
  };

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('beforeExit', () => {
    try {
      saveStoreSync();
    } catch {}
  });
}

startServer().catch(err => {
  console.error('Fatal Server Boot Error:', err);
});
