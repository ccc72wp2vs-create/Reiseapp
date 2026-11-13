/**
 * Google Maps Platform – server side (keys stay on the server).
 *
 *  - Places API (New) Text Search with field mask `places.id` only
 *    ("Text Search Essentials IDs Only"): no Google content leaves Google
 *    except place IDs, which may be stored and used with any map.
 *  - Routes API Compute Route Matrix / Compute Routes (Essentials, no traffic):
 *    only distance + duration, never route descriptions or steps.
 *  - Every call is counted per month and SKU in D1 and stops at configurable
 *    internal limits below Google's free monthly caps.
 *  - Nothing is cached or logged except the counters.
 */
import type { NearbyResponse, NearbyResult, TravelMode } from '../../shared/google';
import type { Env } from '../env';
import { ApiError } from '../lib/errors';

export const SKU = {
  textSearchIds: 'places.textsearch.ids',
  routeMatrix: 'routes.matrix.essentials',
  routes: 'routes.compute.essentials',
  uiKit: 'places.uikit.query',
} as const;
type Sku = (typeof SKU)[keyof typeof SKU];

/** Internal monthly limits (defaults stay below Google's free caps). */
export function googleConfig(env: Env) {
  const int = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
  };
  return {
    serverKey: env.GOOGLE_MAPS_SERVER_KEY?.trim() || null,
    browserKey: env.GOOGLE_MAPS_BROWSER_KEY?.trim() || null,
    limits: {
      // IDs-only text search is listed without a paid tier; we still cap it.
      [SKU.textSearchIds]: int(env.GOOGLE_LIMIT_SEARCHES, 3000),
      // Free cap 10,000 elements/month → stay at 8,000.
      [SKU.routeMatrix]: int(env.GOOGLE_LIMIT_ROUTE_ELEMENTS, 8000),
      // Free cap 10,000 requests/month → stay at 4,000.
      [SKU.routes]: int(env.GOOGLE_LIMIT_ROUTES, 4000),
      // Places UI Kit (Essentials) free cap 10,000/month → stay at 8,000.
      [SKU.uiKit]: int(env.GOOGLE_LIMIT_UI_LOADS, 8000),
    } as Record<Sku, number>,
  };
}

export const month = (now = new Date()) => now.toISOString().slice(0, 7);

/** Atomically reserves `n` units; false when the monthly limit would be exceeded. */
export async function reserve(db: D1Database, sku: Sku, n: number, limit: number): Promise<boolean> {
  if (n <= 0) return true;
  if (n > limit) return false;
  const row = await db
    .prepare(
      `INSERT INTO google_usage (month, sku, count) VALUES (?, ?, ?)
       ON CONFLICT (month, sku) DO UPDATE SET count = count + excluded.count
       WHERE google_usage.count + excluded.count <= ?
       RETURNING count`,
    )
    .bind(month(), sku, n, limit)
    .first<{ count: number }>();
  return !!row;
}

export async function usage(db: D1Database, env: Env) {
  const { limits } = googleConfig(env);
  const rows = await db.prepare('SELECT sku, count FROM google_usage WHERE month = ?').bind(month()).all<{ sku: string; count: number }>();
  return Object.entries(limits).map(([sku, limit]) => ({ sku, limit, used: rows.results.find((r) => r.sku === sku)?.count ?? 0 }));
}

function requireKey(env: Env): string {
  const key = googleConfig(env).serverKey;
  if (!key) throw new ApiError('service_unavailable', 'Google Maps ist noch nicht eingerichtet.');
  return key;
}

function logFailure(what: string, status: number | string) {
  // Status only – never request or response bodies.
  console.error(JSON.stringify({ level: 'warn', msg: `google ${what} failed`, status }));
}

// ---------------------------------------------------------------------------
// Places: IDs only
// ---------------------------------------------------------------------------

export async function searchPlaceIds(
  env: Env,
  args: { query: string; type: string | null; center: { lat: number; lng: number }; radiusM: number; max: number },
): Promise<string[]> {
  const key = requireKey(env);
  if (!(await reserve(env.DB, SKU.textSearchIds, 1, googleConfig(env).limits[SKU.textSearchIds]))) {
    throw new ApiError('rate_limited', 'Das Monatslimit für Google-Suchen ist erreicht. Gespeicherte Orte funktionieren weiterhin.');
  }
  const body: Record<string, unknown> = {
    textQuery: args.query,
    pageSize: Math.max(1, Math.min(args.max, 10)),
    languageCode: 'de',
    locationBias: { circle: { center: { latitude: args.center.lat, longitude: args.center.lng }, radius: Math.min(Math.max(args.radiusM, 500), 50_000) } },
  };
  if (args.type) {
    body.includedType = args.type;
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    logFailure('text search', res.status);
    throw new ApiError('service_unavailable', 'Die Google-Suche ist gerade nicht erreichbar.');
  }
  const data = (await res.json()) as { places?: { id?: string }[] };
  return (data.places ?? []).map((p) => p.id).filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{10,300}$/.test(id));
}

// ---------------------------------------------------------------------------
// Routes: distance + duration only
// ---------------------------------------------------------------------------

const seconds = (d: unknown) => (typeof d === 'string' && /^\d+(\.\d+)?s$/.test(d) ? Math.round(Number(d.slice(0, -1))) : null);

