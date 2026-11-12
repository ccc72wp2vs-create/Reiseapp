/**
 * Seed datasets as plain data (pure, unit-tested in tests/unit/seed.test.ts).
 *
 * 1. THAILAND_2026 – the user's real trip. Contains ONLY the information the
 *    user provided. Unknown values (airlines, flight numbers, times, airports,
 *    accommodation names, number of persons) are left empty and flagged for
 *    clarification instead of being invented. Booking costs are stored on the
 *    bookings – they are NOT turned into wallet expenses.
 * 2. DEMO_TRIP – optional, clearly labelled demo data for trying the app.
 */
import type { ActivityCategory, BookingStatus, BookingType, CostKind, ExpenseCategory, PaymentStatus } from '../../shared/constants';

export interface SeedDestination {
  key: string;
  name: string;
  country: string;
  arrivalDate: string;
  departureDate: string;
  timezone: string;
  lat: number;
  lng: number;
  accommodationName: string | null;
  accommodationNotes: string | null;
  notes: string | null;
}

export interface SeedBooking {
  ref: string;
  title: string;
  type: BookingType;
  provider?: string | null;
  startDate: string | null;
  startTime: string | null;
  startTimezone: string | null;
  endDate: string | null;
  endTime: string | null;
  endTimezone: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  location?: string | null;
  /** Destination key the booking belongs to (accommodation). */
  destination?: string | null;
  /** Transport legs: null = trip origin (home). */
  from?: string | null;
  to?: string | null;
  priceMinor: number | null;
  currency: string | null;
  personsCount: number | null;
  unitPriceMinor?: number | null;
  unitPriceNote?: string | null;
  costKind: CostKind;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  clarificationNote: string | null;
  notes: string | null;
}

export interface SeedActivity {
  title: string;
  category: ActivityCategory;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  locationName?: string | null;
  lat?: number | null;
  lng?: number | null;
  description?: string | null;
  estCostMinor?: number | null;
  currency?: string | null;
  bookingStatus?: BookingStatus;
  place?: string;
}

export interface SeedPlace {
  key: string;
  name: string;
  category: ActivityCategory;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  destination?: string;
  favorite?: boolean;
}

export interface SeedExpense {
  title: string;
  amountMinor: number;
  currency: string;
  date: string;
  category: ExpenseCategory;
  /** Traveler index (0 = owner). */
  paidBy: number;
  participants: number[];
  notes?: string | null;
}

export interface SeedTrip {
  importKey: string;
  isDemo: boolean;
  trip: {
    name: string;
    destinationCountry: string;
    startDate: string;
    endDate: string;
    baseCurrency: string;
    localCurrency: string;
    description: string;
    status: 'planning' | 'confirmed' | 'completed';
    originName: string;
    originLat: number;
    originLng: number;
    homeTimezone: string;
  };
  /** Additional travelers besides the owner. */
  travelers: string[];
  destinations: SeedDestination[];
  bookings: SeedBooking[];
  activities: SeedActivity[];
  places: SeedPlace[];
  expenses: SeedExpense[];
  exchangeRates: { currency: string; rate: string; effectiveDate: string }[];
}

const BKK = 'Asia/Bangkok';
const BER = 'Europe/Berlin';
const COORD_NOTE = 'Koordinaten: ungefähres Stadtzentrum';

// ---------------------------------------------------------------------------
// Thailand 2026 – real trip
// ---------------------------------------------------------------------------

