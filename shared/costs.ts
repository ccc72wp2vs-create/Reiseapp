/**
 * Interpretation rules for booking costs (shared & unit-tested).
 *
 *  - "booked" (Gebucht) does NOT mean "paid" (Bezahlt)
 *  - estimates (Schätzung) and budget caps (Budgetgrenze) are never spent money
 *  - booking costs are separate from wallet expenses; a booking counts in the
 *    wallet only after it was explicitly transferred (expenseId set)
 *  - if it is unknown for how many people a price applies, nothing is split
 *    automatically and the booking is flagged for clarification
 */
import type { BookingDto, ExpenseDto } from './types';
import { allocate, divRoundHalfAwayFromZero } from './money';

export interface CostInfo {
  hasPrice: boolean;
  isCancelled: boolean;
  /** Estimate, budget cap or not yet booked. */
  isPlanned: boolean;
  /** Booked with a concrete price (not necessarily paid). */
  isCommitted: boolean;
  /** Paid concrete price. */
  countsAsSpent: boolean;
  needsClarification: boolean;
  clarificationReasons: ('note' | 'persons_unknown' | 'unit_price_unclear')[];
  /** Price per person when the number of persons is known. */
  perPersonMinor: number | null;
  perPersonExact: boolean;
}

type CostFields = Pick<
  BookingDto,
  'priceMinor' | 'currency' | 'personsCount' | 'unitPriceMinor' | 'costKind' | 'bookingStatus' | 'paymentStatus' | 'clarificationNote'
>;

export function costInfo(b: CostFields): CostInfo {
  const hasPrice = b.priceMinor != null && !!b.currency;
  const isCancelled = b.bookingStatus === 'cancelled';
  const isPlanned = !isCancelled && (b.costKind !== 'actual' || b.bookingStatus === 'planned' || b.bookingStatus === 'unconfirmed');
  const isCommitted = !isCancelled && hasPrice && b.costKind === 'actual' && b.bookingStatus === 'booked';
  const countsAsSpent = !isCancelled && hasPrice && b.costKind === 'actual' && b.paymentStatus === 'paid';
  const reasons: CostInfo['clarificationReasons'] = [];
  if (b.clarificationNote) reasons.push('note');
  if (hasPrice && b.personsCount == null && !isCancelled) reasons.push('persons_unknown');
  if (b.unitPriceMinor != null && b.personsCount == null) reasons.push('unit_price_unclear');
  let perPersonMinor: number | null = null;
  let perPersonExact = false;
  if (hasPrice && b.personsCount && b.personsCount > 0) {
    perPersonMinor = Number(divRoundHalfAwayFromZero(BigInt(b.priceMinor!), BigInt(b.personsCount)));
    perPersonExact = b.priceMinor! % b.personsCount === 0;
  }
  return {
    hasPrice,
    isCancelled,
    isPlanned,
    isCommitted,
    countsAsSpent,
    needsClarification: reasons.length > 0,
    clarificationReasons: reasons,
    perPersonMinor,
    perPersonExact,
  };
}

export interface CurrencyTotals {
  currency: string;
  /** Booked, concrete prices (paid or not). */
  committedMinor: number;
  /** Of committed: marked as paid. */
  paidMinor: number;
  /** Of committed: not (yet) marked as paid or payment status unknown. */
  openMinor: number;
  /** Estimates for planned/unconfirmed items. */
  estimatedMinor: number;
  /** Budget caps (upper limits). */
  budgetCapMinor: number;
}

/** Aggregates booking costs per currency without ever mixing categories. */
export function summarizeBookingCosts(bookings: readonly CostFields[]): CurrencyTotals[] {
  const map = new Map<string, CurrencyTotals>();
  for (const b of bookings) {
    if (b.priceMinor == null || !b.currency || b.bookingStatus === 'cancelled') continue;
    let t = map.get(b.currency);
    if (!t) {
      t = { currency: b.currency, committedMinor: 0, paidMinor: 0, openMinor: 0, estimatedMinor: 0, budgetCapMinor: 0 };
      map.set(b.currency, t);
    }
    if (b.costKind === 'estimate') t.estimatedMinor += b.priceMinor;
    else if (b.costKind === 'budget_cap') t.budgetCapMinor += b.priceMinor;
    else if (b.bookingStatus === 'booked') {
      t.committedMinor += b.priceMinor;
      if (b.paymentStatus === 'paid') t.paidMinor += b.priceMinor;
      else t.openMinor += b.priceMinor;
    } else {
      // concrete price but not booked yet → still only planned
      t.estimatedMinor += b.priceMinor;
    }
  }
  return [...map.values()];
}

export interface TripCostOverview {
  baseCurrency: string;
  /** All wallet expenses in the base currency (incl. bookings transferred to the wallet). */
  spentMinor: number;
  /** Booked fixed prices that are not (yet) in the wallet. */
  bookedNotInWalletMinor: number;
  /** Estimates and not-yet-booked prices (never counted as spent). */
  plannedMinor: number;
  /** Upper budget limits. */
  budgetCapMinor: number;
  /** spent + booked-not-in-wallet + planned + budget caps. */
  projectedMinor: number;
  /** Booking amounts in other currencies that cannot be added up without a rate. */
  otherCurrencies: { currency: string; minor: number }[];
}

/**
 * One consistent view of what the trip costs. Bookings already transferred
 * to the wallet are counted only once (as expenses).
 */
