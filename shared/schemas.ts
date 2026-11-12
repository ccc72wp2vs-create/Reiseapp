/**
 * Runtime validation schemas (zod) for every API input.
 * Shared so that the frontend can pre-validate with identical rules.
 */
import { z } from 'zod';
import {
  ACTIVITY_CATEGORIES,
  BOOKING_STATUSES,
  BOOKING_TYPES,
  COST_KINDS,
  EXPENSE_CATEGORIES,
  PACKING_CATEGORIES,
  PACKING_VISIBILITIES,
  PAYMENT_STATUSES,
  PLACE_CATEGORIES,
  ROLES,
  SPLIT_METHODS,
  TRIP_STATUSES,
} from './constants';
import { isSupportedCurrency, normalizeRate } from './money';

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const id = z.string().uuid();
export const dateStr = z.string().regex(DATE_RE).refine(isRealDate, 'Ungültiges Datum');
export const timeStr = z.string().regex(TIME_RE);
export const timeZone = z.string().max(64).refine(isValidTimeZone, 'Ungültige Zeitzone');
export const currency = z
  .string()
  .length(3)
  .transform((s) => s.toUpperCase())
  .refine(isSupportedCurrency, 'Nicht unterstützte Währung');

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Optional, nullable trimmed text. Empty strings become null. */
export const optText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable()).optional();
export const reqText = (max: number) => z.string().trim().min(1).max(max);

export const optUrl = z
  .preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(2000)
      .url()
      .refine((u) => /^https:\/\//i.test(u), 'Nur https-Links erlaubt')
      .nullable(),
  )
  .optional();

export const lat = z.number().min(-90).max(90).nullable().optional();
export const lng = z.number().min(-180).max(180).nullable().optional();
export const minor = z.number().int().min(0).max(1e13);
export const optMinor = minor.nullable().optional();
export const optDate = z.preprocess(emptyToNull, dateStr.nullable()).optional();
export const optTime = z.preprocess(emptyToNull, timeStr.nullable()).optional();
export const optTimeZone = z.preprocess(emptyToNull, timeZone.nullable()).optional();
export const optCurrency = z.preprocess(emptyToNull, currency.nullable()).optional();
export const rateStr = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const n = normalizeRate(s);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Ungültiger Kurs' });
      return z.NEVER;
    }
    return n;
  });

export const version = z.number().int().min(1);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(10, 'Mindestens 10 Zeichen').max(200);
export const displayName = reqText(80);

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
export const setupSchema = z.object({
  setupToken: z.string().min(16).max(200),
  email,
  displayName,
  password,
});
export const acceptInviteSchema = z.object({
  account: z.object({ email, displayName, password }).optional(),
});
export const updateMeSchema = z.object({
  displayName: displayName.optional(),
  currentPassword: z.string().max(200).optional(),
  newPassword: password.optional(),
});
export const deleteMeSchema = z.object({ password: z.string().min(1).max(200) });

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

const tripFields = {
  name: reqText(120),
  destinationCountry: optText(80),
  startDate: dateStr,
  endDate: dateStr,
  coverImageUrl: optUrl,
  baseCurrency: currency,
  localCurrency: optCurrency,
  description: optText(2000),
  status: z.enum(TRIP_STATUSES),
  originName: optText(120),
  originLat: lat,
  originLng: lng,
  homeTimezone: timeZone,
  dailyBudgetMinor: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  emergencyNotes: optText(4000),
};

export const tripCreateSchema = z
  .object({ ...tripFields, status: tripFields.status.default('planning'), homeTimezone: timeZone.default('Europe/Berlin') })
  .refine((t) => t.endDate >= t.startDate, { message: 'Enddatum vor Startdatum', path: ['endDate'] });
export const tripUpdateSchema = z
  .object({ ...tripFields, version })
  .partial()
  .required({ version: true });

export const memberUpdateSchema = z.object({ role: z.enum(ROLES) });

