/**
 * Search over a whole trip (client-side, works offline): bookings, expenses,
 * places, plan items, stops, to-dos and comments. Every word of the query
 * must occur somewhere in the entry (case- and accent-insensitive); hits in
 * the title rank first.
 */
import type { TripSnapshot } from './types';

export type SearchKind = 'booking' | 'expense' | 'place' | 'activity' | 'stop' | 'todo' | 'comment';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  /** Entity the hit opens (for comments: the commented entity). */
  targetKind: Exclude<SearchKind, 'comment'>;
  targetId: string;
  title: string;
  /** Where the match is, e.g. "Buchungsnr.: OCLIFM". */
  detail: string | null;
  date: string | null;
  score: number;
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

type Field = [label: string | null, value: string | null | undefined];

function score(words: string[], title: string, fields: Field[]): { score: number; detail: string | null } | null {
  const nt = normalize(title);
  const all = normalize([title, ...fields.map((f) => f[1] ?? '')].join(' \n '));
  if (!words.every((w) => all.includes(w))) return null;
  let s = 0;
  for (const w of words) s += nt.startsWith(w) ? 4 : nt.includes(w) ? 3 : 1;
  // Show the first non-title field that contains a word – tells the user why it matched.
  let detail: string | null = null;
  if (!words.every((w) => nt.includes(w))) {
    const f = fields.find(([, v]) => v && words.some((w) => normalize(v).includes(w)));
    if (f) detail = `${f[0] ? `${f[0]}: ` : ''}${excerpt(f[1]!, words)}`;
  }
  return { score: s, detail };
}

function excerpt(text: string, words: string[], len = 70): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= len) return flat;
  const n = normalize(flat);
  const at = Math.min(...words.map((w) => n.indexOf(w)).filter((i) => i >= 0));
  const start = Math.max(0, at - 20);
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + len).trim()}…`;
}

export interface SearchLabels {
  reference: string;
  provider: string;
  notes: string;
  flight: string;
  route: string;
  address: string;
  stay: string;
  place: string;
}

export function searchTrip(snap: TripSnapshot, query: string, L: SearchLabels, limit = 40): SearchHit[] {
  const words = normalize(query).split(/\s+/).filter((w) => w.length > 0);
  if (!words.length || words.join('').length < 2) return [];
  const hits: SearchHit[] = [];
  const add = (kind: SearchKind, id: string, title: string, fields: Field[], date: string | null, target?: [Exclude<SearchKind, 'comment'>, string]) => {
    const r = score(words, title, fields);
    if (r) hits.push({ kind, id, title, detail: r.detail, date, score: r.score, targetKind: target?.[0] ?? (kind as Exclude<SearchKind, 'comment'>), targetId: target?.[1] ?? id });
  };

  for (const b of snap.bookings)
    add(
      'booking',
      b.id,
      b.title,
      [
        [L.reference, b.reference],
        [L.flight, b.flightNumber],
        [L.provider, b.provider],
        [L.route, b.fromLocation || b.toLocation ? `${b.fromLocation ?? ''} → ${b.toLocation ?? ''}` : null],
        [L.address, b.location],
        [L.notes, b.notes],
        [L.notes, b.clarificationNote],
      ],
      b.startDate,
    );
  for (const e of snap.expenses) add('expense', e.id, e.title, [[L.notes, e.notes]], e.date);
  for (const p of snap.places)
    add(
      'place',
      p.id,
      p.name,
      [
        [L.address, p.address],
        [null, p.description],
        [L.notes, p.notes],
      ],
      null,
    );
  for (const a of snap.activities)
    add(
      'activity',
      a.id,
      a.title,
      [
        [L.place, a.locationName],
        [null, a.description],
        [L.notes, a.notes],
      ],
      a.date,
    );
  for (const d of snap.destinations)
    add(
      'stop',
      d.id,
      d.name,
      [
        [L.stay, d.accommodationName],
        [L.address, d.accommodationAddress],
        [L.notes, d.accommodationNotes],
        [L.notes, d.notes],
      ],
      d.arrivalDate,
    );
  for (const x of snap.todos ?? []) add('todo', x.id, x.title, [[L.notes, x.notes]], x.dueDate);
  for (const c of snap.comments ?? []) {
    const parent =
      c.entityType === 'booking'
        ? snap.bookings.find((x) => x.id === c.entityId)?.title
        : c.entityType === 'place'
          ? snap.places.find((x) => x.id === c.entityId)?.name
          : c.entityType === 'activity'
            ? snap.activities.find((x) => x.id === c.entityId)?.title
            : snap.expenses.find((x) => x.id === c.entityId)?.title;
    if (!parent) continue;
    const r = score(words, '', [[c.authorName, c.text]]);
    if (r) hits.push({ kind: 'comment', id: c.id, title: parent, detail: r.detail, date: c.createdAt.slice(0, 10), score: r.score, targetKind: c.entityType, targetId: c.entityId });
  }
  return hits.sort((a, b) => b.score - a.score || (a.date ?? '').localeCompare(b.date ?? '')).slice(0, limit);
}
