/**
 * Google Maps Platform – shared contracts.
 *
 * Legal frame (EEA billing account, Google Maps Platform EEA Terms):
 *  - Places API content may only be used for the listed "Permitted Uses" and
 *    never "With any Map" – except latitude, longitude and place_id.
 *    TRAVIO therefore requests ONLY place IDs from the Places API.
 *  - Names, ratings, photos, opening hours … are shown exclusively through
 *    the Places UI Kit (exempt from both restrictions, usable next to any map).
 *  - Routes API: description/steps must not be used with any map. TRAVIO only
 *    uses distance and duration; the actual route opens in Google Maps.
 *  - No Google content is stored (only place IDs) and none is sent to the
 *    language model.
 */
import type { ActivityCategory } from './constants';

export type TravelMode = 'DRIVE' | 'WALK' | 'BICYCLE';

export interface GoogleCategory {
  key: string;
  label: string;
  /** Text query sent to Text Search (IDs only). */
  query: string;
  /** Optional Places type for stricter results. */
  type: string | null;
  /** Geoapify (OpenStreetMap) categories. */
  geo: string;
  /** Matching TRAVIO category when a place is saved. */
  category: ActivityCategory;
  /** Words that select this category in a free-text request. */
  match: RegExp;
}

export const GOOGLE_CATEGORIES: GoogleCategory[] = [
  { key: 'restaurant', geo: 'catering.restaurant', label: 'Restaurants', query: 'Restaurant', type: 'restaurant', category: 'restaurant', match: /restaurant|essen|abendessen|mittagessen|seafood|thai food|street ?food|lokal/ },
  { key: 'cafe', geo: 'catering.cafe', label: 'Cafés', query: 'Café', type: 'cafe', category: 'restaurant', match: /café|cafe|kaffee|frühstück|brunch/ },
  { key: 'beach', geo: 'beach', label: 'Strände', query: 'Strand', type: 'beach', category: 'beach', match: /strand|strände|beach|baden/ },
  { key: 'sights', geo: 'tourism.sights,tourism.attraction', label: 'Sehenswürdigkeiten', query: 'Sehenswürdigkeit', type: 'tourist_attraction', category: 'sightseeing', match: /sehenswürdig|attraktion|anschauen|besichtig/ },
  { key: 'nature', geo: 'natural,national_park,leisure.park', label: 'Natur', query: 'Naturattraktion Nationalpark Wasserfall', type: null, category: 'nature', match: /natur|wasserfall|nationalpark|wandern|dschungel|park\b/ },
  { key: 'temple', geo: 'religion.place_of_worship', label: 'Tempel', query: 'Tempel', type: 'hindu_temple', category: 'sightseeing', match: /tempel|temple|wat\b|pagode/ },
  { key: 'viewpoint', geo: 'tourism.attraction.viewpoint', label: 'Aussichtspunkte', query: 'Aussichtspunkt', type: null, category: 'nature', match: /aussicht|viewpoint|sonnenuntergang|panorama/ },
  { key: 'shopping', geo: 'commercial.marketplace,commercial.shopping_mall', label: 'Shopping', query: 'Markt Shopping', type: null, category: 'shopping', match: /shopping|einkauf|markt|mall|night ?market/ },
  { key: 'nightlife', geo: 'catering.bar,catering.pub,adult.nightclub', label: 'Nachtleben', query: 'Bar', type: 'bar', category: 'nightlife', match: /nachtleben|bar\b|bars|club|cocktail|party/ },
  { key: 'activities', geo: 'activity,entertainment,leisure', label: 'Aktivitäten', query: 'Aktivitäten Touren', type: null, category: 'adventure', match: /aktivität|tour|ausflug|tauchen|schnorchel|kajak|kochkurs|massage/ },
];

export const categoryByKey = (k: string | null | undefined) => GOOGLE_CATEGORIES.find((c) => c.key === k) ?? null;

export interface GoogleSearchParams {
  category: string | null;
  /** Free text when no category matched (e.g. "Pad Thai"). */
  query: string | null;
  maxMinutes: number | null;
  mode: TravelMode;
  limit: number;
}

const NUM: Record<string, number> = { eins: 1, ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8 };

/**
 * Turns a German request into search parameters – deterministic, so no Google
 * content and no model is involved. Returns null if it is no place search.
 */
