import { describe, expect, it } from 'vitest';
import { matchDocument } from '../../shared/documents';
import type { ExtractedDocument } from '../../shared/types';

const doc = (d: Partial<ExtractedDocument>): ExtractedDocument => ({
  kind: null, title: null, provider: null, reference: null, startDate: null, endDate: null,
  amountMinor: null, currency: null, paymentStatus: 'unknown', payerName: null, personsCount: null, ...d,
});
const booking = (id: string, b: Record<string, unknown>) =>
  ({ id, type: 'hotel', title: 'Hotel', provider: null, reference: null, startDate: null, endDate: null, priceMinor: null, currency: null, bookingStatus: 'booked', ...b }) as never;

const bookings = [
  booking('lanta', { title: 'Southern Lanta Resort', provider: 'Booking.com', reference: 'ABC-12345', startDate: '2026-11-13', endDate: '2026-11-18', priceMinor: 92000, currency: 'EUR' }),
  booking('krabi', { title: 'Unterkunft Krabi', startDate: '2026-11-18', endDate: '2026-11-21', priceMinor: 46900, currency: 'EUR' }),
  booking('old', { title: 'Storniert', startDate: '2026-11-18', endDate: '2026-11-21', bookingStatus: 'cancelled' }),
];
const expenses = [
  { id: 'e-lanta', title: 'Unterkunft Koh Lanta', amountMinor: 92000, currency: 'EUR', date: '2026-11-13', bookingId: 'lanta' },
  { id: 'e-dinner', title: 'Abendessen', amountMinor: 137600, currency: 'THB', date: '2026-11-10', bookingId: null },
];

describe('matchDocument', () => {
  it('matches by booking reference (ignoring formatting) and finds the existing expense', () => {
    const m = matchDocument(doc({ reference: 'abc 12345', amountMinor: 92000, currency: 'EUR' }), bookings, expenses);
    expect(m).toEqual({ bookingId: 'lanta', expenseId: 'e-lanta', confidence: 'high', reasons: ['reference', 'amount'] });
  });

  it('matches a hotel invoice by type + dates + amount; booking not yet in the wallet', () => {
    const m = matchDocument(doc({ kind: 'hotel', startDate: '2026-11-18', endDate: '2026-11-21', amountMinor: 46900, currency: 'EUR' }), bookings, expenses);
    expect(m).toMatchObject({ bookingId: 'krabi', expenseId: null, confidence: 'high' });
  });

  it('ignores cancelled bookings and other types', () => {
    const m = matchDocument(doc({ kind: 'flight', startDate: '2026-11-18', endDate: '2026-11-21' }), bookings, expenses);
    expect(m.bookingId).toBeNull();
  });

  it('finds an expense paid on the spot by amount + date', () => {
    const m = matchDocument(doc({ startDate: '2026-11-10', amountMinor: 137600, currency: 'THB' }), bookings, expenses);
    expect(m).toMatchObject({ bookingId: null, expenseId: 'e-dinner', confidence: 'medium' });
  });

  it('returns no match for unknown documents', () => {
    expect(matchDocument(doc({ startDate: '2026-12-01', amountMinor: 100, currency: 'EUR' }), bookings, expenses).confidence).toBe('none');
  });
});
