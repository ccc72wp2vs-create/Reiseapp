import { beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

describe('deposits (Kautionen)', () => {
  it('are no costs while open; a kept part becomes a shared expense; reopening undoes it', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR', localCurrency: 'THB' })).body.trip.id;
    const snap0 = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    const me = snap0.travelers[0];
    const other = (await owner.post(`/trips/${tripId}/travelers`, { name: 'Lilli' })).body.traveler;

    const created = await owner.post(`/trips/${tripId}/deposits`, {
      title: 'Roller Krabi',
      amountMinor: 300000,
      currency: 'THB',
      fxRate: '0.0262',
      paidByTravelerId: me.id,
      travelerIds: [me.id, other.id],
      method: 'cash',
      date: '2026-11-18',
      returnDate: '2026-11-21',
    });
    expect(created.status).toBe(201);
    const dep = created.body.deposit;
    expect(dep).toMatchObject({ status: 'open', baseAmountMinor: 7860, travelerIds: [me.id, other.id] });

    let snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.deposits).toHaveLength(1);
    expect(snap.expenses).toHaveLength(0);

    // Return date before deposit date is rejected
    expect((await owner.put(`/trips/${tripId}/deposits/${dep.id}`, { ...created.body.deposit, fxRate: '0.0262', returnDate: '2026-11-01', version: dep.version })).status).toBe(422);

    const resolved = await owner.post(`/trips/${tripId}/deposits/${dep.id}/resolve`, { outcome: 'partial', keptMinor: 50000, date: '2026-11-21', version: dep.version });
    expect(resolved.status).toBe(200);
    expect(resolved.body.deposit).toMatchObject({ status: 'partial', keptMinor: 50000 });
    snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.expenses).toHaveLength(1);
    expect(snap.expenses[0]).toMatchObject({ title: 'Kaution einbehalten: Roller Krabi', amountMinor: 50000, baseAmountMinor: 1310, paidByTravelerId: me.id });
    expect(snap.expenses[0].shares.map((s: { travelerId: string }) => s.travelerId).sort()).toEqual([me.id, other.id].sort());

    // Already resolved → conflict
    expect((await owner.post(`/trips/${tripId}/deposits/${dep.id}/resolve`, { outcome: 'returned', date: '2026-11-21', version: resolved.body.deposit.version })).status).toBe(409);

    const reopened = await owner.post(`/trips/${tripId}/deposits/${dep.id}/reopen`, { version: resolved.body.deposit.version });
    expect(reopened.body.deposit).toMatchObject({ status: 'open', keptMinor: null, expenseId: null });
    snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.expenses).toHaveLength(0);

    const back = await owner.post(`/trips/${tripId}/deposits/${dep.id}/resolve`, { outcome: 'returned', date: '2026-11-21', version: reopened.body.deposit.version });
    expect(back.body.deposit).toMatchObject({ status: 'returned', expenseId: null });
    expect((await owner.del(`/trips/${tripId}/deposits/${dep.id}`)).status).toBe(200);
  });

  it('can be put down by several travelers; a kept part is carried in proportion', async () => {
    const owner = await setupOwner(t);
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
    const me = (await owner.get(`/trips/${tripId}/snapshot`)).body.travelers[0];
    const other = (await owner.post(`/trips/${tripId}/travelers`, { name: 'Lilli' })).body.traveler;
    const base = { title: 'Jeep', amountMinor: 30000, currency: 'EUR', paidByTravelerId: me.id, travelerIds: [me.id, other.id], method: 'cash', date: '2026-11-18' };
    expect((await owner.post(`/trips/${tripId}/deposits`, { ...base, payers: [{ travelerId: me.id, amountMinor: 10000 }, { travelerId: other.id, amountMinor: 10000 }] })).status).toBe(422);
    const dep = (await owner.post(`/trips/${tripId}/deposits`, { ...base, payers: [{ travelerId: me.id, amountMinor: 20000 }, { travelerId: other.id, amountMinor: 10000 }] })).body.deposit;
    expect(dep.payers).toEqual([{ travelerId: me.id, amountMinor: 20000 }, { travelerId: other.id, amountMinor: 10000 }]);
    await owner.post(`/trips/${tripId}/deposits/${dep.id}/resolve`, { outcome: 'partial', keptMinor: 3000, returnedToTravelerId: me.id, date: '2026-11-21', version: dep.version });
    const exp = (await owner.get(`/trips/${tripId}/snapshot`)).body.expenses[0];
    const paid = Object.fromEntries(exp.payers.map((p: { travelerId: string; amountMinor: number }) => [p.travelerId, p.amountMinor]));
    expect(paid).toEqual({ [me.id]: 2000, [other.id]: 1000 });
  });
});
