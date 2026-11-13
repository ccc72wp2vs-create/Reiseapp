/**
 * Deposits (Kautionen). Open deposits are not costs. Resolving a deposit as
 * partly or fully kept creates one regular expense for the kept part, paid by
 * whoever put down the deposit and shared equally by the travelers it was for.
 */
import { allocate, convertMinor, sum } from '../../shared/money';
import type { FxSource } from '../../shared/constants';
import type { DepositDto, DepositMethod, DepositStatus } from '../../shared/types';
import { ApiError } from '../lib/errors';
import { nowIso, uuid } from '../lib/util';
import { createExpense, deleteExpense, resolveFx, type FxInput } from './wallet';

type Row = Record<string, unknown>;

export interface DepositInput extends FxInput {
  id?: string;
  title: string;
  amountMinor: number;
  paidByTravelerId: string;
  payers?: { travelerId: string; amountMinor: number }[];
  travelerIds: string[];
  method: DepositMethod;
  date: string;
  returnDate?: string | null;
  bookingId?: string | null;
  notes?: string | null;
}

function toDto(r: Row, travelerIds: string[], payers: DepositDto['payers']): DepositDto {
  return {
    id: r.id as string,
    tripId: r.trip_id as string,
    version: r.version as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    title: r.title as string,
    amountMinor: r.amount_minor as number,
    currency: r.currency as string,
    fxRate: r.fx_rate as string,
    fxSource: r.fx_source as FxSource,
    fxDate: (r.fx_date as string) ?? null,
    baseAmountMinor: r.base_amount_minor as number,
    paidByTravelerId: r.paid_by_traveler_id as string,
    payers: payers.length ? payers : [{ travelerId: r.paid_by_traveler_id as string, amountMinor: r.amount_minor as number }],
    travelerIds,
    method: r.method as DepositMethod,
    date: r.date as string,
    returnDate: (r.return_date as string) ?? null,
    bookingId: (r.booking_id as string) ?? null,
    status: r.status as DepositStatus,
    keptMinor: (r.kept_minor as number) ?? null,
    expenseId: (r.expense_id as string) ?? null,
    resolvedAt: (r.resolved_at as string) ?? null,
    notes: (r.notes as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
  };
}

export async function listDeposits(db: D1Database, tripId: string): Promise<DepositDto[]> {
  const [{ results }, { results: links }, { results: payerRows }] = await Promise.all([
    db.prepare("SELECT * FROM deposits WHERE trip_id = ? ORDER BY status = 'open' DESC, date DESC, created_at DESC").bind(tripId).all<Row>(),
    db
      .prepare(
        `SELECT dt.deposit_id, dt.traveler_id FROM deposit_travelers dt
         JOIN deposits d ON d.id = dt.deposit_id JOIN travelers t ON t.id = dt.traveler_id
         WHERE d.trip_id = ? ORDER BY t.sort_order, t.created_at`,
      )
      .bind(tripId)
      .all<{ deposit_id: string; traveler_id: string }>(),
    db
      .prepare(
        `SELECT p.deposit_id, p.traveler_id, p.amount_minor FROM deposit_payers p
         JOIN deposits d ON d.id = p.deposit_id JOIN travelers t ON t.id = p.traveler_id
         WHERE d.trip_id = ? ORDER BY t.sort_order, t.created_at`,
      )
      .bind(tripId)
      .all<{ deposit_id: string; traveler_id: string; amount_minor: number }>(),
  ]);
  const map = new Map<string, string[]>();
  for (const l of links) map.set(l.deposit_id, [...(map.get(l.deposit_id) ?? []), l.traveler_id]);
  const pay = new Map<string, DepositDto['payers']>();
  for (const p of payerRows) pay.set(p.deposit_id, [...(pay.get(p.deposit_id) ?? []), { travelerId: p.traveler_id, amountMinor: p.amount_minor }]);
  return results.map((r) => toDto(r, map.get(r.id as string) ?? [], pay.get(r.id as string) ?? []));
}

export async function getDeposit(db: D1Database, tripId: string, id: string): Promise<DepositDto | null> {
  return (await listDeposits(db, tripId)).find((d) => d.id === id) ?? null;
}

/** Payers as given, or the single main payer with the full amount. */
function payersOf(input: DepositInput) {
  const list = input.payers?.length ? input.payers : [{ travelerId: input.paidByTravelerId, amountMinor: input.amountMinor }];
  if (new Set(list.map((p) => p.travelerId)).size !== list.length) throw new ApiError('validation_failed', 'Eine Person ist doppelt eingetragen', [{ path: 'payers' }]);
  if (sum(list.map((p) => p.amountMinor)) !== input.amountMinor) {
    throw new ApiError('validation_failed', 'Die Beträge der Personen ergeben nicht die Kaution', [{ path: 'payers' }]);
  }
  return list;
}

async function validate(db: D1Database, tripId: string, input: DepositInput) {
  const ids = [...new Set([input.paidByTravelerId, ...input.travelerIds, ...(input.payers ?? []).map((p) => p.travelerId)])];
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM travelers WHERE trip_id = ? AND id IN (${ids.map(() => '?').join(', ')})`)
    .bind(tripId, ...ids)
    .first<{ n: number }>();
  if ((row?.n ?? 0) !== ids.length) throw new ApiError('validation_failed', 'Unbekannte Person in dieser Reise');
  if (input.bookingId) {
    const b = await db.prepare('SELECT id FROM bookings WHERE id = ? AND trip_id = ?').bind(input.bookingId, tripId).first();
    if (!b) throw new ApiError('validation_failed', 'Unbekannte Buchung', [{ path: 'bookingId' }]);
  }
  if (input.returnDate && input.returnDate < input.date) {
    throw new ApiError('validation_failed', 'Rückgabe vor dem Hinterlegen', [{ path: 'returnDate' }]);
  }
}

const travelerRows = (db: D1Database, id: string, travelerIds: string[], payers: { travelerId: string; amountMinor: number }[]) => [
  db.prepare('DELETE FROM deposit_travelers WHERE deposit_id = ?').bind(id),
  ...[...new Set(travelerIds)].map((t) => db.prepare('INSERT INTO deposit_travelers (deposit_id, traveler_id) VALUES (?, ?)').bind(id, t)),
  db.prepare('DELETE FROM deposit_payers WHERE deposit_id = ?').bind(id),
  ...payers.map((p) => db.prepare('INSERT INTO deposit_payers (deposit_id, traveler_id, amount_minor) VALUES (?, ?, ?)').bind(id, p.travelerId, p.amountMinor)),
];

export async function createDeposit(db: D1Database, tripId: string, baseCurrency: string, userId: string, input: DepositInput): Promise<DepositDto> {
  await validate(db, tripId, input);
  const payers = payersOf(input);
  const main = payers[0].travelerId;
  const fx = resolveFx(input, baseCurrency, input.date);
  const base = convertMinor(input.amountMinor, input.currency, baseCurrency, fx.rate);
  const id = input.id ?? uuid();
  const now = nowIso();
  await db.batch([
    db
      .prepare(
        `INSERT INTO deposits (id, trip_id, title, amount_minor, currency, fx_rate, fx_source, fx_date, base_amount_minor,
           paid_by_traveler_id, method, date, return_date, booking_id, notes, created_by, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(id, tripId, input.title, input.amountMinor, input.currency, fx.rate, fx.source, fx.date, base, main, input.method, input.date, input.returnDate ?? null, input.bookingId ?? null, input.notes ?? null, userId, now, now),
    ...travelerRows(db, id, input.travelerIds, payers),
  ]);
  return (await getDeposit(db, tripId, id))!;
}

