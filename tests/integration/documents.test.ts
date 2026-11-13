import { beforeEach, describe, expect, it } from 'vitest';
import { matchDocument } from '../../shared/documents';
import { computeBalances } from '../../shared/finance';
import { createTestEnv, inviteUser, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

/** Workers AI stand-in that records what it was asked. */
function mockAi(answer: Record<string, unknown> | Error) {
  const calls: string[] = [];
  const ai = {
    toMarkdown: async () => {
      calls.push('toMarkdown');
      return { id: '1', name: 'x', mimeType: 'application/pdf', format: 'markdown', tokens: 1, data: 'Rechnung Southern Lanta Resort Gesamt 469,00 EUR' };
    },
    run: async (model: string, input: { messages: { content: unknown }[] }) => {
      calls.push(`${model}:${Array.isArray(input.messages[1].content) ? 'image' : 'text'}`);
      if (answer instanceof Error) throw answer;
      return { response: JSON.stringify(answer) };
    },
  };
  return { ai: ai as unknown as Ai, calls };
}

const pdf = new TextEncoder().encode('%PDF-1.4 fake invoice');
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

const stored = () => (t.db.sqlite.prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number }).n;
const counts = () =>
  t.db.sqlite.prepare('SELECT (SELECT COUNT(*) FROM bookings) b, (SELECT COUNT(*) FROM expenses) e, (SELECT COUNT(*) FROM settlements) s').get();

async function setupTrip() {
  const owner = await setupOwner(t);
  const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
  const me = (await owner.get(`/trips/${tripId}/snapshot`)).body.travelers[0];
  const other = (await owner.post(`/trips/${tripId}/travelers`, { name: 'Lilli' })).body.traveler;
  return { owner, tripId, me, other };
}

const HOTEL = { kind: 'hotel', title: 'Southern Lanta Resort', reference: 'BK-778899', startDate: '2026-11-13', endDate: '2026-11-18', startTime: '14:00', total: '469.00', currency: 'EUR', paymentStatus: 'paid', deadlines: 'Kostenlose Stornierung bis 10.11.2026', location: '105 Moo 3, Klong Dao' };

