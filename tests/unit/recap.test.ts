import { describe, expect, it } from 'vitest';
import { buildRecap, haversineKm } from '../../shared/recap';

describe('recap', () => {
  it('computes great-circle distances', () => {
    // Düsseldorf → Bangkok ≈ 8,900 km
    const km = haversineKm([51.29, 6.77], [13.69, 100.75]);
    expect(km).toBeGreaterThan(8800);
    expect(km).toBeLessThan(9100);
  });

  it('summarises days, costs and the favourite places', () => {
    const r = buildRecap(
      {
        trip: { startDate: '2026-11-06', endDate: '2026-11-26', originName: 'DUS', originLat: 51.29, originLng: 6.77 } as never,
        destinations: [{ id: 'bkk', name: 'Bangkok', arrivalDate: '2026-11-07', departureDate: '2026-11-09', lat: 13.75, lng: 100.5, sortOrder: 1 }] as never,
        bookings: [],
        activities: [{ completed: true }, { completed: false }] as never,
        places: [
          { id: 'a', name: 'A', favorite: false, votes: ['x'] },
          { id: 'b', name: 'B', favorite: true, votes: ['x', 'y'] },
          { id: 'c', name: 'C', favorite: false, votes: [] },
        ] as never,
        expenses: [{ baseAmountMinor: 1000, shares: [{ travelerId: 'x', baseShareMinor: 600 }, { travelerId: 'y', baseShareMinor: 400 }] }] as never,
        travelers: [{ id: 'x' }, { id: 'y' }] as never,
      },
      '2026-11-12',
    );
    expect(r).toMatchObject({ days: 7, totalDays: 21, finished: false, stops: 1, activitiesDone: 1, placesSaved: 3, totalMinor: 1000 });
    expect(r.distanceKm).toBeGreaterThan(17000); // there and back
    expect(r.costPerTraveler).toEqual([{ travelerId: 'x', amountMinor: 600 }, { travelerId: 'y', amountMinor: 400 }]);
    expect(r.topPlaces.map((p) => p.id)).toEqual(['b', 'a']);
  });
});
