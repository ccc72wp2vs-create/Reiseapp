/**
 * Geoapify (OpenStreetMap data) – place search and real travel times without
 * a credit card (free plan: 3,000 credits per day).
 *
 *  - Places API: 1 request ≈ 1 credit.
 *  - Route Matrix: credits = max(sources, targets) × min(sources, targets, 10)
 *    → one origin and n targets costs n credits.
 *  - Routing: 1 credit.
 * Every call is counted per day in D1 and stops at an internal limit below the
 * free plan. Data is OpenStreetMap (ODbL): attribution "© OpenStreetMap
 * contributors" and "Powered by Geoapify" is shown wherever results appear.
 * The key stays on the server; nothing is logged except status codes.
 */
import { categoryByKey, type NearbyResponse, type NearbyResult, type OsmPlace, type TravelMode } from '../../shared/google';
import type { Env } from '../env';
import { ApiError } from '../lib/errors';

const BASE = 'https://api.geoapify.com';
const SKU = 'geoapify.credits';

export function geoapifyConfig(env: Env) {
  const n = Number(env.GEOAPIFY_DAILY_CREDITS);
  return {
    key: env.GEOAPIFY_KEY?.trim() || null,
    /** Internal daily credit limit (free plan has 3,000). */
    dailyCredits: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2500,
  };
}

export const day = (now = new Date()) => now.toISOString().slice(0, 10);

/** Atomically reserves credits for today; false when the daily limit would be exceeded. */
export async function reserveCredits(db: D1Database, credits: number, limit: number): Promise<boolean> {
  if (credits <= 0) return true;
  if (credits > limit) return false;
  const row = await db
    .prepare(
      `INSERT INTO google_usage (month, sku, count) VALUES (?, ?, ?)
       ON CONFLICT (month, sku) DO UPDATE SET count = count + excluded.count
       WHERE google_usage.count + excluded.count <= ?
       RETURNING count`,
    )
    .bind(day(), SKU, credits, limit)
    .first<{ count: number }>();
  return !!row;
}

export async function creditsUsedToday(db: D1Database): Promise<number> {
  const r = await db.prepare('SELECT count FROM google_usage WHERE month = ? AND sku = ?').bind(day(), SKU).first<{ count: number }>();
  return r?.count ?? 0;
}

function requireKey(env: Env): string {
  const key = geoapifyConfig(env).key;
  if (!key) throw new ApiError('service_unavailable', 'Die Ortssuche ist noch nicht eingerichtet.');
  return key;
}

async function spend(env: Env, credits: number) {
  if (!(await reserveCredits(env.DB, credits, geoapifyConfig(env).dailyCredits))) {
    throw new ApiError('rate_limited', 'Das Tageslimit der Ortssuche ist erreicht – morgen geht es wieder. Gespeicherte Orte funktionieren weiterhin.');
  }
}

function logFailure(what: string, status: number | string) {
  console.error(JSON.stringify({ level: 'warn', msg: `geoapify ${what} failed`, status }));
}

const geoMode = (m: TravelMode) => (m === 'WALK' ? 'walk' : m === 'BICYCLE' ? 'bicycle' : 'drive');
const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const url = (v: unknown) => {
  const s = str(v, 300);
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    return new URL(withScheme).protocol.startsWith('http') ? withScheme : null;
  } catch {
    return null;
  }
};

const CATEGORY_DE: [RegExp, string][] = [
  [/^catering\.restaurant/, 'Restaurant'],
  [/^catering\.cafe/, 'Café'],
  [/^catering\.(bar|pub)/, 'Bar'],
  [/^adult\.nightclub/, 'Club'],
  [/^beach/, 'Strand'],
  [/^religion/, 'Tempel / religiöser Ort'],
  [/viewpoint/, 'Aussichtspunkt'],
  [/^tourism\.(sights|attraction)/, 'Sehenswürdigkeit'],
  [/^(natural|national_park)/, 'Natur'],
  [/^leisure\.park/, 'Park'],
  [/^commercial\.marketplace/, 'Markt'],
  [/^commercial/, 'Shopping'],
  [/^(activity|entertainment|leisure)/, 'Aktivität'],
];

type Feature = { properties?: Record<string, unknown> };

