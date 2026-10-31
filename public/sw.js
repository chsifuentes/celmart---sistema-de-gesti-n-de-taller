/* Only the app shell is cached here. API responses, customer photos and messages
 * bypass this worker; private workshop data lives in its authenticated journal. */
const STATIC_CACHE = 'celmart-shell-__CELMART_BUILD__';
const BUILD_ASSETS = self.__CELMART_ASSETS__ || [];
const STATIC_PATHS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/celmart.svg',
  '/icons/celmart-192.png',
  '/icons/celmart-512.png',
  '/icons/celmart-maskable-512.png',
  '/icons/celmart-180.png',
];
const APP_SHELL = new Set([...STATIC_PATHS, ...BUILD_ASSETS]);
self.addEventListener('install', (event) => {
  // Preload lazy chunks too, so switching Recepción/Taller works offline.
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([...APP_SHELL]))
  );
});
self.addEventListener('activate', (event) => {
  // No skipWaiting: an open old app can finish with its matching asset cache.
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith('celmart-shell-') ||
                key.startsWith('celmart-static-')) &&
              key !== STATIC_CACHE
          )
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) return response;
          if (response.status < 500) return response;
        } catch {
          /* Use the installed shell, with the original tracking URL. */
        }
        const cache = await caches.open(STATIC_CACHE);
        return (
          (await cache.match('/index.html')) ||
          (await cache.match('/')) ||
          (await cache.match('/offline.html')) ||
          new Response(
            'Abre CelMart una vez con conexión para instalar la aplicación.',
            {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            }
          )
        );
      })()
    );
    return;
  }
  if (url.search || !APP_SHELL.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const saved = await cache.match(url.pathname);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque')
        await cache.put(url.pathname, response.clone());
      return response;
    })()
  );
});
