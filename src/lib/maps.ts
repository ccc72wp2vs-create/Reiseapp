/**
 * Map configuration. The tile provider is configurable via Vite env vars so
 * production deployments can switch to a provider with suitable terms
 * (see README → "Kartenanbieter").
 */
export const mapConfig = {
  tileUrl: import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  maxZoom: Number(import.meta.env.VITE_MAP_MAX_ZOOM || 19),
};

export function appleMapsUrl(opts: { lat?: number | null; lng?: number | null; query?: string | null }) {
  if (opts.lat != null && opts.lng != null) {
    const q = opts.query ? `&q=${encodeURIComponent(opts.query)}` : '';
    return `https://maps.apple.com/?ll=${opts.lat},${opts.lng}${q}`;
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(opts.query ?? '')}`;
}

export function googleMapsUrl(opts: { lat?: number | null; lng?: number | null; query?: string | null }) {
  if (opts.lat != null && opts.lng != null) return `https://www.google.com/maps/search/?api=1&query=${opts.lat},${opts.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(opts.query ?? '')}`;
}

export const hasMapTarget = (o: { lat?: number | null; lng?: number | null; query?: string | null }) =>
  (o.lat != null && o.lng != null) || !!o.query;
