import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
let owner: Client;
let tripId: string;

const feature = (id: string, name: string, lat: number, lon: number, extra: Record<string, unknown> = {}) => ({
  properties: { place_id: id, name, lat, lon, categories: ['catering.restaurant'], address_line2: 'Ao Nang, Krabi', datasource: { raw: { opening_hours: 'Mo-Su 10:00-22:00', website: 'example.com', cuisine: 'thai;seafood' } }, ...extra },
});

function mockGeo(opts: { features?: unknown[]; matrix?: ({ time: number; distance: number; target_index: number } | null)[]; status?: number } = {}) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (opts.status) return new Response('{}', { status: opts.status });
    if (url.includes('/v2/places')) return Response.json({ features: opts.features ?? [] });
    if (url.includes('/v1/routematrix')) return Response.json({ sources_to_targets: [opts.matrix ?? []] });
    if (url.includes('/v1/routing')) return Response.json({ features: [{ properties: { time: 900, distance: 7400 } }] });
    return new Response('nope', { status: 404 });
  });
  return calls;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T03:00:00Z')); // in Krabi
  t = createTestEnv();
  t.env.GEOAPIFY_KEY = 'geo-test-key';
  owner = await setupOwner(t);
  tripId = (await owner.post('/imports/thailand-2026')).body.tripId;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Geoapify (OpenStreetMap) – no credit card', () => {
  it('is preferred over Google and never sends a key to the browser', async () => {
    t.env.GOOGLE_MAPS_SERVER_KEY = 'g';
    t.env.GOOGLE_MAPS_BROWSER_KEY = 'b';
    expect((await owner.get(`/trips/${tripId}/maps/config`)).body).toEqual({ enabled: true, provider: 'geoapify', browserKey: null, routing: true });
  });

  it('finds places with details and filters by real travel times', async () => {
    const calls = mockGeo({
      features: [feature('a', 'Krua Thai', 8.03, 98.82), feature('b', 'Far Away Grill', 8.2, 99.0), feature('c', 'Krua Thai', 8.03, 98.82)],
      matrix: [{ time: 720, distance: 5200, target_index: 0 }, { time: 2400, distance: 30000, target_index: 1 }],
    });
    const r = await owner.post(`/trips/${tripId}/maps/nearby`, { category: 'restaurant', maxMinutes: 20 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ provider: 'geoapify', routing: 'ok', filteredOut: 1 });
    expect(r.body.results).toHaveLength(1);
    expect(r.body.results[0]).toMatchObject({
      placeId: 'osm:a',
      durationSec: 720,
      distanceMeters: 5200,
      place: { name: 'Krua Thai', categoryLabel: 'Restaurant', openingHours: 'Mo-Su 10:00-22:00', website: 'https://example.com', cuisine: 'thai, seafood', address: 'Ao Nang, Krabi' },
    });
    const places = new URL(calls[0].url);
    expect(places.searchParams.get('categories')).toBe('catering.restaurant');
    expect(places.searchParams.get('filter')).toMatch(/^circle:/);
    expect(calls[1].body).toMatchObject({ mode: 'drive', sources: [{ location: [expect.any(Number), expect.any(Number)] }] });
    expect((calls[1].body as { targets: unknown[] }).targets).toHaveLength(2); // duplicate removed
  });

  it('marks places without a road route and keeps unknown times honest', async () => {
    mockGeo({ features: [feature('a', 'Island Beach Bar', 7.6, 98.9)], matrix: [null] });
    const r = await owner.post(`/trips/${tripId}/maps/nearby`, { category: 'nightlife' });
    expect(r.body.results[0]).toMatchObject({ durationSec: null, noRoute: true });
    mockGeo({ features: [feature('a', 'X', 8, 98.9)], status: undefined });
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('/v2/places') ? Response.json({ features: [feature('a', 'X', 8, 98.9)] }) : new Response('{}', { status: 500 }),
    );
    const r2 = await owner.post(`/trips/${tripId}/maps/nearby`, { category: 'beach', maxMinutes: 10 });
    expect(r2.body.routing).toBe('unavailable');
    expect(r2.body.results[0]).toMatchObject({ durationSec: null, noRoute: false });
  });

  it('counts credits per day and stops at the internal limit', async () => {
    t.env.GEOAPIFY_DAILY_CREDITS = '4';
    const calls = mockGeo({ features: [feature('a', 'A', 8, 98.9), feature('b', 'B', 8.01, 98.9)], matrix: [{ time: 60, distance: 100, target_index: 0 }, { time: 60, distance: 100, target_index: 1 }] });
    expect((await owner.post(`/trips/${tripId}/maps/nearby`, { category: 'cafe' })).status).toBe(200); // 1 + 2 credits
    const second = await owner.post(`/trips/${tripId}/maps/nearby`, { category: 'cafe' }); // 1 ok, matrix (2) over limit
    expect(second.status).toBe(200);
    expect(second.body.routing).toBe('limit');
    const third = await owner.post(`/trips/${tripId}/maps/nearby`, { category: 'cafe' });
    expect(third.status).toBe(429);
    expect(third.body.error.message).toMatch(/Tageslimit/);
    expect(calls.filter((c) => c.url.includes('/v2/places'))).toHaveLength(2);
    expect((await owner.get(`/trips/${tripId}/maps/usage`)).body.geoapify).toMatchObject({ used: 4, limit: 4 });
  });

  it('computes the distance to a saved place from own coordinates', async () => {
    const calls = mockGeo();
    const place = (await owner.post(`/trips/${tripId}/places`, { name: 'Tiger Cave', category: 'sightseeing', lat: 8.1236, lng: 98.9265 })).body.place;
    const r = await owner.post(`/trips/${tripId}/maps/distance`, { placeId: place.id, mode: 'WALK' });
    expect(r.body).toMatchObject({ durationSec: 900, distanceMeters: 7400, noRoute: false });
    expect(new URL(calls[0].url).searchParams.get('mode')).toBe('walk');
  });
});

