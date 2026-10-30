/* Cache only these public, immutable app identity/offline assets. No API or media. */
const STATIC_CACHE = 'celmart-static-v1';
const STATIC_PATHS = [
  '/offline.html', '/manifest.json', '/icons/celmart.svg',
  '/icons/celmart-192.png', '/icons/celmart-512.png',
  '/icons/celmart-maskable-512.png', '/icons/celmart-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_PATHS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('celmart-static-') && key !== STATIC_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // In particular, Supabase/API/Storage and WhatsApp requests bypass this worker.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const offlinePage = await caches.match('/offline.html');
      return offlinePage || new Response('Sin conexión. Reconecta y vuelve a intentar.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }));
    return;
  }
  if (url.search || !STATIC_PATHS.includes(url.pathname)) return;
  event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => (await cache.match(url.pathname)) || fetch(request)));
});
