/**
 * Home screen content for a stop chosen in the hero (tap / swipe): plan of
 * the stay, accommodation, arrival & onward travel, bookings, saved places
 * and costs of that stop. Only filters existing data (see shared/stop.ts).
 */
import { BedDouble, CalendarDays, MapPin, Plus, Route, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import type { StopOverview } from '../../../shared/stop';
import { diffDays, type RouteLeg } from '../../../shared/trip';
import type { BookingDto } from '../../../shared/types';
import { BookingBadges, BookingIcon, CategoryIcon, IconTile, ModeIcon } from '../../components/status';
import { Badge, Button, Card, SectionTitle, cx } from '../../components/ui';
import { t } from '../../i18n';
import { formatDate, formatDateShort, formatTime, money } from '../../lib/format';

export function BookingRow({ booking }: { booking: BookingDto }) {
  return (
    <Link to="/buchungen" className="flex items-center gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
      <IconTile tone={booking.bookingStatus === 'booked' ? 'accent' : 'warn'}>
        <BookingIcon type={booking.type} />
      </IconTile>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{booking.title}</p>
        <p className="text-[13px] text-text-3">
          {booking.startDate ? formatDate(booking.startDate) : t.bookings.undated}
          {booking.startTime ? ` · ${formatTime(booking.startTime)}` : ''}
        </p>
        <div className="mt-2">
          <BookingBadges booking={booking} compact />
        </div>
      </div>
    </Link>
  );
}

function CardLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">
      {icon} {children}
    </div>
  );
}

function LegCard({ leg, label }: { leg: RouteLeg; label: string }) {
  const b = leg.booking;
  return (
    <Card className="p-5">
      <CardLabel icon={<Route size={15} />}>{label}</CardLabel>
      <p className="mt-3 font-display text-[22px] font-semibold leading-tight">
        {leg.from.name} <span className="text-accent">→</span> {leg.to.name}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[14px] text-text-2">
        <ModeIcon mode={leg.mode} /> {t.transportModes[leg.mode]}
        {leg.date && ` · ${formatDate(leg.date)}`}
        {b?.startTime && ` · ${formatTime(b.startTime)}`}
      </p>
      {b && <p className="mt-1 truncate text-[13px] text-text-3">{b.title}</p>}
      <div className="mt-3">{b ? <BookingBadges booking={b} compact /> : <Badge tone="warn">{t.transportModes.unknown}</Badge>}</div>
    </Card>
  );
}

