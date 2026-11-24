import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { logger } from '../logger';
import { safeEqual } from '../passwordHash';

// Moved verbatim from server.ts (rate limiting, JWT tokens, auth middleware, master password).

// Lightweight high-performance in-memory rate limiter
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export function createRateLimiter(windowMs: number, maxRequests: number, message: string) {
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
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
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

export const authRateLimiter = createRateLimiter(
  60000,
  25,
  'Too many login attempts. Please wait 1 minute before trying again.'
);
export const photoUploadLimiter = createRateLimiter(
  60000,
  120,
  'Photo upload rate limit reached. Please wait a moment.'
);
export const backupHeavyLimiter = createRateLimiter(
  60000,
  15,
  'Backup action rate limit reached. Please wait a moment.'
);
export const generalApiLimiter = createRateLimiter(
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

export function getBearerToken(req: express.Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const customHeader = req.headers['x-auth-token'];
  if (customHeader && typeof customHeader === 'string') {
    return customHeader.trim();
  }
  // Query-string tokens end up in logs and browser history, so they are only accepted
  // for plain <a href> file downloads, which cannot send an Authorization header.
  const isDownloadLink =
    req.method === 'GET' && /^\/api\/backup\/(download|file)\//.test(req.originalUrl || req.url || '');
  if (isDownloadLink) {
    if (req.query?.authToken && typeof req.query.authToken === 'string') {
      return req.query.authToken.trim();
    }
    if (req.query?.token && typeof req.query.token === 'string' && req.query.token.includes('.')) {
      return req.query.token.trim();
    }
  }
  return null;
}

// Optional helper to check current authenticated user without throwing 401
export function tryGetAuthUser(req: express.Request): AuthTokenPayload | null {
  const token = getBearerToken(req);
  if (!token) return null;
  return verifyToken(token);
}

// Middleware: Authenticate valid session (Driver or Admin)
export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
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
export function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
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

// Master Security Password Verification (Protects database wipe, delete all, QR reset/edit)
// Configured via MASTER_SECURITY_PASSWORD in .env (never hard-coded). If unset, protected
// actions are refused (fail closed) until it is configured.
const MASTER_SECURITY_PASSWORD = (process.env.MASTER_SECURITY_PASSWORD || '').trim();
if (!MASTER_SECURITY_PASSWORD) {
  console.warn('[Security] MASTER_SECURITY_PASSWORD is not set in .env: wipe / QR reset / public-URL actions are disabled.');
}

export function verifySecurityPassword(req: express.Request): boolean {
  if (!MASTER_SECURITY_PASSWORD) return false;
  const entered = (
    req.body?.securityPassword ||
    req.headers['x-security-password'] ||
    ''
  ).toString().trim();
  return entered.length > 0 && safeEqual(entered, MASTER_SECURITY_PASSWORD);
}

export function requireSecurityPassword(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!verifySecurityPassword(req)) {
    logger.warn('SECURITY', `Security authorization failed on sensitive endpoint: ${req.method} ${req.originalUrl || req.url}`);
    return res.status(403).json({
      success: false,
      error: 'Security authorization failed: Incorrect master password.',
      message: 'Security authorization failed: Incorrect master password.',
    });
  }
  next();
}
