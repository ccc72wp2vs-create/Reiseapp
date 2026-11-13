/**
 * Trip-scoped resources: activities, places, bookings, wallet, packing, sync.
 */
import { z } from 'zod';
import { Hono } from 'hono';
import {
  activityCreateSchema,
  activityReorderSchema,
  activityUpdateSchema,
  bookingCreateSchema,
  bookingToExpenseSchema,
  bookingUpdateSchema,
  depositCreateSchema,
  depositResolveSchema,
  depositUpdateSchema,
  jointPaymentSchema,
  exchangeRateCreateSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  packingItemCreateSchema,
  packingItemUpdateSchema,
  packingListCreateSchema,
  packingListUpdateSchema,
  placeCreateSchema,
  placeUpdateSchema,
  settlementCreateSchema,
  syncRequestSchema,
  assistantPreferencesSchema,
  assistantRequestSchema,
  googleDistanceSchema,
  googleNearbySchema,
  googleUiLoadsSchema,
} from '../../shared/schemas';
import { computeBalances, suggestSettlements } from '../../shared/finance';
import type { ExpenseCategory } from '../../shared/constants';
import type { ActivityDto, BookingDto } from '../../shared/types';
import {
  activitySpec,
  bookingSpec,
  placeSpec,
  deleteEntity,
  getEntity,
  insertEntity,
  unwrapUpdate,
  updateEntity,
  type DeleteResult,
  type UpdateResult,
} from '../db/entity';
import { ApiError } from '../lib/errors';
import { currentUser, loadTripAccess, parseJson, requireRole } from '../middleware/core';
import * as packing from '../services/packing';
import * as plan from '../services/plan';
import { processSyncOps } from '../services/sync';
import { setVote } from '../services/votes';
import * as deposits from '../services/deposits';
import * as docs from '../services/documents';
import { attachTravelersOne, setBookingTravelers } from '../services/bookings';
import { audit } from '../services/trips';
import * as wallet from '../services/wallet';
import * as assistant from '../services/assistant';
import * as google from '../services/google';
import * as geoapify from '../services/geoapify';
import * as maps from '../services/maps';
import { buildSnapshot } from '../services/trips';
import type { AppContext, AppEnv } from '../types';
import { versionQuery } from './trips';

const r = new Hono<AppEnv>();
r.use('/:tripId/*', loadTripAccess);

