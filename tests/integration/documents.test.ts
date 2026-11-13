import { beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from '../../shared/finance';
import { matchDocument } from '../../shared/documents';
import { createTestEnv, setupOwner, type TestEnv } from '../helpers/app';

let t: TestEnv;
beforeEach(() => {
  t = createTestEnv();
});

/** Workers AI stand-in: returns the given JSON for any document. */
function mockAi(answer: Record<string, unknown>) {
  return {
    toMarkdown: async () => ({ id: '1', name: 'x', mimeType: 'application/pdf', format: 'markdown', tokens: 1, data: 'Rechnung Southern Lanta Resort Gesamt 469,00 EUR' }),
    run: async () => ({ response: JSON.stringify(answer) }),
  } as unknown as Ai;
}

const pdf = new TextEncoder().encode('%PDF-1.4 fake invoice');

async function setupTrip() {
  const owner = await setupOwner(t);
  const tripId = (await owner.post('/trips', { name: 'R', startDate: '2026-11-06', endDate: '2026-11-26', baseCurrency: 'EUR' })).body.trip.id;
  const me = (await owner.get(`/trips/${tripId}/snapshot`)).body.travelers[0];
  const other = (await owner.post(`/trips/${tripId}/travelers`, { name: 'Lilli' })).body.traveler;
  return { owner, tripId, me, other };
}

describe('documents (receipts)', () => {
  it('reads a hotel invoice, matches the existing booking and never creates expenses by itself', async () => {
    const { owner, tripId, me, other } = await setupTrip();
    const booking = (
      await owner.post(`/trips/${tripId}/bookings`, {
        title: 'Southern Lanta Resort', type: 'hotel', startDate: '2026-11-13', endDate: '2026-11-18', priceMinor: 46900, currency: 'EUR',
        bookingStatus: 'booked', paymentStatus: 'unknown', costKind: 'actual', travelerIds: [me.id, other.id],
      })
    ).body.booking;
    t.env.AI = mockAi({ kind: 'hotel', title: 'Southern Lanta Resort', reference: 'BK-778899', startDate: '2026-11-13', endDate: '2026-11-18', total: '469.00', currency: 'EUR', paymentStatus: 'paid' });

    const up = await owner.upload(`/trips/${tripId}/documents`, pdf, 'application/pdf', 'Rechnung Lanta.pdf');
    expect(up.status).toBe(201);
    expect(up.body.document).toMatchObject({ status: 'analyzed', bookingId: null, filename: 'Rechnung Lanta.pdf' });
    expect(up.body.document.extracted).toMatchObject({ kind: 'hotel', amountMinor: 46900, currency: 'EUR', paymentStatus: 'paid', reference: 'BK-778899' });

    let snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.expenses).toHaveLength(0); // import alone never books money
    expect(snap.documents).toHaveLength(1);
    expect(snap.documents[0].data).toBeUndefined(); // file not in the snapshot
    const m = matchDocument(snap.documents[0].extracted, snap.bookings, snap.expenses);
    expect(m).toMatchObject({ bookingId: booking.id, expenseId: null, confidence: 'high' });

    // The receipt proves payment: the app completes the booking (status + reference) …
    const patched = await owner.patch(`/trips/${tripId}/bookings/${booking.id}`, { paymentStatus: 'paid', reference: 'BK-778899', paidByTravelerId: me.id, version: booking.version });
    expect(patched.status).toBe(200);
    // … then "Zur Reisekasse hinzufügen" = existing booking → expense endpoint, and links the receipt
    const exp = await owner.post(`/trips/${tripId}/bookings/${booking.id}/expense`, { paidByTravelerId: me.id, participantIds: [me.id, other.id] });
    expect(exp.status).toBe(201);
    await owner.patch(`/trips/${tripId}/documents/${up.body.document.id}`, { bookingId: booking.id, expenseId: exp.body.expense.id });
    // Second attempt is refused – no duplicate expense
    expect((await owner.post(`/trips/${tripId}/bookings/${booking.id}/expense`, { paidByTravelerId: me.id, participantIds: [me.id, other.id] })).status).toBe(409);

    snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.expenses).toHaveLength(1);
    const before = computeBalances([me.id, other.id], snap.expenses, snap.settlements);

    // A second upload of the same invoice now matches the existing expense
    const again = await owner.upload(`/trips/${tripId}/documents`, pdf, 'application/pdf', 'Rechnung Lanta (2).pdf');
    snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(matchDocument(again.body.document.extracted, snap.bookings, snap.expenses)).toMatchObject({ bookingId: booking.id, expenseId: exp.body.expense.id });

    // Deleting receipts keeps booking, expense and balances untouched
    for (const d of snap.documents) expect((await owner.del(`/trips/${tripId}/documents/${d.id}`)).status).toBe(200);
    snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.documents).toHaveLength(0);
    expect(snap.bookings).toHaveLength(1);
    expect(snap.expenses).toHaveLength(1);
    expect(computeBalances([me.id, other.id], snap.expenses, snap.settlements)).toEqual(before);
  });

  it('serves the stored file and keeps documents when the linked expense is deleted', async () => {
    const { owner, tripId, me } = await setupTrip();
    const expense = (
      await owner.post(`/trips/${tripId}/expenses`, { title: 'Taxi', amountMinor: 1000, currency: 'EUR', date: '2026-11-10', category: 'transportation', paidByTravelerId: me.id, splitMethod: 'equal', splits: [{ travelerId: me.id }] })
    ).body.expense;
    const up = await owner.upload(`/trips/${tripId}/documents?expenseId=${expense.id}`, pdf, 'application/pdf', 'taxi.pdf');
    expect(up.body.document).toMatchObject({ expenseId: expense.id, status: 'uploaded' }); // no AI configured
    const file = await owner.get(`/trips/${tripId}/documents/${up.body.document.id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    await owner.del(`/trips/${tripId}/expenses/${expense.id}?version=${expense.version}`);
    const snap = (await owner.get(`/trips/${tripId}/snapshot`)).body;
    expect(snap.documents[0]).toMatchObject({ id: up.body.document.id, expenseId: null });
  });

  it('rejects unsupported and oversized files', async () => {
    const { owner, tripId } = await setupTrip();
    expect((await owner.upload(`/trips/${tripId}/documents`, pdf, 'text/html', 'x.html')).status).toBe(422);
    expect((await owner.upload(`/trips/${tripId}/documents`, new Uint8Array(2_000_000), 'application/pdf', 'big.pdf')).status).toBe(413);
  });
});
