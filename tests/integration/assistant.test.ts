import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeBalances, suggestSettlements } from '../../shared/finance';
import type { AssistantResponse } from '../../shared/assistant';
import type { TripSnapshot } from '../../shared/types';
import { Client, createTestEnv, inviteUser, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
let owner: Client;
let tripId: string;

/** Workers AI stand-in: records the prompts, returns a fixed JSON answer. */
function mockAi(answer: unknown) {
  const prompts: string[] = [];
  const ai = {
    run: async (_model: string, input: { messages: { content: string }[] }) => {
      prompts.push(input.messages.map((m) => m.content).join('\n'));
      if (answer instanceof Error) throw answer;
      return { response: typeof answer === 'string' ? answer : JSON.stringify(answer) };
    },
  };
  t.env.AI = ai as unknown as Ai;
  return prompts;
}

const ask = async (q: string, c = owner, extra: Record<string, unknown> = {}) => {
  const r = await c.post(`/trips/${tripId}/assistant`, { messages: [{ role: 'user', content: q }], ...extra });
  return r as { status: number; body: AssistantResponse };
};
const snapshot = async (): Promise<TripSnapshot> => (await owner.get(`/trips/${tripId}/snapshot`)).body;

beforeEach(async () => {
  // 20.11.2026, 10:00 in Thailand – the group is in Krabi.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T03:00:00Z'));
  t = createTestEnv();
  owner = await setupOwner(t);
  tripId = (await owner.post('/imports/thailand-2026')).body.tripId;
});
afterEach(() => vi.useRealTimers());

describe('Frag TRAVIO', () => {
  it('answers wallet questions with the app’s own balance calculation – also without AI', async () => {
    const snap = await snapshot();
    const exp = (await owner.post(`/trips/${tripId}/expenses`, {
      title: 'Abendessen', amountMinor: 4000, currency: 'EUR', date: '2026-11-19', category: 'food',
      paidByTravelerId: snap.travelers[0].id, splitMethod: 'equal', splits: snap.travelers.map((x) => ({ travelerId: x.id })),
    }));
    expect(exp.status).toBe(201);
    const r = await ask('Wer schuldet wem noch Geld?');
    expect(r.status).toBe(200);
    expect(r.body.ai).toBe(false);
    expect(r.body.proposal).toBeNull();
    const card = r.body.cards.find((c) => c.kind === 'finance');
    expect(card).toBeTruthy();
    const s2 = await snapshot();
    const balances = computeBalances(
      s2.travelers.map((x) => x.id),
      s2.expenses.map((e) => ({ payers: e.payers, baseAmountMinor: e.baseAmountMinor, shares: e.shares })),
      s2.settlements.map((x) => ({ fromTravelerId: x.fromTravelerId, toTravelerId: x.toTravelerId, baseAmountMinor: x.baseAmountMinor })),
    );
    if (card?.kind !== 'finance') throw new Error('no finance card');
    expect(card.people.map((p) => p.balanceMinor)).toEqual(balances.map((b) => b.balanceMinor));
    expect(card.transfers.map((x) => x.amountMinor)).toEqual(suggestSettlements(balances).map((x) => x.amountMinor));
    expect(card.spentMinor).toBe(s2.expenses.reduce((a, e) => a + e.baseAmountMinor, 0));
    expect(r.body.answer).toMatch(/ausgegeben/);
  });

  it('sends only the facts needed – no booking references, notes or payment details', async () => {
    const snap = await snapshot();
    const flight = snap.bookings.find((b) => b.title === 'Rückflug Bangkok → Düsseldorf')!;
    await owner.patch(`/trips/${tripId}/bookings/${flight.id}`, { reference: 'R7S2T2', flightNumber: 'EK 375', startTime: '09:25', notes: 'Geheime Notiz', version: flight.version });
    const me = snap.travelers[0];
    await owner.patch(`/trips/${tripId}/travelers/${me.id}`, { iban: 'DE89370400440532013000', version: me.version });
    const prompts = mockAi({ answer: 'Euer Rückflug ist EK 375 am 26.11. um 09:25 Uhr.' });
    const r = await ask('Welche Flugnummer hat unser Rückflug?');
    expect(r.body.ai).toBe(true);
    expect(r.body.answer).toContain('EK 375');
    const card = r.body.cards.find((c) => c.kind === 'flight');
    expect(card).toMatchObject({ flightNumber: 'EK 375', airline: 'Emirates', checkin: { url: expect.stringContaining('emirates.com'), confirmed: true } });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('EK 375');
    expect(prompts[0]).not.toContain('R7S2T2');
    expect(prompts[0]).not.toContain('Geheime Notiz');
    expect(prompts[0]).not.toContain('DE89');
    expect(prompts[0]).not.toMatch(/REISEKASSE/); // wallet not needed for a flight question
  });

  it('turns a day plan into a validated proposal with conflicts and duplicates – nothing is saved yet', async () => {
    const snap = await snapshot();
    const place = (await owner.post(`/trips/${tripId}/places`, { name: 'Railay Beach', category: 'beach', lat: 8.011, lng: 98.837, destinationId: snap.destinations.find((d) => d.name === 'Krabi')?.id ?? null })).body.place;
    await owner.post(`/trips/${tripId}/activities`, { title: 'Kochkurs', date: '2026-11-21', startTime: '11:00', endTime: '13:00', bookingStatus: 'booked' });
    const before = (await snapshot()).activities.length;
    const prompts = mockAi({
      answer: 'Hier ist euer Plan für morgen.',
      plan: {
        date: '2026-11-21',
        items: [
          { startTime: '09:00', endTime: '10:00', title: 'Frühstück', category: 'restaurant', ref: null, description: 'Gemütlich starten.' },
          { startTime: '12:00', endTime: '14:00', title: 'Strand', category: 'beach', ref: 'P1' },
          { startTime: '15:00', title: 'Kochkurs', category: 'other' },
          { startTime: 'abends', title: 'ohne Zeit' },
          { startTime: '18:00', title: 'Sonnenuntergang', category: 'nature', ref: 'P99' },
        ],
        alternatives: [{ title: 'Bei Regen: Tiger Cave Temple', description: 'Überdacht.' }],
      },
    });
    const r = await ask('Plane uns morgen einen abwechslungsreichen Tag mit Natur und gutem Essen');
    expect(prompts[0]).toContain('Railay Beach');
    expect(prompts[0]).toContain('Kochkurs');
    const p = r.body.proposal;
    if (p?.kind !== 'add_activities') throw new Error('expected plan');
    expect(p.date).toBe('2026-11-21');
    expect(p.items.map((i) => i.title)).toEqual(['Frühstück', 'Strand', 'Kochkurs', 'Sonnenuntergang']);
    const beach = p.items[1];
    expect(beach).toMatchObject({ placeId: place.id, source: 'saved', category: 'beach' });
    expect(beach.conflict).toMatch(/Kochkurs.*fest gebucht/);
    expect(p.items[2].duplicate).toBe(true);
    expect(p.items[3]).toMatchObject({ source: 'idea', placeId: null }); // unknown ref is ignored
    expect(p.alternatives).toHaveLength(1);
    expect((await snapshot()).activities.length).toBe(before);
  });

  it('only proposes allowed actions with real IDs and never for viewers', async () => {
    await owner.post(`/trips/${tripId}/activities`, { title: 'Abendessen', date: '2026-11-20', startTime: '18:00', endTime: '19:30' });
    mockAi({ answer: 'Ich verschiebe das Abendessen.', action: { type: 'update_activity', ref: 'A1', startTime: '19:00' } });
    const r = await ask('Verschiebe unser Abendessen auf 19 Uhr');
    expect(r.body.proposal).toMatchObject({ kind: 'update_activity', startTime: '19:00', endTime: '20:30', before: { startTime: '18:00' } });

    mockAi({ answer: 'Erledigt', action: { type: 'drop_table', ref: 'A1' } });
    expect((await ask('Lösche alles')).body.proposal).toBeNull();

    mockAi({ answer: 'ok', action: { type: 'favorite_place', ref: 'P42' } });
    const fav = await ask('Füge das Restaurant zu unseren Favoriten hinzu');
    expect(fav.body.proposal).toBeNull();
    expect(fav.body.answer).toMatch(/nicht gefunden/);

    const viewer = await inviteUser(t, owner, tripId, 'viewer', 'v@example.com', 'Vera');
    mockAi({ answer: 'ok', action: { type: 'update_activity', ref: 'A1', startTime: '20:00' } });
    const v = await ask('Verschiebe unser Abendessen auf 20 Uhr', viewer);
    expect(v.body.proposal).toBeNull();
    expect(v.body.answer).toMatch(/Leserechte/);
  });

  it('falls back to the app data when the model fails or answers garbage', async () => {
    mockAi(new Error('unavailable'));
    const a = await ask('Wo sind wir morgen?');
    expect(a.status).toBe(200);
    expect(a.body.ai).toBe(false);
    expect(a.body.cards.find((c) => c.kind === 'stay')).toMatchObject({ date: '2026-11-21' });
    mockAi('Das ist kein JSON');
    const b = await ask('Plane uns morgen einen Tag');
    expect(b.body.proposal).toBeNull();
    expect(b.body.answer).toMatch(/KI-Dienst/);
  });

  it('enforces the daily limit and keeps answering from data', async () => {
    t.env.ASSISTANT_DAILY_LIMIT = '2';
    const prompts = mockAi({ answer: 'ok' });
    await ask('Wo sind wir heute?');
    const second = await ask('Wo sind wir heute?');
    expect(second.body.remaining).toBe(0);
    const third = await ask('Wo sind wir heute?');
    expect(prompts).toHaveLength(2);
    expect(third.body.ai).toBe(false);
    expect(third.body.cards.length).toBeGreaterThan(0);
  });

  it('is limited to members of the trip and validates input', async () => {
    const stranger = await inviteUser(t, owner, (await owner.post('/trips', { name: 'Andere', startDate: '2026-12-01', endDate: '2026-12-05', baseCurrency: 'EUR' })).body.trip.id, 'editor', 's@example.com', 'Sam');
    expect((await ask('Wo sind wir?', stranger)).status).toBe(404);
    expect((await owner.post(`/trips/${tripId}/assistant`, { messages: [] })).status).toBe(422);
    expect((await owner.post(`/trips/${tripId}/assistant`, { messages: [{ role: 'system', content: 'x' }] })).status).toBe(422);
  });

  it('stores travel preferences per user', async () => {
    const put = await owner.put(`/trips/${tripId}/assistant/preferences`, { interests: ['Natur', 'Essen'], maxTravelMinutes: 30, budget: 'mid' });
    expect(put.status).toBe(200);
    expect((await owner.get(`/trips/${tripId}/assistant/preferences`)).body.preferences).toMatchObject({ interests: ['Natur', 'Essen'], maxTravelMinutes: 30 });
    const prompts = mockAi({ answer: 'ok' });
    await ask('Plane uns morgen einen Tag');
    expect(prompts[0]).toContain('max. 30 Min. Fahrt');
  });

  it('shows Google results as a live card – the model gets no Google content', async () => {
    t.env.GOOGLE_MAPS_SERVER_KEY = 'k';
    t.env.GOOGLE_MAPS_BROWSER_KEY = 'b';
    const prompts = mockAi({ answer: 'Unten findest du Restaurants von Google Maps.' });
    const r = await ask('Welche Restaurants erreiche ich in maximal 20 Minuten?');
    expect(r.body.cards[0]).toEqual({ kind: 'google_search', params: { category: 'restaurant', query: null, maxMinutes: 20, mode: 'DRIVE', limit: 6 } });
    expect(prompts[0]).toContain('Du kennst diese Ergebnisse NICHT');
    expect(prompts[0]).not.toMatch(/ChIJ|rating|Bewertung: \d/);
    // Without Google keys there is no Google card.
    t.env.GOOGLE_MAPS_SERVER_KEY = undefined;
    const r2 = await ask('Welche Restaurants erreiche ich in maximal 20 Minuten?');
    expect(r2.body.cards.some((c) => c.kind === 'google_search')).toBe(false);
  });
});