function deleted<T>(res: DeleteResult<T>, label: string) {
  if (res.status === 'not_found') throw new ApiError('not_found', `${label} nicht gefunden`);
  if (res.status === 'conflict') {
    throw new ApiError('version_conflict', `${label} wurde inzwischen geändert.`, { current: res.entity });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

r.post('/:tripId/activities', async (c) => {
  requireRole(c, 'editor');
  const input = await parseJson(c, activityCreateSchema);
  const activity = await plan.createActivity(c.env.DB, c.get('trip').tripId, currentUser(c).id, input);
  return c.json({ activity }, 201);
});

r.patch('/:tripId/activities/:id', async (c) => {
  requireRole(c, 'editor');
  const { version, ...patch } = await parseJson(c, activityUpdateSchema);
  const res = await plan.updateActivity(c.env.DB, c.get('trip').tripId, currentUser(c).id, c.req.param('id'), version, patch);
  return c.json({ activity: unwrapUpdate(res, 'Aktivität') });
});

r.delete('/:tripId/activities/:id', async (c) => {
  requireRole(c, 'editor');
  return c.json(deleted(await plan.deleteActivity(c.env.DB, c.get('trip').tripId, c.req.param('id'), versionQuery(c)), 'Aktivität'));
});

r.post('/:tripId/activities/reorder', async (c) => {
  requireRole(c, 'editor');
  await plan.reorderActivities(c.env.DB, c.get('trip').tripId, await parseJson(c, activityReorderSchema));
  return c.json({ ok: true });
});

r.post('/:tripId/activities/:id/duplicate', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const src = await getEntity<ActivityDto>(c.env.DB, activitySpec, t.tripId, c.req.param('id'));
  if (!src) throw new ApiError('not_found', 'Aktivität nicht gefunden');
  const { id: _id, version: _v, createdAt: _c, updatedAt: _u, tripId: _t, sortOrder: _s, createdBy: _cb, updatedBy: _ub, ...rest } = src;
  const activity = await plan.createActivity(c.env.DB, t.tripId, currentUser(c).id, { ...rest, completed: false });
  return c.json({ activity }, 201);
});

// ---------------------------------------------------------------------------
// Saved places
// ---------------------------------------------------------------------------

r.post('/:tripId/places', async (c) => {
  requireRole(c, 'editor');
  const place = await plan.createPlace(c.env.DB, c.get('trip').tripId, currentUser(c).id, await parseJson(c, placeCreateSchema));
  return c.json({ place }, 201);
});

r.patch('/:tripId/places/:id', async (c) => {
  requireRole(c, 'editor');
  const { version, ...patch } = await parseJson(c, placeUpdateSchema);
  const res = await plan.updatePlace(c.env.DB, c.get('trip').tripId, c.req.param('id'), version, patch);
  return c.json({ place: unwrapUpdate(res, 'Ort') });
});

/** 👍 vote – any member (also viewers) may vote with their own traveler. */
r.put('/:tripId/places/:id/vote', async (c) => {
  const { vote } = await parseJson(c, z.object({ vote: z.boolean() }));
  const votes = await setVote(c.env.DB, c.get('trip').tripId, currentUser(c).id, c.req.param('id'), vote);
  return c.json({ votes });
});

r.delete('/:tripId/places/:id', async (c) => {
  requireRole(c, 'editor');
  return c.json(deleted(await plan.deletePlace(c.env.DB, c.get('trip').tripId, c.req.param('id'), versionQuery(c)), 'Ort'));
});

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

function checkBookingDates(b: { startDate?: string | null; endDate?: string | null; startTime?: string | null; endTime?: string | null }) {
  if (b.startDate && b.endDate && b.endDate < b.startDate) {
    throw new ApiError('validation_failed', 'Ende liegt vor dem Beginn', [{ path: 'endDate' }]);
  }
}

r.post('/:tripId/bookings', async (c) => {
  requireRole(c, 'editor');
  const tripId = c.get('trip').tripId;
  const { travelerIds, ...input } = await parseJson(c, bookingCreateSchema);
  checkBookingDates(input);
  const booking = await insertEntity<BookingDto>(c.env.DB, bookingSpec, tripId, input, { created_by: currentUser(c).id });
  if (travelerIds?.length) await setBookingTravelers(c.env.DB, tripId, booking.id, travelerIds);
  return c.json({ booking: await attachTravelersOne(c.env.DB, tripId, booking) }, 201);
});

r.patch('/:tripId/bookings/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const { version, travelerIds, ...patch } = await parseJson(c, bookingUpdateSchema);
  const cur = await getEntity<BookingDto>(c.env.DB, bookingSpec, t.tripId, c.req.param('id'));
  if (!cur) throw new ApiError('not_found', 'Buchung nicht gefunden');
  const merged = { ...cur, ...patch };
  checkBookingDates(merged);
  if ((merged.priceMinor != null || merged.unitPriceMinor != null) && !merged.currency) {
    throw new ApiError('validation_failed', 'Währung fehlt', [{ path: 'currency' }]);
  }
  const res: UpdateResult<BookingDto> = await updateEntity(c.env.DB, bookingSpec, t.tripId, cur.id, version, patch);
  const booking = unwrapUpdate(res, 'Buchung');
  if (travelerIds) await setBookingTravelers(c.env.DB, t.tripId, booking.id, travelerIds);
  return c.json({ booking: await attachTravelersOne(c.env.DB, t.tripId, booking) });
});

r.delete('/:tripId/bookings/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const res = deleted(await deleteEntity(c.env.DB, bookingSpec, t.tripId, c.req.param('id'), versionQuery(c)), 'Buchung');
  await audit(c.env.DB, { tripId: t.tripId, userId: currentUser(c).id, entity: 'booking', entityId: c.req.param('id'), action: 'delete' });
  return c.json(res);
});

const BOOKING_TO_EXPENSE_CATEGORY: Record<BookingDto['type'], ExpenseCategory> = {
  flight: 'transportation',
  ferry: 'transportation',
  train: 'transportation',
  bus: 'transportation',
  car: 'transportation',
  hotel: 'accommodation',
  activity: 'activities',
  other: 'other',
};

/**
 * Transfers a booking's actual, paid price into the group wallet exactly
 * once. Estimates/budget caps and unpaid bookings are refused so that planned
 * amounts never appear as spent money.
 */
