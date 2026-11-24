/* =====================================================================
 * PUSH TO A CLOSED APP — directive 17, approved by the user on 2026-11-17 (scheduled GitHub job + Web Push).
 *
 *   PC (once):   keys()      → a VAPID key pair made in this browser. The PUBLIC key is published to the repo (hub/push/vapid.json);
 *                              the PRIVATE key is shown once to be saved as the repository secret VAPID_PRIVATE_KEY — it is never
 *                              written to the repo or sent anywhere else (the GitHub API cannot store secrets through this hub's token).
 *   Phone:       subscribe() → the home-screen app subscribes with that public key; the subscription (push-service address +
 *                              encryption keys, nothing personal) is added to hub/push/subs.json with this device's GitHub token,
 *                              or shown as text to paste on the PC (addSub) when the phone has no token.
 *   GitHub job:  .github/workflows/push-alerts.yml runs hourly on market days and after every published snapshot: it reads the
 *                published central verdict and TGJU's live board, runs the same alert rules (js/core/alerts.js) and sends the
 *                encrypted notifications. TSETMC does not answer GitHub's servers, so stock alerts come from the snapshots the PC
 *                or phone publishes after an update; gold, coins and FX are also checked against live prices every hour.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.push.v1', DIR = 'hub/push';
  function st() { return (Hub.util && Hub.util.store.get(KEY, null)) || {}; }
  function save(o) { try { Hub.util.store.set(KEY, Object.assign(st(), o)); } catch (e) { /* ignore */ } }
  function b64u(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function supported() { return !!(root.navigator && navigator.serviceWorker && root.PushManager && root.crypto && crypto.subtle); }
  function site() { var c = Hub.dataSync ? Hub.dataSync.cfg() : {}; var served = Hub.dataSync && Hub.dataSync.served && Hub.dataSync.served(); return served ? './' : (c.site || 'https://amir6990.github.io/Signal/hub/'); }

  // 1 · PC: make the VAPID key pair (P-256), publish the public key, hand back the private key for the repository secret
  function keys() {
    return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']).then(function (kp) { return crypto.subtle.exportKey('jwk', kp.privateKey); }).then(function (j) {
      var pub = b64u(new Uint8Array([4].concat(Array.from(unb64u(j.x)), Array.from(unb64u(j.y))))), priv = j.d;
      var body = JSON.stringify({ publicKey: pub, createdAt: new Date().toISOString(), note: 'VAPID public key of the hub. The private key is the repository secret VAPID_PRIVATE_KEY.' }, null, 1);
      return Hub.dataSync.putFile(DIR + '/vapid.json', body, 'hub: push — public VAPID key').then(function () { save({ pub: pub, priv: priv, at: Date.now() }); return { pub: pub, priv: priv }; });
    });
  }
  function publicKey() { return fetch(site().replace(/\/?$/, '/') + 'push/vapid.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('کلید عمومی هنوز منتشر نشده (HTTP ' + r.status + ')'); return r.json(); }).then(function (j) { if (!j.publicKey) throw new Error('کلید عمومی نامعتبر'); return j.publicKey; }); }

  // 2 · phone: subscribe this device, then register the subscription in the repo (with a token) or hand it over as text
  function subscribe(label) {
    if (!supported()) return Promise.reject(new Error('این مرورگر Web Push ندارد. در آیفون: iOS ۱۶٫۴ یا بالاتر و برنامه از «افزودن به صفحهٔ اصلی» باز شده باشد.'));
    var perm = typeof Notification !== 'undefined' && Notification.permission !== 'granted' ? Notification.requestPermission() : Promise.resolve('granted');
    return perm.then(function (p) { if (p !== 'granted') throw new Error('اجازهٔ اعلان داده نشد.'); return Promise.all([navigator.serviceWorker.ready, publicKey()]); })
      .then(function (r) { var reg = r[0], key = r[1]; return reg.pushManager.getSubscription().then(function (old) { if (old && st().key === key) return old; return (old ? old.unsubscribe() : Promise.resolve()).then(function () { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(key) }); }); }).then(function (sub) { save({ key: key }); return sub; }); })
      .then(function (sub) { var j = sub.toJSON(), rec = { endpoint: j.endpoint, keys: j.keys, label: label || deviceLabel(), at: new Date().toISOString() }; save({ sub: rec });
        var c = Hub.dataSync.cfg(); if (!c.token) return { rec: rec, registered: false, text: JSON.stringify(rec) };
        return addSub(rec).then(function () { return { rec: rec, registered: true }; }); });
  }
  function deviceLabel() { var u = (root.navigator && navigator.userAgent) || ''; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : 'رایانه'; }
  // add (or replace, by push address) one subscription in hub/push/subs.json — PC or any device with the token
  function addSub(rec) {
    if (typeof rec === 'string') { try { rec = JSON.parse(rec); } catch (e) { return Promise.reject(new Error('متن اشتراک معتبر نیست.')); } }
    if (!rec || !/^https:\/\//.test(rec.endpoint || '') || !rec.keys || !rec.keys.p256dh || !rec.keys.auth) return Promise.reject(new Error('اشتراک ناقص است.'));
    return Hub.dataSync.getFile(DIR + '/subs.json').then(function (t) { return JSON.parse(t); }, function () { return { subs: [] }; }).then(function (F) {
      F.subs = (F.subs || []).filter(function (s) { return s.endpoint !== rec.endpoint; }).concat([rec]).slice(-10); F.updatedAt = new Date().toISOString();
      return Hub.dataSync.putFile(DIR + '/subs.json', JSON.stringify(F, null, 1), 'hub: push — device subscription'); });
  }
  function unsubscribe() { if (!supported()) return Promise.resolve(false); return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) { save({ sub: null }); return s ? s.unsubscribe() : false; }); }
  function status() { if (!supported()) return Promise.resolve({ ok: false, why: 'unsupported' }); return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) { return { ok: true, sub: !!s, perm: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported', local: st() }; }).catch(function (e) { return { ok: false, why: e.message }; }); }
  Hub.webPush = { keys: keys, subscribe: subscribe, addSub: addSub, unsubscribe: unsubscribe, status: status, supported: supported, publicKey: publicKey, state: st, SECRET: 'VAPID_PRIVATE_KEY', SECRET_URL: 'https://github.com/amir6990/Signal/settings/secrets/actions/new' };
})(typeof window !== 'undefined' ? window : globalThis);
