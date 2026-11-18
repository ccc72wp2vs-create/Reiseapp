/**
 * Final settlement report ("Endabrechnung"): who paid what, who used what,
 * costs by category and stop, and the remaining transfers – per couple or per
 * person. Built only from the existing balance functions (nothing recomputed
 * differently than in Salden).
 */
import { coupleBalances, coupleSettlements, groupCouples } from './couples';
import { computeBalances } from './finance';
import { destinationForDate, sortDestinations } from './trip';
import type { ExpenseCategory } from './constants';
import type { TripSnapshot } from './types';

export interface ReportGroup {
  key: string;
  memberIds: string[];
  /** What the group paid for everyone (expenses only). */
  paidMinor: number;
  /** What the group consumed (its shares). */
  consumedMinor: number;
  /** Repayments already sent / received. */
  settledOutMinor: number;
  settledInMinor: number;
  /** > 0 gets money back, < 0 owes. */
  balanceMinor: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
}

export interface ReportTransfer {
  fromKey: string;
  toKey: string;
  fromTravelerId: string;
  toTravelerId: string;
  amountMinor: number;
}

export interface TripReport {
  baseCurrency: string;
  mode: 'couples' | 'persons';
  totalMinor: number;
  groups: ReportGroup[];
  byCategory: { category: ExpenseCategory; minor: number }[];
  byStop: { destinationId: string | null; name: string; minor: number; nights: number }[];
  transfers: ReportTransfer[];
  expenseCount: number;
}

export function buildReport(
  snap: Pick<TripSnapshot, 'trip' | 'travelers' | 'expenses' | 'settlements' | 'destinations' | 'bookings'>,
  mode: 'couples' | 'persons',
): TripReport {
  const { travelers, expenses, settlements } = snap;
  const balances = computeBalances(
    travelers.map((x) => x.id),
    expenses.map((e) => ({ payers: e.payers, baseAmountMinor: e.baseAmountMinor, shares: e.shares })),
    settlements.map((s) => ({ fromTravelerId: s.fromTravelerId, toTravelerId: s.toTravelerId, baseAmountMinor: s.baseAmountMinor })),
  );
  const grouping = mode === 'couples' ? groupCouples(travelers) : travelers.map((x) => ({ key: x.id, memberIds: [x.id] }));
  const flat = mode === 'couples' ? travelers : travelers.map((x) => ({ id: x.id, partnerId: null }));
  const cb = coupleBalances(flat, balances);
  const groups: ReportGroup[] = grouping.map((g) => {
    const ids = new Set(g.memberIds);
    const own = balances.filter((b) => ids.has(b.travelerId));
    const byCategory: ReportGroup['byCategory'] = {};
    for (const e of expenses) {
      const part = e.shares.filter((s) => ids.has(s.travelerId)).reduce((a, s) => a + s.baseShareMinor, 0);
      if (part) byCategory[e.category] = (byCategory[e.category] ?? 0) + part;
    }
    return {
      key: g.key,
      memberIds: g.memberIds,
      paidMinor: own.reduce((a, b) => a + b.paidMinor, 0),
      consumedMinor: own.reduce((a, b) => a + b.owedMinor, 0),
      settledOutMinor: own.reduce((a, b) => a + b.settledOutMinor, 0),
      settledInMinor: own.reduce((a, b) => a + b.settledInMinor, 0),
      balanceMinor: cb.find((c) => c.key === g.key)?.balanceMinor ?? own.reduce((a, b) => a + b.balanceMinor, 0),
      byCategory,
    };
  });

  const catMap = new Map<ExpenseCategory, number>();
  for (const e of expenses) catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.baseAmountMinor);
  const byCategory = [...catMap].map(([category, minor]) => ({ category, minor })).sort((a, b) => b.minor - a.minor);

  // Stops: a booking's destination wins, otherwise the stay covering the date.
  const bookingDest = new Map(snap.bookings.map((b) => [b.id, b.destinationId]));
  const stopMap = new Map<string | null, number>();
  for (const e of expenses) {
    const d = (e.bookingId ? bookingDest.get(e.bookingId) : null) ?? destinationForDate(snap.destinations, e.date)?.id ?? null;
    stopMap.set(d, (stopMap.get(d) ?? 0) + e.baseAmountMinor);
  }
  const byStop = sortDestinations(snap.destinations)
    .map((d) => ({
      destinationId: d.id as string | null,
      name: d.name,
      minor: stopMap.get(d.id) ?? 0,
      nights: Math.max(0, Math.round((Date.parse(d.departureDate) - Date.parse(d.arrivalDate)) / 86_400_000)),
    }))
    .filter((s) => s.minor > 0);
  if (stopMap.get(null)) byStop.push({ destinationId: null, name: '', minor: stopMap.get(null)!, nights: 0 });

  return {
    baseCurrency: snap.trip.baseCurrency,
    mode,
    totalMinor: expenses.reduce((a, e) => a + e.baseAmountMinor, 0),
    groups,
    byCategory,
    byStop,
    transfers: coupleSettlements(cb),
    expenseCount: expenses.length,
  };
}