r.post('/:tripId/bookings/:id/expense', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const input = await parseJson(c, bookingToExpenseSchema);
  const b = await getEntity<BookingDto>(c.env.DB, bookingSpec, t.tripId, c.req.param('id'));
  if (!b) throw new ApiError('not_found', 'Buchung nicht gefunden');
  if (b.expenseId) throw new ApiError('conflict', 'Diese Buchung ist bereits in der Reisekasse erfasst');
  if (b.priceMinor == null || !b.currency) throw new ApiError('validation_failed', 'Die Buchung hat keinen Preis');
  if (b.costKind !== 'actual') {
    throw new ApiError('validation_failed', 'Schätzungen und Budgetgrenzen können nicht als Ausgabe erfasst werden');
  }
  if (b.bookingStatus === 'cancelled') throw new ApiError('validation_failed', 'Stornierte Buchungen können nicht erfasst werden');
  if (b.paymentStatus !== 'paid') {
    throw new ApiError('validation_failed', 'Bitte die Buchung zuerst als „bezahlt“ markieren');
  }
  const expense = await wallet.createExpense(
    c.env.DB,
    t.tripId,
    t.baseCurrency,
    currentUser(c).id,
    {
      title: b.title,
      amountMinor: b.priceMinor,
      currency: b.currency,
      date: input.date ?? b.startDate ?? new Date().toISOString().slice(0, 10),
      category: BOOKING_TO_EXPENSE_CATEGORY[b.type],
      paidByTravelerId: input.paidByTravelerId,
      splitMethod: 'equal',
      splits: input.participantIds.map((travelerId) => ({ travelerId })),
      fxRate: input.fxRate,
      fxSource: 'manual',
      notes: 'Aus Buchung übernommen',
    },
    b.id,
  );
  return c.json({ expense }, 201);
});

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

r.post('/:tripId/expenses', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const expense = await wallet.createExpense(c.env.DB, t.tripId, t.baseCurrency, currentUser(c).id, await parseJson(c, expenseCreateSchema));
  await audit(c.env.DB, { tripId: t.tripId, userId: currentUser(c).id, entity: 'expense', entityId: expense.id, action: 'create' });
  return c.json({ expense }, 201);
});

r.put('/:tripId/expenses/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const { version, ...input } = await parseJson(c, expenseUpdateSchema);
  const expense = await wallet.updateExpense(c.env.DB, t.tripId, t.baseCurrency, c.req.param('id'), version, input);
  await audit(c.env.DB, { tripId: t.tripId, userId: currentUser(c).id, entity: 'expense', entityId: expense.id, action: 'update' });
  return c.json({ expense });
});

r.delete('/:tripId/expenses/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const e = await wallet.deleteExpense(c.env.DB, t.tripId, c.req.param('id'), versionQuery(c));
  await audit(c.env.DB, {
    tripId: t.tripId,
    userId: currentUser(c).id,
    entity: 'expense',
    entityId: e.id,
    action: 'delete',
    summary: `${e.title}: ${e.amountMinor} ${e.currency}`,
  });
  return c.json({ ok: true });
});

r.post('/:tripId/settlements', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const settlement = await wallet.createSettlement(c.env.DB, t.tripId, t.baseCurrency, currentUser(c).id, await parseJson(c, settlementCreateSchema));
  await audit(c.env.DB, { tripId: t.tripId, userId: currentUser(c).id, entity: 'settlement', entityId: settlement.id, action: 'create' });
  return c.json({ settlement }, 201);
});

// ---------------------------------------------------------------------------
// Deposits (Kautionen)
// ---------------------------------------------------------------------------

r.post('/:tripId/deposits', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const deposit = await deposits.createDeposit(c.env.DB, t.tripId, t.baseCurrency, currentUser(c).id, await parseJson(c, depositCreateSchema));
  await audit(c.env.DB, { tripId: t.tripId, userId: currentUser(c).id, entity: 'deposit', entityId: deposit.id, action: 'create' });
  return c.json({ deposit }, 201);
});

// ---------------------------------------------------------------------------
// Documents (receipts / confirmations)
// ---------------------------------------------------------------------------

/**
 * Analyse a receipt / confirmation – in memory only. Returns the recognised
 * fields; the file is not stored. Saving happens via the normal booking /
 * expense endpoints after the user confirmed the data.
 */
r.post('/:tripId/documents/analyze', async (c) => {
  requireRole(c, 'editor');
  const mime = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const name = decodeURIComponent(c.req.header('x-filename') ?? 'Beleg');
  const extracted = await docs.analyzeOnly(c.env.AI, { name, mime, bytes: new Uint8Array(await c.req.arrayBuffer()) });
  return c.json({ extracted });
});

