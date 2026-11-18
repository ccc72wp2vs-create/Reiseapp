/**
 * "Offene Angaben": what is still unclear about a booking, as simple
 * questions that can be answered with one tap (step-by-step clarification).
 */
import { costInfo } from './costs';
import { isTransport } from './trip';
import type { BookingDto } from './types';

export type ClarifyKind = 'confirm' | 'time' | 'persons' | 'note';

export function clarifyQuestions(b: BookingDto, today: string): ClarifyKind[] {
  if (b.bookingStatus === 'cancelled') return [];
  // Only what still lies ahead (or has no date yet) – past trips are not asked about again.
  if (b.startDate && (b.endDate ?? b.startDate) < today) return [];
  const out: ClarifyKind[] = [];
  if (isTransport(b) && (b.bookingStatus === 'planned' || b.bookingStatus === 'unconfirmed')) out.push('confirm');
  if (isTransport(b) && b.startDate && !b.startTime) out.push('time');
  const info = costInfo(b);
  if (info.clarificationReasons.includes('persons_unknown') || info.clarificationReasons.includes('unit_price_unclear')) out.push('persons');
  if (b.clarificationNote) out.push('note');
  return out;
}

/** Bookings with open questions, soonest first (undated last). */
export function bookingsToClarify(bookings: readonly BookingDto[], today: string): { booking: BookingDto; questions: ClarifyKind[] }[] {
  return bookings
    .map((booking) => ({ booking, questions: clarifyQuestions(booking, today) }))
    .filter((x) => x.questions.length > 0)
    .sort((a, b) => (a.booking.startDate ?? '9999').localeCompare(b.booking.startDate ?? '9999') || (a.booking.startTime ?? '').localeCompare(b.booking.startTime ?? ''));
}