export async function updateDeposit(db: D1Database, tripId: string, baseCurrency: string, id: string, version: number, input: DepositInput): Promise<DepositDto> {
  const existing = await getDeposit(db, tripId, id);
  if (!existing) throw new ApiError('not_found', 'Kaution nicht gefunden');
  if (existing.version !== version) throw new ApiError('version_conflict', 'Die Kaution wurde inzwischen geändert.', { current: existing });
  if (existing.status !== 'open') throw new ApiError('conflict', 'Abgeschlossene Kautionen erst wieder öffnen, dann bearbeiten.');
  await validate(db, tripId, input);
  const payers = payersOf(input);
  const fx = resolveFx(input, baseCurrency, input.date);
  const base = convertMinor(input.amountMinor, input.currency, baseCurrency, fx.rate);
  const res = await db.batch([
    db
      .prepare(
        `UPDATE deposits SET title = ?, amount_minor = ?, currency = ?, fx_rate = ?, fx_source = ?, fx_date = ?, base_amount_minor = ?,
           paid_by_traveler_id = ?, method = ?, date = ?, return_date = ?, booking_id = ?, notes = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND trip_id = ? AND version = ?`,
      )
      .bind(input.title, input.amountMinor, input.currency, fx.rate, fx.source, fx.date, base, payers[0].travelerId, input.method, input.date, input.returnDate ?? null, input.bookingId ?? null, input.notes ?? null, nowIso(), id, tripId, version),
    ...travelerRows(db, id, input.travelerIds, payers),
  ]);
  if (res[0].meta.changes === 0) throw new ApiError('version_conflict', 'Die Kaution wurde inzwischen geändert.');
  return (await getDeposit(db, tripId, id))!;
}

