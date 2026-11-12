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
        if (reloading) return;
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
