import { describe, expect, it } from 'vitest';
import { costInfo, summarizeBookingCosts } from '../../shared/costs';
import {
  buildRoute,
  destinationIssues,
  destinationOn,
  overlappingActivities,
  todayIn,
  transferReminders,
  tripPhase,
} from '../../shared/trip';
import type { ActivityDto, BookingDto, DestinationDto } from '../../shared/types';
import { THAILAND_2026 } from '../../worker/services/seedData';

const meta = { version: 1, createdAt: '', updatedAt: '' };
const dests: DestinationDto[] = THAILAND_2026.destinations.map((d, i) => ({
  ...meta,
  id: d.key,
  tripId: 't',
  name: d.name,
  country: d.country,
  arrivalDate: d.arrivalDate,
  departureDate: d.departureDate,
  timezone: d.timezone,
  accommodationName: null,
  accommodationAddress: null,
  accommodationNotes: null,
  lat: d.lat,
  lng: d.lng,
  notes: null,
  coverImageUrl: null,
  sortOrder: i,
}));
const bookings: BookingDto[] = THAILAND_2026.bookings.map((b) => ({
  ...meta,
  id: b.ref,
  tripId: 't',
  title: b.title,
  type: b.type,
  provider: null,
  reference: null,
  startDate: b.startDate,
  startTime: b.startTime,
  startTimezone: b.startTimezone,
  endDate: b.endDate,
  endTime: b.endTime,
  endTimezone: b.endTimezone,
  fromLocation: b.fromLocation,
  toLocation: b.toLocation,
  location: null,
  destinationId: b.destination ?? null,
  fromDestinationId: b.from ?? null,
  toDestinationId: b.to ?? null,
  priceMinor: b.priceMinor,
  currency: b.currency,
  personsCount: b.personsCount,
  unitPriceMinor: b.unitPriceMinor ?? null,
  unitPriceNote: null,
  costKind: b.costKind,
  bookingStatus: b.bookingStatus,
  paymentStatus: b.paymentStatus,
  paidByTravelerId: null,
  clarificationNote: b.clarificationNote,
  notes: null,
  expenseId: null,
  travelerIds: [],
  createdBy: null,
}));
const trip = { ...THAILAND_2026.trip };

describe('trip phase & location', () => {
  it('computes the trip day on 12.11.2026', () => {
    expect(tripPhase(trip, '2026-11-12')).toMatchObject({ phase: 'during', day: 7, totalDays: 21, daysRemaining: 14 });
    expect(tripPhase(trip, '2026-11-01')).toMatchObject({ phase: 'before', daysUntilStart: 5 });
    expect(tripPhase(trip, '2026-11-30').phase).toBe('after');
  });
  it('finds current destination and transfer days', () => {
    expect(destinationOn(dests, '2026-11-12').current?.name).toBe('Phuket');
    const transfer = destinationOn(dests, '2026-11-13');
    expect(transfer).toMatchObject({ isTransferDay: true });
    expect(transfer.leaving?.name).toBe('Phuket');
    expect(transfer.current?.name).toBe('Koh Lanta');
  });
  it('uses the destination time zone for "today"', () => {
    // 23:30 in Germany on 12.11. is already 13.11. in Bangkok
    const now = new Date('2026-11-12T22:30:00Z');
    expect(todayIn('Europe/Berlin', now)).toBe('2026-11-12');
    expect(todayIn('Asia/Bangkok', now)).toBe('2026-11-13');
  });
});

describe('route', () => {
  const route = buildRoute(trip, dests, bookings);
  it('runs Düsseldorf → … → Düsseldorf in order with transport modes', () => {
    expect(route.stops.map((s) => s.name)).toEqual([
      'Düsseldorf',
      'Bangkok',
      'Phuket',
      'Koh Lanta',
      'Krabi',
      'Chiang Mai',
      'Bangkok (Don Mueang)',
      'Düsseldorf',
    ]);
    expect(route.legs.map((l) => l.mode)).toEqual(['flight', 'flight', 'boat', 'boat', 'flight', 'flight', 'flight']);
  });
  it('reminds about unconfirmed transfers only', () => {
    const r = transferReminders(trip, dests, bookings, '2026-11-12');
    expect(r.map((x) => `${x.fromName}→${x.toName}`)).toEqual(['Phuket→Koh Lanta', 'Koh Lanta→Krabi']);
    expect(r.every((x) => x.kind === 'transfer_unconfirmed')).toBe(true);
  });
  it('has no date conflicts in the imported route', () => {
    expect(destinationIssues(trip, dests)).toEqual([]);
  });
  it('detects overlaps and gaps without changing anything', () => {
    const shifted = dests.map((d) => (d.id === 'hkt' ? { ...d, departureDate: '2026-11-14' } : d));
    const issues = destinationIssues(trip, shifted);
    expect(issues.map((i) => i.kind)).toEqual(['overlap']);
    expect(shifted.find((d) => d.id === 'lanta')!.arrivalDate).toBe('2026-11-13');
  });
});

