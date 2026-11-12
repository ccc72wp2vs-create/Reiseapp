import type { PlaceDto } from '../../shared/types';
import { ApiError } from '../lib/errors';
import { nowIso } from '../lib/util';

/** Adds the 👍 votes (traveler IDs) to each place. */
export async function attachVotes<T extends Omit<PlaceDto, 'votes'>>(db: D1Database, tripId: string, places: T[]): Promise<(T & { votes: string[] })[]> {
  const { results } = await db
    .prepare(
      `SELECT v.place_id, v.traveler_id FROM place_votes v
       JOIN saved_places p ON p.id = v.place_id
       WHERE p.trip_id = ? ORDER BY v.created_at`,
    )
    .bind(tripId)
    .all<{ place_id: string; traveler_id: string }>();
  const map = new Map<string, string[]>();
  for (const r of results) map.set(r.place_id, [...(map.get(r.place_id) ?? []), r.traveler_id]);
  return places.map((p) => ({ ...p, votes: map.get(p.id) ?? [] }));
}

/** Sets or removes the vote of the traveler linked to the user. */
export async function setVote(db: D1Database, tripId: string, userId: string, placeId: string, vote: boolean): Promise<string[]> {
  const place = await db.prepare('SELECT id FROM saved_places WHERE id = ? AND trip_id = ?').bind(placeId, tripId).first();
  if (!place) throw new ApiError('not_found', 'Ort nicht gefunden');
  const traveler = await db
    .prepare('SELECT id FROM travelers WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, userId)
    .first<{ id: string }>();
  if (!traveler) throw new ApiError('forbidden', 'Abstimmen geht erst, wenn dein Konto mit einer reisenden Person verknüpft ist.');
  if (vote) {
    await db
      .prepare('INSERT OR IGNORE INTO place_votes (place_id, traveler_id, created_at) VALUES (?, ?, ?)')
      .bind(placeId, traveler.id, nowIso())
      .run();
  } else {
    await db.prepare('DELETE FROM place_votes WHERE place_id = ? AND traveler_id = ?').bind(placeId, traveler.id).run();
  }
  const { results } = await db
    .prepare('SELECT traveler_id FROM place_votes WHERE place_id = ? ORDER BY created_at')
    .bind(placeId)
    .all<{ traveler_id: string }>();
  return results.map((r) => r.traveler_id);
}
