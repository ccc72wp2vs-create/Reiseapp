import { describe, expect, it } from 'vitest';
import { normalizeReceipt, splitReceipt } from '../../shared/receipt';

const [A, T, L, J] = ['annika', 'tim', 'lilli', 'john'];
const order = [J, L, T, A];

describe('receipt split', () => {
  it('reproduces the Beach Bar split (couples, shared items, tip on all)', () => {
    const s = splitReceipt(
      [
        { amountMinor: 43000, travelerIds: [A, T] },
        { amountMinor: 33000, travelerIds: [L, J] },
        { amountMinor: 68000, travelerIds: order },
      ],
      5000,
      order,
    );
    expect(s.totalMinor).toBe(149000);
    expect(Object.fromEntries(s.shares.map((x) => [x.travelerId, x.amountMinor]))).toEqual({ annika: 39750, tim: 39750, lilli: 34750, john: 34750 });
    expect(s.unassigned).toBe(0);
  });

  it('counts unassigned lines and keeps cents exact', () => {
    const s = splitReceipt([{ amountMinor: 1000, travelerIds: [J, L, T] }, { amountMinor: 500, travelerIds: [] }], 0, order);
    expect(s.unassigned).toBe(1);
    expect(s.shares.reduce((a, x) => a + x.amountMinor, 0)).toBe(1000);
  });

  it('normalises the model answer defensively', () => {
    const r = normalizeReceipt({ merchant: 'Inas', date: '2026-11-16', currency: 'thb', items: [{ qty: '1', name: 'Coconut', amount: '80' }, { name: 'Schnitzel', amount: 415 }, { name: 'Rabatt', amount: -50 }, { name: '', amount: 10 }, { name: 'x', amount: 'abc' }], tip: '0', total: '1.510,00' })!;
    expect(r.currency).toBe('THB');
    expect(r.lines.map((l) => [l.name, l.amountMinor])).toEqual([
      ['Coconut', 8000],
      ['Schnitzel', 41500],
      ['Rabatt', -5000],
    ]);
    expect(r.totalMinor).toBe(151000);
    expect(normalizeReceipt(null)).toBeNull();
  });
});