describe('costs', () => {
  it('summarises booked vs. planned without mixing', () => {
    const [eur] = summarizeBookingCosts(bookings);
    expect(eur).toEqual({ currency: 'EUR', committedMinor: 383100, paidMinor: 0, openMinor: 383100, estimatedMinor: 8000, budgetCapMinor: 6000 });
  });
  it('never treats estimates as spent', () => {
    const est = bookings.find((b) => b.id === 'transfer-hkt-lanta')!;
    expect(costInfo({ ...est, paymentStatus: 'paid' }).countsAsSpent).toBe(false);
  });
});

describe('activity conflicts', () => {
  const a = (id: string, s: string | null, e: string | null) => ({ id, date: '2026-11-12', startTime: s, endTime: e, bookingStatus: 'planned' }) as ActivityDto;
  it('flags overlapping times', () => {
    expect([...overlappingActivities([a('1', '09:00', '11:00'), a('2', '10:30', '12:00'), a('3', '12:00', '13:00'), a('4', null, null)])].sort()).toEqual(['1', '2']);
  });
});

describe('trip cost overview', () => {
  it('counts bookings transferred to the wallet only once', async () => {
    const { tripCostOverview } = await import('../../shared/costs');
    const hotel = bookings.find((b) => b.id === 'hotel-hkt')!;
    const transferred = bookings.map((b) => (b.id === 'hotel-hkt' ? { ...b, paymentStatus: 'paid' as const, expenseId: 'e1' } : b));
    const o = tripCostOverview('EUR', [{ baseAmountMinor: hotel.priceMinor! }], transferred);
    expect(o.spentMinor).toBe(46900);
    expect(o.bookedNotInWalletMinor).toBe(383100 - 46900);
    expect(o.plannedMinor).toBe(8000);
    expect(o.budgetCapMinor).toBe(6000);
    expect(o.projectedMinor).toBe(383100 + 8000 + 6000);
  });
});

describe('person cost overview', () => {
  it('attributes shares, planned costs and repayments to a person or couple', async () => {
    const { personCostOverview } = await import('../../shared/costs');
    const expenses = [
      { baseAmountMinor: 383832, payers: [{ travelerId: 'john', amountMinor: 383832, baseAmountMinor: 383832 }], shares: [{ travelerId: 'john', shareMinor: 191916, baseShareMinor: 191916, weight: null }, { travelerId: 'lilli', shareMinor: 191916, baseShareMinor: 191916, weight: null }] },
    ];
    const speedboat = { ...bookings.find((b) => b.id === 'transfer-lanta-kbv')!, priceMinor: 6600, costKind: 'estimate' as const, travelerIds: ['john', 'lilli'] };
    const lilli = personCostOverview('EUR', ['lilli'], expenses, [], [speedboat]);
    expect(lilli).toMatchObject({ spentMinor: 191916, plannedMinor: 3300, projectedMinor: 195216, netPaidMinor: 0, balanceMinor: -191916 });
    const settled = personCostOverview('EUR', ['lilli'], expenses, [{ fromTravelerId: 'lilli', toTravelerId: 'john', baseAmountMinor: 191916 }], [speedboat]);
    expect(settled).toMatchObject({ netPaidMinor: 191916, balanceMinor: 0 });
    const couple = personCostOverview('EUR', ['john', 'lilli'], expenses, [], [speedboat]);
    expect(couple).toMatchObject({ spentMinor: 383832, plannedMinor: 6600, netPaidMinor: 383832, balanceMinor: 0 });
  });
});

describe('cost bucket items', () => {
  it('lists the bookings behind each overview line and matches the totals', async () => {
    const { costBucketItems, tripCostOverview, personCostOverview } = await import('../../shared/costs');
    const bs = bookings.map((b) => ({ ...b, travelerIds: ['a', 'b'] }));
    const items = costBucketItems('EUR', bs);
    const o = tripCostOverview('EUR', [], bs);
    const sumOf = (k: string) => items.filter((i) => i.bucket === k).reduce((a, i) => a + i.amountMinor, 0);
    expect(sumOf('planned')).toBe(o.plannedMinor);
    expect(sumOf('budgetCap')).toBe(o.budgetCapMinor);
    expect(sumOf('bookedNotInWallet')).toBe(o.bookedNotInWalletMinor);
    expect(items.filter((i) => i.bucket === 'planned').map((i) => i.bookingId)).toEqual(['transfer-hkt-lanta']);
    const pa = personCostOverview('EUR', ['a'], [], [], bs);
    const pItems = costBucketItems('EUR', bs, ['a']);
    expect(pItems.filter((i) => i.bucket === 'planned').reduce((x, i) => x + i.amountMinor, 0)).toBe(pa.plannedMinor);
  });
});
