import { describe, expect, it } from 'vitest';
import { bookingsToClarify, clarifyQuestions } from '../../shared/clarify';
import type { BookingDto } from '../../shared/types';

const bk = (o: Partial<BookingDto>) =>
  ({ bookingStatus: 'booked', costKind: 'actual', paymentStatus: 'paid', travelerIds: [], startTime: '09:00', personsCount: 2, clarificationNote: null, unitPriceMinor: null, priceMinor: 1000, currency: 'EUR', ...o }) as BookingDto;

describe('clarify questions', () => {
  it('asks only what is really open', () => {
    expect(clarifyQuestions(bk({ type: 'ferry', startDate: '2026-11-18', bookingStatus: 'unconfirmed', startTime: null }), '2026-11-18')).toEqual(['confirm', 'time']);
    expect(clarifyQuestions(bk({ type: 'hotel', startDate: '2026-11-21', personsCount: null }), '2026-11-18')).toEqual(['persons']);
    expect(clarifyQuestions(bk({ type: 'activity', startDate: '2026-11-21', clarificationNote: 'Preis pro Person?' }), '2026-11-18')).toEqual(['note']);
    expect(clarifyQuestions(bk({ type: 'ferry', startDate: '2026-11-10', bookingStatus: 'unconfirmed' }), '2026-11-18')).toEqual([]);
    expect(clarifyQuestions(bk({ type: 'ferry', startDate: '2026-11-20', bookingStatus: 'cancelled', startTime: null }), '2026-11-18')).toEqual([]);
  });
  it('sorts soonest first', () => {
    const list = bookingsToClarify(
      [bk({ id: 'b', type: 'hotel', startDate: '2026-11-25', personsCount: null }), bk({ id: 'a', type: 'bus', startDate: '2026-11-19', startTime: null })],
      '2026-11-18',
    );
    expect(list.map((x) => x.booking.id)).toEqual(['a', 'b']);
  });
});

describe('past bookings', () => {
  it('are not asked about again', () => {
    expect(clarifyQuestions(bk({ type: 'flight', startDate: '2026-11-06', clarificationNote: 'Flugnummer fehlt' }), '2026-11-18')).toEqual([]);
    expect(clarifyQuestions(bk({ type: 'hotel', startDate: '2026-11-14', endDate: '2026-11-18', personsCount: null }), '2026-11-18')).toEqual(['persons']);
  });
});
