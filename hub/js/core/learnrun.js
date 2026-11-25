/* Hub.learnRun — directive 27, the running part of the learning loop (browser): one learning cycle on the engine's bars, versions with
   approval and rollback, scoring of every asset in each central build, live watch of the active version, the missed-opportunity register.

   The cycle (every step written to the cycle log):
     1 move events of every asset and direction (Hub.learn.events) — 2 was each one flagged before it started (alerts + walk-forward model)
     3 the missed ones go to the register — 4 root cause (primary + contributing, point in time) — 5 corrective action by layer
     6 re-fit (per market and direction) — 7 walk-forward validation with embargo, against the current rules — 8 accepted parts form a
     candidate version — 9 release: by the user's approval (or automatically when «انتشار خودکار» is on) — 10 live watch; rollback when the
     live precision falls below the test's lower bound.
   Runs on the computer only (on a phone the engine is not run; the phone shows the published register and figures).                   */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.learn.v1', MKEY = 'hub.missed.v1';
  var U = function () { return Hub.util; }, LN = function () { return Hub.learn; };
  var isF = function (x) { return typeof x === 'number' && isFinite(x); };
  var MK = { stock: 'سهام', fund: 'صندوق', gold: 'طلا و سکه', fx: 'ارز', crypto: 'رمزارز', commodity: 'کالا' }, DIRFA = { 1: 'صعودی (فرصت خرید)', '-1': 'نزولی (خروج / کاهش موقعیت)' };
  // related asset per market (cross-market feature): gold, coins and FX against the dollar, gold funds against 18k gold, crypto against BTC
  function refKey(r) { if (r.cls === 'gold' || r.cls === 'fx') return r.key === 'g:price_dollar_rl' ? null : 'g:price_dollar_rl'; if (r.cls === 'fund' && /gold/.test(r.ftype || r.grp || '')) return 'g:geram18'; if (r.cls === 'crypto') return r.key === 'x:btc' ? null : 'x:btc'; return null; }
  function load() { var S = U().store.get(KEY, null) || {}; S.versions = S.versions || []; S.cycles = S.cycles || []; S.log = S.log || []; S.live = S.live || {}; S.set = S.set || { auto: false }; return S; }
  function save(S) { S.versions = S.versions.slice(-12); S.cycles = S.cycles.slice(-30); S.log = S.log.slice(-200); U().store.set(KEY, S); }
  function loadM() { var M = U().store.get(MKEY, null) || {}; M.items = M.items || []; return M; }
  // kept: the most recent first, missed before warned, larger moves first — at most 600 (the register is published to the phone)
  function saveM(M) { M.items = M.items.sort(function (a, b) { return (b.ds - a.ds) || ((a.warned ? 1 : 0) - (b.warned ? 1 : 0)) || (b.z - a.z); }).slice(0, 600); U().store.set(MKEY, M); }
  function active(S) { S = S || load(); return S.active ? S.versions.filter(function (v) { return v.id === S.active; })[0] || null : null; }
  function slimM(M) { var o = {}; ['ev', 'pre', 'dur', 'miss', 'ep', 'tp', 'bars', 'pmdr', 'prec', 'far', 'leadAvg', 'f1', 'fb', 'exeRate', 'hitRate', 'potAvg', 'realAvg'].forEach(function (k) { o[k] = isF(M[k]) ? +M[k].toFixed(4) : M[k]; }); o.byReg = M.byReg; return o; }
  function ms(d) { return Date.UTC(Math.floor(d / 1e4), Math.floor(d / 100) % 100 - 1, d % 100) - 3.5 * 36e5; }

  /* ---------- items from the engine's bars (the same adjusted series the verdicts use) ---------- */
  function itemsOf() { var R = Hub.tradeUI && Hub.tradeUI.engineMemo ? Hub.tradeUI.engineMemo() : null, X = R && (R.X || R), Z = X && X.zmap, C = X && X.central; if (!Z || !C) return null;   // engineMemo returns the run output itself
    var out = []; Object.keys(Z).forEach(function (k) { var z = Z[k], r = C.by[k], Xz = z && z.R && z.R.X; if (!r || !Xz || !MK[r.cls] || z.a && z.a.sample || Xz.n < 400) return; out.push({ key: k, sym: r.sym, cls: r.cls, ftype: r.ftype, grp: r.grp, X: Xz, ref: refKey(Object.assign({ key: k }, r)), aid: r.aid }); });
    out.forEach(function (it) { var z = it.ref && Z[it.ref], X2 = z && z.R && z.R.X; it.refX = X2 ? { d: X2.d, c: X2.c } : null; }); return out; }

  /* ---------- the cycle ---------- */
  var RUN = { busy: false, step: '', pct: 0 };
  function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function run(opt) { opt = opt || {}; if (RUN.busy) return Promise.reject(new Error('چرخهٔ یادگیری در حال اجراست'));
    if (U().lite && U().lite()) return Promise.reject(new Error('چرخهٔ یادگیری روی گوشی اجرا نمی‌شود (حافظه)؛ روی کامپیوتر اجرا و منتشر می‌شود'));
    var L = LN(), items = itemsOf(); if (!L || !items || !items.length) return Promise.reject(new Error('دادهٔ موتور در دسترس نیست — ابتدا «به‌روزرسانی همه» یا اجرای موتور'));
    RUN.busy = true; var t0 = Date.now(), S = load(), cyc = { at: t0, id: null, n: items.length, parts: {}, log: [] }, prevV = active(S), A = Hub.alerts ? Hub.alerts.load().log : [];
    var say = function (t) { RUN.step = t; cyc.log.push(new Date().toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran' }) + ' — ' + t); try { document.dispatchEvent(new CustomEvent('hub:learn', { detail: RUN })); } catch (e) { /* ignore */ } };
    var groups = []; Object.keys(MK).forEach(function (c) { var its = items.filter(function (x) { return x.cls === c; }); if (its.length) [1, -1].forEach(function (d) { groups.push({ cls: c, dir: d, its: its }); }); });
    var ver = { id: 'L27-' + new Date(t0).toISOString().slice(0, 16).replace(/[-:T]/g, ''), at: t0, core: L.VER, cfg: L.CFG, models: {}, status: 'candidate', prev: prevV ? prevV.id : null }, reg = [], gi = 0;
    var M0 = loadM(), seen = {}; M0.items.forEach(function (x) { seen[x.id] = x; });
    function next() { if (gi >= groups.length) return Promise.resolve(); var g = groups[gi++]; RUN.pct = Math.round(100 * gi / (groups.length + 1)); say('بازآموزی و آزمون رو به جلو: ' + MK[g.cls] + ' · ' + DIRFA[g.dir] + ' (' + g.its.length + ' دارایی)');
      return yieldUI().then(function () {
        var seqs = g.its.map(function (it) { var P = L.prepare(it.X, it.refX); return Object.assign(L.seqOf({ key: it.key, cls: it.cls, P: P }, g.dir), { sym: it.sym, aid: it.aid }); });
        var W = L.walk(seqs, { stride: g.cls === 'stock' || g.cls === 'fund' ? 2 : 1, keep: false }), acc = L.accept(W), k = g.cls + '|' + g.dir;
        if (W.na) { ver.models[k] = { na: W.na, acc: acc }; say('— ' + W.na); return next(); }
        ver.models[k] = { acc: acc, m: { w: W.final.m.w, mu: W.final.m.mu, sd: W.final.m.sd }, thr: W.final.thr, combo: W.final.combo, n: g.its.length, wins: W.wins, folds: W.folds.map(function (f) { return { from: f.from, to: f.to, thr: f.thr, combo: f.combo, fb: +f.model.fb.toFixed(3), prec: f.model.prec, pmdr: f.model.pmdr, far: f.model.far, nearFb: +f.near.fb.toFixed(3), brkFb: +f.brk.fb.toFixed(3) }; }),
          oos: { model: slimM(W.model), near: slimM(W.near), brk: slimM(W.brk) }, D0: W.D0, D1: W.D1 };
        say('— ' + (acc.ok ? 'پذیرفته شد' : 'پذیرفته نشد: ' + acc.why.join('؛ ')) + ' · خارج از نمونه: شناسایی پیش از حرکت ' + pc(W.model.pmdr) + '، دقت ' + pc(W.model.prec) + '، هشدار کاذب ' + f1(W.model.far) + ' در ۱۰۰۰ جلسه (قاعدهٔ فعلی: ' + pc(W.near.pmdr) + '، ' + pc(W.near.prec) + '، ' + f1(W.near.far) + ')');
        // register: recent events (last 60 sessions) — flagged before? by the system (alerts) and by the walk-forward model (out of sample)
        seqs.forEach(function (q) { var n = q.P.n, dEnd = q.d[Math.max(0, q.last)], from = q.d[Math.max(0, n - 60)];
          q.ev.forEach(function (e) { if (q.d[e.s] < from || e.s > q.last + L.CFG.W) return; var id = q.key + '|' + g.dir + '|' + q.d[e.s], old = seen[id];
            var tS = ms(q.d[e.s]), tE = ms(q.d[e.e]), pre = A.filter(function (a) { return a.key === q.key && a.at <= tS + 20 * 36e5 && a.at >= tS - 10 * 864e5 && (g.dir > 0 ? /preBuy|preBreak|preFloor|buyOk|preMove$|brk$/.test(a.t) : /preCeil|sellOk|stop|reduce|preMoveDn|brkDn/.test(a.t)); });
            var dur = A.filter(function (a) { return a.key === q.key && a.at > tS + 20 * 36e5 && a.at <= tE + 20 * 36e5; });
            var fm = W.mods.filter(function (f) { return q.d[e.s] >= f.testFrom && q.d[e.s] <= f.testTo; })[0] || W.mods[W.mods.length - 1], af = L.alertOf(fm.m, fm.thr, fm.combo), tPre = -1, pMax = 0;
            for (var t = Math.max(L.CFG.warm, e.s - L.CFG.L + 1); t <= e.s; t++) { if (!q.f[t]) continue; pMax = Math.max(pMax, L.prob(fm.m, q.f[t])); if (tPre < 0 && af(q, t)) tPre = t; }
            var X = q.P.X, px0 = X.c[e.s], mfe = 0, mae = 0; for (t = e.s + 1; t <= Math.min(n - 1, e.e); t++) { mfe = Math.max(mfe, g.dir * Math.log(X.c[t] / px0)); mae = Math.min(mae, g.dir * Math.log(X.c[t] / px0)); }
            var led = Hub.central && Hub.central.asOf && q.aid ? Hub.central.asOf(q.aid, tS) : null, H0 = Hub.central && Hub.central.ledger && q.aid ? Hub.central.ledger(q.aid) : [], ledStart = H0 && H0.length ? H0[0].at : null;
            var cz = pre.length ? null : L.causes(q, e, { led: led && led.c ? Object.assign({ lv: led.c.lv }, led.c) : null, n0: e.s, inCentral: ledStart && ledStart < tS ? !!led : undefined, p: pMax, thr: fm.thr, alerts: dur.map(function (a) { var dd = Number(new Date(a.at + 3.5 * 36e5).toISOString().slice(0, 10).replace(/-/g, '')); var j = q.d.indexOf(dd); return { t: j < 0 ? e.s + 1 : j, at: a.at }; }) });
            var act = cz && cz.primary ? L.ACTION[cz.primary.k] : null, ex = g.dir > 0 ? L.exec(q, Math.max(e.s, tPre >= 0 ? tPre : e.s), e) : null;
            var item = { id: id, key: q.key, sym: q.sym, cls: q.cls, mk: MK[q.cls], dir: g.dir, typeFa: g.dir > 0 ? 'خرید' : 'خروج / کاهش موقعیت', ds: q.d[e.s], de: q.d[e.e], dur: e.e - e.s, px0: px0, pxEnd: X.c[e.e], pxNow: X.c[n - 1], r: Math.exp(g.dir * e.r) - 1, amt: X.c[e.e] - px0, mfe: Math.exp(mfe) - 1, mae: Math.exp(mae) - 1, z: +e.z.toFixed(2),
              sys: pre.length ? 'هشدار پیش از حرکت: ' + pre.slice(0, 2).map(function (a) { return a.title; }).join('؛ ') : dur.length ? 'اولین اعلان در جریان حرکت: ' + dur[0].title : 'اعلانی صادر نشد',
              warned: !!pre.length, cen: led && led.c ? { tier: led.c.tier, act: led.c.act, st: led.c.st, at: led.at } : null, ledStart: ledStart, lastData: q.d[Math.max(0, e.s - 1)],
              cause: cz ? { p: cz.primary, c: cz.contrib } : null, action: act ? { layer: act[0], layerFa: L.LAYERFA[act[0]], mode: act[1], fa: act[2] } : null,
              valid: { ver: ver.id, fold: fm.to, pre: tPre >= 0, lead: tPre >= 0 ? e.s - tPre : null, p: +pMax.toFixed(3), thr: fm.thr, combo: fm.combo, accepted: acc.ok },
              real: ex ? { ok: ex.ok, net: ex.ok ? Math.exp(ex.net) - 1 : null, why: ex.why || '' } : null, seen: old ? (old.seen || 1) + 1 : 1, first: old ? old.first || old.at : t0, at: t0 };
            item.status = item.warned ? 'هشدار به‌موقع داده شد' : !item.cause ? 'بدون تحلیل' : item.action && item.action.mode === 'none' ? 'تحلیل‌شده — با دادهٔ قیمت قابل پیشگیری نبود (' + item.cause.p.fa + ')' : item.valid.pre ? (acc.ok ? 'تحلیل‌شده — نسخهٔ جدید آن را پیش از حرکت می‌گرفت (خارج از نمونه)' : 'تحلیل‌شده — مدل جدید می‌گرفت ولی نسخه در کل پذیرفته نشد') : 'تحلیل‌شده — هنوز قابل پیشگیری نیست؛ در چرخهٔ بعد دوباره سنجیده می‌شود';
            reg.push(item); }); });
        return next(); }); }
    say('آغاز چرخهٔ یادگیری: ' + items.length + ' دارایی، ' + groups.length + ' گروه بازار × جهت');
    return next().then(function () {
      var okParts = Object.keys(ver.models).filter(function (k) { return ver.models[k].acc && ver.models[k].acc.ok; });
      ver.status = okParts.length ? 'passed' : 'rejected'; ver.note = okParts.length ? okParts.length + ' بخش پذیرفته شد: ' + okParts.map(function (k) { var p = k.split('|'); return MK[p[0]] + ' ' + (p[1] === '1' ? '↑' : '↓'); }).join('، ') : 'هیچ بخشی بهتر از قاعدهٔ فعلی نبود — قواعد فعلی ماندند';
      // improvement against the previous version, per part (same metric, out of sample)
      okParts.concat(Object.keys(ver.models)).forEach(function (k) { var a = ver.models[k], b = prevV && prevV.models && prevV.models[k]; if (a && a.oos && b && b.oos) a.vsPrev = { fb: +(a.oos.model.fb - b.oos.model.fb).toFixed(3), pmdr: +(a.oos.model.pmdr - b.oos.model.pmdr).toFixed(3), far: +(a.oos.model.far - b.oos.model.far).toFixed(2) }; });
      // repeat-error rate: missed this cycle whose primary cause was already registered (and analysed) in an earlier cycle for the same market
      var prevCause = {}; M0.items.forEach(function (x) { if (x.cause && x.cause.p && !x.warned) prevCause[x.cls + '|' + x.cause.p.k] = 1; });
      var newMiss = reg.filter(function (x) { return !x.warned && !seen[x.id]; }), rep = newMiss.filter(function (x) { return x.cause && x.cause.p && prevCause[x.cls + '|' + x.cause.p.k]; });
      cyc.id = ver.id; cyc.dur = Date.now() - t0; cyc.accepted = okParts; cyc.events = reg.length; cyc.missed = reg.filter(function (x) { return !x.warned; }).length; cyc.repeat = { n: newMiss.length, rep: rep.length };
      S.versions.push(ver); S.cycles.push({ at: cyc.at, id: cyc.id, dur: cyc.dur, n: cyc.n, accepted: okParts, events: cyc.events, missed: cyc.missed, repeat: cyc.repeat, log: cyc.log.slice(-60) });
      if (ver.status === 'passed' && S.set.auto) activateIn(S, ver.id, 'انتشار خودکار پس از پذیرش آزمون'); else if (ver.status === 'passed') S.log.push({ at: Date.now(), t: 'نسخهٔ ' + ver.id + ' آزمون را گذراند؛ منتظر تأیید انتشار' });
      save(S); var keep = {}; reg.forEach(function (x) { keep[x.id] = 1; }); var M = loadM(); M.items = M.items.filter(function (x) { return !keep[x.id]; }).concat(reg); M.at = Date.now(); M.ver = ver.id; saveM(M);
      say('پایان چرخه (' + Math.round(cyc.dur / 1000) + ' ثانیه): ' + ver.note); RUN.busy = false; RUN.pct = 100; return { ver: ver, cyc: cyc }; }, function (e) { RUN.busy = false; say('خطا: ' + (e && e.message || e)); throw e; }); }
  function pc(x) { return isF(x) ? (100 * x).toFixed(1) + '٪' : '—'; } function f1(x) { return isF(x) ? x.toFixed(1) : '—'; }

  /* ---------- release, rollback ---------- */
  function activateIn(S, id, why) { var v = S.versions.filter(function (x) { return x.id === id; })[0]; if (!v || v.status === 'rejected') return false;
    var cur = active(S); if (cur && cur.id !== id) { cur.status = 'retired'; S.prev = cur.id; } v.status = 'active'; v.activeAt = Date.now(); S.active = id; S.live = {}; S.log.push({ at: Date.now(), t: 'انتشار نسخهٔ ' + id + ' (' + why + ')' }); return true; }
  function activate(id) { var S = load(), ok = activateIn(S, id, 'تأیید کاربر'); save(S); return ok; }
  function rollback(why) { var S = load(), cur = active(S); if (!cur) return false; cur.status = 'rolledback'; cur.rbWhy = why || 'دستی'; var p = S.prev && S.versions.filter(function (v) { return v.id === S.prev; })[0];
    if (p) { p.status = 'active'; S.active = p.id; } else S.active = null; S.live = {}; S.log.push({ at: Date.now(), t: 'بازگشت از نسخهٔ ' + cur.id + ' به ' + (p ? p.id : 'قواعد فعلی') + ' — ' + (why || 'دستی') }); save(S); return true; }
  function setAuto(on) { var S = load(); S.set.auto = !!on; save(S); }

  /* ---------- scoring in each central build (point in time: the last bar) ---------- */
  function score(by, zmap) { var S = load(), v = active(S), L = LN(); if (!v || !L || !zmap) return 0; var n = 0;
    Object.keys(by).forEach(function (k) { var r = by[k], z = zmap[k], X = z && z.R && z.R.X; if (!r || !X || !MK[r.cls] || X.n < L.CFG.warm + 5) return;
      var ref = refKey(Object.assign({ key: k }, r)), z2 = ref && zmap[ref], RX = z2 && z2.R && z2.R.X ? { d: z2.R.X.d, c: z2.R.X.c } : null, out = {};
      [1, -1].forEach(function (d) { var m = v.models[r.cls + '|' + d]; if (!m || !m.acc || !m.acc.ok || !m.m) return; var cut = Math.max(0, X.n - 400), Xs = sliceX(X, cut), P = L.prepare(Xs, RX), i = P.n - 1, f = L.featAt(P, i, d); if (!f) return;
        var p = L.prob(m.m, f), on = L.COMBO[m.combo || 'm'](p, m.thr, f); out[d > 0 ? 'up' : 'dn'] = { p: +p.toFixed(3), thr: m.thr, on: on, watch: !on && p >= 0.75 * m.thr, why: L.why(m.m, f), sig: P.S[i], ver: v.id, combo: m.combo }; });
      if (out.up || out.dn) { r.pm = out; n++; } });
    return n; }
  function sliceX(X, a) { var o = { n: X.n - a }; ['d', 'o', 'h', 'l', 'c', 'v', 'val', 'lock'].forEach(function (k) { if (X[k]) o[k] = X[k].slice(a); }); return o; }

  /* ---------- live watch of the active version (10) ---------- */
  // every preMove alert older than L+W sessions is checked against the bars: did a move start within L sessions? The live precision is compared
  // with the version's own out-of-sample precision; ≥ 30 graded alerts and below its lower bound (p̂ − 2·se) → automatic rollback
  function monitor(zmap) { var S = load(), v = active(S), L = LN(); if (!v || !L || !Hub.alerts || !zmap) return null; var A = Hub.alerts.load().log, st = {}, changed = false;
    A.forEach(function (e) { if ((e.t !== 'preMove' && e.t !== 'preMoveDn') || e.ver !== v.id) return; var d = e.t === 'preMove' ? 1 : -1, k = e.cls + '|' + d, z = zmap[e.key], X = z && z.R && z.R.X; if (!X) return;
      var d0 = Number(new Date(e.at + 3.5 * 36e5).toISOString().slice(0, 10).replace(/-/g, '')), i = -1; for (var j = X.n - 1; j >= 0; j--) if (X.d[j] <= d0) { i = j; break; } if (i < 0 || X.n - 1 - i < L.CFG.L + L.CFG.W) return;
      var sg = e.pmSig || 0.02, hit = false; for (var s = i; s < i + L.CFG.L && !hit; s++) for (var t = s + 1; t <= s + L.CFG.W && t < X.n; t++) if (d * Math.log(X.c[t] / X.c[s]) / (sg * Math.sqrt(t - s)) >= L.CFG.Z) { hit = true; break; }
      var q = st[k] = st[k] || { n: 0, tp: 0 }; q.n++; if (hit) q.tp++; });
    Object.keys(st).forEach(function (k) { var q = st[k], m = v.models[k], p0 = m && m.oos && m.oos.model.prec; S.live[k] = { n: q.n, tp: q.tp, prec: q.n ? q.tp / q.n : null, oos: p0, at: Date.now() };
      if (q.n >= 30 && isF(p0)) { var se = Math.sqrt(p0 * (1 - p0) / q.n); if (q.tp / q.n < p0 - 2 * se) { changed = true; S.log.push({ at: Date.now(), t: 'افت عملکرد زندهٔ ' + k + ': دقت ' + pc(q.tp / q.n) + ' در برابر ' + pc(p0) + ' آزمون' }); } } });
    save(S); if (changed) rollback('افت عملکرد زنده زیر حد پایین آزمون'); return S.live; }

  Hub.learnRun = { KEY: KEY, MKEY: MKEY, MK: MK, DIRFA: DIRFA, run: run, state: function () { return RUN; }, load: load, loadM: loadM, active: active, activate: activate, rollback: rollback, setAuto: setAuto, score: score, monitor: monitor };
})(typeof window !== 'undefined' ? window : globalThis);
