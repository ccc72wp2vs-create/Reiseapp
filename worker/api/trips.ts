import { Hono } from 'hono';
import { z } from 'zod';
import { TRAVELER_COLORS } from '../../shared/constants';
import {
  destinationCreateSchema,
  destinationUpdateSchema,
  invitationCreateSchema,
  memberUpdateSchema,
  reorderSchema,
  travelerCreateSchema,
  travelerPartnerSchema,
  travelerUpdateSchema,
  tripCreateSchema,
  tripUpdateSchema,
} from '../../shared/schemas';
import type { DestinationDto, InvitationDto, TravelerDto } from '../../shared/types';
import {
  deleteEntity,
  destinationSpec,
  getEntity,
  insertEntity,
  listEntities,
  reorderEntities,
  travelerSpec,
  unwrapUpdate,
  updateEntity,
} from '../db/entity';
import { ApiError } from '../lib/errors';
import { addDays, nowIso, randomToken, sha256Hex, uuid } from '../lib/util';
import { currentUser, loadTripAccess, parseJson, requireRole } from '../middleware/core';
import {
  audit,
  buildSnapshot,
  createTripStatements,
  getTripDto,
  listMembers,
  listTripsForUser,
  TRIP_COLUMNS,
} from '../services/trips';
import type { AppContext, AppEnv } from '../types';

const trips = new Hono<AppEnv>();

const versionQuery = (c: AppContext): number | undefined => {
  const v = c.req.query('version');
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new ApiError('bad_request', 'Ungültige Version');
  return n;
};
export { versionQuery };

trips.get('/', async (c) => c.json({ trips: await listTripsForUser(c.env.DB, currentUser(c).id) }));

trips.post('/', async (c) => {
  const user = currentUser(c);
  const input = await parseJson(c, tripCreateSchema);
  const { tripId, stmts } = createTripStatements(c.env.DB, user, input);
  await c.env.DB.batch(stmts);
  return c.json({ trip: await getTripDto(c.env.DB, tripId, 'owner') }, 201);
});

// ---------------------------------------------------------------------------
// Everything below is scoped to a trip the caller is a member of
// ---------------------------------------------------------------------------

trips.use('/:tripId/*', loadTripAccess);
trips.use('/:tripId', loadTripAccess);

trips.get('/:tripId', async (c) => {
  const t = c.get('trip');
  return c.json({ trip: await getTripDto(c.env.DB, t.tripId, t.role) });
});

trips.get('/:tripId/snapshot', async (c) => {
  const t = c.get('trip');
  return c.json(await buildSnapshot(c.env.DB, t.tripId, t.role, currentUser(c).id));
});

trips.get('/:tripId/export', async (c) => {
  const t = c.get('trip');
  const snap = await buildSnapshot(c.env.DB, t.tripId, t.role, currentUser(c).id);
  c.header('Content-Disposition', `attachment; filename="travio-reise-${t.tripId.slice(0, 8)}.json"`);
  return c.json({ exportedAt: nowIso(), ...snap });
});

trips.patch('/:tripId', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const input = await parseJson(c, tripUpdateSchema);
  const current = await getTripDto(c.env.DB, t.tripId, t.role);
  if (!current) throw new ApiError('not_found', 'Reise nicht gefunden');
  const start = input.startDate ?? current.startDate;
  const end = input.endDate ?? current.endDate;
  if (end < start) throw new ApiError('validation_failed', 'Enddatum vor Startdatum', [{ path: 'endDate' }]);
  if (input.baseCurrency && input.baseCurrency !== current.baseCurrency) {
    const used = await c.env.DB.prepare(
      'SELECT (SELECT COUNT(*) FROM expenses WHERE trip_id = ?1) + (SELECT COUNT(*) FROM settlements WHERE trip_id = ?1) AS n',
    )
      .bind(t.tripId)
      .first<{ n: number }>();
    if ((used?.n ?? 0) > 0) {
      throw new ApiError(
        'validation_failed',
        'Die Basiswährung kann nicht mehr geändert werden, weil bereits Ausgaben erfasst sind.',
        [{ path: 'baseCurrency' }],
      );
    }
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(TRIP_COLUMNS)) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(v);
    }
  }
  sets.push('version = version + 1', 'updated_at = ?');
  vals.push(nowIso());
  const res = await c.env.DB.prepare(`UPDATE trips SET ${sets.join(', ')} WHERE id = ? AND version = ?`)
    .bind(...vals, t.tripId, input.version)
    .run();
  const updated = await getTripDto(c.env.DB, t.tripId, t.role);
  if (res.meta.changes === 0) {
    throw new ApiError('version_conflict', 'Die Reise wurde inzwischen geändert.', { current: updated });
  }
  return c.json({ trip: updated });
});

