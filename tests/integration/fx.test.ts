import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invertRate, refreshActiveTrips } from '../../worker/services/fx';
import { Client, createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
let owner: Client;
let tripId: string;
let calls: string[];

function mockEcb(status = 200) {
  calls = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    if (status !== 200) return new Response('{}', { status });
    // Range response: weekend has no ECB rates.
    return Response.json({ base: 'EUR', start_date: '2026-11-13', end_date: '2026-11-16', rates: { '2026-11-13': { THB: 37.5 }, '2026-11-16': { THB: 38.0 } } });
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T15:30:00Z'));
  t = createTestEnv();
  owner = await setupOwner(t);
  tripId = (await owner.post('/imports/thailand-2026')).body.tripId;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('automatic ECB exchange rates', () => {
  it('inverts "1 EUR = x THB" into "1 THB = y EUR"', () => {
    expect(invertRate(38)).toBe('0.0263158');
    expect(invertRate(0)).toBeNull();
  });

  it('stores missing daily rates once and never touches existing expenses', async () => {
    const before = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    mockEcb();
    const r1 = await owner.post(`/trips/${tripId}/exchange-rates/refresh`);
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ added: 2, latestDate: '2026-11-16' });
    expect(calls[0]).toContain('api.frankfurter.dev/v1/');
    expect(calls[0]).toContain('base=EUR&symbols=THB');

    const after = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    const auto = after.exchangeRates.filter((x: { source: string }) => x.source === 'provider');
    expect(auto.map((x: { effectiveDate: string; rate: string }) => [x.effectiveDate, x.rate]).sort()).toEqual([
      ['2026-11-13', '0.0266667'],
      ['2026-11-16', '0.0263158'],
    ]);
    // Manual rate and every expense stay exactly as they were.
    expect(after.exchangeRates.filter((x: { source: string }) => x.source === 'manual')).toEqual(before.exchangeRates);
    expect(after.expenses).toEqual(before.expenses);

    // Second run: nothing new for dates already stored.
    const r2 = await owner.post(`/trips/${tripId}/exchange-rates/refresh`);
    expect(r2.body.added).toBe(0);
  });

  it('reports an unavailable provider without failing the app', async () => {
    mockEcb(503);
    const r = await owner.post(`/trips/${tripId}/exchange-rates/refresh`);
    expect(r.status).toBe(503);
  });

  it('daily job refreshes running trips', async () => {
    mockEcb();
    expect(await refreshActiveTrips(t.env.DB, '2026-11-16')).toBe(2);
  });
});

describe('parallel refreshes', () => {
  it('store each automatic rate only once', async () => {
    mockEcb();
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => owner.post(`/trips/${tripId}/exchange-rates/refresh`)));
    expect(a.body.added + b.body.added + c.body.added).toBe(2);
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.exchangeRates.filter((x: { source: string }) => x.source === 'provider')).toHaveLength(2);
  });
});
