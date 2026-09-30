// The Nest — service worker. HTML + nest.js + style.css: network-first (fresh
// when online, so a change never gets stuck behind an old cache on an
// installed phone). Images/icons/manifest: cache-first (rarely change).
//
// Bump CACHE whenever this file changes — it's what forces an already-
// installed app to drop its old cache and pick up new assets.
const CACHE = 'nest-v2';
const ASSETS = [
  './', './index.html', './tracker.html', './baby.html', './cars.html',
  './apartments.html', './furniture.html', './decided.html', './style.css', './nest.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];
const NETWORK_FIRST = new Set(['/style.css', '/nest.js']);

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
  const url = new URL(req.url);
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML || NETWORK_FIRST.has('/' + url.pathname.split('/').pop())) {
    // Network-first so content stays current; fall back to cache offline.
    e.respondWith(
      fetch(req).then(res => {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
        return res;
      }).catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
    );
  } else {
    // Cache-first for static assets.
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res && res.status === 200) {
          const cp = res.clone();
          caches.open(CACHE).then(c => c.put(req, cp));
        }
        return res;
      }))
    );
  }
});
