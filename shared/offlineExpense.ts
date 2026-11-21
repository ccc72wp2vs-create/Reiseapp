/**
 * Builds the expense exactly as the server will store it, from the same input
 * – so an expense entered offline shows up in the wallet (and the balances)
 * right away. Uses the same rounding helpers as the server; the server
 * recomputes on sync and its result replaces this local copy.
 */
import type { ExpenseCategory, FxSource, SplitMethod } from './constants';
import { computeShares, type SplitInput } from './finance';
import { allocate, convertMinor, normalizeRate } from './money';
import type { ExpenseDto } from './types';

export interface ExpenseCreateInput {
  title: string;
  amountMinor: number;
  currency: string;
  date: string;
  category: ExpenseCategory;
  paidByTravelerId: string;
  payers?: { travelerId: string; amountMinor: number }[];
  splitMethod: SplitMethod;
  splits: SplitInput[];
  fxRate?: string;
  fxSource?: 'manual' | 'cached' | 'provider';
  fxDate?: string | null;
  notes?: string | null;
}

/** Throws (SplitError / Error) when the input would be rejected by the server. */
export function localExpense(id: string, tripId: string, baseCurrency: string, input: ExpenseCreateInput, createdAt: string, createdBy: string | null = null): ExpenseDto {
  const identity = input.currency === baseCurrency;
  const rate = identity ? '1' : normalizeRate(input.fxRate ?? '');
  if (!rate) throw new Error('rate');
  const baseAmountMinor = convertMinor(input.amountMinor, input.currency, baseCurrency, rate);
  const shares = computeShares(input.amountMinor, baseAmountMinor, input.splitMethod, input.splits);
  const payers = input.payers?.length ? input.payers : [{ travelerId: input.paidByTravelerId, amountMinor: input.amountMinor }];
  if (payers.reduce((a, p) => a + p.amountMinor, 0) !== input.amountMinor) throw new Error('payers');
  const basePaid = allocate(baseAmountMinor, payers.map((p) => p.amountMinor));
  const main = [...payers].sort((a, b) => b.amountMinor - a.amountMinor)[0].travelerId;
  return {
    id,
    tripId,
    title: input.title,
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    category: input.category,
    paidByTravelerId: main,
    splitMethod: input.splitMethod,
    fxRate: rate,
    fxSource: (identity ? 'identity' : (input.fxSource ?? 'manual')) as FxSource,
    fxDate: identity ? null : (input.fxDate ?? input.date),
    baseAmountMinor,
    notes: input.notes ?? null,
    bookingId: null,
    shares: shares.map((s) => ({ travelerId: s.travelerId, shareMinor: s.shareMinor, baseShareMinor: s.baseShareMinor, weight: s.weight })),
    payers: payers.map((p, i) => ({ ...p, baseAmountMinor: basePaid[i] })),
    createdBy,
    // version 0 = not yet on the server ("wartet auf Sync")
    version: 0,
    createdAt,
    updatedAt: createdAt,
  };
}
