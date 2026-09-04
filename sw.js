const CACHE_NAME = 'dg-zeiterfassung-v34';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './dg_icon_192.png',
  './dg_icon_512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, {
        cache: 'no-store'
      });

      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);

        cache.put(
          event.request,
          response.clone()
        ).catch(() => {});
      }

      return response;

    } catch (err) {
      const cached = await caches.match(event.request);

      if (cached) {
        return cached;
      }

      if (event.request.mode === 'navigate') {
        return (
          (await caches.match('./index.html')) ||
          (await caches.match('./'))
        );
      }

      throw err;
    }
  })());
});
