import { beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from '../../shared/finance';
import { createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

describe('joint payment (rent + deposit, cash from everyone)', () => {
  it('ends with everyone paying the same once the deposit is back', async () => {
    const owner = await setupOwner(t, 'owner@example.com', 'John');
    const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'THB' })).body.trip.id;
    const john = (await owner.get(`/trips/${tripId}/snapshot`)).body.travelers[0];
    const add = async (name: string) => (await owner.post(`/trips/${tripId}/travelers`, { name })).body.traveler;
    const tim = await add('Tim');
    const annika = await add('Annika');
    const lilli = await add('Lilli');
    const all = [john.id, tim.id, annika.id, lilli.id];
    const body = {
      title: 'Mietwagen Krabi',
      currency: 'THB',
      date: '2026-11-18',
      contributions: [
        { travelerId: tim.id, amountMinor: 9000 },
        { travelerId: annika.id, amountMinor: 187000 },
        { travelerId: lilli.id, amountMinor: 300000 },
        { travelerId: john.id, amountMinor: 170000 },
      ],
      costMinor: 180000,
      forTravelerIds: all,
      deposit: { amountMinor: 470000, method: 'cash', returnDate: '2026-11-21' },
    };
    // 6,660 handed over vs 6,500 needed → rejected without change
    expect((await owner.post(`/trips/${tripId}/joint-payments`, body)).status).toBe(422);
    const res = await owner.post(`/trips/${tripId}/joint-payments`, { ...body, change: { travelerId: lilli.id, amountMinor: 16000 } });
    expect(res.status).toBe(201);
    const dep = res.body.deposit;
    expect(res.body.expense.amountMinor).toBe(180000);
    expect(dep.amountMinor).toBe(470000);

    // Returned in full to Annika
    const back = await owner.post(`/trips/${tripId}/deposits/${dep.id}/resolve`, { outcome: 'returned', returnedToTravelerId: annika.id, date: '2026-11-21', version: dep.version });
    expect(back.status).toBe(200);
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    const balances = computeBalances(all, snap.expenses, snap.settlements);
    const bal = Object.fromEntries(balances.map((b) => [b.travelerId, b.balanceMinor]));
    // net handed over − 450 rent (− 4,700 received for Annika)
    expect(bal).toEqual({ [tim.id]: -36000, [annika.id]: -328000, [lilli.id]: 239000, [john.id]: 125000 });
    expect(snap.settlements.every((s: { depositId: string }) => s.depositId === dep.id)).toBe(true);

    // Deposit-linked settlements can't be deleted one by one; reopening removes them
    expect((await owner.del(`/trips/${tripId}/settlements/${snap.settlements[0].id}`)).status).toBe(409);
    await owner.post(`/trips/${tripId}/deposits/${dep.id}/reopen`, { version: back.body.deposit.version });
    expect((await owner.get(`/trips/${tripId}/snapshot`)).body.settlements).toHaveLength(0);
  });
});
