/**
 * Idempotent import of seed datasets into D1.
 * The whole trip is written in one atomic batch. A unique index on
 * (created_by, import_key) guarantees that repeated or concurrent imports
 * never create duplicates.
 */
import { TRAVELER_COLORS } from '../../shared/constants';
import { computeShares } from '../../shared/finance';
import { convertMinor } from '../../shared/money';
import { ApiError } from '../lib/errors';
import { nowIso, uuid } from '../lib/util';
import type { SeedTrip } from './seedData';
import { createTripStatements } from './trips';

export async function findImportedTrip(db: D1Database, userId: string, importKey: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT t.id FROM trips t JOIN trip_members m ON m.trip_id = t.id
       WHERE m.user_id = ? AND t.import_key = ? LIMIT 1`,
    )
    .bind(userId, importKey)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function importSeedTrip(
  db: D1Database,
  user: { id: string; displayName: string },
  seed: SeedTrip,
): Promise<{ tripId: string; created: boolean }> {
  const existing = await findImportedTrip(db, user.id, seed.importKey);
  if (existing) return { tripId: existing, created: false };

  const now = nowIso();
  const { tripId, ownerTravelerId, stmts } = createTripStatements(db, user, seed.trip, {
    importKey: seed.importKey,
    isDemo: seed.isDemo,
  });

  const travelerIds = [ownerTravelerId];
  seed.travelers.forEach((name, i) => {
    const id = uuid();
    travelerIds.push(id);
    stmts.push(
      db
        .prepare(
          `INSERT INTO travelers (id, trip_id, name, user_id, color, sort_order, version, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, ?, 1, ?, ?)`,
        )
        .bind(id, tripId, name, TRAVELER_COLORS[(i + 1) % TRAVELER_COLORS.length], i + 1, now, now),
    );
  });

  const destIds = new Map<string, string>();
  seed.destinations.forEach((d, i) => {
    const id = uuid();
    destIds.set(d.key, id);
    stmts.push(
      db
        .prepare(
          `INSERT INTO destinations (id, trip_id, name, country, arrival_date, departure_date, timezone,
             accommodation_name, accommodation_notes, lat, lng, notes, sort_order, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          id,
          tripId,
          d.name,
          d.country,
          d.arrivalDate,
          d.departureDate,
          d.timezone,
          d.accommodationName,
          d.accommodationNotes,
          d.lat,
          d.lng,
          d.notes,
          i,
          now,
          now,
        ),
    );
  });
  const dest = (key: string | null | undefined) => (key ? (destIds.get(key) ?? null) : null);

  for (const b of seed.bookings) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO bookings (id, trip_id, title, type, provider, reference, start_date, start_time, start_timezone,
             end_date, end_time, end_timezone, from_location, to_location, location, destination_id,
             from_destination_id, to_destination_id, price_minor, currency, persons_count, unit_price_minor,
             unit_price_note, cost_kind, booking_status, payment_status, clarification_note, notes, import_ref,
             created_by, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          uuid(),
          tripId,
          b.title,
          b.type,
          b.provider ?? null,
          b.startDate,
          b.startTime,
          b.startTimezone,
          b.endDate,
          b.endTime,
          b.endTimezone,
          b.fromLocation,
          b.toLocation,
          b.location ?? null,
          dest(b.destination),
          dest(b.from),
          dest(b.to),
          b.priceMinor,
          b.currency,
          b.personsCount,
          b.unitPriceMinor ?? null,
          b.unitPriceNote ?? null,
          b.costKind,
          b.bookingStatus,
          b.paymentStatus,
          b.clarificationNote,
          b.notes,
          b.ref,
          user.id,
          now,
          now,
        ),
    );
  }

  const placeIds = new Map<string, string>();
  for (const p of seed.places) {
    const id = uuid();
    placeIds.set(p.key, id);
    stmts.push(
      db
        .prepare(
          `INSERT INTO saved_places (id, trip_id, name, category, description, address, lat, lng, favorite,
             destination_id, created_by, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(id, tripId, p.name, p.category, p.description, p.address, p.lat, p.lng, p.favorite ? 1 : 0, dest(p.destination), user.id, now, now),
    );
  }

  const perDay = new Map<string, number>();
  for (const a of seed.activities) {
    const order = perDay.get(a.date) ?? 0;
    perDay.set(a.date, order + 1);
    stmts.push(
      db
        .prepare(
          `INSERT INTO activities (id, trip_id, title, description, category, date, start_time, end_time, location_name,
             lat, lng, est_cost_minor, currency, booking_status, completed, place_id, sort_order, created_by, updated_by,
             version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          uuid(),
          tripId,
          a.title,
          a.description ?? null,
          a.category,
          a.date,
          a.startTime ?? null,
          a.endTime ?? null,
          a.locationName ?? null,
          a.lat ?? null,
          a.lng ?? null,
          a.estCostMinor ?? null,
          a.currency ?? null,
          a.bookingStatus ?? 'planned',
          a.place ? (placeIds.get(a.place) ?? null) : null,
          order,
          user.id,
          user.id,
          now,
          now,
        ),
    );
  }

  for (const r of seed.exchangeRates) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO exchange_rates (id, trip_id, currency, base_currency, rate, source, effective_date, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?)`,
        )
        .bind(uuid(), tripId, r.currency, seed.trip.baseCurrency, r.rate, r.effectiveDate, user.id, now),
    );
  }

  for (const e of seed.expenses) {
    const rate = e.currency === seed.trip.baseCurrency ? '1' : seed.exchangeRates.find((r) => r.currency === e.currency)?.rate;
    if (!rate) throw new Error(`Seed expense without rate: ${e.title}`);
    const base = convertMinor(e.amountMinor, e.currency, seed.trip.baseCurrency, rate);
    const shares = computeShares(
      e.amountMinor,
      base,
      'equal',
      e.participants.map((i) => ({ travelerId: travelerIds[i] })),
    );
    const id = uuid();
    stmts.push(
      db
        .prepare(
          `INSERT INTO expenses (id, trip_id, title, amount_minor, currency, date, category, paid_by_traveler_id,
             split_method, fx_rate, fx_source, fx_date, base_amount_minor, notes, created_by, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'equal', ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          id,
          tripId,
          e.title,
          e.amountMinor,
          e.currency,
          e.date,
          e.category,
          travelerIds[e.paidBy],
          rate,
          e.currency === seed.trip.baseCurrency ? 'identity' : 'cached',
          e.currency === seed.trip.baseCurrency ? null : seed.exchangeRates.find((r) => r.currency === e.currency)!.effectiveDate,
          base,
          e.notes ?? (seed.isDemo ? 'Demo-Daten' : null),
          user.id,
          now,
          now,
        ),
      ...shares.map((s) =>
        db
          .prepare(
            'INSERT INTO expense_splits (expense_id, traveler_id, share_minor, base_share_minor, weight) VALUES (?, ?, ?, ?, NULL)',
          )
          .bind(id, s.travelerId, s.shareMinor, s.baseShareMinor),
      ),
    );
  }

  try {
    await db.batch(stmts);
  } catch (e) {
    // A concurrent import may have won the race – return its result.
    if (String(e).includes('UNIQUE')) {
      const again = await findImportedTrip(db, user.id, seed.importKey);
      if (again) return { tripId: again, created: false };
    }
    throw e;
  }
  return { tripId, created: true };
}

export async function deleteDemoTrips(db: D1Database, userId: string): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT t.id FROM trips t JOIN trip_members m ON m.trip_id = t.id
       WHERE m.user_id = ? AND m.role = 'owner' AND t.is_demo = 1`,
    )
    .bind(userId)
    .all<{ id: string }>();
  if (!results.length) return 0;
  await db.batch(results.map((r) => db.prepare('DELETE FROM trips WHERE id = ? AND is_demo = 1').bind(r.id)));
  return results.length;
}

export function assertSeedKey(key: string): void {
  if (!/^[a-z0-9-]{1,40}$/.test(key)) throw new ApiError('bad_request', 'Ungültiger Import');
}
