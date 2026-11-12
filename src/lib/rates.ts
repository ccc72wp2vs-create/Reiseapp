import type { ExchangeRateDto, ExpenseDto } from '../../shared/types';

/** Latest stored rate for a currency that is effective on the given date. */
export function storedRateFor(rates: ExchangeRateDto[], currency: string, date: string): ExchangeRateDto | null {
  return (
    rates
      .filter((r) => r.currency === currency && r.effectiveDate <= date)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt))[0] ??
    rates.filter((r) => r.currency === currency).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0] ??
    null
  );
}

export interface SuggestedRate {
  rate: string;
  effectiveDate: string;
  from: 'stored' | 'lastUsed';
}

/**
 * Rate to prefill: the stored trip rate, otherwise the rate last used for an
 * expense in that currency. Never invented – null if neither exists.
 */
export function suggestedRate(
  rates: ExchangeRateDto[],
  expenses: Pick<ExpenseDto, 'currency' | 'fxRate' | 'fxSource' | 'fxDate' | 'date' | 'createdAt'>[],
  currency: string,
  date: string,
): SuggestedRate | null {
  const stored = storedRateFor(rates, currency, date);
  if (stored) return { rate: stored.rate, effectiveDate: stored.effectiveDate, from: 'stored' };
  const last = expenses
    .filter((e) => e.currency === currency && e.fxSource !== 'identity')
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
  return last ? { rate: last.fxRate, effectiveDate: last.fxDate ?? last.date, from: 'lastUsed' } : null;
}

