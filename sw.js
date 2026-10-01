// The Nest — self-destructing service worker.
// The old caching SW is what kept phones showing a frozen copy. This version
// does the opposite: on activate it wipes every cache, unregisters itself, and
// force-reloads any open tab onto the live network copy. After this runs once,
// there is NO service worker and NO caching — every open hits GitHub Pages fresh.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.navigate(c.url));
  })());
});