// ---------------------------------------------------------------------------
// "Frag TRAVIO" – answers from the trip's own data; proposals are executed
// by the client through the regular endpoints above after confirmation.
// Nothing of the conversation is stored.
// ---------------------------------------------------------------------------

r.post('/:tripId/assistant', async (c) => {
  const t = c.get('trip');
  const user = currentUser(c);
  const request = await parseJson(c, assistantRequestSchema);
  const snap = await buildSnapshot(c.env.DB, t.tripId, t.role, user.id);
  if (!snap) throw new ApiError('not_found', 'Reise nicht gefunden');
  return c.json(await assistant.askAssistant(c.env, { snap, userId: user.id, role: t.role, request }));
});

r.get('/:tripId/assistant/preferences', async (c) => {
  return c.json({ preferences: await assistant.getPreferences(c.env.DB, currentUser(c).id) });
});

r.put('/:tripId/assistant/preferences', async (c) => {
  const prefs = await parseJson(c, assistantPreferencesSchema);
  return c.json({ preferences: await assistant.setPreferences(c.env.DB, currentUser(c).id, prefs) });
});

// ---------------------------------------------------------------------------
// Google Maps Platform – live data, nothing of it is stored (only place IDs
// the user explicitly saves via the normal place/activity endpoints).
// ---------------------------------------------------------------------------

async function originFor(c: AppContext, location: { lat: number; lng: number } | null | undefined) {
  if (location) return { ...location, label: 'deinem Standort' };
  const t = c.get('trip');
  const snap = await buildSnapshot(c.env.DB, t.tripId, t.role, currentUser(c).id);
  if (!snap) throw new ApiError('not_found', 'Reise nicht gefunden');
  return maps.travelOrigin(snap, null);
}

r.get('/:tripId/maps/config', async (c) => {
  const g = google.googleConfig(c.env);
  const provider = maps.provider(c.env);
  c.header('Cache-Control', 'no-store');
  return c.json({
    enabled: !!provider,
    provider,
    // Browser key only needed (and only sent) for Google's Places UI Kit.
    browserKey: provider === 'google' ? g.browserKey : null,
    routing: !!provider,
  });
});

r.get('/:tripId/maps/usage', async (c) => {
  requireRole(c, 'owner');
  return c.json({
    provider: maps.provider(c.env),
    geoapify: { day: geoapify.day(), used: await geoapify.creditsUsedToday(c.env.DB), limit: geoapify.geoapifyConfig(c.env).dailyCredits },
    google: { month: google.month(), usage: await google.usage(c.env.DB, c.env) },
  });
});

r.post('/:tripId/maps/nearby', async (c) => {
  const input = await parseJson(c, googleNearbySchema);
  const origin = await originFor(c, input.location);
  c.header('Cache-Control', 'no-store');
  return c.json(
    await maps.nearby(c.env, { category: input.category ?? null, query: input.query ?? null, origin, mode: input.mode, maxMinutes: input.maxMinutes ?? null, limit: input.limit }),
  );
});

r.post('/:tripId/maps/distance', async (c) => {
  const input = await parseJson(c, googleDistanceSchema);
  const origin = await originFor(c, input.location);
  let to: { lat: number; lng: number } | { placeId: string };
  if (input.googlePlaceId) to = { placeId: input.googlePlaceId };
  else {
    const place = input.placeId ? await getEntity<{ lat: number | null; lng: number | null; googlePlaceId?: string | null }>(c.env.DB, placeSpec, c.get('trip').tripId, input.placeId) : null;
    if (!place) throw new ApiError('not_found', 'Ort nicht gefunden');
    if (place.lat != null && place.lng != null) to = { lat: place.lat, lng: place.lng };
    else if (place.googlePlaceId) to = { placeId: place.googlePlaceId };
    else throw new ApiError('validation_failed', 'Für diesen Ort sind keine Koordinaten hinterlegt.');
  }
  const res = await maps.distance(c.env, origin, to, input.mode);
  c.header('Cache-Control', 'no-store');
  return c.json({ origin, mode: input.mode, provider: maps.provider(c.env), ...(res === 'no_route' ? { noRoute: true } : { noRoute: false, ...res }) });
});

