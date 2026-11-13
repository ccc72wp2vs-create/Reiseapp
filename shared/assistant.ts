/**
 * "Frag TRAVIO" – shared contracts and pure helpers of the travel assistant.
 *
 * The language model never computes numbers and never touches the database:
 * the server detects what a question is about, hands the model a small,
 * pre-computed fact sheet and turns the model's structured answer into
 * validated proposals. Executing a proposal always goes through the existing
 * endpoints after the user confirmed it.
 */
import { ACTIVITY_CATEGORIES, PACKING_CATEGORIES, type ActivityCategory, type PackingCategory } from './constants';
import { addDaysToDate, dateToUtc } from './trip';
import type { ActivityDto, BookingDto } from './types';

// ---------------------------------------------------------------------------
// Request / response
// ---------------------------------------------------------------------------

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantRequest {
  /** Recent conversation, oldest first; the last entry is the new question. */
  messages: AssistantMessage[];
  /** Only sent when the user tapped "Standort verwenden". Never stored. */
  location?: { lat: number; lng: number } | null;
}

export type CheckinStateDto = 'upcoming' | 'open' | 'closing' | 'closed' | 'done';

export type AssistantCard =
  | {
      kind: 'flight';
      bookingId: string;
      title: string;
      date: string | null;
      time: string | null;
      timezone: string | null;
      flightNumber: string | null;
      airline: string | null;
      checkin: { state: CheckinStateDto; opensAt: string; closesAt: string; url: string | null; confirmed: boolean } | null;
    }
  | {
      kind: 'finance';
      currency: string;
      spentMinor: number;
      projectedMinor: number;
      people: { travelerId: string; name: string; paidMinor: number; shareMinor: number; balanceMinor: number; isMe: boolean }[];
      transfers: { from: string; to: string; amountMinor: number }[];
      categories: { category: string; amountMinor: number }[];
    }
  | {
      kind: 'stay';
      date: string;
      destination: string | null;
      moving: { from: string; to: string } | null;
      accommodation: string | null;
      bookingId: string | null;
    }
  | {
      /** Live Google search shown by the app – its content never reaches the model. */
      kind: 'google_search';
      params: { category: string | null; query: string | null; maxMinutes: number | null; mode: 'DRIVE' | 'WALK' | 'BICYCLE'; limit: number };
    }
  | { kind: 'google_distance'; placeId: string; name: string }
  | {
      /** OpenStreetMap results (Geoapify) – fetched once by the server, also known to the model. */
      kind: 'osm_search';
      params: { category: string | null; query: string | null; maxMinutes: number | null; mode: 'DRIVE' | 'WALK' | 'BICYCLE'; limit: number };
      response: import('./google').NearbyResponse;
    }
  | {
      kind: 'list';
      title: string;
      items: { id: string; title: string; subtitle: string | null; link: string; badge?: string | null }[];
      empty: string;
    };

export interface PlanItem {
  title: string;
  startTime: string;
  endTime: string | null;
  category: ActivityCategory;
  locationName: string | null;
  description: string | null;
  /** Saved place this item refers to (verified to exist in the trip). */
  placeId: string | null;
  /** "saved": your saved places · "osm": real place from OpenStreetMap · "idea": general suggestion, not verified. */
  source: 'saved' | 'osm' | 'idea';
  /** Coordinates of OpenStreetMap places (openly licensed). */
  lat?: number | null;
  lng?: number | null;
  /** Travel time from your stay/location, from real routing. */
  travel?: string | null;
  /** Human readable conflict with existing plan entries (null = none). */
  conflict: string | null;
  /** Same title/place already planned that day → not added by default. */
  duplicate: boolean;
}

export type AssistantProposal =
  | { kind: 'add_activities'; date: string; items: PlanItem[]; alternatives: { title: string; description: string | null }[] }
  | {
      kind: 'update_activity';
      activityId: string;
      title: string;
      date: string;
      startTime: string | null;
      endTime: string | null;
      before: { date: string; startTime: string | null; endTime: string | null };
      conflict: string | null;
    }
  | { kind: 'favorite_place'; placeId: string; name: string }
  | { kind: 'mark_checkin'; bookingId: string; title: string }
  | { kind: 'add_packing'; listId: string | null; listName: string; items: { name: string; category: PackingCategory }[] }
  | { kind: 'add_expense'; title: string; amountMinor: number | null; currency: string | null; date: string };

export interface AssistantResponse {
  answer: string;
  cards: AssistantCard[];
  proposal: AssistantProposal | null;
  /** true when the language model produced the answer text. */
  ai: boolean;
  /** Remaining model requests today (null = unlimited / not counted). */
  remaining: number | null;
}

export interface AssistantPreferences {
  interests?: string[];
  budget?: 'low' | 'mid' | 'high' | null;
  maxTravelMinutes?: number | null;
  vibe?: 'quiet' | 'lively' | null;
  rhythm?: 'early' | 'late' | null;
  cuisine?: string | null;
}

export const PREFERENCE_INTERESTS = ['Natur', 'Strand', 'Kultur', 'Essen', 'Märkte', 'Abenteuer', 'Wellness', 'Nachtleben'] as const;

// ---------------------------------------------------------------------------
// Intent detection (deterministic – decides which data the model sees)
// ---------------------------------------------------------------------------

export type Intent = 'where' | 'flight' | 'finance' | 'activities' | 'bookings' | 'places' | 'plan' | 'packing' | 'action';

const norm = (s: string) => s.toLowerCase().replace(/ß/g, 'ss');