export function tripCostOverview(
  baseCurrency: string,
  expenses: readonly Pick<ExpenseDto, 'baseAmountMinor'>[],
  bookings: readonly (CostFields & Pick<BookingDto, 'expenseId'>)[],
): TripCostOverview {
  const o: TripCostOverview = {
    baseCurrency,
    spentMinor: expenses.reduce((a, e) => a + e.baseAmountMinor, 0),
    bookedNotInWalletMinor: 0,
    plannedMinor: 0,
    budgetCapMinor: 0,
    projectedMinor: 0,
    otherCurrencies: [],
  };
  const other = new Map<string, number>();
  for (const b of bookings) {
    if (b.priceMinor == null || !b.currency || b.bookingStatus === 'cancelled' || b.expenseId) continue;
    if (b.currency !== baseCurrency) {
      other.set(b.currency, (other.get(b.currency) ?? 0) + b.priceMinor);
      continue;
    }
    if (b.costKind === 'budget_cap') o.budgetCapMinor += b.priceMinor;
    else if (b.costKind === 'estimate' || b.bookingStatus !== 'booked') o.plannedMinor += b.priceMinor;
    else o.bookedNotInWalletMinor += b.priceMinor;
  }
  o.projectedMinor = o.spentMinor + o.bookedNotInWalletMinor + o.plannedMinor + o.budgetCapMinor;
  o.otherCurrencies = [...other].map(([currency, minor]) => ({ currency, minor }));
  return o;
}

export interface PersonCostOverview extends TripCostOverview {
  /** What the selected persons actually paid (after repayments). */
  netPaidMinor: number;
  /** > 0 gets money back, < 0 still owes. */
  balanceMinor: number;
  /** Booking amounts (base currency) not attributed to anyone. */
  unassignedMinor: number;
}

/**
 * Cost overview for one or more travelers (a "group", e.g. a couple).
 * Expenses count with the travelers' shares; bookings not yet in the wallet
 * count with an exact split among the booking's participants.
 */
export function personCostOverview(
  baseCurrency: string,
  travelerIds: readonly string[],
  expenses: readonly Pick<ExpenseDto, 'baseAmountMinor' | 'payers' | 'shares'>[],
  settlements: readonly { fromTravelerId: string; toTravelerId: string; baseAmountMinor: number }[],
  bookings: readonly (CostFields & Pick<BookingDto, 'expenseId' | 'travelerIds'>)[],
): PersonCostOverview {
  const sel = new Set(travelerIds);
  let spent = 0;
  let paid = 0;
  for (const e of expenses) {
    for (const s of e.shares) if (sel.has(s.travelerId)) spent += s.baseShareMinor;
    for (const p of e.payers) if (sel.has(p.travelerId)) paid += p.baseAmountMinor;
  }
  for (const s of settlements) {
    if (sel.has(s.fromTravelerId)) paid += s.baseAmountMinor;
    if (sel.has(s.toTravelerId)) paid -= s.baseAmountMinor;
  }
  const o: PersonCostOverview = {
    baseCurrency,
    spentMinor: spent,
    bookedNotInWalletMinor: 0,
    plannedMinor: 0,
    budgetCapMinor: 0,
    projectedMinor: 0,
    otherCurrencies: [],
    netPaidMinor: paid,
    balanceMinor: paid - spent,
    unassignedMinor: 0,
  };
  const other = new Map<string, number>();
  for (const b of bookings) {
    if (b.priceMinor == null || !b.currency || b.bookingStatus === 'cancelled' || b.expenseId) continue;
    if (!b.travelerIds.length) {
      if (b.currency === baseCurrency) o.unassignedMinor += b.priceMinor;
      continue;
    }
    const parts = allocate(b.priceMinor, b.travelerIds.map(() => 1));
    const mine = b.travelerIds.reduce((a, id, i) => a + (sel.has(id) ? parts[i] : 0), 0);
    if (!mine) continue;
    if (b.currency !== baseCurrency) {
      other.set(b.currency, (other.get(b.currency) ?? 0) + mine);
      continue;
    }
    if (b.costKind === 'budget_cap') o.budgetCapMinor += mine;
    else if (b.costKind === 'estimate' || b.bookingStatus !== 'booked') o.plannedMinor += mine;
    else o.bookedNotInWalletMinor += mine;
  }
  o.projectedMinor = o.spentMinor + o.bookedNotInWalletMinor + o.plannedMinor + o.budgetCapMinor;
  o.otherCurrencies = [...other].map(([currency, minor]) => ({ currency, minor }));
  return o;
}

export type CostBucket = 'bookedNotInWallet' | 'planned' | 'budgetCap';

export interface CostBucketItem {
  bookingId: string;
  bucket: CostBucket;
  /** Full booking amount, or the selected persons' part when filtered. */
  amountMinor: number;
}

/**
 * The bookings behind the cost overview lines (same rules as
 * tripCostOverview / personCostOverview), for drill-down views.
 */
export function costBucketItems(
  baseCurrency: string,
  bookings: readonly (CostFields & Pick<BookingDto, 'id' | 'expenseId' | 'travelerIds'>)[],
  travelerIds?: readonly string[],
): CostBucketItem[] {
  const sel = travelerIds && travelerIds.length ? new Set(travelerIds) : null;
  const out: CostBucketItem[] = [];
  for (const b of bookings) {
    if (b.priceMinor == null || b.currency !== baseCurrency || b.bookingStatus === 'cancelled' || b.expenseId) continue;
    let amount = b.priceMinor;
    if (sel) {
      if (!b.travelerIds.length) continue;
      const parts = allocate(b.priceMinor, b.travelerIds.map(() => 1));
      amount = b.travelerIds.reduce((a, id, i) => a + (sel.has(id) ? parts[i] : 0), 0);
      if (!amount) continue;
    }
    const bucket: CostBucket =
      b.costKind === 'budget_cap' ? 'budgetCap' : b.costKind === 'estimate' || b.bookingStatus !== 'booked' ? 'planned' : 'bookedNotInWallet';
    out.push({ bookingId: b.id, bucket, amountMinor: amount });
  }
  return out;
}