function modeBody(mode: TravelMode) {
  // TRAFFIC_UNAWARE keeps DRIVE requests in the Essentials SKU.
  return mode === 'DRIVE' ? { travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' } : { travelMode: mode };
}

type Waypoint = { lat: number; lng: number } | { placeId: string };
const toWaypoint = (w: Waypoint) =>
  'placeId' in w ? { waypoint: { placeId: w.placeId } } : { waypoint: { location: { latLng: { latitude: w.lat, longitude: w.lng } } } };

/** Durations from one origin to several places; null when routing is unavailable/over limit. */
export async function routeMatrix(
  env: Env,
  origin: { lat: number; lng: number },
  placeIds: string[],
  mode: TravelMode,
): Promise<{ status: 'ok' | 'unavailable' | 'limit'; items: Map<string, { durationSec: number | null; distanceMeters: number | null; noRoute: boolean }> }> {
  const items = new Map<string, { durationSec: number | null; distanceMeters: number | null; noRoute: boolean }>();
  const key = googleConfig(env).serverKey;
  if (!key || !placeIds.length) return { status: 'unavailable', items };
  if (!(await reserve(env.DB, SKU.routeMatrix, placeIds.length, googleConfig(env).limits[SKU.routeMatrix]))) return { status: 'limit', items };
  try {
    const res = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition',
      },
      body: JSON.stringify({ origins: [toWaypoint(origin)], destinations: placeIds.map((id) => toWaypoint({ placeId: id })), ...modeBody(mode) }),
    });
    if (!res.ok) {
      logFailure('route matrix', res.status);
      return { status: 'unavailable', items };
    }
    const rows = (await res.json()) as { destinationIndex?: number; duration?: string; distanceMeters?: number; condition?: string }[];
    for (const r of Array.isArray(rows) ? rows : []) {
      const id = placeIds[r.destinationIndex ?? 0];
      if (!id) continue;
      const exists = r.condition === 'ROUTE_EXISTS';
      items.set(id, {
        durationSec: exists ? seconds(r.duration) : null,
        distanceMeters: exists && typeof r.distanceMeters === 'number' ? r.distanceMeters : null,
        noRoute: r.condition === 'ROUTE_NOT_FOUND',
      });
    }
    return { status: 'ok', items };
  } catch (e) {
    logFailure('route matrix', e instanceof Error ? e.name : 'unknown');
    return { status: 'unavailable', items };
  }
}

export async function computeRoute(env: Env, from: Waypoint, to: Waypoint, mode: TravelMode): Promise<{ durationSec: number; distanceMeters: number } | 'no_route'> {
  const key = requireKey(env);
  if (!(await reserve(env.DB, SKU.routes, 1, googleConfig(env).limits[SKU.routes]))) {
    throw new ApiError('rate_limited', 'Das Monatslimit für Google-Routen ist erreicht.');
  }
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
    body: JSON.stringify({ origin: toWaypoint(from).waypoint, destination: toWaypoint(to).waypoint, ...modeBody(mode), languageCode: 'de' }),
  });
  if (!res.ok) {
    logFailure('compute routes', res.status);
    throw new ApiError('service_unavailable', 'Die Google-Routenberechnung ist gerade nicht erreichbar.');
  }
  const data = (await res.json()) as { routes?: { duration?: string; distanceMeters?: number }[] };
  const r = data.routes?.[0];
  const d = seconds(r?.duration);
  if (!r || d == null || typeof r.distanceMeters !== 'number') return 'no_route';
  return { durationSec: d, distanceMeters: r.distanceMeters };
}

// ---------------------------------------------------------------------------
// Nearby search = IDs-only search + travel times, filtered by real routing
// ---------------------------------------------------------------------------

export async function nearby(
  env: Env,
  args: { query: string; type: string | null; origin: { lat: number; lng: number; label: string }; mode: TravelMode; maxMinutes: number | null; limit: number },
): Promise<NearbyResponse> {
  // A few extra candidates when filtering by travel time.
  const want = Math.min(args.maxMinutes ? args.limit + 4 : args.limit, 10);
  const radiusM = args.maxMinutes ? Math.min(args.maxMinutes * (args.mode === 'WALK' ? 90 : args.mode === 'BICYCLE' ? 300 : 900), 50_000) : 8000;
  const ids = await searchPlaceIds(env, { query: args.query, type: args.type, center: args.origin, radiusM, max: want });
  const matrix = await routeMatrix(env, args.origin, ids, args.mode);
  let results: NearbyResult[] = ids.map((placeId) => ({ placeId, durationSec: null, distanceMeters: null, noRoute: false, ...matrix.items.get(placeId) }));
  let filteredOut = 0;
  if (matrix.status === 'ok') {
    results.sort((a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity));
    if (args.maxMinutes) {
      const max = args.maxMinutes * 60;
      const keep = results.filter((r) => r.durationSec != null && r.durationSec <= max);
      filteredOut = results.length - keep.length;
      results = keep;
    }
  }
  return {
    origin: { label: args.origin.label, lat: args.origin.lat, lng: args.origin.lng },
    mode: args.mode,
    results: results.slice(0, args.limit),
    routing: matrix.status,
    filteredOut,
  };
}
