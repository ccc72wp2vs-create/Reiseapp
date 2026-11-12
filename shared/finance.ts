/**
 * Group wallet finance logic: expense splitting, multi-currency balances and
 * settlement suggestions. Pure functions, shared by client and server and
 * covered by unit tests (tests/unit/finance.test.ts).
 */
import type { SplitMethod } from './constants';
import { allocate, convertMinor, sum } from './money';

export interface SplitInput {
  travelerId: string;
  /**
   * equal:   ignored
   * exact:   amount in minor units of the expense currency
   * percent: basis points (1 % = 100 bp), must sum to 10 000
   */
  value?: number;
}

export interface ComputedShare {
  travelerId: string;
  /** Share in the expense currency (minor units). */
  shareMinor: number;
  /** Share in the trip base currency (minor units). */
  baseShareMinor: number;
  /** Original input weight (exact amount or basis points); null for equal. */
  weight: number | null;
}

export class SplitError extends Error {
  constructor(
    public code:
      | 'no_participants'
      | 'duplicate_participant'
      | 'exact_sum_mismatch'
      | 'percent_sum_mismatch'
      | 'invalid_value'
      | 'invalid_amount',
    message?: string,
  ) {
    super(message ?? code);
  }
}

/**
 * Computes the individual shares of an expense.
 * Guarantees: sum(shareMinor) === amountMinor and
 *             sum(baseShareMinor) === baseAmountMinor.
 */
export function computeShares(
  amountMinor: number,
  baseAmountMinor: number,
  method: SplitMethod,
  splits: readonly SplitInput[],
): ComputedShare[] {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new SplitError('invalid_amount');
  if (!Number.isSafeInteger(baseAmountMinor) || baseAmountMinor < 0) throw new SplitError('invalid_amount');
  if (splits.length === 0) throw new SplitError('no_participants');
  const ids = new Set(splits.map((s) => s.travelerId));
  if (ids.size !== splits.length) throw new SplitError('duplicate_participant');

  let shares: number[];
  let weights: (number | null)[];
  switch (method) {
    case 'equal': {
      shares = allocate(amountMinor, splits.map(() => 1));
      weights = splits.map(() => null);
      break;
    }
    case 'exact': {
      const values = splits.map((s) => s.value);
      if (values.some((v) => v === undefined || !Number.isSafeInteger(v) || v < 0)) {
        throw new SplitError('invalid_value');
      }
      shares = values as number[];
      if (sum(shares) !== amountMinor) throw new SplitError('exact_sum_mismatch');
      weights = shares;
      break;
    }
    case 'percent': {
      const values = splits.map((s) => s.value);
      if (values.some((v) => v === undefined || !Number.isSafeInteger(v) || v < 0 || v > 10000)) {
        throw new SplitError('invalid_value');
      }
      if (sum(values as number[]) !== 10000) throw new SplitError('percent_sum_mismatch');
      shares = allocate(amountMinor, values as number[]);
      weights = values as number[];
      break;
    }
  }
  // Base-currency shares follow the original-currency shares proportionally,
  // so both columns reconcile exactly with their totals.
  const baseShares = shares.some((s) => s > 0) ? allocate(baseAmountMinor, shares) : shares.map(() => 0);
  return splits.map((s, i) => ({
    travelerId: s.travelerId,
    shareMinor: shares[i],
    baseShareMinor: baseShares[i],
    weight: weights[i],
  }));
}

/** Converts an amount to the trip base currency. */
export function toBase(amountMinor: number, currency: string, baseCurrency: string, rate: string): number {
  return convertMinor(amountMinor, currency, baseCurrency, rate);
}

// ---------------------------------------------------------------------------
// Balances & settlement
// ---------------------------------------------------------------------------

export interface LedgerExpense {
  /** Who paid (base currency); amounts sum to baseAmountMinor. */
  payers: readonly { travelerId: string; baseAmountMinor: number }[];
  baseAmountMinor: number;
  shares: readonly { travelerId: string; baseShareMinor: number }[];
}

export interface LedgerSettlement {
  fromTravelerId: string;
  toTravelerId: string;
  baseAmountMinor: number;
}

export interface TravelerBalance {
  travelerId: string;
  /** What this traveler paid for the group (expenses only). */
  paidMinor: number;
  /** This traveler's consumption (sum of their shares). */
  owedMinor: number;
  /** Repayments sent to others. */
  settledOutMinor: number;
  /** Repayments received from others. */
  settledInMinor: number;
  /** > 0: gets money back, < 0: owes money. */
  balanceMinor: number;
}

