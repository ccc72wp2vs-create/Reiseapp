import { describe, expect, it } from 'vitest';
import { stopOverview } from '../../shared/stop';
import type { TripSnapshot } from '../../shared/types';

const dest = (id: string, name: string, arrivalDate: string, departureDate: string, sortOrder: number) =>
  ({ id, name, arrivalDate, departureDate, sortOrder, timezone: 'Asia/Bangkok', lat: null, lng: null, accommodationName: null }) as never;
const booking = (o: Record<string, unknown>) =>
  ({ bookingStatus: 'booked', costKind: 'actual', paymentStatus: 'paid', currency: 'EUR', priceMinor: null, expenseId: null, destinationId: null, startTime: null, ...o }) as never;

const snap = {
  trip: { startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR', originName: null, originLat: null, originLng: null },
  destinations: [dest('lanta', 'Koh Lanta', '2026-11-14', '2026-11-18', 0), dest('krabi', 'Krabi', '2026-11-18', '2026-11-21', 1), dest('cm', 'Chiang Mai', '2026-11-21', '2026-11-24', 2)],
  bookings: [
    booking({ id: 'hotel', type: 'hotel', title: 'Krabi Resort', startDate: '2026-11-18', destinationId: 'krabi', priceMinor: 30000, paymentStatus: 'open' }),
    booking({ id: 'tour', type: 'activity', title: 'Bootstour', startDate: '2026-11-19', priceMinor: 5000, costKind: 'estimate' }),
    booking({ id: 'other', type: 'activity', title: 'Lanta Tour', startDate: '2026-11-15' }),
  ],
  activities: [
    { id: 'a1', date: '2026-11-20', title: 'Strand', startTime: null },
    { id: 'a2', date: '2026-11-21', title: 'Abflug-Tag', startTime: null },
  ],
  places: [{ id: 'p1', destinationId: 'krabi', name: 'Railay' }, { id: 'p2', destinationId: 'lanta', name: 'X' }],
  expenses: [
    { id: 'e1', date: '2026-11-19', baseAmountMinor: 1200, bookingId: null },
    { id: 'e2', date: '2026-11-21', baseAmountMinor: 999, bookingId: null },
    { id: 'e3', date: '2026-11-15', baseAmountMinor: 500, bookingId: null },
  ],
} as unknown as TripSnapshot;

describe('stopOverview', () => {
  it('collects plan, stay, legs, places and costs of one stop', () => {
    const o = stopOverview(snap, 'krabi', '2026-11-16')!;
    expect(o.when).toBe('future');
    expect(o.days).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);
    expect(o.activitiesByDay['2026-11-20'].map((a) => a.id)).toEqual(['a1']);
    expect(o.bookingsByDay['2026-11-19'].map((b) => b.id)).toEqual(['tour']);
    expect(o.stayBooking?.id).toBe('hotel');
    expect(o.arrival?.from.name).toBe('Koh Lanta');
    expect(o.departure?.to.name).toBe('Chiang Mai');
    expect(o.places.map((p) => p.id)).toEqual(['p1']);
    expect(o.expenses.map((e) => e.id)).toEqual(['e1']);
    expect(o.costs).toMatchObject({ spentMinor: 1200, bookedNotInWalletMinor: 30000, plannedMinor: 5000 });
  });

  it('knows past and current stops', () => {
    expect(stopOverview(snap, 'lanta', '2026-11-19')!.when).toBe('past');
    expect(stopOverview(snap, 'krabi', '2026-11-18')!.when).toBe('now');
    expect(stopOverview(snap, 'nope', '2026-11-18')).toBeNull();
  });
});
