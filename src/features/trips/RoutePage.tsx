import { BedDouble, CalendarDays, Home } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { buildRoute, diffDays, todayIn, type RouteStop } from '../../../shared/trip';
import type { TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { MapView, type MapLine, type MapMarker } from '../../components/MapView';
import { BookingBadges, CategoryIcon, ModeIcon } from '../../components/status';
import { Badge, Card, Skeleton, cx } from '../../components/ui';
import { t } from '../../i18n';
import { formatDate, formatDateShort } from '../../lib/format';

export default function RoutePage() {
  const { snap } = useTrip();
  if (!snap) {
    return (
      <div className="space-y-4 px-safe pt-safe">
        <Skeleton className="mt-6 h-10 w-1/2" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  return <RouteView snap={snap} />;
}

const MODE_COLOR = { flight: '#8EA8FF', boat: '#79AFC7', land: '#F2B45A', unknown: '#52677D' } as const;

function RouteView({ snap }: { snap: TripSnapshot }) {
  const { trip, destinations, bookings, activities } = snap;
  const route = useMemo(() => buildRoute(trip, destinations, bookings), [trip, destinations, bookings]);
  const today = todayIn(destinations[0]?.timezone ?? trip.homeTimezone);
  const current = destinations.find((d) => d.arrivalDate <= today && today < d.departureDate);
  const [selected, setSelected] = useState<string | null>(current?.id ?? null);

  const markers: MapMarker[] = [];
  const seen = new Set<string>();
  route.stops.forEach((s, i) => {
    if (s.lat == null || s.lng == null) return;
    const id = s.kind === 'home' ? 'home' : s.key;
    if (seen.has(id)) return;
    seen.add(id);
    markers.push({ id, lat: s.lat, lng: s.lng, label: s.kind === 'home' ? '⌂' : String(i - (route.stops[0].kind === 'home' ? 0 : -1)), title: s.name, kind: s.kind === 'home' ? 'home' : 'stop' });
  });
  const lines: MapLine[] = route.legs
    .filter((l) => l.from.lat != null && l.to.lat != null)
    .map((l) => ({ from: [l.from.lat!, l.from.lng!], to: [l.to.lat!, l.to.lng!], mode: l.mode }));
  // Focus the map on the destinations (home is far away)
  const focus = markers.filter((m) => m.kind !== 'home').map((m) => m.id);
  const sel = destinations.find((d) => d.id === selected) ?? null;
  const selActs = sel ? activities.filter((a) => a.date >= sel.arrivalDate && a.date < sel.departureDate) : [];
  const selHotel = sel ? bookings.find((b) => b.type === 'hotel' && b.destinationId === sel.id && b.bookingStatus !== 'cancelled') : null;

  return (
    <div>
      <PageHeader title={t.route.title} eyebrow={trip.name}>
        <p className="mt-2 text-[13px] text-text-3">{t.trips.routeHint}</p>
      </PageHeader>
      <div className="px-safe pt-4">
        <MapView markers={markers} lines={lines} selectedId={selected} onSelect={(id) => id !== 'home' && setSelected(id)} focusIds={focus.length ? focus : undefined} className="h-[46dvh] min-h-[300px]" />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-text-2" aria-label={t.route.legend}>
          {(['flight', 'boat', 'land', 'unknown'] as const).map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded" style={{ background: MODE_COLOR[m], borderTop: m !== 'land' ? `2px dashed ${MODE_COLOR[m]}` : undefined, height: m === 'land' ? 3 : 0 }} />
              {t.transportModes[m]}
            </span>
          ))}
        </div>

        {sel && (
          <Card className="mt-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.destinations.stay}</p>
                <h2 className="font-display text-[26px] font-semibold leading-tight">{sel.name}</h2>
                <p className="mt-1 text-[14px] text-text-2">
                  {formatDateShort(sel.arrivalDate)} – {formatDate(sel.departureDate)} · {t.route.nights(diffDays(sel.arrivalDate, sel.departureDate))}
                </p>
              </div>
              {sel.id === current?.id && <Badge tone="accent">{t.common.today}</Badge>}
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-bg-elevated p-4">
              <BedDouble size={18} className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="font-semibold">{sel.accommodationName ?? t.home.accommodationUnknown}</p>
                {sel.accommodationAddress && <p className="text-[13px] text-text-2">{sel.accommodationAddress}</p>}
                {selHotel && (
                  <div className="mt-2">
                    <BookingBadges booking={selHotel} />
                  </div>
                )}
              </div>
            </div>
            <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.destinations.plannedActivities}</h3>
            {selActs.length === 0 ? (
              <p className="mt-1 text-[14px] text-text-3">{t.destinations.noActivities}</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {selActs.map((a) => (
                  <li key={a.id}>
                    <Link to={`/plan?tag=${a.date}`} className="flex items-center gap-2 text-[14px]">
                      <CategoryIcon category={a.category} size={15} />
                      <span className="text-text-3">{formatDateShort(a.date)}</span>
                      <span className="truncate">{a.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link to={`/plan?tag=${sel.arrivalDate}`} className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent">
              <CalendarDays size={15} /> {t.home.viewPlan}
            </Link>
          </Card>
        )}
        {!sel && <p className="mt-4 text-center text-[13px] text-text-3">{t.route.selectStop}</p>}

        {/* Chronological timeline */}
        <ol className="relative mt-6">
          {route.stops.map((s, i) => {
            const leg = route.legs[i];
            return (
              <li key={s.key}>
                <StopRow stop={s} active={s.destination?.id === selected} today={today} onSelect={() => s.destination && setSelected(s.destination.id)} />
                {leg && (
                  <div className="relative ml-[19px] border-l-2 border-dashed py-3 pl-6" style={{ borderColor: MODE_COLOR[leg.mode] }}>
                    <div
                      className={cx(
                        'rounded-2xl border p-3',
                        leg.needsAttention ? 'border-warn/40 bg-warn-soft' : 'border-line bg-surface',
                      )}
                    >
                      <div className="flex items-center gap-2 text-[13px] font-semibold">
                        <span style={{ color: MODE_COLOR[leg.mode] }}>
                          <ModeIcon mode={leg.mode} />
                        </span>
                        {leg.booking?.title ?? `${leg.from.name} → ${leg.to.name}`}
                        {leg.date && <span className="ml-auto font-normal text-text-3">{formatDateShort(leg.date)}</span>}
                      </div>
                      {leg.booking ? (
                        <div className="mt-2">
                          <BookingBadges booking={leg.booking} compact />
                        </div>
                      ) : (
                        <p className="mt-1 text-[13px] text-warn">{t.home.transportMissing(leg.from.name, leg.to.name)}</p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function StopRow({ stop, active, today, onSelect }: { stop: RouteStop; active: boolean; today: string; onSelect: () => void }) {
  const d = stop.destination;
  const isNow = d && d.arrivalDate <= today && today < d.departureDate;
  return (
    <button type="button" onClick={onSelect} disabled={!d} className="flex w-full items-center gap-3 text-left">
      <span
        className={cx(
          'grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 font-bold',
          stop.kind === 'home' ? 'border-sand bg-sand text-[#101b33]' : isNow ? 'border-accent bg-accent text-accent-ink' : active ? 'border-accent text-accent' : 'border-line-strong text-text-2',
        )}
      >
        {stop.kind === 'home' ? <Home size={16} /> : <span className="h-2 w-2 rounded-full bg-current" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-display text-[19px] font-semibold leading-tight', active && 'text-accent')}>{stop.name}</span>
        {d ? (
          <span className="block text-[13px] text-text-3">
            {formatDateShort(d.arrivalDate)} – {formatDate(d.departureDate)} · {t.route.nights(diffDays(d.arrivalDate, d.departureDate))}
          </span>
        ) : (
          <span className="block text-[13px] text-text-3">{t.destinations.home}</span>
        )}
      </span>
      {isNow && <Badge tone="accent">{t.common.today}</Badge>}
    </button>
  );
}
