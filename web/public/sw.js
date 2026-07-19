// Minimal service worker: makes Recipe Book installable and keeps the app
// shell available offline. Recipe data and photos are never cached — those
// requests always go to the network so the collection is never stale.

const CACHE = 'recipe-book-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Writes must always hit the network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache the API or photos — always fetch fresh data.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/photos/')) return;
  if (url.pathname === '/healthz') return;

  // App shell and static assets: serve from cache, revalidate in the
  // background, and fall back to the cached shell when offline.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached || (request.mode === 'navigate' ? caches.match('/') : undefined));
      return cached || network;
    }),
  );
});