trips.post('/:tripId/archive', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const { archived } = await parseJson(c, z.object({ archived: z.boolean() }));
  await c.env.DB.prepare('UPDATE trips SET archived_at = ?, version = version + 1, updated_at = ? WHERE id = ?')
    .bind(archived ? nowIso() : null, nowIso(), t.tripId)
    .run();
  return c.json({ trip: await getTripDto(c.env.DB, t.tripId, t.role) });
});

trips.delete('/:tripId', async (c) => {
  requireRole(c, 'owner');
  const t = c.get('trip');
  await c.env.DB.prepare('DELETE FROM trips WHERE id = ?').bind(t.tripId).run();
  await audit(c.env.DB, { tripId: null, userId: currentUser(c).id, entity: 'trip', entityId: t.tripId, action: 'delete' });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Members & invitations
// ---------------------------------------------------------------------------

trips.get('/:tripId/members', async (c) => c.json({ members: await listMembers(c.env.DB, c.get('trip').tripId) }));

async function ownerCount(db: D1Database, tripId: string) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM trip_members WHERE trip_id = ? AND role = 'owner'").bind(tripId).first<{ n: number }>();
  return r?.n ?? 0;
}

trips.patch('/:tripId/members/:userId', async (c) => {
  requireRole(c, 'owner');
  const t = c.get('trip');
  const { role } = await parseJson(c, memberUpdateSchema);
  const target = c.req.param('userId');
  const member = await c.env.DB.prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?').bind(t.tripId, target).first<{ role: string }>();
  if (!member) throw new ApiError('not_found', 'Mitglied nicht gefunden');
  if (member.role === 'owner' && role !== 'owner' && (await ownerCount(c.env.DB, t.tripId)) <= 1) {
    throw new ApiError('validation_failed', 'Eine Reise braucht mindestens eine:n Inhaber:in');
  }
  await c.env.DB.prepare('UPDATE trip_members SET role = ? WHERE trip_id = ? AND user_id = ?').bind(role, t.tripId, target).run();
  return c.json({ members: await listMembers(c.env.DB, t.tripId) });
});

trips.delete('/:tripId/members/:userId', async (c) => {
  const t = c.get('trip');
  const me = currentUser(c);
  const target = c.req.param('userId');
  if (target !== me.id) requireRole(c, 'owner');
  const member = await c.env.DB.prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?').bind(t.tripId, target).first<{ role: string }>();
  if (!member) throw new ApiError('not_found', 'Mitglied nicht gefunden');
  if (member.role === 'owner' && (await ownerCount(c.env.DB, t.tripId)) <= 1) {
    throw new ApiError('validation_failed', 'Die letzte Inhaberin / der letzte Inhaber kann die Reise nicht verlassen');
  }
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?').bind(t.tripId, target),
    c.env.DB.prepare("DELETE FROM packing_lists WHERE trip_id = ? AND owner_user_id = ? AND visibility = 'private'").bind(t.tripId, target),
  ]);
  return c.json({ ok: true });
});

