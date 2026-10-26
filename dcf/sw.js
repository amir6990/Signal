/* Cache the page shell so the app keeps working with no network. */
const C = 'dcf-v2';
const SHELL = ['./', './index.html', './icon-180.png', './icon-192.png', './icon-512.png', './app.webmanifest'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(C).then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Navigations: network first so an update is picked up, cache as the fallback.
   Everything else: cache first. */
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return;

  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r)
        .then(res => {
          const copy = res.clone();
          caches.open(C).then(c => c.put(r, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(r).then(m => m || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(r).then(m => m || fetch(r).then(res => {
      const copy = res.clone();
      caches.open(C).then(c => c.put(r, copy)).catch(() => {});
      return res;
    }))
  );
});
