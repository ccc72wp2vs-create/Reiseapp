/**
 * Fixed-window rate limiter backed by D1. Keys are hashed so that no IP
 * addresses or e-mail addresses are stored in clear text.
 */
import { ApiError } from '../lib/errors';
import { sha256Hex } from '../lib/util';

const LIMITED = 'Zu viele Versuche. Bitte später erneut versuchen.';

export async function hitRateLimit(db: D1Database, rawKey: string, limit: number, windowSeconds: number) {
  const key = await sha256Hex(rawKey);
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start <= ?2 - ?3 THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start <= ?2 - ?3 THEN ?2 ELSE rate_limits.window_start END
       RETURNING count`,
    )
    .bind(key, now, windowSeconds)
    .first<{ count: number }>();
  if ((row?.count ?? 1) > limit) throw new ApiError('rate_limited', LIMITED);
}

export async function peekRateLimit(db: D1Database, rawKey: string, limit: number, windowSeconds: number) {
  const key = await sha256Hex(rawKey);
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare('SELECT window_start, count FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<{ window_start: number; count: number }>();
  if (row && row.window_start > now - windowSeconds && row.count >= limit) {
    throw new ApiError('rate_limited', LIMITED);
  }
}

export async function resetRateLimit(db: D1Database, rawKey: string): Promise<void> {
  await db
    .prepare('DELETE FROM rate_limits WHERE key = ?')
    .bind(await sha256Hex(rawKey))
    .run();
}
