import { describe, expect, it } from 'vitest';
import { balanceBreakdown, computeBalances, computeShares, netPaidMinor, SplitError, suggestSettlements } from '../../shared/finance';
import { allocate, convertMinor, formatMoney, minorToInput, normalizeRate, parseAmount, parseRate, sum } from '../../shared/money';

describe('parseAmount (German & international input)', () => {
  it('parses German formats', () => {
    expect(parseAmount('12,50', 'EUR')).toBe(1250);
    expect(parseAmount('1.234,56', 'EUR')).toBe(123456);
    expect(parseAmount('1.234', 'EUR')).toBe(123400);
    expect(parseAmount('0,5', 'EUR')).toBe(50);
    expect(parseAmount('1 420', 'EUR')).toBe(142000);
  });
  it('parses dot decimals and zero-decimal currencies', () => {
    expect(parseAmount('12.5', 'EUR')).toBe(1250);
    expect(parseAmount('1,234.56', 'USD')).toBe(123456);
    expect(parseAmount('1500', 'JPY')).toBe(1500);
    expect(parseAmount('1,5', 'JPY')).toBeNull();
  });
  it('rejects invalid input', () => {
    expect(parseAmount('', 'EUR')).toBeNull();
    expect(parseAmount('abc', 'EUR')).toBeNull();
    expect(parseAmount('1,234', 'EUR')).toBeNull(); // 3 decimals
  });
  it('formats in German style', () => {
    expect(formatMoney(142000, 'EUR')).toMatch(/1\.420,00\s?€/);
    expect(minorToInput(123456, 'EUR')).toBe('1234,56');
  });
});

describe('exchange rates', () => {
  it('parses and normalises rates', () => {
    expect(parseRate('0,0256')).toEqual({ numerator: 256n, scale: 4 });
    expect(normalizeRate('39,1200')).toBe('39.12');
    expect(normalizeRate('0')).toBeNull();
    expect(normalizeRate('-1')).toBeNull();
  });
  it('converts with exact integer rounding (half away from zero)', () => {
    // 1 000 THB * 0.0256 = 25.60 EUR
    expect(convertMinor(100000, 'THB', 'EUR', '0.0256')).toBe(2560);
    // 333.33 THB * 0.0256 = 8.533248 EUR -> 8.53
    expect(convertMinor(33333, 'THB', 'EUR', '0.0256')).toBe(853);
    // 0.02 THB * 0.25 = 0.005 EUR -> rounds half up to 0.01
    expect(convertMinor(2, 'THB', 'EUR', '0.25')).toBe(1);
    // zero-decimal target currency
    expect(convertMinor(1000, 'EUR', 'JPY', '161.5')).toBe(1615);
    expect(convertMinor(500, 'EUR', 'EUR', '999')).toBe(500);
  });
  it('avoids floating point errors', () => {
    // 0.1 + 0.2 style trap: 10 * 0.1 + 20 * 0.1
    expect(convertMinor(10, 'USD', 'EUR', '0.1') + convertMinor(20, 'USD', 'EUR', '0.1')).toBe(3);
    expect(convertMinor(123456789, 'THB', 'EUR', '0.026317')).toBe(3249012); // 1 234 567,89 × 0,026317 = 32 490,1201…;
  });
});

