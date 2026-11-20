import { describe, expect, it } from 'vitest';
import { homewardCheck } from '../../shared/homeward';
import { hygieneIssues } from '../../shared/hygiene';
import { searchTrip } from '../../shared/search';
import type { TripSnapshot } from '../../shared/types';

const L = { reference: 'Buchungsnr.', provider: 'Anbieter', notes: 'Notiz', flight: 'Flug', route: 'Strecke', address: 'Adresse', stay: 'Unterkunft', place: 'Ort' };
const exp = (id: string, title: string, date: string, minor: number, category = 'food') => ({
  id,
  title,
  date,
  category,
  amountMinor: minor,
  currency: 'THB',
  baseAmountMinor: minor,
  notes: null,
  payers: [{ travelerId: 'a', baseAmountMinor: minor }],
  shares: [
    { travelerId: 'a', baseShareMinor: minor / 2 },
    { travelerId: 'b', baseShareMinor: minor / 2 },
  ],
});
const booking = (o: Record<string, unknown>) => ({
  bookingStatus: 'confirmed',
  paymentStatus: 'paid',
  costKind: 'actual',
  priceMinor: null,
  currency: null,
  expenseId: null,
  travelerIds: ['a'],
  destinationId: 'krabi',
  version: 1,
  notes: null,
  ...o,
});
const base = {
  trip: { id: 't', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' },
  travelers: [
    { id: 'a', name: 'John', partnerId: null },
    { id: 'b', name: 'Lilli', partnerId: null },
  ],
  destinations: [
    { id: 'krabi', name: 'Krabi', arrivalDate: '2026-11-18', departureDate: '2026-11-21', lat: 8.03, lng: 98.82, notes: null },
    { id: 'cnx', name: 'Chiang Mai', arrivalDate: '2026-11-21', departureDate: '2026-11-26', lat: 18.79, lng: 98.98, notes: null },
  ],
  bookings: [
    booking({ id: 'f1', type: 'flight', title: 'FD 3073', reference: 'OCLIFM', startDate: '2026-11-21' }),
    booking({ id: 'h1', type: 'hotel', title: 'Sugar Marina', destinationId: null, travelerIds: [], startDate: '2026-11-22' }),
  ],
  expenses: [exp('e1', 'Inas Restaurant', '2026-11-19', 1510), exp('e2', 'Inas Restaurant', '2026-11-19', 1510), exp('e3', 'Massage', '2026-11-20', 400, 'other')],
  places: [{ id: 'p1', name: 'Railay Beach', lat: 8.01, lng: 98.84, destinationId: null, address: null, description: null, notes: 'Longtail ab Ao Nang', version: 3 }],
  activities: [{ id: 'a1', title: 'Kochkurs', date: '2026-11-23', locationName: null, description: null, notes: null }],
  settlements: [],
  deposits: [],
  todos: [{ id: 't1', title: 'Fähre bestätigen', notes: null, done: false, assigneeTravelerId: 'b', dueDate: null }],
  comments: [{ id: 'c1', entityType: 'booking', entityId: 'h1', userId: 'u', authorName: 'Tim', text: 'Check-in erst ab 15 Uhr', createdAt: '2026-11-19T10:00:00Z' }],
  packingItems: [],
} as unknown as TripSnapshot;

describe('search', () => {
  it('finds booking references, notes and comments, accent-insensitive', () => {
    expect(searchTrip(base, 'oclifm', L)[0]).toMatchObject({ kind: 'booking', id: 'f1', detail: 'Buchungsnr.: OCLIFM' });
    expect(searchTrip(base, 'longtail', L)[0]).toMatchObject({ kind: 'place', id: 'p1' });
    expect(searchTrip(base, 'faehre', L)).toHaveLength(0);
    expect(searchTrip(base, 'fahre', L)[0]).toMatchObject({ kind: 'todo' });
    expect(searchTrip(base, '15 uhr', L)[0]).toMatchObject({ kind: 'comment', targetKind: 'booking', targetId: 'h1', title: 'Sugar Marina' });
    expect(searchTrip(base, 'x', L)).toEqual([]);
  });
});

describe('data care', () => {
  it('flags gaps and offers safe fixes', () => {
    const kinds = hygieneIssues(base).map((i) => [i.kind, i.fix?.destinationId ?? null]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ['place-no-stop', 'krabi'],
        ['booking-no-travelers', null],
        ['booking-no-stop', 'cnx'],
        ['expense-duplicate', null],
      ]),
    );
    expect(hygieneIssues(base).find((i) => i.kind === 'expense-category')).toMatchObject({ suggestion: expect.any(String) });
    // transport bookings never need a stop
    expect(hygieneIssues(base).some((i) => i.target.id === 'f1')).toBe(false);
  });
});

describe('homeward check', () => {
  it('lists open points for the viewer', () => {
    const items = homewardCheck({ ...base, bookings: [...base.bookings, booking({ id: 'f2', type: 'flight', title: 'Rückflug', startDate: '2026-11-26' })] } as TripSnapshot, 'b');
    const by = Object.fromEntries(items.map((i) => [i.key, i.done]));
    expect(by.checkin).toBeUndefined(); // the return flight is John's, not Lilli's
    expect(by.balance).toBe(false); // John paid everything
    expect(by.todos).toBe(false);
    const john = homewardCheck({ ...base, bookings: [...base.bookings, booking({ id: 'f2', type: 'flight', title: 'Rückflug', startDate: '2026-11-26' })] } as TripSnapshot, 'a');
    expect(john.find((i) => i.key === 'checkin')).toMatchObject({ done: false, to: '/buchungen?id=f2' });
    expect(john.find((i) => i.key === 'todos')).toMatchObject({ done: true });
  });
});