export function computeBalances(
  travelerIds: readonly string[],
  expenses: readonly LedgerExpense[],
  settlements: readonly LedgerSettlement[],
): TravelerBalance[] {
  const map = new Map<string, TravelerBalance>();
  const get = (id: string) => {
    let b = map.get(id);
    if (!b) {
      b = { travelerId: id, paidMinor: 0, owedMinor: 0, settledOutMinor: 0, settledInMinor: 0, balanceMinor: 0 };
      map.set(id, b);
    }
    return b;
  };
  travelerIds.forEach(get);
  for (const e of expenses) {
    for (const p of e.payers) get(p.travelerId).paidMinor += p.baseAmountMinor;
    for (const s of e.shares) get(s.travelerId).owedMinor += s.baseShareMinor;
  }
  for (const s of settlements) {
    get(s.fromTravelerId).settledOutMinor += s.baseAmountMinor;
    get(s.toTravelerId).settledInMinor += s.baseAmountMinor;
  }
  for (const b of map.values()) {
    b.balanceMinor = b.paidMinor - b.owedMinor + b.settledOutMinor - b.settledInMinor;
  }
  return [...map.values()];
}

/**
 * What a traveler has effectively paid out of their own pocket so far:
 * advanced expenses plus repayments sent, minus repayments received.
 * Once all balances are settled this equals the traveler's share.
 * Summed over all travelers it always equals the total of all expenses.
 */
export function netPaidMinor(b: Pick<TravelerBalance, 'paidMinor' | 'settledOutMinor' | 'settledInMinor'>): number {
  return b.paidMinor + b.settledOutMinor - b.settledInMinor;
}

export interface SuggestedTransfer {
  fromTravelerId: string;
  toTravelerId: string;
  amountMinor: number;
}

/**
 * Greedy settlement: repeatedly lets the person who owes the most pay the
 * person who is owed the most. Produces at most n-1 transfers, is easy to
 * explain and settles every balance exactly (integer arithmetic).
 */
export function suggestSettlements(balances: readonly TravelerBalance[]): SuggestedTransfer[] {
  const debtors = balances
    .filter((b) => b.balanceMinor < 0)
    .map((b) => ({ id: b.travelerId, amount: -b.balanceMinor }));
  const creditors = balances
    .filter((b) => b.balanceMinor > 0)
    .map((b) => ({ id: b.travelerId, amount: b.balanceMinor }));
  const order = (a: { id: string; amount: number }, b: { id: string; amount: number }) =>
    b.amount - a.amount || a.id.localeCompare(b.id);
  const transfers: SuggestedTransfer[] = [];
  debtors.sort(order);
  creditors.sort(order);
  while (debtors.length && creditors.length) {
    const d = debtors[0];
    const c = creditors[0];
    const amount = Math.min(d.amount, c.amount);
    if (amount > 0) transfers.push({ fromTravelerId: d.id, toTravelerId: c.id, amountMinor: amount });
    d.amount -= amount;
    c.amount -= amount;
    if (d.amount === 0) debtors.shift();
    if (c.amount === 0) creditors.shift();
    debtors.sort(order);
    creditors.sort(order);
  }
  return transfers;
}

// ---------------------------------------------------------------------------
// Balance breakdown ("wofür?")
// ---------------------------------------------------------------------------

export interface BreakdownExpense {
  id: string;
  title: string;
  date: string;
  payers: readonly { travelerId: string; baseAmountMinor: number }[];
  shares: readonly { travelerId: string; baseShareMinor: number }[];
}

export interface BreakdownSettlement {
  id: string;
  date: string;
  fromTravelerId: string;
  toTravelerId: string;
  baseAmountMinor: number;
}

export interface BalanceItem {
  kind: 'expense' | 'settlement';
  id: string;
  title: string | null;
  date: string;
  /** > 0: the traveler gets this back, < 0: the traveler owes it. */
  amountMinor: number;
  /** Who the money is owed to / comes from (for expenses: the other side). */
  counterpartIds: string[];
}

/**
 * Explains a traveler's balance item by item. Every expense where the
 * traveler paid more or less than their share contributes; repayments too.
 * The items always sum exactly to the balance from computeBalances().
 */
