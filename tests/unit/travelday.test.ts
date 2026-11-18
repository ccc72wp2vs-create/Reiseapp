import { describe, expect, it } from 'vitest';
import { travelDay } from '../../shared/travelday';
import type { BookingDto, DestinationDto } from '../../shared/types';

const trip = { originName: null, originLat: null, originLng: null, startDate: '2026-11-06', endDate: '2026-11-26' };
const dest = (id: string, name: string, arrivalDate: string, departureDate: string, sortOrder: number, accommodationName: string | null = null) =>
  ({ id, name, arrivalDate, departureDate, sortOrder, accommodationName }) as unknown as DestinationDto;
const bk = (o: Partial<BookingDto>) =>
  ({ bookingStatus: 'booked', costKind: 'actual', paymentStatus: 'paid', travelerIds: [], startTime: null, endTime: null, personsCount: 2, clarificationNote: null, unitPriceMinor: null, priceMinor: null, currency: null, destinationId: null, fromDestinationId: null, toDestinationId: null, ...o }) as BookingDto;

const destinations = [dest('lanta', 'Koh Lanta', '2026-11-14', '2026-11-18', 0), dest('krabi', 'Krabi', '2026-11-18', '2026-11-21', 1, 'Sugar Marina')];

describe('travelDay', () => {
  it('lists check-out, transport and check-in with open points', () => {
    const bookings = [
      bk({ id: 'h1', type: 'hotel', title: 'Southern Lanta Resort', destinationId: 'lanta', startDate: '2026-11-14', endTime: '12:00' }),
      bk({ id: 'f', type: 'ferry', title: 'Speedboat', startDate: '2026-11-18', bookingStatus: 'unconfirmed', fromDestinationId: 'lanta', toDestinationId: 'krabi' }),
    ];
    const d = travelDay(trip, destinations, bookings, '2026-11-18', '2026-11-19', null)!;
    expect(d.inDays).toBe(0);
    expect(d.checkout.map((b) => b.id)).toEqual(['h1']);
    expect(d.leg.booking?.id).toBe('f');
    expect(d.issues.map((i) => i.kind)).toEqual(['transport_unconfirmed', 'transport_time_missing']);
  });

  it('warns a day ahead and is quiet on normal days', () => {
    expect(travelDay(trip, destinations, [], '2026-11-17', '2026-11-18', null)).toMatchObject({ inDays: 1, issues: [{ kind: 'transport_missing' }] });
    expect(travelDay(trip, destinations, [], '2026-11-15', '2026-11-16', null)).toBeNull();
  });
});
