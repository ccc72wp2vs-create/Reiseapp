import { CalendarPlus, Compass, ExternalLink, List, Map as MapIcon, MapPin, Navigation, Plus, Route, Search, Star, ThumbsUp } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { PLACE_CATEGORIES, type PlaceCategory } from '../../../shared/constants';
import { destinationOn, sortDestinations, todayIn, tripPhase } from '../../../shared/trip';
import type { PlaceDto, TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { MapView, type MapMarker } from '../../components/MapView';
import { CategoryIcon } from '../../components/status';
import { Badge, Button, Chip, EmptyState, IconButton, Input, Segmented, Skeleton, cx } from '../../components/ui';
import { t } from '../../i18n';
import { appleMapsUrl } from '../../lib/maps';
import { tripStore, useOnline } from '../../lib/store';
import { http } from '../../lib/api';
import { toast } from '../../components/toast';
import { useGoogleConfig } from '../../lib/google';
import { errorMessage } from '../../lib/api';
import { formatDistance, formatDuration, googleMapsSearchUrl, GOOGLE_CATEGORIES } from '../../../shared/google';
import { GooglePlace } from './google/GooglePlace';
import { Nearby } from './google/Nearby';

const PlaceSheet = lazy(() => import('./PlaceSheet'));
const ActivitySheet = lazy(() => import('../itinerary/ActivitySheet'));

/** Destination the travelers are at today (null outside the trip). */
function currentStopId(snap: TripSnapshot): string | null {
  const { trip, destinations } = snap;
  const probe = destinationOn(destinations, todayIn(trip.homeTimezone)).current ?? sortDestinations(destinations)[0];
  const today = todayIn(probe?.timezone ?? trip.homeTimezone);
  if (tripPhase(trip, today).phase !== 'during') return null;
  const where = destinationOn(destinations, today);
  return (where.current ?? where.leaving ?? where.next)?.id ?? null;
}

/** Initial route filter: today's stop, before the trip the first stop, otherwise everything. */
function defaultStop(snap: TripSnapshot): string {
  const cur = currentStopId(snap);
  if (cur) return cur;
  const first = sortDestinations(snap.destinations)[0];
  const today = todayIn(first?.timezone ?? snap.trip.homeTimezone);
  return first && tripPhase(snap.trip, today).phase === 'before' ? first.id : 'all';
}

export default function ExplorePage() {
  const { snap } = useTrip();
  if (!snap) {
    return (
      <div className="space-y-4 px-safe pt-safe">
        <Skeleton className="mt-6 h-10 w-1/2" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  return <Explore snap={snap} />;
}

function Explore({ snap }: { snap: TripSnapshot }) {
  const { canEdit } = useTrip();
  const google = useGoogleConfig(snap.trip.id);
  const [source, setSource] = useState<'mine' | 'nearby'>('mine');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<PlaceCategory | 'all' | 'fav'>('all');
  const [editing, setEditing] = useState<PlaceDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState<PlaceDto | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { places, destinations } = snap;
  const route = useMemo(() => sortDestinations(destinations), [destinations]);
  const currentId = currentStopId(snap);
  // Default: the place where the travelers are right now (before the trip: the first stop).
  const [stop, setStop] = useState<string>(() => defaultStop(snap));
  useEffect(() => {
    if (stop !== 'all' && stop !== 'none' && !route.some((d) => d.id === stop)) setStop('all');
  }, [route, stop]);
  // Where we are right now comes first, then the rest of the route in travel order.
  const stops = currentId ? [...route.filter((d) => d.id === currentId), ...route.filter((d) => d.id !== currentId)] : route;
  const unassigned = (p: PlaceDto) => !route.some((d) => d.id === p.destinationId);
  const inStop = useMemo(
    () => places.filter((p) => stop === 'all' || (stop === 'none' ? !route.some((d) => d.id === p.destinationId) : p.destinationId === stop)),
    [places, stop, route],
  );
  const stopName = route.find((d) => d.id === stop)?.name;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inStop.filter(
      (p) =>
        (cat === 'all' || (cat === 'fav' ? p.favorite : p.category === cat)) &&
        (!q || p.name.toLowerCase().includes(q) || (p.address ?? '').toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)),
    );
  }, [inStop, query, cat]);
  // Most 👍 first – the group's favourites float to the top.
  const sorted = useMemo(() => [...filtered].sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0)), [filtered]);
  const usedCats = PLACE_CATEGORIES.filter((c) => inStop.some((p) => p.category === c));
  const markers: MapMarker[] = filtered
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, label: p.favorite ? '★' : '•', title: p.name, kind: p.favorite ? 'fav' : 'place' }));
  const sel = filtered.find((p) => p.id === selected) ?? null;

  return (
    <div>
      <PageHeader
        title={t.explore.title}
        eyebrow={t.explore.subtitle}
        action={
          canEdit && (
            <IconButton label={t.explore.add} variant="primary" onClick={() => setCreating(true)}>
              <Plus size={22} />
            </IconButton>
          )
        }
      />

      {google?.enabled && (
        <div className="px-safe pt-4">
          <Segmented
            value={source}
            onChange={setSource}
            options={[
              { value: 'mine', label: <><Star size={15} /> Eure Orte</> },
              { value: 'nearby', label: <><Compass size={15} /> In der Nähe</> },
            ]}
          />
        </div>
      )}

      {source === 'nearby' && google?.enabled ? (
        <div className="px-safe pt-4">
          <Nearby snap={snap} />
        </div>
      ) : places.length === 0 ? (
        <div className="px-safe pt-6">
          <EmptyState
            icon={<Compass size={26} />}
            title={t.explore.empty}
            text={t.explore.emptyText}
            action={
              canEdit && (
                <Button icon={<Plus size={18} />} onClick={() => setCreating(true)}>
                  {t.explore.add}
                </Button>
              )
            }
          />
          {google && !google.enabled && <GoogleMapsLinks snap={snap} stopId={stop} />}
        </div>
      ) : (
        <>
          <div className="space-y-3 px-safe pt-5">
            <label className="relative block">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-3" />
              <span className="sr-only">{t.common.search}</span>
              <Input type="search" placeholder={t.explore.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-11" />
            </label>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: <><List size={16} /> {t.explore.list}</> },
                { value: 'map', label: <><MapIcon size={16} /> {t.explore.map}</> },
              ]}
            />
          </div>
          <div role="group" aria-label={t.explore.routeFilter} className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-safe pb-1">
            {stops.map((d) => (
              <Chip key={d.id} active={stop === d.id} onClick={() => setStop(d.id)} icon={<MapPin size={14} />}>
                {d.name}
                {d.id === currentId ? ` · ${t.explore.now}` : ''} ({places.filter((p) => p.destinationId === d.id).length})
              </Chip>
            ))}
            <Chip active={stop === 'all'} onClick={() => setStop('all')} icon={<Route size={14} />}>
              {t.explore.wholeRoute} ({places.length})
            </Chip>
            {places.some(unassigned) && (
              <Chip active={stop === 'none'} onClick={() => setStop('none')}>
                {t.explore.noStop}
              </Chip>
            )}
          </div>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-safe pb-1">
            <Chip active={cat === 'all'} onClick={() => setCat('all')}>
              {t.common.all}
            </Chip>
            <Chip active={cat === 'fav'} onClick={() => setCat('fav')} icon={<Star size={14} />}>
              {t.explore.favorites}
            </Chip>
            {usedCats.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)} icon={<CategoryIcon category={c} size={14} />}>
                {t.categories[c]}
              </Chip>
            ))}
          </div>

          <div className="px-safe pt-4">
            {view === 'map' && (
              <div className="mb-4">
                <MapView markers={markers} selectedId={selected} onSelect={setSelected} className="h-[52dvh] min-h-[320px]" />
                {sel && <PlaceCard place={sel} snap={snap} maps={google?.provider ?? null} onEdit={() => setEditing(sel)} onPlan={() => setPlanning(sel)} highlight />}
                {filtered.some((p) => p.lat == null) && <p className="mt-3 text-[13px] text-text-3">{t.explore.noCoords}: {filtered.filter((p) => p.lat == null).map((p) => p.name).join(', ')}</p>}
              </div>
            )}
            {view === 'list' && (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
                {sorted.map((p) => (
                  <PlaceCard key={p.id} place={p} snap={snap} maps={google?.provider ?? null} onEdit={() => setEditing(p)} onPlan={() => setPlanning(p)} />
                ))}
                {filtered.length === 0 && (
                  <p className="py-8 text-center text-text-3 sm:col-span-2">{inStop.length === 0 && stopName ? t.explore.noPlacesAt(stopName) : t.explore.noResults}</p>
                )}
              </div>
            )}
            {google && !google.enabled && <GoogleMapsLinks snap={snap} stopId={stop} />}
          </div>
        </>
      )}

      <Suspense fallback={null}>
        {creating && <PlaceSheet open onClose={() => setCreating(false)} defaultDestinationId={route.some((d) => d.id === stop) ? stop : null} />}
        {editing && <PlaceSheet key={editing.id} open place={editing} onClose={() => setEditing(null)} />}
        {planning && (
          <ActivitySheet
            open
            onClose={() => setPlanning(null)}
            defaults={{
              title: planning.name,
              category: planning.category,
              placeId: planning.id,
              locationName: planning.address ?? planning.name,
              lat: planning.lat,
              lng: planning.lng,
              googlePlaceId: planning.googlePlaceId ?? null,
              date: destinations.find((d) => d.id === planning.destinationId)?.arrivalDate,
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

function VoteButton({ place, snap }: { place: PlaceDto; snap: TripSnapshot }) {
  const { me } = useTrip();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const votes = place.votes ?? [];
  const mine = !!me && votes.includes(me.id);
  const voters = votes.map((id) => snap.travelers.find((x) => x.id === id)).filter((x) => !!x);
  return (
    <button
      type="button"
      aria-pressed={mine}
      aria-label={t.explore.vote(votes.length)}
      title={me ? undefined : t.explore.voteNeedsTraveler}
      disabled={!me || !online || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await tripStore.mutate(() => http.put(`/trips/${snap.trip.id}/places/${place.id}/vote`, { vote: !mine }));
        } catch (e) {
          toast.error(e);
        } finally {
          setBusy(false);
        }
      }}
      className={cx(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition active:scale-95 disabled:opacity-50',
        mine ? 'border-transparent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-text-2',
      )}
    >
      <ThumbsUp size={15} fill={mine ? 'currentColor' : 'none'} />
      {votes.length > 0 && <span className="tabular">{votes.length}</span>}
      {voters.length > 0 && (
        <span className="ml-0.5 flex -space-x-1.5" aria-hidden>
          {voters.slice(0, 4).map((v) => (
            <span key={v.id} className="grid h-5 w-5 place-items-center rounded-full border border-surface text-[10px] font-bold text-[#101b33]" style={{ background: v.color }}>
              {v.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function PlaceCard({
  place,
  snap,
  maps,
  onEdit,
  onPlan,
  highlight,
}: {
  place: PlaceDto;
  snap: TripSnapshot;
  maps: 'google' | 'geoapify' | null;
  onEdit: () => void;
  onPlan: () => void;
  highlight?: boolean;
}) {
  const { canEdit } = useTrip();
  const planned = snap.activities.filter((a) => a.placeId === place.id);
  const dest = snap.destinations.find((d) => d.id === place.destinationId);
  const target = { lat: place.lat, lng: place.lng, query: place.address ?? place.name };
  return (
    <article className={cx('min-w-0 rounded-[1.5rem] border bg-surface p-4 shadow-card', highlight ? 'mt-3 border-accent/50' : 'border-line')}>
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <CategoryIcon category={place.category} size={20} />
        </span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onEdit} disabled={!canEdit}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-3">
            {t.categories[place.category]}
            {dest ? ` · ${dest.name}` : ''}
          </p>
          <h3 className="mt-0.5 font-display text-[19px] font-semibold leading-snug">{place.name}</h3>
          {place.address && <p className="mt-0.5 truncate text-[13px] text-text-2">{place.address}</p>}
        </button>
        <button
          type="button"
          aria-label={t.explore.favorite}
          aria-pressed={place.favorite}
          disabled={!canEdit}
          onClick={() => tripStore.places.update(place.id, { favorite: !place.favorite })}
          className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full', place.favorite ? 'text-warn' : 'text-text-3')}
        >
          <Star size={20} fill={place.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      {place.description && <p className="mt-3 line-clamp-2 text-[14px] leading-relaxed text-text-2">{place.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {planned.length > 0 && <Badge tone="accent">{t.explore.planned} ({planned.length})</Badge>}
        {place.lat == null && <Badge>{t.explore.noCoords}</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <VoteButton place={place} snap={snap} />
        {canEdit && (
          <Button size="sm" variant="soft" icon={<CalendarPlus size={16} />} onClick={onPlan}>
            {t.explore.addToPlan}
          </Button>
        )}
        <a
          href={appleMapsUrl(target)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 text-[13px] font-semibold"
        >
          <Navigation size={14} /> Apple Karten
        </a>
        <a
          href={googleMapsSearchUrl(place.name, place.address ?? dest?.name ?? null)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 text-[13px] font-semibold"
        >
          <Star size={14} /> Bewertungen bei Google
        </a>
        {maps && <GoogleExtras place={place} snap={snap} provider={maps} />}
        {place.externalUrl && (
          <a
            href={place.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 text-[13px] font-semibold"
          >
            <ExternalLink size={14} /> Link
          </a>
        )}
      </div>
    </article>
  );
}

/**
 * Live Google information for a saved place: Google's own place card, travel
 * time from your stay, and – once – linking the place to Google by its ID.
 * Nothing Google returns is stored except the place ID.
 */
function GoogleExtras({ place, snap, provider }: { place: PlaceDto; snap: TripSnapshot; provider: 'google' | 'geoapify' }) {
  const { canEdit } = useTrip();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [travel, setTravel] = useState<string | null>(null);
  const tripId = snap.trip.id;

  async function findMatch() {
    setBusy(true);
    try {
      const r = await http.post<{ googlePlaceId: string | null }>(`/trips/${tripId}/google/match/${place.id}`);
      setCandidate(r.googlePlaceId);
      if (!r.googlePlaceId) toast('Bei Google nichts Passendes gefunden.', 'info');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function travelTime() {
    setBusy(true);
    try {
      const r = await http.post<{ origin: { label: string }; noRoute: boolean; durationSec?: number; distanceMeters?: number }>(`/trips/${tripId}/maps/distance`, { placeId: place.id });
      setTravel(
        r.noRoute
          ? `Keine Straßenroute ab ${r.origin.label} – evtl. Fähre oder Boot.`
          : `${formatDuration(r.durationSec!)} mit dem Auto · ${formatDistance(r.distanceMeters!)} ab ${r.origin.label}${provider === 'google' ? ' (Google Maps)' : ' (OpenStreetMap)'}`,
      );
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!online) return null;
  const canRoute = (provider === 'google' && !!place.googlePlaceId) || (place.lat != null && place.lng != null);
  return (
    <>
      {provider !== 'google' ? null : place.googlePlaceId ? (
        <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Google-Infos ausblenden' : 'Google-Infos'}
        </Button>
      ) : (
        canEdit &&
        place.lat != null &&
        candidate === undefined && (
          <Button size="sm" variant="secondary" loading={busy} onClick={findMatch}>
            Mit Google verknüpfen
          </Button>
        )
      )}
      {canRoute && !travel && (
        <Button size="sm" variant="secondary" loading={busy} onClick={travelTime}>
          Fahrzeit
        </Button>
      )}
      {travel && <p className="w-full text-[13px] text-text-2">{travel}</p>}
      {open && place.googlePlaceId && (
        <div className="w-full">
          <GooglePlace tripId={tripId} placeId={place.googlePlaceId} />
        </div>
      )}
      {candidate && (
        <div className="w-full space-y-2">
          <p className="text-[13px] font-semibold">Ist das „{place.name}“?</p>
          <GooglePlace tripId={tripId} placeId={candidate} />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                tripStore.places.update(place.id, { googlePlaceId: candidate });
                toast('Mit Google verknüpft – nur die Google-ID wird gespeichert.');
                setCandidate(null);
                setOpen(true);
              }}
            >
              Ja, verknüpfen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCandidate(null)}>
              Nein
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Without a search provider: one tap opens the category near the current stop
 * in the Google Maps app (plain links – no API, no key, no cost).
 */
function GoogleMapsLinks({ snap, stopId }: { snap: TripSnapshot; stopId: string }) {
  const route = sortDestinations(snap.destinations);
  const dest = route.find((d) => d.id === stopId) ?? route.find((d) => d.id === currentStopId(snap)) ?? route[0];
  if (!dest) return null;
  return (
    <div className="mt-8">
      <p className="text-[13px] font-semibold text-text-2">In Google Maps entdecken · {dest.name}</p>
      <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {GOOGLE_CATEGORIES.map((c) => (
          <a
            key={c.key}
            href={googleMapsSearchUrl(c.label, dest.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-text-2"
          >
            {c.label} <ExternalLink size={13} />
          </a>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-text-3">Öffnet die Google-Maps-App mit Bewertungen, Fotos und Öffnungszeiten.</p>
    </div>
  );
}
