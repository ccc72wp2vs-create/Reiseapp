import { formatMoney } from '../../shared/money';
import { intlLocale } from '../i18n';

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale, { timeZone: 'UTC', ...opts });
    cache.set(key, f);
  }
  return f;
}
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

/** 06.11.2026 */
export const formatDate = (d: string | null | undefined) => (d ? fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(asDate(d)) : '');
/** 06.11. */
export const formatDateShort = (d: string) => fmt({ day: '2-digit', month: '2-digit' }).format(asDate(d));
/** Fr., 06.11. */
export const formatWeekdayShort = (d: string) => fmt({ weekday: 'short', day: '2-digit', month: '2-digit' }).format(asDate(d));
/** Freitag, 6. November */
export const formatLongDate = (d: string) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(asDate(d));
/** Fr */
export const formatWeekday = (d: string) => fmt({ weekday: 'short' }).format(asDate(d)).replace('.', '');
export const formatDayNum = (d: string) => String(asDate(d).getUTCDate());
export const formatMonthShort = (d: string) => fmt({ month: 'short' }).format(asDate(d)).replace('.', '');

export function formatRange(a: string, b: string) {
  if (a === b) return formatDate(a);
  return `${formatDateShort(a)} – ${formatDate(b)}`;
}

export const formatTime = (t: string | null | undefined) => (t ? `${t} Uhr` : '');

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(intlLocale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export const money = (minor: number, currency: string) => formatMoney(minor, currency, intlLocale);

const numberFmt = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 6 });
export const formatRate = (rate: string) => numberFmt.format(Number(rate));

export function tzLabel(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat(intlLocale, { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
  } catch {
    return tz;
  }
}
