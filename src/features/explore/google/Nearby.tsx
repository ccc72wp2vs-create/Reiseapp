import { AlertTriangle, CalendarPlus, Car, Clock, ExternalLink, Footprints, LocateFixed, MapPin, Navigation, Star } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  categoryByKey,
  formatDistance,
  formatDuration,
  directionsToCoordsUrl,
  googleDirectionsUrl,
  googleMapsSearchUrl,
  GOOGLE_CATEGORIES,
  type OsmPlace,
  type NearbyResponse,
  type NearbyResult,
  type TravelMode,
} from '../../../../shared/google';
import { destinationOn, todayIn } from '../../../../shared/trip';
import type { TripSnapshot } from '../../../../shared/types';
import { useTrip } from '../../../components/AppShell';
import { toast } from '../../../components/toast';
import { Button, Chip, cx, Input, Skeleton } from '../../../components/ui';
import { errorMessage, http } from '../../../lib/api';
import { reserveUiLoads } from '../../../lib/google';
import { tripStore, useOnline } from '../../../lib/store';
import { GooglePlace } from './GooglePlace';

const ActivitySheet = lazy(() => import('../../itinerary/ActivitySheet'));

export interface NearbyParams {
  category: string | null;
  query?: string | null;
  maxMinutes: number | null;
  mode: TravelMode;
  limit?: number;
}

const TIMES = [null, 10, 20, 30] as const;

/** Short-lived in-memory reuse of identical searches (IDs + times only, 5 min). */
const recent = new Map<string, { at: number; res: NearbyResponse }>();

/**
 * "In der Nähe": Google search by category with real travel times.
 * Results are Google's own place cards; saving keeps only the place ID plus
 * your own name, category and plan.
 */
