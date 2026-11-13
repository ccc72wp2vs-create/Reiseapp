import { describe, expect, it } from 'vitest';
import { countryInfo } from '../../shared/countries';

describe('countryInfo', () => {
  it('maps German and English names and ISO codes', () => {
    expect(countryInfo('Thailand')).toEqual({ lang: 'th', emergency: 'th' });
    expect(countryInfo(' Spanien ')).toEqual({ lang: 'es', emergency: 'eu' });
    expect(countryInfo('ES').lang).toBe('es');
    expect(countryInfo('Österreich')).toEqual({ lang: null, emergency: 'eu' });
    expect(countryInfo('Mexiko')).toEqual({ lang: 'es', emergency: null });
  });
  it('returns nothing for unknown or empty countries', () => {
    expect(countryInfo(null)).toEqual({ lang: null, emergency: null });
    expect(countryInfo('Atlantis')).toEqual({ lang: null, emergency: null });
  });
});
