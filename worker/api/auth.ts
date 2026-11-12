import { Hono } from 'hono';
import {
  acceptInviteSchema,
  deleteMeSchema,
  loginSchema,
  setupSchema,
  updateMeSchema,
} from '../../shared/schemas';
import type { AuthStatus, UserDto } from '../../shared/types';
import { dummyVerify, hashPassword, verifyPassword } from '../auth/password';
import { hitRateLimit, peekRateLimit, resetRateLimit } from '../auth/rateLimit';
import { buildCookie, createSession, deleteSession, isSecureRequest, purgeExpiredSessions } from '../auth/session';
import { currentUser, parseJson, requireUser } from '../middleware/core';
import { ApiError } from '../lib/errors';
import { nowIso, sha256Hex, timingSafeEqual, uuid } from '../lib/util';
import type { AppContext, AppEnv } from '../types';
import { buildSnapshot, getTripDto } from '../services/trips';
import { TRAVELER_COLORS } from '../../shared/constants';

const auth = new Hono<AppEnv>();

const clientIp = (c: AppContext) => c.req.header('cf-connecting-ip') ?? 'local';

async function startSession(c: AppContext, userId: string) {
  const { token, maxAge } = await createSession(c.env.DB, userId);
  c.header('Set-Cookie', buildCookie(isSecureRequest(c.req.url), token, maxAge), { append: true });
}

function clearCookie(c: AppContext) {
  c.header('Set-Cookie', buildCookie(isSecureRequest(c.req.url), '', 0), { append: true });
}

