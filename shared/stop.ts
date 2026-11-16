/**
 * Everything that belongs to one stop (destination) of the route – used when
 * the home screen is switched to a stop. Pure filtering of existing data:
 * a stop covers the nights from arrival up to (not including) departure.
 */
import { tripCostOverview, type TripCostOverview } from './costs';
import { bookingSortKey, buildRoute, eachDate, isTransport, sortDestinations, type RouteLeg } from './trip';
import type { ActivityDto, BookingDto, DestinationDto, ExpenseDto, PlaceDto, TripSnapshot } from './types';

export interface StopOverview {
  stop: DestinationDto;
  /** 'past': already left, 'now': staying there today, 'future': still ahead. */
  when: 'past' | 'now' | 'future';
  /** Days of the stay (arrival … day before departure; at least the arrival day). */
  days: string[];
  activitiesByDay: Record<string, ActivityDto[]>;
  bookingsByDay: Record<string, BookingDto[]>;
  /** Accommodation bookings of this stop (several when people stay apart). */
  stays: BookingDto[];
  /** All (not cancelled) bookings of this stop. */
  bookings: BookingDto[];
  arrival: RouteLeg | null;
  departure: RouteLeg | null;
  /** Other bookings of this stop (not the stay, not the arrival/departure transport). */
  otherBookings: BookingDto[];
  places: PlaceDto[];
  expenses: ExpenseDto[];
  costs: TripCostOverview;
}

const inStay = (d: DestinationDto, date: string | null) => !!date && d.arrivalDate <= date && date < d.departureDate;

export function stopOverview(
  snap: Pick<TripSnapshot, 'trip' | 'destinations' | 'bookings' | 'activities' | 'places' | 'expenses'>,
  stopId: string,
  today: string,
): StopOverview | null {
  const stop = sortDestinations(snap.destinations).find((d) => d.id === stopId);
  if (!stop) return null;
  const when = today >= stop.departureDate ? 'past' : today >= stop.arrivalDate ? 'now' : 'future';
  const all = eachDate(stop.arrivalDate, stop.departureDate);
  const days = all.length > 1 ? all.slice(0, -1) : all;

  const active = snap.bookings.filter((b) => b.bookingStatus !== 'cancelled');
  const bookings = active
    .filter((b) => b.destinationId === stop.id || (!b.destinationId && inStay(stop, b.startDate)))
    .sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)));

  const route = buildRoute(snap.trip, snap.destinations, snap.bookings);
  const arrival = route.legs.find((l) => l.to.destination?.id === stop.id) ?? null;
  const departure = route.legs.find((l) => l.from.destination?.id === stop.id) ?? null;
  const stays = bookings.filter((b) => b.type === 'hotel');
  const shown = new Set([...stays.map((b) => b.id), arrival?.booking?.id, departure?.booking?.id].filter(Boolean));
  const otherBookings = bookings.filter(
    (b) => !shown.has(b.id) && !(isTransport(b) && (b.startDate === stop.arrivalDate || b.startDate === stop.departureDate)),
  );

  const activitiesByDay: Record<string, ActivityDto[]> = {};
  const bookingsByDay: Record<string, BookingDto[]> = {};
  for (const d of days) {
    activitiesByDay[d] = snap.activities.filter((a) => a.date === d).sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
    bookingsByDay[d] = otherBookings.filter((b) => b.startDate === d);
  }

  const bookingIds = new Set(bookings.map((b) => b.id));
  const expenses = snap.expenses.filter((e) => (e.bookingId ? bookingIds.has(e.bookingId) : inStay(stop, e.date)));
  const costs = tripCostOverview(snap.trip.baseCurrency, expenses, bookings);
  const places = snap.places.filter((p) => p.destinationId === stop.id);

  return {
    stop,
    when,
    days,
    activitiesByDay,
    bookingsByDay,
    stays,
    bookings,
    arrival,
    departure,
    otherBookings,
    places,
    expenses,
    costs,
  };
}

/** Accommodation bookings for a stop (not cancelled), in booking order. */
export function staysAt(stop: DestinationDto, bookings: readonly BookingDto[]): BookingDto[] {
  return bookings
    .filter((b) => b.type === 'hotel' && b.bookingStatus !== 'cancelled' && (b.destinationId === stop.id || (!b.destinationId && inStay(stop, b.startDate))))
    .sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)));
}

/**
 * Splits a stop's accommodations into the viewer's own (they travel on it, or
 * nobody is assigned) and the others'. Without a viewer, all are "mine".
 */
export function splitStays<B extends Pick<BookingDto, 'travelerIds'>>(stays: readonly B[], viewerTravelerId: string | null): { mine: B[]; others: B[] } {
  if (!viewerTravelerId) return { mine: [...stays], others: [] };
  const mine = stays.filter((b) => !b.travelerIds.length || b.travelerIds.includes(viewerTravelerId));
  return { mine, others: stays.filter((b) => !mine.includes(b)) };
}
