import {
  BedDouble,
  Bus,
  Car,
  CircleHelp,
  Compass,
  Landmark,
  Mountain,
  Music,
  Palmtree,
  Plane,
  Ship,
  ShoppingBag,
  Sparkles,
  TrainFront,
  Trees,
  Utensils,
  Waves,
  Ticket,
  Home as HomeIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ActivityCategory, BookingStatus, BookingType, ExpenseCategory, PaymentStatus, TransportMode } from '../../shared/constants';
import { costInfo } from '../../shared/costs';
import type { BookingDto } from '../../shared/types';
import { t } from '../i18n';
import { Badge } from './ui';

export const BOOKING_STATUS_TONE: Record<BookingStatus, 'success' | 'warn' | 'info' | 'danger'> = {
  booked: 'success',
  unconfirmed: 'warn',
  planned: 'info',
  cancelled: 'danger',
};
const PAYMENT_TONE: Record<PaymentStatus, 'success' | 'warn' | 'neutral' | 'info'> = {
  paid: 'success',
  partial: 'info',
  unpaid: 'warn',
  unknown: 'neutral',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={BOOKING_STATUS_TONE[status]}>{t.bookingStatus[status]}</Badge>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_TONE[status]}>{t.paymentStatus[status]}</Badge>;
}

/** All status facets of a booking: booking, payment, amount kind, clarification. */
export function BookingBadges({ booking, compact }: { booking: BookingDto; compact?: boolean }) {
  const info = costInfo(booking);
  return (
    <div className="flex flex-wrap gap-1.5">
      <BookingStatusBadge status={booking.bookingStatus} />
      {!compact && booking.bookingStatus !== 'cancelled' && booking.priceMinor != null && <PaymentBadge status={booking.paymentStatus} />}
      {booking.costKind !== 'actual' && <Badge tone="info">{t.costKind[booking.costKind]}</Badge>}
      {info.needsClarification && (
        <Badge tone="warn" icon={<CircleHelp size={12} />}>
          {info.clarificationReasons.includes('persons_unknown') && !booking.clarificationNote ? t.clarify.persons_unknown : t.clarify.note}
        </Badge>
      )}
    </div>
  );
}

const BOOKING_ICONS: Record<BookingType, typeof Plane> = {
  flight: Plane,
  hotel: BedDouble,
  ferry: Ship,
  train: TrainFront,
  bus: Bus,
  car: Car,
  activity: Ticket,
  other: Sparkles,
};
export function BookingIcon({ type, size = 18 }: { type: BookingType; size?: number }) {
  const I = BOOKING_ICONS[type];
  return <I size={size} />;
}

const MODE_ICONS: Record<TransportMode, typeof Plane> = { flight: Plane, boat: Ship, land: Bus, unknown: CircleHelp };
export function ModeIcon({ mode, size = 16 }: { mode: TransportMode; size?: number }) {
  const I = MODE_ICONS[mode];
  return <I size={size} />;
}

const CATEGORY_ICONS: Record<ActivityCategory, typeof Plane> = {
  restaurant: Utensils,
  beach: Palmtree,
  sightseeing: Landmark,
  adventure: Mountain,
  nature: Trees,
  transport: Bus,
  accommodation: BedDouble,
  shopping: ShoppingBag,
  nightlife: Music,
  other: Compass,
};
export function CategoryIcon({ category, size = 18 }: { category: ActivityCategory; size?: number }) {
  const I = CATEGORY_ICONS[category] ?? Compass;
  return <I size={size} />;
}

const EXPENSE_ICONS: Record<ExpenseCategory, typeof Plane> = {
  accommodation: BedDouble,
  food: Utensils,
  transportation: Bus,
  activities: Waves,
  shopping: ShoppingBag,
  other: Sparkles,
};
export function ExpenseIcon({ category, size = 18 }: { category: ExpenseCategory; size?: number }) {
  const I = EXPENSE_ICONS[category];
  return <I size={size} />;
}

export function HomeGlyph({ size = 16 }: { size?: number }) {
  return <HomeIcon size={size} />;
}

export function IconTile({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'warn' | 'neutral' }) {
  const cls = tone === 'warn' ? 'bg-warn-soft text-warn' : tone === 'neutral' ? 'bg-surface-2 text-text-2' : 'bg-accent-soft text-accent';
  return <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${cls}`}>{children}</span>;
}
