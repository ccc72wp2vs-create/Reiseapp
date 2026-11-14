/**
 * Group wallet persistence: expenses (+ splits), settlements and stored
 * exchange rates. All amounts are integer minor units; conversions are done
 * once at write time and stored, so later rate changes never rewrite history.
 */
import type { ExpenseCategory, FxSource, SplitMethod } from '../../shared/constants';
import { computeShares, SplitError, type SplitInput } from '../../shared/finance';
import { allocate, convertMinor, normalizeRate, sum } from '../../shared/money';
import type { ExchangeRateDto, ExpenseDto, SettlementDto } from '../../shared/types';
import { ApiError } from '../lib/errors';
import { nowIso, uuid } from '../lib/util';

type Row = Record<string, unknown>;

const SPLIT_MESSAGES: Record<SplitError['code'], string> = {
  no_participants: 'Mindestens eine beteiligte Person auswählen',
  duplicate_participant: 'Eine Person ist doppelt ausgewählt',
  exact_sum_mismatch: 'Die Einzelbeträge ergeben nicht den Gesamtbetrag',
  percent_sum_mismatch: 'Die Prozentanteile müssen zusammen 100 % ergeben',
  invalid_value: 'Ungültiger Anteil',
  invalid_amount: 'Ungültiger Betrag',
};

export interface FxInput {
  currency: string;
  fxRate?: string;
  fxSource?: 'manual' | 'cached' | 'provider';
  fxDate?: string | null;
}

export function resolveFx(input: FxInput, baseCurrency: string, fallbackDate: string) {
  if (input.currency === baseCurrency) {
    return { rate: '1', source: 'identity' as FxSource, date: null as string | null };
  }
  if (!input.fxRate) {
    throw new ApiError('validation_failed', `Bitte einen Umrechnungskurs ${input.currency} → ${baseCurrency} angeben`, [
      { path: 'fxRate' },
    ]);
  }
  const rate = normalizeRate(input.fxRate);
  if (!rate) throw new ApiError('validation_failed', 'Ungültiger Umrechnungskurs', [{ path: 'fxRate' }]);
  if (input.fxSource === 'provider') {
    // No exchange-rate provider is configured in V1 – do not pretend otherwise.
    throw new ApiError('validation_failed', 'Kein Kursanbieter konfiguriert', [{ path: 'fxSource' }]);
  }
  return { rate, source: (input.fxSource ?? 'manual') as FxSource, date: input.fxDate ?? fallbackDate };
}

