import {
  AlertTriangle,
  ArrowRight,
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
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { costBucketItems, personCostOverview, tripCostOverview, type CostBucket } from '../../../shared/costs';
import {
  addDaysToDate,
  bookingSortKey,
  bookingsOnDate,
  buildRoute,
  destinationOn,
  diffDays,
  nextTransport,
  sortDestinations,
  todayIn,
  transferReminders,
  tripPhase,
} from '../../../shared/trip';
import type { TripSnapshot } from '../../../shared/types';
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
import { refreshRatesOnce } from '../../lib/rates';
import { LANG_NAMES, phraseLangFor } from '../../lib/phrasebook';
import { bookingTimeLabel } from '../../lib/bookingLabels';
import { setStatusBarOverHero } from '../../lib/theme';
import { CheckinReminders } from '../bookings/CheckinReminders';
import { MissingWalletHint } from '../bookings/MissingWalletHint';
import { staysAt, stopOverview } from '../../../shared/stop';
import { BookingRow, StayCard, StopView } from './StopView';
import { TravelDayCard } from './TravelDayCard';
import { travelDay } from '../../../shared/travelday';
import { bookingsToClarify } from '../../../shared/clarify';

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
  const [activityDate, setActivityDate] = useState<string | null>(null);
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
  const homeDest = phase.phase === 'before' ? destinations[0] : phase.phase === 'after' ? null : (where.current ?? where.leaving);
  // Browse the stops in the hero (tap a stop or swipe); null = today's stop.
  const stops = useMemo(() => sortDestinations(destinations), [destinations]);
  const [viewId, setViewId] = useState<string | null>(null);
  const viewed = viewId ? (stops.find((d) => d.id === viewId) ?? null) : null;
  const browsing = !!viewed && viewed.id !== homeDest?.id;
  const heroDest = browsing ? viewed : homeDest;
  const touch = useRef<{ x: number; y: number } | null>(null);
  function step(dir: 1 | -1) {
    if (!stops.length) return;
    const i = stops.findIndex((d) => d.id === heroDest?.id);
    const next = stops[Math.min(Math.max((i < 0 ? 0 : i) + dir, 0), stops.length - 1)];
    setViewId(next.id === homeDest?.id ? null : next.id);
  }
  const stopData = useMemo(() => (browsing && viewed ? stopOverview(snap, viewed.id, today) : null), [browsing, viewed, snap, today]);
  // Sticky "Vorschau" bar once the hero has scrolled away.
  const heroRef = useRef<HTMLElement | null>(null);
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    if (!browsing) return;
    const update = () => setPastHero(!!heroRef.current && heroRef.current.getBoundingClientRect().bottom < 40);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [browsing]);
  function backToToday() {
    setViewId(null);
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openActivity(date: string | null) {
    setActivityDate(date);
    setSheet('activity');
  }

  // Fresh ECB rates for the converter and new expenses (once per session; existing expenses stay as they are).
  useEffect(() => {
    if (!online || phase.phase === 'after' || !trip.localCurrency || trip.localCurrency === trip.baseCurrency) return;
    void refreshRatesOnce(trip.id, (p) => http.post<{ added: number }>(p)).then((n) => {
      if (n > 0) void tripStore.refresh();
    });
  }, [online, trip.id, trip.localCurrency, trip.baseCurrency, phase.phase]);

  const todays = activities.filter((a) => a.date === today);
  const todaysBookings = bookingsOnDate(bookings, today);
  const viewerTravelerId = snap.travelers.find((x) => x.userId && x.userId === user?.id)?.id ?? null;
  const tday = useMemo(
    () => (phase.phase === 'after' ? null : travelDay(trip, destinations, bookings, today, addDaysToDate(today, 1), viewerTravelerId)),
    [trip, destinations, bookings, today, viewerTravelerId, phase.phase],
  );
  // The travel-day card already covers that leg – no second reminder for it.
  const reminders = useMemo(
    () => transferReminders(trip, destinations, bookings, today).filter((r) => !tday || r.date !== tday.leg.date || r.toName !== tday.leg.to.name),
    [trip, destinations, bookings, today, tday],
  );
  const clarifications = useMemo(() => bookingsToClarify(bookings, today), [bookings, today]);
  const transport = nextTransport(bookings, today);
  const route = useMemo(() => buildRoute(trip, destinations, bookings), [trip, destinations, bookings]);
  const nextLeg = route.legs.find((l) => l.date !== null && l.date >= today);
  const currentStays = where.current ? staysAt(where.current, bookings) : [];
  const upcoming = bookings
    .filter((b) => b.bookingStatus !== 'cancelled' && (b.startDate ?? '') > today)
    .sort((a, b) => bookingSortKey(a).localeCompare(bookingSortKey(b)))
    .slice(0, 3);

  return (
    <div>
      {/* ------------------------------------------------------------------ Hero */}
      {browsing && viewed && pastHero && (
        <div className="glass fixed inset-x-0 top-0 z-30 border-b border-line px-safe pt-safe animate-fade">
          <div className="flex items-center gap-3 py-2.5">
            <p className="min-w-0 flex-1 truncate text-[14px]">
              <span className="font-semibold">{t.home.stopPreview(viewed.name)}</span>
              <span className="text-text-3">
                {' '}
                · {formatDateShort(viewed.arrivalDate)} – {formatDateShort(viewed.departureDate)}
              </span>
            </p>
            <button
              type="button"
              onClick={backToToday}
              className="shrink-0 rounded-full bg-accent-soft px-3.5 py-1.5 text-[13px] font-semibold text-accent active:scale-95"
            >
              {t.home.backToToday}
            </button>
          </div>
        </div>
      )}
      <section
        ref={heroRef}
        className="relative flex min-h-[max(31dvh,250px)] flex-col justify-end"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t0 = touch.current;
          touch.current = null;
          if (!t0 || phase.phase === 'after') return;
          const dx = e.changedTouches[0].clientX - t0.x;
          const dy = e.changedTouches[0].clientY - t0.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
        }}
      >
        <CoverArt
          name={heroDest?.name ?? trip.name}
          imageUrl={heroDest?.coverImageUrl ?? trip.coverImageUrl}
          className="absolute inset-0 h-full w-full rounded-b-[2.25rem]"
          label={heroDest?.name ?? trip.name}
        />
        <div
          className="absolute inset-0 rounded-b-[2.25rem] bg-gradient-to-t from-[#101b33]/90 from-0% via-[#101b33]/50 via-40% to-transparent to-80%"
          aria-hidden
        />
        <div className="absolute inset-x-0 top-0 z-10 px-safe pt-safe">
          <div className="flex items-center justify-end pt-2 text-sand">
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
        <div className="relative px-safe pb-[18px] pt-[calc(max(env(safe-area-inset-top),0.75rem)+3.75rem)] text-[#f5f9fc] [text-shadow:0_1px_10px_rgb(16_27_51/0.45)]">
          <p className="text-[14px] font-medium text-white/85">
            {greeting()}
            {user ? `, ${user.displayName.split(' ')[0]}` : ''} · {formatLongDate(today)}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#d8e9f0]">
              {browsing && viewed
                ? stopLabel(viewed, today, stops.indexOf(viewed) + 1, stops.length)
                : phase.phase === 'during'
                  ? t.home.currentDestination
                  : phase.phase === 'before'
                    ? t.home.beforeTrip
                    : t.phase.after}
            </p>
            {browsing && (
              <button
                type="button"
                onClick={backToToday}
                className="shrink-0 rounded-full bg-white/[0.14] px-3 py-1 text-[12px] font-semibold text-white ring-1 ring-inset ring-white/20 [text-shadow:none] active:scale-95"
              >
                {t.home.backToToday}
              </button>
            )}
          </div>
          <h1 className="font-display text-[clamp(38px,11.5vw,56px)] font-semibold leading-[0.95]">
            {phase.phase === 'after' ? trip.name : (heroDest?.name ?? trip.name)}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[14px]">
            {browsing && viewed && (
              <>
                <span className="rounded-full bg-white/[0.14] px-3 py-1.5 font-semibold text-white ring-1 ring-inset ring-white/20">
                  {formatDateShort(viewed.arrivalDate)} – {formatDateShort(viewed.departureDate)}
                </span>
                <span className="rounded-full px-3 py-1.5 text-white/90 ring-1 ring-inset ring-white/20">
                  {t.home.nights(diffDays(viewed.arrivalDate, viewed.departureDate))}
                </span>
              </>
            )}
            {!browsing && phase.phase === 'during' && (
              <>
                <span className="rounded-full bg-white/[0.14] px-3 py-1.5 font-semibold text-white ring-1 ring-inset ring-white/20">
                  {t.phase.during(phase.day, phase.totalDays)}
                </span>
                <span className="rounded-full px-3 py-1.5 text-white/90 ring-1 ring-inset ring-white/20">{t.phase.remaining(phase.daysRemaining)}</span>
              </>
            )}
            {!browsing && phase.phase === 'before' && (
              <span className="rounded-full bg-white/[0.14] px-3 py-1.5 font-semibold text-white ring-1 ring-inset ring-white/20">
                {t.phase.before(phase.daysUntilStart)}
              </span>
            )}
            {!browsing && where.current && phase.phase === 'during' && (
              <span className="rounded-full px-3 py-1.5 text-white/90 ring-1 ring-inset ring-white/20">
                {t.home.stayUntil(formatDateShort(where.current.departureDate))}
              </span>
            )}
          </div>
          {phase.phase !== 'after' && (
            <TripProgress stops={stops} today={today} selectedId={heroDest?.id ?? null} onSelect={(id) => setViewId(id === homeDest?.id ? null : id)} />
          )}
        </div>
      </section>

      <div className="px-safe">
        {phase.phase !== 'after' && <CheckinReminders snap={snap} canEdit={canEdit} />}
        {tday && <TravelDayCard day={tday} />}
        <MissingWalletHint snap={snap} />
        {((phase.phase === 'during' && phase.daysRemaining <= 3) || phase.phase === 'after') && snap.expenses.length > 0 && (
          <Link to="/abrechnung" className="mt-3 flex items-center gap-3 rounded-[1.25rem] border border-accent/30 bg-accent-soft p-4">
            <Receipt size={20} className="shrink-0 text-accent" />
            <span className="flex-1 text-[14px] font-semibold">{t.report.endHint}</span>
            <ArrowRight size={18} className="shrink-0 text-accent" />
          </Link>
        )}
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
              <Link to="/buchungen?klaeren=1" className="flex items-center gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
                <CircleHelp className="shrink-0 text-warn" size={20} />
                <p className="flex-1 text-[14px] text-text-2">
                  <span className="font-semibold text-text">{clarifications.length}</span> {clarifications.length === 1 ? 'Buchung' : 'Buchungen'} mit offenen
                  Angaben
                </p>
                <ArrowRight size={18} className="text-text-3" />
              </Link>
            )}
          </section>
        )}

        {/* ------------------------------------------------------- Quick actions */}
        <section aria-label={t.home.quickActions} className="mt-6 grid grid-cols-4 gap-2">
          {[
            {
              label: t.home.addActivity,
              icon: <Plus size={20} />,
              onClick: () => openActivity(stopData && stopData.when !== 'past' ? stopData.days[0] : null),
              disabled: !canEdit,
            },
            {
              label: t.home.addExpense,
              icon: <Receipt size={20} />,
              onClick: () => setSheet('expense'),
              disabled: !canEdit || !online,
            },
            // Phrasebook for the trip's country – otherwise the classic "add destination" action.
            phraseLang
              ? {
                  label: LANG_NAMES[phraseLang],
                  icon: <Languages size={20} />,
                  onClick: () => navigate('/sprache'),
                  disabled: false,
                }
              : {
                  label: t.home.addDestination,
                  icon: <MapPin size={20} />,
                  onClick: () => setSheet('destination'),
                  disabled: !canEdit || !online,
                },
            {
              label: t.home.viewPlan,
              icon: <CalendarDays size={20} />,
              onClick: () => navigate('/plan'),
            },
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

        {stopData && <StopView o={stopData} canEdit={canEdit} onAddActivity={openActivity} travelers={snap.travelers} viewerTravelerId={viewerTravelerId} />}

        {!stopData && (
          <>
            <CurrencyConverter snap={snap} today={today} />

            {/* ------------------------------------------------------------- Today */}
            {phase.phase === 'during' && (
              <>
                <SectionTitle
                  action={
                    <Link to={`/plan?tag=${today}`} className="text-[14px] font-semibold text-accent">
                      {t.home.viewPlan}
                    </Link>
                  }
                >
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
                        <Button size="sm" variant="soft" icon={<Plus size={16} />} onClick={() => openActivity(null)}>
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
                <StayCard stop={where.current} stays={currentStays} travelers={snap.travelers} viewerTravelerId={viewerTravelerId} label={t.home.currentStay} />
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
                <SectionTitle
                  action={
                    <Link to="/buchungen" className="text-[14px] font-semibold text-accent">
                      {t.bookings.title}
                    </Link>
                  }
                >
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
            <SectionTitle
              action={
                <Link to="/kasse" className="text-[14px] font-semibold text-accent">
                  {t.wallet.title}
                </Link>
              }
            >
              {t.home.tripCosts}
            </SectionTitle>
            <CostsCard snap={snap} />
          </>
        )}

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
        {sheet === 'activity' && (
          <ActivitySheet
            open
            onClose={() => setSheet(null)}
            defaults={{
              date: activityDate ?? (phase.phase === 'during' ? today : trip.startDate),
            }}
          />
        )}
        {sheet === 'expense' && <ExpenseSheet open onClose={() => setSheet(null)} />}
        {sheet === 'destination' && <DestinationSheet open onClose={() => setSheet(null)} />}
      </Suspense>
    </div>
  );
}

/** Route progress: one segment per stop – tap to look at that stop in the hero. */
function TripProgress({
  stops,
  today,
  selectedId,
  onSelect,
}: {
  stops: TripSnapshot['destinations'];
  today: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!stops.length) return null;
  return (
    <ol className="mt-3.5 flex items-center gap-1.5" aria-label={t.trips.route}>
      {stops.map((d) => {
        const state = d.departureDate <= today ? 'done' : d.arrivalDate <= today ? 'now' : 'next';
        const selected = d.id === selectedId;
        return (
          <li key={d.id} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onSelect(d.id)}
              aria-pressed={selected}
              aria-label={t.home.showStop(d.name)}
              className="flex w-full min-w-0 flex-col gap-1.5 py-1.5 text-left [text-shadow:inherit] active:opacity-70"
            >
              <span
                className={cx(
                  'h-1.5 w-full rounded-full transition',
                  state === 'done' ? 'bg-white/70' : state === 'now' ? 'bg-[#79afc7]' : 'bg-white/25',
                  selected && 'ring-2 ring-white/70 ring-offset-1 ring-offset-transparent',
                )}
              />
              <span className={cx('truncate text-[11px]', selected ? 'font-semibold text-white' : 'text-white/65')}>{d.name}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** "Station 4 von 6 · in 3 Tagen" / "· bereits besucht" / "· jetzt". */
function stopLabel(d: TripSnapshot['destinations'][number], today: string, n: number, total: number): string {
  const when = d.departureDate <= today ? t.home.stopPast : d.arrivalDate <= today ? t.home.stopNow : t.home.stopIn(diffDays(today, d.arrivalDate));
  return `${t.home.stopOf(n, total)} · ${when}`;
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
              <Button
                size="lg"
                icon={<Download size={18} />}
                loading={busy === 'thailand-2026'}
                disabled={!online}
                onClick={() => void importKey('thailand-2026')}
              >
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
        .map((e) => ({
          e,
          share: e.shares.filter((x) => selected.includes(x.travelerId)).reduce((a, x) => a + x.baseShareMinor, 0),
        }))
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
    <button
      type="button"
      onClick={onClick}
      className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-xl px-2 py-1 text-left transition active:bg-surface-2"
    >
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
