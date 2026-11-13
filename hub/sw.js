/* service worker — version 202611131233
 * app shell: network first (so a new version is picked up as soon as you are online), cache when offline
 * market data (/proxy, other hosts' APIs): network only — the app keeps its last good data itself */
const V = 'hub-202611131233', SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === location.origin && u.pathname.indexOf('/proxy') >= 0) return;          // data: always live
  if (u.origin === location.origin && u.pathname.indexOf('/data/') >= 0)                   // published snapshots: newest when online, last copy offline
    return e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(k => k.put(u.pathname, c)); return res; }).catch(() => caches.match(u.pathname)));
  if (u.origin === location.origin) {
    if (r.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname))
      return e.respondWith(fetch(r, { cache: 'no-cache' }).then(res => { const c = res.clone(); caches.open(V).then(k => k.put('index.html', c)); return res; }).catch(() => caches.match('index.html')));
    return e.respondWith(caches.match(r).then(m => m || fetch(r)));
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))                              // fonts: cache, refresh in background
    return e.respondWith(caches.open(V).then(c => c.match(r).then(m => { const f = fetch(r).then(res => { c.put(r, res.clone()); return res; }).catch(() => m); return m || f; })));
});
