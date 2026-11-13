import { beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

describe('flight check-in fields', () => {
  it('stores flight number and check-in status without touching other booking data', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const created = await owner.post(`/trips/${tripId}/bookings`, {
      title: 'Krabi → Chiang Mai', type: 'flight', costKind: 'actual', bookingStatus: 'booked', paymentStatus: 'paid',
      startDate: '2026-11-21', startTime: '12:00', startTimezone: 'Asia/Bangkok', priceMinor: 500000, currency: 'THB', flightNumber: 'PG 271',
    });
    expect(created.status).toBe(201);
    const b = created.body.booking;
    expect(b).toMatchObject({ flightNumber: 'PG 271', checkinDoneAt: null, priceMinor: 500000 });

    const done = await owner.patch(`/trips/${tripId}/bookings/${b.id}`, { checkinDoneAt: '2026-11-20T06:00:00.000Z', version: b.version });
    expect(done.status).toBe(200);
    expect(done.body.booking).toMatchObject({ checkinDoneAt: '2026-11-20T06:00:00.000Z', flightNumber: 'PG 271', priceMinor: 500000, title: 'Krabi → Chiang Mai' });

    const undo = await owner.patch(`/trips/${tripId}/bookings/${b.id}`, { checkinDoneAt: null, version: done.body.booking.version });
    expect(undo.body.booking.checkinDoneAt).toBeNull();

    const bad = await owner.patch(`/trips/${tripId}/bookings/${b.id}`, { flightNumber: 'Krabi Air', version: undo.body.booking.version });
    expect(bad.status).toBe(422);
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.bookings[0].flightNumber).toBe('PG 271');
  });
});
