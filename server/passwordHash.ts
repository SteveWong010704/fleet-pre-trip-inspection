import crypto from 'crypto';

/**
 * Password hashing (scrypt, Node built-in - no extra dependency).
 *
 * Stored format: scrypt$N$r$p$saltHex$hashHex  (fits the existing NVARCHAR(255) column).
 * Anything that does not start with "scrypt$" is treated as a legacy plaintext password,
 * so existing accounts keep working while they are migrated.
 *
 * Rollout is controlled by HASH_PASSWORDS=true in .env:
 *  - unset/false: hashes are VERIFIED if present, but new/changed/migrated passwords are
 *    still stored exactly as before (safe to roll back the code).
 *  - true: passwords are hashed when created/changed, and legacy plaintext passwords are
 *    upgraded to a hash on the account's next successful login.
 */

const PREFIX = 'scrypt$';
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;

export function isHashingEnabled(): boolean {
  return (process.env.HASH_PASSWORDS || '').trim().toLowerCase() === 'true';
}

export function isHashedPassword(stored: unknown): stored is string {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number, keyLen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Non-blocking hash (runs in the libuv thread pool). */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(plain, salt, N, R, P, KEY_LEN);
  return `${PREFIX}${N}$${R}$${P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

/** Constant-time comparison of two strings of any length. */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Verifies an attempt against a stored value (hash or legacy plaintext).
 * `legacy` is true when the stored value was plaintext, i.e. a candidate for upgrade.
 */
export async function verifyPassword(stored: string, attempt: string): Promise<{ ok: boolean; legacy: boolean }> {
  if (!isHashedPassword(stored)) {
    return { ok: safeEqual(stored, attempt), legacy: true };
  }
  try {
    const [, n, r, p, saltHex, hashHex] = stored.split('$');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scryptAsync(attempt, Buffer.from(saltHex, 'hex'), Number(n), Number(r), Number(p), expected.length);
    return { ok: expected.length === actual.length && crypto.timingSafeEqual(expected, actual), legacy: false };
  } catch {
    return { ok: false, legacy: false };
  }
}

/** Returns the value to persist for a password being set now (hashed only when enabled). */
export async function passwordForStorage(plain: string): Promise<string> {
  if (!plain || isHashedPassword(plain) || !isHashingEnabled()) return plain;
  return hashPassword(plain);
}
