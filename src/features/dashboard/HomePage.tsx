import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  MapPin,
  Plus,
  Receipt,
  Route,
  Sparkles,
  Languages,
  Lock,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { costBucketItems, costInfo, personCostOverview, tripCostOverview, type CostBucket } from '../../../shared/costs';
import {
  bookingSortKey,
  bookingsOnDate,
  buildRoute,
  destinationOn,
  diffDays,
  nextTransport,
  todayIn,
  transferReminders,
  tripPhase,
} from '../../../shared/trip';
import type { BookingDto, TripSnapshot } from '../../../shared/types';
import { pickDefaultTrip, useTrip } from '../../components/AppShell';
import { CoverArt, Logo } from '../../components/CoverArt';
import { BookingBadges, BookingIcon, CategoryIcon, ExpenseIcon, IconTile, ModeIcon } from '../../components/status';
import { toast } from '../../components/toast';
import { PersonFilter, usePersonSelection } from '../../components/PersonFilter';
import { Badge, Button, Card, EmptyState, ErrorState, SectionTitle, Sheet, Skeleton, cx } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { formatDate, formatDateShort, formatLongDate, formatTime, money } from '../../lib/format';
import { tripsList, tripStore, useOnline, useTrips } from '../../lib/store';
import { CurrencyConverter } from '../../components/CurrencyConverter';
import { LANG_NAMES, phraseLangFor } from '../../lib/phrasebook';
import { bookingTimeLabel } from '../../lib/bookingLabels';
import { setStatusBarOverHero } from '../../lib/theme';
import { CheckinReminders } from '../bookings/CheckinReminders';

const ActivitySheet = lazy(() => import('../itinerary/ActivitySheet'));
const ExpenseSheet = lazy(() => import('../wallet/ExpenseSheet'));
const DestinationSheet = lazy(() => import('../trips/DestinationSheet'));
const TripSheet = lazy(() => import('../trips/TripSheet'));

/** Keeps the status bar dark while the dark hero image is behind it. */
function useHeroStatusBar() {
  useEffect(() => {
    const update = () => setStatusBarOverHero(window.scrollY < window.innerHeight * 0.45);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      setStatusBarOverHero(false);
    };
  }, []);
}

export function HomePage() {
  useHeroStatusBar();
  const { state, snap } = useTrip();
  const { trips } = useTrips();

  if (trips && trips.length === 0 && !state.tripId) return <NoTrip />;
  if (state.status === 'error' && !snap) {
    return (
      <div className="px-safe pt-safe">
        <div className="pt-6">
          <ErrorState message={state.error ?? t.errors.generic} onRetry={() => void tripStore.refresh()} />
        </div>
      </div>
    );
  }
  if (!snap) return <HomeSkeleton />;
  return <Dashboard snap={snap} />;
}