export function toOsmPlace(f: Feature): OsmPlace | null {
  const p = f.properties ?? {};
  const raw = ((p.datasource as { raw?: Record<string, unknown> } | undefined)?.raw ?? {}) as Record<string, unknown>;
  const name = str(p.name, 160) ?? str(raw['name:de'], 160) ?? str(raw['name:en'], 160);
  const lat = Number(p.lat);
  const lng = Number(p.lon);
  const id = str(p.place_id, 300);
  if (!name || !id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cats = Array.isArray(p.categories) ? (p.categories as string[]) : [];
  const label = CATEGORY_DE.find(([re]) => cats.some((c) => re.test(c)))?.[1] ?? null;
  const address = str(p.address_line2, 200) ?? str(p.formatted, 200);
  return {
    id,
    name,
    address,
    lat,
    lng,
    categoryLabel: label,
    openingHours: str(p.opening_hours, 200) ?? str(raw.opening_hours, 200),
    website: url(p.website) ?? url(raw.website) ?? url(raw['contact:website']),
    cuisine: str(raw.cuisine, 80)?.replace(/;/g, ', ') ?? null,
  };
}

// ---------------------------------------------------------------------------

export async function searchPlaces(
  env: Env,
  args: { categories: string; center: { lat: number; lng: number }; radiusM: number; limit: number; name?: string | null },
): Promise<OsmPlace[]> {
  const key = requireKey(env);
  await spend(env, 1);
  const q = new URLSearchParams({
    categories: args.categories,
    filter: `circle:${args.center.lng},${args.center.lat},${Math.round(Math.min(Math.max(args.radiusM, 300), 50_000))}`,
    bias: `proximity:${args.center.lng},${args.center.lat}`,
    limit: String(Math.max(1, Math.min(args.limit, 20))),
    lang: 'de',
    apiKey: key,
  });
  if (args.name) q.set('name', args.name);
  const res = await fetch(`${BASE}/v2/places?${q}`);
  if (!res.ok) {
    logFailure('places', res.status);
    throw new ApiError('service_unavailable', 'Die Ortssuche ist gerade nicht erreichbar.');
  }
  const data = (await res.json()) as { features?: Feature[] };
  const seen = new Set<string>();
  return (data.features ?? [])
    .map(toOsmPlace)
    .filter((p): p is OsmPlace => !!p && !seen.has(p.name.toLowerCase()) && !!seen.add(p.name.toLowerCase()));
}

export async function routeMatrix(
  env: Env,
  origin: { lat: number; lng: number },
  targets: { lat: number; lng: number }[],
  mode: TravelMode,
): Promise<{ status: 'ok' | 'unavailable' | 'limit'; items: ({ durationSec: number; distanceMeters: number } | null)[] }> {
  const key = geoapifyConfig(env).key;
  if (!key || !targets.length) return { status: 'unavailable', items: [] };
  if (!(await reserveCredits(env.DB, targets.length, geoapifyConfig(env).dailyCredits))) return { status: 'limit', items: [] };
  try {
    const res = await fetch(`${BASE}/v1/routematrix?apiKey=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: geoMode(mode), sources: [{ location: [origin.lng, origin.lat] }], targets: targets.map((t) => ({ location: [t.lng, t.lat] })) }),
    });
    if (!res.ok) {
      logFailure('route matrix', res.status);
      return { status: 'unavailable', items: [] };
    }
    const data = (await res.json()) as { sources_to_targets?: ({ distance?: number; time?: number; target_index?: number } | null)[][] };
    const row = data.sources_to_targets?.[0] ?? [];
    const items = targets.map((_, i) => {
      const cell = row.find((c) => c?.target_index === i) ?? row[i] ?? null;
      return cell && typeof cell.time === 'number' && typeof cell.distance === 'number' ? { durationSec: Math.round(cell.time), distanceMeters: Math.round(cell.distance) } : null;
    });
    return { status: 'ok', items };
  } catch (e) {
    logFailure('route matrix', e instanceof Error ? e.name : 'unknown');
    return { status: 'unavailable', items: [] };
  }
}

export async function route(env: Env, from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode: TravelMode): Promise<{ durationSec: number; distanceMeters: number } | 'no_route'> {
  const key = requireKey(env);
  await spend(env, 1);
  const q = new URLSearchParams({ waypoints: `${from.lat},${from.lng}|${to.lat},${to.lng}`, mode: geoMode(mode), apiKey: key });
  const res = await fetch(`${BASE}/v1/routing?${q}`);
  if (res.status === 400) return 'no_route';
  if (!res.ok) {
    logFailure('routing', res.status);
    throw new ApiError('service_unavailable', 'Die Routenberechnung ist gerade nicht erreichbar.');
  }
  const data = (await res.json()) as { features?: { properties?: { time?: number; distance?: number } }[] };
  const p = data.features?.[0]?.properties;
  if (!p || typeof p.time !== 'number' || typeof p.distance !== 'number') return 'no_route';
  return { durationSec: Math.round(p.time), distanceMeters: Math.round(p.distance) };
}

/** Category search + real travel times, filtered by routing results only. */
export async function nearby(
  env: Env,
  args: { category: string | null; query: string | null; origin: { lat: number; lng: number; label: string }; mode: TravelMode; maxMinutes: number | null; limit: number },
): Promise<NearbyResponse> {
  const cat = categoryByKey(args.category);
  const radiusM = args.maxMinutes ? Math.min(args.maxMinutes * (args.mode === 'WALK' ? 90 : args.mode === 'BICYCLE' ? 300 : 900), 50_000) : 10_000;
  const want = Math.min(args.maxMinutes ? args.limit + 4 : args.limit, 10);
  const places = await searchPlaces(env, {
    categories: cat?.geo ?? 'tourism,catering,leisure,entertainment',
    center: args.origin,
    radiusM,
    limit: want,
    name: cat ? null : args.query,
  });
  const matrix = await routeMatrix(env, args.origin, places, args.mode);
  let results: NearbyResult[] = places.map((p, i) => {
    const m = matrix.items[i] ?? null;
    return { placeId: `osm:${p.id}`, place: p, durationSec: m?.durationSec ?? null, distanceMeters: m?.distanceMeters ?? null, noRoute: matrix.status === 'ok' && !m };
  });
  let filteredOut = 0;
  if (matrix.status === 'ok') {
    results.sort((a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity));
    if (args.maxMinutes) {
      const keep = results.filter((r) => r.durationSec != null && r.durationSec <= args.maxMinutes! * 60);
      filteredOut = results.length - keep.length;
      results = keep;
    }
  }
  return { provider: 'geoapify', origin: args.origin, mode: args.mode, results: results.slice(0, args.limit), routing: matrix.status, filteredOut };
}
