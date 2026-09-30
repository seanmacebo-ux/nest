// The Nest — service worker. HTML: network-first (fresh when online).
// Assets: stale-while-revalidate (serve cached fast, fetch fresh in background).
// Bump CACHE on every deploy so old caches are purged and assets refetch.
const CACHE = 'nest-2026-09-30a';
const ASSETS = [
  './', './index.html', './tracker.html', './baby.html', './cars.html',
  './apartments.html', './furniture.html', './style.css', './nest.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    // Network-first so content stays current; fall back to cache offline.
    e.respondWith(
      fetch(req).then(res => {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
        return res;
      }).catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
    );
  } else {
    // Stale-while-revalidate: serve cache fast, fetch fresh in background so
    // the next load has the latest asset. Never freezes on an old version.
    e.respondWith(
      caches.match(req).then(cached => {
        const fresh = fetch(req).then(res => {
          if (res && res.status === 200) {
            const cp = res.clone();
            caches.open(CACHE).then(c => c.put(req, cp));
          }
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
  }
});