export const THAILAND_2026: SeedTrip = {
  importKey: 'thailand-2026',
  isDemo: false,
  trip: {
    name: 'Thailand 2026',
    destinationCountry: 'Thailand',
    startDate: '2026-11-06',
    endDate: '2026-11-26',
    baseCurrency: 'EUR',
    localCurrency: 'THB',
    description: 'Rundreise Bangkok · Phuket · Koh Lanta · Krabi · Chiang Mai · Bangkok mit 4 Reisenden.',
    status: 'confirmed',
    originName: 'Düsseldorf',
    originLat: 51.2277,
    originLng: 6.7735,
    homeTimezone: BER,
  },
  travelers: ['Reisende:r 2', 'Reisende:r 3', 'Reisende:r 4'],
  destinations: [
    {
      key: 'bkk1',
      name: 'Bangkok',
      country: 'Thailand',
      arrivalDate: '2026-11-07',
      departureDate: '2026-11-09',
      timezone: BKK,
      lat: 13.7563,
      lng: 100.5018,
      accommodationName: null,
      accommodationNotes: 'Unterkunft gebucht – Name noch nicht hinterlegt.',
      notes: `Ankunft am Flughafen Bangkok Suvarnabhumi (BKK) um 12:55 Uhr Ortszeit. ${COORD_NOTE}.`,
    },
    {
      key: 'hkt',
      name: 'Phuket',
      country: 'Thailand',
      arrivalDate: '2026-11-09',
      departureDate: '2026-11-13',
      timezone: BKK,
      lat: 7.8804,
      lng: 98.3923,
      accommodationName: null,
      accommodationNotes: 'Unterkunft gebucht – Name noch nicht hinterlegt.',
      notes: `${COORD_NOTE}.`,
    },
    {
      key: 'lanta',
      name: 'Koh Lanta',
      country: 'Thailand',
      arrivalDate: '2026-11-13',
      departureDate: '2026-11-18',
      timezone: BKK,
      lat: 7.6,
      lng: 99.05,
      accommodationName: null,
      accommodationNotes: 'Unterkunft gebucht – Name noch nicht hinterlegt.',
      notes: `${COORD_NOTE} der Insel.`,
    },
    {
      key: 'kbv',
      name: 'Krabi',
      country: 'Thailand',
      arrivalDate: '2026-11-18',
      departureDate: '2026-11-21',
      timezone: BKK,
      lat: 8.0863,
      lng: 98.9063,
      accommodationName: null,
      accommodationNotes: 'Unterkunft gebucht – Name noch nicht hinterlegt.',
      notes: `${COORD_NOTE}.`,
    },
    {
      key: 'cnx',
      name: 'Chiang Mai',
      country: 'Thailand',
      arrivalDate: '2026-11-21',
      departureDate: '2026-11-25',
      timezone: BKK,
      lat: 18.7883,
      lng: 98.9853,
      accommodationName: null,
      accommodationNotes: 'Unterkunft gebucht – Name noch nicht hinterlegt.',
      notes: `${COORD_NOTE}.`,
    },
    {
      key: 'bkk2',
      name: 'Bangkok (Don Mueang)',
      country: 'Thailand',
      arrivalDate: '2026-11-25',
      departureDate: '2026-11-26',
      timezone: BKK,
      lat: 13.9126,
      lng: 100.6067,
      accommodationName: null,
      accommodationNotes: 'Unterkunft im Bereich Bangkok Don Mueang (DMK) gebucht – Name noch nicht hinterlegt.',
      notes: 'Koordinaten: Bereich Flughafen Don Mueang (ungefähr).',
    },
  ],
  bookings: [
    {
      ref: 'flight-out',
      title: 'Hinflug Düsseldorf → Bangkok',
      type: 'flight',
      startDate: '2026-11-06',
      startTime: null,
      startTimezone: BER,
      endDate: '2026-11-07',
      endTime: '12:55',
      endTimezone: BKK,
      fromLocation: 'Düsseldorf',
      toLocation: 'Bangkok Suvarnabhumi (BKK)',
      from: null,
      to: 'bkk1',
      priceMinor: null,
      currency: null,
      personsCount: null,
      costKind: 'actual',
      bookingStatus: 'planned',
      paymentStatus: 'unknown',
      clarificationNote:
        'Buchungsstatus, Fluggesellschaft, Flugnummer, Abflugzeit und Preis noch nicht hinterlegt.',
      notes: 'Ankunft BKK 12:55 Uhr Ortszeit.',
    },
    {
      ref: 'hotel-bkk1',
      title: 'Unterkunft Bangkok',
      type: 'hotel',
      startDate: '2026-11-07',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-09',
      endTime: null,
      endTimezone: BKK,
      fromLocation: null,
      toLocation: null,
      location: 'Bangkok',
      destination: 'bkk1',
      priceMinor: 7500,
      currency: 'EUR',
      personsCount: 2,
      costKind: 'actual',
      bookingStatus: 'booked',
      paymentStatus: 'unknown',
      clarificationNote: null,
      notes: '2 Übernachtungen. Unterkunftsname noch unbekannt. Kosten gelten für 2 Personen.',
    },
    {
      ref: 'flight-dmk-hkt',
      title: 'Flug Bangkok (DMK) → Phuket',
      type: 'flight',
      startDate: '2026-11-09',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-09',
      endTime: null,
      endTimezone: BKK,
      fromLocation: 'Bangkok Don Mueang (DMK)',
      toLocation: 'Phuket',
      from: 'bkk1',
      to: 'hkt',
      priceMinor: 13700,
      currency: 'EUR',
      personsCount: 2,
      costKind: 'actual',
      bookingStatus: 'booked',
      paymentStatus: 'unknown',
      clarificationNote: null,
      notes: 'Uhrzeit noch nicht hinterlegt. Kosten gelten für 2 Personen.',
    },
    {
      ref: 'hotel-hkt',
      title: 'Unterkunft Phuket',
      type: 'hotel',
      startDate: '2026-11-09',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-13',
      endTime: null,
      endTimezone: BKK,
      fromLocation: null,
      toLocation: null,
      location: 'Phuket',
      destination: 'hkt',
      priceMinor: 46900,
      currency: 'EUR',
      personsCount: null,
      costKind: 'actual',
      bookingStatus: 'booked',
      paymentStatus: 'unknown',
      clarificationNote: null,
      notes: '4 Übernachtungen. Kosten: 469 EUR insgesamt.',
    },
    {
      ref: 'transfer-hkt-lanta',
      title: 'Transfer Phuket → Koh Lanta',
      type: 'ferry',
      startDate: '2026-11-13',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-13',
      endTime: null,
      endTimezone: BKK,
      fromLocation: 'Phuket',
      toLocation: 'Koh Lanta',
      from: 'hkt',
      to: 'lanta',
      priceMinor: 8000,
      currency: 'EUR',
      personsCount: null,
      costKind: 'estimate',
      bookingStatus: 'unconfirmed',
      paymentStatus: 'unpaid',
      clarificationNote: 'Fähre oder Speedboat – Transportmittel und Buchung noch offen.',
      notes: 'Geplante Kosten 80 EUR (Schätzung, noch nicht bezahlt).',
    },
    {
      ref: 'hotel-lanta',
      title: 'Unterkunft Koh Lanta',
      type: 'hotel',
      startDate: '2026-11-13',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-18',
      endTime: null,
      endTimezone: BKK,
      fromLocation: null,
      toLocation: null,
      location: 'Koh Lanta',
      destination: 'lanta',
      priceMinor: 46400,
      currency: 'EUR',
      personsCount: null,
      costKind: 'actual',
      bookingStatus: 'booked',
      paymentStatus: 'unknown',
      clarificationNote: null,
      notes: '5 Übernachtungen. Kosten: 464 EUR insgesamt.',
    },
    {
      ref: 'transfer-lanta-kbv',
      title: 'Speedboat Koh Lanta → Krabi',
      type: 'ferry',
      startDate: '2026-11-18',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-18',
      endTime: null,
      endTimezone: BKK,
      fromLocation: 'Koh Lanta',
      toLocation: 'Krabi',
      from: 'lanta',
      to: 'kbv',
      priceMinor: 6000,
      currency: 'EUR',
      personsCount: null,
      costKind: 'budget_cap',
      bookingStatus: 'unconfirmed',
      paymentStatus: 'unpaid',
      clarificationNote: 'Speedboat noch nicht bestätigt.',
      notes: 'Budgetobergrenze: maximal 60 EUR (noch nicht bezahlt).',
    },
    {
      ref: 'hotel-kbv',
      title: 'Unterkunft Krabi',
      type: 'hotel',
      startDate: '2026-11-18',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-21',
      endTime: null,
      endTimezone: BKK,
      fromLocation: null,
      toLocation: null,
      location: 'Krabi',
      destination: 'kbv',
      priceMinor: 26000,
      currency: 'EUR',
      personsCount: null,
      costKind: 'actual',
      bookingStatus: 'booked',
      paymentStatus: 'unknown',
      clarificationNote: null,
      notes: '3 Übernachtungen. Kosten: 260 EUR insgesamt.',
    },
    {
      ref: 'flight-kbv-cnx',
      title: 'Flug Krabi → Chiang Mai',
      type: 'flight',
      startDate: '2026-11-21',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-21',
      endTime: null,
      endTimezone: BKK,
      fromLocation: 'Krabi',
      toLocation: 'Chiang Mai',
      from: 'kbv',
      to: 'cnx',
      priceMinor: 31000,
      currency: 'EUR',
      personsCount: null,
      costKind: 'actual',
      bookingStatus: 'booked',
      paymentStatus: 'unknown',
      clarificationNote: 'Genauer Abflughafen und Uhrzeit noch nicht hinterlegt.',
      notes: 'Kosten: 310 EUR insgesamt.',
    },
    {
      ref: 'hotel-cnx',
      title: 'Unterkunft Chiang Mai',
      type: 'hotel',
      startDate: '2026-11-21',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-25',
      endTime: null,
      endTimezone: BKK,
      fromLocation: null,
      toLocation: null,
      location: 'Chiang Mai',
      destination: 'cnx',
      priceMinor: 29600,
      currency: 'EUR',
      personsCount: null,
      costKind: 'actual',
      bookingStatus: 'booked',
      paymentStatus: 'unknown',
      clarificationNote: null,
      notes: '4 Übernachtungen. Kosten: 296 EUR insgesamt.',
    },
    {
      ref: 'flight-cnx-bkk',
      title: 'Flug Chiang Mai → Bangkok',
      type: 'flight',
      startDate: '2026-11-25',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-25',
      endTime: null,
      endTimezone: BKK,
      fromLocation: 'Chiang Mai',
      toLocation: 'Bangkok',
      from: 'cnx',
      to: 'bkk2',
      priceMinor: 36000,
      currency: 'EUR',
      personsCount: null,
      unitPriceMinor: 18000,
      unitPriceNote: 'Ursprüngliche Einzelpreisangabe',
      costKind: 'actual',
      bookingStatus: 'booked',
      paymentStatus: 'unknown',
      clarificationNote:
        'Kostenangabe „180 EUR / 360 EUR insgesamt“ – Personenbezug des Einzelpreises noch nicht endgültig bestätigt. Flughäfen und Uhrzeiten noch nicht hinterlegt.',
      notes: '360 EUR als angegebene Gesamtkosten gespeichert.',
    },
    {
      ref: 'hotel-bkk2',
      title: 'Unterkunft Bangkok (Don Mueang)',
      type: 'hotel',
      startDate: '2026-11-25',
      startTime: null,
      startTimezone: BKK,
      endDate: '2026-11-26',
      endTime: null,
      endTimezone: BKK,
      fromLocation: null,
      toLocation: null,
      location: 'Bereich Bangkok Don Mueang (DMK)',
      destination: 'bkk2',
      priceMinor: 4000,
      currency: 'EUR',
      personsCount: null,
      costKind: 'actual',
      bookingStatus: 'booked',
      paymentStatus: 'unknown',
      clarificationNote: null,
      notes: '1 Übernachtung. Kosten: 40 EUR insgesamt.',
    },
    {
      ref: 'flight-home',
      title: 'Rückflug Bangkok → Düsseldorf',
      type: 'flight',
      startDate: '2026-11-26',
      startTime: '09:30',
      startTimezone: BKK,
      endDate: '2026-11-26',
      endTime: '18:55',
      endTimezone: BER,
      fromLocation: 'Bangkok (Abflughafen noch nicht bestätigt)',
      toLocation: 'Düsseldorf',
      from: 'bkk2',
      to: null,
      priceMinor: 142000,
      currency: 'EUR',
      personsCount: null,
      costKind: 'actual',
      bookingStatus: 'booked',
      paymentStatus: 'unknown',
      clarificationNote: 'Abflughafen in Bangkok noch nicht bestätigt (nicht automatisch DMK).',
      notes: 'Kosten: 1.420 EUR insgesamt.',
    },
  ],
  activities: [],
  places: [],
  expenses: [],
  exchangeRates: [],
};

