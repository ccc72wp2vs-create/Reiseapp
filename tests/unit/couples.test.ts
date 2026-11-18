import { describe, expect, it } from 'vitest';
import { coupleBalances, coupleSettlements, groupCouples, hasCouples } from '../../shared/couples';
import type { TravelerBalance } from '../../shared/finance';

const bal = (travelerId: string, balanceMinor: number): TravelerBalance => ({ travelerId, balanceMinor, paidMinor: 0, owedMinor: 0, settledOutMinor: 0, settledInMinor: 0 });
const travelers = [
  { id: 'john', partnerId: 'lilli' },
  { id: 'lilli', partnerId: 'john' },
  { id: 'tim', partnerId: 'annika' },
  { id: 'annika', partnerId: 'tim' },
];

describe('couples', () => {
  it('groups mutual partners and keeps singles', () => {
    expect(groupCouples([...travelers, { id: 'solo', partnerId: null }]).map((c) => c.memberIds)).toEqual([['john', 'lilli'], ['tim', 'annika'], ['solo']]);
    expect(groupCouples([{ id: 'x', partnerId: 'y' }, { id: 'y', partnerId: null }]).map((c) => c.memberIds)).toEqual([['x'], ['y']]);
    expect(hasCouples(travelers)).toBe(true);
    expect(hasCouples([{ id: 'x' }, { id: 'y' }])).toBe(false);
  });

  it('sums balances per couple and settles with one transfer', () => {
    const couples = coupleBalances(travelers, [bal('john', -1490), bal('lilli', 6010), bal('tim', -2520), bal('annika', -2000)]);
    expect(couples.map((c) => c.balanceMinor)).toEqual([4520, -4520]);
    expect(coupleSettlements(couples)).toEqual([{ fromKey: 'tim', toKey: 'john', amountMinor: 4520, fromTravelerId: 'tim', toTravelerId: 'lilli' }]);
  });

  it('suggests nothing when couples are even, even if partners are not', () => {
    const couples = coupleBalances(travelers, [bal('john', -500), bal('lilli', 500), bal('tim', 0), bal('annika', 0)]);
    expect(coupleSettlements(couples)).toEqual([]);
  });
});

describe('next payer', () => {
  it('names the couple that advanced least, or nobody when even', async () => {
    const { nextPayer } = await import('../../shared/couples');
    expect(nextPayer(travelers, [bal('john', 3000), bal('lilli', 1000), bal('tim', -2500), bal('annika', -1500)])).toEqual({ memberIds: ['tim', 'annika'], balanceMinor: -4000 });
    expect(nextPayer(travelers, [bal('john', 300), bal('lilli', 0), bal('tim', -300), bal('annika', 0)])).toBeNull();
  });
});
