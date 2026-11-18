/**
 * Smart defaults for new expenses: category guessed from the title, the
 * participants used last time, and recent expenses as one-tap templates.
 */
import type { ExpenseCategory } from './constants';
import type { ExpenseDto } from './types';

const RULES: [ExpenseCategory, RegExp][] = [
  ['transportation', /taxi|grab|bolt|tuk|songthaew|bus|minivan|fähre|faehre|boot|boat|longtail|speedboat|ferry|zug|train|flug|flight|roller|scooter|moped|benzin|tank|transfer|maut|parken/],
  ['accommodation', /hotel|hostel|resort|airbnb|unterkunft|bungalow|zimmer|übernachtung|guesthouse|villa/],
  ['activities', /tour|ausflug|eintritt|ticket|tauch|schnorchel|kajak|kayak|kurs|massage|spa|show|museum|tempel|nationalpark|elefant|rafting|wasserpark/],
  ['shopping', /markt|market|souvenir|shop|kleid|anzug|hemd|klamotten|7-?eleven|seven|apotheke|pharmacy|supermarkt|drogerie|sim/],
  ['food', /essen|restaurant|frühstück|fruehstueck|mittag|abend|dinner|lunch|café|cafe|kaffee|coffee|bier|beer|bar|cocktail|smoothie|kokos|coconut|streetfood|snack|eis|pizza|burger|pad thai|wasser/],
];

/** Category from words in the title, or null when nothing fits. */
export function guessCategory(title: string): ExpenseCategory | null {
  const t = title.toLowerCase();
  return RULES.find(([, re]) => re.test(t))?.[0] ?? null;
}

/** Participants of the viewer's most recent expense (same group as last time), else null. */
export function lastParticipants(expenses: readonly Pick<ExpenseDto, 'payers' | 'shares' | 'createdAt' | 'bookingId'>[], meId: string | null): string[] | null {
  if (!meId) return null;
  const last = [...expenses]
    .filter((e) => !e.bookingId && e.payers.some((p) => p.travelerId === meId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return last ? last.shares.map((s) => s.travelerId) : null;
}

export interface ExpenseTemplate {
  title: string;
  amountMinor: number;
  currency: string;
  category: ExpenseCategory;
  participantIds: string[];
}

/** Recent distinct small expenses as templates ("Nochmal: Grab 220 ฿"). */
export function recentTemplates(expenses: readonly Pick<ExpenseDto, 'title' | 'amountMinor' | 'currency' | 'category' | 'shares' | 'createdAt' | 'bookingId'>[], limit = 4): ExpenseTemplate[] {
  const seen = new Set<string>();
  const out: ExpenseTemplate[] = [];
  for (const e of [...expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (e.bookingId || e.category === 'accommodation') continue;
    const key = e.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ title: e.title, amountMinor: e.amountMinor, currency: e.currency, category: e.category, participantIds: e.shares.map((s) => s.travelerId) });
    if (out.length >= limit) break;
  }
  return out;
}