// ---------------------------------------------------------------------------
// Demo trip – clearly labelled sample data
// ---------------------------------------------------------------------------

const DEMO = 'Demo-Daten – keine echte Reservierung.';

export const DEMO_TRIP: SeedTrip = {
  importKey: 'demo-thailand',
  isDemo: true,
  trip: {
    name: 'DEMO · Thailand-Rundreise',
    destinationCountry: 'Thailand',
    startDate: '2026-11-06',
    endDate: '2026-11-26',
    baseCurrency: 'EUR',
    localCurrency: 'THB',
    description: 'Beispielreise zum Ausprobieren. Alle Einträge sind Demo-Daten und keine echten Buchungen.',
    status: 'planning',
    originName: 'Düsseldorf',
    originLat: 51.2277,
    originLng: 6.7735,
    homeTimezone: BER,
  },
  travelers: ['Demo-Anna', 'Demo-Ben', 'Demo-Clara'],
  destinations: [
    { key: 'bkk', name: 'Bangkok', country: 'Thailand', arrivalDate: '2026-11-07', departureDate: '2026-11-10', timezone: BKK, lat: 13.7563, lng: 100.5018, accommodationName: 'Demo-Hotel am Fluss', accommodationNotes: DEMO, notes: null },
    { key: 'hkt', name: 'Phuket', country: 'Thailand', arrivalDate: '2026-11-10', departureDate: '2026-11-14', timezone: BKK, lat: 7.8804, lng: 98.3923, accommodationName: 'Demo-Strandresort', accommodationNotes: DEMO, notes: null },
    { key: 'lanta', name: 'Koh Lanta', country: 'Thailand', arrivalDate: '2026-11-14', departureDate: '2026-11-19', timezone: BKK, lat: 7.6, lng: 99.05, accommodationName: 'Demo-Bungalows', accommodationNotes: DEMO, notes: null },
    { key: 'cnx', name: 'Chiang Mai', country: 'Thailand', arrivalDate: '2026-11-19', departureDate: '2026-11-24', timezone: BKK, lat: 18.7883, lng: 98.9853, accommodationName: 'Demo-Guesthouse', accommodationNotes: DEMO, notes: null },
    { key: 'bkk2', name: 'Bangkok', country: 'Thailand', arrivalDate: '2026-11-24', departureDate: '2026-11-26', timezone: BKK, lat: 13.7563, lng: 100.5018, accommodationName: 'Demo-Stadthotel', accommodationNotes: DEMO, notes: null },
  ],
  bookings: [
    { ref: 'd-flight', title: 'DEMO · Flug Bangkok → Phuket', type: 'flight', provider: 'Demo-Airline', startDate: '2026-11-10', startTime: '10:15', startTimezone: BKK, endDate: '2026-11-10', endTime: '11:40', endTimezone: BKK, fromLocation: 'Bangkok', toLocation: 'Phuket', from: 'bkk', to: 'hkt', priceMinor: 420000, currency: 'THB', personsCount: 4, costKind: 'actual', bookingStatus: 'booked', paymentStatus: 'paid', clarificationNote: null, notes: DEMO },
    { ref: 'd-ferry', title: 'DEMO · Fähre Phuket → Koh Lanta', type: 'ferry', provider: 'Demo-Ferry', startDate: '2026-11-14', startTime: '08:30', startTimezone: BKK, endDate: '2026-11-14', endTime: '12:00', endTimezone: BKK, fromLocation: 'Phuket', toLocation: 'Koh Lanta', from: 'hkt', to: 'lanta', priceMinor: 360000, currency: 'THB', personsCount: 4, costKind: 'estimate', bookingStatus: 'unconfirmed', paymentStatus: 'unpaid', clarificationNote: null, notes: DEMO },
    { ref: 'd-hotel', title: 'DEMO · Demo-Strandresort', type: 'hotel', provider: 'Demo-Resort', startDate: '2026-11-10', startTime: '14:00', startTimezone: BKK, endDate: '2026-11-14', endTime: '11:00', endTimezone: BKK, fromLocation: null, toLocation: null, location: 'Phuket', destination: 'hkt', priceMinor: 1600000, currency: 'THB', personsCount: 4, costKind: 'actual', bookingStatus: 'booked', paymentStatus: 'partial', clarificationNote: null, notes: DEMO },
  ],
  places: [
    { key: 'p1', name: 'Demo · Tempel am Fluss', category: 'sightseeing', description: 'Beispielort zum Ausprobieren der Karte.', address: 'Bangkok', lat: 13.7437, lng: 100.4888, destination: 'bkk', favorite: true },
    { key: 'p2', name: 'Demo · Nachtmarkt', category: 'shopping', description: 'Beispielort.', address: 'Chiang Mai', lat: 18.7877, lng: 99.0007, destination: 'cnx' },
    { key: 'p3', name: 'Demo · Strand im Westen', category: 'beach', description: 'Beispielort.', address: 'Koh Lanta', lat: 7.65, lng: 99.03, destination: 'lanta', favorite: true },
  ],
  activities: [
    { title: 'Demo · Tempelbesuch', category: 'sightseeing', date: '2026-11-08', startTime: '09:00', endTime: '11:30', locationName: 'Demo · Tempel am Fluss', lat: 13.7437, lng: 100.4888, place: 'p1' },
    { title: 'Demo · Streetfood-Abend', category: 'restaurant', date: '2026-11-08', startTime: '19:00', endTime: '21:00', locationName: 'Bangkok', estCostMinor: 120000, currency: 'THB' },
    { title: 'Demo · Strandtag', category: 'beach', date: '2026-11-15', locationName: 'Demo · Strand im Westen', place: 'p3' },
    { title: 'Demo · Nachtmarkt', category: 'shopping', date: '2026-11-21', startTime: '18:00', locationName: 'Demo · Nachtmarkt', place: 'p2' },
  ],
  expenses: [
    { title: 'Demo · Abendessen', amountMinor: 184000, currency: 'THB', date: '2026-11-08', category: 'food', paidBy: 0, participants: [0, 1, 2, 3] },
    { title: 'Demo · Tuk-Tuk', amountMinor: 30000, currency: 'THB', date: '2026-11-08', category: 'transportation', paidBy: 1, participants: [0, 1, 2, 3] },
    { title: 'Demo · Tempeleintritt', amountMinor: 80000, currency: 'THB', date: '2026-11-08', category: 'activities', paidBy: 2, participants: [0, 1, 2, 3] },
    { title: 'Demo · Snacks', amountMinor: 25000, currency: 'THB', date: '2026-11-09', category: 'food', paidBy: 3, participants: [2, 3] },
  ],
  exchangeRates: [{ currency: 'THB', rate: '0.0262', effectiveDate: '2026-11-01' }],
};
