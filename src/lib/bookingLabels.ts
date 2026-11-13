import type { BookingType } from '../../shared/constants';

/** Words for the start / end of a booking, depending on what was booked. */
export const BOOKING_PHASE: Record<BookingType, { start: string; end: string }> = {
  flight: { start: 'Abflug', end: 'Landung' },
  ferry: { start: 'Abfahrt', end: 'Ankunft' },
  train: { start: 'Abfahrt', end: 'Ankunft' },
  bus: { start: 'Abfahrt', end: 'Ankunft' },
  car: { start: 'Abholung', end: 'Rückgabe' },
  hotel: { start: 'Check-in', end: 'Check-out' },
  activity: { start: 'Beginn', end: 'Ende' },
  other: { start: 'Beginn', end: 'Ende' },
};

/** e.g. "Abholung 10:00 Uhr" / "Rückgabe 10:00 Uhr" for a booking on a given day. */
export function bookingTimeLabel(
  b: { type: BookingType; startDate: string | null; startTime: string | null; endDate: string | null; endTime: string | null },
  date: string,
  formatTime: (t: string | null) => string,
  fallback: string,
): string {
  const p = BOOKING_PHASE[b.type];
  const multiDay = !!b.endDate && b.endDate !== b.startDate;
  if (b.startDate === date) {
    const time = formatTime(b.startTime);
    // Single-day items (e.g. a speedboat) just show the time; multi-day ones say what happens.
    return multiDay || b.type === 'hotel' ? `${p.start}${time ? ` ${time}` : ''}` : time || fallback;
  }
  const time = formatTime(b.endTime);
  return `${p.end}${time ? ` ${time}` : ''}`;
}
