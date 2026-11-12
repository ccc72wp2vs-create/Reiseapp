/**
 * Money utilities. All amounts are integer minor units (e.g. cents, satang).
 * Exchange-rate math uses BigInt so no floating point ever touches
 * financial results.
 */

/** ISO 4217 currencies offered in the UI with their minor-unit exponent. */
export const CURRENCIES: Record<string, { exp: number }> = {
  EUR: { exp: 2 },
  THB: { exp: 2 },
  USD: { exp: 2 },
  GBP: { exp: 2 },
  CHF: { exp: 2 },
  JPY: { exp: 0 },
  AUD: { exp: 2 },
  CAD: { exp: 2 },
  NZD: { exp: 2 },
  SGD: { exp: 2 },
  HKD: { exp: 2 },
  CNY: { exp: 2 },
  KRW: { exp: 0 },
  VND: { exp: 0 },
  IDR: { exp: 2 },
  MYR: { exp: 2 },
  PHP: { exp: 2 },
  INR: { exp: 2 },
  LKR: { exp: 2 },
  KHR: { exp: 2 },
  LAK: { exp: 2 },
  MMR: { exp: 2 },
  TWD: { exp: 2 },
  AED: { exp: 2 },
  TRY: { exp: 2 },
  SEK: { exp: 2 },
  NOK: { exp: 2 },
  DKK: { exp: 2 },
  PLN: { exp: 2 },
  CZK: { exp: 2 },
  HUF: { exp: 2 },
  ISK: { exp: 0 },
  MXN: { exp: 2 },
  BRL: { exp: 2 },
  ZAR: { exp: 2 },
  EGP: { exp: 2 },
  MAD: { exp: 2 },
  CLP: { exp: 0 },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);

export function isSupportedCurrency(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

export function currencyExponent(code: string): number {
  const c = CURRENCIES[code];
  if (!c) throw new Error(`Unsupported currency: ${code}`);
  return c.exp;
}

/**
 * Parses a user-entered amount (German "1.234,56" or "1234.56") into minor
 * units. Returns null for invalid input or too many decimals.
 */
export function parseAmount(input: string, currency: string): number | null {
  const exp = currencyExponent(currency);
  let s = input.trim().replace(/[\s\u00a0]/g, '');
  if (!s) return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart: string;
  let fracPart = '';
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever comes last is the decimal separator.
    const dec = lastComma > lastDot ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    const [i, f = ''] = s.split(dec);
    intPart = i.split(thou).join('');
    fracPart = f;
    if (s.split(dec).length > 2) return null;
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    if (parts.length > 2) {
      // "1,234,567" – thousands separators
      intPart = parts.join('');
    } else {
      intPart = parts[0];
      fracPart = parts[1];
    }
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2) {
      // German thousands: "1.234.567"
      intPart = parts.join('');
    } else if (parts[1].length === 3 && exp !== 3) {
      // "1.234" in German means one thousand two hundred thirty-four
      intPart = parts.join('');
    } else {
      intPart = parts[0];
      fracPart = parts[1];
    }
  } else {
    intPart = s;
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (fracPart.length > exp) return null;
  const minorStr = intPart + fracPart.padEnd(exp, '0');
  const value = Number(minorStr);
  if (!Number.isSafeInteger(value)) return null;
  return neg ? -value : value;
}

/** Converts minor units to a plain decimal string ("1234.56"). */
export function minorToDecimalString(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  const neg = minor < 0;
  const abs = Math.abs(minor).toString().padStart(exp + 1, '0');
  const int = exp ? abs.slice(0, -exp) : abs;
  const frac = exp ? abs.slice(-exp) : '';
  return (neg ? '-' : '') + int + (frac ? '.' + frac : '');
}

/** Converts minor units to an input-friendly German string ("1234,56"). */
export function minorToInput(minor: number, currency: string): string {
  return minorToDecimalString(minor, currency).replace('.', ',');
}

const formatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor: number, currency: string, locale = 'de-DE'): string {
  const exp = currencyExponent(currency);
  const key = `${locale}|${currency}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    });
    formatterCache.set(key, fmt);
  }
  // Format via the decimal string to avoid float artefacts for huge numbers.
  return fmt.format(Number(minorToDecimalString(minor, currency)));
}

// ---------------------------------------------------------------------------
// Exchange rates
// ---------------------------------------------------------------------------

export interface ParsedRate {
  /** rate = numerator / 10^scale */
  numerator: bigint;
  scale: number;
}

const RATE_RE = /^(\d{1,9})(?:[.,](\d{1,12}))?$/;

/**
 * Parses a positive decimal exchange rate ("0,0256" or "39.12").
 * The rate expresses how many units of the target (base) currency one unit
 * of the source currency is worth.
 */
export function parseRate(input: string): ParsedRate | null {
  const m = RATE_RE.exec(input.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  const numerator = BigInt(m[1] + frac);
  if (numerator <= 0n) return null;
  return { numerator, scale: frac.length };
}

/** Normalises a rate string to canonical form with "." separator. */
export function normalizeRate(input: string): string | null {
  const p = parseRate(input);
  if (!p) return null;
  const digits = p.numerator.toString().padStart(p.scale + 1, '0');
  const int = p.scale ? digits.slice(0, -p.scale) : digits;
  let frac = p.scale ? digits.slice(-p.scale) : '';
  frac = frac.replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

/** Integer division rounding half away from zero. */
export function divRoundHalfAwayFromZero(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error('Divisor must be positive');
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const q = abs / d;
  const r = abs % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return neg ? -rounded : rounded;
}

/**
 * Converts an amount in minor units from one currency to another using a
 * decimal rate ("1 from = rate to"). Result is rounded half away from zero.
 */
export function convertMinor(amountMinor: number, from: string, to: string, rate: string): number {
  if (from === to) return amountMinor;
  const p = parseRate(rate);
  if (!p) throw new Error(`Invalid rate: ${rate}`);
  const expFrom = currencyExponent(from);
  const expTo = currencyExponent(to);
  // to_minor = amount_minor / 10^expFrom * rate * 10^expTo
  //          = amount_minor * numerator * 10^expTo / (10^scale * 10^expFrom)
  const num = BigInt(amountMinor) * p.numerator * 10n ** BigInt(expTo);
  const den = 10n ** BigInt(p.scale + expFrom);
  const result = divRoundHalfAwayFromZero(num, den);
  const n = Number(result);
  if (!Number.isSafeInteger(n)) throw new Error('Amount overflow');
  return n;
}

// ---------------------------------------------------------------------------
// Allocation (splitting) – largest remainder method
// ---------------------------------------------------------------------------

/**
 * Splits `total` minor units proportionally to non-negative integer weights.
 * The result always sums exactly to `total`. Remainder units go to the
 * entries with the largest fractional remainders; ties are broken by
 * position (earlier first) so the outcome is deterministic.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total)) throw new Error('Total must be an integer');
  if (weights.length === 0) throw new Error('At least one weight required');
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new Error('Weights must be non-negative integers');
  }
  const sumW = weights.reduce((a, b) => a + BigInt(b), 0n);
  if (sumW === 0n) throw new Error('Sum of weights must be positive');
  const sign = total < 0 ? -1n : 1n;
  const absTotal = BigInt(Math.abs(total));
  const base: bigint[] = [];
  const rema: { idx: number; rem: bigint }[] = [];
  let assigned = 0n;
  weights.forEach((w, idx) => {
    const exact = absTotal * BigInt(w);
    const q = exact / sumW;
    base.push(q);
    assigned += q;
    rema.push({ idx, rem: exact % sumW });
  });
  let left = absTotal - assigned;
  rema.sort((a, b) => (a.rem === b.rem ? a.idx - b.idx : a.rem > b.rem ? -1 : 1));
  for (const r of rema) {
    if (left <= 0n) break;
    if (weights[r.idx] === 0) continue;
    base[r.idx] += 1n;
    left -= 1n;
  }
  return base.map((b) => Number(b * sign));
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
