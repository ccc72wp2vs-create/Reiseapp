/**
 * Pure trip logic used by the dashboard, itinerary and route views.
 * Dates are calendar dates ('YYYY-MM-DD') in the local time of the place.
 */
import { TRANSPORT_BOOKING_TYPES, transportModeOf, type TransportMode } from './constants';
import type { ActivityDto, BookingDto, DestinationDto, TripDto } from './types';

const DAY = 86400000;

export function dateToUtc(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}

export function diffDays(a: string, b: string): number {
  return Math.round((dateToUtc(b) - dateToUtc(a)) / DAY);
}

export function addDaysToDate(d: string, n: number): string {
  return new Date(dateToUtc(d) + n * DAY).toISOString().slice(0, 10);
}

export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDaysToDate(d, 1)) out.push(d);
  return out;
}

/** Today's calendar date in a given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Local wall-clock time "HH:MM" in a time zone. */
export function nowTimeIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

export function sortDestinations(ds: readonly DestinationDto[]): DestinationDto[] {
  return [...ds].sort((a, b) => a.sortOrder - b.sortOrder || a.arrivalDate.localeCompare(b.arrivalDate));
}

export interface TripPhase {
  phase: 'before' | 'during' | 'after';
  /** 1-based trip day when during. */
  day: number;
  totalDays: number;
  daysUntilStart: number;
  /** Remaining days after today (0 on the last day). */
  daysRemaining: number;
}

export function tripPhase(trip: Pick<TripDto, 'startDate' | 'endDate'>, today: string): TripPhase {
  const totalDays = diffDays(trip.startDate, trip.endDate) + 1;
  if (today < trip.startDate) {
    return { phase: 'before', day: 0, totalDays, daysUntilStart: diffDays(today, trip.startDate), daysRemaining: totalDays };
  }
  if (today > trip.endDate) return { phase: 'after', day: totalDays, totalDays, daysUntilStart: 0, daysRemaining: 0 };
  return {
    phase: 'during',
    day: diffDays(trip.startDate, today) + 1,
    totalDays,
    daysUntilStart: 0,
    daysRemaining: diffDays(today, trip.endDate),
  };
}

export interface DestinationOnDate {
  /** Where you sleep tonight (arrival <= date < departure). */
  current: DestinationDto | null;
  /** Departure from this destination happens today. */
  leaving: DestinationDto | null;
  next: DestinationDto | null;
  isTransferDay: boolean;
}

export function destinationOn(destinations: readonly DestinationDto[], date: string): DestinationOnDate {
  const ds = sortDestinations(destinations);
  const current = ds.find((d) => d.arrivalDate <= date && date < d.departureDate) ?? null;
  const leaving = ds.find((d) => d.departureDate === date && d !== current) ?? null;
  const next = ds.find((d) => d.arrivalDate > date) ?? null;
  return { current, leaving, next, isTransferDay: !!leaving && !!current };
}

/** Destination whose stay covers the date (used for time zones of a day). */
export function destinationForDate(destinations: readonly DestinationDto[], date: string): DestinationDto | null {
  const ds = sortDestinations(destinations);
  return ds.find((d) => d.arrivalDate <= date && date < d.departureDate) ?? ds.find((d) => d.departureDate === date) ?? null;
}

export function isTransport(b: Pick<BookingDto, 'type'>): boolean {
  return TRANSPORT_BOOKING_TYPES.includes(b.type);
}

export interface RouteStop {
  key: string;
  kind: 'home' | 'destination';
  name: string;
  lat: number | null;
  lng: number | null;
  destination: DestinationDto | null;
}

export interface RouteLeg {
  from: RouteStop;
  to: RouteStop;
  date: string | null;
  booking: BookingDto | null;
  mode: TransportMode;
  /** A destination change without a confirmed transport. */
  needsAttention: boolean;
}

export function buildRoute(
  trip: Pick<TripDto, 'originName' | 'originLat' | 'originLng' | 'startDate' | 'endDate'>,
  destinations: readonly DestinationDto[],
  bookings: readonly BookingDto[],
): { stops: RouteStop[]; legs: RouteLeg[] } {
  const ds = sortDestinations(destinations);
  const home: RouteStop | null = trip.originName
    ? { key: 'home', kind: 'home', name: trip.originName, lat: trip.originLat, lng: trip.originLng, destination: null }
    : null;
  const middle: RouteStop[] = ds.map((d) => ({ key: d.id, kind: 'destination', name: d.name, lat: d.lat, lng: d.lng, destination: d }));
  const stops = [...(home ? [home] : []), ...middle, ...(home ? [{ ...home, key: 'home-return' }] : [])];
  const transports = bookings.filter((b) => isTransport(b) && b.bookingStatus !== 'cancelled');
  const legs: RouteLeg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    const fromId = from.destination?.id ?? null;
    const toId = to.destination?.id ?? null;
    const booking =
      transports.find((b) => (b.fromDestinationId ?? null) === fromId && (b.toDestinationId ?? null) === toId) ??
      // fall back: only the target matches (e.g. origin unspecified)
      transports.find((b) => toId !== null && b.toDestinationId === toId) ??
      null;
    const date = to.destination?.arrivalDate ?? from.destination?.departureDate ?? trip.startDate;
    legs.push({
      from,
      to,
      date: booking?.startDate ?? date,
      booking,
      mode: transportModeOf(booking?.type),
      needsAttention: !booking || booking.bookingStatus === 'planned' || booking.bookingStatus === 'unconfirmed',
    });
  }
  return { stops, legs };
}

