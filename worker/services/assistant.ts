/**
 * "Frag TRAVIO" – server side of the travel assistant.
 *
 * Flow per question (exactly one model call, at most one retry):
 *  1. detect what the question is about (deterministic, shared/assistant.ts)
 *  2. compute the needed facts with the app's own functions (balances,
 *     check-in windows, route, …) and build cards from real data
 *  3. send the model only a compact fact sheet (no booking references,
 *     no notes, no payment details, first names only)
 *  4. validate the model's structured answer; actions become proposals that
 *     reference real IDs of this trip and are executed by the client through
 *     the existing endpoints after the user confirmed them
 *
 * If Workers AI is unavailable, over the daily limit or answers garbage, the
 * user still gets the deterministic answer and the cards.
 */
import {
  annotatePlan,
  cleanCategory,
  cleanPackingCategory,
  cleanText,
  cleanTime,
  detectIntents,
  distanceKm,
  resolveDate,
  type AssistantCard,
  type AssistantPreferences,
  type AssistantProposal,
  type AssistantRequest,
  type AssistantResponse,
  type Intent,
  type PlanItem,
} from '../../shared/assistant';
import { checkinInfo } from '../../shared/checkin';
import { categoryByKey, parseSearchRequest } from '../../shared/google';
import { googleConfig } from './google';
import { computeBalances, suggestSettlements } from '../../shared/finance';
import { tripCostOverview } from '../../shared/costs';
import { formatMoney, isSupportedCurrency, parseAmount } from '../../shared/money';
import { addDaysToDate, bookingSortKey, bookingsOnDate, destinationOn, todayIn, transferReminders } from '../../shared/trip';
import type { Role } from '../../shared/constants';
import type { ActivityDto, BookingDto, PlaceDto, TripSnapshot } from '../../shared/types';
import type { Env } from '../env';
import { nowIso } from '../lib/util';

// ---------------------------------------------------------------------------
// Configuration (wrangler vars; sensible defaults for a private app)
// ---------------------------------------------------------------------------

/** Officially listed for JSON mode in the Workers AI docs; good German. */
export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export function assistantConfig(env: Env) {
  const int = (v: string | undefined, d: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? Math.min(Math.floor(n), max) : d;
  };
  return {
    model: env.ASSISTANT_MODEL?.trim() || DEFAULT_MODEL,
    /** Model calls per user and day (0 = assistant answers without AI only). */
    dailyLimit: int(env.ASSISTANT_DAILY_LIMIT, 80, 0, 10_000),
    /** Upper bound for generated tokens (day plans need the most). */
    maxTokens: int(env.ASSISTANT_MAX_TOKENS, 900, 100, 4000),
  };
}

// ---------------------------------------------------------------------------
// Usage limit & preferences
// ---------------------------------------------------------------------------

/** Counts one model call; returns false when today's limit is reached. */
export async function consumeUsage(db: D1Database, userId: string, day: string, limit: number): Promise<{ allowed: boolean; remaining: number }> {
  if (limit <= 0) return { allowed: false, remaining: 0 };
  const row = await db
    .prepare(
      `INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1
       WHERE ai_usage.count < ?
       RETURNING count`,
    )
    .bind(userId, day, limit)
    .first<{ count: number }>();
  if (!row) return { allowed: false, remaining: 0 };
  return { allowed: true, remaining: Math.max(0, limit - row.count) };
}

export async function getPreferences(db: D1Database, userId: string): Promise<AssistantPreferences> {
  const row = await db.prepare('SELECT data FROM user_preferences WHERE user_id = ?').bind(userId).first<{ data: string }>();
  if (!row) return {};
  try {
    return JSON.parse(row.data) as AssistantPreferences;
  } catch {
    return {};
  }
}

