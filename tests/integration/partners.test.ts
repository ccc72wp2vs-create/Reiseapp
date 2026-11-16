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
