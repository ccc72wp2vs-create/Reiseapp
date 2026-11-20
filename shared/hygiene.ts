/**
 * "Datenpflege": small gaps in the trip data that make other features worse
 * (costs per stop, maps, balances). Each hint says what is missing, where to
 * fix it and – where it is unambiguous – offers a one-tap fix.
 */
import { TRANSPORT_BOOKING_TYPES } from './constants';
import { haversineKm } from './news';
import { guessCategory } from './quickfill';
import type { ExpenseCategory } from './constants';
import type { TripSnapshot } from './types';

export type HygieneKind = 'place-no-stop' | 'place-no-pin' | 'booking-no-travelers' | 'booking-no-stop' | 'expense-category' | 'expense-duplicate' | 'activity-outside';

export interface HygieneIssue {
  key: string;
  kind: HygieneKind;
  title: string;
  /** Entity to open. */
  target: { type: 'place' | 'booking' | 'expense' | 'activity'; id: string };
  /** Safe one-tap fix (partial update), if any. */
  fix?: { type: 'place' | 'booking'; id: string; version: number; destinationId: string; label: string };
  /** Suggested category for 'expense-category'. */
  suggestion?: ExpenseCategory;
  /** The other expense for 'expense-duplicate'. */
  otherId?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöü]+/g, ' ').trim();

export function hygieneIssues(snap: TripSnapshot): HygieneIssue[] {
  const out: HygieneIssue[] = [];
  const stops = snap.destinations;
  const stopOn = (date: string | null) => (date ? stops.find((d) => date >= d.arrivalDate && date < d.departureDate) ?? stops.find((d) => date >= d.arrivalDate && date <= d.departureDate) : undefined);

  for (const p of snap.places) {
    if (!p.destinationId && stops.length > 1) {
      let fix: HygieneIssue['fix'];
      if (p.lat != null && p.lng != null) {
        const near = stops
          .filter((d) => d.lat != null && d.lng != null)
          .map((d) => ({ d, km: haversineKm({ lat: p.lat!, lng: p.lng! }, { lat: d.lat!, lng: d.lng! }) }))
          .sort((a, b) => a.km - b.km)[0];
        if (near && near.km <= 120) fix = { type: 'place', id: p.id, version: p.version, destinationId: near.d.id, label: near.d.name };
      }
      out.push({ key: `pns-${p.id}`, kind: 'place-no-stop', title: p.name, target: { type: 'place', id: p.id }, fix });
    }
    if (p.lat == null || p.lng == null) out.push({ key: `pnp-${p.id}`, kind: 'place-no-pin', title: p.name, target: { type: 'place', id: p.id } });
  }

  for (const b of snap.bookings) {
    if (b.bookingStatus === 'cancelled') continue;
    if (b.travelerIds.length === 0 && snap.travelers.length > 1) out.push({ key: `bnt-${b.id}`, kind: 'booking-no-travelers', title: b.title, target: { type: 'booking', id: b.id } });
    if (!b.destinationId && !TRANSPORT_BOOKING_TYPES.includes(b.type) && stops.length > 1) {
      const d = stopOn(b.startDate);
      out.push({
        key: `bns-${b.id}`,
        kind: 'booking-no-stop',
        title: b.title,
        target: { type: 'booking', id: b.id },
        fix: d ? { type: 'booking', id: b.id, version: b.version, destinationId: d.id, label: d.name } : undefined,
      });
    }
  }

  for (const e of snap.expenses) {
    if (e.category !== 'other') continue;
    const g = guessCategory(e.title);
    if (g && g !== 'other') out.push({ key: `ec-${e.id}`, kind: 'expense-category', title: e.title, target: { type: 'expense', id: e.id }, suggestion: g });
  }

  const byKey = new Map<string, typeof snap.expenses>();
  for (const e of snap.expenses) {
    const k = `${e.date}|${e.amountMinor}|${e.currency}`;
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  for (const group of byKey.values()) {
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const a = norm(group[i].title);
        const b = norm(group[j].title);
        if (a && b && (a === b || a.includes(b) || b.includes(a)))
          out.push({ key: `ed-${group[i].id}-${group[j].id}`, kind: 'expense-duplicate', title: group[j].title, target: { type: 'expense', id: group[j].id }, otherId: group[i].id });
      }
  }

  for (const a of snap.activities)
    if (a.date < snap.trip.startDate || a.date > snap.trip.endDate) out.push({ key: `ao-${a.id}`, kind: 'activity-outside', title: a.title, target: { type: 'activity', id: a.id } });

  return out;
}
