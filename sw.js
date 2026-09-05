/* 口袋游戏机 ServiceWorker · stale-while-revalidate：离线立开，改动后台更新 */
const VERSION = 'v1.0.16';
const CACHE = 'pocket-games-' + VERSION;
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './game01/index.html',
  './game02/index.html',
  './game03/index.html',
  './game04/index.html',
  './game05/index.html',
  './game06/index.html',
  './game07/index.html',
  './game08/index.html',
  './game09/index.html',
  './game10/index.html',
  './game11/index.html',
  './game12/index.html',
  './game13/index.html',
  './game14/index.html',
  './game15/index.html',
  './game16/index.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => undefined);
      return cached || (await net) || cache.match('./index.html') || Response.error();
    })
  );
});