function invitationRowToDto(r: Record<string, unknown>): InvitationDto {
  return {
    id: r.id as string,
    tripId: r.trip_id as string,
    role: r.role as InvitationDto['role'],
    travelerId: (r.traveler_id as string) ?? null,
    email: (r.email as string) ?? null,
    createdAt: r.created_at as string,
    expiresAt: r.expires_at as string,
    usedAt: (r.used_at as string) ?? null,
  };
}

trips.get('/:tripId/invitations', async (c) => {
  requireRole(c, 'owner');
  const { results } = await c.env.DB.prepare('SELECT * FROM invitations WHERE trip_id = ? ORDER BY created_at DESC')
    .bind(c.get('trip').tripId)
    .all();
  return c.json({ invitations: results.map(invitationRowToDto) });
});

trips.post('/:tripId/invitations', async (c) => {
  requireRole(c, 'owner');
  const t = c.get('trip');
  const input = await parseJson(c, invitationCreateSchema);
  if (input.travelerId) {
    const tr = await c.env.DB.prepare('SELECT user_id FROM travelers WHERE id = ? AND trip_id = ?').bind(input.travelerId, t.tripId).first<{ user_id: string | null }>();
    if (!tr) throw new ApiError('validation_failed', 'Person nicht gefunden');
    if (tr.user_id) throw new ApiError('validation_failed', 'Diese Person hat bereits ein Konto in der Reise');
  }
  const token = randomToken(32);
  const id = uuid();
  const now = nowIso();
  const expires = addDays(now, input.expiresInHours / 24);
  await c.env.DB.prepare(
    `INSERT INTO invitations (id, trip_id, token_hash, role, traveler_id, email, created_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, t.tripId, await sha256Hex(token), input.role, input.travelerId ?? null, input.email ?? null, currentUser(c).id, now, expires)
    .run();
  const row = await c.env.DB.prepare('SELECT * FROM invitations WHERE id = ?').bind(id).first();
  // The raw token is returned exactly once and never stored.
  return c.json({ invitation: invitationRowToDto(row!), token, path: `/einladung/${token}` }, 201);
});

trips.delete('/:tripId/invitations/:id', async (c) => {
  requireRole(c, 'owner');
  const res = await c.env.DB.prepare('DELETE FROM invitations WHERE id = ? AND trip_id = ?').bind(c.req.param('id'), c.get('trip').tripId).run();
  if (!res.meta.changes) throw new ApiError('not_found', 'Einladung nicht gefunden');
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Travelers
// ---------------------------------------------------------------------------

async function assertMemberUser(db: D1Database, tripId: string, userId: string | null | undefined) {
  if (!userId) return;
  const m = await db.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').bind(tripId, userId).first();
  if (!m) throw new ApiError('validation_failed', 'Benutzer ist kein Mitglied dieser Reise');
}

trips.post('/:tripId/travelers', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const input = await parseJson(c, travelerCreateSchema);
  await assertMemberUser(c.env.DB, t.tripId, input.userId);
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM travelers WHERE trip_id = ?').bind(t.tripId).first<{ n: number }>();
  const count = n?.n ?? 0;
  if (count >= 50) throw new ApiError('validation_failed', 'Maximal 50 Personen pro Reise');
  const traveler = await insertEntity<TravelerDto>(
    c.env.DB,
    travelerSpec,
    t.tripId,
    { ...input, color: input.color ?? TRAVELER_COLORS[count % TRAVELER_COLORS.length] },
    { sort_order: count },
  ).catch((e) => {
    if (String(e).includes('UNIQUE')) throw new ApiError('conflict', 'Benutzer ist bereits als Person erfasst');
    throw e;
  });
  return c.json({ traveler }, 201);
});

trips.patch('/:tripId/travelers/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const { version, ...patch } = await parseJson(c, travelerUpdateSchema);
  await assertMemberUser(c.env.DB, t.tripId, patch.userId);
  const r = await updateEntity<TravelerDto>(c.env.DB, travelerSpec, t.tripId, c.req.param('id'), version, patch).catch((e) => {
    if (String(e).includes('UNIQUE')) throw new ApiError('conflict', 'Benutzer ist bereits als Person erfasst');
    throw e;
  });
  return c.json({ traveler: unwrapUpdate(r, 'Person') });
});

/**
 * Sets (or clears) a traveler's partner. Always mutual: both sides point at
 * each other and any previous partner of either side is released.
 */
trips.put('/:tripId/travelers/:id/partner', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const self = c.req.param('id');
  const { partnerId } = await parseJson(c, travelerPartnerSchema);
  if (partnerId === self) throw new ApiError('validation_failed', 'Eine Person kann nicht ihr eigener Partner sein');
  const ids = partnerId ? [self, partnerId] : [self];
  const found = await c.env.DB.prepare(`SELECT id FROM travelers WHERE trip_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(t.tripId, ...ids)
    .all<{ id: string }>();
  if ((found.results ?? []).length !== ids.length) throw new ApiError('not_found', 'Person nicht gefunden');
  const now = nowIso();
  const marks = ids.map(() => '?').join(',');
  const stmts = [
    c.env.DB.prepare(
      `UPDATE travelers SET partner_id = NULL, version = version + 1, updated_at = ?
       WHERE trip_id = ? AND partner_id IS NOT NULL AND (id IN (${marks}) OR partner_id IN (${marks}))`,
    ).bind(now, t.tripId, ...ids, ...ids),
  ];
  if (partnerId) {
    stmts.push(
      c.env.DB.prepare('UPDATE travelers SET partner_id = ?, version = version + 1, updated_at = ? WHERE trip_id = ? AND id = ?').bind(partnerId, now, t.tripId, self),
      c.env.DB.prepare('UPDATE travelers SET partner_id = ?, version = version + 1, updated_at = ? WHERE trip_id = ? AND id = ?').bind(self, now, t.tripId, partnerId),
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

/**
 * Couples from an earlier trip: matches its partners to this trip's travelers
 * (same account, otherwise same name) – only pairs where both are still single here.
 */
async function partnerSuggestion(db: D1Database, tripId: string, userId: string) {
  const current = (await db.prepare('SELECT id, name, user_id, partner_id FROM travelers WHERE trip_id = ?').bind(tripId).all<{ id: string; name: string; user_id: string | null; partner_id: string | null }>()).results;
  if (current.length < 2 || current.some((x) => x.partner_id)) return null;
  const { results: others } = await db
    .prepare(
      `SELECT t.id, t.name FROM trips t JOIN trip_members m ON m.trip_id = t.id
       WHERE m.user_id = ? AND t.id != ? AND EXISTS (SELECT 1 FROM travelers x WHERE x.trip_id = t.id AND x.partner_id IS NOT NULL)
       ORDER BY t.start_date DESC LIMIT 5`,
    )
    .bind(userId, tripId)
    .all<{ id: string; name: string }>();
  const norm = (s: string) => s.trim().toLowerCase();
  for (const other of others) {
    const prev = (await db.prepare('SELECT id, name, user_id, partner_id FROM travelers WHERE trip_id = ?').bind(other.id).all<{ id: string; name: string; user_id: string | null; partner_id: string | null }>()).results;
    const find = (p: { name: string; user_id: string | null }) => current.find((x) => (p.user_id && x.user_id === p.user_id) || norm(x.name) === norm(p.name));
    const pairs: { a: string; b: string }[] = [];
    for (const p of prev) {
      if (!p.partner_id || p.id > p.partner_id) continue;
      const q = prev.find((x) => x.id === p.partner_id && x.partner_id === p.id);
      const a = q && find(p);
      const b = q && find(q);
      if (a && b && a.id !== b.id) pairs.push({ a: a.id, b: b.id });
    }
    if (pairs.length) return { fromTrip: { id: other.id, name: other.name }, pairs };
  }
  return null;
}

trips.get('/:tripId/travelers/partner-suggestion', async (c) => {
  return c.json({ suggestion: await partnerSuggestion(c.env.DB, c.get('trip').tripId, currentUser(c).id) });
});

trips.post('/:tripId/travelers/partner-suggestion', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const s = await partnerSuggestion(c.env.DB, t.tripId, currentUser(c).id);
  if (!s) throw new ApiError('not_found', 'Keine Paare zum Übernehmen gefunden');
  const now = nowIso();
  await c.env.DB.batch(
    s.pairs.flatMap((p) => [
      c.env.DB.prepare('UPDATE travelers SET partner_id = ?, version = version + 1, updated_at = ? WHERE trip_id = ? AND id = ?').bind(p.b, now, t.tripId, p.a),
      c.env.DB.prepare('UPDATE travelers SET partner_id = ?, version = version + 1, updated_at = ? WHERE trip_id = ? AND id = ?').bind(p.a, now, t.tripId, p.b),
    ]),
  );
  return c.json({ applied: s.pairs.length });
});

trips.delete('/:tripId/travelers/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  try {
    const r = await deleteEntity(c.env.DB, travelerSpec, t.tripId, c.req.param('id'));
    if (r.status === 'not_found') throw new ApiError('not_found', 'Person nicht gefunden');
  } catch (e) {
    if (String(e).includes('FOREIGN KEY')) {
      throw new ApiError('conflict', 'Diese Person ist an Ausgaben oder Rückzahlungen beteiligt und kann nicht entfernt werden.');
    }
    throw e;
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

trips.post('/:tripId/destinations', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const input = await parseJson(c, destinationCreateSchema);
  const created = await insertEntity<DestinationDto>(c.env.DB, destinationSpec, t.tripId, input, { sort_order: 9999 });
  // Insert the new stop at its chronological position without touching any
  // other data of the existing stops.
  const all = await listEntities<DestinationDto>(c.env.DB, destinationSpec, t.tripId);
  const others = all.filter((d) => d.id !== created.id);
  const idx = others.findIndex((d) => d.arrivalDate > created.arrivalDate);
  const ordered = [...others];
  ordered.splice(idx === -1 ? ordered.length : idx, 0, created);
  await reorderEntities(c.env.DB, destinationSpec, t.tripId, ordered.map((d) => d.id));
  return c.json({ destination: await getEntity<DestinationDto>(c.env.DB, destinationSpec, t.tripId, created.id) }, 201);
});

trips.patch('/:tripId/destinations/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const { version, ...patch } = await parseJson(c, destinationUpdateSchema);
  const id = c.req.param('id');
  if (patch.arrivalDate || patch.departureDate) {
    const cur = await getEntity<DestinationDto>(c.env.DB, destinationSpec, t.tripId, id);
    if (!cur) throw new ApiError('not_found', 'Reiseziel nicht gefunden');
    if ((patch.departureDate ?? cur.departureDate) < (patch.arrivalDate ?? cur.arrivalDate)) {
      throw new ApiError('validation_failed', 'Abreise vor Ankunft', [{ path: 'departureDate' }]);
    }
  }
  const r = await updateEntity<DestinationDto>(c.env.DB, destinationSpec, t.tripId, id, version, patch);
  return c.json({ destination: unwrapUpdate(r, 'Reiseziel') });
});

trips.delete('/:tripId/destinations/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const r = await deleteEntity(c.env.DB, destinationSpec, t.tripId, c.req.param('id'), versionQuery(c));
  if (r.status === 'not_found') throw new ApiError('not_found', 'Reiseziel nicht gefunden');
  if (r.status === 'conflict') throw new ApiError('version_conflict', 'Das Reiseziel wurde inzwischen geändert.', { current: r.entity });
  return c.json({ ok: true });
});

trips.post('/:tripId/destinations/reorder', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const { orderedIds } = await parseJson(c, reorderSchema);
  await reorderEntities(c.env.DB, destinationSpec, t.tripId, orderedIds);
  return c.json({ destinations: await listEntities(c.env.DB, destinationSpec, t.tripId) });
});

export default trips;
