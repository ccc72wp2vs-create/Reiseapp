import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Check, CloudUpload, MapPin, Navigation, Plus } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { bookingsOnDate, destinationForDate, destinationOn, diffDays, eachDate, overlappingActivities, todayIn } from '../../../shared/trip';
import type { ActivityDto, TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { moveId, SortableList } from '../../components/SortableList';
import { BookingBadges, BookingIcon, CategoryIcon, IconTile } from '../../components/status';
import { Badge, Button, EmptyState, IconButton, Segmented, Skeleton, cx } from '../../components/ui';
import { t } from '../../i18n';
import { formatDateShort, formatDayNum, formatLongDate, formatMonthShort, formatTime, formatWeekday, money, tzLabel } from '../../lib/format';
import { appleMapsUrl, googleMapsUrl, hasMapTarget } from '../../lib/maps';
import { tripStore, usePendingIds } from '../../lib/store';

const ActivitySheet = lazy(() => import('./ActivitySheet'));

export default function PlanPage() {
  const { snap } = useTrip();
  if (!snap) {
    return (
      <div className="space-y-4 px-safe pt-safe">
        <Skeleton className="mt-6 h-10 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return <Plan snap={snap} />;
}

function Plan({ snap }: { snap: TripSnapshot }) {
  const { canEdit } = useTrip();
  const [params, setParams] = useSearchParams();
  const { trip, destinations, activities, bookings } = snap;
  const tz = destinations[0]?.timezone ?? trip.homeTimezone;
  const today = todayIn(tz);
  const days = useMemo(() => {
    const extra = activities.map((a) => a.date).filter((d) => d < trip.startDate || d > trip.endDate);
    return [...new Set([...eachDate(trip.startDate, trip.endDate), ...extra])].sort();
  }, [trip.startDate, trip.endDate, activities]);
  const selected = params.get('tag') && days.includes(params.get('tag')!) ? params.get('tag')! : days.includes(today) ? today : days[0];
  const [mode, setMode] = useState<'day' | 'all'>('day');
  const [editing, setEditing] = useState<ActivityDto | null>(null);
  const [creating, setCreating] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  // Warm the editor chunk so it is available even if the connection drops.
  useEffect(() => {
    void import('./ActivitySheet');
  }, []);

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selected, mode]);

  const select = (d: string) => setParams({ tag: d }, { replace: true });

  return (
    <div>
      <PageHeader
        title={t.plan.title}
        eyebrow={trip.name}
        action={
          canEdit && (
            <IconButton label={t.plan.addActivity} variant="primary" onClick={() => setCreating(true)}>
              <Plus size={22} />
            </IconButton>
          )
        }
      >
        <Segmented
          className="mt-5"
          value={mode}
          onChange={setMode}
          label={t.plan.title}
          options={[
            { value: 'day', label: t.plan.day(days.indexOf(selected) + 1) },
            { value: 'all', label: t.common.all },
          ]}
        />
      </PageHeader>

      {mode === 'day' ? (
        <>
          <div ref={stripRef} className="no-scrollbar relative mt-4 flex snap-x gap-2 overflow-x-auto px-safe pb-2" role="tablist" aria-label={t.plan.title}>
            {days.map((d, i) => {
              const count = activities.filter((a) => a.date === d).length + bookingsOnDate(bookings, d).length;
              const active = d === selected;
              const isToday = d === today;
              return (
                <button
                  key={d}
                  data-day={d}
                  role="tab"
                  aria-selected={active}
                  onClick={() => select(d)}
                  className={cx(
                    'flex w-[62px] shrink-0 snap-center flex-col items-center rounded-[1.25rem] border py-2.5 transition',
                    active ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2',
                  )}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{formatWeekday(d)}</span>
                  <span className="font-display text-[22px] font-semibold leading-tight">{formatDayNum(d)}</span>
                  <span className="text-[10px] opacity-60">{formatMonthShort(d)}</span>
                  <span className={cx('mt-1 h-1.5 w-1.5 rounded-full', count ? (active ? 'bg-accent' : 'bg-accent') : 'bg-transparent', isToday && !active && 'ring-2 ring-accent/40')} />
                  <span className="sr-only">{t.plan.day(i + 1)}</span>
                </button>
              );
            })}
          </div>
          <DayView snap={snap} date={selected} dayIndex={days.indexOf(selected)} today={today} onEdit={setEditing} onAdd={() => setCreating(true)} />
        </>
      ) : (
        <AllDays snap={snap} days={days} today={today} onSelect={(d) => {
          select(d);
          setMode('day');
        }} />
      )}

      <Suspense fallback={null}>
        {creating && <ActivitySheet open onClose={() => setCreating(false)} defaults={{ date: selected }} />}
        {editing && <ActivitySheet key={editing.id} open activity={editing} onClose={() => setEditing(null)} />}
      </Suspense>
    </div>
  );
}

function DayView({
  snap,
  date,
  dayIndex,
  today,
  onEdit,
  onAdd,
}: {
  snap: TripSnapshot;
  date: string;
  dayIndex: number;
  today: string;
  onEdit: (a: ActivityDto) => void;
  onAdd: () => void;
}) {
  const { canEdit } = useTrip();
  const pendingIds = usePendingIds();
  const { trip, destinations, activities, bookings, places, members } = snap;
  const dayActs = activities.filter((a) => a.date === date).sort((a, b) => a.sortOrder - b.sortOrder);
  const dayBookings = bookingsOnDate(bookings, date);
  const dest = destinationForDate(destinations, date);
  const where = destinationOn(destinations, date);
  const conflicts = overlappingActivities(dayActs);
  const outside = date < trip.startDate || date > trip.endDate;
  const ids = dayActs.map((a) => a.id);
  const memberName = (id: string | null) => members.find((m) => m.userId === id)?.displayName;

  return (
    <section className="px-safe">
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[26px] font-semibold leading-tight">{formatLongDate(date)}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-text-2">
            <MapPin size={14} className="text-accent" />
            {where.isTransferDay && where.leaving && where.current
              ? `${where.leaving.name} → ${where.current.name}`
              : (dest?.name ?? t.common.none)}
            {dest && <span className="text-text-3">· {t.plan.timeLocal(tzLabel(dest.timezone))}</span>}
          </p>
        </div>
        {outside ? <Badge tone="warn">{t.plan.outsideTrip}</Badge> : date === today ? <Badge tone="accent">{t.common.today}</Badge> : null}
      </div>

      {dayBookings.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.plan.bookingsOfDay}</h3>
          <ul className="space-y-2.5">
            {dayBookings.map((b) => (
              <li key={b.id}>
                <Link to="/buchungen" className="flex items-start gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
                  <IconTile tone={b.bookingStatus === 'booked' ? 'accent' : 'warn'}>
                    <BookingIcon type={b.type} />
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{b.title}</p>
                    <p className="text-[13px] text-text-3">
                      {b.startDate === date
                        ? b.startTime
                          ? `${t.bookings.departure} ${formatTime(b.startTime)}`
                          : b.type === 'hotel'
                            ? 'Check-in'
                            : t.common.notSet
                        : `${t.bookings.arrival} ${formatTime(b.endTime)}`}
                    </p>
                    <div className="mt-2">
                      <BookingBadges booking={b} compact />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        {dayActs.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={24} />}
            title={t.plan.empty}
            text={t.plan.emptyText}
            action={
              canEdit && (
                <Button icon={<Plus size={18} />} onClick={onAdd}>
                  {t.plan.addActivity}
                </Button>
              )
            }
          />
        ) : (
          <SortableList
            items={dayActs}
            disabled={!canEdit}
            onReorder={(order) => tripStore.activities.reorder(date, order)}
            renderItem={(a, handle, i) => {
              const place = places.find((p) => p.id === a.placeId);
              const mapTarget = { lat: a.lat ?? place?.lat, lng: a.lng ?? place?.lng, query: a.locationName ?? place?.name };
              return (
                <div
                  className={cx(
                    'flex items-stretch gap-1 rounded-[1.25rem] border bg-surface p-2 pr-3 shadow-card',
                    conflicts.has(a.id) ? 'border-warn/50' : 'border-line',
                  )}
                >
                  {handle}
                  <button
                    type="button"
                    aria-label={a.completed ? t.plan.markOpen : t.plan.markDone}
                    disabled={!canEdit}
                    onClick={() => tripStore.activities.update(a.id, { completed: !a.completed })}
                    className={cx(
                      'mt-2.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition',
                      a.completed ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong',
                    )}
                  >
                    {a.completed && <Check size={15} strokeWidth={3} />}
                  </button>
                  <button type="button" className="min-w-0 flex-1 px-2 py-1.5 text-left" onClick={() => onEdit(a)} disabled={!canEdit}>
                    <div className="flex items-center gap-2 text-[13px] text-text-3">
                      <CategoryIcon category={a.category} size={14} />
                      <span>{a.startTime ? `${a.startTime}${a.endTime ? `–${a.endTime}` : ''}` : t.plan.allDay}</span>
                      {pendingIds.has(a.id) && (
                        <span className="inline-flex items-center gap-1 text-info" title={t.plan.pendingSync}>
                          <CloudUpload size={13} />
                        </span>
                      )}
                    </div>
                    <p className={cx('mt-0.5 text-[16px] font-semibold leading-snug', a.completed && 'text-text-3 line-through')}>{a.title}</p>
                    {(a.locationName || place) && <p className="mt-0.5 truncate text-[13px] text-text-2">{a.locationName ?? place?.name}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {a.bookingStatus !== 'planned' && <Badge tone={a.bookingStatus === 'booked' ? 'success' : a.bookingStatus === 'cancelled' ? 'danger' : 'warn'}>{t.bookingStatus[a.bookingStatus]}</Badge>}
                      {a.estCostMinor != null && a.currency && <Badge>≈ {money(a.estCostMinor, a.currency)}</Badge>}
                      {conflicts.has(a.id) && (
                        <Badge tone="warn" icon={<AlertTriangle size={12} />}>
                          {t.conflicts.timeOverlap}
                        </Badge>
                      )}
                    </div>
                    {a.updatedBy && memberName(a.updatedBy) && members.length > 1 && (
                      <p className="mt-1.5 text-[11px] text-text-3">
                        {t.plan.createdBy}: {memberName(a.createdBy) ?? memberName(a.updatedBy)}
                      </p>
                    )}
                  </button>
                  <div className="flex shrink-0 flex-col items-center justify-between gap-1 py-1">
                    {hasMapTarget(mapTarget) ? (
                      <a
                        href={/iPhone|iPad|Mac/.test(navigator.userAgent) ? appleMapsUrl(mapTarget) : googleMapsUrl(mapTarget)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t.common.navigate}
                        className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-accent"
                      >
                        <Navigation size={16} />
                      </a>
                    ) : (
                      <span className="h-9 w-9" />
                    )}
                    {canEdit && (
                      <div className="flex flex-col">
                        <button
                          type="button"
                          aria-label={t.common.moveUp}
                          disabled={i === 0}
                          onClick={() => {
                            const next = moveId(ids, a.id, -1);
                            if (next) tripStore.activities.reorder(date, next);
                          }}
                          className="grid h-8 w-9 place-items-center text-text-3 disabled:opacity-25"
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={t.common.moveDown}
                          disabled={i === dayActs.length - 1}
                          onClick={() => {
                            const next = moveId(ids, a.id, 1);
                            if (next) tripStore.activities.reorder(date, next);
                          }}
                          className="grid h-8 w-9 place-items-center text-text-3 disabled:opacity-25"
                        >
                          <ArrowDown size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />
        )}
        {dayActs.length > 0 && canEdit && (
          <Button variant="secondary" block className="mt-4" icon={<Plus size={18} />} onClick={onAdd}>
            {t.plan.addActivity}
          </Button>
        )}
        <p className="mt-6 text-center text-[12px] text-text-3">{t.plan.day(dayIndex + 1)} · {formatDateShort(date)}</p>
      </div>
    </section>
  );
}

function AllDays({ snap, days, today, onSelect }: { snap: TripSnapshot; days: string[]; today: string; onSelect: (d: string) => void }) {
  const { destinations, activities, bookings } = snap;
  return (
    <ol className="relative mt-6 px-safe">
      {days.map((d, i) => {
        const acts = activities.filter((a) => a.date === d);
        const bks = bookingsOnDate(bookings, d);
        const dest = destinationForDate(destinations, d);
        const first = destinations.find((x) => x.arrivalDate === d);
        return (
          <li key={d} className="relative pl-8">
            <span className={cx('absolute left-[11px] top-0 h-full w-px', i === days.length - 1 ? 'bg-transparent' : 'bg-line-strong')} aria-hidden />
            <span
              className={cx(
                'absolute left-0 top-3 grid h-6 w-6 place-items-center rounded-full border-2 text-[10px] font-bold',
                d === today ? 'border-accent bg-accent text-accent-ink' : d < today ? 'border-line-strong bg-surface-2 text-text-3' : 'border-accent/60 bg-bg text-accent',
              )}
            >
              {i + 1}
            </span>
            {first && <p className="pb-1 pt-2 font-display text-[20px] font-semibold text-accent">{first.name}</p>}
            <button type="button" onClick={() => onSelect(d)} className="mb-3 w-full rounded-[1.25rem] border border-line bg-surface p-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{formatLongDate(d)}</span>
                <span className="text-[12px] text-text-3">{dest?.name}</span>
              </div>
              {bks.length + acts.length === 0 ? (
                <p className="mt-1 text-[14px] text-text-3">{t.plan.empty}</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {bks.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 text-[14px] text-text-2">
                      <BookingIcon type={b.type} size={14} />
                      <span className="truncate">{b.title}</span>
                      {b.bookingStatus !== 'booked' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />}
                    </li>
                  ))}
                  {acts.map((a) => (
                    <li key={a.id} className={cx('flex items-center gap-2 text-[14px]', a.completed ? 'text-text-3 line-through' : 'text-text')}>
                      <CategoryIcon category={a.category} size={14} />
                      <span className="truncate">
                        {a.startTime ? `${a.startTime} ` : ''}
                        {a.title}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {diffDays(today, d) === 0 && <span className="mt-2 inline-block text-[12px] font-semibold text-accent">{t.common.today}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
