/**
 * Wallet history helpers: grouping by day or stop with subtotals, a simple
 * text search and a hint for probable double entries.
 */
import { destinationForDate, sortDestinations } from './trip';
import type { BookingDto, DestinationDto, ExpenseDto } from './types';

type E = Pick<ExpenseDto, 'id' | 'title' | 'date' | 'amountMinor' | 'currency' | 'baseAmountMinor' | 'createdAt' | 'bookingId' | 'notes' | 'shares'>;

export interface HistoryGroup<T> {
  key: string;
  /** Day (YYYY-MM-DD) or stop name. */
  label: string;
  kind: 'day' | 'stop';
  items: T[];
  /** Sum in base currency (or the selected persons' shares). */
  totalMinor: number;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

/** Every word of the query must appear in title or notes. */
export function matchesSearch(e: Pick<ExpenseDto, 'title' | 'notes'>, query: string): boolean {
  const q = norm(query).split(/\s+/).filter(Boolean);
  if (!q.length) return true;
  const hay = norm(`${e.title} ${e.notes ?? ''}`);
  return q.every((w) => hay.includes(w));
}

/** Amount counted for a list: the selected persons' shares, or the whole expense. */
export function amountFor(e: Pick<ExpenseDto, 'baseAmountMinor' | 'shares'>, persons?: readonly string[]): number {
  return persons?.length ? e.shares.filter((s) => persons.includes(s.travelerId)).reduce((a, s) => a + s.baseShareMinor, 0) : e.baseAmountMinor;
}

export function groupByDay<T extends E>(expenses: readonly T[], persons?: readonly string[]): HistoryGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const e of [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))) {
    (map.get(e.date) ?? map.set(e.date, []).get(e.date)!).push(e);
  }
  return [...map].map(([day, items]) => ({ key: day, label: day, kind: 'day' as const, items, totalMinor: items.reduce((a, e) => a + amountFor(e, persons), 0) }));
}

export function groupByStop<T extends E>(
  expenses: readonly T[],
  destinations: readonly DestinationDto[],
  bookings: readonly Pick<BookingDto, 'id' | 'destinationId'>[],
  persons?: readonly string[],
): HistoryGroup<T>[] {
  const bookingDest = new Map(bookings.map((b) => [b.id, b.destinationId]));
  const stops = sortDestinations(destinations);
  const map = new Map<string, T[]>();
  for (const e of [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))) {
    const d = (e.bookingId ? bookingDest.get(e.bookingId) : null) ?? destinationForDate(destinations, e.date)?.id ?? '';
    (map.get(d) ?? map.set(d, []).get(d)!).push(e);
  }
  const order = [...stops.map((s) => s.id).reverse(), ''];
  return order
    .filter((k) => map.has(k))
    .map((k) => {
      const items = map.get(k)!;
      return { key: k || 'none', label: stops.find((s) => s.id === k)?.name ?? '', kind: 'stop' as const, items, totalMinor: items.reduce((a, e) => a + amountFor(e, persons), 0) };
    });
}

/**
 * Probable double entries: same day, same amount and currency, and either a
 * shared title word or one of them not linked to anything.
 */
export function possibleDuplicates(expenses: readonly E[]): Set<string> {
  const out = new Set<string>();
  const words = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i];
      const b = expenses[j];
      if (a.date !== b.date || a.amountMinor !== b.amountMinor || a.currency !== b.currency) continue;
      if (a.bookingId && b.bookingId && a.bookingId !== b.bookingId) continue;
      const wa = words(a.title);
      const shared = [...words(b.title)].some((w) => wa.has(w));
      if (shared || !a.title.trim() || !b.title.trim()) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}
