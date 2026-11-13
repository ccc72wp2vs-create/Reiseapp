import { beforeEach, describe, expect, it } from 'vitest';
import { costInfo } from '../../shared/costs';
import type { BookingDto, TripSnapshot } from '../../shared/types';
import { Client, createTestEnv, inviteUser, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
let owner: Client;
beforeEach(async () => {
  t = createTestEnv();
  owner = await setupOwner(t, 'ich@example.com', 'Ich');
});

async function importThailand(c = owner) {
  return c.post('/imports/thailand-2026');
}
async function snapshot(tripId: string, c = owner): Promise<TripSnapshot> {
  return (await c.get(`/trips/${tripId}/snapshot`)).body;
}
const byTitle = (s: TripSnapshot, title: string) => s.bookings.find((b) => b.title === title)!;

describe('Thailand 2026 import', () => {
  it('creates the trip in D1 exactly once', async () => {
    const first = await importThailand();
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(true);
    const second = await importThailand();
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ tripId: first.body.tripId, created: false });
    const n = t.db.sqlite.prepare("SELECT COUNT(*) AS n FROM trips WHERE name = 'Thailand 2026'").get();
    expect(n).toEqual({ n: 1 });
  });

  it('stores trip meta, 4 travelers and the route', async () => {
    const s = await snapshot((await importThailand()).body.tripId);
    expect(s.trip).toMatchObject({
      name: 'Thailand 2026',
      startDate: '2026-11-06',
      endDate: '2026-11-26',
      destinationCountry: 'Thailand',
      baseCurrency: 'EUR',
      localCurrency: 'THB',
      originName: 'Düsseldorf',
      isDemo: false,
    });
    expect(s.travelers).toHaveLength(4);
    expect(s.destinations.map((d) => `${d.name}:${d.arrivalDate}→${d.departureDate}`)).toEqual([
      'Bangkok:2026-11-07→2026-11-09',
      'Phuket:2026-11-09→2026-11-13',
      'Koh Lanta:2026-11-13→2026-11-18',
      'Krabi:2026-11-18→2026-11-21',
      'Chiang Mai:2026-11-21→2026-11-25',
      'Bangkok (Don Mueang):2026-11-25→2026-11-26',
    ]);
    // Accommodation names are unknown and must not be invented.
    expect(s.destinations.every((d) => d.accommodationName === null)).toBe(true);
    expect(s.destinations.every((d) => d.timezone === 'Asia/Bangkok')).toBe(true);
    // Real trip: no invented activities, places or expenses.
    expect(s.activities).toHaveLength(0);
    expect(s.places).toHaveLength(0);
    expect(s.expenses).toHaveLength(0);
  });

  it('keeps booked, paid, planned, unconfirmed strictly apart', async () => {
    const s = await snapshot((await importThailand()).body.tripId);
    expect(s.bookings).toHaveLength(13);
    // Booked is never automatically paid
    const booked = s.bookings.filter((b) => b.bookingStatus === 'booked');
    expect(booked.length).toBe(10); // 6 Unterkünfte + 4 Flüge
    expect(booked.every((b) => b.paymentStatus !== 'paid')).toBe(true);

    const lanta = byTitle(s, 'Transfer Phuket → Koh Lanta');
    expect(lanta).toMatchObject({ type: 'ferry', bookingStatus: 'unconfirmed', costKind: 'estimate', priceMinor: 8000, currency: 'EUR', paymentStatus: 'unpaid' });
    const krabi = byTitle(s, 'Speedboat Koh Lanta → Krabi');
    expect(krabi).toMatchObject({ bookingStatus: 'unconfirmed', costKind: 'budget_cap', priceMinor: 6000, paymentStatus: 'unpaid' });

    const outbound = byTitle(s, 'Hinflug Düsseldorf → Bangkok');
    expect(outbound).toMatchObject({ startDate: '2026-11-06', startTime: null, endDate: '2026-11-07', endTime: '12:55', endTimezone: 'Asia/Bangkok', priceMinor: null, provider: null, reference: null });
    expect(outbound.clarificationNote).toMatch(/Fluggesellschaft/);
  });

  it('stores all cost variants correctly', async () => {
    const s = await snapshot((await importThailand()).body.tripId);
    const expect2 = (title: string, price: number, persons: number | null) => {
      const b = byTitle(s, title);
      expect(b.priceMinor).toBe(price);
      expect(b.currency).toBe('EUR');
      expect(b.personsCount).toBe(persons);
    };
    expect2('Unterkunft Bangkok', 7500, 2);
    expect2('Flug Bangkok (DMK) → Phuket', 13700, 2);
    expect2('Unterkunft Phuket', 46900, null);
    expect2('Unterkunft Koh Lanta', 46400, null);
    expect2('Unterkunft Krabi', 26000, null);
    expect2('Flug Krabi → Chiang Mai', 31000, null);
    expect2('Unterkunft Chiang Mai', 29600, null);
    expect2('Unterkunft Bangkok (Don Mueang)', 4000, null);
    expect2('Rückflug Bangkok → Düsseldorf', 142000, null);

    const cnx = byTitle(s, 'Flug Chiang Mai → Bangkok');
    expect(cnx).toMatchObject({ priceMinor: 36000, unitPriceMinor: 18000, personsCount: null });
    expect(cnx.clarificationNote).toMatch(/Personenbezug/);

    const home = byTitle(s, 'Rückflug Bangkok → Düsseldorf');
    expect(home).toMatchObject({ startTime: '09:30', startTimezone: 'Asia/Bangkok', endTime: '18:55', endTimezone: 'Europe/Berlin' });
    expect(home.fromLocation).not.toMatch(/DMK/);
    expect(home.toDestinationId).toBeNull();
  });

  it('flags unclear person counts and never splits them automatically', async () => {
    const s = await snapshot((await importThailand()).body.tripId);
    const info = (title: string) => costInfo(byTitle(s, title) as BookingDto);
    expect(info('Unterkunft Bangkok')).toMatchObject({ needsClarification: false, perPersonMinor: 3750 });
    expect(info('Unterkunft Phuket')).toMatchObject({ needsClarification: true, perPersonMinor: null });
    expect(info('Flug Chiang Mai → Bangkok')).toMatchObject({ needsClarification: true, perPersonMinor: null });
    expect(info('Transfer Phuket → Koh Lanta')).toMatchObject({ countsAsSpent: false, isPlanned: true });
    expect(info('Unterkunft Koh Lanta')).toMatchObject({ countsAsSpent: false, isCommitted: true });
  });

  it('does not create wallet expenses from bookings and prevents double counting', async () => {
    const tripId = (await importThailand()).body.tripId;
    let s = await snapshot(tripId);
    const hotel = byTitle(s, 'Unterkunft Bangkok');
    const me = s.travelers[0].id;
    // Not paid yet → refused
    const notPaid = await owner.post(`/trips/${tripId}/bookings/${hotel.id}/expense`, { paidByTravelerId: me, participantIds: [me, s.travelers[1].id] });
    expect(notPaid.status).toBe(422);
    // Estimates can never become expenses
    const est = byTitle(s, 'Transfer Phuket → Koh Lanta');
    await owner.patch(`/trips/${tripId}/bookings/${est.id}`, { version: est.version, paymentStatus: 'paid' });
    const estRes = await owner.post(`/trips/${tripId}/bookings/${est.id}/expense`, { paidByTravelerId: me, participantIds: [me] });
    expect(estRes.status).toBe(422);
    // Mark as paid → transfer once
    await owner.patch(`/trips/${tripId}/bookings/${hotel.id}`, { version: hotel.version, paymentStatus: 'paid', paidByTravelerId: me });
    const ok = await owner.post(`/trips/${tripId}/bookings/${hotel.id}/expense`, { paidByTravelerId: me, participantIds: [me, s.travelers[1].id] });
    expect(ok.status).toBe(201);
    expect(ok.body.expense).toMatchObject({ amountMinor: 7500, currency: 'EUR', bookingId: hotel.id, baseAmountMinor: 7500 });
    const twice = await owner.post(`/trips/${tripId}/bookings/${hotel.id}/expense`, { paidByTravelerId: me, participantIds: [me] });
    expect(twice.status).toBe(409);
    s = await snapshot(tripId);
    expect(byTitle(s, 'Unterkunft Bangkok').expenseId).toBe(ok.body.expense.id);
    expect(s.expenses).toHaveLength(1);
  });

  it('is fully editable and status changes do not touch other legs', async () => {
    const tripId = (await importThailand()).body.tripId;
    let s = await snapshot(tripId);
    const lanta = byTitle(s, 'Transfer Phuket → Koh Lanta');
    const r = await owner.patch(`/trips/${tripId}/bookings/${lanta.id}`, {
      version: lanta.version,
      bookingStatus: 'booked',
      costKind: 'actual',
      priceMinor: 7400,
      provider: 'Fährgesellschaft',
      startTime: '08:00',
    });
    expect(r.status).toBe(200);
    const before = s.bookings.filter((b) => b.id !== lanta.id);
    s = await snapshot(tripId);
    const after = s.bookings.filter((b) => b.id !== lanta.id);
    expect(after.map((b) => b.version)).toEqual(before.map((b) => b.version));
    expect(byTitle(s, 'Transfer Phuket → Koh Lanta')).toMatchObject({ bookingStatus: 'booked', priceMinor: 7400 });
  });

  it('demo data is separate, labelled and deletable', async () => {
    await importThailand();
    const demo = await owner.post('/imports/demo-thailand');
    expect(demo.status).toBe(201);
    const s = await snapshot(demo.body.tripId);
    expect(s.trip.isDemo).toBe(true);
    expect(s.trip.name).toMatch(/DEMO/);
    expect(s.bookings.every((b) => /Demo/.test(b.notes ?? ''))).toBe(true);
    expect(s.expenses.length).toBeGreaterThan(0);
    expect(s.expenses.every((e) => e.currency === 'THB' && e.fxSource === 'cached')).toBe(true);
    const del = await owner.del('/demo', {});
    expect(del.body.deleted).toBe(1);
    const trips = (await owner.get('/trips')).body.trips;
    expect(trips.map((x: { name: string }) => x.name)).toEqual(['Thailand 2026']);
  });
});

