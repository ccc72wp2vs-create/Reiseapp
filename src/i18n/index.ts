/**
 * Central translation access. Components import `t` (current dictionary) and
 * the formatting helpers in src/lib/format.ts. Adding English later means
 * adding `en.ts` with the same `Dictionary` shape and selecting it here.
 */
import { de, type Dictionary } from './de';

export type Locale = 'de';

const dictionaries: Record<Locale, Dictionary> = { de };

export const locale: Locale = 'de';
export const intlLocale = 'de-DE';

export const t: Dictionary = dictionaries[locale];
