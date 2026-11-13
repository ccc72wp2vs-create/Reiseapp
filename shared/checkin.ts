import { diffDays } from './trip';
import type { BookingDto } from './types';

/**
 * Online check-in reminders for flights.
 *
 * The airline table only contains links and time windows taken from the
 * airlines' own websites (as of 11/2026). `windowConfirmed: false` marks
 * airlines whose window is published inconsistently: the app then reminds
 * conservatively (24 h before departure) and says so instead of promising
 * a time it cannot back up.
 */
export interface AirlineCheckin {
  /** IATA designator, e.g. "PG". */
  code: string;
  name: string;
  /** Official check-in or check-in information page; null = no confirmed deep link. */
  url: string | null;
  /** Online check-in opens this many hours before departure. */
  opensHours: number;
  /** Online check-in closes this many minutes before departure. */
  closesMinutes: number;
  /** Window confirmed on the airline's own website. */
  windowConfirmed: boolean;
}

export const AIRLINES: readonly AirlineCheckin[] = [
  // bangkokair.com/flight/check-in: "24 hours until 1 hour before departure"
  { code: 'PG', name: 'Bangkok Airways', url: 'https://www.bangkokair.com/flight/check-in', opensHours: 24, closesMinutes: 60, windowConfirmed: true },
  // thaiairways.com: Internet check-in "1 to 24 hours before departure"
  { code: 'TG', name: 'Thai Airways', url: 'https://www.thaiairways.com/en-us/content/check-in/', opensHours: 24, closesMinutes: 60, windowConfirmed: true },
  // vietjetair.com/en/checkin: 24 h before, closes 60 min (domestic) / 90 min (international) — use the stricter value
  { code: 'VJ', name: 'Vietjet', url: 'https://www.vietjetair.com/en/checkin', opensHours: 24, closesMinutes: 90, windowConfirmed: true },
  // emirates.com: 48 h to 90 min before departure
  { code: 'EK', name: 'Emirates', url: 'https://www.emirates.com/english/manage-booking/online-check-in/', opensHours: 48, closesMinutes: 90, windowConfirmed: true },
  // qatarairways.com: 48 h to 90 min (24 h for U.S. flights)
  { code: 'QR', name: 'Qatar Airways', url: 'https://www.qatarairways.com/en-pl/services-checking-in.html', opensHours: 48, closesMinutes: 90, windowConfirmed: true },
  // turkishairlines.com: 24 h to 90 min before departure
  { code: 'TK', name: 'Turkish Airlines', url: 'https://www.turkishairlines.com/en-int/any-questions/check-in/', opensHours: 24, closesMinutes: 90, windowConfirmed: true },
  // eurowings.com: earliest 72 h, latest 3 h before departure (40 min at most German airports)
  { code: 'EW', name: 'Eurowings', url: 'https://www.eurowings.com/en/faq/check-in/online-check-in.html', opensHours: 72, closesMinutes: 180, windowConfirmed: true },
  // Published windows differ between sources — remind conservatively, no deep link.
  { code: 'FD', name: 'Thai AirAsia', url: null, opensHours: 24, closesMinutes: 60, windowConfirmed: false },
  { code: 'VZ', name: 'Thai Vietjet', url: null, opensHours: 24, closesMinutes: 60, windowConfirmed: false },
  { code: 'SL', name: 'Thai Lion Air', url: null, opensHours: 24, closesMinutes: 60, windowConfirmed: false },
  { code: 'DD', name: 'Nok Air', url: null, opensHours: 24, closesMinutes: 60, windowConfirmed: false },
  { code: 'LH', name: 'Lufthansa', url: null, opensHours: 23, closesMinutes: 45, windowConfirmed: false },
  { code: 'EY', name: 'Etihad', url: null, opensHours: 30, closesMinutes: 60, windowConfirmed: false },
];

/** Fallback for unknown airlines: remind 24 h before departure. */
const DEFAULT_WINDOW = { opensHours: 24, closesMinutes: 60 };

/** "pg123" / "PG 123" → "PG 123"; null if it doesn't look like a flight number. */
export function normalizeFlightNumber(raw: string | null | undefined): string | null {
  const m = (raw ?? '').trim().toUpperCase().match(/^([A-Z0-9]{2})\s?(\d{1,4}[A-Z]?)$/);
  return m ? `${m[1]} ${m[2]}` : null;
}

export function airlineFor(flightNumber: string | null | undefined): AirlineCheckin | null {
  const n = normalizeFlightNumber(flightNumber);
  if (!n) return null;
  return AIRLINES.find((a) => a.code === n.slice(0, 2)) ?? null;
}

/** Wall-clock date/time in an IANA zone → UTC epoch ms. */
export function zonedToUtc(date: string, time: string, timeZone: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - ms;
  };
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

export type CheckinState = 'upcoming' | 'open' | 'closing' | 'closed' | 'done';

export interface CheckinInfo {
  booking: BookingDto;
  airline: AirlineCheckin | null;
  flightNumber: string | null;
  departureMs: number;
  opensMs: number;
  closesMs: number;
  state: CheckinState;
}

/** Remind on the home screen from this long before check-in opens. */
const UPCOMING_LEAD_MS = 12 * 3600_000;
/** "closing" when less than this remains. */
const CLOSING_MS = 3 * 3600_000;

export function checkinInfo(booking: BookingDto, now: number, fallbackTimeZone: string): CheckinInfo | null {
  if (booking.type !== 'flight' || booking.bookingStatus === 'cancelled') return null;
  if (!booking.startDate || !booking.startTime) return null;
  const departureMs = zonedToUtc(booking.startDate, booking.startTime, booking.startTimezone || fallbackTimeZone);
  const flightNumber = normalizeFlightNumber(booking.flightNumber);
  const airline = airlineFor(flightNumber);
  const win = airline ?? DEFAULT_WINDOW;
  const opensMs = departureMs - win.opensHours * 3600_000;
  const closesMs = departureMs - win.closesMinutes * 60_000;
  let state: CheckinState;
  if (booking.checkinDoneAt) state = 'done';
  else if (now >= closesMs) state = 'closed';
  else if (now >= opensMs) state = closesMs - now <= CLOSING_MS ? 'closing' : 'open';
  else state = 'upcoming';
  return { booking, airline, flightNumber, departureMs, opensMs, closesMs, state };
}

/**
 * Flights that need attention now: check-in open/closing, or opening within
 * the next 12 hours. Done and past flights are left out. Soonest first.
 */
export function checkinReminders(bookings: readonly BookingDto[], now: number, fallbackTimeZone: string): CheckinInfo[] {
  return bookings
    .map((b) => checkinInfo(b, now, fallbackTimeZone))
    .filter((i): i is CheckinInfo => !!i)
    .filter((i) => i.state === 'open' || i.state === 'closing' || (i.state === 'upcoming' && i.opensMs - now <= UPCOMING_LEAD_MS))
    .sort((a, b) => a.departureMs - b.departureMs);
}

/**
 * Flights today or tomorrow without a departure time: the reminder can't be
 * computed, so the home screen asks for the time instead of staying silent.
 */
export function flightsMissingTime(bookings: readonly BookingDto[], today: string): BookingDto[] {
  return bookings.filter((b) => {
    if (b.type !== 'flight' || b.bookingStatus === 'cancelled' || b.checkinDoneAt || b.startTime || !b.startDate) return false;
    const d = diffDays(today, b.startDate);
    return d >= 0 && d <= 1;
  });
}
