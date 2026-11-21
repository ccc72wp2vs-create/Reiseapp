import { describe, expect, it } from 'vitest';
import { localExpense } from '../../shared/offlineExpense';

describe('offline expense', () => {
  it('matches the server rules: rate, base amount, equal split, payer', () => {
    const e = localExpense(
      'x',
      't',
      'EUR',
      { title: 'Inas Restaurant', amountMinor: 151000, currency: 'THB', date: '2026-11-19', category: 'food', paidByTravelerId: 'lilli', splitMethod: 'equal', splits: [{ travelerId: 'lilli' }, { travelerId: 'john' }], fxRate: '0.0262', fxSource: 'cached', fxDate: '2026-11-18' },
      '2026-11-19T12:00:00Z',
    );
    expect(e.version).toBe(0);
    expect(e.baseAmountMinor).toBe(3956);
    expect(e.shares.reduce((a, s) => a + s.baseShareMinor, 0)).toBe(3956);
    expect(e.shares.map((s) => s.shareMinor)).toEqual([75500, 75500]);
    expect(e.payers).toEqual([{ travelerId: 'lilli', amountMinor: 151000, baseAmountMinor: 3956 }]);
    expect(e).toMatchObject({ fxRate: '0.0262', fxSource: 'cached', fxDate: '2026-11-18' });
  });
  it('rejects input the server would reject', () => {
    const base = { title: 'x', amountMinor: 100, currency: 'THB', date: '2026-11-19', category: 'food' as const, paidByTravelerId: 'a', splitMethod: 'equal' as const, splits: [{ travelerId: 'a' }] };
    expect(() => localExpense('x', 't', 'EUR', base, '')).toThrow();
    expect(() => localExpense('x', 't', 'EUR', { ...base, currency: 'EUR', splits: [] }, '')).toThrow();
  });
});
