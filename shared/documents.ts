/**
 * Matching an uploaded receipt / confirmation against what the trip already
 * knows. Pure function, shared by worker and app, covered by unit tests.
 *
 * Order of evidence (strongest first):
 *  1. same booking reference
 *  2. same type + same dates (+ same amount)
 *  3. same amount + currency on a booking / expense in the date range
 */
import type { BookingDto, ExpenseDto, ExtractedDocument } from './types';

export interface DocumentMatch {
  bookingId: string | null;
  /** Expense that already covers this payment (linked to the booking or matching by amount/date). */
  expenseId: string | null;
  confidence: 'high' | 'medium' | 'none';
  reasons: ('reference' | 'dates' | 'amount' | 'title')[];
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function words(s: string | null | undefined): Set<string> {
  return new Set((s ?? '').toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((w) => w.length > 3));
}

export function matchDocument(
  doc: ExtractedDocument,
  bookings: readonly Pick<BookingDto, 'id' | 'type' | 'title' | 'provider' | 'reference' | 'startDate' | 'endDate' | 'priceMinor' | 'currency' | 'bookingStatus'>[],
  expenses: readonly Pick<ExpenseDto, 'id' | 'title' | 'amountMinor' | 'currency' | 'date' | 'bookingId'>[],
): DocumentMatch {
  const active = bookings.filter((b) => b.bookingStatus !== 'cancelled');
  const sameAmount = (a: number | null | undefined, c: string | null | undefined) =>
    doc.amountMinor != null && a != null && a === doc.amountMinor && !!c && c === doc.currency;
  const expenseFor = (bookingId: string) => expenses.find((e) => e.bookingId === bookingId)?.id ?? null;

  // 1. Booking reference
  const ref = norm(doc.reference);
  if (ref.length >= 4) {
    const b = active.find((x) => norm(x.reference) === ref);
    if (b) {
      const reasons: DocumentMatch['reasons'] = ['reference'];
      if (sameAmount(b.priceMinor, b.currency)) reasons.push('amount');
      return { bookingId: b.id, expenseId: expenseFor(b.id), confidence: 'high', reasons };
    }
  }

  // 2. Type + dates (+ amount / title words)
  if (doc.startDate) {
    let best: { b: (typeof active)[number]; score: number; reasons: DocumentMatch['reasons'] } | null = null;
    for (const b of active) {
      if (b.startDate !== doc.startDate) continue;
      if (doc.endDate && b.endDate && b.endDate !== doc.endDate) continue;
      if (doc.kind && doc.kind !== b.type) continue;
      const reasons: DocumentMatch['reasons'] = ['dates'];
      let score = 1;
      if (sameAmount(b.priceMinor, b.currency)) {
        reasons.push('amount');
        score += 2;
      }
      const dw = new Set([...words(doc.title), ...words(doc.provider)]);
      if ([...words(b.title), ...words(b.provider)].some((w) => dw.has(w))) {
        reasons.push('title');
        score += 1;
      }
      if (!best || score > best.score) best = { b, score, reasons };
    }
    if (best) {
      return { bookingId: best.b.id, expenseId: expenseFor(best.b.id), confidence: best.score >= 2 ? 'high' : 'medium', reasons: best.reasons };
    }
  }

  // 3. An expense with the same amount in the period (e.g. paid on the spot, no booking)
  if (doc.amountMinor != null && doc.currency) {
    const from = doc.startDate ?? null;
    const to = doc.endDate ?? doc.startDate ?? null;
    const e = expenses.find((x) => sameAmount(x.amountMinor, x.currency) && (!from || (x.date >= from && x.date <= (to ?? from))));
    if (e) return { bookingId: e.bookingId, expenseId: e.id, confidence: 'medium', reasons: ['amount'] };
    const b = active.find((x) => sameAmount(x.priceMinor, x.currency) && (!doc.kind || doc.kind === x.type));
    if (b) return { bookingId: b.id, expenseId: expenseFor(b.id), confidence: 'medium', reasons: ['amount'] };
  }

  return { bookingId: null, expenseId: null, confidence: 'none', reasons: [] };
}
