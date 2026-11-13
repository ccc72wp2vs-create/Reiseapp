import { countryInfo, type PhraseLang } from '../../shared/countries';

/** Language names (German) for the quick action, page title and menu. */
export const LANG_NAMES: Record<PhraseLang, string> = {
  th: 'Thai',
  es: 'Spanisch',
  it: 'Italienisch',
  fr: 'Französisch',
  pt: 'Portugiesisch',
  el: 'Griechisch',
  tr: 'Türkisch',
  hr: 'Kroatisch',
};

/** Phrasebook language for a trip's destination country (null = none). */
export function phraseLangFor(country: string | null | undefined): PhraseLang | null {
  return countryInfo(country).lang;
}
