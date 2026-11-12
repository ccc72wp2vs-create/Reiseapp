/**
 * Server-side sessions. The browser receives a random 256-bit token in an
 * HttpOnly cookie; only its SHA-256 hash is stored in D1.
 */
import { SESSION_TTL_DAYS } from '../../shared/constants';
import { addDays, nowIso, randomToken, sha256Hex } from '../lib/util';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  isInstanceAdmin: boolean;
}

export function cookieName(secure: boolean): string {
  // The __Host- prefix enforces Secure, Path=/ and no Domain attribute.
  return secure ? '__Host-travio_session' : 'travio_session';
}

export function isSecureRequest(url: string): boolean {
  return new URL(url).protocol === 'https:';
}

export function buildCookie(secure: boolean, token: string, maxAgeSeconds: number): string {
  const parts = [`${cookieName(secure)}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function createSession(db: D1Database, userId: string): Promise<{ token: string; maxAge: number }> {
  const token = randomToken(32);
  const id = await sha256Hex(token);
  const now = nowIso();
  await db
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, userId, now, addDays(now, SESSION_TTL_DAYS), now)
    .run();
  return { token, maxAge: SESSION_TTL_DAYS * 86400 };
}

interface SessionRow {
  session_id: string;
  expires_at: string;
  last_seen_at: string;
  id: string;
  email: string;
  display_name: string;
  is_instance_admin: number;
}

/**
 * Resolves a session token. Extends the expiry (sliding window) at most once
 * per hour to keep write load low.
 */
export async function loadSession(
  db: D1Database,
  token: string,
): Promise<{ sessionId: string; user: SessionUser; refreshed: boolean } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const sessionId = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.last_seen_at, u.id, u.email, u.display_name, u.is_instance_admin
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .bind(sessionId)
    .first<SessionRow>();
  if (!row) return null;
  const now = nowIso();
  if (row.expires_at <= now) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    return null;
  }
  let refreshed = false;
  if (Date.parse(now) - Date.parse(row.last_seen_at) > 3600_000) {
    await db
      .prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
      .bind(now, addDays(now, SESSION_TTL_DAYS), sessionId)
      .run();
    refreshed = true;
  }
  return {
    sessionId,
    refreshed,
    user: {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      isInstanceAdmin: row.is_instance_admin === 1,
    },
  };
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

export async function purgeExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowIso()).run();
}
