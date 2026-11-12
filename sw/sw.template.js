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
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('travio-') && k !== CACHE).map((k) => caches.delete(k)));
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
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      // Hashed build assets are immutable – keep them for offline use.
      if (res.ok && url.pathname.startsWith('/assets/')) cache.put(req, res.clone());
      return res;
    })(),
  );
});
