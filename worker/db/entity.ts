/**
 * Small, explicit data-access helper for trip-scoped tables.
 * Every query includes `trip_id = ?` so a row can never be read or written
 * through a trip the caller is not a member of. All SQL is parameterized;
 * column names come exclusively from the static specs below.
 */
import { ApiError } from '../lib/errors';
import { nowIso, uuid } from '../lib/util';

export type FieldKind = 'text' | 'int' | 'real' | 'bool';
export interface FieldSpec {
  col: string;
  kind: FieldKind;
}

export interface EntitySpec {
  name: string;
  label: string;
  table: string;
  /** Writable fields: DTO property → column. */
  fields: Record<string, FieldSpec>;
  /** Server-managed, read-only fields. */
  readonly?: Record<string, FieldSpec>;
  /** Reference fields that must point to a row of the same trip. */
  refs?: Record<string, string>;
  orderBy: string;
  /** Optional custom SELECT (must expose the table's columns unaliased). */
  selectFrom?: string;
}

const selectFrom = (spec: EntitySpec) => spec.selectFrom ?? `SELECT * FROM ${spec.table}`;

const f = (col: string, kind: FieldKind = 'text'): FieldSpec => ({ col, kind });

type Row = Record<string, unknown>;

function toDb(kind: FieldKind, v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (kind === 'bool') return v ? 1 : 0;
  return v;
}

function fromDb(kind: FieldKind, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (kind === 'bool') return v === 1 || v === true;
  return v;
}

