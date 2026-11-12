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
import type { BookingDto } from './types';
import { divRoundHalfAwayFromZero } from './money';

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