// ---------------------------------------------------------------------------
// Conflicts & reminders
// ---------------------------------------------------------------------------

export type DestinationIssue =
  | { kind: 'overlap'; a: DestinationDto; b: DestinationDto }
  | { kind: 'gap'; a: DestinationDto; b: DestinationDto; nights: number }
  | { kind: 'outside'; d: DestinationDto };

export function destinationIssues(trip: Pick<TripDto, 'startDate' | 'endDate'>, destinations: readonly DestinationDto[]): DestinationIssue[] {
  const ds = sortDestinations(destinations);
  const issues: DestinationIssue[] = [];
  for (const d of ds) {
    if (d.arrivalDate < trip.startDate || d.departureDate > trip.endDate) issues.push({ kind: 'outside', d });
  }
  for (let i = 0; i < ds.length - 1; i++) {
    const a = ds[i];
    const b = ds[i + 1];
    if (b.arrivalDate < a.departureDate) issues.push({ kind: 'overlap', a, b });
    else if (b.arrivalDate > a.departureDate) issues.push({ kind: 'gap', a, b, nights: diffDays(a.departureDate, b.arrivalDate) });
  }
  return issues;
}

/** Hotel bookings whose dates do not match their destination's stay. */
export function bookingMismatches(destinations: readonly DestinationDto[], bookings: readonly BookingDto[]) {
  const byId = new Map(destinations.map((d) => [d.id, d]));
  return bookings.filter((b) => {
    if (b.type !== 'hotel' || !b.destinationId || b.bookingStatus === 'cancelled') return false;
    const d = byId.get(b.destinationId);
    if (!d) return false;
    return (b.startDate && b.startDate !== d.arrivalDate) || (b.endDate && b.endDate !== d.departureDate);
  });
}

/** IDs of activities whose time ranges overlap within the same day. */
export function overlappingActivities(activities: readonly ActivityDto[]): Set<string> {
  const out = new Set<string>();
  const timed = activities.filter((a) => a.startTime && a.bookingStatus !== 'cancelled');
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (a.date !== b.date) continue;
      const aEnd = a.endTime ?? a.startTime!;
      const bEnd = b.endTime ?? b.startTime!;
      const overlap = a.startTime! < bEnd && b.startTime! < aEnd;
      const same = a.startTime === b.startTime;
      if (overlap || same) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}

export interface Reminder {
  kind: 'transfer_unconfirmed' | 'transport_missing';
  date: string | null;
  fromName: string;
  toName: string;
  booking: BookingDto | null;
}

/** Upcoming destination changes whose transport is missing or not confirmed. */
export function transferReminders(
  trip: Pick<TripDto, 'originName' | 'originLat' | 'originLng' | 'startDate' | 'endDate'>,
  destinations: readonly DestinationDto[],
  bookings: readonly BookingDto[],
  today: string,
): Reminder[] {
  const { legs } = buildRoute(trip, destinations, bookings);
  return legs
    .filter((l) => l.needsAttention && (l.date ?? '9999') >= today)
    .map((l) => ({
      kind: l.booking ? 'transfer_unconfirmed' : 'transport_missing',
      date: l.date,
      fromName: l.from.name,
      toName: l.to.name,
      booking: l.booking,
    }));
}

/** Chronological sort key for bookings (date + time, undated last). */
export function bookingSortKey(b: Pick<BookingDto, 'startDate' | 'startTime'>): string {
  return `${b.startDate ?? '9999-12-31'}T${b.startTime ?? '99:99'}`;
}

export function bookingsOnDate(bookings: readonly BookingDto[], date: string): BookingDto[] {
  return bookings
    .filter((b) => b.bookingStatus !== 'cancelled' && (b.startDate === date || (isTransport(b) && b.endDate === date && b.startDate !== date)))
    .sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)));
}

export function nextTransport(bookings: readonly BookingDto[], today: string): BookingDto | null {
  return (
    bookings
      .filter((b) => isTransport(b) && b.bookingStatus !== 'cancelled' && (b.startDate ?? '') >= today)
      .sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)))[0] ?? null
  );
}