export async function resolveDeposit(
  db: D1Database,
  tripId: string,
  baseCurrency: string,
  userId: string,
  id: string,
  r: { outcome: 'returned' | 'partial' | 'kept'; keptMinor?: number; date: string; version: number },
): Promise<DepositDto> {
  const d = await getDeposit(db, tripId, id);
  if (!d) throw new ApiError('not_found', 'Kaution nicht gefunden');
  if (d.version !== r.version) throw new ApiError('version_conflict', 'Die Kaution wurde inzwischen geändert.', { current: d });
  if (d.status !== 'open') throw new ApiError('conflict', 'Die Kaution ist bereits abgeschlossen.');
  const kept = r.outcome === 'returned' ? 0 : r.outcome === 'kept' ? d.amountMinor : r.keptMinor!;
  if (kept > d.amountMinor) throw new ApiError('validation_failed', 'Einbehalten kann nicht mehr sein als die Kaution', [{ path: 'keptMinor' }]);
  const status: DepositStatus = r.outcome === 'partial' && kept === d.amountMinor ? 'kept' : r.outcome;
  let expenseId: string | null = null;
  if (kept > 0) {
    let participants = d.travelerIds;
    if (!participants.length) {
      const { results } = await db.prepare('SELECT id FROM travelers WHERE trip_id = ? ORDER BY sort_order, created_at').bind(tripId).all<{ id: string }>();
      participants = results.map((x) => x.id);
    }
    const expense = await createExpense(db, tripId, baseCurrency, userId, {
      title: `Kaution einbehalten: ${d.title}`.slice(0, 160),
      amountMinor: kept,
      currency: d.currency,
      date: r.date,
      category: 'other',
      paidByTravelerId: d.payers[0].travelerId,
      // The kept part is carried by the payers in proportion to what they put down.
      ...(d.payers.length > 1
        ? (() => {
            const parts = allocate(kept, d.payers.map((p) => p.amountMinor));
            return { payers: d.payers.map((p, i) => ({ travelerId: p.travelerId, amountMinor: parts[i] })).filter((p) => p.amountMinor > 0) };
          })()
        : {}),
      splitMethod: 'equal',
      splits: participants.map((travelerId) => ({ travelerId })),
      ...(d.currency !== baseCurrency ? { fxRate: d.fxRate, fxSource: 'cached' as const, fxDate: d.fxDate } : {}),
      notes: 'Automatisch aus der Kaution erstellt.',
    });
    expenseId = expense.id;
  }
  const res = await db
    .prepare('UPDATE deposits SET status = ?, kept_minor = ?, expense_id = ?, resolved_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
    .bind(status, kept || null, expenseId, r.date, nowIso(), id, r.version)
    .run();
  if (res.meta.changes === 0) {
    if (expenseId) await deleteExpense(db, tripId, expenseId);
    throw new ApiError('version_conflict', 'Die Kaution wurde inzwischen geändert.');
  }
  return (await getDeposit(db, tripId, id))!;
}

/** Undo a resolution: removes the generated expense and opens the deposit again. */
export async function reopenDeposit(db: D1Database, tripId: string, id: string, version: number): Promise<DepositDto> {
  const d = await getDeposit(db, tripId, id);
  if (!d) throw new ApiError('not_found', 'Kaution nicht gefunden');
  if (d.version !== version) throw new ApiError('version_conflict', 'Die Kaution wurde inzwischen geändert.', { current: d });
  const stmts = [
    db
      .prepare("UPDATE deposits SET status = 'open', kept_minor = NULL, expense_id = NULL, resolved_at = NULL, version = version + 1, updated_at = ? WHERE id = ?")
      .bind(nowIso(), id),
  ];
  if (d.expenseId) stmts.unshift(db.prepare('DELETE FROM expenses WHERE id = ? AND trip_id = ?').bind(d.expenseId, tripId));
  await db.batch(stmts);
  return (await getDeposit(db, tripId, id))!;
}

export async function deleteDeposit(db: D1Database, tripId: string, id: string): Promise<void> {
  const d = await getDeposit(db, tripId, id);
  if (!d) throw new ApiError('not_found', 'Kaution nicht gefunden');
  const stmts = [db.prepare('DELETE FROM deposits WHERE id = ?').bind(id)];
  if (d.expenseId) stmts.unshift(db.prepare('DELETE FROM expenses WHERE id = ? AND trip_id = ?').bind(d.expenseId, tripId));
  await db.batch(stmts);
}
