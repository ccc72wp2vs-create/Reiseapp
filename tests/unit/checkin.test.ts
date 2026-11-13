import { describe, expect, it } from 'vitest';
import { AIRLINES, airlineFor, checkinInfo, checkinReminders, flightsMissingTime, normalizeFlightNumber, zonedToUtc } from '../../shared/checkin';
import type { BookingDto } from '../../shared/types';

const BKK = 'Asia/Bangkok';
const flight = (o: Partial<BookingDto> = {}): BookingDto => ({
  id: 'f1', tripId: 't', version: 1, createdAt: '', updatedAt: '',
  title: 'Krabi → Chiang Mai', type: 'flight', provider: null, reference: null,
  startDate: '2026-11-21', startTime: '12:00', startTimezone: BKK, endDate: null, endTime: null, endTimezone: null,
  fromLocation: null, toLocation: null, location: null, destinationId: null, fromDestinationId: null, toDestinationId: null,
  priceMinor: null, currency: null, personsCount: null, unitPriceMinor: null, unitPriceNote: null,
  costKind: 'actual', bookingStatus: 'booked', paymentStatus: 'paid', paidByTravelerId: null,
  clarificationNote: null, notes: null, expenseId: null, travelerIds: [], createdBy: null,
  flightNumber: 'PG 123', checkinDoneAt: null, ...o,
});
const at = (iso: string) => Date.parse(iso);
// Departure 2026-11-21 12:00 Bangkok = 05:00 UTC

describe('check-in', () => {
  it('normalizes flight numbers', () => {
    expect(normalizeFlightNumber('pg123')).toBe('PG 123');
    expect(normalizeFlightNumber(' TG 9 ')).toBe('TG 9');
    expect(normalizeFlightNumber('FD3015A')).toBe('FD 3015A');
    expect(normalizeFlightNumber('Krabi')).toBeNull();
    expect(airlineFor('pg 271')?.name).toBe('Bangkok Airways');
    expect(airlineFor('XX 1')).toBeNull();
  });

  it('converts local departure time to UTC across zones', () => {
    expect(zonedToUtc('2026-11-21', '12:00', BKK)).toBe(at('2026-11-21T05:00:00Z'));
    expect(zonedToUtc('2026-11-06', '20:00', 'Europe/Berlin')).toBe(at('2026-11-06T19:00:00Z'));
    expect(zonedToUtc('2026-07-01', '20:00', 'Europe/Berlin')).toBe(at('2026-07-01T18:00:00Z'));
  });

  it('derives the state from the airline window', () => {
    const b = flight();
    expect(checkinInfo(b, at('2026-11-20T04:00:00Z'), BKK)?.state).toBe('upcoming');
    expect(checkinInfo(b, at('2026-11-20T05:00:00Z'), BKK)?.state).toBe('open');
    expect(checkinInfo(b, at('2026-11-21T02:30:00Z'), BKK)?.state).toBe('closing');
    expect(checkinInfo(b, at('2026-11-21T04:00:00Z'), BKK)?.state).toBe('closed');
    expect(checkinInfo(flight({ checkinDoneAt: '2026-11-20T06:00:00Z' }), at('2026-11-20T06:00:00Z'), BKK)?.state).toBe('done');
  });

  it('uses 48 h for Emirates and a conservative 24 h for unknown airlines', () => {
    const now = at('2026-11-19T06:00:00Z'); // 47 h before
    expect(checkinInfo(flight({ flightNumber: 'EK 384' }), now, BKK)?.state).toBe('open');
    expect(checkinInfo(flight({ flightNumber: null }), now, BKK)?.state).toBe('upcoming');
  });

  it('ignores non-flights, cancelled flights and flights without time', () => {
    expect(checkinInfo(flight({ type: 'ferry' }), 0, BKK)).toBeNull();
    expect(checkinInfo(flight({ bookingStatus: 'cancelled' }), 0, BKK)).toBeNull();
    expect(checkinInfo(flight({ startTime: null }), 0, BKK)).toBeNull();
  });

  it('lists only flights that need attention, soonest first', () => {
    const now = at('2026-11-20T10:00:00Z');
    const list = checkinReminders(
      [
        flight({ id: 'later', startDate: '2026-11-25' }),
        flight({ id: 'soon' }),
        flight({ id: 'done', checkinDoneAt: '2026-11-20T09:00:00Z' }),
        flight({ id: 'tomorrowish', startDate: '2026-11-22', startTime: '02:00' }), // opens in 12 h
      ],
      now,
      BKK,
    );
    expect(list.map((i) => i.booking.id)).toEqual(['soon', 'tomorrowish']);
  });

  it('only links to https pages of the airline itself', () => {
    for (const a of AIRLINES) {
      if (a.url) expect(a.url).toMatch(/^https:\/\/www\.[a-z]+\.com\//);
      if (!a.windowConfirmed) expect(a.url).toBeNull();
    }
  });

  it('asks for the departure time of flights today or tomorrow', () => {
    const list = flightsMissingTime(
      [
        flight({ id: 'tomorrow', startTime: null }),
        flight({ id: 'later', startTime: null, startDate: '2026-11-25' }),
        flight({ id: 'timed' }),
        flight({ id: 'done', startTime: null, checkinDoneAt: '2026-11-20T00:00:00Z' }),
      ],
      '2026-11-20',
    );
    expect(list.map((b) => b.id)).toEqual(['tomorrow']);
  });
});