const PATTERNS: [Intent, RegExp][] = [
  ['plan', /\bplan(e|en|t)?\b.*\b(tag|ausflug|programm)|tagesplan|tag (planen|gestalten)|meinen tag|unseren tag|plane uns|plan uns/],
  ['flight', /flug|flieg|check-?in|einchecken|eingecheckt|abflug|rückflug|hinflug|flugnummer|airline|boarding/],
  ['finance', /ausgegeben|ausgaben|kosten|gekostet|schuld|bezahlt|zahlt|kasse|geld|saldo|budget|ausgleich|überweis|teuer|euro|baht|€|฿/],
  ['where', /\bwo (sind|schlafen|übernachten|wohnen)|hotel|unterkunft|übernacht|airbnb|resort|wo .*morgen|welcher ort/],
  ['activities', /aktivität|geplant|programm|was (machen|steht|haben) wir|vorhaben|termine?\b/],
  ['bookings', /buchung|gebucht|transfer|fähre|faehre|bus|zug|mietwagen|reservier|offen/],
  ['places', /essen|restaurant|strand|strände|sehenswürdig|regen|entdecken|in der nähe|ausflugsziel|orte?\b|café|cafe|bar\b|markt|tempel|aussicht|sonnenuntergang/],
  ['packing', /pack|koffer|mitnehmen/],
  ['action', /füge|hinzufügen|trag .* ein|eintragen|verschieb|ändere|favorit|merk dir|erinnere|lege .* an|erstelle|markier/],
];

export function detectIntents(text: string): Intent[] {
  const t = norm(text);
  const out = PATTERNS.filter(([, re]) => re.test(t)).map(([i]) => i);
  // A day plan request also needs places and the existing plan of that day.
  if (out.includes('plan')) {
    for (const i of ['places', 'activities', 'where'] as Intent[]) if (!out.includes(i)) out.push(i);
  }
  return out.length ? out : ['where', 'activities'];
}

// ---------------------------------------------------------------------------
// Date resolution
// ---------------------------------------------------------------------------

const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];

/** "heute" / "morgen" / "übermorgen" / weekday / "21.11." → ISO date, else null. */
export function resolveDate(text: string, today: string, tripYear: number = Number(today.slice(0, 4))): string | null {
  const t = norm(text);
  if (/übermorgen|uebermorgen/.test(t)) return addDaysToDate(today, 2);
  if (/\bmorgen\b(?!s)/.test(t) && !/\bmorgen früh\b.*heute/.test(t)) return addDaysToDate(today, 1);
  if (/\bgestern\b/.test(t)) return addDaysToDate(today, -1);
  if (/\bheute\b|\bheut\b|\bjetzt\b/.test(t)) return today;
  const m = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : tripYear;
    const d = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!Number.isNaN(dateToUtc(d))) return d;
  }
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b(am )?${w}\\b`).test(t));
  if (wd >= 0) {
    const cur = new Date(dateToUtc(today)).getUTCDay();
    return addDaysToDate(today, (wd - cur + 7) % 7);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation helpers for model output
// ---------------------------------------------------------------------------

export function cleanTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  if (!s || s.toLowerCase() === 'null') return null;
  return s.slice(0, max);
}

export function cleanCategory(v: unknown): ActivityCategory {
  return typeof v === 'string' && (ACTIVITY_CATEGORIES as readonly string[]).includes(v) ? (v as ActivityCategory) : 'other';
}

export function cleanPackingCategory(v: unknown): PackingCategory {
  return typeof v === 'string' && (PACKING_CATEGORIES as readonly string[]).includes(v) ? (v as PackingCategory) : 'other';
}

const titleKey = (s: string) => norm(s).replace(/[^a-z0-9äöü]+/g, ' ').trim();

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** End of an entry without end time: assume one hour. */
const endOf = (start: string, end: string | null) => (end && end > start ? toMin(end) : toMin(start) + 60);

/**
 * Marks conflicts with the existing plan of that day (activities and timed
 * bookings) and duplicates (same title or same saved place). Existing entries
 * are never changed.
 */
export function annotatePlan(
  items: Omit<PlanItem, 'conflict' | 'duplicate'>[],
  date: string,
  activities: readonly ActivityDto[],
  bookings: readonly BookingDto[],
): PlanItem[] {
  const existing = [
    ...activities
      .filter((a) => a.date === date && a.bookingStatus !== 'cancelled')
      .map((a) => ({ title: a.title, start: a.startTime, end: a.endTime, placeId: a.placeId, fixed: a.bookingStatus === 'booked' })),
    ...bookings
      .filter((b) => b.startDate === date && b.startTime && b.bookingStatus !== 'cancelled')
      .map((b) => ({ title: b.title, start: b.startTime, end: b.endDate === date ? b.endTime : null, placeId: null, fixed: true })),
  ];
  return items.map((it, idx) => {
    const duplicate = existing.some((e) => titleKey(e.title) === titleKey(it.title) || (!!it.placeId && e.placeId === it.placeId));
    const s = toMin(it.startTime);
    const e = endOf(it.startTime, it.endTime);
    const clash = existing.find((x) => x.start && s < endOf(x.start, x.end) && toMin(x.start) < e);
    const selfClash = items.slice(0, idx).find((o) => s < endOf(o.startTime, o.endTime) && toMin(o.startTime) < e);
    const conflict = clash
      ? `Überschneidet sich mit „${clash.title}“ (${clash.start}${clash.end ? `–${clash.end}` : ''}${clash.fixed ? ', fest gebucht' : ''})`
      : selfClash
        ? `Überschneidet sich mit „${selfClash.title}“`
        : null;
    return { ...it, conflict, duplicate };
  });
}

/** Straight-line distance in km (no routing data – shown as "Luftlinie"). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
