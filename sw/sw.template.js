/* TRAVIO service worker – generated at build time (see vite.config.ts).
 * Strategy:
 *  - App shell & hashed assets are precached → the app opens offline.
 *  - Navigations are answered with the cached app shell (SPA).
 *  - /api/* is never cached here; trip data lives in IndexedDB.
 *  - Third-party requests (map tiles, user cover images) are not intercepted.
 */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE_LIST__;
const CACHE = `travio-${BUILD_ID}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (u) => {
          const res = await fetch(new Request(u, { cache: 'reload' }));
          // A build file answered with HTML means the deployment is not complete
          // yet – fail the install and retry later instead of caching garbage.
          if (!res.ok || (u.startsWith('/assets/') && (res.headers.get('Content-Type') || '').includes('text/html'))) {
            throw new Error(`precache failed: ${u}`);
          }
          await cache.put(u, res);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep the directly previous version: pages that were opened before the
      // update still lazy-load their (old) chunks from it until they reload.
      const old = (await caches.keys()).filter((k) => k.startsWith('travio-') && k !== CACHE);
      await Promise.all(old.slice(0, -1).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const shell = await cache.match('/');
        if (shell) return shell;
        try {
          return await fetch(req);
        } catch {
          return new Response('<!doctype html><meta charset="utf-8"><title>TRAVIO</title><p style="font-family:sans-serif;padding:2rem">Offline – TRAVIO konnte nicht geladen werden. Bitte einmal online öffnen.</p>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const isAsset = url.pathname.startsWith('/assets/');
      const isHtml = (r) => (r.headers.get('Content-Type') || '').includes('text/html');
      const cache = await caches.open(CACHE);
      // Look in every TRAVIO cache (current + previous version).
      const hit = (await cache.match(req)) || (await caches.match(req));
      if (hit && !(isAsset && isHtml(hit))) return hit;
      const res = await fetch(req);
      if (isAsset && isHtml(res)) {
        // The SPA fallback answered a missing build file with index.html –
        // never cache or execute that as a script.
        return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      }
      // Hashed build assets are immutable – keep them for offline use.
      if (res.ok && isAsset) cache.put(req, res.clone());
      return res;
    })(),
  );
});
