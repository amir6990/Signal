/* =====================================================================
 * DATA SYNC — PC → GitHub → phone.
 *   The phone app calls TSETMC straight from the page first (works on Iranian internet, as the earlier apps on the same site do).
 *   This sync is the fallback for when the phone cannot reach TSETMC (abroad / VPN on): TSETMC answers only from inside Iran
 *   (tested 2026-11-11: GitHub's US runners time out on every TSETMC endpoint while TGJU answers).
 *   · the PC in Iran fetches as before and PUBLISHES a snapshot to the GitHub repo that serves the phone app
 *   · the phone PULLS that snapshot from its own site (same origin: no CORS, no proxy)
 * Snapshot files (in the site's data/ folder): tse.json (stocks, options, temporal) · tgju.json (gold, FX).
 * The GitHub token lives only in this browser's storage on the PC and is sent only to api.github.com.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.sync.v1';
  /* stocks (≈ 100 MB as plain JSON with full history) are published apart: rows packed as arrays and split in shards (stocks.json + stocks-1…n.json),
     each well under GitHub's limits; the small sets go first in their own commit, so a slow upload of the stocks never holds back the rest */
  var SKEY = 'hub.sigstocks.v1', SHARD = 6e6;
  var FILES = { central: ['hub.central.v1'], tse: ['hub.sigoptions.v1', 'hub.sigtemporal.v1', 'hub.longview.v1'], tgju: ['hub.sig-gold.v1', 'hub.sig-fx.v1', 'hub.sigglobal.v1'], news: ['hub.news.v1'] };
  var KEEP = ['set', 'tk', 'settings', 'f', 'sel', 'opt'];               // the phone keeps its own settings / filters
  var DEF = { repo: 'amir6990/Signal', branch: 'claude/iran-stock-signals-excel-guqwon', dir: 'hub/data', token: '', auto: false, autoPull: true, site: 'https://amir6990.github.io/Signal/hub/' };
  function ls() { try { return root.localStorage; } catch (e) { return null; } }
  // through the hub's store (memory + IndexedDB): the data sets are larger than a phone's localStorage
  function get(k, d) { if (Hub.util && Hub.util.store) return Hub.util.store.get(k, d); var s = ls(); try { var v = s && s.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function put(k, v) { if (Hub.util && Hub.util.store) return Hub.util.store.set(k, v); var s = ls(); try { s && s.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  /* a GitHub token is only letters, digits and «_». Text copied from a right-to-left page often carries invisible direction marks
     (U+200E/U+200F/U+202A–U+202E) or spaces: they are removed, otherwise the browser refuses the request header */
  function cleanTok(t) { return String(t || '').replace(/[^A-Za-z0-9_]/g, ''); }
  function tokOK(t) { return /^(github_pat_[A-Za-z0-9_]{40,}|gh[pousr]_[A-Za-z0-9]{30,})$/.test(t); }
  function cfg() { var c = Object.assign({}, DEF, get(KEY, {}) || {}); c.token = cleanTok(c.token); return c; }
  function setCfg(c) { if (c && 'token' in c) c = Object.assign({}, c, { token: cleanTok(c.token) }); put(KEY, Object.assign(cfg(), c)); }
  function live(S) { return S && S.meta && S.meta.source && !/synthetic|illustrative/i.test(S.meta.source); }
  function ts(S) { return (S && S.meta && S.meta.asOfTs) || 0; }
  function served() { var L = root.location || {}; return /^https?:$/.test(L.protocol || '') && !/claude|anthropic|localhost|127\.0\.0\.1/.test(L.host || ''); }
  function round(k, v) { return typeof v === 'number' && isFinite(v) && v % 1 ? +v.toPrecision(7) : v; }

  /* ---------- pull (phone): newer snapshot replaces the local data, keeps local settings ---------- */
  function fetchSnap(name) {
    var c = cfg(), urls = served() ? ['data/' + name + '.json'] : [c.site.replace(/\/?$/, '/') + 'data/' + name + '.json'];
    var go = function (i) { if (i >= urls.length) return Promise.reject(new Error('not found')); return fetch(urls[i] + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch(function (e) { if (i + 1 < urls.length) return go(i + 1); throw e; }); };
    return go(0);
  }
  function pull(force) {
    var out = { updated: [], same: [], errors: [], snaps: {} };
    // the stock shards: stocks.json says how many; the rows come packed as arrays
    var shardSet = function (pre, n) { var L = [fetchSnap(pre)]; for (var i = 1; i < n; i++) L.push(fetchSnap(pre + '-' + i)); return Promise.all(L); };
    var unpackAll = function (files) { var D = {}; files.forEach(function (f) { var st = f.stores && f.stores[SKEY]; Object.keys((st && st.data) || {}).forEach(function (k) { D[k] = unpackSym(st.data[k]); }); }); return D; };
    var stocks = fetchSnap('stocks').then(function (s0) { var n = s0.shards || 1, more = [];
      /* already current here (same or newer time, enough history): the other shards are not downloaded or unpacked at all — on a phone that
         download and its unpacking (≈ 60 MB of JSON) ran on every opening, next to the engine run, and the page was killed for memory */
      var S00 = s0.stores && s0.stores[SKEY], L00 = get(SKEY, null);
      if (!force && live(S00) && live(L00) && ts(L00) >= ts(S00)) { var d00 = []; Object.keys(L00.data || {}).forEach(function (k) { var v = L00.data[k]; if (k[0] !== '_' && v && v.px) d00.push(v.px.length); }); d00.sort(function (x, y) { return x - y; });
        if (!s0.base || !s0.base.shards || (d00.length && d00[Math.floor(d00.length / 2)] >= 260)) { out.same.push(SKEY); out.snaps.stocks = { publishedAt: s0.publishedAt, by: s0.by, shards: n, base: s0.base || null, baseUsed: false, skipped: true }; return; } }
      for (var i = 1; i < n; i++) more.push(fetchSnap('stocks-' + i));
      // the base (full history) is fetched when this device's stock history is short: a new device, or one that missed it
      var L0 = get(SKEY, null), depth = Hub.histMerge && live(L0) ? (function () { var a = []; Object.keys(L0.data || {}).forEach(function (k) { var v = L0.data[k]; if (k[0] !== '_' && v && v.px) a.push(v.px.length); }); a.sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; })() : 0;
      var needBase = s0.base && s0.base.shards && depth < 260, baseP = needBase ? shardSet('stocks-base', s0.base.shards).then(unpackAll, function (e) { out.errors.push('stocks-base: ' + e.message); return null; }) : Promise.resolve(null);
      return Promise.all([Promise.all(more), baseP]).then(function (got) { var rest = got[0], B = got[1], S = s0.stores && s0.stores[SKEY]; if (!S) return; var D = unpackAll([s0].concat(rest));
        if (B) { D = Hub.histMerge ? Hub.histMerge.mergeStore(SKEY, B, D, []) : D; out.base = s0.base; }
        var L = get(SKEY, null); out.snaps.stocks = { publishedAt: s0.publishedAt, by: s0.by, shards: n, base: s0.base || null, baseUsed: !!B };
        if (!live(S)) return; if (!force && !B && live(L) && ts(L) >= ts(S)) { out.same.push(SKEY); return; }
        var N = Object.assign({}, S, { data: D }); if (L) KEEP.forEach(function (x) { if (L[x] !== undefined) N[x] = L[x]; });
        if (live(L) && L.data && Hub.histMerge) { try { N.data = Hub.histMerge.mergeStore(SKEY, L.data, D, []); } catch (e) { /* keep the snapshot */ } }
        put(SKEY, N); out.updated.push(SKEY); }); }).catch(function (e) { out.errors.push('stocks: ' + e.message); });
    return Promise.all([stocks].concat(Object.keys(FILES).map(function (name) {
      return fetchSnap(name).then(function (snap) {
        out.snaps[name] = { publishedAt: snap.publishedAt, by: snap.by };
        Object.keys(snap.stores || {}).forEach(function (k) {
          var S = snap.stores[k], L = get(k, null);
          if (!live(S)) return;
          if (!force && live(L) && ts(L) >= ts(S)) { out.same.push(k); return; }
          var N = Object.assign({}, S); if (L) KEEP.forEach(function (x) { if (L[x] !== undefined) N[x] = L[x]; });
          // the snapshot adds to the history already on this device; it never shortens a series kept here (history guard)
          if (live(L) && L.data && Hub.histMerge) { try { N.data = Hub.histMerge.mergeStore(k, L.data, S.data, []); } catch (e) { /* keep the snapshot as is */ } }
          put(k, N); out.updated.push(k);
        });
      }).catch(function (e) { out.errors.push(name + ': ' + e.message); });
    }))).then(function () { put(KEY + '.last', { at: Date.now(), snaps: out.snaps }); return out; });
  }

  /* ---------- publish (PC): one commit with tse.json and/or tgju.json via the Git Data API ---------- */
  function gh(c, path, method, body) {
    if (!tokOK(cleanTok(c.token))) return Promise.reject(new Error('توکن GitHub قالب درستی ندارد (باید با github_pat_ یا ghp_ شروع شود و فقط حرف لاتین، عدد و _ داشته باشد). توکن را دوباره از GitHub کپی و ثبت کنید.'));
    c = Object.assign({}, c, { token: cleanTok(c.token) });
    return fetch('https://api.github.com/repos/' + c.repo + path, { cache: 'no-store', method: method || 'GET', headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error('GitHub ' + r.status + ': ' + (j.message || '')); e.status = r.status; throw e; } return j; }); });
  }
  /* the central verdict goes to the public repo for the push-alert job — without anything about the user's own positions */
  function publicCentral(C) { var by = {}; Object.keys(C.by || {}).forEach(function (k) { var r = Object.assign({}, C.by[k]); delete r.held; if (r.tier === 'pos') r.tier = 'none'; by[k] = r; }); return { at: C.at, upd: C.upd, by: by }; }
  /* one file through the contents API (used by the push setup: public VAPID key, subscriptions) */
  function putFile(path, text, msg) { var c = cfg(); if (!c.token) return Promise.reject(new Error('توکن GitHub روی این دستگاه ثبت نشده است'));
    var url = '/contents/' + path.split('/').map(encodeURIComponent).join('/'), b64 = btoa(unescape(encodeURIComponent(text)));
    return gh(c, url + '?ref=' + encodeURIComponent(c.branch)).then(function (j) { return j.sha; }, function (e) { if (e.status === 404) return null; throw e; })
      .then(function (sha) { return gh(c, url, 'PUT', Object.assign({ message: msg || ('hub: ' + path), content: b64, branch: c.branch }, sha ? { sha: sha } : {})); }); }
  function getFile(path) { var c = cfg(); if (!c.token) return Promise.reject(new Error('no token')); return gh(c, '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(c.branch)).then(function (j) { return decodeURIComponent(escape(atob(String(j.content || '').replace(/\n/g, '')))); }); }
  function packRows(rows) { if (!Array.isArray(rows) || !rows.length || typeof rows[0] !== 'object' || Array.isArray(rows[0])) return rows; var ks = {}; rows.forEach(function (r) { Object.keys(r).forEach(function (k) { ks[k] = 1; }); }); var K = Object.keys(ks);
    return { __p: 1, k: K, r: rows.map(function (r) { return K.map(function (k) { var v = r[k]; return v === undefined ? null : typeof v === 'number' && isFinite(v) && v % 1 ? +v.toPrecision(7) : v; }); }) }; }
  function unpackRows(o) { if (!o || o.__p !== 1) return o; return o.r.map(function (a) { var r = {}; o.k.forEach(function (k, i) { if (a[i] !== null) r[k] = a[i]; }); return r; }); }
  function packSym(v) { if (!v || typeof v !== 'object' || Array.isArray(v)) return Array.isArray(v) ? packRows(v) : v; var o = {}; Object.keys(v).forEach(function (k) { o[k] = Array.isArray(v[k]) ? packRows(v[k]) : v[k]; }); return o; }
  function unpackSym(v) { if (!v || typeof v !== 'object') return v; if (v.__p === 1) return unpackRows(v); if (Array.isArray(v)) return v; var o = {}; Object.keys(v).forEach(function (k) { o[k] = v[k] && v[k].__p === 1 ? unpackRows(v[k]) : v[k]; }); return o; }
  /* tail: only the last rows of each series (the phone merges them into the history it keeps — history guard). A full history
     (≈ 60 MB) is published at most once a week, the rest of the time a tail of 40 sessions (≈ 3 MB): the repository keeps every
     version of every file, so publishing the full set every half hour would grow it by gigabytes a month */
  /* layout (since 2026-11-19): the full history is published as a separate base set (stocks-base, stocks-base-1 …) at most weekly;
     stocks.json is always the 40-session tail and names the base it belongs to. A device whose history is short (a new phone)
     pulls the base once, then the tails — before this, a phone that missed the weekly full set received 40 sessions only. */
  function buildStocks(tail, base) {
    var S = get(SKEY, null); if (!live(S)) return [];
    var D = S.data || {}, keys = Object.keys(D), parts = [[]], size = 0, packed = {};
    keys.forEach(function (k) { var v = D[k]; if (tail && v && typeof v === 'object' && !Array.isArray(v)) { var t = {}; Object.keys(v).forEach(function (q) { t[q] = Array.isArray(v[q]) ? v[q].slice(-tail) : v[q]; }); v = t; } else if (tail && Array.isArray(v)) v = v.slice(-tail);
      var p = packSym(v), n = JSON.stringify(p).length; packed[k] = p; if (size + n > SHARD && parts[parts.length - 1].length) { parts.push([]); size = 0; } parts[parts.length - 1].push(k); size += n; });
    return parts.map(function (ks, i) { var d = {}; ks.forEach(function (k) { d[k] = packed[k]; });
      var st = i === 0 ? Object.assign({}, S, { data: d }) : { part: i, data: d };
      var pre = tail ? 'stocks' : 'stocks-base';
      return { name: i === 0 ? pre : pre + '-' + i, content: JSON.stringify({ version: 3, publishedAt: new Date().toISOString(), by: 'pc', shards: parts.length, tail: tail || 0, base: tail ? base || null : null, stores: (function () { var o = {}; o[SKEY] = st; return o; })() }, round) }; });
  }
  function build(names) {
    var files = [];
    names.forEach(function (name) {
      var st = {}; FILES[name].forEach(function (k) { var S = get(k, null); if (k === 'hub.central.v1') { if (S && S.by) st[k] = publicCentral(S); return; } if (live(S)) st[k] = S; });
      if (Object.keys(st).length) files.push({ name: name, content: JSON.stringify({ version: 1, publishedAt: new Date().toISOString(), by: 'pc', stores: st }, round) });
    });
    // widget.json: the trading engine's own dashboard feed (priorities, confirmed signals, pulse, index forecast) — opt-in; no positions or account data
    if (cfg().widget && Hub.tradeEngine) { try { var TS = get('hub.tradingEngine.v1', null), R = Hub.tradeEngine.run((TS && TS.e) || {}), W = R.widget(); if (W.asOf) files.push({ name: 'widget', content: JSON.stringify(W, round) }); } catch (e) { /* widget is optional */ } }
    return files;
  }
  function publish(names, progress) {
    var c = cfg(), withStocks = !names || names.indexOf('stocks') >= 0; names = (names || Object.keys(FILES)).filter(function (n) { return FILES[n]; });
    if (!c.token) return Promise.reject(new Error(fa() ? 'توکن GitHub وارد نشده است' : 'no GitHub token'));
    var pf = get(KEY + '.pubBase', null), full = withStocks && (!pf || Date.now() - pf.at > 7 * 864e5), small = build(names), big = [];
    if (withStocks) { var bs = full ? buildStocks(0) : [], bInfo = full ? { publishedAt: new Date().toISOString(), shards: bs.length } : pf && pf.info; big = bs.concat(buildStocks(40, bInfo)); }
    if (!small.length && !big.length) return Promise.reject(new Error(fa() ? 'دادهٔ واقعی برای انتشار نیست؛ اول به‌روزرسانی کنید' : 'no live data to publish'));
    var done = { at: Date.now(), files: [] }, say = progress || function () {};
    // 1 · the small sets (central verdict, gold & FX, news, options …) in one commit
    var head = null, p = small.length ? (say('بخش ۱ از ' + (1 + Math.ceil(big.length / 3)) + ': حکم مرکزی، طلا و ارز، خبرها'), commitFiles(small).then(function (i) { head = i.sha; done.files = done.files.concat(i.files); })) : Promise.resolve();
    // 2 · stock shards, three per commit (each commit is small enough to finish on a slow line)
    var groups = []; for (var g = 0; g < big.length; g += 3) groups.push(big.slice(g, g + 3));
    groups.forEach(function (grp, gi) { p = p.then(function () { say('بخش ' + (gi + 2) + ' از ' + (1 + groups.length) + ': سهام (' + grp.map(function (f) { return f.name; }).join('، ') + ')'); return commitFiles(grp, head).then(function (i) { head = i.sha; done.files = done.files.concat(i.files); }); }); });
    return p.then(function () { if (big.length && full) put(KEY + '.pubBase', { at: Date.now(), info: bInfo }); done.stocks = big.length ? (full ? 'full' : 'tail40') : 'none'; put(KEY + '.pub', done); return done; });
  }
  // widget.json only (phone or PC): the widget reads it from raw.githubusercontent.com (cache ≈ 5 min) or the site
  function publishWidget(W) {
    var c = cfg(); if (!c.token) return Promise.reject(new Error('توکن GitHub وارد نشده است'));
    return commitFiles([{ name: 'widget', content: JSON.stringify(W, round) }]).then(function (info) { put(KEY + '.wpub', info); return info; });
  }
  // head: the commit just made by this run (the next part builds on it — no re-read, no stale cache); retried on a race with another commit
  function commitFiles(files, head0) {
    var c = cfg(), refPath = '/git/refs/heads/' + c.branch.split('/').map(encodeURIComponent).join('/');
    var ref = '/git/ref/heads/' + c.branch.split('/').map(encodeURIComponent).join('/');
    var blobs = null;   // uploaded once; a retry only rebuilds the tree and the commit
    var upload = function () { if (blobs) return Promise.resolve(blobs); var out = [], chain = Promise.resolve();
      files.forEach(function (f) { chain = chain.then(function () { return gh(c, '/git/blobs', 'POST', { content: f.content, encoding: 'utf-8' }).then(function (b) { out.push({ path: c.dir.replace(/\/$/, '') + '/' + f.name + '.json', mode: '100644', type: 'blob', sha: b.sha }); }); }); });
      return chain.then(function () { blobs = out; return out; }); };
    var attempt = function (n, head) {
      return (head ? Promise.resolve(head) : gh(c, ref).then(function (r) { return r.object.sha; })).then(function (h) {
        return gh(c, '/git/commits/' + h).then(function (cm) { return upload().then(function (tree) { return gh(c, '/git/trees', 'POST', { base_tree: cm.tree.sha, tree: tree }); })
          .then(function (t) { return gh(c, '/git/commits', 'POST', { message: 'data: ' + files.map(function (f) { return f.name; }).join(' + ') + ' snapshot from PC', tree: t.sha, parents: [h] }); })
          .then(function (nc) { return gh(c, refPath, 'PATCH', { sha: nc.sha }).then(function () { return nc.sha; }); }); });
      }).catch(function (e) { if (n < 4 && (e.status === 422 || e.status === 409)) return new Promise(function (r) { setTimeout(r, 1500 * (n + 1)); }).then(function () { return attempt(n + 1, null); }); throw e; });   // another commit landed in between: rebuild on the new head
    };
    return attempt(0, head0 || null).then(function (sha) { var info = { at: Date.now(), sha: sha, files: files.map(function (f) { return f.name + ' (' + Math.round(f.content.length / 1024) + ' KB)'; }) }; put(KEY + '.pub', info); return info; });
  }
  function fa() { return Hub.i18n && Hub.i18n.lang() === 'fa'; }

  // auto-publish after a successful refresh on the PC (debounced; only if switched on and a token exists)
  var timer = null;
  function afterUpdate() { var c = cfg(), lp = get(KEY + '.pub', null); if (!c.auto || !c.token || served()) return; if (lp && Date.now() - lp.at < 30 * 6e4) return;   // auto: at most every 30 min (each publish is a commit)
    clearTimeout(timer); timer = setTimeout(function () { publish().then(function () { Hub.util && Hub.util.toast(fa() ? 'داده برای گوشی منتشر شد (حدود ۱ تا ۲ دقیقه تا رسیدن به گوشی).' : 'Published for the phone.', 'good'); }, function (e) { Hub.util && Hub.util.toast((fa() ? 'انتشار برای گوشی ناموفق: ' : 'Publish failed: ') + e.message, 'warn'); }); }, 20000); }
  if (root.addEventListener) root.addEventListener('hub:data-updated', afterUpdate);

  // on the phone: pull once on opening
  /* the app waits for this pull before it mounts the page (app.js): new data are in place before the first engine run, so a phone never runs
     the engine twice on opening (once on the old data, again after the pull) — two runs at once were the cause of the iPhone tab crashes */
  var BOOTP = null;
  function bootFirst() {
    if (BOOTP) return BOOTP; if (!served() || !cfg().autoPull) return (BOOTP = Promise.resolve(null));
    var rd = Hub.util && Hub.util.store && Hub.util.store.ready ? Hub.util.store.ready() : Promise.resolve();
    BOOTP = rd.then(function () { return pull(false); }).then(function (r) { BOOTED = true; if (r && r.updated.length) Hub.util && Hub.util.toast((fa() ? 'دادهٔ جدید از کامپیوتر رسید: ' : 'New data arrived: ') + r.updated.length + (fa() ? ' مجموعه' : ' sets'), 'good'); if (r && r.updated.length && Hub.__appStarted && Hub.rerenderAll) Hub.rerenderAll(); return r; }, function () { BOOTED = true; return null; });
    return BOOTP; }
  var BOOTED = false;
  function boot() {
    if (BOOTP) return;   // the app already pulled before mounting
    if (!served() || !cfg().autoPull) return;
    var rd = Hub.util && Hub.util.store && Hub.util.store.ready ? Hub.util.store.ready() : Promise.resolve();
    rd.then(function () { return pull(false); }).then(function (r) { if (r.updated.length) { Hub.util && Hub.util.toast((fa() ? 'دادهٔ جدید از کامپیوتر رسید: ' : 'New data arrived: ') + r.updated.length + (fa() ? ' مجموعه' : ' sets'), 'good'); if (Hub.rerenderAll) Hub.rerenderAll(); } });
  }
  if (root.document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 800); }); else setTimeout(boot, 800); }

  /* token check without writing anything: valid? this repository? write access? (GET the repository; permissions come back for the token) */
  function testToken() { var c = cfg(); if (!c.token) return Promise.resolve({ ok: false, why: 'توکنی ثبت نشده است.' });
    var tail = c.token.slice(-4);
    return gh(c, '').then(function (j) { var p = j.permissions || {}; return p.push ? { ok: true, why: 'توکن معتبر است و روی مخزن ' + c.repo + ' اجازهٔ نوشتن دارد (چهار نویسهٔ آخر: …' + tail + ').' } : { ok: false, why: 'توکن معتبر است ولی روی ' + c.repo + ' فقط اجازهٔ خواندن دارد: در GitHub برای این توکن «Contents: Read and write» را فعال کنید.' }; },
      function (e) { return { ok: false, why: e.status === 401 ? 'GitHub این توکن را نمی‌شناسد (۴۰۱): باطل شده، منقضی شده یا ناقص کپی شده است. چهار نویسهٔ آخرِ توکن ثبت‌شده: …' + tail + ' — با چهار نویسهٔ آخر توکن تازه در GitHub مقایسه کنید.' : e.status === 404 ? 'توکن معتبر است ولی به مخزن ' + c.repo + ' دسترسی ندارد (۴۰۴): در تنظیمات توکن، «Repository access» را روی همین مخزن بگذارید.' : e.status === 403 ? 'دسترسی رد شد (۴۰۳): ' + e.message : e.message }; }); }
  Hub.dataSync = { bootFirst: bootFirst, _buildStocks: buildStocks, _unpackSym: unpackSym, testToken: testToken, tokOK: function (t) { return tokOK(cleanTok(t)); }, putFile: putFile, getFile: getFile, cfg: cfg, setCfg: setCfg, pull: pull, publish: publish, publishWidget: publishWidget, lastWidgetPub: function () { return get(KEY + '.wpub', null); }, served: served, FILES: FILES, last: function () { return get(KEY + '.last', null); }, lastPub: function () { return get(KEY + '.pub', null); }, notify: function () { try { root.dispatchEvent(new Event('hub:data-updated')); } catch (e) { /* old browsers */ } } };
})(typeof window !== 'undefined' ? window : globalThis);
