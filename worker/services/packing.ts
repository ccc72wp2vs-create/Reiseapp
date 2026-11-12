/**
 * Packing lists. Visibility rules:
 *  - shared lists of a trip: readable by all members, writable by editors+
 *  - private lists: readable & writable only by their owner (any role)
 *  - templates (trip_id NULL): personal, only visible to their owner
 */
import { ROLE_RANK, type PackingCategory, type PackingVisibility, type Role } from '../../shared/constants';
import type { PackingItemDto, PackingListDto } from '../../shared/types';
import { ApiError } from '../lib/errors';
import { nowIso, uuid } from '../lib/util';

type Row = Record<string, unknown>;

function listRowToDto(r: Row): PackingListDto {
  return {
    id: r.id as string,
    version: r.version as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    tripId: (r.trip_id as string) ?? null,
    ownerUserId: r.owner_user_id as string,
    visibility: r.visibility as PackingVisibility,
    isTemplate: r.is_template === 1,
    name: r.name as string,
  };
}

function itemRowToDto(r: Row): PackingItemDto {
  return {
    id: r.id as string,
    version: r.version as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    listId: r.list_id as string,
    name: r.name as string,
    category: r.category as PackingCategory,
    quantity: r.quantity as number,
    packed: r.packed === 1,
    sortOrder: r.sort_order as number,
  };
}

const VISIBLE_LISTS = `(
  (pl.trip_id = ?1 AND (pl.visibility = 'shared' OR pl.owner_user_id = ?2))
  OR (pl.trip_id IS NULL AND pl.is_template = 1 AND pl.owner_user_id = ?2)
)`;

export async function listVisiblePacking(db: D1Database, tripId: string, userId: string) {
  const [lists, items] = await db.batch<Row>([
    db.prepare(`SELECT pl.* FROM packing_lists pl WHERE ${VISIBLE_LISTS} ORDER BY pl.is_template, pl.created_at`).bind(tripId, userId),
    db
      .prepare(
        `SELECT pi.* FROM packing_items pi JOIN packing_lists pl ON pl.id = pi.list_id
         WHERE ${VISIBLE_LISTS} ORDER BY pi.sort_order, pi.created_at`,
      )
      .bind(tripId, userId),
  ]);
  return { lists: lists.results.map(listRowToDto), items: items.results.map(itemRowToDto) };
}

export async function getVisibleList(db: D1Database, tripId: string, userId: string, listId: string) {
  const row = await db
    .prepare(`SELECT pl.* FROM packing_lists pl WHERE pl.id = ?3 AND ${VISIBLE_LISTS}`)
    .bind(tripId, userId, listId)
    .first<Row>();
  return row ? listRowToDto(row) : null;
}

export function canWriteList(list: PackingListDto, userId: string, role: Role): boolean {
  if (list.visibility === 'private' || list.isTemplate) return list.ownerUserId === userId;
  return ROLE_RANK[role] >= ROLE_RANK.editor;
}

async function writableList(db: D1Database, tripId: string, userId: string, role: Role, listId: string) {
  const list = await getVisibleList(db, tripId, userId, listId);
  if (!list) throw new ApiError('not_found', 'Packliste nicht gefunden');
  if (!canWriteList(list, userId, role)) throw new ApiError('forbidden', 'Keine Berechtigung für diese Packliste');
  return list;
}

