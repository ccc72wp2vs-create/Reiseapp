import { describe, expect, it } from 'vitest';
import { parseExpenseSentence } from '../../shared/sentence';

const travelers = [
  { id: 'john', name: 'John', partnerId: 'lilli' },
  { id: 'lilli', name: 'Lilli', partnerId: 'john' },
  { id: 'tim', name: 'Tim', partnerId: 'annika' },
  { id: 'annika', name: 'Annika', partnerId: 'tim' },
];
const p = (s: string) => parseExpenseSentence(s, travelers, 'john', 'THB');

describe('expense as a sentence', () => {
  it('reads amount, payer and group', () => {
    expect(p('Taxi 450 Baht, Lilli hat bezahlt, für alle')).toMatchObject({ title: 'Taxi', amountMinor: 45000, currency: 'THB', payerId: 'lilli', participantIds: ['john', 'lilli', 'tim', 'annika'], category: 'transportation' });
    expect(p('Massage 600 für Annika und Tim')).toMatchObject({ title: 'Massage', amountMinor: 60000, currency: 'THB', payerId: null, participantIds: ['tim', 'annika'], category: 'activities' });
    expect(p('Abendessen 1.510 ฿ für uns')).toMatchObject({ title: 'Abendessen', amountMinor: 151000, participantIds: ['john', 'lilli'], category: 'food' });
    expect(p('Eintritt 12,50 € bezahlt von Tim für mich')).toMatchObject({ title: 'Eintritt', amountMinor: 1250, currency: 'EUR', payerId: 'tim', participantIds: ['john'] });
    expect(p('Ich habe 220 Baht für Grab bezahlt')).toMatchObject({ amountMinor: 22000, payerId: 'john' });
  });
  it('leaves unknown parts open', () => {
    expect(p('Souvenirs')).toMatchObject({ title: 'Souvenirs', amountMinor: null, currency: null, payerId: null, participantIds: null });
  });
});
