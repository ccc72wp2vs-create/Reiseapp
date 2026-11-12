import { TRAVELER_COLORS, type Role } from '../../shared/constants';
import type { MemberDto, TripDto, TripSnapshot, TripSummaryDto } from '../../shared/types';
import {
  activitySpec,
  bookingSpec,
  destinationSpec,
  listEntities,
  placeSpec,
  travelerSpec,
} from '../db/entity';
import { nowIso, uuid } from '../lib/util';
import { listExchangeRates, listExpenses, listSettlements } from './wallet';
import { listVisiblePacking } from './packing';

type Row = Record<string, unknown>;

export function tripRowToDto(row: Row, role: Role): TripDto {
  return {
    id: row.id as string,
    version: row.version as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    name: row.name as string,
    destinationCountry: (row.destination_country as string) ?? null,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    coverImageUrl: (row.cover_image_url as string) ?? null,
    baseCurrency: row.base_currency as string,
    localCurrency: (row.local_currency as string) ?? null,
    description: (row.description as string) ?? null,
    status: row.status as TripDto['status'],
    archivedAt: (row.archived_at as string) ?? null,
    originName: (row.origin_name as string) ?? null,
    originLat: (row.origin_lat as number) ?? null,
    originLng: (row.origin_lng as number) ?? null,
    homeTimezone: row.home_timezone as string,
    importKey: (row.import_key as string) ?? null,
    isDemo: row.is_demo === 1,
    role,
  };
}

export const TRIP_COLUMNS: Record<string, string> = {
  name: 'name',
  destinationCountry: 'destination_country',
  startDate: 'start_date',
  endDate: 'end_date',
  coverImageUrl: 'cover_image_url',
  baseCurrency: 'base_currency',
  localCurrency: 'local_currency',
  description: 'description',
  status: 'status',
  originName: 'origin_name',
  originLat: 'origin_lat',
  originLng: 'origin_lng',
  homeTimezone: 'home_timezone',
};

export async function listTripsForUser(db: D1Database, userId: string): Promise<TripSummaryDto[]> {
  const { results } = await db
    .prepare(
      `SELECT t.*, m.role,
         (SELECT COUNT(*) FROM destinations d WHERE d.trip_id = t.id) AS destination_count,
         (SELECT COUNT(*) FROM travelers tr WHERE tr.trip_id = t.id) AS traveler_count
       FROM trips t JOIN trip_members m ON m.trip_id = t.id
       WHERE m.user_id = ?
       ORDER BY t.archived_at IS NOT NULL, t.start_date`,
    )
    .bind(userId)
    .all<Row>();
  return results.map((r) => ({
    ...tripRowToDto(r, r.role as Role),
    destinationCount: r.destination_count as number,
    travelerCount: r.traveler_count as number,
  }));
}

export async function getTripDto(db: D1Database, tripId: string, role: Role): Promise<TripDto | null> {
  const row = await db.prepare('SELECT * FROM trips WHERE id = ?').bind(tripId).first<Row>();
  return row ? tripRowToDto(row, role) : null;
}

export interface NewTripInput {
  name: string;
  destinationCountry?: string | null;
  startDate: string;
  endDate: string;
  coverImageUrl?: string | null;
  baseCurrency: string;
  localCurrency?: string | null;
  description?: string | null;
  status: string;
  originName?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  homeTimezone: string;
}

/**
 * Builds the statements that create a trip, the owner's membership and the
 * owner's traveler record. Returned (not executed) so imports can run them in
 * one atomic batch together with their child rows.
 */
export function createTripStatements(
  db: D1Database,
  owner: { id: string; displayName: string },
  input: NewTripInput,
  opts: { id?: string; importKey?: string | null; isDemo?: boolean; ownerTravelerId?: string } = {},
): { tripId: string; ownerTravelerId: string; stmts: D1PreparedStatement[] } {
  const tripId = opts.id ?? uuid();
  const ownerTravelerId = opts.ownerTravelerId ?? uuid();
  const now = nowIso();
  const stmts = [
    db
      .prepare(
        `INSERT INTO trips (id, name, destination_country, start_date, end_date, cover_image_url, base_currency,
           local_currency, description, status, origin_name, origin_lat, origin_lng, home_timezone, import_key,
           is_demo, created_by, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        tripId,
        input.name,
        input.destinationCountry ?? null,
        input.startDate,
        input.endDate,
        input.coverImageUrl ?? null,
        input.baseCurrency,
        input.localCurrency ?? null,
        input.description ?? null,
        input.status,
        input.originName ?? null,
        input.originLat ?? null,
        input.originLng ?? null,
        input.homeTimezone,
        opts.importKey ?? null,
        opts.isDemo ? 1 : 0,
        owner.id,
        now,
        now,
      ),
    db
      .prepare('INSERT INTO trip_members (trip_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
      .bind(tripId, owner.id, 'owner', now),
    db
      .prepare(
        `INSERT INTO travelers (id, trip_id, name, user_id, color, sort_order, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      )
      .bind(ownerTravelerId, tripId, owner.displayName, owner.id, TRAVELER_COLORS[0], now, now),
  ];
  return { tripId, ownerTravelerId, stmts };
}

export async function listMembers(db: D1Database, tripId: string): Promise<MemberDto[]> {
  const { results } = await db
    .prepare(
      `SELECT m.user_id, m.role, m.created_at, u.display_name, u.email
       FROM trip_members m JOIN users u ON u.id = m.user_id
       WHERE m.trip_id = ? ORDER BY m.created_at`,
    )
    .bind(tripId)
    .all<Row>();
  return results.map((r) => ({
    userId: r.user_id as string,
    role: r.role as Role,
    createdAt: r.created_at as string,
    displayName: r.display_name as string,
    email: r.email as string,
  }));
}

export async function buildSnapshot(
  db: D1Database,
  tripId: string,
  role: Role,
  userId: string,
): Promise<TripSnapshot | null> {
  const trip = await getTripDto(db, tripId, role);
  if (!trip) return null;
  const [members, travelers, destinations, activities, places, bookings, expenses, settlements, exchangeRates, packing] =
    await Promise.all([
      listMembers(db, tripId),
      listEntities<TripSnapshot['travelers'][number]>(db, travelerSpec, tripId),
      listEntities<TripSnapshot['destinations'][number]>(db, destinationSpec, tripId),
      listEntities<TripSnapshot['activities'][number]>(db, activitySpec, tripId),
      listEntities<TripSnapshot['places'][number]>(db, placeSpec, tripId),
      listEntities<TripSnapshot['bookings'][number]>(db, bookingSpec, tripId),
      listExpenses(db, tripId),
      listSettlements(db, tripId),
      listExchangeRates(db, tripId),
      listVisiblePacking(db, tripId, userId),
    ]);
  return {
    trip,
    members,
    travelers,
    destinations,
    activities,
    places,
    bookings,
    expenses,
    settlements,
    exchangeRates,
    packingLists: packing.lists,
    packingItems: packing.items,
    syncedAt: nowIso(),
  };
}

export async function audit(
  db: D1Database,
  entry: { tripId: string | null; userId: string | null; entity: string; entityId: string; action: string; summary?: string },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO audit_log (id, trip_id, user_id, entity, entity_id, action, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(uuid(), entry.tripId, entry.userId, entry.entity, entry.entityId, entry.action, entry.summary ?? null, nowIso())
    .run();
}
