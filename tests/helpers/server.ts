import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

export const ADMIN_USER = 'steve';
export const ADMIN_PASS = 'test-admin-pass-123';
export const MASTER_PASS = 'test-master-pass-123';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export interface TestServer {
  base: string;
  stop: () => Promise<void>;
}

/**
 * Starts the real server.ts in a throw-away working directory with the default seed data,
 * so tests never touch real data; they create the vehicles/drivers they need with unique ids.
 */
export async function startServer(extraEnv: Record<string, string> = {}): Promise<TestServer> {
  const cwd = mkdtempSync(path.join(tmpdir(), 'fleet-test-'));
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [TSX_CLI, path.join(ROOT, 'server.ts')], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      ADMIN_PASSWORD: ADMIN_PASS,
      MASTER_SECURITY_PASSWORD: MASTER_PASS,
      DB_TYPE: 'memory',
      HASH_PASSWORDS: '',
      ...extraEnv,
    },
    stdio: process.env.TEST_SERVER_LOG ? 'inherit' : 'ignore',
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) { ready = true; break; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) {
    child.kill();
    throw new Error('Test server did not become healthy in time');
  }

  return {
    base,
    stop: async () => {
      child.kill();
      await new Promise((r) => setTimeout(r, 500));
      try { rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

export async function api(
  base: string,
  method: string,
  url: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${url}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}