export function balanceBreakdown(
  travelerId: string,
  expenses: readonly BreakdownExpense[],
  settlements: readonly BreakdownSettlement[],
): BalanceItem[] {
  const items: BalanceItem[] = [];
  for (const e of expenses) {
    const paid = e.payers.filter((p) => p.travelerId === travelerId).reduce((a, p) => a + p.baseAmountMinor, 0);
    const share = e.shares.filter((s) => s.travelerId === travelerId).reduce((a, s) => a + s.baseShareMinor, 0);
    const net = paid - share;
    if (net === 0) continue;
    const netOf = (id: string) =>
      e.payers.filter((p) => p.travelerId === id).reduce((a, p) => a + p.baseAmountMinor, 0) -
      e.shares.filter((s) => s.travelerId === id).reduce((a, s) => a + s.baseShareMinor, 0);
    const ids = [...new Set([...e.payers.map((p) => p.travelerId), ...e.shares.map((s) => s.travelerId)])];
    const counterpartIds = ids.filter((id) => id !== travelerId && (net < 0 ? netOf(id) > 0 : netOf(id) < 0));
    items.push({ kind: 'expense', id: e.id, title: e.title, date: e.date, amountMinor: net, counterpartIds });
  }
  for (const s of settlements) {
    if (s.fromTravelerId === travelerId) {
      items.push({ kind: 'settlement', id: s.id, title: null, date: s.date, amountMinor: s.baseAmountMinor, counterpartIds: [s.toTravelerId] });
    } else if (s.toTravelerId === travelerId) {
      items.push({ kind: 'settlement', id: s.id, title: null, date: s.date, amountMinor: -s.baseAmountMinor, counterpartIds: [s.fromTravelerId] });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Direct ("einzeln") settlement: everyone pays back exactly whom they owe
// ---------------------------------------------------------------------------

export interface PairItem {
  kind: 'expense' | 'settlement';
  id: string;
  title: string | null;
  date: string;
  /** > 0: the debtor owes this to the creditor; < 0: reduces the debt. */
  amountMinor: number;
}

export interface DirectTransfer extends SuggestedTransfer {
  /** The expenses and repayments this transfer consists of. */
  items: PairItem[];
}

/**
 * Settles every debt directly between the people involved – no netting across
 * third persons. Each participant's share of an expense is owed to its payers
 * (split proportionally to what they paid). Debts in both directions between
 * two people cancel out, and recorded repayments reduce them. More transfers
 * than suggestSettlements(), but every one is easy to trace back.
 */
export function directSettlements(
  expenses: readonly BreakdownExpense[],
  settlements: readonly BreakdownSettlement[],
): DirectTransfer[] {
  // key "a|b" with a < b; positive amount = a owes b
  const pairs = new Map<string, { amount: number; items: PairItem[] }>();
  const add = (debtor: string, creditor: string, amount: number, item: Omit<PairItem, 'amountMinor'>) => {
    if (debtor === creditor || amount === 0) return;
    const [a, b, sign] = debtor < creditor ? [debtor, creditor, 1] : [creditor, debtor, -1];
    const key = `${a}|${b}`;
    let p = pairs.get(key);
    if (!p) pairs.set(key, (p = { amount: 0, items: [] }));
    p.amount += sign * amount;
    const existing = p.items.find((i) => i.kind === item.kind && i.id === item.id);
    if (existing) existing.amountMinor += sign * amount;
    else p.items.push({ ...item, amountMinor: sign * amount });
  };
  for (const e of expenses) {
    const payers = e.payers.filter((p) => p.baseAmountMinor > 0);
    if (!payers.length) continue;
    for (const s of e.shares) {
      if (s.baseShareMinor <= 0) continue;
      const parts = allocate(s.baseShareMinor, payers.map((p) => p.baseAmountMinor));
      payers.forEach((p, i) => add(s.travelerId, p.travelerId, parts[i], { kind: 'expense', id: e.id, title: e.title, date: e.date }));
    }
  }
  for (const s of settlements) {
    // A repayment from X to Y reduces what X owes Y.
    add(s.fromTravelerId, s.toTravelerId, -s.baseAmountMinor, { kind: 'settlement', id: s.id, title: null, date: s.date });
  }
  const out: DirectTransfer[] = [];
  for (const [key, p] of pairs) {
    if (p.amount === 0) continue;
    const [a, b] = key.split('|');
    const forward = p.amount > 0;
    out.push({
      fromTravelerId: forward ? a : b,
      toTravelerId: forward ? b : a,
      amountMinor: Math.abs(p.amount),
      // Express items from the debtor's point of view (+ = owes).
      items: p.items
        .map((i) => ({ ...i, amountMinor: forward ? i.amountMinor : -i.amountMinor }))
        .filter((i) => i.amountMinor !== 0)
        .sort((x, y) => x.date.localeCompare(y.date)),
    });
  }
  return out.sort((x, y) => y.amountMinor - x.amountMinor || x.fromTravelerId.localeCompare(y.fromTravelerId));
}
