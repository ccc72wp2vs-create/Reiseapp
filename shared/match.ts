/**
 * Finds wallet expenses and bookings that describe the same thing, so a cost
 * is not counted twice (once as a booking estimate, once as an expense).
 * Pure scoring – the user always confirms before anything is linked.
 */
import { diffDays } from './trip';
import type { BookingDto, ExpenseDto } from './types';

type BookingLike = Pick<
  BookingDto,
  'id' | 'title' | 'type' | 'startDate' | 'fromLocation' | 'toLocation' | 'location' | 'priceMinor' | 'currency' | 'bookingStatus' | 'expenseId' | 'provider'
>;
type ExpenseLike = Pick<ExpenseDto, 'title' | 'amountMinor' | 'currency' | 'date' | 'category'> & { bookingId?: string | null };

const TYPE_WORDS: [BookingDto['type'], RegExp][] = [
  ['ferry', /fähre|faehre|boot|boat|speedboat|ferry|longtail|katamaran|überfahrt/],
  ['flight', /flug|flight|airline|airasia|vietjet|bangkok airways|nok air|lion air|emirates/],
  ['hotel', /hotel|unterkunft|airbnb|resort|hostel|bungalow|villa|übernachtung|guesthouse/],
  ['bus', /bus|minivan|van\b|shuttle|transfer|taxi|grab|songthaew/],
  ['train', /zug|bahn|train/],
  ['car', /mietwagen|auto|jeep|roller|scooter|moped|car rental/],
  ['activity', /tour|ausflug|kurs|ticket|eintritt|schnorchel|tauch|massage|show/],
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9äöü ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !['nach', 'from', 'with', 'für', 'fuer', 'und', 'oder', 'flug', 'fähre'].includes(w));

export interface MatchSuggestion<T> {
  item: T;
  score: number;
  reasons: string[];
}

export function matchScore(e: ExpenseLike, b: BookingLike): MatchSuggestion<BookingLike> {
  let score = 0;
  const reasons: string[] = [];
  const t = e.title.toLowerCase();
  const typeHit = TYPE_WORDS.find(([, re]) => re.test(t))?.[0];
  if (typeHit && typeHit === b.type) {
    score += 3;
    reasons.push('gleiche Art');
  } else if (typeHit && (typeHit === 'bus' || typeHit === 'car') && (b.type === 'bus' || b.type === 'car' || b.type === 'other')) {
    score += 2;
    reasons.push('ähnliche Art');
  }
  const words = new Set(norm(e.title));
  const bookingWords = new Set(norm([b.title, b.fromLocation, b.toLocation, b.location, b.provider].filter(Boolean).join(' ')));
  const shared = [...words].filter((w) => bookingWords.has(w));
  if (shared.length) {
    score += Math.min(shared.length * 2, 4);
    reasons.push(`„${shared.join('“, „')}“`);
  }
  const transport = ['flight', 'ferry', 'train', 'bus', 'car'].includes(b.type);
  if ((e.category === 'transportation' && transport) || (e.category === 'accommodation' && b.type === 'hotel') || (e.category === 'activities' && b.type === 'activity')) {
    score += 1;
  }
  if (b.priceMinor != null && b.currency === e.currency && b.priceMinor > 0) {
    const ratio = e.amountMinor / b.priceMinor;
    if (ratio > 0.7 && ratio < 1.3) {
      score += ratio > 0.97 && ratio < 1.03 ? 3 : 1;
      reasons.push('ähnlicher Betrag');
    }
  }
  if (b.startDate && e.date) {
    const d = Math.abs(diffDays(e.date, b.startDate));
    if (d <= 10) score += d <= 1 ? 2 : 1;
  }
  return { item: b, score, reasons };
}

/** Threshold: kind + one shared place/word, or several weaker signals. */
export const MATCH_THRESHOLD = 5;

/** Bookings that are probably the same cost as this (not yet linked) expense. */
export function bookingsMatchingExpense<B extends BookingLike>(e: ExpenseLike, bookings: readonly B[]): MatchSuggestion<B>[] {
  if (e.bookingId || !e.title.trim()) return [];
  return bookings
    .filter((b) => !b.expenseId && b.bookingStatus !== 'cancelled')
    .map((b) => matchScore(e, b) as MatchSuggestion<B>)
    .filter((m) => m.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

/** Unlinked expenses that probably are this booking. */
export function expensesMatchingBooking<E extends ExpenseLike & { id: string }>(b: BookingLike, expenses: readonly E[]): MatchSuggestion<E>[] {
  if (b.expenseId || b.bookingStatus === 'cancelled') return [];
  return expenses
    .filter((e) => !e.bookingId)
    .map((e) => ({ ...matchScore(e, b), item: e }))
    .filter((m) => m.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}
