const CACHE_NAME = 'dg-zeiterfassung-v44';

const APP_SHELL = [
  './',
  './index.html',
  './v44-patch.js',
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
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function withV44Patch(response) {
  if (!response || !response.ok) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  let html = await response.text();
  if (!html.includes('v44-patch.js')) {
    html = html.replace('</body>', '<script src="./v44-patch.js?v=44"></script>\n</body>');
  }
  html = html.replace(/<title>DG Zeiterfassung v\d+<\/title>/, '<title>DG Zeiterfassung v44</title>');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, {status: response.status, statusText: response.statusText, headers});
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, {cache: 'no-store'});
      const isPage = event.request.mode === 'navigate' || new URL(event.request.url).pathname.endsWith('/index.html') || new URL(event.request.url).pathname.endsWith('/');
      const served = isPage ? await withV44Patch(response) : response;
      if (served && served.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, served.clone()).catch(() => {});
      }
      return served;
    } catch (err) {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const fallback = (await caches.match('./index.html')) || (await caches.match('./'));
        return fallback ? withV44Patch(fallback) : fallback;
      }
      throw err;
    }
  })());
});
