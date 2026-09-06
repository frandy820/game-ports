/* 口袋游戏机 ServiceWorker · stale-while-revalidate：离线立开，改动后台更新 */
const VERSION = 'v1.0.46';
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
    './game17/index.html',
    './game18/index.html',
    './game19/index.html',
    './game20/index.html',
    './game21/index.html',
    './game22/index.html',
    './game23/index.html',
    './game24/index.html',
    './game25/index.html',
    './game26/index.html',
    './game27/index.html',
    './game28/index.html',
    './game29/index.html',
    './game30/',
    './game30/index.html',
    './game31/',
    './game31/index.html',
    './game32/',
    './game32/index.html',
    './game33/',
    './game33/index.html',
    './game34/',
    './game34/index.html',
    './game35/',
    './game35/index.html',
    './game36/',
    './game36/index.html',
    './game37/',
    './game37/index.html',
    './game38/',
    './game38/index.html',
    './game39/',
    './game39/index.html',
    './game40/',
    './game40/index.html',
    './game41/',
    './game41/index.html',
    './game42/',
    './game42/index.html',
    './game43/',
    './game43/index.html',
    './game44/',
    './game44/index.html',
    './game45/',
    './game45/index.html',
    './game46/',
    './game46/index.html',
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
