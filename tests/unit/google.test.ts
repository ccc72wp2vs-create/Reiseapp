import { describe, expect, it } from 'vitest';
import { formatDistance, formatDuration, googleDirectionsUrl, parseSearchRequest } from '../../shared/google';

describe('google: request parsing (no model, no Google content)', () => {
  it('extracts category, travel time, mode and count', () => {
    expect(parseSearchRequest('Welche Restaurants erreiche ich in maximal 20 Minuten?')).toEqual({ category: 'restaurant', query: null, maxMinutes: 20, mode: 'DRIVE', limit: 6 });
    expect(parseSearchRequest('Zeige mir schöne Strände innerhalb von 30 Minuten Fahrt.')).toMatchObject({ category: 'beach', maxMinutes: 30 });
    expect(parseSearchRequest('Finde fünf gute Restaurants in unserer Nähe.')).toMatchObject({ category: 'restaurant', limit: 5, maxMinutes: null });
    expect(parseSearchRequest('Welche Tempel kann man zu Fuß in 15 Minuten erreichen?')).toMatchObject({ category: 'temple', mode: 'WALK', maxMinutes: 15 });
    expect(parseSearchRequest('Welche Sehenswürdigkeiten können wir heute besuchen?')).toMatchObject({ category: 'sights' });
  });
  it('ignores questions that are no place search', () => {
    expect(parseSearchRequest('Wer schuldet wem noch Geld?')).toBeNull();
    expect(parseSearchRequest('Wann geht unser Flug?')).toBeNull();
  });
  it('formats durations/distances and builds a Google Maps route link', () => {
    expect(formatDuration(754)).toBe('13 Min.');
    expect(formatDuration(5400)).toBe('1 Std. 30 Min.');
    expect(formatDistance(6100)).toBe('6,1 km');
    expect(formatDistance(450)).toBe('450 m');
    expect(googleDirectionsUrl({ lat: 8.1, lng: 98.9 }, 'ChIJabc1234567', 'WALK', 'Restaurant')).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=8.1,98.9&destination=Restaurant&destination_place_id=ChIJabc1234567&travelmode=walking',
    );
  });
});
