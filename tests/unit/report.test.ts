import { describe, expect, it } from 'vitest';
import { buildReport } from '../../shared/report';
import type { TripSnapshot } from '../../shared/types';

const travelers = [
  { id: 'john', name: 'John', partnerId: 'lilli' },
  { id: 'lilli', name: 'Lilli', partnerId: 'john' },
  { id: 'tim', name: 'Tim', partnerId: 'annika' },
  { id: 'annika', name: 'Annika', partnerId: 'tim' },
];
const exp = (id: string, category: string, date: string, payer: string, shares: [string, number][]) => {
  const total = shares.reduce((a, [, v]) => a + v, 0);
  return { id, category, date, bookingId: null, baseAmountMinor: total, payers: [{ travelerId: payer, baseAmountMinor: total }], shares: shares.map(([travelerId, baseShareMinor]) => ({ travelerId, baseShareMinor })) };
};
const snap = {
  trip: { baseCurrency: 'EUR' },
  travelers,
  destinations: [
    { id: 'lanta', name: 'Koh Lanta', arrivalDate: '2026-11-14', departureDate: '2026-11-18', sortOrder: 0 },
    { id: 'krabi', name: 'Krabi', arrivalDate: '2026-11-18', departureDate: '2026-11-21', sortOrder: 1 },
  ],
  bookings: [],
  expenses: [
    exp('e1', 'food', '2026-11-15', 'lilli', [['john', 1000], ['lilli', 1000], ['tim', 1000], ['annika', 1000]]),
    exp('e2', 'activities', '2026-11-19', 'tim', [['tim', 500], ['annika', 500]]),
  ],
  settlements: [],
} as unknown as TripSnapshot;

describe('final report', () => {
  it('sums per couple and proposes one transfer between couples', () => {
    const r = buildReport(snap, 'couples');
    expect(r.totalMinor).toBe(5000);
    expect(r.groups.map((g) => [g.memberIds.join('+'), g.paidMinor, g.consumedMinor, g.balanceMinor])).toEqual([
      ['john+lilli', 4000, 2000, 2000],
      ['tim+annika', 1000, 3000, -2000],
    ]);
    expect(r.transfers).toEqual([{ fromKey: 'tim', toKey: 'john', amountMinor: 2000, fromTravelerId: 'annika', toTravelerId: 'lilli' }]);
    expect(r.byStop.map((s) => [s.name, s.minor])).toEqual([
      ['Koh Lanta', 4000],
      ['Krabi', 1000],
    ]);
    expect(r.byCategory[0]).toEqual({ category: 'food', minor: 4000 });
  });

  it('per person mode keeps everyone separate', () => {
    const r = buildReport(snap, 'persons');
    expect(r.groups).toHaveLength(4);
    expect(r.transfers.reduce((a, x) => a + x.amountMinor, 0)).toBe(3000);
  });
});
