/**
 * Lazy Leaflet map. Leaflet (JS + CSS) is only downloaded when a map is shown.
 * If tiles fail to load (offline or provider unavailable) a notice is shown;
 * callers always keep a list view as fallback.
 */
import type * as Leaflet from 'leaflet';
import { WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { mapConfig } from '../lib/maps';
import { useOnline } from '../lib/store';
import { Skeleton, cx } from './ui';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  kind?: 'stop' | 'home' | 'place' | 'fav';
}
export interface MapLine {
  from: [number, number];
  to: [number, number];
  mode: 'flight' | 'boat' | 'land' | 'unknown';
}

const LINE_STYLE: Record<MapLine['mode'], Leaflet.PolylineOptions> = {
  flight: { color: '#8EA8FF', weight: 2.5, dashArray: '2 8', lineCap: 'round' },
  boat: { color: '#35D6BE', weight: 3, dashArray: '10 8', lineCap: 'round' },
  land: { color: '#F2B45A', weight: 3.5 },
  unknown: { color: '#A4B2C3', weight: 2, dashArray: '4 6', opacity: 0.8 },
};

/** Great-circle-ish arc so flights read differently from surface legs. */
function arc(from: [number, number], to: [number, number], bend: number): [number, number][] {
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;
  const mx = (lat1 + lat2) / 2;
  const my = (lng1 + lng2) / 2;
  const dx = lat2 - lat1;
  const dy = lng2 - lng1;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const s = i / 24;
    pts.push([(1 - s) ** 2 * lat1 + 2 * (1 - s) * s * cx + s ** 2 * lat2, (1 - s) ** 2 * lng1 + 2 * (1 - s) * s * cy + s ** 2 * lng2]);
  }
  return pts;
}

export function MapView({
  markers,
  lines = [],
  selectedId,
  onSelect,
  className,
  focusIds,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  /** Marker IDs used to fit the initial view (defaults to all). */
  focusIds?: string[];
}) {
  const online = useOnline();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void (async () => {
      const [L] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
      if (cancelled || !el.current) return;
      LRef.current = L;
      const map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: true } as Leaflet.MapOptions);
      let errors = 0;
      L.tileLayer(mapConfig.tileUrl, { attribution: mapConfig.attribution, maxZoom: mapConfig.maxZoom, crossOrigin: true })
        .on('tileerror', () => {
          errors++;
          if (errors > 6) setTileError(true);
        })
        .on('tileload', () => setTileError(false))
        .addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      map.setView([20, 100], 3);
      mapRef.current = map;
      setReady(true);
    })().catch(() => setTileError(true));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [online]);

  // Draw markers & lines
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    lines.forEach((ln, i) => {
      const pts = ln.mode === 'flight' ? arc(ln.from, ln.to, i % 2 ? 0.18 : -0.18) : [ln.from, ln.to];
      L.polyline(pts, LINE_STYLE[ln.mode]).addTo(layer);
    });
    markers.forEach((m) => {
      const cls = ['travio-pin', m.kind === 'home' && 'is-home', m.kind === 'place' && 'is-place', m.kind === 'fav' && 'is-place is-fav', m.id === selectedId && 'is-active']
        .filter(Boolean)
        .join(' ');
      const icon = L.divIcon({ className: '', html: `<div class="${cls}">${m.label}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
      L.marker([m.lat, m.lng], { icon, title: m.title, keyboard: true, riseOnHover: true })
        .on('click', () => onSelectRef.current?.(m.id))
        .addTo(layer);
    });
  }, [ready, markers, lines, selectedId]);

  // Fit bounds when the set of markers changes
  const fitKey = (focusIds ?? markers.map((m) => m.id)).join(',');
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const pts = markers.filter((m) => !focusIds || focusIds.includes(m.id)).map((m) => [m.lat, m.lng] as [number, number]);
    if (pts.length === 1) map.setView(pts[0], 12);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [36, 36] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  if (!online) {
    return (
      <div className={cx('grid place-items-center rounded-[1.5rem] border border-dashed border-line-strong bg-surface p-6 text-center', className)}>
        <div>
          <WifiOff className="mx-auto text-text-3" />
          <p className="mt-3 text-[14px] text-text-2">{t.explore.mapOfflineHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cx('relative isolate overflow-hidden rounded-[1.5rem] border border-line', className)}>
      <div ref={el} className="absolute inset-0" />
      {!ready && <Skeleton className="absolute inset-0 rounded-none" />}
      {tileError && (
        <div className="absolute inset-x-3 bottom-3 z-[500] rounded-2xl bg-warn-soft p-3 text-[13px] text-warn glass">{t.explore.mapUnavailable}</div>
      )}
    </div>
  );
}