export async function createList(
  db: D1Database,
  tripId: string,
  userId: string,
  role: Role,
  input: { id?: string; name: string; visibility: PackingVisibility; isTemplate: boolean; fromListId?: string },
): Promise<{ list: PackingListDto; items: PackingItemDto[] }> {
  const visibility: PackingVisibility = input.isTemplate ? 'private' : input.visibility;
  if (visibility === 'shared' && ROLE_RANK[role] < ROLE_RANK.editor) {
    throw new ApiError('forbidden', 'Nur Bearbeiter:innen können gemeinsame Listen anlegen');
  }
  let sourceItems: Row[] = [];
  if (input.fromListId) {
    const src = await getVisibleList(db, tripId, userId, input.fromListId);
    if (!src) throw new ApiError('not_found', 'Vorlage nicht gefunden');
    sourceItems = (
      await db.prepare('SELECT * FROM packing_items WHERE list_id = ? ORDER BY sort_order').bind(src.id).all<Row>()
    ).results;
  }
  const id = input.id ?? uuid();
  const now = nowIso();
  const stmts = [
    db
      .prepare(
        `INSERT INTO packing_lists (id, trip_id, owner_user_id, visibility, is_template, name, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(id, input.isTemplate ? null : tripId, userId, visibility, input.isTemplate ? 1 : 0, input.name, now, now),
    ...sourceItems.map((it, i) =>
      db
        .prepare(
          `INSERT INTO packing_items (id, list_id, name, category, quantity, packed, sort_order, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?, ?)`,
        )
        .bind(uuid(), id, it.name, it.category, it.quantity, i, now, now),
    ),
  ];
  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new ApiError('conflict', 'Packliste existiert bereits');
    throw e;
  }
  const list = (await getVisibleList(db, tripId, userId, id))!;
  const items = (
    await db.prepare('SELECT * FROM packing_items WHERE list_id = ? ORDER BY sort_order').bind(id).all<Row>()
  ).results.map(itemRowToDto);
  return { list, items };
}

export type PackingWrite<T> = { status: 'ok'; entity: T } | { status: 'not_found' } | { status: 'conflict'; entity: T };

export async function updateList(
  db: D1Database,
  tripId: string,
  userId: string,
  role: Role,
  listId: string,
  expectedVersion: number,
  patch: { name?: string; visibility?: PackingVisibility },
): Promise<PackingWrite<PackingListDto>> {
  const list = await getVisibleList(db, tripId, userId, listId);
  if (!list) return { status: 'not_found' };
  if (!canWriteList(list, userId, role)) throw new ApiError('forbidden', 'Keine Berechtigung für diese Packliste');
  if (patch.visibility && patch.visibility !== list.visibility) {
    if (list.ownerUserId !== userId) throw new ApiError('forbidden', 'Nur die Erstellerin / der Ersteller kann die Sichtbarkeit ändern');
    if (list.isTemplate) throw new ApiError('validation_failed', 'Vorlagen sind immer privat');
  }
  const res = await db
    .prepare(
      `UPDATE packing_lists SET name = COALESCE(?, name), visibility = COALESCE(?, visibility),
         version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
    )
    .bind(patch.name ?? null, patch.visibility ?? null, nowIso(), listId, expectedVersion)
    .run();
  const current = (await getVisibleList(db, tripId, userId, listId))!;
  return res.meta.changes ? { status: 'ok', entity: current } : { status: 'conflict', entity: current };
}

export async function deleteList(
  db: D1Database,
  tripId: string,
  userId: string,
  role: Role,
  listId: string,
  expectedVersion?: number,
): Promise<PackingWrite<PackingListDto>> {
  const list = await getVisibleList(db, tripId, userId, listId);
  if (!list) return { status: 'not_found' };
  if (!canWriteList(list, userId, role)) throw new ApiError('forbidden', 'Keine Berechtigung für diese Packliste');
  if (expectedVersion !== undefined && list.version !== expectedVersion) return { status: 'conflict', entity: list };
  await db.prepare('DELETE FROM packing_lists WHERE id = ?').bind(listId).run();
  return { status: 'ok', entity: list };
}

async function getItem(db: D1Database, tripId: string, userId: string, itemId: string) {
  const row = await db
    .prepare(
      `SELECT pi.* FROM packing_items pi JOIN packing_lists pl ON pl.id = pi.list_id
       WHERE pi.id = ?3 AND ${VISIBLE_LISTS}`,
    )
    .bind(tripId, userId, itemId)
    .first<Row>();
  return row ? itemRowToDto(row) : null;
}

export async function createItem(
  db: D1Database,
  tripId: string,
  userId: string,
  role: Role,
  input: { id?: string; listId: string; name: string; category: PackingCategory; quantity: number; packed: boolean },
): Promise<PackingItemDto> {
  await writableList(db, tripId, userId, role, input.listId);
  const id = input.id ?? uuid();
  const now = nowIso();
  try {
    await db
      .prepare(
        `INSERT INTO packing_items (id, list_id, name, category, quantity, packed, sort_order, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM packing_items WHERE list_id = ?), 1, ?, ?)`,
      )
      .bind(id, input.listId, input.name, input.category, input.quantity, input.packed ? 1 : 0, input.listId, now, now)
      .run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new ApiError('conflict', 'Eintrag existiert bereits');
    throw e;
  }
  return (await getItem(db, tripId, userId, id))!;
}

export async function updateItem(
  db: D1Database,
  tripId: string,
  userId: string,
  role: Role,
  itemId: string,
  expectedVersion: number,
  patch: { name?: string; category?: PackingCategory; quantity?: number; packed?: boolean },
): Promise<PackingWrite<PackingItemDto>> {
  const item = await getItem(db, tripId, userId, itemId);
  if (!item) return { status: 'not_found' };
  await writableList(db, tripId, userId, role, item.listId);
  const res = await db
    .prepare(
      `UPDATE packing_items SET name = COALESCE(?, name), category = COALESCE(?, category),
         quantity = COALESCE(?, quantity), packed = COALESCE(?, packed), version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    )
    .bind(
      patch.name ?? null,
      patch.category ?? null,
      patch.quantity ?? null,
      patch.packed === undefined ? null : patch.packed ? 1 : 0,
      nowIso(),
      itemId,
      expectedVersion,
    )
    .run();
  const current = (await getItem(db, tripId, userId, itemId))!;
  return res.meta.changes ? { status: 'ok', entity: current } : { status: 'conflict', entity: current };
}

export async function deleteItem(
  db: D1Database,
  tripId: string,
  userId: string,
  role: Role,
  itemId: string,
  expectedVersion?: number,
): Promise<PackingWrite<PackingItemDto>> {
  const item = await getItem(db, tripId, userId, itemId);
  if (!item) return { status: 'not_found' };
  await writableList(db, tripId, userId, role, item.listId);
  if (expectedVersion !== undefined && item.version !== expectedVersion) return { status: 'conflict', entity: item };
  await db.prepare('DELETE FROM packing_items WHERE id = ?').bind(itemId).run();
  return { status: 'ok', entity: item };
}
