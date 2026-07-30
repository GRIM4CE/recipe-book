// Minimal service worker: makes Recipe Book installable and keeps the app
// shell available offline. Recipe data and photos are never cached — those
// requests always go to the network so the collection is never stale.

const CACHE = 'recipe-book-v2';
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

function keep(request, res) {
  if (res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return res;
}

// The page itself always goes to the network first. It names the hashed
// bundles, so answering it from cache pins an installed app to the build it
// was installed on and a deploy only lands on some later reload, if ever.
async function networkFirst(request) {
  try {
    return keep(request, await fetch(request));
  } catch {
    return (await caches.match(request)) ?? (await caches.match('/'));
  }
}

// Everything else is content-hashed or static: serve it straight from the
// cache and refresh the copy in the background.
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((res) => keep(request, res))
    .catch(() => cached);
  return cached ?? network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Writes must always hit the network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache the API or photos — always fetch fresh data.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/photos/')) return;
  if (url.pathname === '/healthz') return;

  event.respondWith(
    request.mode === 'navigate' ? networkFirst(request) : staleWhileRevalidate(request),
  );
});
