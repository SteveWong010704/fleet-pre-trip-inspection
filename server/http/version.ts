import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let cached: { mtimeMs: number; version: string } | null = null;

/**
 * Identifies the currently deployed web app build. Every `vite build` writes a new
 * index.html that references new hashed asset names, so a hash of that file changes
 * on each deploy. Returns 'dev' when there is no build (dev server).
 * Browsers compare it with the value they loaded with, to know they are out of date.
 */
export function getClientVersion(): string {
  const indexFile = path.join(process.cwd(), 'dist', 'index.html');
  try {
    const stat = fs.statSync(indexFile);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.version;
    const version = crypto.createHash('sha1').update(fs.readFileSync(indexFile)).digest('hex').slice(0, 12);
    cached = { mtimeMs: stat.mtimeMs, version };
    return version;
  } catch {
    return 'dev';
  }
}
