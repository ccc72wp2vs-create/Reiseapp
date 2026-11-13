/**
 * Maps a trip's free-text destination country (German or English name, or
 * ISO code) to the phrasebook language and emergency profile.
 */
export type PhraseLang = 'th' | 'es' | 'it' | 'fr' | 'pt' | 'el' | 'tr' | 'hr';
export type EmergencyProfile = 'th' | 'eu' | 'tr';

interface CountryInfo {
  lang: PhraseLang | null;
  emergency: EmergencyProfile | null;
}

const C = (lang: PhraseLang | null, emergency: EmergencyProfile | null): CountryInfo => ({ lang, emergency });

/** Keys are lower-case names (de/en) and ISO codes. */
const COUNTRIES: Record<string, CountryInfo> = {
  thailand: C('th', 'th'), th: C('th', 'th'),
  spanien: C('es', 'eu'), spain: C('es', 'eu'), españa: C('es', 'eu'), es: C('es', 'eu'), mallorca: C('es', 'eu'), 'kanarische inseln': C('es', 'eu'), teneriffa: C('es', 'eu'),
  mexiko: C('es', null), mexico: C('es', null), mx: C('es', null), argentinien: C('es', null), argentina: C('es', null), kolumbien: C('es', null), colombia: C('es', null), peru: C('es', null), chile: C('es', null), 'costa rica': C('es', null), kuba: C('es', null), cuba: C('es', null),
  italien: C('it', 'eu'), italy: C('it', 'eu'), italia: C('it', 'eu'), it: C('it', 'eu'), sizilien: C('it', 'eu'), sardinien: C('it', 'eu'),
  frankreich: C('fr', 'eu'), france: C('fr', 'eu'), fr: C('fr', 'eu'), korsika: C('fr', 'eu'),
  portugal: C('pt', 'eu'), pt: C('pt', 'eu'), madeira: C('pt', 'eu'), azoren: C('pt', 'eu'), brasilien: C('pt', null), brazil: C('pt', null), br: C('pt', null),
  griechenland: C('el', 'eu'), greece: C('el', 'eu'), gr: C('el', 'eu'), kreta: C('el', 'eu'), zypern: C('el', 'eu'), cyprus: C('el', 'eu'),
  türkei: C('tr', 'tr'), tuerkei: C('tr', 'tr'), turkey: C('tr', 'tr'), türkiye: C('tr', 'tr'), tr: C('tr', 'tr'),
  kroatien: C('hr', 'eu'), croatia: C('hr', 'eu'), hr: C('hr', 'eu'),
  // EU countries without a phrasebook yet: emergency 112 still applies
  österreich: C(null, 'eu'), oesterreich: C(null, 'eu'), austria: C(null, 'eu'), at: C(null, 'eu'),
  niederlande: C(null, 'eu'), netherlands: C(null, 'eu'), belgien: C(null, 'eu'), belgium: C(null, 'eu'), dänemark: C(null, 'eu'), denmark: C(null, 'eu'),
  schweden: C(null, 'eu'), sweden: C(null, 'eu'), finnland: C(null, 'eu'), finland: C(null, 'eu'), polen: C(null, 'eu'), poland: C(null, 'eu'),
  tschechien: C(null, 'eu'), czechia: C(null, 'eu'), irland: C(null, 'eu'), ireland: C(null, 'eu'), malta: C(null, 'eu'), slowenien: C(null, 'eu'), slovenia: C(null, 'eu'),
  ungarn: C(null, 'eu'), hungary: C(null, 'eu'), luxemburg: C(null, 'eu'), luxembourg: C(null, 'eu'), estland: C(null, 'eu'), lettland: C(null, 'eu'), litauen: C(null, 'eu'),
  slowakei: C(null, 'eu'), rumänien: C(null, 'eu'), bulgarien: C(null, 'eu'), norwegen: C(null, 'eu'), norway: C(null, 'eu'), schweiz: C(null, 'eu'), switzerland: C(null, 'eu'), island: C(null, 'eu'), iceland: C(null, 'eu'),
  deutschland: C(null, 'eu'), germany: C(null, 'eu'), de: C(null, 'eu'),
};

export function countryInfo(country: string | null | undefined): CountryInfo {
  if (!country) return C(null, null);
  const k = country.trim().toLowerCase();
  return COUNTRIES[k] ?? C(null, null);
}
