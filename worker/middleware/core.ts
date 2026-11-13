/**
 * Cross-cutting middleware: request IDs & structured logs, security headers,
 * body size limits, CSRF protection, session loading and authorization.
 */
import type { MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { MAX_JSON_BODY_BYTES, MAX_UPLOAD_BYTES, ROLE_RANK, type Role } from '../../shared/constants';
import { buildCookie, cookieName, isSecureRequest, loadSession, readCookie } from '../auth/session';
import { ApiError, fromZod } from '../lib/errors';
import type { AppContext, AppEnv } from '../types';

export const requestContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  c.set('user', null);
  c.set('sessionId', null);
  const started = Date.now();
  await next();
  c.header('X-Request-Id', requestId);
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
  c.header('X-Frame-Options', 'DENY');
  // Structured log without query strings, bodies, cookies or personal data.
  console.log(
    JSON.stringify({
      level: c.res.status >= 500 ? 'error' : 'info',
      msg: 'request',
      requestId,
      method: c.req.method,
      route: c.req.routePath,
      status: c.res.status,
      ms: Date.now() - started,
    }),
  );
};

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection for cookie-authenticated requests:
 *  1. SameSite=Lax session cookie
 *  2. A custom header is required on every state-changing request. Browsers
 *     cannot send custom headers cross-origin without a CORS preflight, and
 *     this API never answers preflights.
 *  3. Origin / Sec-Fetch-Site must indicate same-origin when present.
 */
export const csrfProtection: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (UNSAFE_METHODS.has(c.req.method)) {
    if (c.req.header('x-travio-csrf') !== '1') {
      throw new ApiError('csrf_failed', 'Anfrage wurde aus Sicherheitsgründen abgelehnt');
    }
    const origin = c.req.header('origin');
    if (origin && origin !== new URL(c.req.url).origin) {
      throw new ApiError('csrf_failed', 'Anfrage wurde aus Sicherheitsgründen abgelehnt');
    }
    const site = c.req.header('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') {
      throw new ApiError('csrf_failed', 'Anfrage wurde aus Sicherheitsgründen abgelehnt');
    }
  }
  await next();
};

export const bodyLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (UNSAFE_METHODS.has(c.req.method)) {
    const len = Number(c.req.header('content-length') ?? '0');
    // File uploads (receipts) have their own, larger limit.
    const limit = /\/trips\/[^/]+\/documents\/analyze$/.test(new URL(c.req.url).pathname) ? MAX_UPLOAD_BYTES : MAX_JSON_BODY_BYTES;
    if (len > limit) throw new ApiError('payload_too_large', limit === MAX_UPLOAD_BYTES ? 'Die Datei ist zu groß (max. 1,9 MB).' : 'Anfrage ist zu groß');
  }
  await next();
};

export const sessionLoader: MiddlewareHandler<AppEnv> = async (c, next) => {
  const secure = isSecureRequest(c.req.url);
  const token = readCookie(c.req.header('cookie'), cookieName(secure));
  if (token) {
    const s = await loadSession(c.env.DB, token);
    if (s) {
      c.set('user', s.user);
      c.set('sessionId', s.sessionId);
      await next();
      if (s.refreshed) c.header('Set-Cookie', buildCookie(secure, token, 30 * 86400), { append: true });
      return;
    }
  }
  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) throw new ApiError('unauthorized', 'Bitte melde dich an');
  await next();
};

export function currentUser(c: AppContext) {
  const u = c.get('user');
  if (!u) throw new ApiError('unauthorized', 'Bitte melde dich an');
  return u;
}

/**
 * Loads the caller's membership for :tripId. Non-members get 404 (not 403)
 * so trip IDs cannot be probed.
 */
export const loadTripAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = currentUser(c);
  const tripId = c.req.param('tripId');
  if (!tripId || !/^[0-9a-f-]{36}$/i.test(tripId)) throw new ApiError('not_found', 'Reise nicht gefunden');
  const row = await c.env.DB.prepare(
    `SELECT m.role, t.base_currency FROM trip_members m JOIN trips t ON t.id = m.trip_id
     WHERE m.trip_id = ? AND m.user_id = ?`,
  )
    .bind(tripId, user.id)
    .first<{ role: Role; base_currency: string }>();
  if (!row) throw new ApiError('not_found', 'Reise nicht gefunden');
  c.set('trip', { tripId, role: row.role, baseCurrency: row.base_currency });
  await next();
};

export function requireRole(c: AppContext, min: Role): void {
  const t = c.get('trip');
  if (ROLE_RANK[t.role] < ROLE_RANK[min]) {
    throw new ApiError(
      'forbidden',
      min === 'owner' ? 'Nur Reise-Inhaber dürfen das' : 'Du hast nur Leserechte für diese Reise',
    );
  }
}

export async function parseJson<S extends z.ZodType>(c: AppContext, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    const text = await c.req.text();
    if (text.length > MAX_JSON_BODY_BYTES) throw new ApiError('payload_too_large', 'Anfrage ist zu groß');
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('bad_request', 'Ungültiges JSON');
  }
  const r = schema.safeParse(body);
  if (!r.success) throw fromZod(r.error);
  return r.data;
}

export function validate<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw fromZod(r.error);
  return r.data;
}