export async function setPreferences(db: D1Database, userId: string, prefs: AssistantPreferences): Promise<AssistantPreferences> {
  await db
    .prepare(
      `INSERT INTO user_preferences (user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(userId, JSON.stringify(prefs), nowIso())
    .run();
  return prefs;
}

// ---------------------------------------------------------------------------
// Fact sheet & cards
// ---------------------------------------------------------------------------

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dShort = (d: string) => `${WD[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}.${d.slice(5, 7)}.`;
const firstName = (n: string) => n.split(' ')[0];
const CAT_DE: Record<string, string> = {
  accommodation: 'Unterkunft',
  food: 'Essen & Trinken',
  transportation: 'Transport',
  activities: 'Aktivitäten',
  shopping: 'Einkäufe',
  other: 'Sonstiges',
};
const PREF_DE = {
  budget: { low: 'günstig', mid: 'mittel', high: 'gehoben' },
  vibe: { quiet: 'eher ruhig', lively: 'eher lebhaft' },
  rhythm: { early: 'Frühaufsteher', late: 'starten lieber später' },
};

function fmtWhen(ms: number, tz: string): string {
  const p = new Intl.DateTimeFormat('de-DE', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(
    new Date(ms),
  );
  return `${p} Uhr`;
}

interface Ctx {
  snap: TripSnapshot;
  userId: string;
  role: Role;
  today: string;
  tz: string;
  now: number;
  question: string;
  target: string;
  intents: Intent[];
  location: { lat: number; lng: number } | null;
  prefs: AssistantPreferences;
  /** Google Maps Platform configured (live search/route cards). */
  google: boolean;
}

interface Built {
  facts: string[];
  cards: AssistantCard[];
  refs: {
    activities: Map<string, ActivityDto>;
    places: Map<string, PlaceDto>;
    flights: Map<string, BookingDto>;
    lists: Map<string, { id: string; name: string }>;
  };
  fallback: string[];
}

function relevantFlights(ctx: Ctx): BookingDto[] {
  const q = ctx.question.toLowerCase();
  const flights = ctx.snap.bookings
    .filter((b) => b.type === 'flight' && b.bookingStatus !== 'cancelled')
    .sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)));
  if (/rückflug/.test(q)) return flights.slice(-1);
  if (/hinflug/.test(q)) return flights.slice(0, 1);
  const named = flights.filter((f) =>
    ctx.snap.destinations.some((d) => q.includes(d.name.toLowerCase()) && f.title.toLowerCase().includes(d.name.toLowerCase())),
  );
  if (named.length) return named.slice(0, 3);
  const upcoming = flights.filter((f) => (f.startDate ?? '9999') >= ctx.today);
  return (upcoming.length ? upcoming : flights.slice(-1)).slice(0, 2);
}

function placesFor(ctx: Ctx): { place: PlaceDto; km: number | null; from: string }[] {
  const where = destinationOn(ctx.snap.destinations, ctx.target);
  // On a travel day both the place you leave and the one you arrive at count.
  const dests = [where.leaving, where.current ?? where.next].filter((d): d is NonNullable<typeof d> => !!d);
  const dest = where.leaving ?? where.current ?? where.next;
  const origin = ctx.location ?? (dest?.lat != null && dest?.lng != null ? { lat: dest.lat, lng: dest.lng } : null);
  const from = ctx.location ? 'deinem Standort' : dest ? `Zentrum ${dest.name}` : '';
  const scored = ctx.snap.places.map((p) => ({
    place: p,
    km: origin && p.lat != null && p.lng != null ? distanceKm(origin, { lat: p.lat, lng: p.lng }) : null,
    from,
  }));
  const ids = new Set(dests.map((d) => d.id));
  const local = scored.filter((s) => (s.place.destinationId && ids.has(s.place.destinationId)) || (s.km != null && s.km <= 40));
  const pool = local.length ? local : scored.filter((s) => !ids.size || (s.place.destinationId && ids.has(s.place.destinationId)));
  return pool
    .sort((a, b) => Number(b.place.favorite) - Number(a.place.favorite) || (a.km ?? 999) - (b.km ?? 999))
    .slice(0, 14);
}

export function buildFacts(ctx: Ctx): Built {
  const { snap, intents, target, today } = ctx;
  const facts: string[] = [];
  const cards: AssistantCard[] = [];
  const fallback: string[] = [];
  const refs: Built['refs'] = { activities: new Map(), places: new Map(), flights: new Map(), lists: new Map() };
  const has = (i: Intent) => intents.includes(i);
  const travelerName = new Map(snap.travelers.map((t) => [t.id, firstName(t.name)]));
  const me = snap.travelers.find((t) => t.userId === ctx.userId);

  facts.push(
    `Heute: ${dShort(today)}${today.slice(0, 4)} (Ortszeit ${ctx.tz}). Reise „${snap.trip.name}“ vom ${dShort(snap.trip.startDate)} bis ${dShort(snap.trip.endDate)}${snap.trip.endDate.slice(0, 4)}.`,
    `Reisende: ${snap.travelers.map((t) => firstName(t.name)).join(', ')}.${me ? ` Du sprichst mit ${firstName(me.name)}.` : ''}`,
    `Gefragter Tag: ${dShort(target)}${target.slice(0, 4)}.`,
  );
  const route = [...snap.destinations]
    .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate))
    .map((d) => `${d.name} ${dShort(d.arrivalDate)}–${dShort(d.departureDate)}`)
    .join(' · ');
  facts.push(`Route: ${route || 'keine Stationen eingetragen'}.`);

  // --- where / stay -------------------------------------------------------
  if (has('where') || has('plan')) {
    const w = destinationOn(snap.destinations, target);
    const dest = w.current;
    const hotel = dest
      ? snap.bookings.find((b) => b.type === 'hotel' && b.destinationId === dest.id && b.bookingStatus !== 'cancelled')
      : null;
    const acc = dest?.accommodationName ?? hotel?.title ?? null;
    const moving = w.leaving && w.current ? { from: w.leaving.name, to: w.current.name } : null;
    facts.push(
      `Ort am gefragten Tag: ${dest ? dest.name : w.leaving ? `Abreise aus ${w.leaving.name}` : 'außerhalb der Route'}${moving ? ` (Ortswechsel ${moving.from} → ${moving.to})` : ''}. Unterkunft: ${acc ?? 'nicht eingetragen'}.`,
    );
    cards.push({ kind: 'stay', date: target, destination: dest?.name ?? w.leaving?.name ?? null, moving, accommodation: acc, bookingId: hotel?.id ?? null });
    fallback.push(
      dest ? `${dShort(target)}: ${dest.name}${acc ? `, Unterkunft: ${acc}` : ', Unterkunft noch nicht eingetragen'}.` : `${dShort(target)}: kein Aufenthaltsort eingetragen.`,
    );
  }

  // --- activities of the day ---------------------------------------------
  if (has('activities') || has('plan') || has('action')) {
    const days = has('action') && !resolveDate(ctx.question, today) ? [today, addDaysToDate(today, 1)] : [target];
    const acts = snap.activities
      .filter((a) => days.includes(a.date) && a.bookingStatus !== 'cancelled')
      .sort((a, b) => `${a.date}${a.startTime ?? '99'}`.localeCompare(`${b.date}${b.startTime ?? '99'}`));
    const items: Extract<AssistantCard, { kind: 'list' }>['items'] = [];
    acts.forEach((a, i) => {
      const ref = `A${i + 1}`;
      refs.activities.set(ref, a);
      facts.push(
        `${ref}: Aktivität „${a.title}“ ${dShort(a.date)} ${a.startTime ?? 'ohne Uhrzeit'}${a.endTime ? `–${a.endTime}` : ''}${a.locationName ? `, ${a.locationName}` : ''}${a.bookingStatus === 'booked' ? ', fest gebucht' : ''}.`,
      );
      items.push({
        id: a.id,
        title: a.title,
        subtitle: [days.length > 1 ? dShort(a.date) : null, a.startTime ? `${a.startTime}${a.endTime ? `–${a.endTime}` : ''} Uhr` : null, a.locationName].filter(Boolean).join(' · ') || null,
        link: `/plan?tag=${a.date}`,
        badge: a.bookingStatus === 'booked' ? 'Gebucht' : null,
      });
    });
    for (const d of days) {
      for (const b of bookingsOnDate(snap.bookings, d)) {
        facts.push(`Buchung am ${dShort(d)}: „${b.title}“ ${b.startDate === d && b.startTime ? `ab ${b.startTime}` : ''}.`);
        items.push({ id: b.id, title: b.title, subtitle: b.startDate === d && b.startTime ? `${b.startTime} Uhr` : null, link: `/buchungen?id=${b.id}`, badge: 'Buchung' });
      }
    }
    if (!acts.length) facts.push(`Für ${days.map(dShort).join(' und ')} sind keine Aktivitäten geplant.`);
    if (has('activities') && !has('plan')) {
      cards.push({ kind: 'list', title: `Geplant · ${days.map(dShort).join(' & ')}`, items, empty: 'Noch nichts geplant.' });
      fallback.push(items.length ? `${items.length} Einträge geplant.` : `Für ${dShort(target)} ist noch nichts geplant.`);
    }
  }

  // --- flights & check-in ------------------------------------------------
  if (has('flight')) {
    const flights = relevantFlights(ctx);
    flights.forEach((f, i) => {
      const ref = `F${i + 1}`;
      refs.flights.set(ref, f);
      const info = checkinInfo(f, ctx.now, ctx.tz);
      const tz = f.startTimezone || ctx.tz;
      const ck = info
        ? info.state === 'done'
          ? 'Check-in: erledigt'
          : `Check-in ${info.airline?.windowConfirmed ? '' : '(Zeitfenster nicht bestätigt) '}öffnet ${fmtWhen(info.opensMs, tz)}, schließt ${fmtWhen(info.closesMs, tz)}, Status: ${{ upcoming: 'noch nicht offen', open: 'geöffnet', closing: 'schließt bald', closed: 'geschlossen', done: 'erledigt' }[info.state]}${info.airline?.url ? ', offizieller Link vorhanden' : ', kein geprüfter Link'}`
        : f.startTime
          ? 'Check-in: keine Angaben'
          : 'Check-in: Abflugzeit fehlt, daher nicht berechenbar';
      facts.push(
        `${ref}: „${f.title}“ ${f.startDate ? dShort(f.startDate) : 'Datum offen'} ${f.startTime ? `${f.startTime} Uhr (${tz})` : 'Abflugzeit fehlt'}, Flugnummer ${f.flightNumber ?? 'fehlt'}${info?.airline ? `, ${info.airline.name}` : f.provider ? `, ${f.provider}` : ''}. ${ck}.`,
      );
      cards.push({
        kind: 'flight',
        bookingId: f.id,
        title: f.title,
        date: f.startDate,
        time: f.startTime,
        timezone: tz,
        flightNumber: f.flightNumber ?? null,
        airline: info?.airline?.name ?? f.provider ?? null,
        checkin: info
          ? {
              state: info.state,
              opensAt: new Date(info.opensMs).toISOString(),
              closesAt: new Date(info.closesMs).toISOString(),
              url: info.airline?.url ?? null,
              confirmed: !!info.airline?.windowConfirmed,
            }
          : null,
      });
    });
    if (!flights.length) facts.push('Keine Flüge eingetragen.');
    const f = flights[0];
    fallback.push(f ? `${f.title}: ${f.startDate ? dShort(f.startDate) : 'Datum offen'}${f.startTime ? ` um ${f.startTime} Uhr` : ', Abflugzeit fehlt'}.` : 'Es sind keine Flüge eingetragen.');
  }

  // --- wallet (always computed with the app's own functions) -------------
  if (has('finance')) {
    const cur = snap.trip.baseCurrency;
    const balances = computeBalances(
      snap.travelers.map((t) => t.id),
      snap.expenses.map((e) => ({ payers: e.payers, baseAmountMinor: e.baseAmountMinor, shares: e.shares })),
      snap.settlements.map((s) => ({ fromTravelerId: s.fromTravelerId, toTravelerId: s.toTravelerId, baseAmountMinor: s.baseAmountMinor })),
    );
    const transfers = suggestSettlements(balances);
    const overview = tripCostOverview(cur, snap.expenses, snap.bookings);
    const cats = new Map<string, number>();
    for (const e of snap.expenses) cats.set(e.category, (cats.get(e.category) ?? 0) + e.baseAmountMinor);
    const m = (x: number) => formatMoney(x, cur);
    facts.push(
      `REISEKASSE (von TRAVIO berechnet – Zahlen exakt so übernehmen, nichts selbst rechnen). Ausgegeben gesamt: ${m(overview.spentMinor)} (${snap.expenses.length} Ausgaben). Inklusive gebuchter und geplanter Kosten: ${m(overview.projectedMinor)}.`,
      `Nach Kategorie: ${[...cats].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${CAT_DE[c] ?? c} ${m(v)}`).join(', ') || 'keine'}.`,
      ...balances.map(
        (b) =>
          `${travelerName.get(b.travelerId)}: hat ${m(b.paidMinor)} vorgestreckt, eigener Anteil ${m(b.owedMinor)}, Saldo ${b.balanceMinor >= 0 ? '+' : ''}${m(b.balanceMinor)} (${b.balanceMinor > 0 ? 'bekommt Geld zurück' : b.balanceMinor < 0 ? 'schuldet noch' : 'ausgeglichen'}).`,
      ),
      transfers.length
        ? `Ausgleich (TRAVIO-Vorschlag): ${transfers.map((t) => `${travelerName.get(t.fromTravelerId)} → ${travelerName.get(t.toTravelerId)} ${m(t.amountMinor)}`).join('; ')}.`
        : 'Alle Salden sind ausgeglichen.',
    );
    const hotels = snap.bookings.filter((b) => b.type === 'hotel' && b.bookingStatus !== 'cancelled' && b.priceMinor != null && b.currency);
    if (hotels.length) facts.push(`Unterkünfte laut Buchungen: ${hotels.map((h) => `${h.title} ${formatMoney(h.priceMinor!, h.currency!)}`).join('; ')}.`);
    cards.push({
      kind: 'finance',
      currency: cur,
      spentMinor: overview.spentMinor,
      projectedMinor: overview.projectedMinor,
      people: balances.map((b) => ({
        travelerId: b.travelerId,
        name: travelerName.get(b.travelerId) ?? '?',
        paidMinor: b.paidMinor,
        shareMinor: b.owedMinor,
        balanceMinor: b.balanceMinor,
        isMe: b.travelerId === me?.id,
      })),
      transfers: transfers.map((t) => ({ from: travelerName.get(t.fromTravelerId) ?? '?', to: travelerName.get(t.toTravelerId) ?? '?', amountMinor: t.amountMinor })),
      categories: [...cats].map(([category, amountMinor]) => ({ category: CAT_DE[category] ?? category, amountMinor })).sort((a, b) => b.amountMinor - a.amountMinor),
    });
    fallback.push(`Bisher ausgegeben: ${m(overview.spentMinor)}.${transfers.length ? ` Offen: ${transfers.length} Ausgleichszahlung${transfers.length === 1 ? '' : 'en'}.` : ' Alles ausgeglichen.'}`);
  }

  // --- open bookings / missing transfers ---------------------------------
  if (has('bookings')) {
    const items: Extract<AssistantCard, { kind: 'list' }>['items'] = [];
    for (const r of transferReminders(snap.trip, snap.destinations, snap.bookings, today)) {
      const label = r.booking ? `${r.fromName} → ${r.toName}: noch nicht bestätigt` : `${r.fromName} → ${r.toName}: Transport fehlt`;
      facts.push(`Offen: ${label}${r.date ? ` (${dShort(r.date)})` : ''}.`);
      items.push({ id: r.booking?.id ?? `${r.fromName}-${r.toName}`, title: label, subtitle: r.date ? dShort(r.date) : null, link: r.booking ? `/buchungen?id=${r.booking.id}` : '/route', badge: 'Transfer' });
    }
    for (const b of snap.bookings) {
      if (b.bookingStatus === 'cancelled' || (b.endDate ?? b.startDate ?? '9999') < today) continue;
      const open = b.bookingStatus !== 'booked' ? 'noch nicht gebucht' : b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial' ? 'noch nicht (vollständig) bezahlt' : null;
      if (!open || items.some((i) => i.id === b.id)) continue;
      facts.push(`Offen: „${b.title}“ ${b.startDate ? dShort(b.startDate) : ''} – ${open}.`);
      items.push({ id: b.id, title: b.title, subtitle: `${b.startDate ? `${dShort(b.startDate)} · ` : ''}${open}`, link: `/buchungen?id=${b.id}`, badge: null });
    }
    if (!items.length) facts.push('Keine offenen Buchungen oder fehlenden Transfers.');
    cards.push({ kind: 'list', title: 'Offene Buchungen & Transfers', items: items.slice(0, 10), empty: 'Alles gebucht – nichts offen.' });
    fallback.push(items.length ? `${items.length} offene Punkte bei Buchungen und Transfers.` : 'Alle Buchungen und Transfers sind erledigt.');
  }

  // --- saved places ------------------------------------------------------
  if (has('places') || has('plan') || /favorit/.test(ctx.question.toLowerCase())) {
    const list = placesFor(ctx);
    const items: Extract<AssistantCard, { kind: 'list' }>['items'] = [];
    list.forEach((s, i) => {
      const ref = `P${i + 1}`;
      refs.places.set(ref, s.place);
      const dist = s.km != null ? `${s.km < 10 ? s.km.toFixed(1).replace('.', ',') : Math.round(s.km)} km Luftlinie ab ${s.from}` : 'Entfernung unbekannt';
      facts.push(
        `${ref}: gespeicherter Ort „${s.place.name}“ (${s.place.category}${s.place.favorite ? ', Favorit' : ''}${s.place.votes?.length ? `, ${s.place.votes.length}× 👍` : ''}), ${dist}${s.place.description ? `. ${s.place.description.slice(0, 120)}` : ''}.`,
      );
      items.push({ id: s.place.id, title: s.place.name, subtitle: dist, link: '/entdecken', badge: s.place.favorite ? 'Favorit' : null });
    });
    if (!list.length) facts.push('Für diesen Ort sind keine Orte gespeichert.');
    facts.push('Fahrtzeiten, Öffnungszeiten, Preise und Bewertungen sind NICHT bekannt (kein Karten-/Routingdienst angebunden).');
    if (has('places') && !has('plan')) {
      cards.push({ kind: 'list', title: 'Eure gespeicherten Orte', items: items.slice(0, 8), empty: 'Hier sind noch keine Orte gespeichert.' });
      fallback.push(items.length ? `${items.length} gespeicherte Orte in der Nähe.` : 'Für diesen Ort sind noch keine Orte gespeichert.');
    }
  }

  // --- packing -----------------------------------------------------------
  if (has('packing')) {
    const lists = snap.packingLists.filter((l) => l.tripId === snap.trip.id && !l.isTemplate);
    lists.forEach((l, i) => {
      const ref = `L${i + 1}`;
      refs.lists.set(ref, { id: l.id, name: l.name });
      const items = snap.packingItems.filter((x) => x.listId === l.id);
      facts.push(`${ref}: Packliste „${l.name}“ – ${items.filter((x) => x.packed).length}/${items.length} gepackt.`);
    });
    const w = destinationOn(snap.destinations, today);
    if (w.next) facts.push(`Nächster Ortswechsel: nach ${w.next.name} am ${dShort(w.next.arrivalDate)}.`);
    if (!lists.length) facts.push('Noch keine Packliste für diese Reise.');
    cards.push({
      kind: 'list',
      title: 'Packlisten',
      items: lists.map((l) => {
        const items = snap.packingItems.filter((x) => x.listId === l.id);
        return { id: l.id, title: l.name, subtitle: `${items.filter((x) => x.packed).length} von ${items.length} gepackt`, link: '/packliste', badge: null };
      }),
      empty: 'Noch keine Packliste.',
    });
  }

  // --- Google Maps (live in the app – the model never sees Google content) -
  if (ctx.google) {
    const search = parseSearchRequest(ctx.question);
    if (search) {
      cards.unshift({ kind: 'google_search', params: search });
      const cat = categoryByKey(search.category);
      facts.push(
        `Die App zeigt unter deiner Antwort live Ergebnisse von Google Maps (${cat?.label ?? 'Orte'}${search.maxMinutes ? `, höchstens ${search.maxMinutes} Min.` : ''}) mit echten Fahrzeiten. Du kennst diese Ergebnisse NICHT: nenne keine Namen, Bewertungen, Öffnungszeiten oder Fahrzeiten daraus, sag nur kurz, dass die Vorschläge unten von Google Maps stammen.`,
      );
      fallback.unshift(`Hier sind ${cat?.label ?? 'Orte'} von Google Maps${search.maxMinutes ? ` mit höchstens ${search.maxMinutes} Min. Fahrzeit` : ''}.`);
    }
    if (/wie weit|entfernt|wie lange (fahren|brauchen|dauert)|fahrzeit|fußweg/.test(ctx.question.toLowerCase())) {
      const q = ctx.question.toLowerCase();
      const place = snap.places.find((p) => p.name.length > 2 && q.includes(p.name.toLowerCase()));
      if (place && (place.googlePlaceId || (place.lat != null && place.lng != null))) {
        cards.unshift({ kind: 'google_distance', placeId: place.id, name: place.name });
        facts.push(`Die App berechnet die Fahrzeit zu „${place.name}“ live mit Google Maps und zeigt sie unter deiner Antwort. Nenne selbst keine Zeit oder Entfernung.`);
        fallback.unshift(`Die Fahrzeit zu „${place.name}“ siehst du unten.`);
      }
    }
  }

  // --- preferences -------------------------------------------------------
  const p = ctx.prefs;
  const pref = [
    p.interests?.length ? `mögen ${p.interests.join(', ')}` : null,
    p.cuisine ? `Küche: ${p.cuisine}` : null,
    p.budget ? `Budget ${PREF_DE.budget[p.budget]}` : null,
    p.maxTravelMinutes ? `max. ${p.maxTravelMinutes} Min. Fahrt` : null,
    p.vibe ? PREF_DE.vibe[p.vibe] : null,
    p.rhythm ? PREF_DE.rhythm[p.rhythm] : null,
  ].filter(Boolean);
  if (pref.length && (has('plan') || has('places'))) facts.push(`Vorlieben: ${pref.join(', ')}.`);

  return { facts, cards, refs, fallback };
}

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

const SYSTEM = `Du bist „TRAVIO“, der Reiseassistent einer privaten Reise-App. Antworte IMMER auf Deutsch, freundlich, sehr kurz (höchstens 3 Sätze, keine Aufzählungen im Text – Details zeigt die App als Karten).
Regeln:
- Nutze ausschließlich die FAKTEN. Erfinde keine Buchungen, Ausgaben, Zeiten, Flugnummern oder Links.
- Geldbeträge und Salden nur exakt aus den FAKTEN übernehmen, niemals selbst rechnen.
- Fehlt eine Angabe, sag das offen und schlage vor, sie zu ergänzen.
- Keine erfundenen Öffnungszeiten, Fahrtzeiten, Preise, Bewertungen oder Verfügbarkeiten. Entfernungen nur als Luftlinie aus den FAKTEN.
- Allgemeine Ideen ohne gespeicherten Ort sind erlaubt, aber als „Idee“ zu verstehen; nenne nur bekannte, reale Orte.
- Antworte als JSON: {"answer": string, "action": object|null, "plan": object|null}.
Aktionen (nur wenn der Nutzer etwas ändern/anlegen möchte, sonst null), Felder in "action":
- {"type":"add_activity","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM"|null,"title":"…","location":"…"|null,"ref":"P#"|null}
- {"type":"update_activity","ref":"A#","date":"YYYY-MM-DD"|null,"startTime":"HH:MM"|null,"endTime":"HH:MM"|null}
- {"type":"favorite_place","ref":"P#"}
- {"type":"mark_checkin_done","ref":"F#"}
- {"type":"add_packing_items","ref":"L#"|null,"title":"Name einer neuen Liste"|null,"items":["…"]}
- {"type":"add_expense","title":"…","amount":Zahl|null,"currency":"THB"|"EUR"|null,"date":"YYYY-MM-DD"|null}
Für "add_activity" und "update_activity": fehlt die Uhrzeit, frage im answer danach und setze action null.
Tagesplan (nur wenn ausdrücklich ein Tag geplant werden soll), Felder in "plan":
{"date":"YYYY-MM-DD","items":[{"startTime":"HH:MM","endTime":"HH:MM","title":"…","category":"restaurant|beach|sightseeing|adventure|nature|shopping|nightlife|other","ref":"P#"|null,"location":"…"|null,"description":"ein Satz"}],"alternatives":[{"title":"…","description":"…"}]}
Plane 3–6 Programmpunkte in sinnvoller Reihenfolge, lass Zeit für Wege, überschneide keine bestehenden Einträge, bevorzuge gespeicherte Orte (mit ref) und die Vorlieben. Keine Preise angeben.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    action: { type: 'object' },
    plan: { type: 'object' },
  },
  required: ['answer'],
};

type Raw = Record<string, unknown>;

function parseLoose(v: unknown): Raw | null {
  if (v && typeof v === 'object') return v as Raw;
  if (typeof v !== 'string') return null;
  const m = v.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Raw;
  } catch {
    return null;
  }
}

export async function callModel(
  ai: Ai,
  cfg: { model: string; maxTokens: number },
  facts: string[],
  history: AssistantRequest['messages'],
  plan: boolean,
): Promise<Raw | null> {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'system', content: `FAKTEN:\n${facts.join('\n')}` },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 600) })),
  ];
  const max_tokens = plan ? cfg.maxTokens : Math.min(cfg.maxTokens, 400);
  try {
    const out = (await ai.run(cfg.model as never, {
      messages,
      max_tokens,
      temperature: plan ? 0.6 : 0.2,
      response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
    } as never)) as { response?: unknown };
    const r = parseLoose(out.response);
    if (r) return r;
  } catch (e) {
    console.error(JSON.stringify({ level: 'warn', msg: 'assistant model call failed', error: e instanceof Error ? e.name : 'unknown' }));
  }
  // One retry without JSON mode ("JSON Mode couldn't be met") – never more.
  try {
    const out = (await ai.run(cfg.model as never, { messages, max_tokens, temperature: 0.2 } as never)) as { response?: unknown };
    return parseLoose(out.response);
  } catch (e) {
    console.error(JSON.stringify({ level: 'warn', msg: 'assistant model retry failed', error: e instanceof Error ? e.name : 'unknown' }));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Turning model output into validated proposals
// ---------------------------------------------------------------------------

function inTripRange(d: string | null, snap: TripSnapshot): d is string {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= addDaysToDate(snap.trip.startDate, -1) && d <= addDaysToDate(snap.trip.endDate, 1);
}

export function interpret(raw: Raw | null, ctx: Ctx, built: Built): { answer: string | null; proposal: AssistantProposal | null; note: string | null } {
  if (!raw) return { answer: null, proposal: null, note: null };
  const answer = cleanText(raw.answer, 700);
  const { snap } = ctx;
  const canEdit = ctx.role !== 'viewer';
  let proposal: AssistantProposal | null = null;
  let note: string | null = null;

  const plan = raw.plan && typeof raw.plan === 'object' ? (raw.plan as Raw) : null;
  const action = raw.action && typeof raw.action === 'object' ? (raw.action as Raw) : null;

  if (plan && Array.isArray(plan.items) && plan.items.length && ctx.intents.includes('plan')) {
    const pd = typeof plan.date === 'string' ? plan.date : null;
    const date = inTripRange(pd, snap) ? pd : ctx.target;
    const items: Omit<PlanItem, 'conflict' | 'duplicate'>[] = [];
    for (const it of (plan.items as unknown[]).slice(0, 8)) {
      if (!it || typeof it !== 'object') continue;
      const o = it as Raw;
      const startTime = cleanTime(o.startTime);
      const title = cleanText(o.title, 120);
      if (!startTime || !title) continue;
      const place = typeof o.ref === 'string' ? built.refs.places.get(o.ref.trim().toUpperCase()) : undefined;
      const endTime = cleanTime(o.endTime);
      items.push({
        title,
        startTime,
        endTime: endTime && endTime > startTime ? endTime : null,
        category: place ? place.category : cleanCategory(o.category),
        locationName: place ? (place.address ?? place.name) : cleanText(o.location, 160),
        description: cleanText(o.description, 300),
        placeId: place?.id ?? null,
        source: place ? 'saved' : 'idea',
      });
    }
    items.sort((a, b) => a.startTime.localeCompare(b.startTime));
    const alternatives = (Array.isArray(plan.alternatives) ? (plan.alternatives as unknown[]) : [])
      .slice(0, 3)
      .map((a) => (a && typeof a === 'object' ? { title: cleanText((a as Raw).title, 120), description: cleanText((a as Raw).description, 300) } : null))
      .filter((a): a is { title: string; description: string | null } => !!a?.title);
    if (items.length) proposal = { kind: 'add_activities', date, items: annotatePlan(items, date, snap.activities, snap.bookings), alternatives };
  } else if (action && typeof action.type === 'string') {
    const ref = typeof action.ref === 'string' ? action.ref.trim().toUpperCase() : null;
    switch (action.type) {
      case 'add_activity': {
        const startTime = cleanTime(action.startTime);
        const title = cleanText(action.title, 120);
        const ad = typeof action.date === 'string' ? action.date : null;
        const date = inTripRange(ad, snap) ? ad : ctx.target;
        if (!title) break;
        if (!startTime) {
          note = 'Zu welcher Uhrzeit soll ich das eintragen?';
          break;
        }
        const place = ref ? built.refs.places.get(ref) : undefined;
        const endTime = cleanTime(action.endTime);
        proposal = {
          kind: 'add_activities',
          date,
          alternatives: [],
          items: annotatePlan(
            [
              {
                title,
                startTime,
                endTime: endTime && endTime > startTime ? endTime : null,
                category: place ? place.category : cleanCategory(action.category),
                locationName: place ? (place.address ?? place.name) : cleanText(action.location, 160),
                description: null,
                placeId: place?.id ?? null,
                source: place ? 'saved' : 'idea',
              },
            ],
            date,
            snap.activities,
            snap.bookings,
          ),
        };
        break;
      }
      case 'update_activity': {
        const a = ref ? built.refs.activities.get(ref) : undefined;
        if (!a) {
          note = 'Ich konnte den Eintrag im Reiseplan nicht eindeutig finden.';
          break;
        }
        const ad = typeof action.date === 'string' ? action.date : null;
        const date = inTripRange(ad, snap) ? ad : a.date;
        const startTime = cleanTime(action.startTime) ?? a.startTime;
        let endTime = cleanTime(action.endTime);
        if (!endTime && a.startTime && a.endTime && startTime) {
          const dur = Number(a.endTime.slice(0, 2)) * 60 + Number(a.endTime.slice(3)) - (Number(a.startTime.slice(0, 2)) * 60 + Number(a.startTime.slice(3)));
          const end = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) + dur;
          endTime = end < 24 * 60 ? `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` : null;
        }
        if (date === a.date && startTime === a.startTime && (endTime ?? a.endTime) === a.endTime) break;
        const others = snap.activities.filter((x) => x.id !== a.id);
        const [chk] = startTime
          ? annotatePlan(
              [{ title: a.title, startTime, endTime, category: a.category, locationName: null, description: null, placeId: null, source: 'saved' }],
              date,
              others,
              snap.bookings,
            )
          : [null];
        proposal = {
          kind: 'update_activity',
          activityId: a.id,
          title: a.title,
          date,
          startTime,
          endTime: endTime ?? (startTime === a.startTime ? a.endTime : null),
          before: { date: a.date, startTime: a.startTime, endTime: a.endTime },
          conflict: chk?.conflict ?? null,
        };
        break;
      }
      case 'favorite_place': {
        const p = ref ? built.refs.places.get(ref) : undefined;
        if (!p) note = 'Diesen Ort habe ich unter euren gespeicherten Orten nicht gefunden – speichere ihn zuerst unter „Entdecken“.';
        else if (p.favorite) note = `„${p.name}“ ist schon ein Favorit.`;
        else proposal = { kind: 'favorite_place', placeId: p.id, name: p.name };
        break;
      }
      case 'mark_checkin_done': {
        const f = ref ? built.refs.flights.get(ref) : undefined;
        if (f && !f.checkinDoneAt) proposal = { kind: 'mark_checkin', bookingId: f.id, title: f.title };
        break;
      }
      case 'add_packing_items': {
        const items = (Array.isArray(action.items) ? (action.items as unknown[]) : [])
          .map((x) => (typeof x === 'string' ? cleanText(x, 80) : x && typeof x === 'object' ? cleanText((x as Raw).name, 80) : null))
          .filter((x): x is string => !!x)
          .slice(0, 25);
        if (!items.length) break;
        const list = ref ? built.refs.lists.get(ref) : undefined;
        proposal = {
          kind: 'add_packing',
          listId: list?.id ?? null,
          listName: list?.name ?? cleanText(action.title, 80) ?? 'Packliste Ortswechsel',
          items: [...new Set(items)].map((name) => ({ name, category: cleanPackingCategory(guessPackingCategory(name)) })),
        };
        break;
      }
      case 'add_expense': {
        const title = cleanText(action.title, 120);
        if (!title) break;
        const cur = typeof action.currency === 'string' && isSupportedCurrency(action.currency.toUpperCase()) ? action.currency.toUpperCase() : null;
        const amt = typeof action.amount === 'number' ? action.amount : typeof action.amount === 'string' ? Number(action.amount.replace(',', '.')) : NaN;
        const amountMinor = cur && Number.isFinite(amt) && amt > 0 ? parseAmount(String(amt).replace('.', ','), cur) : null;
        const ad = typeof action.date === 'string' ? action.date : null;
        proposal = { kind: 'add_expense', title, amountMinor, currency: amountMinor != null ? cur : null, date: inTripRange(ad, snap) ? ad : ctx.today };
        break;
      }
      default:
        break;
    }
  }
  if (proposal && !canEdit) {
    proposal = null;
    note = 'Du hast für diese Reise nur Leserechte – Änderungen kann ich dir nicht vorschlagen.';
  }
  return { answer, proposal, note };
}

function guessPackingCategory(name: string): string {
  const n = name.toLowerCase();
  if (/pass|ticket|bordkarte|ausweis|visum|versicherung|bargeld|karte\b/.test(n)) return 'documents';
  if (/lade|kabel|powerbank|handy|kamera|adapter|kopfhörer/.test(n)) return 'electronics';
  if (/creme|sonnen|zahn|shampoo|deo|duschgel|mückenspray|repellent/.test(n)) return 'toiletries';
  if (/tablette|medikament|pflaster|apotheke/.test(n)) return 'medication';
  if (/shirt|hose|jacke|schuh|socken|kleid|badehose|bikini|pulli|hut|cap/.test(n)) return 'clothing';
  return 'other';
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function tripToday(snap: TripSnapshot, now: Date): { today: string; tz: string } {
  const homeToday = todayIn(snap.trip.homeTimezone, now);
  const probe = destinationOn(snap.destinations, homeToday).current ?? snap.destinations[0];
  const tz = probe?.timezone ?? snap.trip.homeTimezone;
  return { today: todayIn(tz, now), tz };
}

export async function askAssistant(
  env: Env,
  args: { snap: TripSnapshot; userId: string; role: Role; request: AssistantRequest; now?: Date },
): Promise<AssistantResponse> {
  const now = args.now ?? new Date();
  const { snap, request } = args;
  const question = [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const { today, tz } = tripToday(snap, now);
  const intents = detectIntents(question);
  const explicit = resolveDate(question, today);
  // A plan without a date is for tomorrow; everything else defaults to today.
  const target = explicit ?? (intents.includes('plan') ? addDaysToDate(today, 1) : today);
  const prefs = intents.includes('plan') || intents.includes('places') ? await getPreferences(env.DB, args.userId) : {};
  const ctx: Ctx = {
    snap,
    userId: args.userId,
    role: args.role,
    today,
    tz,
    now: now.getTime(),
    question,
    target,
    intents,
    location: request.location ?? null,
    prefs,
    google: !!googleConfig(env).serverKey && !!googleConfig(env).browserKey,
  };
  const built = buildFacts(ctx);
  const cfg = assistantConfig(env);
  const needsModel = intents.includes('plan') || intents.includes('action');

  let raw: Raw | null = null;
  let remaining: number | null = null;
  let limited = false;
  if (env.AI) {
    const usage = await consumeUsage(env.DB, args.userId, todayIn('UTC', now), cfg.dailyLimit);
    remaining = usage.remaining;
    limited = !usage.allowed;
    if (usage.allowed) raw = await callModel(env.AI, cfg, built.facts, request.messages, intents.includes('plan'));
  }
  const { answer, proposal, note } = interpret(raw, ctx, built);

  let text = answer ?? built.fallback.join(' ');
  if (!answer) {
    if (needsModel) {
      text = limited
        ? 'Das Tageslimit für KI-Anfragen ist erreicht. Fragen zu euren Daten beantworte ich weiterhin – Planung und Aktionen gehen morgen wieder.'
        : 'Der KI-Dienst ist gerade nicht erreichbar. Tagesplanung und Aktionen gehen deshalb im Moment nicht – deine Reisedaten siehst du unten.';
      if (built.fallback.length) text += ` ${built.fallback.join(' ')}`;
    } else if (!text) {
      text = 'Dazu habe ich in euren Reisedaten nichts gefunden.';
    }
  }
  if (note) text = `${text} ${note}`.trim();
  // The proposal itself carries the detailed plan; drop duplicated list cards.
  const cards = proposal?.kind === 'add_activities' ? built.cards.filter((c) => c.kind !== 'list') : built.cards;
  return { answer: text, cards, proposal, ai: !!answer, remaining };
}
