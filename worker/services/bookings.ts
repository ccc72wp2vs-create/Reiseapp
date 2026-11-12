/** Booking participants (booking_travelers), always scoped to the trip. */
import type { BookingDto } from '../../shared/types';
import { ApiError } from '../lib/errors';

export async function attachTravelers<T extends Omit<BookingDto, 'travelerIds'>>(
  db: D1Database,
  tripId: string,
  bookings: T[],
): Promise<(T & { travelerIds: string[] })[]> {
  const { results } = await db
    .prepare(
      `SELECT bt.booking_id, bt.traveler_id FROM booking_travelers bt
       JOIN bookings b ON b.id = bt.booking_id
       JOIN travelers t ON t.id = bt.traveler_id
       WHERE b.trip_id = ? ORDER BY t.sort_order, t.created_at`,
    )
    .bind(tripId)
    .all<{ booking_id: string; traveler_id: string }>();
  const map = new Map<string, string[]>();
  for (const r of results) map.set(r.booking_id, [...(map.get(r.booking_id) ?? []), r.traveler_id]);
  return bookings.map((b) => ({ ...b, travelerIds: map.get(b.id) ?? [] }));
}

export async function attachTravelersOne<T extends Omit<BookingDto, 'travelerIds'>>(db: D1Database, tripId: string, booking: T) {
  return (await attachTravelers(db, tripId, [booking]))[0];
}

/** Replaces the participants of a booking. IDs must belong to the trip. */
export async function setBookingTravelers(db: D1Database, tripId: string, bookingId: string, travelerIds: string[]) {
  const unique = [...new Set(travelerIds)];
  if (unique.length) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM travelers WHERE trip_id = ? AND id IN (${unique.map(() => '?').join(', ')})`)
      .bind(tripId, ...unique)
      .first<{ n: number }>();
    if ((row?.n ?? 0) !== unique.length) throw new ApiError('validation_failed', 'Unbekannte Person in dieser Reise');
  }
  await db.batch([
    db.prepare('DELETE FROM booking_travelers WHERE booking_id = ?').bind(bookingId),
    ...unique.map((t) => db.prepare('INSERT INTO booking_travelers (booking_id, traveler_id) VALUES (?, ?)').bind(bookingId, t)),
  ]);
}