export const travelerCreateSchema = z.object({
  name: reqText(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  userId: id.nullable().optional(),
  /** PayPal.me user name (without the URL). */
  paypalMe: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '').replace(/\/.*$/, '') || null : v),
    z.string().regex(/^[A-Za-z0-9._-]{1,40}$/, 'Ungültiger PayPal.me-Name').nullable(),
  ).optional(),
  iban: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\s+/g, '').toUpperCase() || null : v),
    z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/, 'Ungültige IBAN').nullable(),
  ).optional(),
});
export const travelerUpdateSchema = travelerCreateSchema.partial().extend({ version });

export const invitationCreateSchema = z.object({
  role: z.enum(['editor', 'viewer', 'owner']).default('editor'),
  travelerId: id.nullable().optional(),
  email: z.preprocess(emptyToNull, email.nullable()).optional(),
  expiresInHours: z.number().int().min(1).max(24 * 14).default(72),
});

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

const destinationFields = {
  name: reqText(120),
  country: optText(80),
  arrivalDate: dateStr,
  departureDate: dateStr,
  timezone: timeZone,
  accommodationName: optText(200),
  accommodationAddress: optText(300),
  accommodationNotes: optText(2000),
  lat,
  lng,
  notes: optText(4000),
  coverImageUrl: optUrl,
};
export const destinationCreateSchema = z
  .object({ ...destinationFields, id: id.optional() })
  .refine((d) => d.departureDate >= d.arrivalDate, {
    message: 'Abreise vor Ankunft',
    path: ['departureDate'],
  });
export const destinationUpdateSchema = z.object(destinationFields).partial().extend({ version });

export const reorderSchema = z.object({ orderedIds: z.array(id).min(1).max(500) });

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

const activityFields = {
  title: reqText(160),
  description: optText(4000),
  category: z.enum(ACTIVITY_CATEGORIES),
  date: dateStr,
  startTime: optTime,
  endTime: optTime,
  locationName: optText(300),
  lat,
  lng,
  estCostMinor: optMinor,
  currency: optCurrency,
  bookingStatus: z.enum(BOOKING_STATUSES),
  completed: z.boolean(),
  notes: optText(4000),
  placeId: id.nullable().optional(),
};
export const activityCreateSchema = z.object({
  ...activityFields,
  id: id.optional(),
  category: activityFields.category.default('other'),
  bookingStatus: activityFields.bookingStatus.default('planned'),
  completed: activityFields.completed.default(false),
});
export const activityUpdateSchema = z
  .object(activityFields)
  .partial()
  .extend({ version });
export const activityReorderSchema = z.object({ date: dateStr, orderedIds: z.array(id).min(1).max(500) });

// ---------------------------------------------------------------------------
// Saved places
// ---------------------------------------------------------------------------

const placeFields = {
  name: reqText(160),
  category: z.enum(PLACE_CATEGORIES),
  description: optText(4000),
  address: optText(300),
  lat,
  lng,
  externalUrl: optUrl,
  notes: optText(4000),
  favorite: z.boolean(),
  destinationId: id.nullable().optional(),
};
export const placeCreateSchema = z.object({
  ...placeFields,
  id: id.optional(),
  category: placeFields.category.default('other'),
  favorite: placeFields.favorite.default(false),
});
export const placeUpdateSchema = z.object(placeFields).partial().extend({ version });

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

const bookingFields = {
  title: reqText(160),
  type: z.enum(BOOKING_TYPES),
  provider: optText(120),
  reference: optText(80),
  startDate: optDate,
  startTime: optTime,
  startTimezone: optTimeZone,
  endDate: optDate,
  endTime: optTime,
  endTimezone: optTimeZone,
  fromLocation: optText(160),
  toLocation: optText(160),
  location: optText(300),
  destinationId: id.nullable().optional(),
  fromDestinationId: id.nullable().optional(),
  toDestinationId: id.nullable().optional(),
  priceMinor: optMinor,
  currency: optCurrency,
  personsCount: z.number().int().min(1).max(50).nullable().optional(),
  unitPriceMinor: optMinor,
  unitPriceNote: optText(300),
  costKind: z.enum(COST_KINDS),
  bookingStatus: z.enum(BOOKING_STATUSES),
  paymentStatus: z.enum(PAYMENT_STATUSES),
  paidByTravelerId: id.nullable().optional(),
  clarificationNote: optText(500),
  notes: optText(4000),
  travelerIds: z.array(id).max(50).optional(),
};

