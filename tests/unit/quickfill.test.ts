import { describe, expect, it } from 'vitest';
import { guessCategory, lastParticipants, recentTemplates } from '../../shared/quickfill';
import type { ExpenseDto } from '../../shared/types';

const e = (title: string, createdAt: string, payer: string, shares: string[], extra: Partial<ExpenseDto> = {}) =>
  ({ title, createdAt, amountMinor: 22000, currency: 'THB', category: 'transportation', bookingId: null, payers: [{ travelerId: payer }], shares: shares.map((travelerId) => ({ travelerId })), ...extra }) as unknown as ExpenseDto;

describe('quick fill', () => {
  it('guesses the category from the title', () => {
    expect(guessCategory('Grab zum Pier')).toBe('transportation');
    expect(guessCategory('Massage 60 min')).toBe('activities');
    expect(guessCategory('Inas Restaurant')).toBe('food');
    expect(guessCategory('7-Eleven')).toBe('shopping');
    expect(guessCategory('xyz')).toBeNull();
  });
  it('uses the group of my last expense and offers recent templates', () => {
    const list = [e('Grab', '2026-11-16T10:00:00Z', 'john', ['john', 'lilli']), e('Bier', '2026-11-15T10:00:00Z', 'john', ['john', 'lilli', 'tim', 'annika']), e('Grab', '2026-11-14T10:00:00Z', 'tim', ['tim'])];
    expect(lastParticipants(list, 'john')).toEqual(['john', 'lilli']);
    expect(lastParticipants(list, 'nobody')).toBeNull();
    expect(recentTemplates(list).map((x) => x.title)).toEqual(['Grab', 'Bier']);
  });
});