export function rowToDto<T>(spec: EntitySpec, row: Row): T {
  const out: Row = {
    id: row.id,
    tripId: row.trip_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  for (const [k, s] of Object.entries({ ...spec.fields, ...spec.readonly })) out[k] = fromDb(s.kind, row[s.col]);
  return out as T;
}

export async function listEntities<T>(db: D1Database, spec: EntitySpec, tripId: string): Promise<T[]> {
  const { results } = await db
    .prepare(`${selectFrom(spec)} WHERE trip_id = ? ORDER BY ${spec.orderBy}`)
    .bind(tripId)
    .all<Row>();
  return results.map((r) => rowToDto<T>(spec, r));
}

export async function getEntityRow(db: D1Database, spec: EntitySpec, tripId: string, id: string) {
  return db.prepare(`${selectFrom(spec)} WHERE id = ? AND trip_id = ?`).bind(id, tripId).first<Row>();
}

export async function getEntity<T>(db: D1Database, spec: EntitySpec, tripId: string, id: string): Promise<T | null> {
  const row = await getEntityRow(db, spec, tripId, id);
  return row ? rowToDto<T>(spec, row) : null;
}

/** Ensures referenced IDs belong to the same trip (object-level authorization). */
export async function checkRefs(db: D1Database, spec: EntitySpec, tripId: string, data: Row): Promise<void> {
  for (const [field, table] of Object.entries(spec.refs ?? {})) {
    const v = data[field];
    if (v === undefined || v === null) continue;
    const ok = await db.prepare(`SELECT 1 AS ok FROM ${table} WHERE id = ? AND trip_id = ?`).bind(v, tripId).first();
    if (!ok) throw new ApiError('validation_failed', 'Verknüpfter Eintrag existiert nicht in dieser Reise', [{ path: field }]);
  }
}

export function insertStatement(
  db: D1Database,
  spec: EntitySpec,
  tripId: string,
  data: Row,
  extra: Record<string, unknown> = {},
): { id: string; stmt: D1PreparedStatement } {
  const id = (data.id as string | undefined) ?? uuid();
  const now = nowIso();
  const cols = ['id', 'trip_id', 'version', 'created_at', 'updated_at'];
  const vals: unknown[] = [id, tripId, 1, now, now];
  for (const [k, s] of Object.entries(spec.fields)) {
    const v = toDb(s.kind, data[k]);
    if (v !== undefined) {
      cols.push(s.col);
      vals.push(v);
    }
  }
  for (const [col, v] of Object.entries(extra)) {
    cols.push(col);
    vals.push(v);
  }
  const sql = `INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  return { id, stmt: db.prepare(sql).bind(...vals) };
}

export async function insertEntity<T>(
  db: D1Database,
  spec: EntitySpec,
  tripId: string,
  data: Row,
  extra: Record<string, unknown> = {},
): Promise<T> {
  await checkRefs(db, spec, tripId, data);
  const { id, stmt } = insertStatement(db, spec, tripId, data, extra);
  try {
    await stmt.run();
  } catch (e) {
    if (String(e).includes('UNIQUE constraint failed') && String(e).includes('.id')) {
      throw new ApiError('conflict', `${spec.label} existiert bereits`);
    }
    throw e;
  }
  return (await getEntity<T>(db, spec, tripId, id))!;
}

export type UpdateResult<T> =
  | { status: 'ok'; entity: T }
  | { status: 'not_found' }
  | { status: 'conflict'; entity: T };

/**
 * Optimistic-locking update: succeeds only when the stored version equals
 * `expectedVersion`. Otherwise the current server state is returned so the
 * client can resolve the conflict instead of silently overwriting it.
 */
export async function updateEntity<T>(
  db: D1Database,
  spec: EntitySpec,
  tripId: string,
  id: string,
  expectedVersion: number,
  patch: Row,
  extra: Record<string, unknown> = {},
): Promise<UpdateResult<T>> {
  await checkRefs(db, spec, tripId, patch);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, s] of Object.entries(spec.fields)) {
    const v = toDb(s.kind, patch[k]);
    if (v !== undefined) {
      sets.push(`${s.col} = ?`);
      vals.push(v);
    }
  }
  for (const [col, v] of Object.entries(extra)) {
    sets.push(`${col} = ?`);
    vals.push(v);
  }
  sets.push('version = version + 1', 'updated_at = ?');
  vals.push(nowIso());
  const res = await db
    .prepare(`UPDATE ${spec.table} SET ${sets.join(', ')} WHERE id = ? AND trip_id = ? AND version = ?`)
    .bind(...vals, id, tripId, expectedVersion)
    .run();
  const current = await getEntity<T>(db, spec, tripId, id);
  if (!current) return { status: 'not_found' };
  if (res.meta.changes === 0) return { status: 'conflict', entity: current };
  return { status: 'ok', entity: current };
}

export type DeleteResult<T> = { status: 'ok' } | { status: 'not_found' } | { status: 'conflict'; entity: T };

export async function deleteEntity<T>(
  db: D1Database,
  spec: EntitySpec,
  tripId: string,
  id: string,
  expectedVersion?: number,
): Promise<DeleteResult<T>> {
  const sql =
    expectedVersion === undefined
      ? `DELETE FROM ${spec.table} WHERE id = ? AND trip_id = ?`
      : `DELETE FROM ${spec.table} WHERE id = ? AND trip_id = ? AND version = ?`;
  const binds = expectedVersion === undefined ? [id, tripId] : [id, tripId, expectedVersion];
  const res = await db
    .prepare(sql)
    .bind(...binds)
    .run();
  if (res.meta.changes > 0) return { status: 'ok' };
  const current = await getEntity<T>(db, spec, tripId, id);
  if (!current) return { status: 'not_found' };
  return { status: 'conflict', entity: current };
}

/** Applies a new order (sort_order = index) for the given IDs within a trip. */
export async function reorderEntities(
  db: D1Database,
  spec: EntitySpec,
  tripId: string,
  orderedIds: string[],
  extraWhere = '',
  extraBinds: unknown[] = [],
): Promise<void> {
  const stmts = orderedIds.map((id, i) =>
    db
      .prepare(`UPDATE ${spec.table} SET sort_order = ? WHERE id = ? AND trip_id = ? ${extraWhere}`)
      .bind(i, id, tripId, ...extraBinds),
  );
  if (stmts.length) await db.batch(stmts);
}

export function unwrapUpdate<T>(r: UpdateResult<T>, label: string): T {
  if (r.status === 'not_found') throw new ApiError('not_found', `${label} nicht gefunden`);
  if (r.status === 'conflict') {
    throw new ApiError(
      'version_conflict',
      `${label} wurde inzwischen von jemand anderem geändert. Bitte prüfe die aktuelle Version.`,
      { current: r.entity },
    );
  }
  return r.entity;
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

export const destinationSpec: EntitySpec = {
  name: 'destination',
  label: 'Reiseziel',
  table: 'destinations',
  orderBy: 'sort_order, arrival_date',
  fields: {
    name: f('name'),
    country: f('country'),
    arrivalDate: f('arrival_date'),
    departureDate: f('departure_date'),
    timezone: f('timezone'),
    accommodationName: f('accommodation_name'),
    accommodationAddress: f('accommodation_address'),
    accommodationNotes: f('accommodation_notes'),
    lat: f('lat', 'real'),
    lng: f('lng', 'real'),
    notes: f('notes'),
    coverImageUrl: f('cover_image_url'),
  },
  readonly: { sortOrder: f('sort_order', 'int') },
};

export const placeSpec: EntitySpec = {
  name: 'place',
  label: 'Ort',
  table: 'saved_places',
  orderBy: 'favorite DESC, name COLLATE NOCASE',
  fields: {
    name: f('name'),
    category: f('category'),
    description: f('description'),
    address: f('address'),
    lat: f('lat', 'real'),
    lng: f('lng', 'real'),
    externalUrl: f('external_url'),
    notes: f('notes'),
    favorite: f('favorite', 'bool'),
    destinationId: f('destination_id'),
  },
  readonly: { createdBy: f('created_by') },
  refs: { destinationId: 'destinations' },
};

export const activitySpec: EntitySpec = {
  name: 'activity',
  label: 'Aktivität',
  table: 'activities',
  orderBy: 'date, sort_order, start_time',
  fields: {
    title: f('title'),
    description: f('description'),
    category: f('category'),
    date: f('date'),
    startTime: f('start_time'),
    endTime: f('end_time'),
    locationName: f('location_name'),
    lat: f('lat', 'real'),
    lng: f('lng', 'real'),
    estCostMinor: f('est_cost_minor', 'int'),
    currency: f('currency'),
    bookingStatus: f('booking_status'),
    completed: f('completed', 'bool'),
    notes: f('notes'),
    placeId: f('place_id'),
  },
  readonly: { sortOrder: f('sort_order', 'int'), createdBy: f('created_by'), updatedBy: f('updated_by') },
  refs: { placeId: 'saved_places' },
};

export const bookingSpec: EntitySpec = {
  name: 'booking',
  label: 'Buchung',
  table: 'bookings',
  orderBy: "COALESCE(start_date, '9999-12-31'), COALESCE(start_time, '99:99'), created_at",
  fields: {
    title: f('title'),
    type: f('type'),
    provider: f('provider'),
    reference: f('reference'),
    startDate: f('start_date'),
    startTime: f('start_time'),
    startTimezone: f('start_timezone'),
    endDate: f('end_date'),
    endTime: f('end_time'),
    endTimezone: f('end_timezone'),
    fromLocation: f('from_location'),
    toLocation: f('to_location'),
    location: f('location'),
    destinationId: f('destination_id'),
    fromDestinationId: f('from_destination_id'),
    toDestinationId: f('to_destination_id'),
    priceMinor: f('price_minor', 'int'),
    currency: f('currency'),
    personsCount: f('persons_count', 'int'),
    unitPriceMinor: f('unit_price_minor', 'int'),
    unitPriceNote: f('unit_price_note'),
    costKind: f('cost_kind'),
    bookingStatus: f('booking_status'),
    paymentStatus: f('payment_status'),
    paidByTravelerId: f('paid_by_traveler_id'),
    clarificationNote: f('clarification_note'),
    notes: f('notes'),
  },
  readonly: { createdBy: f('created_by'), expenseId: f('expense_id') },
  selectFrom: 'SELECT bookings.*, (SELECT e.id FROM expenses e WHERE e.booking_id = bookings.id) AS expense_id FROM bookings',
  refs: {
    destinationId: 'destinations',
    fromDestinationId: 'destinations',
    toDestinationId: 'destinations',
    paidByTravelerId: 'travelers',
  },
};

export const travelerSpec: EntitySpec = {
  name: 'traveler',
  label: 'Reisende:r',
  table: 'travelers',
  orderBy: 'sort_order, created_at',
  fields: { name: f('name'), color: f('color'), userId: f('user_id'), paypalMe: f('paypal_me'), iban: f('iban') },
  readonly: { sortOrder: f('sort_order', 'int') },
};
