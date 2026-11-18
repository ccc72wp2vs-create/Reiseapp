/**
 * Travel days: the day a stop is left for the next one. Collects what matters
 * on that day – check-out, the transport, check-in – and what is still open.
 * Pure: only reads existing bookings and destinations.
 */
import { costInfo } from './costs';
import { splitStays, staysAt } from './stop';
import { buildRoute, type RouteLeg } from './trip';
import type { BookingDto, DestinationDto, TripDto } from './types';

export type TravelIssue =
  | { kind: 'transport_missing' }
  | { kind: 'transport_unconfirmed'; booking: BookingDto }
  | { kind: 'transport_time_missing'; booking: BookingDto }
  | { kind: 'clarify'; booking: BookingDto }
  | { kind: 'stay_unknown'; destination: DestinationDto };

export interface TravelDay {
  date: string;
  /** 0 = today, 1 = tomorrow. */
  inDays: number;
  leg: RouteLeg;
  from: DestinationDto | null;
  to: DestinationDto | null;
  /** Accommodation(s) left that day (the viewer's own when people stay apart). */
  checkout: BookingDto[];
  /** Accommodation(s) at the new stop. */
  checkin: BookingDto[];
  issues: TravelIssue[];
}

/** The travel day today or tomorrow (today wins), or null. */
export function travelDay(
  trip: Pick<TripDto, 'originName' | 'originLat' | 'originLng' | 'startDate' | 'endDate'>,
  destinations: readonly DestinationDto[],
  bookings: readonly BookingDto[],
  today: string,
  tomorrow: string,
  viewerTravelerId: string | null,
): TravelDay | null {
  const { legs } = buildRoute(trip, destinations, bookings);
  for (const [date, inDays] of [
    [today, 0],
    [tomorrow, 1],
  ] as const) {
    // A leg counts when it starts or (overnight) the move to the next stop is due that day.
    const leg = legs.find((l) => l.date === date || (l.from.destination?.departureDate === date && !!l.to.destination));
    if (!leg) continue;
    const from = leg.from.destination;
    const to = leg.to.destination;
    const own = (list: BookingDto[]) => {
      const { mine } = splitStays(list, viewerTravelerId);
      return mine.length ? mine : list;
    };
    const checkout = from ? own(staysAt(from, bookings)) : [];
    const checkin = to ? own(staysAt(to, bookings)) : [];
    const issues: TravelIssue[] = [];
    const b = leg.booking;
    if (!b) issues.push({ kind: 'transport_missing' });
    else {
      if (b.bookingStatus !== 'booked') issues.push({ kind: 'transport_unconfirmed', booking: b });
      if (!b.startTime) issues.push({ kind: 'transport_time_missing', booking: b });
      if (costInfo(b).needsClarification) issues.push({ kind: 'clarify', booking: b });
    }
    if (to && !checkin.length && !to.accommodationName) issues.push({ kind: 'stay_unknown', destination: to });
    return { date, inDays, leg, from, to, checkout, checkin, issues };
  }
  return null;
}
