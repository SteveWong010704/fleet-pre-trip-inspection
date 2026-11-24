import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request context so deep storage code (audit logs) can record the real client IP and the
 * authenticated user without threading `req` through every function signature.
 */
export interface RequestContext {
  ip: string;
  user?: { username: string; name: string; role: string };
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