async function assertTravelers(db: D1Database, tripId: string, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  const placeholders = unique.map(() => '?').join(', ');
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM travelers WHERE trip_id = ? AND id IN (${placeholders})`)
    .bind(tripId, ...unique)
    .first<{ n: number }>();
  if ((row?.n ?? 0) !== unique.length) {
    throw new ApiError('validation_failed', 'Unbekannte Person in dieser Reise');
  }
}

export interface ExpenseInput extends FxInput {
  id?: string;
  title: string;
  amountMinor: number;
  date: string;
  category: ExpenseCategory;
  paidByTravelerId: string;
  payers?: { travelerId: string; amountMinor: number }[];
  splitMethod: SplitMethod;
  splits: SplitInput[];
  notes?: string | null;
}

/** Normalises payers: several payers must sum exactly to the total. */
function resolvePayers(input: ExpenseInput) {
  const payers = input.payers?.length ? input.payers : [{ travelerId: input.paidByTravelerId, amountMinor: input.amountMinor }];
  if (new Set(payers.map((p) => p.travelerId)).size !== payers.length) {
    throw new ApiError('validation_failed', 'Eine Person ist bei „Bezahlt von“ doppelt ausgewählt', [{ path: 'payers' }]);
  }
  if (sum(payers.map((p) => p.amountMinor)) !== input.amountMinor) {
    throw new ApiError('validation_failed', 'Die bezahlten Beträge ergeben nicht den Gesamtbetrag', [{ path: 'payers' }]);
  }
  // Main payer (kept on the expense row): the one who paid the most.
  const main = [...payers].sort((a, b) => b.amountMinor - a.amountMinor)[0].travelerId;
  return { payers, main };
}

async function prepareExpense(db: D1Database, tripId: string, baseCurrency: string, input: ExpenseInput) {
  const { payers, main } = resolvePayers(input);
  await assertTravelers(db, tripId, [...payers.map((p) => p.travelerId), ...input.splits.map((s) => s.travelerId)]);
  const fx = resolveFx(input, baseCurrency, input.date);
  let baseAmount: number;
  try {
    baseAmount = convertMinor(input.amountMinor, input.currency, baseCurrency, fx.rate);
  } catch {
    throw new ApiError('validation_failed', 'Betrag kann nicht umgerechnet werden');
  }
  let shares;
  try {
    shares = computeShares(input.amountMinor, baseAmount, input.splitMethod, input.splits);
  } catch (e) {
    if (e instanceof SplitError) throw new ApiError('validation_failed', SPLIT_MESSAGES[e.code], [{ path: 'splits' }]);
    throw e;
  }
  const basePaid = allocate(baseAmount, payers.map((p) => p.amountMinor));
  const payerRows = payers.map((p, i) => ({ ...p, baseAmountMinor: basePaid[i] }));
  return { fx, baseAmount, shares, payerRows, main };
}

function payerInserts(
  db: D1Database,
  expenseId: string,
  rows: { travelerId: string; amountMinor: number; baseAmountMinor: number }[],
  guardSql = '',
  guardBinds: unknown[] = [],
) {
  return rows.map((p) =>
    db
      .prepare(
        `INSERT INTO expense_payers (expense_id, traveler_id, amount_minor, base_amount_minor)
         SELECT ?, ?, ?, ? ${guardSql}`,
      )
      .bind(expenseId, p.travelerId, p.amountMinor, p.baseAmountMinor, ...guardBinds),
  );
}

function splitInserts(db: D1Database, expenseId: string, shares: ReturnType<typeof computeShares>, guardSql = '', guardBinds: unknown[] = []) {
  return shares.map((s) =>
    db
      .prepare(
        `INSERT INTO expense_splits (expense_id, traveler_id, share_minor, base_share_minor, weight)
         SELECT ?, ?, ?, ?, ? ${guardSql}`,
      )
      .bind(expenseId, s.travelerId, s.shareMinor, s.baseShareMinor, s.weight, ...guardBinds),
  );
}

export async function createExpense(
  db: D1Database,
  tripId: string,
  baseCurrency: string,
  userId: string,
  input: ExpenseInput,
  bookingId: string | null = null,
): Promise<ExpenseDto> {
  const { fx, baseAmount, shares, payerRows, main } = await prepareExpense(db, tripId, baseCurrency, input);
  const id = input.id ?? uuid();
  const now = nowIso();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO expenses (id, trip_id, title, amount_minor, currency, date, category, paid_by_traveler_id,
             split_method, fx_rate, fx_source, fx_date, base_amount_minor, notes, booking_id, created_by, version,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          id,
          tripId,
          input.title,
          input.amountMinor,
          input.currency,
          input.date,
          input.category,
          main,
          input.splitMethod,
          fx.rate,
          fx.source,
          fx.date,
          baseAmount,
          input.notes ?? null,
          bookingId,
          userId,
          now,
          now,
        ),
      ...splitInserts(db, id, shares),
      ...payerInserts(db, id, payerRows),
    ]);
  } catch (e) {
    const msg = String(e);
    if (msg.includes('UNIQUE') && msg.includes('booking_id')) {
      throw new ApiError('conflict', 'Diese Buchung ist bereits in der Reisekasse erfasst');
    }
    if (msg.includes('UNIQUE')) throw new ApiError('conflict', 'Ausgabe existiert bereits');
    throw e;
  }
  return (await getExpense(db, tripId, id))!;
}

export async function updateExpense(
  db: D1Database,
  tripId: string,
  baseCurrency: string,
  id: string,
  expectedVersion: number,
  input: ExpenseInput,
): Promise<ExpenseDto> {
  const existing = await getExpense(db, tripId, id);
  if (!existing) throw new ApiError('not_found', 'Ausgabe nicht gefunden');
  if (existing.version !== expectedVersion) {
    throw new ApiError('version_conflict', 'Die Ausgabe wurde inzwischen geändert.', { current: existing });
  }
  const { fx, baseAmount, shares, payerRows, main } = await prepareExpense(db, tripId, baseCurrency, input);
  const now = nowIso();
  const newVersion = expectedVersion + 1;
  // The write token (version + updated_at) guards the split rewrite so that it
  // only happens if *this* request's UPDATE succeeded – all inside one batch.
  const guard = 'WHERE EXISTS (SELECT 1 FROM expenses WHERE id = ? AND version = ? AND updated_at = ?)';
  const guardBinds = [id, newVersion, now];
  await db.batch([
    db
      .prepare(
        `UPDATE expenses SET title = ?, amount_minor = ?, currency = ?, date = ?, category = ?, paid_by_traveler_id = ?,
           split_method = ?, fx_rate = ?, fx_source = ?, fx_date = ?, base_amount_minor = ?, notes = ?,
           version = ?, updated_at = ?
         WHERE id = ? AND trip_id = ? AND version = ?`,
      )
      .bind(
        input.title,
        input.amountMinor,
        input.currency,
        input.date,
        input.category,
        main,
        input.splitMethod,
        fx.rate,
        fx.source,
        fx.date,
        baseAmount,
        input.notes ?? null,
        newVersion,
        now,
        id,
        tripId,
        expectedVersion,
      ),
    db.prepare(`DELETE FROM expense_splits WHERE expense_id = ? AND EXISTS (SELECT 1 FROM expenses WHERE id = ? AND version = ? AND updated_at = ?)`).bind(id, ...guardBinds),
    ...splitInserts(db, id, shares, guard, guardBinds),
    db.prepare(`DELETE FROM expense_payers WHERE expense_id = ? AND EXISTS (SELECT 1 FROM expenses WHERE id = ? AND version = ? AND updated_at = ?)`).bind(id, ...guardBinds),
    ...payerInserts(db, id, payerRows, guard, guardBinds),
  ]);
  const updated = (await getExpense(db, tripId, id))!;
  if (updated.version !== newVersion || updated.updatedAt !== now) {
    throw new ApiError('version_conflict', 'Die Ausgabe wurde inzwischen geändert.', { current: updated });
  }
  return updated;
}

function expenseRowToDto(r: Row, shares: ExpenseDto['shares'], payers?: ExpenseDto['payers']): ExpenseDto {
  return {
    payers: payers?.length
      ? payers
      : [{ travelerId: r.paid_by_traveler_id as string, amountMinor: r.amount_minor as number, baseAmountMinor: r.base_amount_minor as number }],
    id: r.id as string,
    tripId: r.trip_id as string,
    version: r.version as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    title: r.title as string,
    amountMinor: r.amount_minor as number,
    currency: r.currency as string,
    date: r.date as string,
    category: r.category as ExpenseCategory,
    paidByTravelerId: r.paid_by_traveler_id as string,
    splitMethod: r.split_method as SplitMethod,
    fxRate: r.fx_rate as string,
    fxSource: r.fx_source as FxSource,
    fxDate: (r.fx_date as string) ?? null,
    baseAmountMinor: r.base_amount_minor as number,
    notes: (r.notes as string) ?? null,
    bookingId: (r.booking_id as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
    shares,
  };
}

export async function listExpenses(db: D1Database, tripId: string): Promise<ExpenseDto[]> {
  const [exp, splits, payerRows] = await db.batch<Row>([
    db.prepare('SELECT * FROM expenses WHERE trip_id = ? ORDER BY date DESC, created_at DESC').bind(tripId),
    db
      .prepare(
        `SELECT s.* FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
         JOIN travelers t ON t.id = s.traveler_id
         WHERE e.trip_id = ? ORDER BY t.sort_order, t.created_at`,
      )
      .bind(tripId),
    db
      .prepare(
        `SELECT p.* FROM expense_payers p JOIN expenses e ON e.id = p.expense_id
         JOIN travelers t ON t.id = p.traveler_id
         WHERE e.trip_id = ? ORDER BY t.sort_order, t.created_at`,
      )
      .bind(tripId),
  ]);
  const payersBy = new Map<string, ExpenseDto['payers']>();
  for (const p of payerRows.results) {
    const list = payersBy.get(p.expense_id as string) ?? [];
    list.push({ travelerId: p.traveler_id as string, amountMinor: p.amount_minor as number, baseAmountMinor: p.base_amount_minor as number });
    payersBy.set(p.expense_id as string, list);
  }
  const byExpense = new Map<string, ExpenseDto['shares']>();
  for (const s of splits.results) {
    const list = byExpense.get(s.expense_id as string) ?? [];
    list.push({
      travelerId: s.traveler_id as string,
      shareMinor: s.share_minor as number,
      baseShareMinor: s.base_share_minor as number,
      weight: (s.weight as number) ?? null,
    });
    byExpense.set(s.expense_id as string, list);
  }
  return exp.results.map((r) => expenseRowToDto(r, byExpense.get(r.id as string) ?? [], payersBy.get(r.id as string)));
}

export async function getExpense(db: D1Database, tripId: string, id: string): Promise<ExpenseDto | null> {
  const row = await db.prepare('SELECT * FROM expenses WHERE id = ? AND trip_id = ?').bind(id, tripId).first<Row>();
  if (!row) return null;
  const { results } = await db
    .prepare(
      `SELECT s.* FROM expense_splits s JOIN travelers t ON t.id = s.traveler_id
       WHERE s.expense_id = ? ORDER BY t.sort_order, t.created_at`,
    )
    .bind(id)
    .all<Row>();
  const payers = (
    await db
      .prepare(
        `SELECT p.* FROM expense_payers p JOIN travelers t ON t.id = p.traveler_id
         WHERE p.expense_id = ? ORDER BY t.sort_order, t.created_at`,
      )
      .bind(id)
      .all<Row>()
  ).results.map((p) => ({ travelerId: p.traveler_id as string, amountMinor: p.amount_minor as number, baseAmountMinor: p.base_amount_minor as number }));
  return expenseRowToDto(
    row,
    results.map((s) => ({
      travelerId: s.traveler_id as string,
      shareMinor: s.share_minor as number,
      baseShareMinor: s.base_share_minor as number,
      weight: (s.weight as number) ?? null,
    })),
    payers,
  );
}

export async function deleteExpense(db: D1Database, tripId: string, id: string, expectedVersion?: number) {
  const existing = await getExpense(db, tripId, id);
  if (!existing) throw new ApiError('not_found', 'Ausgabe nicht gefunden');
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    throw new ApiError('version_conflict', 'Die Ausgabe wurde inzwischen geändert.', { current: existing });
  }
  await db.prepare('DELETE FROM expenses WHERE id = ? AND trip_id = ?').bind(id, tripId).run();
  return existing;
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

function settlementRowToDto(r: Row): SettlementDto {
  return {
    id: r.id as string,
    tripId: r.trip_id as string,
    version: r.version as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    fromTravelerId: r.from_traveler_id as string,
    toTravelerId: r.to_traveler_id as string,
    amountMinor: r.amount_minor as number,
    currency: r.currency as string,
    fxRate: r.fx_rate as string,
    fxSource: r.fx_source as FxSource,
    fxDate: (r.fx_date as string) ?? null,
    baseAmountMinor: r.base_amount_minor as number,
    date: r.date as string,
    notes: (r.notes as string) ?? null,
    depositId: (r.deposit_id as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
  };
}

export async function listSettlements(db: D1Database, tripId: string): Promise<SettlementDto[]> {
  const { results } = await db
    .prepare('SELECT * FROM settlements WHERE trip_id = ? ORDER BY date DESC, created_at DESC')
    .bind(tripId)
    .all<Row>();
  return results.map(settlementRowToDto);
}

export interface SettlementInput extends FxInput {
  id?: string;
  fromTravelerId: string;
  toTravelerId: string;
  amountMinor: number;
  date: string;
  notes?: string | null;
}

export async function createSettlement(
  db: D1Database,
  tripId: string,
  baseCurrency: string,
  userId: string,
  input: SettlementInput,
): Promise<SettlementDto> {
  await assertTravelers(db, tripId, [input.fromTravelerId, input.toTravelerId]);
  const fx = resolveFx(input, baseCurrency, input.date);
  const baseAmount = convertMinor(input.amountMinor, input.currency, baseCurrency, fx.rate);
  const id = input.id ?? uuid();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO settlements (id, trip_id, from_traveler_id, to_traveler_id, amount_minor, currency, fx_rate, fx_source,
         fx_date, base_amount_minor, date, notes, created_by, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      id,
      tripId,
      input.fromTravelerId,
      input.toTravelerId,
      input.amountMinor,
      input.currency,
      fx.rate,
      fx.source,
      fx.date,
      baseAmount,
      input.date,
      input.notes ?? null,
      userId,
      now,
      now,
    )
    .run();
  const row = await db.prepare('SELECT * FROM settlements WHERE id = ?').bind(id).first<Row>();
  return settlementRowToDto(row!);
}

export async function deleteSettlement(db: D1Database, tripId: string, id: string): Promise<void> {
  const linked = await db.prepare('SELECT deposit_id FROM settlements WHERE id = ? AND trip_id = ?').bind(id, tripId).first<{ deposit_id: string | null }>();
  if (linked?.deposit_id) throw new ApiError('conflict', 'Dieser Eintrag gehört zu einer Kaution – bitte dort „Wieder öffnen“ verwenden.');
  const res = await db.prepare('DELETE FROM settlements WHERE id = ? AND trip_id = ?').bind(id, tripId).run();
  if (res.meta.changes === 0) throw new ApiError('not_found', 'Rückzahlung nicht gefunden');
}

// ---------------------------------------------------------------------------
// Exchange rates
// ---------------------------------------------------------------------------

export async function listExchangeRates(db: D1Database, tripId: string): Promise<ExchangeRateDto[]> {
  const { results } = await db
    .prepare('SELECT * FROM exchange_rates WHERE trip_id = ? ORDER BY currency, effective_date DESC, created_at DESC')
    .bind(tripId)
    .all<Row>();
  return results.map((r) => ({
    id: r.id as string,
    tripId: r.trip_id as string,
    currency: r.currency as string,
    baseCurrency: r.base_currency as string,
    rate: r.rate as string,
    source: r.source as 'manual' | 'provider',
    effectiveDate: r.effective_date as string,
    createdAt: r.created_at as string,
  }));
}

export async function createExchangeRate(
  db: D1Database,
  tripId: string,
  baseCurrency: string,
  userId: string,
  input: { currency: string; rate: string; effectiveDate: string },
): Promise<ExchangeRateDto> {
  if (input.currency === baseCurrency) {
    throw new ApiError('validation_failed', 'Kurs zur Basiswährung selbst ist nicht nötig');
  }
  const id = uuid();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO exchange_rates (id, trip_id, currency, base_currency, rate, source, effective_date, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?)`,
    )
    .bind(id, tripId, input.currency, baseCurrency, input.rate, input.effectiveDate, userId, now)
    .run();
  return {
    id,
    tripId,
    currency: input.currency,
    baseCurrency,
    rate: input.rate,
    source: 'manual',
    effectiveDate: input.effectiveDate,
    createdAt: now,
  };
}

