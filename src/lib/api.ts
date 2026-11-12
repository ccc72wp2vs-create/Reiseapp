/**
 * Fetch wrapper for the TRAVIO API. Authentication uses the HttpOnly session
 * cookie (never stored in JS). Every request carries the CSRF header.
 */
import type { ApiErrorBody } from '../../shared/types';
import { t } from '../i18n';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
  get isConflict() {
    return this.code === 'version_conflict';
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(l: Listener) {
  unauthorizedListeners.add(l);
  return () => unauthorizedListeners.delete(l);
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Travio-Csrf': '1',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', t.errors.network);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    if (res.status === 401 && !path.startsWith('/auth/')) unauthorizedListeners.forEach((l) => l());
    if (!err && res.status >= 500) throw new ApiError(res.status, 'internal_error', t.errors.generic);
    if (!err) throw new ApiError(res.status === 404 ? 0 : res.status, 'network', t.errors.network);
    throw new ApiError(res.status, err.code, err.message, err.details);
  }
  return json as T;
}

export const http = {
  get: <T>(p: string) => api<T>('GET', p),
  post: <T>(p: string, b: unknown = {}) => api<T>('POST', p, b),
  patch: <T>(p: string, b: unknown) => api<T>('PATCH', p, b),
  put: <T>(p: string, b: unknown) => api<T>('PUT', p, b),
  del: <T>(p: string, b?: unknown) => api<T>('DELETE', p, b),
};

/** Human-readable error message for UI feedback. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'version_conflict') return t.errors.conflict;
    if (e.code === 'validation_failed') {
      const d = e.details as { message?: string }[] | undefined;
      return d?.length && d[0].message && !/^(Invalid|Too|Expected)/.test(d[0].message) ? `${e.message}: ${d[0].message}` : e.message;
    }
    return e.message;
  }
  return t.errors.generic;
}