export function Nearby({
  snap,
  initial,
  initialResponse,
  compact = false,
  onNavigate,
}: {
  snap: TripSnapshot;
  initial?: NearbyParams;
  /** Results already fetched by the assistant (no second request). */
  initialResponse?: NearbyResponse | null;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const online = useOnline();
  const [params, setParams] = useState<NearbyParams>(initial ?? { category: null, maxMinutes: null, mode: 'DRIVE' });
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [res, setRes] = useState<NearbyResponse | null>(initialResponse ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(!!initialResponse);

  async function search(p: NearbyParams, loc = location) {
    if (busy || !online || (!p.category && !p.query)) return;
    setParams(p);
    setError(null);
    const key = JSON.stringify([snap.trip.id, p, loc]);
    const hit = recent.get(key);
    if (hit && Date.now() - hit.at < 300_000) return setRes(hit.res);
    setBusy(true);
    try {
      const r = await http.post<NearbyResponse>(`/trips/${snap.trip.id}/maps/nearby`, { ...p, location: loc, limit: p.limit ?? 6 });
      // Google's place cards are counted before the browser loads them.
      if (r.provider === 'google' && r.results.length) await reserveUiLoads(snap.trip.id, r.results.length);
      recent.set(key, { at: Date.now(), res: r });
      setRes(r);
    } catch (e) {
      setRes(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Assistant cards start their search once, when shown.
  useEffect(() => {
    if (initial && !started.current && online) {
      started.current = true;
      void search(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  function toggleLocation() {
    if (location) {
      setLocation(null);
      if (params.category || params.query) void search(params, null);
      return;
    }
    if (!('geolocation' in navigator)) return toast('Standort ist auf diesem Gerät nicht verfügbar.', 'error');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: Math.round(pos.coords.latitude * 1e4) / 1e4, lng: Math.round(pos.coords.longitude * 1e4) / 1e4 };
        setLocation(loc);
        if (params.category || params.query) void search(params, loc);
      },
      () => toast('Standort nicht freigegeben – Fahrzeiten gelten ab eurem Reiseort.', 'error'),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  if (!online) {
    return (
      <p className="rounded-[1.25rem] border border-line bg-surface px-4 py-4 text-[14px] text-text-2">
        Für die Ortssuche und Fahrzeiten brauchst du Internet. Eure gespeicherten Orte, Pläne und Notizen sind weiterhin da.
      </p>
    );
  }

  return (
    <div>
      {!compact && (
        <>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {GOOGLE_CATEGORIES.map((c) => (
              <Chip key={c.key} active={params.category === c.key} onClick={() => void search({ ...params, category: c.key, query: null })}>
                {c.label}
              </Chip>
            ))}
          </div>
          <div className="no-scrollbar -mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 [&>*]:shrink-0">
            <div className="flex rounded-full border border-line bg-surface p-0.5" role="group" aria-label="Verkehrsmittel">
              {(['DRIVE', 'WALK'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={params.mode === m}
                  onClick={() => void search({ ...params, mode: m })}
                  className={cx('flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold', params.mode === m ? 'bg-accent-soft text-accent' : 'text-text-3')}
                >
                  {m === 'DRIVE' ? <Car size={14} /> : <Footprints size={14} />}
                  {m === 'DRIVE' ? 'Auto' : 'Zu Fuß'}
                </button>
              ))}
            </div>
            {TIMES.map((m) => (
              <button
                key={String(m)}
                type="button"
                aria-pressed={params.maxMinutes === m}
                onClick={() => void search({ ...params, maxMinutes: m })}
                className={cx('h-9 rounded-full border px-3 text-[13px] font-semibold', params.maxMinutes === m ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-surface text-text-3')}
              >
                {m ? `≤ ${m} Min.` : 'Alle'}
              </button>
            ))}
            <button
              type="button"
              onClick={toggleLocation}
              aria-pressed={!!location}
              className={cx('flex h-9 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold', location ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-surface text-text-3')}
            >
              <LocateFixed size={14} /> Standort
            </button>
          </div>
        </>
      )}

      {!params.category && !params.query && !compact && (
        <p className="mt-4 text-[14px] text-text-2">Wähle oben, was ihr sucht – TRAVIO zeigt passende Orte mit echter Fahrzeit.</p>
      )}
      {busy && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {error && <p className="mt-4 rounded-2xl bg-warn-soft px-4 py-3 text-[14px] text-warn">{error}</p>}
      {res && !busy && <Results snap={snap} res={res} params={params} onNavigate={onNavigate} />}
    </div>
  );
}

function Results({ snap, res, params, onNavigate }: { snap: TripSnapshot; res: NearbyResponse; params: NearbyParams; onNavigate?: () => void }) {
  const cat = categoryByKey(params.category);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-[12px] text-text-3">
        {res.mode === 'WALK' ? 'Fußwege' : res.mode === 'BICYCLE' ? 'Radwege' : 'Fahrzeiten'} ab {res.origin.label}
        {res.provider === 'google' ? ' · Routendaten: Google Maps' : ''}
      </p>
      {res.provider === 'google' && res.mode !== 'DRIVE' && (
        <p className="text-[12px] text-text-3">Hinweis: Fuß- und Radrouten sind bei Google in der Beta-Phase und können unvollständig sein.</p>
      )}
      {res.routing !== 'ok' && (
        <p className="flex items-start gap-1.5 rounded-2xl bg-warn-soft px-3 py-2 text-[13px] text-warn">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {res.routing === 'limit' ? 'Limit für Fahrzeiten erreicht' : 'Fahrzeiten gerade nicht verfügbar'} – {params.maxMinutes ? 'der Zeitfilter wurde nicht angewendet.' : 'Entfernungen unbekannt.'}
        </p>
      )}
      {res.results.length === 0 && (
        <p className="py-6 text-center text-[14px] text-text-2">
          {res.filteredOut > 0 ? `Nichts innerhalb von ${params.maxMinutes} Min. gefunden (${res.filteredOut} Orte sind weiter weg).` : 'Keine passenden Orte gefunden.'}
        </p>
      )}
      {res.results.map((r) => (
        <ResultCard key={r.placeId} snap={snap} r={r} res={res} category={cat?.category ?? 'other'} label={cat?.label ?? 'Ort'} onNavigate={onNavigate} />
      ))}
      {res.filteredOut > 0 && res.results.length > 0 && <p className="text-center text-[12px] text-text-3">{res.filteredOut} weitere Orte liegen über {params.maxMinutes} Min. entfernt.</p>}
      {res.provider === 'geoapify' && (
        <p className="text-center text-[11px] text-text-3">
          Daten ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
            OpenStreetMap-Mitwirkende
          </a>{' '}
          · Powered by{' '}
          <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer" className="underline">
            Geoapify
          </a>
        </p>
      )}
    </div>
  );
}

function ResultCard({
  snap,
  r,
  res,
  category,
  label,
  onNavigate,
}: {
  snap: TripSnapshot;
  r: NearbyResult;
  res: NearbyResponse;
  category: import('../../../../shared/constants').ActivityCategory;
  label: string;
  onNavigate?: () => void;
}) {
  const { canEdit } = useTrip();
  const [naming, setNaming] = useState<'save' | 'plan' | null>(null);
  const [name, setName] = useState('');
  const [planning, setPlanning] = useState<string | null>(null);
  const osm = r.place ?? null;
  const saved = osm ? findSaved(snap, osm) : snap.places.find((p) => p.googlePlaceId === r.placeId);
  const tz = snap.destinations[0]?.timezone ?? snap.trip.homeTimezone;
  const today = todayIn(tz);
  const stop = destinationOn(snap.destinations, today);

  // OpenStreetMap data may be stored (with attribution) → one tap, no typing.
  function saveOsm(p: OsmPlace) {
    tripStore.places.create({
      name: p.name,
      category,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      externalUrl: p.website,
      notes: ['Quelle: OpenStreetMap (Geoapify)', p.openingHours ? `Öffnungszeiten laut OSM: ${p.openingHours}` : null].filter(Boolean).join('\n'),
      favorite: true,
      destinationId: (stop.current ?? stop.leaving)?.id ?? null,
    });
    toast('Gemerkt – unter „Eure Orte“');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (naming === 'save') {
      tripStore.places.create({ name: n, category, googlePlaceId: r.placeId, favorite: true, destinationId: (stop.current ?? stop.leaving)?.id ?? null });
      toast('Gemerkt – unter „Eure Orte“');
      setNaming(null);
    } else {
      setPlanning(n);
      setNaming(null);
    }
  }

  return (
    <article className="rounded-[1.5rem] border border-line bg-surface p-3">
      {osm ? <OsmCard place={osm} /> : <GooglePlace tripId={snap.trip.id} placeId={r.placeId} reserved />}
      <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
          {res.mode === 'WALK' ? <Footprints size={14} className="text-accent" /> : <Car size={14} className="text-accent" />}
          {r.durationSec != null ? `${formatDuration(r.durationSec)}${r.distanceMeters != null ? ` · ${formatDistance(r.distanceMeters)}` : ''}` : r.noRoute ? 'Keine Straßen- oder Fußroute – evtl. Fähre oder Boot' : 'Fahrzeit unbekannt'}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <a
          href={osm ? directionsToCoordsUrl(res.origin, osm, res.mode) : googleDirectionsUrl(res.origin, r.placeId, res.mode, label)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 text-[13px] font-semibold"
        >
          <Navigation size={14} /> Route
        </a>
        {osm && (
          <a
            href={googleMapsSearchUrl(osm.name, osm.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 text-[13px] font-semibold"
          >
            <Star size={14} /> Bewertungen bei Google
          </a>
        )}
        {canEdit &&
          (saved ? (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[13px] font-semibold text-accent">
              <Star size={14} fill="currentColor" /> {saved.name}
            </span>
          ) : (
            <Button size="sm" variant="secondary" icon={<Star size={15} />} onClick={() => (osm ? saveOsm(osm) : setNaming(naming === 'save' ? null : 'save'))}>
              Merken
            </Button>
          ))}
        {canEdit && (
          <Button size="sm" variant="soft" icon={<CalendarPlus size={15} />} onClick={() => (saved ? setPlanning(saved.name) : osm ? setPlanning(osm.name) : setNaming(naming === 'plan' ? null : 'plan'))}>
            Zum Tagesplan
          </Button>
        )}
      </div>
      {naming && (
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name für euch, z. B. wie oben" maxLength={120} aria-label="Name" />
          <Button type="submit" size="md" disabled={!name.trim()}>
            {naming === 'save' ? 'Merken' : 'Weiter'}
          </Button>
        </form>
      )}
      {naming && <p className="mt-1.5 px-1 text-[12px] text-text-3">Google-Infos werden nicht gespeichert – nur euer Name und die Verknüpfung zu Google.</p>}
      <Suspense fallback={null}>
        {planning && (
          <ActivitySheet
            open
            onClose={() => setPlanning(null)}
            defaults={
              osm
                ? { title: planning, category, date: today, placeId: saved?.id ?? null, locationName: osm.address ?? osm.name, lat: osm.lat, lng: osm.lng }
                : { title: planning, category, date: today, googlePlaceId: r.placeId, placeId: saved?.id ?? null }
            }
          />
        )}
      </Suspense>
    </article>
  );
}

/** Already saved? Same name within ~150 m. */
function findSaved(snap: TripSnapshot, p: OsmPlace) {
  return snap.places.find(
    (x) => x.name.trim().toLowerCase() === p.name.trim().toLowerCase() && x.lat != null && x.lng != null && Math.abs(x.lat - p.lat) < 0.0015 && Math.abs(x.lng - p.lng) < 0.0015,
  );
}

/** OpenStreetMap place in TRAVIO's own design (openly licensed data). */
function OsmCard({ place }: { place: OsmPlace }) {
  return (
    <div className="px-1 pt-1">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-3">
        {[place.categoryLabel, place.cuisine].filter(Boolean).join(' · ') || 'Ort'}
      </p>
      <h3 className="mt-0.5 font-display text-[19px] font-semibold leading-snug">{place.name}</h3>
      {place.address && (
        <p className="mt-1 flex items-start gap-1 text-[13px] text-text-2">
          <MapPin size={13} className="mt-0.5 shrink-0" /> {place.address}
        </p>
      )}
      {place.openingHours && (
        <p className="mt-1 flex items-start gap-1 text-[13px] text-text-2">
          <Clock size={13} className="mt-0.5 shrink-0" /> <span className="min-w-0 break-words">{place.openingHours}</span>
        </p>
      )}
      {place.website && (
        <a href={place.website} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
          <ExternalLink size={13} /> Website
        </a>
      )}
    </div>
  );
}
