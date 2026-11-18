import { beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from '../../shared/finance';
import { summarizeBookingCosts, tripCostOverview } from '../../shared/costs';
import { createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

describe('Anzahlung (down payment)', () => {
  it('suit: 2.000 ฿ deposit by John, rest 7.000 ฿ later by Lilli – nothing counted twice', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR', localCurrency: 'THB' })).body.trip.id;
    const john = (await owner.get(`/trips/${tripId}/snapshot`)).body.travelers[0];
    const lilli = (await owner.post(`/trips/${tripId}/travelers`, { name: 'Lilli' })).body.traveler;
    const b = (
      await owner.post(`/trips/${tripId}/bookings`, {
        title: 'Maßanzug', type: 'other', costKind: 'actual', bookingStatus: 'booked', paymentStatus: 'unpaid',
        priceMinor: 900000, currency: 'THB', personsCount: 1, travelerIds: [john.id], startDate: '2026-11-20',
      })
    ).body.booking;

    const d = await owner.post(`/trips/${tripId}/bookings/${b.id}/deposit`, { amountMinor: 200000, paidByTravelerId: john.id, participantIds: [john.id], date: '2026-11-16', fxRate: '0.0268' });
    expect(d.status).toBe(201);
    expect(d.body.expense).toMatchObject({ title: 'Maßanzug – Anzahlung', amountMinor: 200000 });

    let snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    const booking = snap.bookings[0];
    expect(booking).toMatchObject({ paymentStatus: 'partial', depositMinor: 200000, depositExpenseId: d.body.expense.id });
    expect(summarizeBookingCosts(snap.bookings)[0]).toMatchObject({ committedMinor: 900000, paidMinor: 200000, openMinor: 700000 });
    expect(tripCostOverview('EUR', snap.expenses, snap.bookings).otherCurrencies).toEqual([{ currency: 'THB', minor: 700000 }]);

    // A second deposit or one ≥ price is refused.
    expect((await owner.post(`/trips/${tripId}/bookings/${b.id}/deposit`, { amountMinor: 1000, paidByTravelerId: john.id, participantIds: [john.id], date: '2026-11-16', fxRate: '0.0268' })).status).toBe(409);

    // Lilli pays the rest at pickup → only 7.000 ฿ go to the wallet.
    await owner.patch(`/trips/${tripId}/bookings/${b.id}`, { paymentStatus: 'paid', version: booking.version });
    const rest = await owner.post(`/trips/${tripId}/bookings/${b.id}/expense`, { paidByTravelerId: lilli.id, participantIds: [john.id], fxRate: '0.0268' });
    expect(rest.status).toBe(201);
    expect(rest.body.expense).toMatchObject({ title: 'Maßanzug – Restzahlung', amountMinor: 700000 });

    snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    const total = snap.expenses.reduce((a: number, e: { amountMinor: number }) => a + e.amountMinor, 0);
    expect(total).toBe(900000);
    const bal = computeBalances([john.id, lilli.id], snap.expenses, []);
    // John owes Lilli exactly the 7.000 ฿ she paid for him (in EUR).
    expect(bal.find((x) => x.travelerId === lilli.id)!.balanceMinor).toBe(rest.body.expense.baseAmountMinor);
  });

  it('removing the deposit deletes its expense and reopens the booking', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const me = (await owner.get(`/trips/${tripId}/snapshot`)).body.travelers[0];
    const b = (await owner.post(`/trips/${tripId}/bookings`, { title: 'Tauchkurs', type: 'activity', costKind: 'actual', bookingStatus: 'booked', paymentStatus: 'unpaid', priceMinor: 30000, currency: 'EUR', personsCount: 1, travelerIds: [me.id] })).body.booking;
    await owner.post(`/trips/${tripId}/bookings/${b.id}/deposit`, { amountMinor: 5000, paidByTravelerId: me.id, participantIds: [me.id], date: '2026-11-16' });
    expect((await owner.del(`/trips/${tripId}/bookings/${b.id}/deposit`)).status).toBe(200);
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.expenses).toHaveLength(0);
    expect(snap.bookings[0]).toMatchObject({ paymentStatus: 'unpaid', depositExpenseId: null, depositMinor: null });
  });
});