const priceNeedsCurrency = (b: { priceMinor?: number | null; unitPriceMinor?: number | null; currency?: string | null }) =>
  (b.priceMinor == null && b.unitPriceMinor == null) || !!b.currency;

export const bookingCreateSchema = z
  .object({
    ...bookingFields,
    id: id.optional(),
    costKind: bookingFields.costKind.default('actual'),
    bookingStatus: bookingFields.bookingStatus.default('planned'),
    paymentStatus: bookingFields.paymentStatus.default('unknown'),
  })
  .refine(priceNeedsCurrency, { message: 'Währung fehlt', path: ['currency'] });
export const bookingUpdateSchema = z.object(bookingFields).partial().extend({ version });
export const bookingToExpenseSchema = z.object({
  paidByTravelerId: id,
  participantIds: z.array(id).min(1).max(50),
  date: dateStr.optional(),
  fxRate: z.string().max(40).optional(),
});

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export const splitInputSchema = z.object({
  travelerId: id,
  value: z.number().int().min(0).max(1e13).optional(),
});

const expenseFields = {
  title: reqText(160),
  amountMinor: z.number().int().min(1).max(1e13),
  currency,
  date: dateStr,
  category: z.enum(EXPENSE_CATEGORIES).default('other'),
  paidByTravelerId: id,
  /** Several payers: amounts in the expense currency, must sum to amountMinor. */
  payers: z
    .array(z.object({ travelerId: id, amountMinor: z.number().int().min(1).max(1e13) }))
    .min(1)
    .max(50)
    .optional(),
  splitMethod: z.enum(SPLIT_METHODS).default('equal'),
  splits: z.array(splitInputSchema).min(1).max(50),
  /** Required unless currency equals trip base currency. */
  fxRate: z.string().max(40).optional(),
  /** "manual" when typed by the user, "cached" when taken from a stored rate. */
  fxSource: z.enum(['manual', 'cached', 'provider']).optional(),
  fxDate: optDate,
  notes: optText(2000),
};
export const expenseCreateSchema = z.object({ ...expenseFields, id: id.optional() });
export const expenseUpdateSchema = z.object(expenseFields).extend({ version });

export const settlementCreateSchema = z
  .object({
    id: id.optional(),
    fromTravelerId: id,
    toTravelerId: id,
    amountMinor: z.number().int().min(1).max(1e13),
    currency,
    fxRate: z.string().max(40).optional(),
    fxSource: z.enum(['manual', 'cached', 'provider']).optional(),
    fxDate: optDate,
    date: dateStr,
    notes: optText(1000),
  })
  .refine((s) => s.fromTravelerId !== s.toTravelerId, {
    message: 'Gleiche Person',
    path: ['toTravelerId'],
  });

export const exchangeRateCreateSchema = z.object({
  currency,
  rate: rateStr,
  effectiveDate: dateStr,
});

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

export const packingListCreateSchema = z.object({
  id: id.optional(),
  name: reqText(120),
  visibility: z.enum(PACKING_VISIBILITIES).default('private'),
  isTemplate: z.boolean().default(false),
  fromListId: id.optional(),
});
export const packingListUpdateSchema = z
  .object({ name: reqText(120), visibility: z.enum(PACKING_VISIBILITIES) })
  .partial()
  .extend({ version });

const packingItemFields = {
  name: reqText(160),
  category: z.enum(PACKING_CATEGORIES),
  quantity: z.number().int().min(1).max(999),
  packed: z.boolean(),
};
export const packingItemCreateSchema = z.object({
  ...packingItemFields,
  id: id.optional(),
  listId: id,
  category: packingItemFields.category.default('other'),
  quantity: packingItemFields.quantity.default(1),
  packed: packingItemFields.packed.default(false),
});
export const packingItemUpdateSchema = z.object(packingItemFields).partial().extend({ version });

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export const syncOperationSchema = z.object({
  opId: id,
  entity: z.enum(['activity', 'place', 'packing_list', 'packing_item']),
  action: z.enum(['create', 'update', 'delete', 'reorder']),
  id: id,
  baseVersion: z.number().int().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  clientTime: z.string().max(40).optional(),
});
export const syncRequestSchema = z.object({ ops: z.array(syncOperationSchema).min(1).max(100) });