function HomeSkeleton() {
  return (
    <div>
      <Skeleton className="h-[52dvh] w-full rounded-none rounded-b-[2rem]" />
      <div className="space-y-3 px-safe pt-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? t.home.greeting.morning : h < 18 ? t.home.greeting.day : t.home.greeting.evening;
}

type SheetKind = 'activity' | 'expense' | 'destination' | null;

function Dashboard({ snap }: { snap: TripSnapshot }) {
  const { canEdit, user } = useTrip();
  const online = useOnline();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const { trip, destinations, bookings, activities } = snap;

  // "Today" is evaluated in the time zone of where the travelers currently are.
  const homeToday = todayIn(trip.homeTimezone);
  const probe = destinationOn(destinations, homeToday).current ?? destinations[0];
  const tz = probe?.timezone ?? trip.homeTimezone;
  const today = todayIn(tz);
  const phase = tripPhase(trip, today);
  const where = destinationOn(destinations, today);
  const phraseLang = phraseLangFor(trip.destinationCountry);
  // Open deposits: shown from 2 days before the return date (or always without one).
  const openDeposits = (snap.deposits ?? []).filter((d) => d.status === 'open' && (!d.returnDate || diffDays(today, d.returnDate) <= 2));
  const heroDest = phase.phase === 'before' ? destinations[0] : phase.phase === 'after' ? null : (where.current ?? where.leaving);

  const todays = activities.filter((a) => a.date === today);
  const todaysBookings = bookingsOnDate(bookings, today);
  const reminders = useMemo(() => transferReminders(trip, destinations, bookings, today), [trip, destinations, bookings, today]);
  const clarifications = bookings.filter((b) => b.bookingStatus !== 'cancelled' && (b.startDate ?? '9999') >= today && costInfo(b).needsClarification);
  const transport = nextTransport(bookings, today);
  const route = useMemo(() => buildRoute(trip, destinations, bookings), [trip, destinations, bookings]);
  const nextLeg = route.legs.find((l) => l.date !== null && l.date >= today);
  const stayBooking = where.current ? bookings.find((b) => b.type === 'hotel' && b.destinationId === where.current!.id && b.bookingStatus !== 'cancelled') : null;
  const upcoming = bookings
    .filter((b) => b.bookingStatus !== 'cancelled' && (b.startDate ?? '') > today)
    .sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)))
    .slice(0, 3);

  return (
    <div>
      {/* ------------------------------------------------------------------ Hero */}
      <section className="relative">
        <CoverArt
          name={heroDest?.name ?? trip.name}
          imageUrl={heroDest?.coverImageUrl ?? trip.coverImageUrl}
          className="h-[56dvh] min-h-[380px] w-full rounded-b-[2.25rem]"
          label={heroDest?.name ?? trip.name}
        />
        <div className="absolute inset-0 rounded-b-[2.25rem] bg-gradient-to-t from-[#101b33] via-[#101b33]/35 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 top-0 px-safe pt-safe">
          <div className="flex items-center justify-between pt-2 text-sand">
            <Logo size={30} withWordmark={false} />
            <Link
              to="/reisen"
              className="glass inline-flex h-10 max-w-[70%] items-center gap-1.5 rounded-full border border-white/15 px-4 text-[14px] font-semibold text-text"
            >
              {trip.isDemo && <span className="text-warn">{t.trips.demoBadge}</span>}
              <span className="truncate">{trip.name}</span>
              <ChevronDown size={16} className="shrink-0 opacity-70" />
            </Link>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-safe pb-7 text-[#f5f9fc]">
          <p className="text-[14px] font-medium text-white/75">
            {greeting()}
            {user ? `, ${user.displayName.split(' ')[0]}` : ''} · {formatLongDate(today)}
          </p>
          <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.2em] text-[#79afc7]">
            {phase.phase === 'during' ? t.home.currentDestination : phase.phase === 'before' ? t.home.beforeTrip : t.phase.after}
          </p>
          <h1 className="font-display text-[clamp(44px,13vw,68px)] font-semibold leading-[0.95]">
            {phase.phase === 'after' ? trip.name : (heroDest?.name ?? trip.name)}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px]">
            {phase.phase === 'during' && (
              <>
                <span className="rounded-full bg-black/30 px-3 py-1.5 font-semibold text-white backdrop-blur">{t.phase.during(phase.day, phase.totalDays)}</span>
                <span className="rounded-full bg-black/20 px-3 py-1.5 text-white backdrop-blur">{t.phase.remaining(phase.daysRemaining)}</span>
              </>
            )}
            {phase.phase === 'before' && (
              <span className="rounded-full bg-black/30 px-3 py-1.5 font-semibold text-white backdrop-blur">{t.phase.before(phase.daysUntilStart)}</span>
            )}
            {where.current && phase.phase === 'during' && (
              <span className="rounded-full bg-black/20 px-3 py-1.5 text-white backdrop-blur">{t.home.stayUntil(formatDateShort(where.current.departureDate))}</span>
            )}
          </div>
          {phase.phase !== 'after' && <TripProgress snap={snap} today={today} />}
        </div>
      </section>

      <div className="px-safe">
        {phase.phase !== 'after' && <CheckinReminders snap={snap} canEdit={canEdit} />}
        {/* ------------------------------------------------------------ Reminders */}
        {(reminders.length > 0 || clarifications.length > 0 || openDeposits.length > 0) && (phase.phase !== 'after' || openDeposits.length > 0) && (
          <section aria-label={t.home.reminders} className="mt-5 space-y-2.5">
            {openDeposits.map((d) => {
              const due = d.returnDate ? diffDays(today, d.returnDate) : null;
              const urgent = due != null && due <= 0;
              return (
                <Link
                  key={d.id}
                  to="/kasse"
                  className={cx(
                    'flex items-start gap-3 rounded-[1.25rem] border p-4 transition active:scale-[0.99]',
                    urgent ? 'border-warn/35 bg-warn-soft' : 'border-line bg-surface',
                  )}
                >
                  <Lock className={cx('mt-0.5 shrink-0', urgent ? 'text-warn' : 'text-text-3')} size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug">{t.deposits.reminder(d.title, money(d.amountMinor, d.currency))}</p>
                    {d.returnDate && (
                      <p className="mt-0.5 text-[13px] text-text-2">
                        {t.deposits.returnOn(formatDate(d.returnDate))}
                        {due === 0 ? ` · ${t.common.today}` : due === 1 ? ` · ${t.common.tomorrow}` : due != null && due < 0 ? ` · ${t.deposits.overdue}` : ''}
                      </p>
                    )}
                  </div>
                  <ArrowRight size={18} className={cx('mt-0.5 shrink-0', urgent ? 'text-warn' : 'text-text-3')} />
                </Link>
              );
            })}
            {reminders.slice(0, 3).map((r, i) => {
              const days = r.date ? diffDays(today, r.date) : null;
              return (
                <Link
                  key={i}
                  to="/buchungen"
                  className="flex items-start gap-3 rounded-[1.25rem] border border-warn/35 bg-warn-soft p-4 transition active:scale-[0.99]"
                >
                  <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug">
                      {r.kind === 'transfer_unconfirmed' ? t.home.transferUnconfirmed(r.fromName, r.toName) : t.home.transportMissing(r.fromName, r.toName)}
                    </p>
                    {r.date && (
                      <p className="mt-0.5 text-[13px] text-text-2">
                        {formatDate(r.date)}
                        {days === 0 ? ` · ${t.common.today}` : days === 1 ? ` · ${t.common.tomorrow}` : ''}
                      </p>
                    )}
                  </div>
                  <ArrowRight size={18} className="mt-0.5 shrink-0 text-warn" />
                </Link>
              );
            })}
            {clarifications.length > 0 && (
              <Link to="/buchungen" className="flex items-center gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
                <CircleHelp className="shrink-0 text-warn" size={20} />
                <p className="flex-1 text-[14px] text-text-2">
                  <span className="font-semibold text-text">{clarifications.length}</span> {clarifications.length === 1 ? 'Buchung' : 'Buchungen'} mit offenen Angaben
                </p>
                <ArrowRight size={18} className="text-text-3" />
              </Link>
            )}
          </section>
        )}

        {/* ------------------------------------------------------- Quick actions */}
        <section aria-label={t.home.quickActions} className="mt-6 grid grid-cols-4 gap-2">
          {[
            { label: t.home.addActivity, icon: <Plus size={20} />, onClick: () => setSheet('activity'), disabled: !canEdit },
            { label: t.home.addExpense, icon: <Receipt size={20} />, onClick: () => setSheet('expense'), disabled: !canEdit || !online },
            // Phrasebook for the trip's country – otherwise the classic "add destination" action.
            phraseLang
              ? { label: LANG_NAMES[phraseLang], icon: <Languages size={20} />, onClick: () => navigate('/sprache'), disabled: false }
              : { label: t.home.addDestination, icon: <MapPin size={20} />, onClick: () => setSheet('destination'), disabled: !canEdit || !online },
            { label: t.home.viewPlan, icon: <CalendarDays size={20} />, onClick: () => navigate('/plan') },
          ].map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              className="flex flex-col items-center gap-2 rounded-[1.25rem] py-2 text-[12px] font-semibold text-text-2 transition active:scale-95 disabled:opacity-40"
            >
              <span className="grid h-14 w-14 place-items-center rounded-[1.25rem] border border-line bg-surface text-accent shadow-card">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </section>

        <CurrencyConverter snap={snap} today={today} />

        {/* ------------------------------------------------------------- Today */}
        {phase.phase === 'during' && (
          <>
            <SectionTitle action={<Link to={`/plan?tag=${today}`} className="text-[14px] font-semibold text-accent">{t.home.viewPlan}</Link>}>
              {t.home.todayPlan}
            </SectionTitle>
            <Card className="divide-y divide-line overflow-hidden">
              {todaysBookings.map((b) => (
                <Link key={b.id} to="/buchungen" className="flex items-center gap-3 p-4">
                  <IconTile tone={b.bookingStatus === 'booked' ? 'accent' : 'warn'}>
                    <BookingIcon type={b.type} />
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{b.title}</p>
                    <p className="text-[13px] text-text-3">{bookingTimeLabel(b, today, formatTime, t.plan.allDay)}</p>
                    <div className="mt-2">
                      <BookingBadges booking={b} compact />
                    </div>
                  </div>
                </Link>
              ))}
              {todays.map((a) => (
                <Link key={a.id} to={`/plan?tag=${today}`} className="flex items-center gap-3 p-4">
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
              ))}
              {todays.length === 0 && todaysBookings.length === 0 && (
                <div className="flex items-center justify-between gap-3 p-4">
                  <p className="text-[15px] text-text-2">{t.home.noActivitiesToday}</p>
                  {canEdit && (
                    <Button size="sm" variant="soft" icon={<Plus size={16} />} onClick={() => setSheet('activity')}>
                      {t.common.add}
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </>
        )}

        {/* ---------------------------------------------- Stay & next move */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {where.current && phase.phase === 'during' && (
            <Card className="p-5">
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">
                <BedDouble size={15} /> {t.home.currentStay}
              </div>
              <p className="mt-3 font-display text-[22px] font-semibold leading-tight">{where.current.accommodationName ?? where.current.name}</p>
              <p className="mt-1 text-[14px] text-text-2">
                {where.current.accommodationName ? (where.current.accommodationAddress ?? where.current.name) : t.home.accommodationUnknown}
              </p>
              <p className="mt-3 text-[13px] text-text-3">
                {formatDateShort(where.current.arrivalDate)} – {formatDate(where.current.departureDate)} · {t.common.nights(diffDays(where.current.arrivalDate, where.current.departureDate))}
              </p>
              {stayBooking && (
                <div className="mt-3">
                  <BookingBadges booking={stayBooking} />
                </div>
              )}
            </Card>
          )}
          {nextLeg && (
            <Card className="p-5">
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">
                <Route size={15} /> {t.home.nextMove}
              </div>
              <p className="mt-3 font-display text-[22px] font-semibold leading-tight">
                {nextLeg.from.name} <span className="text-accent">→</span> {nextLeg.to.name}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[14px] text-text-2">
                <ModeIcon mode={nextLeg.mode} /> {t.transportModes[nextLeg.mode]}
                {nextLeg.date && (
                  <>
                    {' · '}
                    {formatDate(nextLeg.date)}
                    {diffDays(today, nextLeg.date) > 0 && ` (${t.home.arrivalIn(diffDays(today, nextLeg.date))})`}
                  </>
                )}
              </p>
              {nextLeg.booking ? (
                <div className="mt-3">
                  <BookingBadges booking={nextLeg.booking} compact />
                </div>
              ) : (
                <div className="mt-3">
                  <Badge tone="warn">{t.transportModes.unknown}</Badge>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ---------------------------------------------------- Next transport */}
        {transport && transport.id !== nextLeg?.booking?.id && (
          <>
            <SectionTitle>{t.home.nextTransport}</SectionTitle>
            <BookingRow booking={transport} />
          </>
        )}

        {/* ---------------------------------------------------------- Upcoming */}
        {upcoming.length > 0 && (
          <>
            <SectionTitle action={<Link to="/buchungen" className="text-[14px] font-semibold text-accent">{t.bookings.title}</Link>}>
              {t.home.upcoming}
            </SectionTitle>
            <div className="space-y-2.5">
              {upcoming.map((b) => (
                <BookingRow key={b.id} booking={b} />
              ))}
            </div>
          </>
        )}

        {/* ------------------------------------------------------------ Wallet */}
        <SectionTitle action={<Link to="/kasse" className="text-[14px] font-semibold text-accent">{t.wallet.title}</Link>}>
          {t.home.tripCosts}
        </SectionTitle>
        <CostsCard snap={snap} />

        <div className="mt-8 flex flex-wrap gap-2">
          <Link to="/route" className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[14px] font-semibold">
            <Route size={16} className="text-accent" /> {t.home.viewRoute}
          </Link>
          <Link to="/reise" className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[14px] font-semibold">
            <MapPin size={16} className="text-accent" /> {t.destinations.title}
          </Link>
        </div>
      </div>

      <Suspense fallback={null}>
        {sheet === 'activity' && <ActivitySheet open onClose={() => setSheet(null)} defaults={{ date: phase.phase === 'during' ? today : trip.startDate }} />}
        {sheet === 'expense' && <ExpenseSheet open onClose={() => setSheet(null)} />}
        {sheet === 'destination' && <DestinationSheet open onClose={() => setSheet(null)} />}
      </Suspense>
    </div>
  );
}

function BookingRow({ booking }: { booking: BookingDto }) {
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

/** Mini route progress: one dot per destination. */
function TripProgress({ snap, today }: { snap: TripSnapshot; today: string }) {
  const ds = snap.destinations;
  if (!ds.length) return null;
  return (
    <ol className="mt-5 flex items-center gap-1.5" aria-label={t.trips.route}>
      {ds.map((d) => {
        const state = d.departureDate <= today ? 'done' : d.arrivalDate <= today ? 'now' : 'next';
        return (
          <li key={d.id} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className={cx(
                'h-1.5 rounded-full',
                state === 'done' ? 'bg-white/70' : state === 'now' ? 'bg-[#79afc7] shadow-[0_0_12px_#79afc7]' : 'bg-white/20',
              )}
            />
            <span className={cx('truncate text-[11px]', state === 'now' ? 'font-semibold text-white' : 'text-white/55')}>{d.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// No trip yet
// ---------------------------------------------------------------------------

function NoTrip() {
  const online = useOnline();
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function importKey(key: 'thailand-2026' | 'demo-thailand') {
    setBusy(key);
    try {
      const r = await http.post<{ tripId: string; created: boolean }>(`/imports/${key}`);
      toast(r.created ? t.success.imported : t.success.alreadyImported, r.created ? 'success' : 'info');
      const list = await tripsList.load();
      await tripStore.select(r.tripId ?? pickDefaultTrip(list));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <section className="relative">
        <CoverArt name="Koh Lanta" className="h-[44dvh] min-h-[300px] w-full rounded-b-[2.25rem]" />
        <div className="absolute inset-0 rounded-b-[2.25rem] bg-gradient-to-t from-[#101b33] to-transparent" aria-hidden />
        <div className="absolute inset-x-0 top-0 px-safe pt-safe">
          <Logo size={32} className="pt-2 text-sand" />
        </div>
        <div className="absolute inset-x-0 bottom-0 px-safe pb-7 text-[#f5f9fc]">
          <h1 className="font-display text-[44px] font-semibold leading-none">{t.home.noTrip}</h1>
        </div>
      </section>
      <div className="px-safe pt-6">
        <EmptyState
          icon={<Sparkles size={26} />}
          title={t.app.tagline}
          text={t.home.noTripText}
          action={
            <div className="flex w-full flex-col gap-3">
              <Button size="lg" icon={<Download size={18} />} loading={busy === 'thailand-2026'} disabled={!online} onClick={() => void importKey('thailand-2026')}>
                {t.home.importThailand}
              </Button>
              <Button size="lg" variant="secondary" icon={<Plus size={18} />} disabled={!online} onClick={() => setCreateOpen(true)}>
                {t.home.createTrip}
              </Button>
              <Button variant="ghost" loading={busy === 'demo-thailand'} disabled={!online} onClick={() => void importKey('demo-thailand')}>
                {t.home.loadDemo}
              </Button>
            </div>
          }
        />
      </div>
      <Suspense fallback={null}>{createOpen && <TripSheet open onClose={() => setCreateOpen(false)} />}</Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip costs with person / group filter
// ---------------------------------------------------------------------------

function CostsCard({ snap }: { snap: TripSnapshot }) {
  const { trip, travelers, expenses, settlements, bookings } = snap;
  const base = trip.baseCurrency;
  const selection = usePersonSelection(travelers);
  const { selected, filtered } = selection;
  const [detail, setDetail] = useState<CostBucket | null>(null);
  const group = tripCostOverview(base, expenses, bookings);
  const person = filtered ? personCostOverview(base, selected, expenses, settlements, bookings) : null;
  const costs = person ?? group;
  const recent = filtered
    ? expenses
        .map((e) => ({ e, share: e.shares.filter((x) => selected.includes(x.travelerId)).reduce((a, x) => a + x.baseShareMinor, 0) }))
        .filter((x) => x.share > 0)
        .slice(0, 3)
    : expenses.slice(0, 3).map((e) => ({ e, share: null as number | null }));

  return (
    <Card className="p-5">
      <div className="mb-3">
        <PersonFilter travelers={travelers} selection={selection} bleed="-mx-5 px-5" />
      </div>
      <p className="text-[13px] font-semibold text-text-3">{filtered ? t.home.costsShare : t.home.costsSpent}</p>
      <p className="mt-1 font-display text-[30px] font-semibold tabular">{money(costs.spentMinor, base)}</p>
      <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[14px]">
        {person && (
          <>
            <div className="flex justify-between gap-3">
              <dt className="min-w-0 text-text-2">{t.home.costsNetPaid}</dt>
              <dd className="shrink-0 tabular">{money(person.netPaidMinor, base)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="min-w-0 text-text-2">
                {person.balanceMinor > 0 ? t.home.costsBalanceGet : person.balanceMinor < 0 ? t.home.costsBalanceOwe : t.home.costsBalanceZero}
              </dt>
              <dd className={cx('shrink-0 tabular', person.balanceMinor > 0 ? 'text-success' : person.balanceMinor < 0 ? 'text-danger' : 'text-text-3')}>
                {person.balanceMinor === 0 ? '✓' : money(Math.abs(person.balanceMinor), base)}
              </dd>
            </div>
          </>
        )}
        {costs.bookedNotInWalletMinor > 0 && (
          <CostRow label={t.home.costsBookedOpen} value={money(costs.bookedNotInWalletMinor, base)} onClick={() => setDetail('bookedNotInWallet')} />
        )}
        {costs.plannedMinor > 0 && (
          <CostRow label={t.home.costsPlanned} value={`≈ ${money(costs.plannedMinor, base)}`} tone="info" onClick={() => setDetail('planned')} />
        )}
        {costs.budgetCapMinor > 0 && (
          <CostRow label={t.home.costsCaps} value={`≤ ${money(costs.budgetCapMinor, base)}`} tone="info" onClick={() => setDetail('budgetCap')} />
        )}
        <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
          <dt className="min-w-0">{t.home.costsProjected}</dt>
          <dd className="shrink-0 tabular">{money(costs.projectedMinor, base)}</dd>
        </div>
      </dl>
      {person && person.unassignedMinor > 0 && <p className="mt-2 text-[12px] text-warn">{t.home.costsUnassigned(money(person.unassignedMinor, base))}</p>}
      {costs.otherCurrencies.length > 0 && (
        <p className="mt-2 text-[13px] text-text-3">
          {t.home.costsOther}: {costs.otherCurrencies.map((c) => money(c.minor, c.currency)).join(' · ')}
        </p>
      )}
      {recent.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-line pt-3">
          {recent.map(({ e, share }) => (
            <li key={e.id} className="flex items-center gap-2.5 text-[14px]">
              <span className="text-text-3">
                <ExpenseIcon category={e.category} size={16} />
              </span>
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              <span className="shrink-0 tabular text-text-2">{share !== null ? money(share, base) : money(e.amountMinor, e.currency)}</span>
            </li>
          ))}
        </ul>
      )}
      {expenses.length === 0 && <p className="mt-2 text-[14px] text-text-3">{t.wallet.empty}</p>}
      <p className="mt-3 text-[12px] leading-snug text-text-3">{t.home.costsHint}</p>
      {detail && <CostBucketSheet snap={snap} bucket={detail} selected={selected} onClose={() => setDetail(null)} />}
    </Card>
  );
}

function CostRow({ label, value, tone, onClick }: { label: string; value: string; tone?: 'info'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-xl px-2 py-1 text-left transition active:bg-surface-2">
      <span className="min-w-0 text-text-2 underline decoration-line-strong decoration-dotted underline-offset-4">{label}</span>
      <span className={cx('flex shrink-0 items-center gap-1 tabular', tone === 'info' && 'text-info')}>
        {value}
        <ChevronRight size={16} className="text-text-3" />
      </span>
    </button>
  );
}

const BUCKET_TITLE: Record<CostBucket, string> = {
  bookedNotInWallet: t.home.costsBookedOpen,
  planned: t.home.costsPlanned,
  budgetCap: t.home.costsCaps,
};

/** Drill-down: the bookings behind a cost line of the overview. */
function CostBucketSheet({ snap, bucket, selected, onClose }: { snap: TripSnapshot; bucket: CostBucket; selected: string[]; onClose: () => void }) {
  const navigate = useNavigate();
  const base = snap.trip.baseCurrency;
  const items = costBucketItems(base, snap.bookings, selected).filter((i) => i.bucket === bucket);
  const total = items.reduce((a, i) => a + i.amountMinor, 0);
  const prefix = bucket === 'planned' ? '≈ ' : bucket === 'budgetCap' ? '≤ ' : '';
  const name = (id: string) => snap.travelers.find((x) => x.id === id)?.name ?? '?';
  return (
    <Sheet open onClose={onClose} title={BUCKET_TITLE[bucket]}>
      <div className="rounded-[1.25rem] bg-surface p-4">
        <p className="text-[13px] text-text-3">{selected.length ? selected.map(name).join(' & ') : t.home.costsAll}</p>
        <p className={cx('font-display text-[30px] font-semibold tabular', bucket !== 'bookedNotInWallet' && 'text-info')}>
          {prefix}
          {money(total, base)}
        </p>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {items.map((i) => {
          const b = snap.bookings.find((x) => x.id === i.bookingId)!;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/buchungen');
                }}
                className="flex w-full items-start gap-3 py-3 text-left"
              >
                <IconTile tone={b.bookingStatus === 'booked' ? 'accent' : 'warn'}>
                  <BookingIcon type={b.type} />
                </IconTile>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{b.title}</span>
                  <span className="block text-[13px] text-text-3">
                    {b.startDate ? formatDate(b.startDate) : t.bookings.undated}
                    {b.travelerIds.length ? ` · ${b.travelerIds.map(name).join(', ')}` : ''}
                  </span>
                  <span className="mt-1.5 block">
                    <BookingBadges booking={b} compact />
                  </span>
                  {selected.length > 0 && i.amountMinor !== b.priceMinor && (
                    <span className="mt-1 block text-[12px] text-text-3">{t.home.costsPartOf(money(b.priceMinor!, base))}</span>
                  )}
                </span>
                <span className={cx('shrink-0 font-semibold tabular', bucket !== 'bookedNotInWallet' && 'text-info')}>
                  {prefix}
                  {money(i.amountMinor, base)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && <p className="mt-3 text-[14px] text-text-3">{t.common.none}</p>}
      <p className="mt-3 text-[12px] leading-snug text-text-3">{bucket === 'bookedNotInWallet' ? t.home.costsBookedOpenHint : t.home.costsPlannedHint}</p>
    </Sheet>
  );
}
