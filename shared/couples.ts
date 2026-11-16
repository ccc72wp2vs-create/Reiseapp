/**
 * Couples: travelers can name a partner (mutual). Couple balances are simply
 * the sum of both partners' balances from `computeBalances` – nothing is
 * recalculated – and settlements between couples reuse `suggestSettlements`.
 * Money moving inside a couple is ignored (they settle that among themselves).
 */
import { suggestSettlements, type TravelerBalance } from './finance';

interface TravelerLike {
  id: string;
  partnerId?: string | null;
}

export interface Couple {
  /** Stable key: the first member's id (in traveler order). */
  key: string;
  /** One member (single traveler) or two (couple), in traveler order. */
  memberIds: string[];
}

export interface CoupleBalance extends Couple {
  balanceMinor: number;
  members: { travelerId: string; balanceMinor: number }[];
}

export interface CoupleTransfer {
  fromKey: string;
  toKey: string;
  amountMinor: number;
  /** Suggested member who pays / receives (largest individual debt / credit). */
  fromTravelerId: string;
  toTravelerId: string;
}

/** Groups travelers into couples (mutual partners) and singles, in traveler order. */
export function groupCouples(travelers: readonly TravelerLike[]): Couple[] {
  const byId = new Map(travelers.map((x) => [x.id, x]));
  const seen = new Set<string>();
  const out: Couple[] = [];
  for (const x of travelers) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    const p = x.partnerId ? byId.get(x.partnerId) : undefined;
    if (p && p.partnerId === x.id && !seen.has(p.id)) {
      seen.add(p.id);
      out.push({ key: x.id, memberIds: [x.id, p.id] });
    } else out.push({ key: x.id, memberIds: [x.id] });
  }
  return out;
}

/** True when at least one mutual couple exists. */
export function hasCouples(travelers: readonly TravelerLike[]): boolean {
  return groupCouples(travelers).some((c) => c.memberIds.length > 1);
}

export function coupleBalances(travelers: readonly TravelerLike[], balances: readonly TravelerBalance[]): CoupleBalance[] {
  const bal = new Map(balances.map((b) => [b.travelerId, b.balanceMinor]));
  return groupCouples(travelers).map((c) => {
    const members = c.memberIds.map((id) => ({ travelerId: id, balanceMinor: bal.get(id) ?? 0 }));
    return { ...c, members, balanceMinor: members.reduce((a, m) => a + m.balanceMinor, 0) };
  });
}

/** Minimal transfers between couples, with a suggested paying and receiving member. */
export function coupleSettlements(couples: readonly CoupleBalance[]): CoupleTransfer[] {
  const byKey = new Map(couples.map((c) => [c.key, c]));
  const pick = (key: string, dir: 1 | -1) => {
    const c = byKey.get(key)!;
    return [...c.members].sort((a, b) => dir * (b.balanceMinor - a.balanceMinor))[0].travelerId;
  };
  return suggestSettlements(
    couples.map((c) => ({ travelerId: c.key, balanceMinor: c.balanceMinor, paidMinor: 0, owedMinor: 0, settledOutMinor: 0, settledInMinor: 0 })),
  ).map((s) => ({
    fromKey: s.fromTravelerId,
    toKey: s.toTravelerId,
    amountMinor: s.amountMinor,
    fromTravelerId: pick(s.fromTravelerId, -1),
    toTravelerId: pick(s.toTravelerId, 1),
  }));
}