export async function deleteExchangeRate(db: D1Database, tripId: string, id: string): Promise<void> {
  const res = await db.prepare('DELETE FROM exchange_rates WHERE id = ? AND trip_id = ?').bind(id, tripId).run();
  if (res.meta.changes === 0) throw new ApiError('not_found', 'Kurs nicht gefunden');
}

/**
 * Links an existing wallet expense to a booking that describes the same cost
 * (e.g. the ferry was paid on site and entered as an expense while the
 * booking still held an estimate). The expense stays the single source of
 * the amount; the booking takes over the real price, becomes "paid" and is
 * then counted only once (via the wallet) everywhere.
 */
export async function linkExpenseToBooking(db: D1Database, tripId: string, expenseId: string, bookingId: string) {
  const e = await getExpense(db, tripId, expenseId);
  if (!e) throw new ApiError('not_found', 'Ausgabe nicht gefunden');
  if (e.bookingId) throw new ApiError('conflict', 'Diese Ausgabe ist schon mit einer Buchung verknüpft');
  const b = await db
    .prepare('SELECT id, booking_status, (SELECT id FROM expenses x WHERE x.booking_id = bookings.id) AS expense_id FROM bookings WHERE id = ? AND trip_id = ?')
    .bind(bookingId, tripId)
    .first<{ id: string; booking_status: string; expense_id: string | null }>();
  if (!b) throw new ApiError('not_found', 'Buchung nicht gefunden');
  if (b.expense_id) throw new ApiError('conflict', 'Diese Buchung ist bereits in der Reisekasse erfasst');
  if (b.booking_status === 'cancelled') throw new ApiError('validation_failed', 'Stornierte Buchungen können nicht verknüpft werden');
  const payer = e.payers.length === 1 ? e.payers[0].travelerId : null;
  const now = nowIso();
  try {
    const [ex] = await db.batch([
      db
        .prepare('UPDATE expenses SET booking_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND trip_id = ? AND booking_id IS NULL')
        .bind(bookingId, now, expenseId, tripId),
      db
        .prepare(
          `UPDATE bookings SET price_minor = ?, currency = ?, cost_kind = 'actual', payment_status = 'paid',
             paid_by_traveler_id = COALESCE(?, paid_by_traveler_id), unit_price_minor = NULL, clarification_note = NULL,
             version = version + 1, updated_at = ?
           WHERE id = ? AND trip_id = ? AND EXISTS (SELECT 1 FROM expenses x WHERE x.id = ? AND x.booking_id = bookings.id)`,
        )
        .bind(e.amountMinor, e.currency, payer, now, bookingId, tripId, expenseId),
    ]);
    if (!ex.meta.changes) throw new ApiError('conflict', 'Die Ausgabe wurde inzwischen geändert – bitte neu laden.');
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (String(err).includes('UNIQUE')) throw new ApiError('conflict', 'Diese Buchung ist bereits in der Reisekasse erfasst');
    throw err;
  }
  return (await getExpense(db, tripId, expenseId))!;
}

