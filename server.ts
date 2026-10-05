import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  initStore,
  saveStore,
  getVehicles,
  getVehicleByPlate,
  updateVehicle,
  createVehicle,
  deleteVehicle,
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
  getSettings,
  updateSettings,
  pruneOldInspections,
  getDatabaseStatus,
} from './server/storage';
import {
  initBackupService,
  getBackupStatus,
  performDailyBackup,
  getBackupRootDir,
  getAdmZip,
  restoreFromBackupZip,
} from './server/backupService';
import { logger } from './server/logger';

// Process resilience: catch unhandled exceptions to prevent container crash
process.on('uncaughtException', (err) => {
  logger.error('PROCESS', 'Uncaught Exception handled:', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('PROCESS', 'Unhandled Promise Rejection handled:', reason);
});

// Lightweight high-performance in-memory rate limiter
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

function createRateLimiter(windowMs: number, maxRequests: number, message: string) {
  const ipMap = new Map<string, RateLimitEntry>();

  // Cleanup expired entries periodically to prevent memory accumulation
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipMap.entries()) {
      if (now > entry.resetTime) {
        ipMap.delete(ip);
      }
    }
  }, Math.max(windowMs, 60000));
  if (cleanupTimer.unref) cleanupTimer.unref();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const now = Date.now();
    let entry = ipMap.get(ip);

    if (!entry || now > entry.resetTime) {
      entry = { count: 1, resetTime: now + windowMs };
      ipMap.set(ip, entry);
      return next();
    }

    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfterSec = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        success: false,
        error: message,
        retryAfter: retryAfterSec,
      });
    }

    next();
  };
}

const authRateLimiter = createRateLimiter(
  60000,
  25,
  'Too many login attempts. Please wait 1 minute before trying again.'
);
const photoUploadLimiter = createRateLimiter(
  60000,
  120,
  'Photo upload rate limit reached. Please wait a moment.'
);
const backupHeavyLimiter = createRateLimiter(
  60000,
  15,
  'Backup action rate limit reached. Please wait a moment.'
);
const generalApiLimiter = createRateLimiter(
  60000,
  600,
  'API rate limit reached. Please slow down.'
);

// Cryptographic JWT Token Engine (Node native crypto, HMAC-SHA256)
// Security: Generate a robust persistent random key if not configured in environment
const JWT_SECRET_FILE = path.join(process.cwd(), 'data', '.jwt_secret');
function getOrGenerateJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }
  try {
    if (fs.existsSync(JWT_SECRET_FILE)) {
      const stored = fs.readFileSync(JWT_SECRET_FILE, 'utf-8').trim();
      if (stored.length >= 32) return stored;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(JWT_SECRET_FILE), { recursive: true });
    fs.writeFileSync(JWT_SECRET_FILE, generated, 'utf-8');
    return generated;
  } catch {
    return 'foms-auto-' + crypto.randomBytes(16).toString('hex');
  }
}
const JWT_SECRET = getOrGenerateJwtSecret();

export interface AuthTokenPayload {
  sub: string;       // driver loginId or admin username
  name: string;      // driver name or admin name
  role: 'admin' | 'driver';
  iat: number;       // issued at (epoch seconds)
  exp: number;       // expiration timestamp (epoch seconds)
}

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) {
    s += '=';
  }
  return Buffer.from(s, 'base64').toString('utf8');
}

