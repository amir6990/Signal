/* service worker — version 202611160909
 * app shell: network first (so a new version is picked up as soon as you are online), cache when offline
 * market data (/proxy, other hosts' APIs): network only — the app keeps its last good data itself */
const V = 'hub-202611160909', SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k.indexOf('hub-') === 0).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === location.origin && u.pathname.indexOf('/proxy') >= 0) return;          // data: always live
  if (u.origin === location.origin && u.pathname.indexOf('/data/') >= 0)                   // published snapshots: newest when online, last copy offline
    return e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(k => k.put(u.pathname, c)); return res; }).catch(() => caches.match(u.pathname)));
  if (u.origin === location.origin) {
    if (r.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname))
      // the page is ~11 MB: wait at most 4 s for the network, then open the cached copy and let the download finish in the background (next open uses it)
      return e.respondWith(caches.match('index.html').then(m => { const net = fetch(r, { cache: 'no-cache' }).then(res => { if (res.ok) { const c = res.clone(); e.waitUntil(caches.open(V).then(k => k.put('index.html', c))); } return res; });
        if (!m) return net.catch(() => new Response('<meta charset=utf-8><p style="font:16px sans-serif;padding:20px" dir=rtl>اتصال برقرار نیست و نسخهٔ ذخیره‌شده‌ای هم نیست. با اینترنت دوباره باز کنید.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
        return Promise.race([net.catch(() => m), new Promise(ok => setTimeout(() => ok(m), 4000))]); }));
    return e.respondWith(caches.match(r).then(m => m || fetch(r)));
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))                              // fonts: cache, refresh in background
    return e.respondWith(caches.open(V).then(c => c.match(r).then(m => { const f = fetch(r).then(res => { c.put(r, res.clone()); return res; }).catch(() => m); return m || f; })));
});
