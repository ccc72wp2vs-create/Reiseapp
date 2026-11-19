import { beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

describe('traveler partners', () => {
  it('links partners mutually, re-pairs cleanly and can be cleared', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const add = async (name: string) => (await owner.post(`/trips/${tripId}/travelers`, { name })).body.traveler.id as string;
    const [a, b, c] = [await add('Annika'), await add('Tim'), await add('Lilli')];
    const partners = async () =>
      Object.fromEntries(((await owner.get(`/trips/${tripId}/snapshot`)).body.travelers as { name: string; partnerId: string | null }[]).map((x) => [x.name, x.partnerId]));

    expect((await owner.put(`/trips/${tripId}/travelers/${a}/partner`, { partnerId: b })).status).toBe(200);
    expect(await partners()).toMatchObject({ Annika: b, Tim: a, Lilli: null });

    // Re-pairing Tim with Lilli releases Annika.
    await owner.put(`/trips/${tripId}/travelers/${b}/partner`, { partnerId: c });
    expect(await partners()).toMatchObject({ Annika: null, Tim: c, Lilli: b });

    await owner.put(`/trips/${tripId}/travelers/${c}/partner`, { partnerId: null });
    expect(await partners()).toMatchObject({ Annika: null, Tim: null, Lilli: null });

    expect((await owner.put(`/trips/${tripId}/travelers/${a}/partner`, { partnerId: a })).status).toBe(422);
    expect((await owner.put(`/trips/${tripId}/travelers/${a}/partner`, { partnerId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
  });
});

describe('couples from an earlier trip', () => {
  it('suggests and applies the same couples by name in a new trip', async () => {
    const owner = await setupOwner(t);
    const mk = async (name: string, start: string) => (await owner.post('/trips', { name, startDate: start, endDate: start, baseCurrency: 'EUR' })).body.trip.id as string;
    const old = await mk('Thailand 2026', '2026-11-06');
    const add = async (trip: string, name: string) => (await owner.post(`/trips/${trip}/travelers`, { name })).body.traveler.id as string;
    const meOld = (await owner.get(`/trips/${old}/snapshot`)).body.travelers[0].id;
    const [lilli, tim, annika] = [await add(old, 'Lilli'), await add(old, 'Tim'), await add(old, 'Annika')];
    await owner.put(`/trips/${old}/travelers/${meOld}/partner`, { partnerId: lilli });
    await owner.put(`/trips/${old}/travelers/${tim}/partner`, { partnerId: annika });

    const neu = await mk('Mallorca 2027', '2027-06-01');
    for (const n of ['Lilli', 'tim', 'Annika']) await add(neu, n);
    const sug = (await owner.get(`/trips/${neu}/travelers/partner-suggestion`)).body.suggestion;
    expect(sug.fromTrip.name).toBe('Thailand 2026');
    expect(sug.pairs).toHaveLength(2);
    expect((await owner.post(`/trips/${neu}/travelers/partner-suggestion`, {})).body.applied).toBe(2);
    const tr = (await owner.get(`/trips/${neu}/snapshot`)).body.travelers as { id: string; name: string; partnerId: string | null }[];
    const by = (n: string) => tr.find((x) => x.name.toLowerCase() === n.toLowerCase())!;
    expect(by('Lilli').partnerId).toBe(tr[0].id);
    expect(by('tim').partnerId).toBe(by('Annika').id);
    // Once couples exist, nothing more is suggested.
    expect((await owner.get(`/trips/${neu}/travelers/partner-suggestion`)).body.suggestion).toBeNull();
  });
});
