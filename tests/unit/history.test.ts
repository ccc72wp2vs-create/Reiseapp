import { describe, expect, it } from 'vitest';
import { amountFor, groupByDay, groupByStop, matchesSearch, possibleDuplicates } from '../../shared/history';
import type { DestinationDto, ExpenseDto } from '../../shared/types';

const e = (id: string, title: string, date: string, amountMinor: number, extra: Partial<ExpenseDto> = {}) =>
  ({ id, title, date, amountMinor, currency: 'THB', baseAmountMinor: Math.round(amountMinor * 0.0268), createdAt: `${date}T10:00:00Z`, bookingId: null, notes: null, shares: [{ travelerId: 'a', baseShareMinor: 10 }, { travelerId: 'b', baseShareMinor: 20 }], ...extra }) as ExpenseDto;
const dests = [
  { id: 'lanta', name: 'Koh Lanta', arrivalDate: '2026-11-14', departureDate: '2026-11-18', sortOrder: 0 },
  { id: 'krabi', name: 'Krabi', arrivalDate: '2026-11-18', departureDate: '2026-11-21', sortOrder: 1 },
] as unknown as DestinationDto[];

describe('wallet history', () => {
  const list = [e('1', 'Inas Restaurant', '2026-11-16', 151000), e('2', 'Inas Restaurant', '2026-11-16', 120000), e('3', 'Tauchen', '2026-11-19', 900000)];
  it('groups by day and by stop with subtotals', () => {
    expect(groupByDay(list).map((g) => [g.label, g.items.length])).toEqual([
      ['2026-11-19', 1],
      ['2026-11-16', 2],
    ]);
    expect(groupByStop(list, dests, []).map((g) => [g.label, g.items.length])).toEqual([
      ['Krabi', 1],
      ['Koh Lanta', 2],
    ]);
    expect(amountFor(list[0], ['b'])).toBe(20);
  });
  it('searches title and notes, ignoring accents and case', () => {
    expect(matchesSearch({ title: 'Maßanzug – Anzahlung', notes: null }, 'massanzug')).toBe(true);
    expect(matchesSearch({ title: 'Inas Restaurant', notes: 'Schnitzel' }, 'inas schnitzel')).toBe(true);
    expect(matchesSearch({ title: 'Inas Restaurant', notes: null }, 'tauchen')).toBe(false);
  });
  it('flags probable double entries only', () => {
    expect([...possibleDuplicates(list)]).toEqual([]);
    expect([...possibleDuplicates([...list, e('4', 'Restaurant Inas', '2026-11-16', 151000)])].sort()).toEqual(['1', '4']);
  });
});
