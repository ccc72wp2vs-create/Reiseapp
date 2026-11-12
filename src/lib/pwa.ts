/**
 * Service worker registration & update handling. A new version is installed
 * in the background; the user decides when to reload (no surprise reloads
 * while editing).
 */
import { t } from '../i18n';
import { toast } from '../components/toast';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', async () => {
    try {
      // Only reload on *updates* – never when the very first worker takes control.
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const promptUpdate = (worker: ServiceWorker) => {
        toast(t.offline.updateAvailable, 'info', {
          duration: 0,
          action: { label: t.offline.updateNow, onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(w);
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || !hadController) return;
        reloading = true;
        window.location.reload();
      });
      // Check for updates when the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
      });
    } catch {
      /* SW not available (e.g. private mode) – the app still works online */
    }
  });
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const RELOAD_KEY = 'travio.chunkReload';

/** True for errors caused by a build file that no longer exists (after a deploy). */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /dynamically imported module|Importing a module script failed|valid JavaScript MIME type|Failed to fetch dynamically|error loading dynamically imported/i.test(msg);
}

/**
 * Reloads the page once to pick up the current version. Returns false when a
 * reload was already attempted in the last minute (prevents reload loops).
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* storage unavailable – still try once */
  }
  window.location.reload();
  return true;
}

/** A lazily loaded page from an older version failed to load → reload once. */
export function handleStaleChunks() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
}

/**
 * Last resort from the error screen: activate a waiting update, otherwise drop
 * the offline file cache (trip data in IndexedDB is untouched) and reload.
 */
export async function repairAndReload() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      await new Promise((r) => setTimeout(r, 800));
    } else {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('travio-')).map((k) => caches.delete(k)));
      await reg?.update().catch(() => undefined);
    }
  } catch {
    /* ignore – reload anyway */
  }
  window.location.reload();
}
