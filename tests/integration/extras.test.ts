import { beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, inviteUser, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

describe('payment details, budget, emergency notes and votes', () => {
  it('stores PayPal.me and IBAN normalized and validates them', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    const me = snap.travelers[0];
    const ok = await owner.patch(`/trips/${tripId}/travelers/${me.id}`, {
      paypalMe: 'https://paypal.me/MaxMuster/10',
      iban: 'de89 3704 0044 0532 0130 00',
      version: me.version,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.traveler).toMatchObject({ paypalMe: 'MaxMuster', iban: 'DE89370400440532013000' });
    const bad = await owner.patch(`/trips/${tripId}/travelers/${me.id}`, { iban: 'abc', version: ok.body.traveler.version });
    expect(bad.status).toBe(422);
  });

  it('saves a daily budget and emergency notes on the trip', async () => {
    const owner = await setupOwner(t);
    const trip = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip;
    expect(trip.dailyBudgetMinor).toBeNull();
    const r = await owner.patch(`/trips/${trip.id}`, { dailyBudgetMinor: 8000, emergencyNotes: 'ADAC +49 89 76 76 76', version: trip.version });
    expect(r.status).toBe(200);
    expect(r.body.trip).toMatchObject({ dailyBudgetMinor: 8000, emergencyNotes: 'ADAC +49 89 76 76 76' });
  });

  it('lets every member vote once per place with their own traveler', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const place = (await owner.post(`/trips/${tripId}/places`, { name: 'Big Mom', category: 'restaurant' })).body.place;
    const viewer = await inviteUser(t, owner, tripId, 'viewer', 'v@example.com', 'Vera');
    expect((await owner.put(`/trips/${tripId}/places/${place.id}/vote`, { vote: true })).body.votes).toHaveLength(1);
    expect((await owner.put(`/trips/${tripId}/places/${place.id}/vote`, { vote: true })).body.votes).toHaveLength(1);
    expect((await viewer.put(`/trips/${tripId}/places/${place.id}/vote`, { vote: true })).body.votes).toHaveLength(2);
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.places[0].votes).toHaveLength(2);
    expect((await viewer.put(`/trips/${tripId}/places/${place.id}/vote`, { vote: false })).body.votes).toHaveLength(1);
  });
});