/**
 * Keeps a booking's wallet expense in step after the booking price changed:
 * same payers (scaled proportionally), same participants and split method.
 * Exact amounts per person cannot be scaled reliably → the user adjusts them.
 */
export async function syncExpenseAmount(
  db: D1Database,
  tripId: string,
  baseCurrency: string,
  expenseId: string,
  amountMinor: number,
  currency: string,
  fxRate?: string,
): Promise<ExpenseDto> {
  const e = await getExpense(db, tripId, expenseId);
  if (!e) throw new ApiError('not_found', 'Ausgabe nicht gefunden');
  if (e.amountMinor === amountMinor && e.currency === currency) return e;
  if (e.splitMethod === 'exact') {
    throw new ApiError('validation_failed', 'Die Ausgabe ist mit festen Einzelbeträgen aufgeteilt – bitte in der Reisekasse anpassen.');
  }
  const payerAmounts = e.payers.length > 1 ? allocate(amountMinor, e.payers.map((p) => p.amountMinor)) : null;
  const sameCurrency = currency === e.currency;
  return updateExpense(db, tripId, baseCurrency, expenseId, e.version, {
    title: e.title,
    amountMinor,
    currency,
    date: e.date,
    category: e.category,
    paidByTravelerId: e.paidByTravelerId,
    payers: payerAmounts ? e.payers.map((p, i) => ({ travelerId: p.travelerId, amountMinor: payerAmounts[i] })) : undefined,
    splitMethod: e.splitMethod,
    splits: e.shares.map((s) => ({ travelerId: s.travelerId, ...(e.splitMethod === 'percent' && s.weight != null ? { value: s.weight } : {}) })),
    // Keep the historical rate when only the amount changed.
    fxRate: currency === baseCurrency ? undefined : sameCurrency && e.fxSource !== 'identity' ? e.fxRate : fxRate,
    fxSource: currency === baseCurrency ? undefined : sameCurrency && e.fxSource !== 'identity' ? (e.fxSource === 'provider' ? 'provider' : e.fxSource === 'cached' ? 'cached' : 'manual') : 'manual',
    fxDate: sameCurrency ? e.fxDate : null,
    notes: e.notes,
  });
}
