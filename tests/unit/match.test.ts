import { describe, expect, it } from 'vitest';
import { bookingsMatchingExpense, expensesMatchingBooking } from '../../shared/match';
import type { BookingDto } from '../../shared/types';

const booking = (o: Partial<BookingDto>) =>
  ({
    id: 'b', title: 'Speedboat Koh Lanta → Krabi', type: 'ferry', startDate: '2026-11-18', fromLocation: 'Koh Lanta', toLocation: 'Krabi', location: null,
    priceMinor: 13200, currency: 'EUR', bookingStatus: 'booked', expenseId: null, provider: '12Go', costKind: 'estimate', ...o,
  }) as BookingDto;
const ferryExpense = { title: 'Fähre nach Krabi', amountMinor: 9000, currency: 'EUR', date: '2026-11-13', category: 'transportation' as const };

describe('expense ↔ booking matching', () => {
  it('recognises the real case: "Fähre nach Krabi" = "Speedboat Koh Lanta → Krabi"', () => {
    const m = bookingsMatchingExpense(ferryExpense, [booking({}), booking({ id: 'h', title: 'Hotel Krabi', type: 'hotel', toLocation: null, fromLocation: null, location: 'Krabi' })]);
    expect(m[0].item.id).toBe('b');
    expect(m.map((x) => x.item.id)).not.toContain('h');
  });

  it('ignores linked or cancelled bookings and already linked expenses', () => {
    expect(bookingsMatchingExpense(ferryExpense, [booking({ expenseId: 'x' })])).toEqual([]);
    expect(bookingsMatchingExpense(ferryExpense, [booking({ bookingStatus: 'cancelled' })])).toEqual([]);
    expect(bookingsMatchingExpense({ ...ferryExpense, bookingId: 'b' }, [booking({})])).toEqual([]);
  });

  it('does not match unrelated everyday expenses', () => {
    for (const title of ['Abendessen', 'Sushi', 'Tokyo x Luca', 'Zenmaya', 'Wasser & Snacks']) {
      expect(bookingsMatchingExpense({ title, amountMinor: 4000, currency: 'THB', date: '2026-11-18', category: 'food' }, [booking({})])).toEqual([]);
    }
  });

  it('finds the expense from the booking side', () => {
    const m = expensesMatchingBooking(booking({}), [{ id: 'e1', ...ferryExpense, bookingId: null }, { id: 'e2', title: 'Sushi', amountMinor: 292600, currency: 'THB', date: '2026-11-10', category: 'food' }]);
    expect(m.map((x) => x.item.id)).toEqual(['e1']);
  });
});
