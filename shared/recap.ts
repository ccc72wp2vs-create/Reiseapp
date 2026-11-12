/** Numbers for the trip recap ("Rückblick"). Pure, unit-tested. */
import { buildRoute, diffDays, isTransport } from './trip';
import type { TripSnapshot } from './types';

/** Great-circle distance in km. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Recap {
  /** Days so far (whole trip once it is over). */
  days: number;
  totalDays: number;
  finished: boolean;
  stops: number;
  /** Straight-line distance along the route (incl. home if known), km. */
  distanceKm: number;
  transports: number;
  activitiesDone: number;
  placesSaved: number;
  /** Consumption per traveler (sum of their shares) in base currency. */
  costPerTraveler: { travelerId: string; amountMinor: number }[];
  totalMinor: number;
  /** Places with most 👍, then favourites. */
  topPlaces: { id: string; name: string; votes: number; favorite: boolean }[];
}

export function buildRecap(snap: Pick<TripSnapshot, 'trip' | 'destinations' | 'bookings' | 'activities' | 'places' | 'expenses' | 'travelers'>, today: string): Recap {
  const { trip } = snap;
  const totalDays = diffDays(trip.startDate, trip.endDate) + 1;
  const finished = today > trip.endDate;
  const days = today < trip.startDate ? 0 : finished ? totalDays : diffDays(trip.startDate, today) + 1;
  const route = buildRoute(trip, snap.destinations, snap.bookings);
  let distanceKm = 0;
  for (const l of route.legs) {
    if (l.from.lat != null && l.from.lng != null && l.to.lat != null && l.to.lng != null) {
      distanceKm += haversineKm([l.from.lat, l.from.lng], [l.to.lat, l.to.lng]);
    }
  }
  const shares = new Map<string, number>();
  for (const e of snap.expenses) for (const s of e.shares) shares.set(s.travelerId, (shares.get(s.travelerId) ?? 0) + s.baseShareMinor);
  const topPlaces = snap.places
    .map((p) => ({ id: p.id, name: p.name, votes: p.votes?.length ?? 0, favorite: p.favorite }))
    .filter((p) => p.votes > 0 || p.favorite)
    .sort((a, b) => b.votes - a.votes || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name))
    .slice(0, 5);
  return {
    days,
    totalDays,
    finished,
    stops: snap.destinations.length,
    distanceKm: Math.round(distanceKm),
    transports: snap.bookings.filter((b) => isTransport(b) && b.bookingStatus !== 'cancelled').length,
    activitiesDone: snap.activities.filter((a) => a.completed).length,
    placesSaved: snap.places.length,
    costPerTraveler: snap.travelers.map((x) => ({ travelerId: x.id, amountMinor: shares.get(x.id) ?? 0 })),
    totalMinor: snap.expenses.reduce((a, e) => a + e.baseAmountMinor, 0),
    topPlaces,
  };
}
