/**
 * Picks the place/route provider: Geoapify (OpenStreetMap, no credit card)
 * when configured, otherwise Google Maps Platform, otherwise none.
 */
import type { MapsProvider, NearbyResponse, TravelMode } from '../../shared/google';
import type { TripSnapshot } from '../../shared/types';
import { destinationOn } from '../../shared/trip';
import type { Env } from '../env';
import { ApiError } from '../lib/errors';
import { tripToday } from './assistant';
import * as geo from './geoapify';
import * as google from './google';
import { categoryByKey } from '../../shared/google';

export function provider(env: Env): MapsProvider | null {
  if (geo.geoapifyConfig(env).key) return 'geoapify';
  const g = google.googleConfig(env);
  return g.serverKey && g.browserKey ? 'google' : null;
}

export type Origin = { lat: number; lng: number; label: string };

/** Where travel times start: shared location > accommodation place > stop centre. */
export function travelOrigin(snap: TripSnapshot, location: { lat: number; lng: number } | null | undefined, now = new Date()): Origin {
  if (location) return { ...location, label: 'deinem Standort' };
  const { today } = tripToday(snap, now);
  const w = destinationOn(snap.destinations, today);
  const dest = w.current ?? w.leaving ?? w.next ?? snap.destinations[0];
  if (!dest) throw new ApiError('validation_failed', 'Kein Reiseort mit Koordinaten vorhanden – teile deinen Standort.');
  const stay = snap.places.find((p) => p.destinationId === dest.id && p.category === 'accommodation' && p.lat != null && p.lng != null);
  if (stay) return { lat: stay.lat!, lng: stay.lng!, label: `eurer Unterkunft (${stay.name})` };
  if (dest.lat == null || dest.lng == null) throw new ApiError('validation_failed', `Für ${dest.name} sind keine Koordinaten hinterlegt – teile deinen Standort.`);
  return { lat: dest.lat, lng: dest.lng, label: `Ortsmitte ${dest.name}` };
}

export async function nearby(
  env: Env,
  args: { category: string | null; query: string | null; origin: Origin; mode: TravelMode; maxMinutes: number | null; limit: number },
): Promise<NearbyResponse> {
  const p = provider(env);
  if (p === 'geoapify') return geo.nearby(env, args);
  if (p === 'google') {
    const cat = categoryByKey(args.category);
    return google.nearby(env, {
      query: args.query ?? cat?.query ?? 'Sehenswürdigkeit',
      type: args.query ? null : (cat?.type ?? null),
      origin: args.origin,
      mode: args.mode,
      maxMinutes: args.maxMinutes,
      limit: args.limit,
    });
  }
  throw new ApiError('service_unavailable', 'Die Ortssuche ist noch nicht eingerichtet.');
}

export async function distance(
  env: Env,
  origin: Origin,
  to: { lat: number; lng: number } | { placeId: string },
  mode: TravelMode,
): Promise<{ durationSec: number; distanceMeters: number } | 'no_route'> {
  const p = provider(env);
  if (p === 'geoapify') {
    if (!('lat' in to)) throw new ApiError('validation_failed', 'Für diesen Ort sind keine Koordinaten hinterlegt.');
    return geo.route(env, origin, to, mode);
  }
  if (p === 'google') return google.computeRoute(env, origin, to, mode);
  throw new ApiError('service_unavailable', 'Die Routenberechnung ist noch nicht eingerichtet.');
}
