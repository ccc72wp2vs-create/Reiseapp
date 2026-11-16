import type { ExchangeRateDto, ExpenseDto } from '../../shared/types';

/** On the same day an own (manual) rate beats the automatic ECB rate. */
const manualFirst = (a: ExchangeRateDto, b: ExchangeRateDto) => (a.source === b.source ? 0 : a.source === 'manual' ? -1 : 1);

/** Latest stored rate for a currency that is effective on the given date. */
export function storedRateFor(rates: ExchangeRateDto[], currency: string, date: string): ExchangeRateDto | null {
  return (
    rates
      .filter((r) => r.currency === currency && r.effectiveDate <= date)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || manualFirst(a, b) || b.createdAt.localeCompare(a.createdAt))[0] ??
    rates.filter((r) => r.currency === currency).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0] ??
    null
  );
}

export interface SuggestedRate {
  rate: string;
  effectiveDate: string;
  from: 'stored' | 'lastUsed';
  /** For stored rates: manual entry or automatic ECB rate. */
  source?: 'manual' | 'provider';
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
  if (stored) return { rate: stored.rate, effectiveDate: stored.effectiveDate, from: 'stored', source: stored.source };
  const last = expenses
    .filter((e) => e.currency === currency && e.fxSource !== 'identity')
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
  return last ? { rate: last.fxRate, effectiveDate: last.fxDate ?? last.date, from: 'lastUsed' } : null;
}


/** Asks the server to store missing ECB rates – at most once per trip and session. */
export async function refreshRatesOnce(tripId: string, post: (path: string) => Promise<{ added: number }>): Promise<number> {
  const key = `travio.fx.${tripId}`;
  try {
    if (sessionStorage.getItem(key)) return 0;
    sessionStorage.setItem(key, '1');
  } catch {
    /* storage unavailable – still try once */
  }
  try {
    return (await post(`/trips/${tripId}/exchange-rates/refresh`)).added;
  } catch {
    return 0;
  }
}