export function parseSearchRequest(text: string): GoogleSearchParams | null {
  const t = text.toLowerCase();
  const cat = GOOGLE_CATEGORIES.find((c) => c.match.test(t)) ?? null;
  const wantsSearch = /finde|such|zeig|wo (kann|können|gibt)|welche|empfiehl|in der nähe|gibt es|erreich|entdeck/.test(t);
  if (!cat || !wantsSearch) return null;
  const minM = t.match(/(\d{1,3})\s*(min|minuten)/);
  const hourM = /(eine|1)\s*stunde/.test(t) ? 60 : null;
  const maxMinutes = minM ? Math.min(Number(minM[1]), 180) : hourM;
  const mode: TravelMode = /zu fuß|laufen|gehen|fußweg|spazier/.test(t) ? 'WALK' : /fahrrad|rad\b|radeln/.test(t) ? 'BICYCLE' : 'DRIVE';
  // "fünf gute Restaurants" – numbers that are not minutes/hours.
  const nm = t.replace(/\d{1,3}\s*(min|minuten|stunden?)/g, '').match(/\b([2-8]|zwei|drei|vier|fünf|sechs|sieben|acht)\b/);
  const n = nm ? Number(nm[1]) || NUM[nm[1]] : 6;
  return { category: cat.key, query: null, maxMinutes, mode, limit: Math.max(1, Math.min(n, 8)) };
}

/**
 * A place from OpenStreetMap (via Geoapify). Unlike Google content this data
 * is openly licensed (ODbL): it may be shown on any map, stored with
 * attribution and passed to the assistant.
 */
export interface OsmPlace {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  categoryLabel: string | null;
  openingHours: string | null;
  website: string | null;
  cuisine: string | null;
}

export type MapsProvider = 'geoapify' | 'google';

export interface NearbyResult {
  /** Google place ID, or "osm:<id>" for OpenStreetMap places. */
  placeId: string;
  /** Filled for OpenStreetMap places (Google content is shown by the UI Kit instead). */
  place?: OsmPlace | null;
  durationSec: number | null;
  distanceMeters: number | null;
  /** true: Google found no road/foot route (islands, ferries, speedboats …). */
  noRoute: boolean;
}

export interface NearbyResponse {
  provider: MapsProvider;
  origin: { label: string; lat: number; lng: number };
  mode: TravelMode;
  results: NearbyResult[];
  /** 'ok' | routing not configured / failed / over the limit → durations unknown. */
  routing: 'ok' | 'unavailable' | 'limit';
  /** Candidates dropped because they are farther than maxMinutes. */
  filteredOut: number;
}

export interface GoogleConfig {
  enabled: boolean;
  /** Which service answers "In der Nähe" (null = none configured). */
  provider: MapsProvider | null;
  /** Browser key (HTTP-referrer restricted) for the Places UI Kit. */
  browserKey: string | null;
  routing: boolean;
}

/** Opens a place by name in the Google Maps app (reviews, photos) – a plain link, no API, no key. */
export function googleMapsSearchUrl(name: string, near: string | null): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(near ? `${name}, ${near}` : name)}`;
}

/** Google Maps directions link to coordinates (OpenStreetMap places). */
export function directionsToCoordsUrl(origin: { lat: number; lng: number } | null, dest: { lat: number; lng: number }, mode: TravelMode): string {
  const m = mode === 'WALK' ? 'walking' : mode === 'BICYCLE' ? 'bicycling' : 'driving';
  const o = origin ? `&origin=${origin.lat},${origin.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${o}&destination=${dest.lat},${dest.lng}&travelmode=${m}`;
}

/** Google Maps URL that opens the real route in the Google Maps app. */
export function googleDirectionsUrl(origin: { lat: number; lng: number } | null, placeId: string, mode: TravelMode, label = 'Ziel'): string {
  const m = mode === 'WALK' ? 'walking' : mode === 'BICYCLE' ? 'bicycling' : 'driving';
  const o = origin ? `&origin=${origin.lat},${origin.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${o}&destination=${encodeURIComponent(label)}&destination_place_id=${encodeURIComponent(placeId)}&travelmode=${m}`;
}

export function formatDuration(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} Std. ${r} Min.` : `${h} Std.`;
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0).replace('.', ',')} km`;
}
