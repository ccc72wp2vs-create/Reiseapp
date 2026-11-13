import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, createTestEnv, inviteUser, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
let owner: Client;
let tripId: string;

interface Call { url: string; headers: Record<string, string>; body: Record<string, unknown> }
/** Stand-in for Google's web services; records every request. */
function mockGoogle(opts: { ids?: string[]; matrix?: { destinationIndex: number; duration?: string; distanceMeters?: number; condition: string }[]; status?: number } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    if (opts.status) return new Response('{}', { status: opts.status });
    if (url.includes('places:searchText')) return Response.json({ places: (opts.ids ?? []).map((id) => ({ id })) });
    if (url.includes('computeRouteMatrix')) return Response.json(opts.matrix ?? []);
    if (url.includes('computeRoutes')) return Response.json({ routes: [{ duration: '754s', distanceMeters: 6100 }] });
    return new Response('not found', { status: 404 });
  });
  return calls;
}
const ID = (n: number) => `ChIJplace${String(n).padStart(6, '0')}`;
const tables = () => t.db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T03:00:00Z')); // in Krabi
  t = createTestEnv();
  t.env.GOOGLE_MAPS_SERVER_KEY = 'server-key-test';
  t.env.GOOGLE_MAPS_BROWSER_KEY = 'browser-key-test';
  owner = await setupOwner(t);
  tripId = (await owner.post('/imports/thailand-2026')).body.tripId;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Google Maps Platform', () => {
  it('is off without keys and never exposes the server key', async () => {
    const on = (await owner.get(`/trips/${tripId}/google/config`)).body;
    expect(on).toEqual({ enabled: true, browserKey: 'browser-key-test', routing: true });
    expect(JSON.stringify(on)).not.toContain('server-key');
    t.env.GOOGLE_MAPS_SERVER_KEY = undefined;
    expect((await owner.get(`/trips/${tripId}/google/config`)).body).toMatchObject({ enabled: false, browserKey: null });
    mockGoogle();
    expect((await owner.post(`/trips/${tripId}/google/nearby`, { category: 'restaurant' })).status).toBe(503);
  });

  it('requests only place IDs and filters by real travel times', async () => {
    const calls = mockGoogle({
      ids: [ID(1), ID(2), ID(3)],
      matrix: [
        { destinationIndex: 0, duration: '1500s', distanceMeters: 15000, condition: 'ROUTE_EXISTS' },
        { destinationIndex: 1, duration: '600s', distanceMeters: 4000, condition: 'ROUTE_EXISTS' },
        { destinationIndex: 2, condition: 'ROUTE_NOT_FOUND' },
      ],
    });
    const r = await owner.post(`/trips/${tripId}/google/nearby`, { category: 'restaurant', maxMinutes: 20 });
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([{ placeId: ID(2), durationSec: 600, distanceMeters: 4000, noRoute: false }]);
    expect(r.body.filteredOut).toBe(2);
    expect(r.body.routing).toBe('ok');
    expect(r.body.origin.label).toMatch(/Krabi|Unterkunft/);
    const search = calls.find((c) => c.url.includes('searchText'))!;
    expect(search.headers['X-Goog-FieldMask']).toBe('places.id');
    expect(search.headers['X-Goog-Api-Key']).toBe('server-key-test');
    expect(search.body).toMatchObject({ textQuery: 'Restaurant', includedType: 'restaurant', languageCode: 'de' });
    const matrix = calls.find((c) => c.url.includes('computeRouteMatrix'))!;
    expect(matrix.headers['X-Goog-FieldMask']).not.toMatch(/polyline|steps|legs/);
    expect(matrix.body).toMatchObject({ travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' });
    expect((matrix.body.destinations as unknown[])[0]).toEqual({ waypoint: { placeId: ID(1) } });
  });

  it('marks unknown travel times instead of inventing them when routing fails', async () => {
    mockGoogle({ ids: [ID(1)] });
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('searchText') ? Response.json({ places: [{ id: ID(1) }] }) : new Response('{}', { status: 500 }),
    );
    const r = await owner.post(`/trips/${tripId}/google/nearby`, { category: 'beach', maxMinutes: 30, mode: 'WALK' });
    expect(r.body.routing).toBe('unavailable');
    expect(r.body.results).toEqual([{ placeId: ID(1), durationSec: null, distanceMeters: null, noRoute: false }]);
  });

  it('stops at the internal monthly limits', async () => {
    t.env.GOOGLE_LIMIT_SEARCHES = '1';
    t.env.GOOGLE_LIMIT_UI_LOADS = '5';
    const calls = mockGoogle({ ids: [ID(1)], matrix: [{ destinationIndex: 0, duration: '60s', distanceMeters: 500, condition: 'ROUTE_EXISTS' }] });
    expect((await owner.post(`/trips/${tripId}/google/nearby`, { category: 'cafe' })).status).toBe(200);
    const second = await owner.post(`/trips/${tripId}/google/nearby`, { category: 'cafe' });
    expect(second.status).toBe(429);
    expect(second.body.error.message).toMatch(/Monatslimit/);
    expect(calls.filter((c) => c.url.includes('searchText'))).toHaveLength(1);
    expect((await owner.post(`/trips/${tripId}/google/ui-loads`, { count: 4 })).status).toBe(200);
    expect((await owner.post(`/trips/${tripId}/google/ui-loads`, { count: 2 })).status).toBe(429);
    const usage = (await owner.get(`/trips/${tripId}/google/usage`)).body.usage;
    expect(usage.find((u: { sku: string }) => u.sku === 'places.uikit.query')).toMatchObject({ used: 4, limit: 5 });
  });

  it('stores only the place ID – via the normal place and activity endpoints', async () => {
    mockGoogle();
    const place = await owner.post(`/trips/${tripId}/places`, { name: 'Unser Lieblingsrestaurant', category: 'restaurant', googlePlaceId: ID(7), favorite: true });
    expect(place.status).toBe(201);
    expect(place.body.place).toMatchObject({ googlePlaceId: ID(7), lat: null, lng: null });
    const act = await owner.post(`/trips/${tripId}/activities`, { title: 'Abendessen', date: '2026-11-20', startTime: '19:00', googlePlaceId: ID(7) });
    expect(act.body.activity.googlePlaceId).toBe(ID(7));
    expect((await owner.post(`/trips/${tripId}/places`, { name: 'x', category: 'other', googlePlaceId: 'bad id!' })).status).toBe(422);
    // No table for Google content exists – only counters.
    expect(tables().map((x) => x.name).filter((n) => n.startsWith('google'))).toEqual(['google_usage']);
  });

  it('computes the distance to a saved place with own coordinates (no route steps)', async () => {
    const calls = mockGoogle();
    const place = (await owner.post(`/trips/${tripId}/places`, { name: 'Tiger Cave', category: 'sightseeing', lat: 8.1236, lng: 98.9265 })).body.place;
    const r = await owner.post(`/trips/${tripId}/google/distance`, { placeId: place.id });
    expect(r.body).toMatchObject({ durationSec: 754, distanceMeters: 6100, noRoute: false });
    const c = calls.find((x) => x.url.includes('computeRoutes'))!;
    expect(c.headers['X-Goog-FieldMask']).toBe('routes.duration,routes.distanceMeters');
  });

  it('lets viewers search but only editors link places; strangers get nothing', async () => {
    mockGoogle({ ids: [ID(1)], matrix: [] });
    const viewer = await inviteUser(t, owner, tripId, 'viewer', 'v@example.com', 'Vera');
    expect((await viewer.post(`/trips/${tripId}/google/nearby`, { category: 'temple' })).status).toBe(200);
    const place = (await owner.post(`/trips/${tripId}/places`, { name: 'Wat', category: 'sightseeing', lat: 8, lng: 98.9 })).body.place;
    expect((await viewer.post(`/trips/${tripId}/google/match/${place.id}`)).status).toBe(403);
    expect((await owner.post(`/trips/${tripId}/google/match/${place.id}`)).body).toEqual({ googlePlaceId: ID(1) });
    const other = (await owner.post('/trips', { name: 'X', startDate: '2026-12-01', endDate: '2026-12-02', baseCurrency: 'EUR' })).body.trip.id;
    const stranger = await inviteUser(t, owner, other, 'editor', 's@example.com', 'Sam');
    expect((await stranger.post(`/trips/${tripId}/google/nearby`, { category: 'temple' })).status).toBe(404);
  });
});