export function signToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>, expiresInSeconds: number = 7 * 24 * 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encHeader = base64UrlEncode(JSON.stringify(header));
  const encPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encHeader}.${encPayload}`)
    .digest();
  const encSignature = base64UrlEncode(signature);
  return `${encHeader}.${encPayload}.${encSignature}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const [encHeader, encPayload, encSignature] = parts;

  try {
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encHeader}.${encPayload}`)
      .digest();
    const actualSigBuf = Buffer.from(encSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    if (expectedSig.length !== actualSigBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedSig, actualSigBuf)) return null;

    const payload: AuthTokenPayload = JSON.parse(base64UrlDecode(encPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(req: express.Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const customHeader = req.headers['x-auth-token'];
  if (customHeader && typeof customHeader === 'string') {
    return customHeader.trim();
  }
  if (req.query?.token && typeof req.query.token === 'string') {
    return req.query.token.trim();
  }
  return null;
}

// Optional helper to check current authenticated user without throwing 401
function tryGetAuthUser(req: express.Request): AuthTokenPayload | null {
  const token = getBearerToken(req);
  if (!token) return null;
  return verifyToken(token);
}

// Middleware: Authenticate valid session (Driver or Admin)
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required: missing or invalid session token' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Authentication failed: invalid or expired session token' });
  }
  (req as any).user = payload;
  next();
}

// Middleware: Enforce Admin role strictly (RBAC)
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Admin authentication required: please login as administrator' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Invalid or expired administrator session' });
  }
  if (payload.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Administrator privileges required' });
  }
  (req as any).user = payload;
  next();
}

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
  const PORT = 3000;

  // Security hardening: hide Express identity
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // Request logger middleware: logs every HTTP request with response time, IP, and status
  app.use((req, res, next) => {
    const start = Date.now();
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown';

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

  // Security HTTP Headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Gzip / Deflate compression for all responses to minimize network transit & server load
  const compMiddleware = getCompressionMiddleware();
  if (compMiddleware) {
    app.use(compMiddleware);
  }

  // JSON & URL-encoded payload parsers for base64 camera image uploads
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Raw binary body parser for direct backup ZIP archive uploads (up to 300MB)
  app.use(
    express.raw({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      limit: '300mb',
    })
  );

  // Static uploads directory with caching headers to eliminate redundant image re-downloads
  const uploadsDir = path.join(process.cwd(), 'uploads');
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      maxAge: '7d',
      etag: true,
      lastModified: true,
    })
  );

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
  app.get('/api/database/status', (req, res) => {
    res.json(getDatabaseStatus());
  });

  // System Logs Viewer endpoint (in-memory circular buffer with level filtering)
  app.get('/api/system/logs', (req, res) => {
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
  app.get('/api/system/logs/download', (req, res) => {
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
  app.post('/api/admin/login', authRateLimiter, (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
      }
      const result = verifyAdminLogin(username, password);
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

  // Check driver daily inspection status
  app.get('/api/drivers/daily-check/:driverId', (req, res) => {
    try {
      const existing = getDriverDailyInspection(req.params.driverId);
      res.json({ success: true, hasInspectedToday: !!existing, inspection: existing });
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
  app.get('/api/stats', (req, res) => {
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

  // Vehicles list with filters (Mask sensitive fuel PIN for non-admins)
  app.get('/api/vehicles', (req, res) => {
    try {
      const authUser = tryGetAuthUser(req);
      const isAdmin = authUser?.role === 'admin';
      const { branch, status, search } = req.query;
      const rawVehicles = getVehicles({
        branch: branch as string,
        status: status as string,
        search: search as string,
      });
      const vehicles = isAdmin
        ? rawVehicles
        : rawVehicles.map((v) => ({ ...v, pinNo: '****' }));
      res.json({ success: true, count: vehicles.length, vehicles });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vehicle by plate (Mask sensitive fuel PIN for non-admins)
  app.get('/api/vehicles/:plate', (req, res) => {
    try {
      const authUser = tryGetAuthUser(req);
      const isAdmin = authUser?.role === 'admin';
      const vehicle = getVehicleByPlate(req.params.plate);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Vehicle not found' });
      }
      const safeVehicle = isAdmin ? vehicle : { ...vehicle, pinNo: '****' };
      res.json({ success: true, vehicle: safeVehicle });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create single vehicle (Admin only)
  app.post('/api/vehicles/create', requireAdmin, (req, res) => {
    try {
      const vehicleData = req.body;
      if (!vehicleData.vehicleNo) {
        return res.status(400).json({ success: false, message: 'Vehicle plate number is required' });
      }
      const created = createVehicle(vehicleData);
      res.json({ success: true, vehicle: created });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update vehicle (Admin only)
  app.post('/api/vehicles/update', requireAdmin, (req, res) => {
    try {
      const { vehicleNo, updates } = req.body;
      if (!vehicleNo) {
        return res.status(400).json({ success: false, message: 'Vehicle plate is required' });
      }
      const updated = updateVehicle(vehicleNo, updates);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Vehicle not found' });
      }
      res.json({ success: true, vehicle: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete vehicle (Admin only)
  app.delete('/api/vehicles/:plate', requireAdmin, (req, res) => {
    try {
      const deleted = deleteVehicle(req.params.plate);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Vehicle not found' });
      }
      res.json({ success: true, message: `Vehicle ${req.params.plate} successfully deleted.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bulk import vehicles (Admin only)
  app.post('/api/vehicles/bulk', requireAdmin, async (req, res) => {
    try {
      const { vehicles } = req.body;
      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid vehicles array' });
      }
      const result = await bulkImportVehicles(vehicles);
      res.json({ success: true, ...result, message: `Successfully updated ${result.updated} and added ${result.added} vehicles.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Drivers list (Requires authentication; unauthenticated requests only receive count)
  app.get('/api/drivers', (req, res) => {
    try {
      const authUser = tryGetAuthUser(req);
      const { depot, status, search } = req.query;
      const drivers = getDrivers({
        depot: depot as string,
        status: status as string,
        search: search as string,
      });

      if (!authUser) {
        // Unauthenticated caller (e.g. login screen displaying total active drivers)
        return res.json({ success: true, count: drivers.length, drivers: [] });
      }

      // Hide sensitive password fields from all API responses
      const safeDrivers = drivers.map(({ password, ...rest }) => rest);
      res.json({ success: true, count: safeDrivers.length, drivers: safeDrivers });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create single driver (Admin only)
  app.post('/api/drivers/create', requireAdmin, (req, res) => {
    try {
      const driverData = req.body;
      if (!driverData.name && !driverData.employeeId && !driverData.loginId) {
        return res.status(400).json({ success: false, message: 'Driver details required' });
      }
      const created = createDriver(driverData);
      res.json({ success: true, driver: created });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update driver (Admin only)
  app.post('/api/drivers/update', requireAdmin, (req, res) => {
    try {
      const { identifier, updates } = req.body;
      if (!identifier) {
        return res.status(400).json({ success: false, message: 'Driver identifier is required' });
      }
      const updated = updateDriver(identifier, updates);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }
      res.json({ success: true, driver: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete driver (Admin only)
  app.delete('/api/drivers/:id', requireAdmin, (req, res) => {
    try {
      const deleted = deleteDriver(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Driver not found' });
      }
      res.json({ success: true, message: `Driver ${req.params.id} successfully removed.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Driver Authentication (with brute-force protection & JWT token issuance)
  app.post('/api/drivers/login', authRateLimiter, (req, res) => {
    try {
      const { loginId, password } = req.body;
      if (!loginId) {
        return res.status(400).json({ success: false, message: 'Driver ID is required' });
      }
      const result = verifyDriverLogin(loginId, password || '');
      if (!result.success || !result.driver) {
        return res.status(401).json(result);
      }
      const token = signToken({
        sub: result.driver.employeeId || result.driver.loginId,
        name: result.driver.name,
        role: 'driver',
      });
      res.json({ ...result, token });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Unlock driver account (Admin only)
  app.post('/api/drivers/unlock', requireAdmin, (req, res) => {
    try {
      const { identifier } = req.body;
      if (!identifier) {
        return res.status(400).json({ success: false, message: 'Driver identifier is required' });
      }
      const result = unlockDriver(identifier);
      if (!result.success) {
        return res.status(404).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bulk import drivers (Admin only)
  app.post('/api/drivers/bulk', requireAdmin, async (req, res) => {
    try {
      const { drivers } = req.body;
      if (!Array.isArray(drivers) || drivers.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid drivers array' });
      }
      const result = await bulkImportDrivers(drivers);
      res.json({ success: true, ...result, message: `Successfully updated ${result.updated} and added ${result.added} drivers.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Submit Inspection (Protected: requires verified session, server-enforced identity to prevent IDOR)
  app.post('/api/inspections', requireAuth, (req, res) => {
    try {
      const inspectionData = req.body;
      const authUser = (req as any).user as AuthTokenPayload;

      // P0 IDOR Hardening: Server strictly overrides driver identity with authenticated token claims
      if (authUser.role === 'driver') {
        inspectionData.driverId = authUser.sub;
        inspectionData.driverName = authUser.name;
      }

      if (!inspectionData.vehicleNo || !inspectionData.driverId) {
        return res.status(400).json({ success: false, message: 'Vehicle plate and driver ID are required' });
      }

      // Check if vehicle exists in fleet directory (if roster is not empty)
      const allVehicles = getVehicles();
      if (allVehicles.length > 0) {
        const vehicle = getVehicleByPlate(inspectionData.vehicleNo);
        if (!vehicle) {
          return res.status(400).json({ success: false, message: `Vehicle ${inspectionData.vehicleNo} does not exist in fleet registry.` });
        }
      }

      // Anti-Replay & Duplicate Inspection Defense:
      // 1. Has vehicle already completed inspection today?
      const existingVehicle = getVehicleDailyInspection(inspectionData.vehicleNo);
      if (existingVehicle) {
        return res.status(409).json({
          success: false,
          message: `Vehicle Already Inspected Today: Truck ${inspectionData.vehicleNo} has already completed daily inspection today (${existingVehicle.id}) by ${existingVehicle.driverName}. Each truck can only be inspected once per day.`,
          existingInspection: existingVehicle,
        });
      }

      // 2. Has driver already completed an inspection today? (if driver role)
      if (authUser.role === 'driver') {
        const existingDriver = getDriverDailyInspection(authUser.sub);
        if (existingDriver) {
          return res.status(409).json({
            success: false,
            message: `Driver Daily Limit Reached: Driver ${authUser.name} has already completed an inspection today (${existingDriver.id}) for vehicle ${existingDriver.vehicleNo}.`,
            existingInspection: existingDriver,
          });
        }
      }

      // Server-side validation: If fail, must have remark
      if (Array.isArray(inspectionData.items)) {
        for (const it of inspectionData.items) {
          if (it.status === 'Fail' && (!it.defectNote || !it.defectNote.trim())) {
            return res.status(400).json({
              success: false,
              message: `Validation Error: Defect remark is mandatory for failed checkpoint #${it.code || ''} (${it.title || it.id}).`,
            });
          }
        }
      }

      const created = addInspection(inspectionData);
      res.json({ success: true, inspection: created });
    } catch (err: any) {
      const isConflict = err.message && (err.message.includes('Limit Reached') || err.message.includes('Already Inspected'));
      res.status(isConflict ? 409 : 500).json({ success: false, error: err.message });
    }
  });

  // Bulk import inspections (Admin only)
  app.post('/api/inspections/bulk', requireAdmin, (req, res) => {
    try {
      const { inspections } = req.body;
      if (!Array.isArray(inspections) || inspections.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid inspections array' });
      }
      const result = bulkImportInspections(inspections);
      res.json({
        success: true,
        ...result,
        message: `Successfully imported ${result.added} new records and updated ${result.updated} records (${result.passed} Passed, ${result.defects} Grounded/Defects).`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // List inspections (Requires authentication)
  app.get('/api/inspections', requireAuth, (req, res) => {
    try {
      const { vehicleNo, driverId, result, branch, route, date, dateFrom, dateTo } = req.query;
      const records = getInspections({
        vehicleNo: vehicleNo as string,
        driverId: driverId as string,
        result: result as string,
        branch: branch as string,
        route: route as string,
        date: date as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
      });
      res.json({ success: true, count: records.length, inspections: records });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear all inspections (Admin only)
  app.delete('/api/inspections', requireAdmin, (req, res) => {
    try {
      clearAllInspections();
      res.json({ success: true, message: 'All inspections cleared. Vehicles reset to Pending Inspection.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Wipe entire fleet database (Admin only)
  app.post('/api/storage/clear-all', requireAdmin, (req, res) => {
    try {
      const result = clearAllFleetData();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear all vehicles (Admin only)
  app.post('/api/vehicles/clear-all', requireAdmin, (req, res) => {
    try {
      const result = clearAllVehicles();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear all drivers (Admin only)
  app.post('/api/drivers/clear-all', requireAdmin, (req, res) => {
    try {
      const result = clearAllDrivers();
      res.json(result);
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

  app.post('/api/settings/public-url', requireAdmin, (req, res) => {
    try {
      const { publicBaseUrl } = req.body;
      const updated = updateSettings({ publicBaseUrl });
      res.json({ success: true, settings: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Automated Rolling Backup Endpoints (Admin only)
  app.get('/api/backup/status', requireAdmin, (req, res) => {
    try {
      const status = getBackupStatus();
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/backup/run', requireAdmin, backupHeavyLimiter, (req, res) => {
    try {
      const result = performDailyBackup('manual_admin_trigger');
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Download entire day's backup (Admin only)
  app.get('/api/backup/download/:date', requireAdmin, (req, res) => {
    try {
      const date = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: 'Invalid date format (expected YYYY-MM-DD)' });
      }

      const rootDir = path.resolve(getBackupRootDir());
      const zipPath = path.resolve(rootDir, `backup_${date}.zip`);
      const folderPath = path.resolve(rootDir, `backup_${date}`);

      if (!zipPath.startsWith(rootDir) || !folderPath.startsWith(rootDir)) {
        return res.status(403).json({ success: false, message: 'Access denied: invalid path traversal' });
      }

      if (fs.existsSync(zipPath)) {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="fleet_backup_${date}.zip"`);
        return res.sendFile(zipPath);
      }

      if (fs.existsSync(folderPath)) {
        const AdmZipClass = getAdmZip();
        if (AdmZipClass) {
          const zip = new AdmZipClass();
          zip.addLocalFolder(folderPath);
          const zipBuffer = zip.toBuffer();
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="fleet_backup_${date}.zip"`);
          return res.send(zipBuffer);
        } else {
          return res.status(200).json({
            success: false,
            message: `Backup folder exists at ${folderPath}, but 'adm-zip' is not yet installed on this server to compress it on-the-fly. Please run 'npm install adm-zip' in your server console, or access the files directly in ${folderPath}.`,
          });
        }
      }

      return res.status(404).json({ success: false, message: `Backup archive for ${date} not found.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Download specific file from a day's backup (Admin only)
  app.get('/api/backup/file/:date/:filename', requireAdmin, (req, res) => {
    try {
      const { date, filename } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: 'Invalid date format (expected YYYY-MM-DD)' });
      }

      const cleanFileName = path.basename(filename);
      const rootDir = path.resolve(getBackupRootDir());
      const filePath = path.resolve(rootDir, `backup_${date}`, cleanFileName);

      // Path traversal security check
      if (!filePath.startsWith(rootDir)) {
        return res.status(403).json({ success: false, message: 'Access denied: invalid file path' });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: `File ${cleanFileName} not found in ${date} backup` });
      }

      if (cleanFileName.endsWith('.csv')) {
        res.setHeader('Content-Type', 'text/csv');
      } else if (cleanFileName.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
      } else {
        res.setHeader('Content-Type', 'text/plain');
      }

      res.setHeader('Content-Disposition', `attachment; filename="${cleanFileName}"`);
      return res.sendFile(filePath);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Serve or view backed-up photo from date archive (supports flat names or nested paths like plate/01_Tires_Wheels.jpg)
  app.get(['/api/backup/photos/:date/:photoName', '/api/backup/photos/:date/*'], (req, res) => {
    try {
      const date = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      }

      const rawParam = req.params.photoName || (req.params as any)[0] || '';
      const cleanParam = decodeURIComponent(rawParam).replace(/\\/g, '/');
      const rootDir = path.resolve(getBackupRootDir());
      const dayFolder = path.resolve(rootDir, `backup_${date}`);

      if (!dayFolder.startsWith(rootDir)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      if (!fs.existsSync(dayFolder)) {
        return res.status(404).json({ success: false, message: 'Backup folder not found for date' });
      }

      // Candidate paths to check in priority order
      const candidatePaths = [
        path.resolve(dayFolder, 'upload', date, cleanParam),
        path.resolve(dayFolder, 'photos', cleanParam),
        path.resolve(dayFolder, cleanParam),
        path.resolve(dayFolder, 'photos', path.basename(cleanParam)),
      ];

      for (const p of candidatePaths) {
        // Enforce boundary check
        if (!p.startsWith(dayFolder)) continue;
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          res.setHeader('Content-Type', 'image/jpeg');
          // Cache photo responses to avoid re-fetching
          res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
          return res.sendFile(p);
        }
      }

      // Fallback recursive search inside dayFolder by basename
      const baseName = path.basename(cleanParam);
      const findFileRecursive = (dir: string): string | null => {
        if (!fs.existsSync(dir)) return null;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.resolve(dir, entry.name);
          if (!full.startsWith(dayFolder)) continue;
          if (entry.isDirectory()) {
            const found = findFileRecursive(full);
            if (found) return found;
          } else if (entry.isFile() && entry.name === baseName) {
            return full;
          }
        }
        return null;
      };

      const found = findFileRecursive(dayFolder);
      if (found) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        return res.sendFile(found);
      }

      return res.status(404).json({ success: false, message: 'Photo not found in backup archive' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Upload and restore from a day's backup ZIP archive (Admin only with rate limiting)
  app.post('/api/backup/restore', requireAdmin, backupHeavyLimiter, async (req, res) => {
    try {
      let zipBuffer: Buffer | null = null;
      let originalFilename = (req.headers['x-filename'] as string) || '';

      if (Buffer.isBuffer(req.body)) {
        zipBuffer = req.body;
      } else if (req.body && typeof req.body === 'object' && req.body.zipBase64) {
        zipBuffer = Buffer.from(req.body.zipBase64, 'base64');
        if (req.body.filename) originalFilename = req.body.filename;
      }

      if (!zipBuffer || zipBuffer.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No ZIP payload received. Please upload a valid .zip backup file.',
        });
      }

      if (originalFilename) {
        try {
          originalFilename = decodeURIComponent(originalFilename);
        } catch {}
      }

      const result = await restoreFromBackupZip(zipBuffer, originalFilename);
      res.json(result);
    } catch (err: any) {
      console.error('[Backup Restore Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to restore backup archive' });
    }
  });

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
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
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

  const gracefulShutdown = (signal: string) => {
    console.log(`[Server] ${signal} received. Flushing data store to disk and shutting down gracefully...`);
    try {
      saveStore(true);
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
}

startServer().catch(err => {
  console.error('Fatal Server Boot Error:', err);
});
