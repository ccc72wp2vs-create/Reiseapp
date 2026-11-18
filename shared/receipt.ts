/**
 * Receipt split: line items of a restaurant/shop receipt, each assigned to
 * one or more travelers; the tip is shared equally by everyone involved.
 * Produces exact shares (minor units) for an expense with splitMethod 'exact'.
 */
import { allocate, currencyExponent, isSupportedCurrency } from './money';

export interface ReceiptLine {
  name: string;
  qty: number;
  amountMinor: number;
}

export interface ReceiptScan {
  merchant: string | null;
  date: string | null;
  currency: string | null;
  lines: ReceiptLine[];
  tipMinor: number;
  /** Total printed on the receipt (incl. tip), if readable. */
  totalMinor: number | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[^\d,.-]/g, '');
  // "1.510,00" / "1,510.00" / "1510"
  const norm = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
};

const toMinor = (major: number | null, exp: number) => (major == null || major < 0 ? null : Math.round(major * 10 ** exp));

/** Normalises the model's JSON; never trusts it blindly (max 80 lines, tip/total ≥ 0). */
export function normalizeReceipt(raw: Raw | null): ReceiptScan | null {
  if (!raw) return null;
  const cur = typeof raw.currency === 'string' && isSupportedCurrency(raw.currency.trim().toUpperCase()) ? raw.currency.trim().toUpperCase() : null;
  const exp = currencyExponent(cur ?? 'EUR');
  const items = Array.isArray(raw.items) ? (raw.items as Raw[]) : [];
  const lines: ReceiptLine[] = [];
  for (const it of items.slice(0, 80)) {
    if (!it || typeof it !== 'object') continue;
    const name = typeof it.name === 'string' ? it.name.trim().slice(0, 80) : '';
    // Negative lines are discounts (e.g. "Rabatt -50").
    const n = num(it.amount);
    const amount = n == null ? null : Math.round(n * 10 ** exp);
    if (!name || amount == null || amount === 0) continue;
    const qty = Math.max(1, Math.min(99, Math.round(num(it.qty) ?? 1)));
    lines.push({ name, qty, amountMinor: amount });
  }
  const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date.trim()) ? raw.date.trim() : null;
  const merchant = typeof raw.merchant === 'string' && raw.merchant.trim() && raw.merchant.trim().toLowerCase() !== 'null' ? raw.merchant.trim().slice(0, 80) : null;
  if (!lines.length && !merchant) return null;
  return { merchant, date, currency: cur, lines, tipMinor: toMinor(num(raw.tip), exp) ?? 0, totalMinor: toMinor(num(raw.total), exp) };
}

export interface AssignedLine {
  amountMinor: number;
  /** Travelers this line is for (shared equally). Empty = not assigned yet. */
  travelerIds: string[];
}

export interface ReceiptSplit {
  totalMinor: number;
  /** Exact shares per traveler in the receipt currency (sum = totalMinor). */
  shares: { travelerId: string; amountMinor: number }[];
  /** Lines that still have nobody assigned. */
  unassigned: number;
}

/**
 * Each line is split equally among its travelers (remainder cents go to the
 * first ones, deterministic); the tip equally among everyone involved.
 * `order` fixes the traveler order (e.g. the trip's traveler list).
 */
export function splitReceipt(lines: readonly AssignedLine[], tipMinor: number, order: readonly string[]): ReceiptSplit {
  const acc = new Map<string, number>();
  let unassigned = 0;
  for (const l of lines) {
    const ids = order.filter((id) => l.travelerIds.includes(id));
    if (!ids.length) {
      unassigned++;
      continue;
    }
    allocate(l.amountMinor, ids.map(() => 1)).forEach((part, i) => acc.set(ids[i], (acc.get(ids[i]) ?? 0) + part));
  }
  const involved = order.filter((id) => acc.has(id));
  if (tipMinor > 0 && involved.length) {
    allocate(tipMinor, involved.map(() => 1)).forEach((part, i) => acc.set(involved[i], (acc.get(involved[i]) ?? 0) + part));
  }
  const shares = order.filter((id) => acc.has(id)).map((travelerId) => ({ travelerId, amountMinor: acc.get(travelerId)! }));
  return { totalMinor: shares.reduce((a, s) => a + s.amountMinor, 0), shares, unassigned };
}