describe('document import – analysis only, nothing stored', () => {
  it('reads a PDF in memory and returns structured data without storing anything', async () => {
    const { owner, tripId } = await setupTrip();
    const { ai, calls } = mockAi(HOTEL);
    t.env.AI = ai;
    const before = counts();
    const r = await owner.upload(`/trips/${tripId}/documents/analyze`, pdf, 'application/pdf', 'Rechnung.pdf');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.body.extracted).toMatchObject({ kind: 'hotel', amountMinor: 46900, currency: 'EUR', paymentStatus: 'paid', reference: 'BK-778899', startTime: '14:00', deadlines: 'Kostenlose Stornierung bis 10.11.2026' });
    expect(calls).toEqual(['toMarkdown', '@cf/meta/llama-3.3-70b-instruct-fp8-fast:text']);
    expect(stored()).toBe(0);
    expect(counts()).toEqual(before);
  });

  it('reads photos and screenshots with the vision model', async () => {
    const { owner, tripId } = await setupTrip();
    const { ai, calls } = mockAi({ kind: 'flight', title: 'Flug Krabi → Chiang Mai', flightNumber: 'fd 3152', startDate: '2026-11-21', startTime: '9:05', fromLocation: 'KBV Krabi', toLocation: 'CNX Chiang Mai', paymentStatus: 'unknown' });
    t.env.AI = ai;
    for (const mime of ['image/jpeg', 'image/png']) {
      const r = await owner.upload(`/trips/${tripId}/documents/analyze`, png, mime, 'screenshot');
      expect(r.status).toBe(200);
      expect(r.body.extracted).toMatchObject({ kind: 'flight', flightNumber: 'FD 3152', startTime: '09:05', fromLocation: 'KBV Krabi' });
    }
    expect(calls.every((c) => c.endsWith(':image'))).toBe(true);
    expect(stored()).toBe(0);
  });

  it('leaves nothing behind when the analysis fails or no AI is available', async () => {
    const { owner, tripId } = await setupTrip();
    t.env.AI = mockAi(new Error('model unavailable')).ai;
    const failed = await owner.upload(`/trips/${tripId}/documents/analyze`, png, 'image/jpeg', 'x.jpg');
    expect(failed.status).toBe(200);
    expect(failed.body.extracted).toBeNull();
    t.env.AI = undefined;
    expect((await owner.upload(`/trips/${tripId}/documents/analyze`, pdf, 'application/pdf', 'x.pdf')).body.extracted).toBeNull();
    expect(stored()).toBe(0);
  });

  it('rejects unsupported, oversized and unauthorised uploads', async () => {
    const { owner, tripId } = await setupTrip();
    expect((await owner.upload(`/trips/${tripId}/documents/analyze`, pdf, 'text/html', 'x.html')).status).toBe(422);
    expect((await owner.upload(`/trips/${tripId}/documents/analyze`, new Uint8Array(2_000_000), 'application/pdf', 'big.pdf')).status).toBe(413);
    const viewer = await inviteUser(t, owner, tripId, 'viewer', 'v@example.com', 'Vera');
    expect((await viewer.upload(`/trips/${tripId}/documents/analyze`, pdf, 'application/pdf', 'x.pdf')).status).toBe(403);
    expect(stored()).toBe(0);
  });

  it('confirmed data completes the matching booking and reaches the wallet once – balances stay consistent', async () => {
    const { owner, tripId, me, other } = await setupTrip();
    const booking = (
      await owner.post(`/trips/${tripId}/bookings`, {
        title: 'Southern Lanta Resort', type: 'hotel', startDate: '2026-11-13', endDate: '2026-11-18', priceMinor: 46900, currency: 'EUR',
        bookingStatus: 'booked', paymentStatus: 'unknown', costKind: 'actual', travelerIds: [me.id, other.id],
      })
    ).body.booking;
    t.env.AI = mockAi(HOTEL).ai;
    const { extracted } = (await owner.upload(`/trips/${tripId}/documents/analyze`, pdf, 'application/pdf', 'Rechnung.pdf')).body;
    let snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(matchDocument(extracted, snap.bookings, snap.expenses)).toMatchObject({ bookingId: booking.id, expenseId: null, confidence: 'high' });

    // What the app does after "Speichern": complete empty fields, then the existing booking → expense step
    const patched = await owner.patch(`/trips/${tripId}/bookings/${booking.id}`, { reference: 'BK-778899', startTime: '14:00', paymentStatus: 'paid', paidByTravelerId: me.id, version: booking.version });
    expect(patched.status).toBe(200);
    expect((await owner.post(`/trips/${tripId}/bookings/${booking.id}/expense`, { paidByTravelerId: me.id, participantIds: [me.id, other.id] })).status).toBe(201);
    // Importing the same document again finds the existing expense; adding it twice is refused
    snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(matchDocument(extracted, snap.bookings, snap.expenses)).toMatchObject({ bookingId: booking.id, expenseId: snap.expenses[0].id });
    expect((await owner.post(`/trips/${tripId}/bookings/${booking.id}/expense`, { paidByTravelerId: me.id, participantIds: [me.id, other.id] })).status).toBe(409);

    const bal = Object.fromEntries(computeBalances([me.id, other.id], snap.expenses, snap.settlements).map((b) => [b.travelerId, b.balanceMinor]));
    expect(bal).toEqual({ [me.id]: 23450, [other.id]: -23450 });
    expect(snap.bookings).toHaveLength(1);
    expect(snap.expenses).toHaveLength(1);
    expect(stored()).toBe(0);
  });

  it('keeps documents stored by an earlier version (readable, deletable, never touching bookings)', async () => {
    const { owner, tripId, me } = await setupTrip();
    const exp = (
      await owner.post(`/trips/${tripId}/expenses`, { title: 'Taxi', amountMinor: 1000, currency: 'EUR', date: '2026-11-10', category: 'transportation', paidByTravelerId: me.id, splitMethod: 'equal', splits: [{ travelerId: me.id }] })
    ).body.expense;
    t.db.sqlite
      .prepare("INSERT INTO documents (id, trip_id, filename, mime, size, data, expense_id, status, created_at, updated_at) VALUES ('11111111-1111-4111-8111-111111111111', ?, 'alt.pdf', 'application/pdf', 3, ?, ?, 'uploaded', '2026-11-01', '2026-11-01')")
      .run(tripId, new Uint8Array([1, 2, 3]), exp.id);
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.documents).toHaveLength(1);
    expect(snap.documents[0].data).toBeUndefined();
    expect((await owner.get(`/trips/${tripId}/documents/11111111-1111-4111-8111-111111111111/file`)).status).toBe(200);
    expect((await owner.del(`/trips/${tripId}/documents/11111111-1111-4111-8111-111111111111`)).status).toBe(200);
    expect((await owner.get(`/trips/${tripId}/snapshot`)).body.expenses).toHaveLength(1);
  });
});