/** The browser asks before rendering Places UI Kit elements (internal monthly limit). */
r.post('/:tripId/google/ui-loads', async (c) => {
  const { count } = await parseJson(c, googleUiLoadsSchema);
  const cfg = google.googleConfig(c.env);
  if (!cfg.browserKey) throw new ApiError('service_unavailable', 'Google Maps ist noch nicht eingerichtet.');
  const ok = await google.reserve(c.env.DB, google.SKU.uiKit, count, cfg.limits[google.SKU.uiKit]);
  if (!ok) throw new ApiError('rate_limited', 'Das Monatslimit für Google-Ortsinfos ist erreicht.');
  return c.json({ ok: true });
});

/** Finds the Google place for a saved TRAVIO place (own name + coordinates) – returns only an ID. */
r.post('/:tripId/google/match/:placeId', async (c) => {
  requireRole(c, 'editor');
  const place = await getEntity<{ name: string; lat: number | null; lng: number | null }>(c.env.DB, placeSpec, c.get('trip').tripId, c.req.param('placeId'));
  if (!place) throw new ApiError('not_found', 'Ort nicht gefunden');
  if (place.lat == null || place.lng == null) throw new ApiError('validation_failed', 'Für diesen Ort sind keine Koordinaten hinterlegt.');
  const ids = await google.searchPlaceIds(c.env, { query: place.name, type: null, center: { lat: place.lat, lng: place.lng }, radiusM: 2000, max: 1 });
  return c.json({ googlePlaceId: ids[0] ?? null });
});

/** Links an existing expense to the booking it pays for (prevents double counting). */
r.post('/:tripId/expenses/:id/link-booking', async (c) => {
  requireRole(c, 'editor');
  const { bookingId } = await parseJson(c, z.object({ bookingId: z.string().uuid() }));
  const expense = await wallet.linkExpenseToBooking(c.env.DB, c.get('trip').tripId, c.req.param('id'), bookingId);
  return c.json({ expense });
});

/* Documents stored by an earlier app version: view, re-link or delete only. */
r.get('/:tripId/documents/:id/file', async (c) => {
  const f = await docs.getDocumentFile(c.env.DB, c.get('trip').tripId, c.req.param('id'));
  return new Response(f.bytes, {
    headers: {
      'Content-Type': f.mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

r.patch('/:tripId/documents/:id', async (c) => {
  requireRole(c, 'editor');
  const links = await parseJson(c, z.object({ bookingId: z.string().uuid().nullable().optional(), expenseId: z.string().uuid().nullable().optional() }));
  return c.json({ document: await docs.linkDocument(c.env.DB, c.get('trip').tripId, c.req.param('id'), links) });
});

r.delete('/:tripId/documents/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  await docs.deleteDocument(c.env.DB, t.tripId, c.req.param('id'));
  await audit(c.env.DB, { tripId: t.tripId, userId: currentUser(c).id, entity: 'document', entityId: c.req.param('id'), action: 'delete' });
  return c.json({ ok: true });
});

/** Rent + deposit paid together on the spot (several contributors). */
r.post('/:tripId/joint-payments', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const result = await deposits.createJointPayment(c.env.DB, t.tripId, t.baseCurrency, currentUser(c).id, await parseJson(c, jointPaymentSchema));
  await audit(c.env.DB, { tripId: t.tripId, userId: currentUser(c).id, entity: 'joint_payment', entityId: result.expense?.id ?? result.deposit!.id, action: 'create' });
  return c.json(result, 201);
});

r.put('/:tripId/deposits/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const { version, ...input } = await parseJson(c, depositUpdateSchema);
  const deposit = await deposits.updateDeposit(c.env.DB, t.tripId, t.baseCurrency, c.req.param('id'), version, input);
  return c.json({ deposit });
});

r.post('/:tripId/deposits/:id/resolve', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const deposit = await deposits.resolveDeposit(c.env.DB, t.tripId, t.baseCurrency, currentUser(c).id, c.req.param('id'), await parseJson(c, depositResolveSchema));
  await audit(c.env.DB, { tripId: t.tripId, userId: currentUser(c).id, entity: 'deposit', entityId: deposit.id, action: 'update', summary: deposit.status });
  return c.json({ deposit });
});

r.post('/:tripId/deposits/:id/reopen', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const { version } = await parseJson(c, z.object({ version: z.number().int().min(1) }));
  return c.json({ deposit: await deposits.reopenDeposit(c.env.DB, t.tripId, c.req.param('id'), version) });
});

r.delete('/:tripId/deposits/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  await deposits.deleteDeposit(c.env.DB, t.tripId, c.req.param('id'));
  await audit(c.env.DB, { tripId: t.tripId, userId: currentUser(c).id, entity: 'deposit', entityId: c.req.param('id'), action: 'delete' });
  return c.json({ ok: true });
});

