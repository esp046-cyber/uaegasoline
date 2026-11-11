const CACHE = 'dubai-fuel-v1.0.2';
const CORE = ['./', './index.html', './offline.html', './css/styles.css', './js/app.js', './js/news-fetcher.js',
  './manifest.webmanifest', './favicon.svg', './apple-touch-icon.png',
  './icons/icon-72.png', './icons/icon-96.png', './icons/icon-128.png', './icons/icon-144.png', './icons/icon-152.png',
  './icons/icon-192.png', './icons/icon-384.png', './icons/icon-512.png',
  './icons/icon-maskable-192.png', './icons/icon-maskable-512.png'];
const DYNAMIC = /open\.er-api\.com|exchangerate-api|rss2json|reddit\.com|api\.allorigins|api\.codetabs/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
  catch (_) { return (await cache.match(req)) || new Response('{}', {status: 503, headers: {'Content-Type': 'application/json'}}); }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || cache.match('./offline.html');
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (DYNAMIC.test(url.href)) return e.respondWith(networkFirst(req));
  if (req.mode === 'navigate') {
    return e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); return r; })
      .catch(async () => (await caches.match(req)) || (await caches.match('./index.html')) || caches.match('./offline.html')));
  }
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});
