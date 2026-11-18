/**
 * "Ausgabe als Satz": turns a short German sentence into expense fields.
 *   "Taxi 450 Baht, Lilli hat bezahlt, für alle"
 *   "Massage 600 für Annika und Tim"
 *   "Abendessen 1.510 ฿ für uns"   (uns = my couple)
 * Rules only (works offline, no AI, no cost). Everything is a suggestion –
 * the normal expense form opens prefilled and nothing is saved without a tap.
 */
import { guessCategory } from './quickfill';
import type { ExpenseCategory } from './constants';

interface T {
  id: string;
  name: string;
  partnerId?: string | null;
}

export interface ParsedSentence {
  title: string;
  amountMinor: number | null;
  currency: string | null;
  payerId: string | null;
  participantIds: string[] | null;
  category: ExpenseCategory | null;
}

const CUR: [RegExp, string][] = [
  [/฿|baht|bht|thb/i, 'THB'],
  [/€|euro|eur/i, 'EUR'],
  [/\$|usd|dollar/i, 'USD'],
];

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** "1.510,50" / "1,510.50" / "450" → minor units (2 decimals). */
function parseNumber(raw: string): number | null {
  let s = raw.replace(/\s/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function parseExpenseSentence(text: string, travelers: readonly T[], meId: string | null, defaultCurrency: string): ParsedSentence {
  let rest = ` ${text.trim()} `;
  const byName = (word: string) => travelers.find((x) => norm(x.name) === norm(word));
  const coupleOf = (id: string) => {
    const x = travelers.find((y) => y.id === id);
    const p = x?.partnerId ? travelers.find((y) => y.id === x.partnerId && y.partnerId === x.id) : null;
    return p ? [id, p.id] : [id];
  };
  const ordered = (ids: string[]) => travelers.filter((x) => ids.includes(x.id)).map((x) => x.id);

  // Amount (+ currency right before or after the number)
  let amountMinor: number | null = null;
  let currency: string | null = null;
  const m = /(?:(฿|€|\$)\s*)?(\d[\d.,\s]*\d|\d)\s*(฿|€|\$|baht|bht|thb|euro|eur|usd|dollar)?/i.exec(rest);
  if (m) {
    amountMinor = parseNumber(m[2]);
    const sym = m[1] ?? m[3];
    if (sym) currency = CUR.find(([re]) => re.test(sym))?.[1] ?? null;
    rest = rest.replace(m[0], ' ');
  }

  // Payer: "Lilli hat bezahlt", "bezahlt von Lilli", "Lilli zahlt", "ich habe bezahlt"
  let payerId: string | null = null;
  const payerRe = /(?:bezahlt von|gezahlt von|von)\s+([\p{L}-]+)|([\p{L}-]+)\s+(?:hat|haben|habe)\s+(?:bezahlt|gezahlt)|([\p{L}-]+)\s+(?:zahlt|bezahlt)/giu;
  // First phrase whose word is really a traveler (or "ich") – "Eintritt bezahlt von Tim" → Tim.
  for (const pm of rest.matchAll(payerRe)) {
    const w = (pm[1] ?? pm[2] ?? pm[3]).trim();
    const who = ['ich', 'mir'].includes(norm(w)) ? (meId ? { id: meId } : null) : byName(w);
    if (who) {
      payerId = who.id;
      rest = rest.replace(pm[0], ' ');
      break;
    }
  }

  // "Ich habe 220 Baht für Grab bezahlt" / "Lilli hat … bezahlt": subject at the start.
  if (!payerId && /\b(?:bezahlt|gezahlt)\b/i.test(rest)) {
    const sm = /^\s*([\p{L}-]+)\s+(?:hat|habe|haben)\b/iu.exec(rest);
    const w = sm?.[1] ?? '';
    const who = ['ich'].includes(norm(w)) ? (meId ? { id: meId } : null) : byName(w);
    if (sm && who) {
      payerId = who.id;
      rest = rest.replace(sm[0], ' ').replace(/\b(?:bezahlt|gezahlt)\b/i, ' ');
    }
  }

  // Participants: "für alle", "für uns", "für mich", "für Annika und Tim", "für Annika & Tim"
  let participantIds: string[] | null = null;
  const fm = /\bf(?:ü|ue)r\s+(.+?)(?=[,.;]|$)/iu.exec(rest);
  if (fm) {
    const part = norm(fm[1]).trim();
    if (/^(alle|jeden|jede|uns alle|alle vier)\b/.test(part)) participantIds = travelers.map((x) => x.id);
    else if (/^(uns|uns beide)\b/.test(part) && meId) participantIds = ordered(coupleOf(meId));
    else if (/^(mich|mir)\b/.test(part) && meId) participantIds = [meId];
    else {
      const ids = new Set<string>();
      for (const w of part.split(/\s*(?:,|&|\+|und|sowie)\s*|\s+/)) {
        const x = byName(w);
        if (x) ids.add(x.id);
      }
      if (ids.size) participantIds = ordered([...ids]);
    }
    if (participantIds) rest = rest.replace(fm[0], ' ');
  }

  const title = rest
    .replace(/(^|\s)(hat|habe|haben|bezahlt|gezahlt|für|fuer)(?=\s|$)/gi, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
  return {
    title,
    amountMinor,
    currency: currency ?? (amountMinor != null ? defaultCurrency : null),
    payerId,
    participantIds,
    category: guessCategory(title),
  };
}
