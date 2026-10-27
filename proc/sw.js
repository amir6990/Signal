/* Cache the page shell so the app keeps working with no network. */
const C = 'proc-v2';
const SHELL = ['./', './index.html', './data.js', './icon-180.png', './icon-192.png', './icon-512.png', './app.webmanifest'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(C).then(c => Promise.allSettled(SHELL.map(u =>
      fetch(u, { cache: 'reload' }).then(res => res.ok && c.put(u, res))
    )))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return;

  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r.url, { cache: 'reload' })
        .then(res => {
          if (res.ok && !url.search) {
            const copy = res.clone();
            caches.open(C).then(c => Promise.all([c.put('./', copy.clone()),
                                                  c.put('./index.html', copy)])).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./').then(m => m || caches.match(r)))
    );
    return;
  }

  if (url.search) return;
  e.respondWith(
    caches.match(r).then(m => m || fetch(r).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(C).then(c => c.put(r, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
