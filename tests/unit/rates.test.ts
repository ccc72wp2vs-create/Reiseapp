import { describe, expect, it } from 'vitest';
import type { ExchangeRateDto } from '../../shared/types';
import { storedRateFor, suggestedRate } from '../../src/lib/rates';

const rate = (effectiveDate: string, r: string, source: 'manual' | 'provider', createdAt = '2026-11-16T00:00:00Z'): ExchangeRateDto => ({
  id: `${source}-${effectiveDate}`,
  tripId: 't',
  currency: 'THB',
  baseCurrency: 'EUR',
  rate: r,
  source,
  effectiveDate,
  createdAt,
});

describe('rate choice', () => {
  const rates = [rate('2026-11-06', '0.0262', 'manual'), rate('2026-11-13', '0.0266', 'provider'), rate('2026-11-16', '0.0263', 'provider')];
  it('uses the newest rate up to the date (weekends fall back to Friday)', () => {
    expect(storedRateFor(rates, 'THB', '2026-11-15')?.rate).toBe('0.0266');
    expect(storedRateFor(rates, 'THB', '2026-11-10')?.rate).toBe('0.0262');
    expect(suggestedRate(rates, [], 'THB', '2026-11-16')).toMatchObject({ rate: '0.0263', source: 'provider' });
  });
  it('an own rate for the same day beats the ECB rate', () => {
    const withOwn = [...rates, rate('2026-11-16', '0.0255', 'manual', '2026-11-15T00:00:00Z')];
    expect(storedRateFor(withOwn, 'THB', '2026-11-16')).toMatchObject({ rate: '0.0255', source: 'manual' });
  });
});
