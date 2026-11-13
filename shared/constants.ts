/**
 * Shared domain constants. Identifiers are English; all user-facing labels
 * live in the i18n dictionaries (src/i18n).
 */

export const ROLES = ['owner', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export const TRIP_STATUSES = ['planning', 'confirmed', 'completed'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const ACTIVITY_CATEGORIES = [
  'restaurant',
  'beach',
  'sightseeing',
  'adventure',
  'nature',
  'transport',
  'accommodation',
  'shopping',
  'nightlife',
  'other',
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** Saved places share the activity categories so they can be planned 1:1. */
export const PLACE_CATEGORIES = ACTIVITY_CATEGORIES;
export type PlaceCategory = ActivityCategory;

/**
 * Booking status – strictly separated from payment status.
 * "booked" does NOT imply "paid".
 */
export const BOOKING_STATUSES = ['planned', 'unconfirmed', 'booked', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = ['unknown', 'unpaid', 'partial', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * What kind of amount is stored on a booking.
 * - actual:     a concrete price (e.g. from the booking confirmation)
 * - estimate:   a planned / estimated cost – never shown as paid
 * - budget_cap: an upper budget limit – never shown as paid
 */
export const COST_KINDS = ['actual', 'estimate', 'budget_cap'] as const;
export type CostKind = (typeof COST_KINDS)[number];

export const BOOKING_TYPES = [
  'flight',
  'hotel',
  'ferry',
  'train',
  'bus',
  'car',
  'activity',
  'other',
] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

/** Booking types that represent a movement between two places. */
export const TRANSPORT_BOOKING_TYPES: readonly BookingType[] = ['flight', 'ferry', 'train', 'bus', 'car'];

export type TransportMode = 'flight' | 'boat' | 'land' | 'unknown';

export function transportModeOf(type: BookingType | null | undefined): TransportMode {
  switch (type) {
    case 'flight':
      return 'flight';
    case 'ferry':
      return 'boat';
    case 'train':
    case 'bus':
    case 'car':
      return 'land';
    default:
      return 'unknown';
  }
}

export const EXPENSE_CATEGORIES = [
  'accommodation',
  'food',
  'transportation',
  'activities',
  'shopping',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const SPLIT_METHODS = ['equal', 'exact', 'percent'] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

/**
 * Origin of an exchange rate:
 * - identity: same currency as the trip base currency (rate 1)
 * - manual:   entered by a user for this entry
 * - cached:   taken from a previously stored trip rate
 * - provider: retrieved from an exchange-rate provider integration
 */
export const FX_SOURCES = ['identity', 'manual', 'cached', 'provider'] as const;
export type FxSource = (typeof FX_SOURCES)[number];

export const PACKING_CATEGORIES = [
  'clothing',
  'electronics',
  'toiletries',
  'documents',
  'medication',
  'other',
] as const;
export type PackingCategory = (typeof PACKING_CATEGORIES)[number];

export const PACKING_VISIBILITIES = ['shared', 'private'] as const;
export type PackingVisibility = (typeof PACKING_VISIBILITIES)[number];

/**
 * Traveller colours, tuned to the Midnight & Ice Blue palette: soft, clearly
 * distinguishable, readable with navy initials, and kept apart from the status
 * colours (green = paid, orange = open, red = error).
 * Order follows the previous palette so everyone keeps their colour family.
 */
export const TRAVELER_COLORS = ['#79AFC7', '#D9B88A', '#9AA8E8', '#D99AB0', '#A3C49A', '#B9A3E3', '#7FB8B0', '#E3CF8F'];

/** Request body limit for the JSON API (bytes). */
export const MAX_JSON_BODY_BYTES = 256 * 1024;
/** Upload limit for receipts (stored in D1, which allows ~2 MB per value). */
export const MAX_UPLOAD_BYTES = 1_900_000;

export const SESSION_TTL_DAYS = 30;
export const INVITATION_TTL_HOURS_DEFAULT = 72;
