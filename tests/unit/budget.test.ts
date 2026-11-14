import { describe, expect, it } from 'vitest';
import { spendByDestination, spendPerPersonOn } from '../../shared/budget';
import type { DestinationDto } from '../../shared/types';

const dest = (id: string, a: string, d: string, sortOrder: number) =>
  ({ id, name: id, arrivalDate: a, departureDate: d, sortOrder }) as unknown as DestinationDto;
const exp = (date: string, shares: [string, number][], bookingId: string | null = null) => ({
  date,
  bookingId,
  shares: shares.map(([travelerId, baseShareMinor]) => ({ travelerId, baseShareMinor, shareMinor: 0, weight: null })),
});

describe('budget', () => {
  const expenses = [
    exp('2026-11-10', [['A', 1000], ['B', 1000]]),
    exp('2026-11-10', [['A', 500]]),
    exp('2026-11-10', [['A', 9000], ['B', 9000]], 'booking-1'), // pre-booked → ignored
    exp('2026-11-13', [['A', 300], ['B', 300]]),
  ];

  it('averages today’s spending per person and ignores booked costs', () => {
    expect(spendPerPersonOn(expenses, '2026-11-10', ['A', 'B'])).toBe(1250);
    expect(spendPerPersonOn(expenses, '2026-11-10', ['A'])).toBe(1500);
    expect(spendPerPersonOn(expenses, '2026-11-11', ['A', 'B'])).toBe(0);
  });

  it('groups spending by the stop where you slept and counts days so far', () => {
    const ds = [dest('Phuket', '2026-11-09', '2026-11-13', 1), dest('Lanta', '2026-11-13', '2026-11-18', 2), dest('Krabi', '2026-11-18', '2026-11-21', 3)];
    const r = spendByDestination(ds, expenses, ['A', 'B'], '2026-11-14');
    expect(r.map((x) => [x.destination.id, x.totalMinor, x.days])).toEqual([
      ['Phuket', 2500, 4],
      ['Lanta', 600, 2],
    ]);
    expect(r[0].perPersonPerDayMinor).toBe(313);
  });
});

import { missingInWallet } from '../../shared/costs';
describe('missingInWallet', () => {
  const b = (o: Record<string, unknown>) => ({ paymentStatus: 'paid', costKind: 'actual', priceMinor: 100, currency: 'EUR', expenseId: null, bookingStatus: 'booked', ...o }) as never;
  it('finds paid fixed-price bookings that are not in the wallet', () => {
    expect(missingInWallet([b({}), b({ expenseId: 'e' }), b({ paymentStatus: 'unpaid' }), b({ costKind: 'estimate' }), b({ priceMinor: null }), b({ bookingStatus: 'cancelled' })])).toHaveLength(1);
  });
});
