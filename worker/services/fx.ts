/**
 * Automatic exchange rates: official ECB reference rates via the free
 * Frankfurter API (no key, no account). Stored per trip as rows with
 * source 'provider' and the ECB date. Existing expenses are never touched –
 * the rates are only used as suggestions for new entries and the converter.
 */
import { normalizeRate } from '../../shared/money';
import { addDaysToDate } from '../../shared/trip';
import { nowIso, uuid } from '../lib/util';

export const FX_API = 'https://api.frankfurter.dev/v1';

interface TripFx {
  id: string;
  base_currency: string;
  local_currency: string | null;
  start_date: string;
  end_date: string;
}

/** "1 THB = x EUR" from "1 EUR = y THB", 6 significant digits. */
export function invertRate(perBase: number): string | null {
  if (!Number.isFinite(perBase) || perBase <= 0) return null;
  const v = 1 / perBase;
  return normalizeRate(v.toPrecision(6).replace(/e.*$/, '')) ?? null;
}

/**
 * Fetches ECB rates for a date range (inclusive). Returns per date:
 * currency → rate in base currency per 1 unit of that currency.
 */
export async function fetchEcbRates(base: string, currencies: string[], from: string, to: string): Promise<Record<string, Record<string, string>>> {
  if (!currencies.length) return {};
  const url = from === to ? `${FX_API}/${from}?base=${base}&symbols=${currencies.join(',')}` : `${FX_API}/${from}..${to}?base=${base}&symbols=${currencies.join(',')}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Kursabruf fehlgeschlagen (${res.status})`);
  const body = (await res.json()) as { date?: string; rates?: Record<string, number> | Record<string, Record<string, number>> };
  const out: Record<string, Record<string, string>> = {};
  const add = (date: string, rates: Record<string, number>) => {
    for (const [cur, perBase] of Object.entries(rates)) {
      const r = invertRate(perBase);
      if (r) (out[date] ??= {})[cur] = r;
    }
  };
  if (body.rates && body.date && typeof Object.values(body.rates)[0] === 'number') add(body.date, body.rates as Record<string, number>);
  else for (const [date, rates] of Object.entries((body.rates ?? {}) as Record<string, Record<string, number>>)) add(date, rates);
  return out;
}

/** Foreign currencies of a trip: the local currency plus every currency already used. */
async function tripCurrencies(db: D1Database, trip: TripFx): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT currency FROM expenses WHERE trip_id = ?1 UNION SELECT currency FROM bookings WHERE trip_id = ?1 AND currency IS NOT NULL
       UNION SELECT currency FROM exchange_rates WHERE trip_id = ?1`,
    )
    .bind(trip.id)
    .all<{ currency: string }>();
  const set = new Set(results.map((r) => r.currency));
  if (trip.local_currency) set.add(trip.local_currency);
  set.delete(trip.base_currency);
  return [...set].filter((c) => /^[A-Z]{3}$/.test(c)).sort();
}

export interface FxRefreshResult {
  added: number;
  latestDate: string | null;
}

/**
 * Stores missing ECB rates for one trip, from the day after the last stored
 * provider rate (at most 10 days before the trip) up to today (capped at the
 * trip end). Manual rates and expenses stay untouched.
 */
export async function refreshTripRates(db: D1Database, tripId: string, today: string): Promise<FxRefreshResult> {
  const trip = await db
    .prepare('SELECT id, base_currency, local_currency, start_date, end_date FROM trips WHERE id = ?')
    .bind(tripId)
    .first<TripFx>();
  if (!trip) return { added: 0, latestDate: null };
  const currencies = await tripCurrencies(db, trip);
  if (!currencies.length) return { added: 0, latestDate: null };
  const to = today < trip.end_date ? today : trip.end_date;
  const last = await db
    .prepare("SELECT MAX(effective_date) AS d FROM exchange_rates WHERE trip_id = ? AND source = 'provider'")
    .bind(trip.id)
    .first<{ d: string | null }>();
  const earliest = addDaysToDate(trip.start_date, -10);
  let from = last?.d ? addDaysToDate(last.d, 1) : addDaysToDate(to, -7);
  if (from < earliest) from = earliest;
  if (from > to) return { added: 0, latestDate: last?.d ?? null };

  const byDate = await fetchEcbRates(trip.base_currency, currencies, from, to);
  const existing = await db
    .prepare("SELECT currency, effective_date FROM exchange_rates WHERE trip_id = ? AND source = 'provider' AND effective_date >= ?")
    .bind(trip.id, from)
    .all<{ currency: string; effective_date: string }>();
  const have = new Set(existing.results.map((r) => `${r.currency}|${r.effective_date}`));
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];
  let latest: string | null = last?.d ?? null;
  for (const [date, rates] of Object.entries(byDate)) {
    for (const [cur, rate] of Object.entries(rates)) {
      if (have.has(`${cur}|${date}`)) continue;
      stmts.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO exchange_rates (id, trip_id, currency, base_currency, rate, source, effective_date, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, 'provider', ?, NULL, ?)`,
          )
          .bind(uuid(), trip.id, cur, trip.base_currency, rate, date, now),
      );
    }
    if (!latest || date > latest) latest = date;
  }
  // INSERT OR IGNORE + unique index: a parallel refresh from another device never stores a day twice.
  const added = stmts.length ? (await db.batch(stmts)).reduce((n, r) => n + (r.meta?.changes ?? 0), 0) : 0;
  return { added, latestDate: latest };
}

/** Daily job: refresh every trip that is running (or starts within 10 days). */
export async function refreshActiveTrips(db: D1Database, today: string): Promise<number> {
  const { results } = await db
    .prepare('SELECT id FROM trips WHERE start_date <= ? AND end_date >= ?')
    .bind(addDaysToDate(today, 10), addDaysToDate(today, -1))
    .all<{ id: string }>();
  let added = 0;
  for (const r of results) {
    try {
      added += (await refreshTripRates(db, r.id, today)).added;
    } catch (e) {
      console.warn('fx refresh failed', r.id, String(e));
    }
  }
  return added;
}
