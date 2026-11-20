/**
 * "Heimreise-Check": in the last days of a trip, one list of what is still
 * open before going home – check-in for the return flight, unpaid bookings,
 * missing wallet entries, deposits, balances, to-dos and packing.
 */
import { missingInWallet } from './costs';
import { computeBalances, suggestSettlements } from './finance';
import type { TripSnapshot } from './types';

export type HomewardKey = 'checkin' | 'unpaid' | 'wallet' | 'deposits' | 'balance' | 'todos' | 'packing';

export interface HomewardItem {
  key: HomewardKey;
  done: boolean;
  /** Number of open things (0 when done). */
  open: number;
  to: string;
}

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export function homewardCheck(snap: TripSnapshot, viewerTravelerId: string | null): HomewardItem[] {
  const end = snap.trip.endDate;
  const mine = <T extends { travelerIds: string[] }>(b: T) => !viewerTravelerId || !b.travelerIds.length || b.travelerIds.includes(viewerTravelerId);
  const live = snap.bookings.filter((b) => b.bookingStatus !== 'cancelled');
  const items: HomewardItem[] = [];

  const flights = live.filter((b) => b.type === 'flight' && b.startDate && b.startDate >= addDays(end, -1) && b.startDate <= addDays(end, 1) && mine(b));
  if (flights.length) {
    const open = flights.filter((b) => !b.checkinDoneAt);
    items.push({ key: 'checkin', done: !open.length, open: open.length, to: `/buchungen?id=${(open[0] ?? flights[0]).id}` });
  }

  const unpaid = live.filter((b) => (b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial') && (b.priceMinor ?? 0) > 0);
  items.push({ key: 'unpaid', done: !unpaid.length, open: unpaid.length, to: unpaid.length === 1 ? `/buchungen?id=${unpaid[0].id}` : '/buchungen?offen=1' });

  const missing = missingInWallet(live);
  if (missing.length) items.push({ key: 'wallet', done: false, open: missing.length, to: `/buchungen?id=${missing[0].id}` });

  const deposits = (snap.deposits ?? []).filter((d) => d.status === 'open');
  if ((snap.deposits ?? []).length) items.push({ key: 'deposits', done: !deposits.length, open: deposits.length, to: '/kasse' });

  if (snap.travelers.length > 1 && snap.expenses.length) {
    const balances = computeBalances(
      snap.travelers.map((x) => x.id),
      snap.expenses.map((e) => ({ payers: e.payers, baseAmountMinor: e.baseAmountMinor, shares: e.shares })),
      snap.settlements.map((s) => ({ fromTravelerId: s.fromTravelerId, toTravelerId: s.toTravelerId, baseAmountMinor: s.baseAmountMinor })),
    );
    const transfers = suggestSettlements(balances).filter((x) => !viewerTravelerId || x.fromTravelerId === viewerTravelerId || x.toTravelerId === viewerTravelerId);
    items.push({ key: 'balance', done: !transfers.length, open: transfers.length, to: '/kasse' });
  }

  const todos = (snap.todos ?? []).filter((x) => !x.done && (!viewerTravelerId || !x.assigneeTravelerId || x.assigneeTravelerId === viewerTravelerId));
  if ((snap.todos ?? []).length) items.push({ key: 'todos', done: !todos.length, open: todos.length, to: '/todos' });

  const packing = snap.packingItems ?? [];
  if (packing.length) {
    const open = packing.filter((i) => !i.packed).length;
    items.push({ key: 'packing', done: !open, open, to: '/packliste' });
  }
  return items;
}
