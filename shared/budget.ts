/**
 * Day-to-day spending: everything in the wallet that is not a pre-booked
 * accommodation/flight (expenses linked to a booking are excluded).
 */
import { diffDays, sortDestinations } from './trip';
import type { DestinationDto, ExpenseDto } from './types';

type Exp = Pick<ExpenseDto, 'date' | 'bookingId' | 'shares'>;

const onTheGround = (e: Exp) => !e.bookingId;

/** Sum of the persons' shares (base currency) of on-the-ground expenses. */
function shareOf(e: Exp, persons: readonly string[]): number {
  return e.shares.filter((s) => persons.includes(s.travelerId)).reduce((a, s) => a + s.baseShareMinor, 0);
}

/** Average spending per selected person on a date (base currency minor units). */
export function spendPerPersonOn(expenses: readonly Exp[], date: string, persons: readonly string[]): number {
  if (!persons.length) return 0;
  const total = expenses.filter((e) => onTheGround(e) && e.date === date).reduce((a, e) => a + shareOf(e, persons), 0);
  return Math.round(total / persons.length);
}

export interface PlaceSpend {
  destination: DestinationDto;
  /** Total of the selected persons' shares while staying there. */
  totalMinor: number;
  /** Days counted so far (whole stay once it is over). */
  days: number;
  perPersonPerDayMinor: number;
}

/**
 * Spending per stop of the route. An expense belongs to the stop where the
 * travelers slept that night (arrival ≤ date < departure). Future stops are
 * left out.
 */
export function spendByDestination(
  destinations: readonly DestinationDto[],
  expenses: readonly Exp[],
  persons: readonly string[],
  today: string,
): PlaceSpend[] {
  const out: PlaceSpend[] = [];
  for (const d of sortDestinations(destinations)) {
    if (d.arrivalDate > today) continue;
    const end = today < d.departureDate ? today : d.departureDate;
    const days = Math.max(1, diffDays(d.arrivalDate, end) + (today < d.departureDate ? 1 : 0));
    const totalMinor = expenses
      .filter((e) => onTheGround(e) && e.date >= d.arrivalDate && e.date < d.departureDate)
      .reduce((a, e) => a + shareOf(e, persons), 0);
    out.push({
      destination: d,
      totalMinor,
      days,
      perPersonPerDayMinor: persons.length ? Math.round(totalMinor / persons.length / days) : 0,
    });
  }
  return out;
}