r.delete('/:tripId/settlements/:id', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  await wallet.deleteSettlement(c.env.DB, t.tripId, c.req.param('id'));
  await audit(c.env.DB, { tripId: t.tripId, userId: currentUser(c).id, entity: 'settlement', entityId: c.req.param('id'), action: 'delete' });
  return c.json({ ok: true });
});

r.get('/:tripId/balances', async (c) => {
  const t = c.get('trip');
  const [expenses, settlements, travelers] = await Promise.all([
    wallet.listExpenses(c.env.DB, t.tripId),
    wallet.listSettlements(c.env.DB, t.tripId),
    c.env.DB.prepare('SELECT id FROM travelers WHERE trip_id = ? ORDER BY sort_order').bind(t.tripId).all<{ id: string }>(),
  ]);
  const balances = computeBalances(
    travelers.results.map((x) => x.id),
    expenses.map((e) => ({ payers: e.payers, baseAmountMinor: e.baseAmountMinor, shares: e.shares })),
    settlements.map((s) => ({ fromTravelerId: s.fromTravelerId, toTravelerId: s.toTravelerId, baseAmountMinor: s.baseAmountMinor })),
  );
  return c.json({ baseCurrency: t.baseCurrency, balances, suggestions: suggestSettlements(balances) });
});

r.post('/:tripId/exchange-rates', async (c) => {
  requireRole(c, 'editor');
  const t = c.get('trip');
  const rate = await wallet.createExchangeRate(c.env.DB, t.tripId, t.baseCurrency, currentUser(c).id, await parseJson(c, exchangeRateCreateSchema));
  return c.json({ exchangeRate: rate }, 201);
});

r.delete('/:tripId/exchange-rates/:id', async (c) => {
  requireRole(c, 'editor');
  await wallet.deleteExchangeRate(c.env.DB, c.get('trip').tripId, c.req.param('id'));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

function packingResult<T>(res: packing.PackingWrite<T>, label: string): T {
  if (res.status === 'not_found') throw new ApiError('not_found', `${label} nicht gefunden`);
  if (res.status === 'conflict') throw new ApiError('version_conflict', `${label} wurde inzwischen geändert.`, { current: res.entity });
  return res.entity;
}

r.post('/:tripId/packing/lists', async (c) => {
  const t = c.get('trip');
  const out = await packing.createList(c.env.DB, t.tripId, currentUser(c).id, t.role, await parseJson(c, packingListCreateSchema));
  return c.json(out, 201);
});

r.patch('/:tripId/packing/lists/:id', async (c) => {
  const t = c.get('trip');
  const { version, ...patch } = await parseJson(c, packingListUpdateSchema);
  const res = await packing.updateList(c.env.DB, t.tripId, currentUser(c).id, t.role, c.req.param('id'), version, patch);
  return c.json({ list: packingResult(res, 'Packliste') });
});

r.delete('/:tripId/packing/lists/:id', async (c) => {
  const t = c.get('trip');
  packingResult(await packing.deleteList(c.env.DB, t.tripId, currentUser(c).id, t.role, c.req.param('id'), versionQuery(c)), 'Packliste');
  return c.json({ ok: true });
});

r.post('/:tripId/packing/items', async (c) => {
  const t = c.get('trip');
  const item = await packing.createItem(c.env.DB, t.tripId, currentUser(c).id, t.role, await parseJson(c, packingItemCreateSchema));
  return c.json({ item }, 201);
});

r.patch('/:tripId/packing/items/:id', async (c) => {
  const t = c.get('trip');
  const { version, ...patch } = await parseJson(c, packingItemUpdateSchema);
  const res = await packing.updateItem(c.env.DB, t.tripId, currentUser(c).id, t.role, c.req.param('id'), version, patch);
  return c.json({ item: packingResult(res, 'Eintrag') });
});

r.delete('/:tripId/packing/items/:id', async (c) => {
  const t = c.get('trip');
  packingResult(await packing.deleteItem(c.env.DB, t.tripId, currentUser(c).id, t.role, c.req.param('id'), versionQuery(c)), 'Eintrag');
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Offline sync
// ---------------------------------------------------------------------------

r.post('/:tripId/sync', async (c) => {
  const t = c.get('trip');
  const { ops } = await parseJson(c, syncRequestSchema);
  const results = await processSyncOps({ db: c.env.DB, tripId: t.tripId, userId: currentUser(c).id, role: t.role }, ops);
  return c.json({ results });
});

export default r;
