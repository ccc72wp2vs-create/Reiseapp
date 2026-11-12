/**
 * API data transfer objects shared by the worker and the frontend.
 */
import type {
  ActivityCategory,
  BookingStatus,
  BookingType,
  CostKind,
  ExpenseCategory,
  FxSource,
  PackingCategory,
  PackingVisibility,
  PaymentStatus,
  PlaceCategory,
  Role,
  SplitMethod,
  TripStatus,
} from './constants';

export interface Versioned {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  isInstanceAdmin: boolean;
}

export interface AuthStatus {
  user: UserDto | null;
  setupRequired: boolean;
  setupEnabled: boolean;
}

export interface TripDto extends Versioned {
  name: string;
  destinationCountry: string | null;
  startDate: string;
  endDate: string;
  coverImageUrl: string | null;
  baseCurrency: string;
  localCurrency: string | null;
  description: string | null;
  status: TripStatus;
  archivedAt: string | null;
  originName: string | null;
  originLat: number | null;
  originLng: number | null;
  homeTimezone: string;
  importKey: string | null;
  isDemo: boolean;
  /** Role of the requesting user. */
  role: Role;
}

export interface TripSummaryDto extends TripDto {
  destinationCount: number;
  travelerCount: number;
}

export interface MemberDto {
  userId: string;
  displayName: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface TravelerDto extends Versioned {
  tripId: string;
  name: string;
  userId: string | null;
  color: string;
  sortOrder: number;
}

export interface DestinationDto extends Versioned {
  tripId: string;
  name: string;
  country: string | null;
  arrivalDate: string;
  departureDate: string;
  timezone: string;
  accommodationName: string | null;
  accommodationAddress: string | null;
  accommodationNotes: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  coverImageUrl: string | null;
  sortOrder: number;
}

export interface ActivityDto extends Versioned {
  tripId: string;
  title: string;
  description: string | null;
  category: ActivityCategory;
  date: string;
  startTime: string | null;
  endTime: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  estCostMinor: number | null;
  currency: string | null;
  bookingStatus: BookingStatus;
  completed: boolean;
  notes: string | null;
  placeId: string | null;
  sortOrder: number;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface PlaceDto extends Versioned {
  tripId: string;
  name: string;
  category: PlaceCategory;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  externalUrl: string | null;
  notes: string | null;
  favorite: boolean;
  destinationId: string | null;
  createdBy: string | null;
}

export interface BookingDto extends Versioned {
  tripId: string;
  title: string;
  type: BookingType;
  provider: string | null;
  reference: string | null;
  startDate: string | null;
  startTime: string | null;
  startTimezone: string | null;
  endDate: string | null;
  endTime: string | null;
  endTimezone: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  location: string | null;
  destinationId: string | null;
  fromDestinationId: string | null;
  toDestinationId: string | null;
  priceMinor: number | null;
  currency: string | null;
  personsCount: number | null;
  unitPriceMinor: number | null;
  unitPriceNote: string | null;
  costKind: CostKind;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  paidByTravelerId: string | null;
  clarificationNote: string | null;
  notes: string | null;
  /** Linked wallet expense (prevents double counting). */
  expenseId: string | null;
  /** Travelers this booking applies to (empty = not assigned). */
  travelerIds: string[];
  createdBy: string | null;
}

export interface ExpenseShareDto {
  travelerId: string;
  shareMinor: number;
  baseShareMinor: number;
  weight: number | null;
}

export interface ExpenseDto extends Versioned {
  tripId: string;
  title: string;
  amountMinor: number;
  currency: string;
  date: string;
  category: ExpenseCategory;
  paidByTravelerId: string;
  splitMethod: SplitMethod;
  fxRate: string;
  fxSource: FxSource;
  fxDate: string | null;
  baseAmountMinor: number;
  notes: string | null;
  bookingId: string | null;
  shares: ExpenseShareDto[];
  createdBy: string | null;
}

export interface SettlementDto extends Versioned {
  tripId: string;
  fromTravelerId: string;
  toTravelerId: string;
  amountMinor: number;
  currency: string;
  fxRate: string;
  fxSource: FxSource;
  fxDate: string | null;
  baseAmountMinor: number;
  date: string;
  notes: string | null;
  createdBy: string | null;
}

export interface ExchangeRateDto {
  id: string;
  tripId: string;
  currency: string;
  baseCurrency: string;
  rate: string;
  source: 'manual' | 'provider';
  effectiveDate: string;
  createdAt: string;
}

export interface PackingListDto extends Versioned {
  tripId: string | null;
  ownerUserId: string;
  visibility: PackingVisibility;
  isTemplate: boolean;
  name: string;
}

export interface PackingItemDto extends Versioned {
  listId: string;
  name: string;
  category: PackingCategory;
  quantity: number;
  packed: boolean;
  sortOrder: number;
}

export interface InvitationDto {
  id: string;
  tripId: string;
  role: Role;
  travelerId: string | null;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface TripSnapshot {
  trip: TripDto;
  members: MemberDto[];
  travelers: TravelerDto[];
  destinations: DestinationDto[];
  activities: ActivityDto[];
  places: PlaceDto[];
  bookings: BookingDto[];
  expenses: ExpenseDto[];
  settlements: SettlementDto[];
  exchangeRates: ExchangeRateDto[];
  packingLists: PackingListDto[];
  packingItems: PackingItemDto[];
  /** Server time of the snapshot (ISO). */
  syncedAt: string;
}

// ---------------------------------------------------------------------------
// Sync protocol
// ---------------------------------------------------------------------------

export type SyncEntity = 'activity' | 'place' | 'packing_list' | 'packing_item';
export type SyncAction = 'create' | 'update' | 'delete' | 'reorder';

export interface SyncOperation {
  /** Stable client-generated UUID – makes the operation idempotent. */
  opId: string;
  entity: SyncEntity;
  action: SyncAction;
  /** Entity ID (client-generated UUID for creates). */
  id: string;
  /** Version the client based its change on (update/delete). */
  baseVersion?: number;
  data?: Record<string, unknown>;
  /** Client timestamp, informational only. */
  clientTime?: string;
}

export type SyncResultStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected';

export interface SyncResult {
  opId: string;
  status: SyncResultStatus;
  /** Current server version of the entity (null when deleted). */
  entity?: unknown;
  error?: { code: string; message: string };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
