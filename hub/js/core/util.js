/* =====================================================================
 * CORE UTILITIES — parsing, formatting, DOM, storage, file save, toast.
 * Classic script (no ES modules) so index.html runs from file:// too.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};

  /* ---------- number parsing ------------------------------------------
   * Accepts: 1,234.5  (1,234)  -12%  ۱۲۳٬۴۵۶  ١٢٣  1.2e3  "—"
   * Persian/Arabic digits and separators are normalised so figures can be
   * pasted straight from Codal / Excel sheets in Persian locale. */
  var FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
  function normaliseDigits(s) {
    return String(s).replace(/[۰-۹]/g, function (d) { return FA.indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return AR.indexOf(d); })
      .replace(/[٬،]/g, ',').replace(/٫/g, '.').replace(/−/g, '-');
  }
  function parseNum(raw) {
    if (raw === null || raw === undefined) return NaN;
    if (typeof raw === 'number') return raw;
    var s = normaliseDigits(raw).trim();
    if (s === '' || s === '-' || s === '—' || s === '–') return 0;
    var neg = /^\(.*\)$/.test(s);
    s = s.replace(/[()\s%x×]/gi, '').replace(/,/g, '');
    var v = parseFloat(s);
    if (!isFinite(v)) return NaN;
    return neg ? -v : v;
  }

  /* ---------- formatting --------------------------------------------- */
  function fmtNum(v, dp) {
    if (v === null || v === undefined || !isFinite(v)) return '–';
    dp = dp === undefined ? 0 : dp;
    var a = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    if (Number(a.replace(/,/g, '')) === 0) return dp ? (0).toFixed(dp) : '0';
    return v < 0 ? '(' + a + ')' : a;
  }
  function fmtPct(v, dp) { return v === null || v === undefined || !isFinite(v) ? '–' : (v * 100).toFixed(dp === undefined ? 1 : dp) + '%'; }
  function fmtX(v, dp) { return v === null || v === undefined || !isFinite(v) ? '–' : v.toFixed(dp === undefined ? 1 : dp) + 'x'; }
  function fmt(v, kind) {
    switch (kind) {
      case 'pct': return fmtPct(v);
      case 'pct2': return fmtPct(v, 2);
      case 'x': return fmtX(v);
      case 'days': return fmtNum(v, 0);
      case 'dec': return fmtNum(v, 2);
      case 'dec3': return fmtNum(v, 3);
      case 'ps': return fmtNum(v, 0);
      default: return fmtNum(v, 0);
    }
  }
  // value shown inside an input box (no thousands parentheses, % as number)
  function toInput(v, kind) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    if (kind === 'pct' || kind === 'pct2') return String(+(v * 100).toFixed(4));
    if (kind === 'num') return Math.round(v * 100) / 100 === Math.round(v) ? Math.round(v).toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return String(+Number(v).toFixed(4));
  }
  function fromInput(s, kind) {
    var v = parseNum(s);
    if (!isFinite(v)) return NaN;
    return kind === 'pct' || kind === 'pct2' ? v / 100 : v;
  }

  /* ---------- object paths ------------------------------------------ */
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setPath(o, p, v) {
    var ks = p.split('.'), last = ks.pop();
    var t = ks.reduce(function (a, k) { if (a[k] == null) a[k] = {}; return a[k]; }, o);
    t[last] = v;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- DOM ---------------------------------------------------- */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { e.dataset[d] = v[d]; });
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /* ---------- storage (never throws) --------------------------------- */
  /* Big data sets (76 symbols × a year of bars ≈ 4 MB) do not fit the phone's localStorage (iPhone ≈ 2.5 M characters per site,
   * shared by every app on the same address). So: a memory copy answers reads, IndexedDB keeps it (hundreds of MB),
   * and localStorage only keeps the small items. If IndexedDB is not available, it works as before. */
  var mem = {}, idb = null, readyP = null, SMALL = 60000, warned = false, OBJ = {};
  var BIG = { 'hub.sigstocks.v1': 1, 'hub.sigoptions.v1': 1, 'hub.longview.v1': 1, 'hub.sigtemporal.v1': 1, 'hub.sig-gold.v1': 1, 'hub.sig-fx.v1': 1, 'hub.sig-global.v1': 1 };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  /* several pages of the system (module pages, tabs) share this store: a write is announced on a BroadcastChannel once it is in
     IndexedDB, and the other open pages reload that key; pending writes are tracked so a page can be left only after they landed */
  var bc = null, pend = [];
  try { if (root.BroadcastChannel) { bc = new root.BroadcastChannel('hub-store'); bc.onmessage = function (e) { var k = e && e.data && e.data.k; if (!k || SKIPPED[k]) return; delete OBJ[k];
    if (!idb) { delete mem[k]; return; } try { var g = idb.transaction('kv', 'readonly').objectStore('kv').get(k); g.onsuccess = function () { mem[k] = g.result == null ? null : g.result; delete OBJ[k]; try { document.dispatchEvent(new CustomEvent('hub:store', { detail: { k: k } })); } catch (x) { /* ignore */ } }; } catch (x) { delete mem[k]; } }; } } catch (e) { bc = null; }
  function announce(k) { if (bc) try { bc.postMessage({ k: k }); } catch (e) { /* ignore */ } }
  function idbPut(k, s) { if (!idb) { announce(k); return; } try { var tx = idb.transaction('kv', 'readwrite'); if (s == null) tx.objectStore('kv').delete(k); else tx.objectStore('kv').put(s, k);
    var p = new Promise(function (res) { tx.oncomplete = function () { announce(k); res(); }; tx.onerror = tx.onabort = function () { res(); }; }); pend.push(p); p.then(function () { pend = pend.filter(function (x) { return x !== p; }); }); } catch (e) { /* ignore */ } }
  function full() { if (warned) return; warned = true; try { toast((root.Hub.i18n && root.Hub.i18n.lang() === 'fa') ? 'حافظهٔ مرورگر پر است؛ دادهٔ تازه فقط تا بستن برنامه می‌ماند.' : 'Browser storage is full; new data lasts only until the app is closed.', 'warn'); } catch (e) { /* ignore */ } }
  /* on a phone the big stores are held once, as the parsed object: the JSON text (the stock store is ≈ 170 MB of text, twice that in memory)
     is dropped once it is parsed and written; a short token stands in for it, so a later get still returns the same object. Writes and
     reloads from another page (BroadcastChannel) replace the token as before. Desktop keeps the text (no change there). */
  var LEN = {}, SEQ = 0, LITE0 = null, LAZY = { 'hub.sigstocks.v1': 1 }, SKIPPED = {};
  function lazyOn() { if (!liteDev()) return false; try { return sessionStorage.getItem('hub.fullEngine') !== '1'; } catch (e) { return true; } }
  function liteDev() { if (LITE0 === null) { try { LITE0 = !!(root.Hub && root.Hub.util && root.Hub.util.lite && root.Hub.util.lite()); } catch (e) { LITE0 = false; } } return LITE0; }
  function slim(k) { var c = OBJ[k]; if (!c || !idb || typeof c.s !== 'string' || c.s.length < 5e6 || !liteDev()) return; LEN[k] = c.s.length; var tok = '\u0001' + k + '#' + (++SEQ); mem[k] = tok; c.s = tok; }
  var store = {
    // the big market-data stores (the stock store is ≈ 110 MB of JSON with a market-wide watch list) are parsed once and the object is kept:
    // parsing them on every read made several 500 MB copies during one update — a main cause of the phone running out of memory
    get: function (k, d) { try { var v = Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : lsGet(k); if (v == null) return d;
      if (BIG[k]) { var c = OBJ[k]; if (c && c.s === v) return c.o; var o = JSON.parse(v); OBJ[k] = { s: v, o: o }; slim(k); return o; } return JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { if (SKIPPED[k]) { try { console.warn('hub store: '+k+' not loaded on this phone (viewer) — write refused'); } catch (e) {} return false; }
      var s; try { s = JSON.stringify(v); } catch (e) { return false; }
      mem[k] = s; idbPut(k, s); if (BIG[k]) { OBJ[k] = { s: s, o: v }; slim(k); }
      if (idb && s.length > SMALL) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } return true; }
      try { localStorage.setItem(k, s); return true; } catch (e) { if (!idb) full(); return !!idb; }
    },
    del: function (k) { delete OBJ[k]; delete mem[k]; mem[k] = null; idbPut(k, null); try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
    ready: function () {
      if (readyP) return readyP;
      return (readyP = new Promise(function (res) {
        var done = false, fin = function () { if (!done) { done = true; res(!!idb); } };
        try {
          if (!root.indexedDB) return fin();
          var rq = root.indexedDB.open('hub-store', 1);
          rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
          rq.onerror = rq.onblocked = fin;
          rq.onsuccess = function () {
            var db = rq.result;
            try {
              var os = db.transaction('kv', 'readonly').objectStore('kv'), cur;
              /* phone viewer: the stock history (≈ 170 MB) is not read from the database at all — the phone shows the computer's central record.
                 Its key is marked, so nothing on this page can overwrite the stored history with a partial copy (set() refuses it). */
              if (lazyOn() && os.getAllKeys) { var gk = os.getAllKeys(), left = 0, after = function () { idb = db; fin2(); };
                gk.onsuccess = function () { var ks = gk.result || []; ks.forEach(function (k) { if (LAZY[k]) { SKIPPED[k] = true; return; } if (Object.prototype.hasOwnProperty.call(mem, k)) return; left++; var g = os.get(k); g.onsuccess = function () { mem[k] = g.result; if (--left === 0) after(); }; g.onerror = function () { if (--left === 0) after(); }; }); if (!left) after(); };
                gk.onerror = fin; return; }
              cur = os.openCursor();
              cur.onsuccess = function () { var c = cur.result; if (c) { if (!Object.prototype.hasOwnProperty.call(mem, c.key)) mem[c.key] = c.value; c.continue(); } else { idb = db; fin2(); } };
              function fin2() {
                // move big items that are still in localStorage (older versions) over, and free the space
                try { for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (!/^hub\./.test(k)) continue; var v = localStorage.getItem(k); if (v && v.length > SMALL) { if (!Object.prototype.hasOwnProperty.call(mem, k)) { mem[k] = v; idbPut(k, v); } localStorage.removeItem(k); } } } catch (e) { /* ignore */ }
                Object.keys(mem).forEach(function (k) { if (!SKIPPED[k]) idbPut(k, mem[k]); });   // anything written before the database opened
                fin(); }
              if (cur) cur.onerror = fin;
            } catch (e) { fin(); }
          };
          setTimeout(fin, 2500);
        } catch (e) { fin(); }
      }));
    },
    backend: function () { return idb ? 'IndexedDB' : 'localStorage'; },
    flush: function () { return Promise.all(pend.slice()); },
    size: function (k) { if (LEN[k] && OBJ[k] && mem[k] === OBJ[k].s) return LEN[k]; var v = Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : lsGet(k); return v ? v.length : 0; }
  };

  /* ---------- toast -------------------------------------------------- */
  function toast(msg, level) {
    var box = document.getElementById('toasts');
    if (!box) return;
    var t = h('div', { class: 'toast ' + (level || 'info'), role: 'status', text: msg });
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 3600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4200);
  }

  /* ---------- file save ----------------------------------------------
   * Local / normal browser: anchor download.
   * Inside a claude.ai artifact: the `downloads` runtime capability
   * (the sandbox blocks direct downloads). */
  var dl = null, dlTried = false;
  function capabilityDownloads() {
    if (dlTried) return Promise.resolve(dl);
    dlTried = true;
    if (!root.claude || typeof root.claude.use !== 'function') return Promise.resolve(null);
    return root.claude.use('downloads').then(function (d) { dl = d; return d; }).catch(function () { return null; });
  }
  function saveFile(filename, blob) {
    return capabilityDownloads().then(function (d) {
      if (d) {
        return blob.arrayBuffer().then(function (buf) { return d.save({ filename: filename, data: new Uint8Array(buf) }); })
          .then(function () { toast('Saved ' + filename, 'good'); })
          .catch(function (e) { if (e && e.code !== 'declined') toast('Could not save file: ' + (e.message || e.code), 'crit'); });
      }
      var url = URL.createObjectURL(blob);
      var a = h('a', { href: url, download: filename });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('Downloaded ' + filename, 'good');
    });
  }
  function stamp() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function slug(s) { return String(s || 'model').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 40); }

  function csvFromRows(rows) {
    return rows.map(function (r) {
      return r.map(function (c) { var s = c == null ? '' : String(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
    }).join('\r\n');
  }

  /* large assets (PDF worker, OCR engine, Persian OCR data) loaded only when a PDF is read: inline in the old single-file build
     (<script type="text/plain" id=…>); on a page opened from disk, one shared copy in vendor/asset-<id>.js (a script tag works over
     file://, a fetch does not); on a served page, the file itself from vendor/ */
  var ASSETS = {};
  function asset(id, file) {
    if (ASSETS[id]) return ASSETS[id];
    var el = root.document && document.getElementById(id); if (el) return (ASSETS[id] = Promise.resolve(el.textContent));
    var VB = root.HUB_VENDOR || 'vendor/';
    if (root.location && root.location.protocol === 'file:') return (ASSETS[id] = new Promise(function (res) {
      var s = document.createElement('script'); s.src = VB + 'asset-' + id + '.js';
      s.onload = function () { res((root.HUB_ASSET || {})[id] || null); }; s.onerror = function () { res(null); }; document.head.appendChild(s); }));
    return (ASSETS[id] = root.fetch ? root.fetch(VB + file).then(function (r) { return r.ok ? r.text() : null; }).catch(function () { return null; }) : Promise.resolve(null));
  }
  Hub.util = { asset: asset, parseNum: parseNum, normaliseDigits: normaliseDigits, fmt: fmt, fmtNum: fmtNum, fmtPct: fmtPct, fmtX: fmtX,
    toInput: toInput, fromInput: fromInput, getPath: getPath, setPath: setPath, clone: clone, h: h, clear: clear,
    /* phone profile: a phone browser keeps the full five-year history only for the core watch list; the rest of a market-wide list keeps
       300 sessions (short and medium horizons work, the long horizon says «داده ناکافی»). Override: localStorage hub.lite = '1' / '0'. */
    lite: function () { try { var o = localStorage.getItem('hub.lite'); if (o === '1') return true; if (o === '0') return false; } catch (e) { /* ignore */ }
      var n = root.navigator || {}; return /iPhone|iPad|iPod|Android|Mobile/i.test(n.userAgent || '') || (n.maxTouchPoints > 1 && /Macintosh/.test(n.userAgent || '')) || (n.deviceMemory > 0 && n.deviceMemory <= 4); },
    store: store, toast: toast, saveFile: saveFile, stamp: stamp, slug: slug, csvFromRows: csvFromRows };
})(window);
