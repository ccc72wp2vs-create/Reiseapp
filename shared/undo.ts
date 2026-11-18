/** Pure helpers for "Rückgängig" (shared so they can be tested). */
import type { ExpenseDto } from './types';

/** Body that recreates an expense exactly (same ID, payers and shares). */
export function expenseBody(e: ExpenseDto) {
  return {
    id: e.id,
    title: e.title,
    amountMinor: e.amountMinor,
    currency: e.currency,
    date: e.date,
    category: e.category,
    paidByTravelerId: e.payers[0]?.travelerId ?? e.paidByTravelerId,
    payers: e.payers.length > 1 ? e.payers.map((p) => ({ travelerId: p.travelerId, amountMinor: p.amountMinor })) : undefined,
    splitMethod: 'exact' as const,
    splits: e.shares.map((s) => ({ travelerId: s.travelerId, value: s.shareMinor })),
    ...(e.fxSource !== 'identity' ? { fxRate: e.fxRate, fxSource: e.fxSource === 'provider' ? 'provider' : e.fxSource === 'cached' ? 'cached' : 'manual', fxDate: e.fxDate } : {}),
    notes: e.notes,
  };
}