describe('wallet API', () => {
  async function setup() {
    const tripId = (await importThailand()).body.tripId;
    const s = await snapshot(tripId);
    return { tripId, ids: s.travelers.map((x) => x.id) };
  }

  it('creates, edits and deletes expenses with exact reconciliation', async () => {
    const { tripId, ids } = await setup();
    const missingRate = await owner.post(`/trips/${tripId}/expenses`, {
      title: 'Essen',
      amountMinor: 100001,
      currency: 'THB',
      date: '2026-11-10',
      category: 'food',
      paidByTravelerId: ids[0],
      splits: ids.map((travelerId) => ({ travelerId })),
    });
    expect(missingRate.status).toBe(422);

    const created = await owner.post(`/trips/${tripId}/expenses`, {
      title: 'Essen',
      amountMinor: 100001,
      currency: 'THB',
      date: '2026-11-10',
      category: 'food',
      paidByTravelerId: ids[0],
      splits: ids.map((travelerId) => ({ travelerId })),
      fxRate: '0,0256',
      fxSource: 'manual',
    });
    expect(created.status).toBe(201);
    const e = created.body.expense;
    expect(e).toMatchObject({ fxRate: '0.0256', fxSource: 'manual', fxDate: '2026-11-10', baseAmountMinor: 2560 });
    expect(e.shares.reduce((a: number, s: { shareMinor: number }) => a + s.shareMinor, 0)).toBe(100001);
    expect(e.shares.reduce((a: number, s: { baseShareMinor: number }) => a + s.baseShareMinor, 0)).toBe(2560);

    // Edit to percentage split
    const edited = await owner.put(`/trips/${tripId}/expenses/${e.id}`, {
      version: e.version,
      title: 'Essen (geändert)',
      amountMinor: 50000,
      currency: 'THB',
      date: '2026-11-10',
      category: 'food',
      paidByTravelerId: ids[1],
      splitMethod: 'percent',
      splits: [
        { travelerId: ids[0], value: 5000 },
        { travelerId: ids[1], value: 2500 },
        { travelerId: ids[2], value: 2500 },
      ],
      fxRate: '0.0256',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.expense.shares.map((s: { shareMinor: number }) => s.shareMinor)).toEqual([25000, 12500, 12500]);
    expect(edited.body.expense.version).toBe(2);

    // Stale edit is refused
    const stale = await owner.put(`/trips/${tripId}/expenses/${e.id}`, { ...edited.body.expense, version: 1, splits: [{ travelerId: ids[0] }], splitMethod: 'equal', fxRate: '0.0256' });
    expect(stale.status).toBe(409);
    const splitsCount = t.db.sqlite.prepare('SELECT COUNT(*) AS n FROM expense_splits WHERE expense_id = ?').get(e.id);
    expect(splitsCount).toEqual({ n: 3 });

    // Balances
    const bal = (await owner.get(`/trips/${tripId}/balances`)).body;
    expect(bal.balances.reduce((a: number, b: { balanceMinor: number }) => a + b.balanceMinor, 0)).toBe(0);

    // Delete
    expect((await owner.del(`/trips/${tripId}/expenses/${e.id}`)).status).toBe(200);
    expect(t.db.sqlite.prepare('SELECT COUNT(*) AS n FROM expense_splits').get()).toEqual({ n: 0 });
  });

  it('keeps historical rates when new rates are stored', async () => {
    const { tripId, ids } = await setup();
    await owner.post(`/trips/${tripId}/exchange-rates`, { currency: 'THB', rate: '0,025', effectiveDate: '2026-11-01' });
    const e = (
      await owner.post(`/trips/${tripId}/expenses`, {
        title: 'Taxi',
        amountMinor: 40000,
        currency: 'THB',
        date: '2026-11-08',
        paidByTravelerId: ids[0],
        splits: [{ travelerId: ids[0] }, { travelerId: ids[1] }],
        fxRate: '0.025',
        fxSource: 'cached',
        fxDate: '2026-11-01',
      })
    ).body.expense;
    expect(e.baseAmountMinor).toBe(1000);
    await owner.post(`/trips/${tripId}/exchange-rates`, { currency: 'THB', rate: '0.03', effectiveDate: '2026-11-12' });
    const s = await snapshot(tripId);
    expect(s.expenses[0]).toMatchObject({ baseAmountMinor: 1000, fxRate: '0.025', fxSource: 'cached' });
    expect(s.exchangeRates).toHaveLength(2);
  });

  it('records settlements separately and blocks removing involved travelers', async () => {
    const { tripId, ids } = await setup();
    await owner.post(`/trips/${tripId}/expenses`, {
      title: 'Boot',
      amountMinor: 8000,
      currency: 'EUR',
      date: '2026-11-13',
      paidByTravelerId: ids[0],
      splits: [{ travelerId: ids[0] }, { travelerId: ids[1] }],
    });
    const st = await owner.post(`/trips/${tripId}/settlements`, {
      fromTravelerId: ids[1],
      toTravelerId: ids[0],
      amountMinor: 4000,
      currency: 'EUR',
      date: '2026-11-14',
    });
    expect(st.status).toBe(201);
    const bal = (await owner.get(`/trips/${tripId}/balances`)).body;
    expect(bal.balances.every((b: { balanceMinor: number }) => b.balanceMinor === 0)).toBe(true);
    expect(bal.suggestions).toEqual([]);
    const s = await snapshot(tripId);
    expect(s.expenses).toHaveLength(1);
    expect(s.settlements).toHaveLength(1);
    const rm = await owner.del(`/trips/${tripId}/travelers/${ids[1]}`);
    expect(rm.status).toBe(409);
  });

  it('viewers cannot change money', async () => {
    const { tripId, ids } = await setup();
    const viewer = await inviteUser(t, owner, tripId, 'viewer', 'v@example.com');
    const r = await viewer.post(`/trips/${tripId}/expenses`, {
      title: 'X',
      amountMinor: 100,
      currency: 'EUR',
      date: '2026-11-13',
      paidByTravelerId: ids[0],
      splits: [{ travelerId: ids[0] }],
    });
    expect(r.status).toBe(403);
  });

  it('supports several payers per expense', async () => {
    const { tripId, ids } = await setup();
    const bad = await owner.post(`/trips/${tripId}/expenses`, {
      title: 'Abendessen', amountMinor: 10000, currency: 'EUR', date: '2026-11-12', category: 'food',
      paidByTravelerId: ids[0], payers: [{ travelerId: ids[0], amountMinor: 6000 }, { travelerId: ids[3], amountMinor: 3000 }],
      splits: ids.map((travelerId) => ({ travelerId })),
    });
    expect(bad.status).toBe(422);
    const ok = await owner.post(`/trips/${tripId}/expenses`, {
      title: 'Abendessen', amountMinor: 100000, currency: 'THB', date: '2026-11-12', category: 'food', fxRate: '0.0262',
      paidByTravelerId: ids[0], payers: [{ travelerId: ids[0], amountMinor: 60000 }, { travelerId: ids[3], amountMinor: 40000 }],
      splits: ids.map((travelerId) => ({ travelerId })),
    });
    expect(ok.status).toBe(201);
    const e = ok.body.expense;
    expect(e.payers).toHaveLength(2);
    expect(e.payers.reduce((a: number, p: { baseAmountMinor: number }) => a + p.baseAmountMinor, 0)).toBe(e.baseAmountMinor);
    const bal = (await owner.get(`/trips/${tripId}/balances`)).body.balances;
    expect(bal.reduce((a: number, b: { balanceMinor: number }) => a + b.balanceMinor, 0)).toBe(0);
    expect(bal.find((b: { travelerId: string }) => b.travelerId === ids[3]).paidMinor).toBe(e.payers[1].baseAmountMinor);
    // Edit back to a single payer
    const ed = await owner.put(`/trips/${tripId}/expenses/${e.id}`, {
      version: e.version, title: 'Abendessen', amountMinor: 100000, currency: 'THB', date: '2026-11-12', category: 'food', fxRate: '0.0262',
      paidByTravelerId: ids[3], splits: ids.map((travelerId) => ({ travelerId })),
    });
    expect(ed.status).toBe(200);
    expect(ed.body.expense.payers).toEqual([{ travelerId: ids[3], amountMinor: 100000, baseAmountMinor: 2620 }]);
    expect(ed.body.expense.paidByTravelerId).toBe(ids[3]);
  });

  it('links an existing expense to the booking it pays for – counted once, balances unchanged', async () => {
    const tripId = (await importThailand()).body.tripId;
    const s1 = await snapshot(tripId);
    const ferry = s1.bookings.find((b) => b.type === 'ferry' && !b.expenseId)!;
    const payer = s1.travelers[0];
    const exp = (
      await owner.post(`/trips/${tripId}/expenses`, {
        title: 'Fähre nach Krabi', amountMinor: 9000, currency: 'EUR', date: '2026-11-13', category: 'transportation',
        paidByTravelerId: payer.id, splitMethod: 'equal', splits: s1.travelers.map((x) => ({ travelerId: x.id })),
      })
    ).body.expense;
    const before = await snapshot(tripId);
    const r = await owner.post(`/trips/${tripId}/expenses/${exp.id}/link-booking`, { bookingId: ferry.id });
    expect(r.status).toBe(200);
    const after = await snapshot(tripId);
    const b = after.bookings.find((x) => x.id === ferry.id)!;
    expect(b).toMatchObject({ expenseId: exp.id, priceMinor: 9000, currency: 'EUR', costKind: 'actual', paymentStatus: 'paid', paidByTravelerId: payer.id, clarificationNote: null });
    expect(after.expenses).toHaveLength(before.expenses.length);
    expect(after.expenses.find((e) => e.id === exp.id)!.shares).toEqual(before.expenses.find((e) => e.id === exp.id)!.shares);
    // A second link is refused in both directions.
    expect((await owner.post(`/trips/${tripId}/expenses/${exp.id}/link-booking`, { bookingId: ferry.id })).status).toBe(409);
    const other = (
      await owner.post(`/trips/${tripId}/expenses`, {
        title: 'Noch eine Fähre', amountMinor: 100, currency: 'EUR', date: '2026-11-13', category: 'transportation',
        paidByTravelerId: payer.id, splitMethod: 'equal', splits: [{ travelerId: payer.id }],
      })
    ).body.expense;
    expect((await owner.post(`/trips/${tripId}/expenses/${other.id}/link-booking`, { bookingId: ferry.id })).status).toBe(409);
    expect((await snapshot(tripId)).bookings.find((x) => x.id === ferry.id)!.priceMinor).toBe(9000);
  });
});

