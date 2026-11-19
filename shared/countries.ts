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

/** ISO 3166-1 alpha-2 code for a trip's free-text country (German/English name or code). */
const ISO: Record<string, string> = {
  thailand: 'TH', spanien: 'ES', spain: 'ES', españa: 'ES', mallorca: 'ES', 'kanarische inseln': 'ES', teneriffa: 'ES',
  italien: 'IT', italy: 'IT', italia: 'IT', sizilien: 'IT', sardinien: 'IT', frankreich: 'FR', france: 'FR', korsika: 'FR',
  portugal: 'PT', madeira: 'PT', azoren: 'PT', griechenland: 'GR', greece: 'GR', kreta: 'GR', zypern: 'CY', cyprus: 'CY',
  türkei: 'TR', tuerkei: 'TR', turkey: 'TR', türkiye: 'TR', kroatien: 'HR', croatia: 'HR', österreich: 'AT', oesterreich: 'AT', austria: 'AT',
  schweiz: 'CH', switzerland: 'CH', niederlande: 'NL', netherlands: 'NL', belgien: 'BE', belgium: 'BE', dänemark: 'DK', denmark: 'DK',
  schweden: 'SE', sweden: 'SE', norwegen: 'NO', norway: 'NO', finnland: 'FI', finland: 'FI', island: 'IS', iceland: 'IS',
  irland: 'IE', ireland: 'IE', 'großbritannien': 'GB', grossbritannien: 'GB', england: 'GB', schottland: 'GB', uk: 'GB', 'vereinigtes königreich': 'GB', 'united kingdom': 'GB',
  polen: 'PL', poland: 'PL', tschechien: 'CZ', czechia: 'CZ', ungarn: 'HU', hungary: 'HU', malta: 'MT', slowenien: 'SI', slovenia: 'SI', montenegro: 'ME', albanien: 'AL', albania: 'AL',
  vietnam: 'VN', kambodscha: 'KH', cambodia: 'KH', laos: 'LA', malaysia: 'MY', singapur: 'SG', singapore: 'SG', indonesien: 'ID', indonesia: 'ID', bali: 'ID',
  philippinen: 'PH', philippines: 'PH', japan: 'JP', südkorea: 'KR', suedkorea: 'KR', 'south korea': 'KR', china: 'CN', indien: 'IN', india: 'IN', 'sri lanka': 'LK', malediven: 'MV', maldives: 'MV', nepal: 'NP',
  'vereinigte arabische emirate': 'AE', vae: 'AE', uae: 'AE', dubai: 'AE', oman: 'OM', jordanien: 'JO', jordan: 'JO', israel: 'IL',
  ägypten: 'EG', aegypten: 'EG', egypt: 'EG', marokko: 'MA', morocco: 'MA', tunesien: 'TN', tunisia: 'TN', südafrika: 'ZA', suedafrika: 'ZA', 'south africa': 'ZA',
  kenia: 'KE', kenya: 'KE', tansania: 'TZ', tanzania: 'TZ', sansibar: 'TZ', zanzibar: 'TZ', mauritius: 'MU', seychellen: 'SC', seychelles: 'SC', namibia: 'NA',
  usa: 'US', 'vereinigte staaten': 'US', 'united states': 'US', kanada: 'CA', canada: 'CA', mexiko: 'MX', mexico: 'MX', kuba: 'CU', cuba: 'CU',
  'dominikanische republik': 'DO', 'dominican republic': 'DO', 'costa rica': 'CR', brasilien: 'BR', brazil: 'BR', argentinien: 'AR', argentina: 'AR', peru: 'PE', chile: 'CL', kolumbien: 'CO', colombia: 'CO',
  australien: 'AU', australia: 'AU', neuseeland: 'NZ', 'new zealand': 'NZ', deutschland: 'DE', germany: 'DE',
};

export function countryIso(country: string | null | undefined): string | null {
  if (!country) return null;
  const k = country.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(k)) return k.toUpperCase();
  return ISO[k] ?? null;
}
