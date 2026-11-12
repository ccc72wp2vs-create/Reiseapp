/**
 * Offline synchronization.
 *
 * Clients queue mutations (with stable operation IDs) while offline and push
 * them in order. For every operation the server:
 *   1. returns the stored result if the opId was already processed
 *      (idempotency – retries never duplicate data),
 *   2. validates the payload with the same schemas as the REST API,
 *   3. enforces the caller's trip role / list ownership,
 *   4. applies the change with optimistic locking (baseVersion). If another
 *      traveler changed the entity in the meantime the op is reported as a
 *      conflict together with the current server state – nothing is
 *      overwritten silently.
 */
import { ROLE_RANK, type Role } from '../../shared/constants';
import {
  activityCreateSchema,
  activityReorderSchema,
  activityUpdateSchema,
  packingItemCreateSchema,
  packingItemUpdateSchema,
  packingListCreateSchema,
  packingListUpdateSchema,
  placeCreateSchema,
  placeUpdateSchema,
} from '../../shared/schemas';
import type { SyncOperation, SyncResult } from '../../shared/types';
import { ApiError, fromZod } from '../lib/errors';
import { nowIso } from '../lib/util';
import * as packing from './packing';
import * as plan from './plan';

interface Ctx {
  db: D1Database;
  tripId: string;
  userId: string;
  role: Role;
}

function parse<T>(schema: { safeParse(d: unknown): { success: true; data: T } | { success: false; error: import('zod').ZodError } }, data: unknown): T {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw fromZod(r.error);
  return r.data;
}

const omitVersion = <T extends { version?: number }>(o: T) => {
  const { version: _v, ...rest } = o;
  return rest;
};

function requireEditor(role: Role) {
  if (ROLE_RANK[role] < ROLE_RANK.editor) throw new ApiError('forbidden', 'Du hast nur Leserechte für diese Reise');
}

type WriteOutcome = { status: 'ok'; entity?: unknown } | { status: 'not_found' } | { status: 'conflict'; entity: unknown };

function toResult(opId: string, action: SyncOperation['action'], w: WriteOutcome): SyncResult {
  if (w.status === 'ok') return { opId, status: 'applied', entity: action === 'delete' ? null : w.entity };
  if (w.status === 'conflict') return { opId, status: 'conflict', entity: w.entity };
  // Deleting something that is already gone is fine (idempotent).
  if (action === 'delete') return { opId, status: 'applied', entity: null };
  return {
    opId,
    status: 'conflict',
    entity: null,
    error: { code: 'not_found', message: 'Eintrag wurde inzwischen gelöscht' },
  };
}

async function applyOp(ctx: Ctx, op: SyncOperation): Promise<SyncResult> {
  const { db, tripId, userId, role } = ctx;
  const needVersion = () => {
    if (!op.baseVersion) throw new ApiError('validation_failed', 'baseVersion fehlt');
    return op.baseVersion;
  };
  switch (op.entity) {
    case 'activity': {
      requireEditor(role);
      if (op.action === 'create') {
        const input = parse(activityCreateSchema, { ...op.data, id: op.id });
        return toResult(op.opId, op.action, { status: 'ok', entity: await plan.createActivity(db, tripId, userId, input) });
      }
      if (op.action === 'update') {
        const patch = omitVersion(parse(activityUpdateSchema, { ...op.data, version: needVersion() }));
        return toResult(op.opId, op.action, await plan.updateActivity(db, tripId, userId, op.id, needVersion(), patch));
      }
      if (op.action === 'delete') {
        return toResult(op.opId, op.action, await plan.deleteActivity(db, tripId, op.id, op.baseVersion));
      }
      await plan.reorderActivities(db, tripId, parse(activityReorderSchema, op.data));
      return { opId: op.opId, status: 'applied' };
    }
    case 'place': {
      requireEditor(role);
      if (op.action === 'create') {
        const input = parse(placeCreateSchema, { ...op.data, id: op.id });
        return toResult(op.opId, op.action, { status: 'ok', entity: await plan.createPlace(db, tripId, userId, input) });
      }
      if (op.action === 'update') {
        const patch = omitVersion(parse(placeUpdateSchema, { ...op.data, version: needVersion() }));
        return toResult(op.opId, op.action, await plan.updatePlace(db, tripId, op.id, needVersion(), patch));
      }
      if (op.action === 'delete') return toResult(op.opId, op.action, await plan.deletePlace(db, tripId, op.id, op.baseVersion));
      break;
    }
    case 'packing_list': {
      if (op.action === 'create') {
        const input = parse(packingListCreateSchema, { ...op.data, id: op.id });
        const created = await packing.createList(db, tripId, userId, role, input);
        return toResult(op.opId, op.action, { status: 'ok', entity: created.list });
      }
      if (op.action === 'update') {
        const patch = omitVersion(parse(packingListUpdateSchema, { ...op.data, version: needVersion() }));
        return toResult(op.opId, op.action, await packing.updateList(db, tripId, userId, role, op.id, needVersion(), patch));
      }
      if (op.action === 'delete') {
        return toResult(op.opId, op.action, await packing.deleteList(db, tripId, userId, role, op.id, op.baseVersion));
      }
      break;
    }
    case 'packing_item': {
      if (op.action === 'create') {
        const input = parse(packingItemCreateSchema, { ...op.data, id: op.id });
        return toResult(op.opId, op.action, { status: 'ok', entity: await packing.createItem(db, tripId, userId, role, input) });
      }
      if (op.action === 'update') {
        const patch = omitVersion(parse(packingItemUpdateSchema, { ...op.data, version: needVersion() }));
        return toResult(op.opId, op.action, await packing.updateItem(db, tripId, userId, role, op.id, needVersion(), patch));
      }
      if (op.action === 'delete') {
        return toResult(op.opId, op.action, await packing.deleteItem(db, tripId, userId, role, op.id, op.baseVersion));
      }
      break;
    }
  }
  throw new ApiError('validation_failed', 'Nicht unterstützte Operation');
}

export async function processSyncOps(ctx: Ctx, ops: SyncOperation[]): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const op of ops) {
    const prior = await ctx.db
      .prepare('SELECT status, result_json, user_id, trip_id FROM sync_operations WHERE op_id = ?')
      .bind(op.opId)
      .first<{ status: string; result_json: string | null; user_id: string; trip_id: string }>();
    if (prior) {
      if (prior.user_id !== ctx.userId || prior.trip_id !== ctx.tripId) {
        results.push({ opId: op.opId, status: 'rejected', error: { code: 'bad_request', message: 'Ungültige Operation' } });
        continue;
      }
      const stored = prior.result_json ? (JSON.parse(prior.result_json) as SyncResult) : null;
      results.push({ ...(stored ?? { opId: op.opId }), opId: op.opId, status: 'duplicate', entity: stored?.entity });
      continue;
    }
    let result: SyncResult;
    try {
      result = await applyOp(ctx, op);
    } catch (e) {
      if (e instanceof ApiError) {
        result = { opId: op.opId, status: 'rejected', error: { code: e.code, message: e.message } };
      } else {
        throw e;
      }
    }
    // Only applied & rejected operations are final. Conflicts are not stored
    // so that the client can retry the same op after resolving the conflict.
    if (result.status === 'applied' || result.status === 'rejected') {
      await ctx.db
        .prepare(
          `INSERT OR IGNORE INTO sync_operations (op_id, user_id, trip_id, entity, action, entity_id, status, result_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(op.opId, ctx.userId, ctx.tripId, op.entity, op.action, op.id, result.status, JSON.stringify(result), nowIso())
        .run();
    }
    results.push(result);
  }
  return results;
}