export function StopView({ o, canEdit, onAddActivity }: { o: StopOverview; canEdit: boolean; onAddActivity: (date: string) => void }) {
  const { stop, when, costs } = o;
  const past = when === 'past';
  const base = costs.baseCurrency;
  return (
    <div key={stop.id} className="animate-fade">
      {/* ------------------------------------------------------------ Plan */}
      <SectionTitle
        action={
          <Link to={`/plan?tag=${o.days[0]}`} className="text-[14px] font-semibold text-accent">
            {t.home.viewPlan}
          </Link>
        }
      >
        {past ? t.home.stopLived(stop.name) : t.home.stopPlanned(stop.name)}
      </SectionTitle>
      <Card className="divide-y divide-line overflow-hidden">
        {o.days.map((d) => {
          const acts = o.activitiesByDay[d] ?? [];
          const books = o.bookingsByDay[d] ?? [];
          return (
            <div key={d} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/plan?tag=${d}`} className="text-[13px] font-semibold uppercase tracking-[0.12em] text-text-3">
                  {formatDate(d)}
                </Link>
                {canEdit && !past && (
                  <button
                    type="button"
                    onClick={() => onAddActivity(d)}
                    aria-label={`${t.home.addActivity} ${formatDate(d)}`}
                    className="grid h-8 w-8 place-items-center rounded-full text-accent active:bg-surface-2"
                  >
                    <Plus size={18} />
                  </button>
                )}
              </div>
              {acts.length === 0 && books.length === 0 ? (
                <p className="mt-1 text-[14px] text-text-3">{past ? t.home.stopEmptyDayPast : t.home.stopEmptyDay}</p>
              ) : (
                <ul className="mt-2 space-y-2.5">
                  {books.map((b) => (
                    <li key={b.id}>
                      <Link to="/buchungen" className="flex items-center gap-3">
                        <IconTile tone={b.bookingStatus === 'booked' ? 'accent' : 'warn'}>
                          <BookingIcon type={b.type} />
                        </IconTile>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{b.title}</p>
                          <p className="text-[13px] text-text-3">{b.startTime ? formatTime(b.startTime) : t.plan.allDay}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                  {acts.map((a) => (
                    <li key={a.id}>
                      <Link to={`/plan?tag=${d}`} className="flex items-center gap-3">
                        <IconTile tone="neutral">
                          <CategoryIcon category={a.category} />
                        </IconTile>
                        <div className="min-w-0 flex-1">
                          <p className={cx('truncate font-semibold', a.completed && 'text-text-3 line-through')}>{a.title}</p>
                          <p className="text-[13px] text-text-3">
                            {a.startTime ? `${a.startTime}${a.endTime ? `–${a.endTime}` : ''}` : t.plan.allDay}
                            {a.locationName ? ` · ${a.locationName}` : ''}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </Card>

      {/* --------------------------------------------- Stay, arrival, onward */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <CardLabel icon={<BedDouble size={15} />}>{t.home.stopStay}</CardLabel>
          <p className="mt-3 font-display text-[22px] font-semibold leading-tight">{stop.accommodationName ?? stop.name}</p>
          <p className="mt-1 text-[14px] text-text-2">{stop.accommodationName ? (stop.accommodationAddress ?? stop.name) : t.home.accommodationUnknown}</p>
          <p className="mt-3 text-[13px] text-text-3">
            {formatDateShort(stop.arrivalDate)} – {formatDate(stop.departureDate)} · {t.common.nights(diffDays(stop.arrivalDate, stop.departureDate))}
          </p>
          {o.stayBooking && (
            <Link to="/buchungen" className="mt-3 block">
              <BookingBadges booking={o.stayBooking} />
            </Link>
          )}
        </Card>
        {o.arrival && <LegCard leg={o.arrival} label={t.home.stopArrival} />}
        {o.departure && <LegCard leg={o.departure} label={t.home.stopDeparture} />}
      </div>

      {/* --------------------------------------------------- Other bookings */}
      {o.otherBookings.length > 0 && (
        <>
          <SectionTitle
            action={
              <Link to="/buchungen" className="text-[14px] font-semibold text-accent">
                {t.bookings.title}
              </Link>
            }
          >
            {t.home.stopBookings}
          </SectionTitle>
          <div className="space-y-2.5">
            {o.otherBookings.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
        </>
      )}

      {/* ----------------------------------------------------- Saved places */}
      {o.places.length > 0 && (
        <>
          <SectionTitle
            action={
              <Link to="/entdecken" className="text-[14px] font-semibold text-accent">
                {t.nav.explore}
              </Link>
            }
          >
            {t.home.stopPlaces}
          </SectionTitle>
          <Card className="divide-y divide-line">
            {o.places.slice(0, 4).map((p) => (
              <Link key={p.id} to="/entdecken" className="flex items-center gap-3 p-4">
                <IconTile tone="neutral">
                  <MapPin size={18} />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  {p.address && <p className="truncate text-[13px] text-text-3">{p.address}</p>}
                </div>
              </Link>
            ))}
            {o.places.length > 4 && (
              <Link to="/entdecken" className="block p-4 text-[14px] font-semibold text-accent">
                {t.home.stopMorePlaces(o.places.length - 4)}
              </Link>
            )}
          </Card>
        </>
      )}

      {/* ------------------------------------------------------------ Costs */}
      <SectionTitle
        action={
          <Link to="/kasse" className="text-[14px] font-semibold text-accent">
            {t.wallet.title}
          </Link>
        }
      >
        {t.home.stopCosts(stop.name)}
      </SectionTitle>
      <Card className="p-5">
        <CardLabel icon={<Wallet size={15} />}>{t.home.stopSpent}</CardLabel>
        <p className="mt-2 font-display text-[32px] font-semibold leading-none tabular">{money(costs.spentMinor, base)}</p>
        <p className="mt-1.5 text-[13px] text-text-3">{o.expenses.length ? t.home.stopExpenses(o.expenses.length) : t.home.stopNoExpenses}</p>
        {(costs.bookedNotInWalletMinor > 0 || costs.plannedMinor > 0 || costs.otherCurrencies.length > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[14px]">
            <div>
              <p className="text-[12px] text-text-3">{t.home.stopBookedOpen}</p>
              <p className="font-semibold tabular">{money(costs.bookedNotInWalletMinor, base)}</p>
            </div>
            <div>
              <p className="text-[12px] text-text-3">{t.home.stopPlannedCost}</p>
              <p className="font-semibold tabular">{money(costs.plannedMinor, base)}</p>
            </div>
            {costs.otherCurrencies.map((c) => (
              <p key={c.currency} className="col-span-2 text-[12px] text-text-3">
                + {money(c.minor, c.currency)}
              </p>
            ))}
          </div>
        )}
      </Card>

      {canEdit && !past && (
        <div className="mt-4">
          <Button variant="soft" size="sm" icon={<CalendarDays size={16} />} onClick={() => onAddActivity(o.days[0])}>
            {t.home.addActivity}
          </Button>
        </div>
      )}
    </div>
  );
}