describe('Frag TRAVIO with OpenStreetMap places', () => {
  it('lets the model plan with real places and travel times (openly licensed data)', async () => {
    mockGeo({
      features: [feature('a', 'Krua Thai', 8.03, 98.82)],
      matrix: [{ time: 720, distance: 5200, target_index: 0 }],
    });
    const prompts: string[] = [];
    t.env.AI = {
      run: async (_m: string, input: { messages: { content: string }[] }) => {
        prompts.push(input.messages.map((m) => m.content).join('\n'));
        return {
          response: JSON.stringify({
            answer: 'Euer Plan für morgen.',
            plan: { date: '2026-11-21', items: [{ startTime: '12:00', endTime: '13:30', title: 'Mittagessen im Krua Thai', category: 'restaurant', ref: 'O1' }] },
          }),
        };
      },
    } as unknown as Ai;
    const r = await owner.post(`/trips/${tripId}/assistant`, { messages: [{ role: 'user', content: 'Plane uns morgen einen Tag mit gutem Essen' }] });
    expect(prompts[0]).toContain('Krua Thai');
    expect(prompts[0]).toContain('12 Min. mit dem Auto');
    const p = r.body.proposal;
    expect(p.kind).toBe('add_activities');
    expect(p.items[0]).toMatchObject({ source: 'osm', lat: 8.03, lng: 98.82, travel: '12 Min. mit dem Auto (5,2 km)' });
  });

  it('answers place searches with real results even without AI', async () => {
    mockGeo({ features: [feature('a', 'Krua Thai', 8.03, 98.82)], matrix: [{ time: 720, distance: 5200, target_index: 0 }] });
    const r = await owner.post(`/trips/${tripId}/assistant`, { messages: [{ role: 'user', content: 'Welche Restaurants erreiche ich in maximal 20 Minuten?' }] });
    expect(r.body.ai).toBe(false);
    expect(r.body.cards[0]).toMatchObject({ kind: 'osm_search', response: { provider: 'geoapify', results: [{ placeId: 'osm:a' }] } });
    expect(r.body.answer).toMatch(/Restaurants in der Nähe/);
  });
});