async function getUserDto(db: D1Database, id: string): Promise<UserDto> {
  const u = await db
    .prepare('SELECT id, email, display_name, is_instance_admin FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string; display_name: string; is_instance_admin: number }>();
  if (!u) throw new ApiError('unauthorized', 'Bitte melde dich an');
  return { id: u.id, email: u.email, displayName: u.display_name, isInstanceAdmin: u.is_instance_admin === 1 };
}

async function insertUser(db: D1Database, input: { email: string; displayName: string; password: string }, admin = false) {
  const id = uuid();
  const now = nowIso();
  const hash = await hashPassword(input.password);
  try {
    await db
      .prepare(
        `INSERT INTO users (id, email, display_name, password_hash, is_instance_admin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.email, input.displayName, hash, admin ? 1 : 0, now, now)
      .run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      throw new ApiError('conflict', 'Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte melde dich zuerst an.');
    }
    throw e;
  }
  return id;
}

auth.get('/status', async (c) => {
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  const user = c.get('user');
  const body: AuthStatus = {
    user: user ? await getUserDto(c.env.DB, user.id) : null,
    setupRequired: (count?.n ?? 0) === 0,
    setupEnabled: !!c.env.SETUP_TOKEN && c.env.SETUP_TOKEN.length >= 16,
  };
  return c.json(body);
});

/** One-time bootstrap of the first owner account, guarded by SETUP_TOKEN. */
auth.post('/setup', async (c) => {
  await hitRateLimit(c.env.DB, `setup:${clientIp(c)}`, 5, 3600);
  const input = await parseJson(c, setupSchema);
  const expected = c.env.SETUP_TOKEN;
  if (!expected || expected.length < 16) {
    throw new ApiError('setup_unavailable', 'Einrichtung ist nicht aktiviert (SETUP_TOKEN fehlt).');
  }
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if ((count?.n ?? 0) > 0) throw new ApiError('setup_unavailable', 'Die Einrichtung wurde bereits abgeschlossen.');
  const [a, b] = await Promise.all([sha256Hex(input.setupToken), sha256Hex(expected)]);
  if (!timingSafeEqual(a, b)) throw new ApiError('forbidden', 'Einrichtungs-Code ist ungültig');
  const id = await insertUser(c.env.DB, input, true);
  await startSession(c, id);
  return c.json({ user: await getUserDto(c.env.DB, id) }, 201);
});

auth.post('/login', async (c) => {
  const ip = clientIp(c);
  await hitRateLimit(c.env.DB, `login-ip:${ip}`, 30, 900);
  const input = await parseJson(c, loginSchema);
  const emailKey = `login-email:${input.email}`;
  await peekRateLimit(c.env.DB, emailKey, 8, 900);
  const row = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .bind(input.email)
    .first<{ id: string; password_hash: string }>();
  let ok = false;
  if (row) ok = await verifyPassword(input.password, row.password_hash);
  else await dummyVerify(input.password);
  if (!row || !ok) {
    await hitRateLimit(c.env.DB, emailKey, 1000, 900);
    throw new ApiError('unauthorized', 'E-Mail oder Passwort ist falsch');
  }
  await resetRateLimit(c.env.DB, emailKey);
  await startSession(c, row.id);
  // Opportunistic housekeeping – cheap and bounded.
  c.executionCtx?.waitUntil?.(purgeExpiredSessions(c.env.DB).catch(() => undefined));
  return c.json({ user: await getUserDto(c.env.DB, row.id) });
});

auth.post('/logout', async (c) => {
  const sid = c.get('sessionId');
  if (sid) await deleteSession(c.env.DB, sid);
  clearCookie(c);
  return c.json({ ok: true });
});

auth.get('/me', requireUser, async (c) => c.json({ user: await getUserDto(c.env.DB, currentUser(c).id) }));

auth.patch('/me', requireUser, async (c) => {
  const user = currentUser(c);
  const input = await parseJson(c, updateMeSchema);
  const now = nowIso();
  if (input.newPassword) {
    if (!input.currentPassword) throw new ApiError('validation_failed', 'Aktuelles Passwort fehlt');
    const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
    if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
      throw new ApiError('forbidden', 'Aktuelles Passwort ist falsch');
    }
    const hash = await hashPassword(input.newPassword);
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(hash, now, user.id),
      // Sign out all other devices after a password change.
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').bind(user.id, c.get('sessionId')),
    ]);
  }
  if (input.displayName) {
    await c.env.DB.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').bind(input.displayName, now, user.id).run();
  }
  return c.json({ user: await getUserDto(c.env.DB, user.id) });
});

/** Export of all personal data (every trip the user is a member of). */
auth.get('/export', requireUser, async (c) => {
  const user = currentUser(c);
  const { results } = await c.env.DB.prepare('SELECT trip_id, role FROM trip_members WHERE user_id = ?')
    .bind(user.id)
    .all<{ trip_id: string; role: 'owner' | 'editor' | 'viewer' }>();
  const trips = [];
  for (const m of results) trips.push(await buildSnapshot(c.env.DB, m.trip_id, m.role, user.id));
  c.header('Content-Disposition', `attachment; filename="travio-export-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json({ exportedAt: nowIso(), user: await getUserDto(c.env.DB, user.id), trips });
});

/**
 * Deletes the account. Trips where the user is the only owner are deleted
 * as well (they would otherwise be orphaned); other memberships are removed.
 */
auth.delete('/me', requireUser, async (c) => {
  const user = currentUser(c);
  const input = await parseJson(c, deleteMeSchema);
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(input.password, row.password_hash))) {
    throw new ApiError('forbidden', 'Passwort ist falsch');
  }
  const { results } = await c.env.DB.prepare(
    `SELECT m.trip_id FROM trip_members m WHERE m.user_id = ? AND m.role = 'owner'
       AND NOT EXISTS (SELECT 1 FROM trip_members o WHERE o.trip_id = m.trip_id AND o.role = 'owner' AND o.user_id <> m.user_id)`,
  )
    .bind(user.id)
    .all<{ trip_id: string }>();
  await c.env.DB.batch([
    ...results.map((r) => c.env.DB.prepare('DELETE FROM trips WHERE id = ?').bind(r.trip_id)),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  clearCookie(c);
  return c.json({ ok: true, deletedTrips: results.length });
});

// ---------------------------------------------------------------------------
// Invitations (public preview & acceptance)
// ---------------------------------------------------------------------------

async function findInvitation(db: D1Database, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return db
    .prepare(
      `SELECT i.*, t.name AS trip_name, u.display_name AS inviter_name FROM invitations i
       JOIN trips t ON t.id = i.trip_id LEFT JOIN users u ON u.id = i.created_by
       WHERE i.token_hash = ?`,
    )
    .bind(await sha256Hex(token))
    .first<Record<string, string | null>>();
}

export const invitations = new Hono<AppEnv>();

invitations.get('/:token', async (c) => {
  await hitRateLimit(c.env.DB, `invite-view:${clientIp(c)}`, 60, 900);
  const inv = await findInvitation(c.env.DB, c.req.param('token'));
  if (!inv) throw new ApiError('not_found', 'Einladung nicht gefunden');
  const valid = !inv.used_at && (inv.expires_at as string) > nowIso();
  // Only minimal information is revealed before acceptance.
  return c.json({
    tripName: inv.trip_name,
    inviterName: inv.inviter_name,
    role: inv.role,
    expiresAt: inv.expires_at,
    valid,
    reason: inv.used_at ? 'used' : valid ? null : 'expired',
  });
});

invitations.post('/:token/accept', async (c) => {
  await hitRateLimit(c.env.DB, `invite-accept:${clientIp(c)}`, 20, 900);
  const input = await parseJson(c, acceptInviteSchema);
  const inv = await findInvitation(c.env.DB, c.req.param('token'));
  if (!inv) throw new ApiError('not_found', 'Einladung nicht gefunden');
  const now = nowIso();
  if (inv.used_at) throw new ApiError('conflict', 'Diese Einladung wurde bereits verwendet');
  if ((inv.expires_at as string) <= now) throw new ApiError('conflict', 'Diese Einladung ist abgelaufen');

  let userId = c.get('user')?.id ?? null;
  let displayName = c.get('user')?.displayName ?? '';
  let createdAccount = false;
  if (!userId) {
    if (!input.account) throw new ApiError('unauthorized', 'Bitte melde dich an oder erstelle ein Konto');
    userId = await insertUser(c.env.DB, input.account);
    displayName = input.account.displayName;
    createdAccount = true;
  }

  // Single use: only the first request can flip used_at.
  const claim = await c.env.DB.prepare(
    'UPDATE invitations SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?',
  )
    .bind(now, userId, inv.id, now)
    .run();
  if (claim.meta.changes !== 1) {
    if (createdAccount) await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    throw new ApiError('conflict', 'Diese Einladung ist nicht mehr gültig');
  }

  const tripId = inv.trip_id as string;
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO trip_members (trip_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(trip_id, user_id) DO NOTHING`,
    ).bind(tripId, userId, inv.role, now),
  ];
  const hasTraveler = await c.env.DB.prepare('SELECT id FROM travelers WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, userId)
    .first();
  if (!hasTraveler) {
    if (inv.traveler_id) {
      stmts.push(
        c.env.DB.prepare('UPDATE travelers SET user_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND trip_id = ? AND user_id IS NULL').bind(
          userId,
          now,
          inv.traveler_id,
          tripId,
        ),
      );
    } else {
      const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM travelers WHERE trip_id = ?').bind(tripId).first<{ n: number }>();
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO travelers (id, trip_id, name, user_id, color, sort_order, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).bind(uuid(), tripId, displayName, userId, TRAVELER_COLORS[(n?.n ?? 0) % TRAVELER_COLORS.length], n?.n ?? 0, now, now),
      );
    }
  }
  await c.env.DB.batch(stmts);
  if (createdAccount) await startSession(c, userId);
  const role = (await c.env.DB.prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?').bind(tripId, userId).first<{ role: 'owner' }>())!.role;
  return c.json({ trip: await getTripDto(c.env.DB, tripId, role), user: await getUserDto(c.env.DB, userId) });
});

export default auth;