describe('allocate (largest remainder)', () => {
  it('always sums to the total', () => {
    for (const total of [1, 2, 99, 100, 101, 1000, 999999]) {
      for (const n of [1, 2, 3, 4, 7]) {
        const parts = allocate(total, Array(n).fill(1));
        expect(sum(parts)).toBe(total);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('is deterministic (earlier participants get remainder first)', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
  });
  it('respects weights and zero weights', () => {
    expect(allocate(1000, [1, 0, 1])).toEqual([500, 0, 500]);
    expect(allocate(1001, [2, 1])).toEqual([667, 334]);
  });
});

describe('computeShares', () => {
  it('equal split (4 people, odd amount)', () => {
    const s = computeShares(1001, 26, 'equal', [{ travelerId: 'a' }, { travelerId: 'b' }, { travelerId: 'c' }, { travelerId: 'd' }]);
    expect(s.map((x) => x.shareMinor)).toEqual([251, 250, 250, 250]);
    expect(sum(s.map((x) => x.shareMinor))).toBe(1001);
    expect(sum(s.map((x) => x.baseShareMinor))).toBe(26);
  });
  it('unequal (exact) split must match the total', () => {
    const s = computeShares(10000, 10000, 'exact', [
      { travelerId: 'a', value: 7000 },
      { travelerId: 'b', value: 3000 },
    ]);
    expect(s.map((x) => x.shareMinor)).toEqual([7000, 3000]);
    expect(() =>
      computeShares(10000, 10000, 'exact', [
        { travelerId: 'a', value: 7000 },
        { travelerId: 'b', value: 2999 },
      ]),
    ).toThrow(SplitError);
  });
  it('percentage split reconciles with rounding', () => {
    const s = computeShares(10000, 10000, 'percent', [
      { travelerId: 'a', value: 3333 },
      { travelerId: 'b', value: 3333 },
      { travelerId: 'c', value: 3334 },
    ]);
    expect(sum(s.map((x) => x.shareMinor))).toBe(10000);
    expect(s.map((x) => x.shareMinor)).toEqual([3333, 3333, 3334]);
    expect(() =>
      computeShares(10000, 10000, 'percent', [
        { travelerId: 'a', value: 5000 },
        { travelerId: 'b', value: 4000 },
      ]),
    ).toThrow(/percent_sum_mismatch/);
  });
  it('multi-currency: base shares sum exactly to the converted total', () => {
    const amount = 184000; // 1 840 THB
    const base = convertMinor(amount, 'THB', 'EUR', '0.0262'); // 48.21 EUR
    expect(base).toBe(4821);
    const s = computeShares(amount, base, 'equal', ['a', 'b', 'c'].map((travelerId) => ({ travelerId })));
    expect(sum(s.map((x) => x.shareMinor))).toBe(amount);
    expect(sum(s.map((x) => x.baseShareMinor))).toBe(base);
  });
  it('rejects duplicates and empty participants', () => {
    expect(() => computeShares(100, 100, 'equal', [])).toThrow(SplitError);
    expect(() => computeShares(100, 100, 'equal', [{ travelerId: 'a' }, { travelerId: 'a' }])).toThrow(SplitError);
  });
});

describe('balances & settlements', () => {
  const ids = ['anna', 'ben', 'clara', 'david'];
  const share = (amount: number, who: string[]) =>
    computeShares(amount, amount, 'equal', who.map((travelerId) => ({ travelerId }))).map((s) => ({
      travelerId: s.travelerId,
      baseShareMinor: s.baseShareMinor,
    }));

  it('computes balances that always sum to zero', () => {
    const expenses = [
      { payers: [{ travelerId: 'anna', baseAmountMinor: 10000 }], baseAmountMinor: 10000, shares: share(10000, ids) },
      { payers: [{ travelerId: 'ben', baseAmountMinor: 3001 }], baseAmountMinor: 3001, shares: share(3001, ['ben', 'clara', 'david']) },
    ];
    const b = computeBalances(ids, expenses, []);
    expect(sum(b.map((x) => x.balanceMinor))).toBe(0);
    const anna = b.find((x) => x.travelerId === 'anna')!;
    expect(anna.balanceMinor).toBe(7500);
  });

  it('suggests transfers that settle everything exactly', () => {
    const expenses = [
      { payers: [{ travelerId: 'anna', baseAmountMinor: 12000 }], baseAmountMinor: 12000, shares: share(12000, ids) },
      { payers: [{ travelerId: 'ben', baseAmountMinor: 4001 }], baseAmountMinor: 4001, shares: share(4001, ids) },
      { payers: [{ travelerId: 'clara', baseAmountMinor: 999 }], baseAmountMinor: 999, shares: share(999, ['clara', 'david']) },
    ];
    const balances = computeBalances(ids, expenses, []);
    const transfers = suggestSettlements(balances);
    expect(transfers.length).toBeLessThanOrEqual(ids.length - 1);
    const after = computeBalances(
      ids,
      expenses,
      transfers.map((t) => ({ fromTravelerId: t.fromTravelerId, toTravelerId: t.toTravelerId, baseAmountMinor: t.amountMinor })),
    );
    expect(after.every((x) => x.balanceMinor === 0)).toBe(true);
  });

  it('treats recorded settlements as repayments, not expenses', () => {
    const expenses = [{ payers: [{ travelerId: 'anna', baseAmountMinor: 2000 }], baseAmountMinor: 2000, shares: share(2000, ['anna', 'ben']) }];
    const b = computeBalances(['anna', 'ben'], expenses, [{ fromTravelerId: 'ben', toTravelerId: 'anna', baseAmountMinor: 1000 }]);
    expect(b.find((x) => x.travelerId === 'ben')).toMatchObject({ owedMinor: 1000, settledOutMinor: 1000, balanceMinor: 0, paidMinor: 0 });
    expect(b.find((x) => x.travelerId === 'anna')).toMatchObject({ paidMinor: 2000, settledInMinor: 1000, balanceMinor: 0 });
  });

  it('handles partial settlements', () => {
    const expenses = [{ payers: [{ travelerId: 'anna', baseAmountMinor: 3000 }], baseAmountMinor: 3000, shares: share(3000, ['anna', 'ben', 'clara']) }];
    const b = computeBalances(['anna', 'ben', 'clara'], expenses, [{ fromTravelerId: 'ben', toTravelerId: 'anna', baseAmountMinor: 400 }]);
    const t = suggestSettlements(b);
    expect(t).toEqual([
      { fromTravelerId: 'clara', toTravelerId: 'anna', amountMinor: 1000 },
      { fromTravelerId: 'ben', toTravelerId: 'anna', amountMinor: 600 },
    ]);
  });

  it('net paid equals the share once everything is settled (couple scenario)', () => {
    // John advances 3 838,32 € for John & Lilli, Annika 3 903,32 € for Annika & Tim
    const ids4 = ['john', 'lilli', 'tim', 'annika'];
    const expenses = [
      { payers: [{ travelerId: 'john', baseAmountMinor: 383832 }], baseAmountMinor: 383832, shares: share(383832, ['john', 'lilli']) },
      { payers: [{ travelerId: 'annika', baseAmountMinor: 390332 }], baseAmountMinor: 390332, shares: share(390332, ['annika', 'tim']) },
    ];
    const before = computeBalances(ids4, expenses, []);
    expect(before.map(netPaidMinor)).toEqual([383832, 0, 0, 390332]);
    const transfers = suggestSettlements(before);
    const after = computeBalances(
      ids4,
      expenses,
      transfers.map((x) => ({ fromTravelerId: x.fromTravelerId, toTravelerId: x.toTravelerId, baseAmountMinor: x.amountMinor })),
    );
    expect(after.map(netPaidMinor)).toEqual(after.map((b) => b.owedMinor));
    expect(after.map(netPaidMinor)).toEqual([191916, 191916, 195166, 195166]);
    expect(sum(after.map(netPaidMinor))).toBe(383832 + 390332);
  });

  it('supports several payers for one expense', () => {
    // 100 € dinner for four; John paid 60 €, Annika 40 €
    const ids4 = ['john', 'lilli', 'tim', 'annika'];
    const e = { payers: [{ travelerId: 'john', baseAmountMinor: 6000 }, { travelerId: 'annika', baseAmountMinor: 4000 }], baseAmountMinor: 10000, shares: share(10000, ids4) };
    const b = computeBalances(ids4, [e], []);
    expect(b.map((x) => x.balanceMinor)).toEqual([3500, -2500, -2500, 1500]);
    expect(sum(b.map((x) => x.balanceMinor))).toBe(0);
    expect(b.map(netPaidMinor)).toEqual([6000, 0, 0, 4000]);
  });

  it('explains each balance item by item (sums to the balance)', () => {
    const ids4 = ['john', 'lilli', 'tim', 'annika'];
    const own = (amount: number) => share(amount, ids4).map((x) => ({ travelerId: x.travelerId, baseAmountMinor: x.baseShareMinor }));
    const expenses = [
      { id: 'flight', title: 'Hinflug', date: '2026-11-06', payers: own(284000), shares: share(284000, ids4) },
      { id: 'boat', title: 'Speedboat', date: '2026-11-13', payers: [{ travelerId: 'lilli', baseAmountMinor: 15077 }], shares: share(15077, ids4) },
      { id: 'dinner', title: 'Abendessen', date: '2026-11-14', payers: [{ travelerId: 'john', baseAmountMinor: 6000 }, { travelerId: 'annika', baseAmountMinor: 4000 }], shares: share(10000, ids4) },
    ];
    const settlements = [{ id: 's1', date: '2026-11-15', fromTravelerId: 'tim', toTravelerId: 'lilli', baseAmountMinor: 3769 }];
    const balances = computeBalances(ids4, expenses.map((e) => ({ payers: e.payers, baseAmountMinor: e.payers.reduce((a, p) => a + p.baseAmountMinor, 0), shares: e.shares })), settlements);
    for (const id of ids4) {
      const items = balanceBreakdown(id, expenses, settlements);
      expect(sum(items.map((i) => i.amountMinor))).toBe(balances.find((b) => b.travelerId === id)!.balanceMinor);
      expect(items.some((i) => i.id === 'flight')).toBe(false); // everyone paid their own share
    }
    const tim = balanceBreakdown('tim', expenses, settlements);
    expect(tim.find((i) => i.id === 'boat')).toMatchObject({ amountMinor: -3769, counterpartIds: ['lilli'] });
    expect(tim.find((i) => i.id === 'dinner')).toMatchObject({ amountMinor: -2500, counterpartIds: ['john', 'annika'] });
    expect(tim.find((i) => i.id === 's1')).toMatchObject({ kind: 'settlement', amountMinor: 3769, counterpartIds: ['lilli'] });
  });
});
