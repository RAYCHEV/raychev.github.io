/* Filosofem free: generated; deploy with its matching assets. */
const EDITION = "free";
const BASE = "/filosofem-pwa/";
const EXCLUDED = ["/filosofem-pwa/premium/"];
const PREFIX = 'filosofem-' + EDITION + '-' + "2f66696c6f736f66656d2d7077612f" + '-';
const CACHE = PREFIX + "e1b7c4a82d09f6ab";
const PRECACHE = ["/filosofem-pwa/","/filosofem-pwa/_expo/static/css/styles-7d0d27088fd4c0148ec91744affd9bcf.css","/filosofem-pwa/_expo/static/js/web/index-ae187624ffc999a82cbdaba05a4cad0b.js","/filosofem-pwa/icons/apple-touch-icon.png","/filosofem-pwa/icons/favicon.png","/filosofem-pwa/icons/icon-192.png","/filosofem-pwa/icons/icon-512.png","/filosofem-pwa/icons/maskable-512.png","/filosofem-pwa/index.html","/filosofem-pwa/manifest.webmanifest","/filosofem-pwa/metadata.json"];
const ASSETS = new Set(PRECACHE);
const ROUTES = new Set(['', 'index.html', 'today', 'history', 'favorites', 'settings'].flatMap(route => [BASE + route, BASE + route + (route && route !== 'index.html' ? '/' : '')]));
function owns(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(BASE) && !EXCLUDED.some(path => url.pathname.startsWith(path));
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map(url => new Request(new URL(url, self.location.origin), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'OFFLINE_READY', edition: EDITION });
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!owns(url)) return;
  if (event.request.mode === 'navigate') {
    if (!ROUTES.has(url.pathname)) return;
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(BASE)) || fetch(event.request)));
    return;
  }
  if (!ASSETS.has(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
});
