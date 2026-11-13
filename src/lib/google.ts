/**
 * Google Maps Platform in the browser: only the Places UI Kit (place cards)
 * is loaded – on demand, with the HTTP-referrer restricted browser key.
 * Nothing Google returns is stored (no localStorage, no IndexedDB, the
 * service worker ignores cross-origin requests).
 */
import { useEffect, useState } from 'react';
import type { GoogleConfig } from '../../shared/google';
import { http } from './api';

const configs = new Map<string, Promise<GoogleConfig>>();

export function getGoogleConfig(tripId: string): Promise<GoogleConfig> {
  let p = configs.get(tripId);
  if (!p) {
    p = http.get<GoogleConfig>(`/trips/${tripId}/google/config`).catch(() => {
      configs.delete(tripId);
      return { enabled: false, browserKey: null, routing: false };
    });
    configs.set(tripId, p);
  }
  return p;
}

export function useGoogleConfig(tripId: string | undefined): GoogleConfig | null {
  const [cfg, setCfg] = useState<GoogleConfig | null>(null);
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    void getGoogleConfig(tripId).then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, [tripId]);
  return cfg;
}

declare global {
  interface Window {
    __travioGoogleReady?: () => void;
    google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
  }
}

let loading: Promise<void> | null = null;

/** Loads the Maps JavaScript API with the Places UI Kit (once per page). */
export function loadPlacesUiKit(browserKey: string): Promise<void> {
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    window.__travioGoogleReady = () => {
      window.google?.maps?.importLibrary?.('places').then(() => resolve(), reject);
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(browserKey)}&v=weekly&libraries=places&language=de&region=DE&loading=async&callback=__travioGoogleReady`;
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps konnte nicht geladen werden.'));
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Asks the server before rendering UI Kit cards (internal monthly limit). */
export async function reserveUiLoads(tripId: string, count: number): Promise<void> {
  await http.post(`/trips/${tripId}/google/ui-loads`, { count: Math.min(Math.max(count, 1), 10) });
}
