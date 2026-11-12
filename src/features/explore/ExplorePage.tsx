import { CalendarPlus, Compass, ExternalLink, List, Map as MapIcon, Navigation, Plus, Search, Star } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { PLACE_CATEGORIES, type PlaceCategory } from '../../../shared/constants';
import type { PlaceDto, TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { MapView, type MapMarker } from '../../components/MapView';
import { CategoryIcon } from '../../components/status';
import { Badge, Button, Chip, EmptyState, IconButton, Input, Segmented, Skeleton, cx } from '../../components/ui';
import { t } from '../../i18n';
import { appleMapsUrl, googleMapsUrl } from '../../lib/maps';
import { tripStore } from '../../lib/store';

const PlaceSheet = lazy(() => import('./PlaceSheet'));
const ActivitySheet = lazy(() => import('../itinerary/ActivitySheet'));

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
  const [view, setView] = useState<'list' | 'map'>('list');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<PlaceCategory | 'all' | 'fav'>('all');
  const [editing, setEditing] = useState<PlaceDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState<PlaceDto | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { places, destinations } = snap;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter(
      (p) =>
        (cat === 'all' || (cat === 'fav' ? p.favorite : p.category === cat)) &&
        (!q || p.name.toLowerCase().includes(q) || (p.address ?? '').toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)),
    );
  }, [places, query, cat]);
  const usedCats = PLACE_CATEGORIES.filter((c) => places.some((p) => p.category === c));
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

      {places.length === 0 ? (
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
          <p className="mt-6 text-center text-[13px] text-text-3">{t.explore.futureSearch}</p>
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
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-safe pb-1">
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
                {sel && <PlaceCard place={sel} snap={snap} onEdit={() => setEditing(sel)} onPlan={() => setPlanning(sel)} highlight />}
                {filtered.some((p) => p.lat == null) && <p className="mt-3 text-[13px] text-text-3">{t.explore.noCoords}: {filtered.filter((p) => p.lat == null).map((p) => p.name).join(', ')}</p>}
              </div>
            )}
            {view === 'list' && (
              <div className="grid gap-3 sm:grid-cols-2">
                {filtered.map((p) => (
                  <PlaceCard key={p.id} place={p} snap={snap} onEdit={() => setEditing(p)} onPlan={() => setPlanning(p)} />
                ))}
                {filtered.length === 0 && <p className="py-8 text-center text-text-3 sm:col-span-2">{t.explore.noResults}</p>}
              </div>
            )}
            <p className="mt-8 text-center text-[12px] text-text-3">{t.explore.futureSearch}</p>
          </div>
        </>
      )}

      <Suspense fallback={null}>
        {creating && <PlaceSheet open onClose={() => setCreating(false)} />}
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
              date: destinations.find((d) => d.id === planning.destinationId)?.arrivalDate,
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

function PlaceCard({ place, snap, onEdit, onPlan, highlight }: { place: PlaceDto; snap: TripSnapshot; onEdit: () => void; onPlan: () => void; highlight?: boolean }) {
  const { canEdit } = useTrip();
  const planned = snap.activities.filter((a) => a.placeId === place.id);
  const dest = snap.destinations.find((d) => d.id === place.destinationId);
  const target = { lat: place.lat, lng: place.lng, query: place.address ?? place.name };
  return (
    <article className={cx('rounded-[1.5rem] border bg-surface p-4 shadow-card', highlight ? 'mt-3 border-accent/50' : 'border-line')}>
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
          href={googleMapsUrl(target)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 text-[13px] font-semibold"
        >
          <Navigation size={14} /> Google Maps
        </a>
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
