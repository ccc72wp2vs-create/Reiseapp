import { describe, expect, it } from 'vitest';
import { annotatePlan, cleanTime, detectIntents, distanceKm, resolveDate } from '../../shared/assistant';
import type { ActivityDto, BookingDto } from '../../shared/types';

describe('assistant: intents', () => {
  it.each([
    ['Wo sind wir morgen?', 'where'],
    ['Wann fliegen wir nach Chiang Mai?', 'flight'],
    ['Welches Hotel haben wir heute?', 'where'],
    ['Wann öffnet der Check-in für meinen nächsten Flug?', 'flight'],
    ['Wie viel haben wir bisher ausgegeben?', 'finance'],
    ['Wer schuldet wem noch Geld?', 'finance'],
    ['Welche Aktivitäten haben wir morgen geplant?', 'activities'],
    ['Welche Transfers haben wir noch nicht gebucht?', 'bookings'],
    ['Wo können wir in der Nähe gut essen?', 'places'],
    ['Plane uns morgen einen abwechslungsreichen Tag in Krabi', 'plan'],
    ['Füge morgen um 10 Uhr einen Strandbesuch hinzu.', 'action'],
    ['Erstelle eine Packliste für unseren nächsten Ortswechsel.', 'packing'],
  ])('%s → %s', (q, intent) => {
    expect(detectIntents(q)).toContain(intent);
  });

  it('adds places and the day plan to planning requests', () => {
    expect(detectIntents('Plane uns morgen einen Tag')).toEqual(expect.arrayContaining(['plan', 'places', 'activities', 'where']));
  });
});

describe('assistant: dates', () => {
  const today = '2026-11-20'; // Friday
  it('resolves relative dates, weekdays and German dates', () => {
    expect(resolveDate('Wo sind wir heute?', today)).toBe(today);
    expect(resolveDate('Was machen wir morgen?', today)).toBe('2026-11-21');
    expect(resolveDate('übermorgen', today)).toBe('2026-11-22');
    expect(resolveDate('am Dienstag', today)).toBe('2026-11-24');
    expect(resolveDate('am 25.11.', today)).toBe('2026-11-25');
    expect(resolveDate('morgens um 9', today)).toBeNull();
    expect(resolveDate('Wer schuldet wem?', today)).toBeNull();
  });
  it('normalizes times', () => {
    expect(cleanTime('9:05')).toBe('09:05');
    expect(cleanTime('18.30')).toBe('18:30');
    expect(cleanTime('25:00')).toBeNull();
    expect(cleanTime('abends')).toBeNull();
  });
});

describe('assistant: plan validation', () => {
  const act = (o: Partial<ActivityDto>): ActivityDto =>
    ({ id: 'a', tripId: 't', title: 'Kochkurs', description: null, category: 'other', date: '2026-11-21', startTime: '11:00', endTime: '13:00', locationName: null, lat: null, lng: null, estCostMinor: null, currency: null, bookingStatus: 'booked', completed: false, notes: null, placeId: null, sortOrder: 0, createdBy: null, updatedBy: null, version: 1, createdAt: '', updatedAt: '', ...o }) as ActivityDto;
  const item = (title: string, startTime: string, endTime: string | null = null, placeId: string | null = null) =>
    ({ title, startTime, endTime, category: 'other' as const, locationName: null, description: null, placeId, source: 'idea' as const });

  it('flags overlaps with booked entries, flights and among the proposal; detects duplicates', () => {
    const flight = { id: 'f', title: 'Flug Krabi → Chiang Mai', type: 'flight', startDate: '2026-11-21', startTime: '15:00', endDate: '2026-11-21', endTime: '16:55', bookingStatus: 'booked' } as BookingDto;
    const out = annotatePlan(
      [item('Frühstück', '09:00', '10:00'), item('Strand', '12:00', '14:00'), item('Kochkurs', '17:00'), item('Markt', '15:30'), item('Café', '09:30', '10:30'), item('Tempel', '18:00', null, 'p1')],
      '2026-11-21',
      [act({}), act({ id: 'b', title: 'Tempel', startTime: null, endTime: null, placeId: 'p1', bookingStatus: 'planned' })],
      [flight],
    );
    expect(out[0].conflict).toBeNull();
    expect(out[1].conflict).toMatch(/Kochkurs.*fest gebucht/);
    expect(out[2]).toMatchObject({ duplicate: true, conflict: null });
    expect(out[3].conflict).toMatch(/Flug Krabi/);
    expect(out[4].conflict).toMatch(/Frühstück/);
    expect(out[5].duplicate).toBe(true);
  });

  it('computes straight-line distance', () => {
    expect(distanceKm({ lat: 8.0863, lng: 98.9063 }, { lat: 8.011, lng: 98.837 })).toBeCloseTo(11.3, 0);
  });
});
