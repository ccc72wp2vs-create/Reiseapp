import { CalendarDays, CheckCircle2, Compass, MapPin, Plane, Route as RouteIcon, Share2, Star, ThumbsUp, Wallet } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { buildRecap } from '../../../shared/recap';
import { buildRoute, destinationOn, sortDestinations, todayIn } from '../../../shared/trip';
import type { TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { CoverArt } from '../../components/CoverArt';
import { MapView, type MapLine, type MapMarker } from '../../components/MapView';
import { toast } from '../../components/toast';
import { Button, Card, SectionTitle, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { formatRange, money } from '../../lib/format';

export default function RecapPage() {
  const { snap } = useTrip();
  if (!snap) {
    return (
      <div className="space-y-4 px-safe pt-safe">
        <Skeleton className="mt-6 h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <Recap snap={snap} />;
}

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-[1.25rem] border border-line bg-surface p-4">
      <span className="text-accent">{icon}</span>
      <p className="mt-2 font-display text-[26px] font-semibold leading-none tabular">{value}</p>
      <p className="mt-1 text-[13px] text-text-3">{label}</p>
    </div>
  );
}

function Recap({ snap }: { snap: TripSnapshot }) {
  const { trip, destinations, bookings, travelers } = snap;
  const base = trip.baseCurrency;
  const probe = destinationOn(destinations, todayIn(trip.homeTimezone)).current ?? destinations[0];
  const today = todayIn(probe?.timezone ?? trip.homeTimezone);
  const r = useMemo(() => buildRecap(snap, today), [snap, today]);
  const route = useMemo(() => buildRoute(trip, destinations, bookings), [trip, destinations, bookings]);
  const stops = sortDestinations(destinations);
  const name = (id: string) => travelers.find((x) => x.id === id)?.name ?? '?';
  const nf = new Intl.NumberFormat('de-DE');

  const markers: MapMarker[] = stops.filter((d) => d.lat != null && d.lng != null).map((d, i) => ({ id: d.id, lat: d.lat!, lng: d.lng!, label: String(i + 1), title: d.name, kind: 'stop' }));
  const lines: MapLine[] = route.legs
    .filter((l) => l.from.kind !== 'home' && l.to.kind !== 'home' && l.from.lat != null && l.to.lat != null)
    .map((l) => ({ from: [l.from.lat!, l.from.lng!], to: [l.to.lat!, l.to.lng!], mode: l.mode }));

  async function share() {
    const lines = [
      `${trip.name} – ${t.recap.title}`,
      `${formatRange(trip.startDate, trip.endDate)}`,
      `📍 ${stops.map((d) => d.name).join(' → ')}`,
      `🗓️ ${t.recap.daysLabel(r.days, r.totalDays, r.finished)}`,
      `✈️ ${nf.format(r.distanceKm)} km · ${r.transports} ${t.recap.transports}`,
      `💶 ${t.recap.perPerson}: ${r.costPerTraveler.map((c) => `${name(c.travelerId)} ${money(c.amountMinor, base)}`).join(', ')}`,
      ...(r.topPlaces.length ? [`❤️ ${r.topPlaces.map((p) => p.name).join(', ')}`] : []),
    ];
    const text = lines.join('\n');
    try {
      if (navigator.share) await navigator.share({ title: `${trip.name} – ${t.recap.title}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast(t.recap.copied);
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div>
      <PageHeader title={t.recap.title} eyebrow={trip.name} />
      <div className="px-safe pt-4">
        <section className="relative overflow-hidden rounded-[1.75rem]">
          <CoverArt name={stops[stops.length - 1]?.name ?? trip.name} imageUrl={trip.coverImageUrl} className="h-48 w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#101b33] via-[#101b33]/30 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 p-5 text-[#f5f9fc]">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/70">{r.finished ? t.recap.done : t.recap.soFar}</p>
            <p className="font-display text-[30px] font-semibold leading-tight">{trip.name}</p>
            <p className="text-[14px] text-white/80">{formatRange(trip.startDate, trip.endDate)}</p>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat icon={<CalendarDays size={20} />} value={r.finished ? String(r.totalDays) : `${r.days}/${r.totalDays}`} label={t.recap.days} />
          <Stat icon={<MapPin size={20} />} value={String(r.stops)} label={t.recap.stops} />
          <Stat icon={<RouteIcon size={20} />} value={`${nf.format(r.distanceKm)} km`} label={t.recap.distance} />
          <Stat icon={<Plane size={20} />} value={String(r.transports)} label={t.recap.transports} />
          <Stat icon={<CheckCircle2 size={20} />} value={String(r.activitiesDone)} label={t.recap.activities} />
          <Stat icon={<Compass size={20} />} value={String(r.placesSaved)} label={t.recap.places} />
        </div>

        {markers.length > 0 && (
          <>
            <SectionTitle>{t.recap.route}</SectionTitle>
            <MapView markers={markers} lines={lines} className="h-[38dvh] min-h-[260px]" />
            <p className="mt-2 text-[14px] text-text-2">{stops.map((d) => d.name).join(' → ')}</p>
          </>
        )}

        <SectionTitle>{t.recap.costs}</SectionTitle>
        <Card className="divide-y divide-line">
          {r.costPerTraveler.map((c) => (
            <div key={c.travelerId} className="flex items-center gap-3 p-4">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: travelers.find((x) => x.id === c.travelerId)?.color }} />
              <span className="min-w-0 flex-1 truncate font-medium">{name(c.travelerId)}</span>
              <span className="font-semibold tabular">{money(c.amountMinor, base)}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 p-4 text-text-2">
            <Wallet size={16} />
            <span className="flex-1">{t.recap.total}</span>
            <span className="font-semibold tabular">{money(r.totalMinor, base)}</span>
          </div>
        </Card>
        <p className="mt-2 text-[12px] text-text-3">{t.recap.costsHint}</p>

        {r.topPlaces.length > 0 && (
          <>
            <SectionTitle>{t.recap.favorites}</SectionTitle>
            <Card className="divide-y divide-line">
              {r.topPlaces.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 p-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[14px] font-bold text-accent">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  {p.votes > 0 && (
                    <span className="inline-flex items-center gap-1 text-[13px] text-text-2">
                      <ThumbsUp size={14} /> {p.votes}
                    </span>
                  )}
                  {p.favorite && <Star size={16} className="text-warn" fill="currentColor" />}
                </div>
              ))}
            </Card>
          </>
        )}

        <div className="mt-6">
          <Button block icon={<Share2 size={18} />} onClick={() => void share()}>
            {t.recap.share}
          </Button>
        </div>
      </div>
    </div>
  );
}
