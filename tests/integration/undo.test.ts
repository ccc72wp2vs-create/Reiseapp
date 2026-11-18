import { beforeEach, describe, expect, it } from 'vitest';
import type { BookingDto, ExpenseDto } from '../../shared/types';
import { expenseBody } from '../../src/lib/undo';
import { createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

describe('undo after delete', () => {
  it('recreates an expense exactly (same id, payers, shares, rate) and a booking with its link', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR', localCurrency: 'THB' })).body.trip.id;
    const a = (await owner.get(`/trips/${tripId}/snapshot`)).body.travelers[0];
    const b = (await owner.post(`/trips/${tripId}/travelers`, { name: 'Lilli' })).body.traveler;
    const c = (await owner.post(`/trips/${tripId}/travelers`, { name: 'Tim' })).body.traveler;
    const e: ExpenseDto = (
      await owner.post(`/trips/${tripId}/expenses`, {
        title: 'Beach Bar', amountMinor: 149000, currency: 'THB', date: '2026-11-14', category: 'food', paidByTravelerId: b.id,
        splitMethod: 'equal', splits: [{ travelerId: a.id }, { travelerId: b.id }, { travelerId: c.id }], fxRate: '0.0262', fxSource: 'manual', notes: 'Notiz',
      })
    ).body.expense;
    expect((await owner.del(`/trips/${tripId}/expenses/${e.id}?version=${e.version}`)).status).toBe(200);
    const again = await owner.post(`/trips/${tripId}/expenses`, expenseBody(e));
    expect(again.status).toBe(201);
    const r: ExpenseDto = again.body.expense;
    expect(r).toMatchObject({ id: e.id, title: 'Beach Bar', amountMinor: 149000, baseAmountMinor: e.baseAmountMinor, fxRate: '0.0262', notes: 'Notiz' });
    expect(r.shares.map((s) => [s.travelerId, s.shareMinor, s.baseShareMinor])).toEqual(e.shares.map((s) => [s.travelerId, s.shareMinor, s.baseShareMinor]));

    const bk: BookingDto = (await owner.post(`/trips/${tripId}/bookings`, { title: 'Fähre', type: 'ferry', costKind: 'actual', bookingStatus: 'booked', paymentStatus: 'paid', priceMinor: 149000, currency: 'THB', personsCount: 3, travelerIds: [a.id, b.id, c.id] })).body.booking;
    await owner.post(`/trips/${tripId}/expenses/${e.id}/link-booking`, { bookingId: bk.id });
    const full: BookingDto = (await owner.get(`/trips/${tripId}/snapshot`)).body.bookings[0];
    await owner.del(`/trips/${tripId}/bookings/${bk.id}?version=${full.version}`);
    const { tripId: _t, version: _v, createdAt: _c, updatedAt: _u, expenseId, depositExpenseId: _d, depositMinor: _m, ...rest } = full as BookingDto & Record<string, unknown>;
    expect((await owner.post(`/trips/${tripId}/bookings`, rest)).status).toBe(201);
    await owner.post(`/trips/${tripId}/expenses/${expenseId}/link-booking`, { bookingId: bk.id });
    const back: BookingDto = (await owner.get(`/trips/${tripId}/snapshot`)).body.bookings[0];
    expect(back).toMatchObject({ id: bk.id, title: 'Fähre', expenseId: e.id });
    expect([...back.travelerIds].sort()).toEqual([a.id, b.id, c.id].sort());
  });
});
