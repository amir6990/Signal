/* =====================================================================
 * DATA COVERAGE REPORT — directive 19 · 6 (2026-11-19).
 * For every market and asset class: expected, identified, with a verified identifier, with full history, up to date, with defects, without a
 * source, last update — and for every asset with a defect, which of the ten defect classes, why, and the corrective action.
 * «Data shortage» is never the final explanation: each line names the asset, the source and the reason.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var CAT = { 1: 'شناسهٔ دارایی ثبت نشده', 2: 'شناسه ثبت شده اما تأیید نشده', 3: 'منبع داده متصل نیست', 4: 'منبع داده قطع یا غیرفعال است', 5: 'تاریخچهٔ اولیه ناقص است',
    6: 'به‌روزرسانی افزایشی ناموفق بوده', 7: 'بخشی از داده‌های تاریخی مفقود است', 8: 'داده دریافت شده اما اعتبارسنجی نشده (ایراد کیفیت)', 9: 'اطلاعات طبقه‌بندی ناقص است', 10: 'داده در منبع اصلی وجود ندارد' };
  var ACT = { 1: 'به‌روزرسانی کامل روی کامپیوتر: شناسه از دیده‌بان بازار TSETMC خودکار پیدا می‌شود', 2: 'به‌روزرسانی کامل: نماد در دیده‌بان امروز بازار دیده نشد (توقف، حذف یا تغییر نماد) — بررسی در TSETMC',
    3: 'منبع در هاب تعریف نشده؛ نیازمند افزودن منبع', 4: 'منبع جایگزین در همان اجرا امتحان می‌شود؛ اتصال اینترنت/پراکسی کامپیوتر را بررسی کنید', 5: 'دریافت اولیه در به‌روزرسانی بعدی ادامه می‌یابد',
    6: 'تکرار خودکار در به‌روزرسانی بعدی؛ خطا در ستون شرح', 7: 'فقط همان روزها در به‌روزرسانی بعدی درخواست می‌شوند', 8: 'سری علامت‌گذاری شد؛ سیگنال آن «قابل اجرا» نمی‌شود تا ایراد رفع شود',
    9: 'با خواندن دیده‌بان بازار (کد رسمی صنعت) یا فهرست صندوق‌ها تکمیل می‌شود', 10: 'محدودیت واقعی منبع؛ اقدامی ممکن نیست' };
  function U() { return Hub.util; }
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function daysAgo(d) { if (!d) return NaN; return (Date.now() - Date.UTC(Math.floor(d / 1e4), Math.floor(d / 100) % 100 - 1, d % 100)) / 864e5; }

  function build() {
    var g = function (k) { return U().store.get(k, null); }, IG = Hub.ingest, cp = function (s, k) { return IG ? IG.cp(s, k) : {}; }, RG = g('hub.registry.v1'), ST = g('hub.sigstocks.v1') || { watch: [], data: {} };
    var tgt = Hub.tradeEngine && Hub.tradeEngine.HIST ? Hub.tradeEngine.HIST.max : 1250, groups = {}, items = [];
    var idxT = ST.data && ST.data._idx && ST.data._idx.total || [], lastSess = 0; idxT.forEach(function (r) { if (r.date > lastSess) lastSess = r.date; });
    var G = function (id, fa, exp) { return groups[id] = groups[id] || { id: id, fa: fa, exp: exp, ident: 0, valid: 0, full: 0, fresh: 0, defect: 0, noSrc: 0, last: 0, cats: {} }; };
    var add = function (gr, it, cats) { if (cats.length) { gr.defect++; cats.forEach(function (c) { gr.cats[c] = (gr.cats[c] || 0) + 1; }); items.push(Object.assign(it, { cats: cats, grp: gr.fa })); } };
    var seenCodes = {}; if (RG && RG.ins) Object.keys(RG.ins).forEach(function (c) { if (RG.ins[c].seen === RG.date) seenCodes[c] = 1; });
    var regN = { stock: 0 }, regF = {}; if (RG && RG.ins) Object.keys(RG.ins).forEach(function (c) { var o = RG.ins[c]; if (o.type === 'stock') regN.stock++; else regF[o.ftype || 'other'] = (regF[o.ftype || 'other'] || 0) + 1; });
    var FT = Hub.tseRegistry ? Hub.tseRegistry.FTFA : {};
    // the depth the source gives: most deep series start on the same first date (TSETMC's history limit); a series starting on or before it is complete
    var firsts = {}; Object.keys(ST.data || {}).forEach(function (k) { var d = ST.data[k]; if (k[0] === '_' || !d || !d.px || d.px.length < 900) return; var f = d.px[0].date; firsts[f] = (firsts[f] || 0) + 1; });
    var srcFirst = Object.keys(firsts).sort(function (a, b) { return firsts[b] - firsts[a]; })[0]; srcFirst = srcFirst ? +srcFirst : 0;
    // shares and funds
    (ST.watch || []).forEach(function (w) { if (w.active === false || !w.symbol) return;
      var fund = !!w.ftype || /صندوق/.test(w.sector || ''), gr = fund ? G('f-' + (w.ftype || 'other'), FT[w.ftype || 'other'] || 'صندوق (نوع نامشخص)', RG ? regF[w.ftype || 'other'] || 0 : null) : G('stock', 'سهام بورس و فرابورس', RG ? regN.stock : null);
      gr.ident++; var d = ST.data && ST.data[w.symbol], px = d && d.px ? d.px.filter(function (r) { return !r.live; }) : [], c = cp('tse', w.symbol), cats = [], why = [];
      if (!w.insCode) { cats.push(1); why.push('insCode ندارد'); gr.noSrc++; } else { gr.valid++; if (RG && !seenCodes[w.insCode]) { cats.push(2); why.push('در دیده‌بان بازار ' + RG.date + ' نبود'); } }
      var atSrc = srcFirst && px.length && px[0].date <= srcFirst + 7;
      var full = px.length >= tgt * 0.9 || (c.maxN && px.length >= c.maxN * 0.98) || atSrc; if (full) gr.full++; else if (px.length) { if (c.maxN) { cats.push(10); why.push('منبع فقط ' + c.maxN + ' جلسه دارد (نماد جوان)'); gr.full++; } else { cats.push(5); why.push(px.length + ' از ' + tgt + ' جلسه'); } }
      var L = px.length ? px[px.length - 1].date : 0; if (L > gr.last) gr.last = L;
      var halted = c.noTrade && lastSess && c.noTrade.indexOf(lastSess) >= 0;
      if (L && lastSess && L >= lastSess || (d && d.px && d.px.length && d.px[d.px.length - 1].live)) gr.fresh++; else if (halted) { cats.push(10); why.push('بدون معامله در آخرین جلسه (توقف)'); }
      else if (px.length) { if (c.at) { cats.push(6); why.push('آخرین ردیف ' + L); } else { cats.push(10); why.push('آخرین معامله در داده‌ها ' + L + ' (احتمال توقف نماد؛ با دیده‌بان بازار روی کامپیوتر تأیید می‌شود)'); } }
      if (c.err && (!c.at || c.errAt > c.at)) { if (cats.indexOf(6) < 0) cats.push(6); why.push('خطا: ' + c.err); }
      if (c.gaps && c.gaps.length) { cats.push(7); why.push(c.gaps.length + ' روز مفقود (' + c.gaps.slice(-3).join('، ') + ')'); }
      if (!fund && !w.cs) { cats.push(9); why.push('کد رسمی صنعت ندارد'); } if (fund && w.ftSrc !== 'registry') { cats.push(9); why.push(w.ftype ? 'نوع صندوق از نام (تأییدنشده)' : 'نوع صندوق نامشخص'); }
      if (px.length > 30 && Hub.ingest) { var q = Hub.ingest.qc(px.slice(-500), { limit: 0.12, vol: true }); if (q.severe) { cats.push(8); why.push(q.issues.filter(function (x) { return x.sev >= 2; }).map(function (x) { return x.fa + ' ' + x.n; }).join('، ')); } }
      add(gr, { key: 's:' + w.symbol, name: w.symbol, src: 'TSETMC', why: why.join('؛ ') }, cats); });
    // indices
    var IM = ST.idxMeta || {}, ext = ST.data && ST.data._idx && ST.data._idx.ext || {}, gi = G('idx', 'شاخص‌های بورس و فرابورس', RG && RG.idx ? RG.idx.length : null);
    var idxList = RG && RG.idx && RG.idx.length ? RG.idx : [{ insCode: '32097828799138957', name: 'شاخص کل' }, { insCode: '67130298613737946', name: 'شاخص کل (هم وزن)' }];
    idxList.forEach(function (x) { gi.ident++; gi.valid++; var rows = x.insCode === '32097828799138957' ? idxT : x.insCode === '67130298613737946' ? (ST.data._idx || {}).ew || [] : ext[x.insCode] || [], c = cp('idx', x.insCode), cats = [], why = [];
      var off = rows.filter(function (r) { return !r.live; }), L = rows.length ? rows[rows.length - 1].date : 0; if (L > gi.last) gi.last = L;
      if (!rows.length) { cats.push(5); why.push('تاریخچه دریافت نشده'); } else if (off.length >= 200 || c.maxN) gi.full++; else { cats.push(5); why.push(off.length + ' جلسه'); }
      if (L && lastSess && L >= lastSess) gi.fresh++; else if (rows.length) { cats.push(6); why.push('آخرین ' + L); }
      if (c.err) { cats.push(4); why.push(c.err); }
      add(gi, { key: 'ix:' + x.insCode, name: x.name, src: 'TSETMC', why: why.join('؛ ') }, cats); });
    if (!RG || !RG.idx || !RG.idx.length) items.push({ key: 'ix:list', name: 'فهرست شاخص‌ها', src: 'TSETMC', grp: gi.fa, cats: [1], why: 'فهرست شاخص‌های بورس/فرابورس هنوز خوانده نشده (فقط شاخص کل و هم‌وزن)' });
    // TGJU and world series
    var tg = function (key, id, fa) { var S = g(key) || { data: {} }, gr = G(id, fa, null); (S.ins || []).forEach(function (x) { if (x.active === false) return; gr.ident++; gr.valid++; var rows = S.data && S.data[x.key] || [], c = cp('tgju', x.key), cats = [], why = [], off = rows.filter(function (r) { return !r.live; }), L = rows.length ? rows[rows.length - 1].date : 0;
      if (L > gr.last) gr.last = L; if (off.length >= tgt * 0.9) gr.full++; else { cats.push(rows.length ? 10 : 5); why.push(off.length + ' روز (TGJU بیشتر نمی‌دهد یا دریافت نشده)'); }
      if (daysAgo(L) <= 4) gr.fresh++; else { cats.push(6); why.push('آخرین ' + L); } add(gr, { key: 'g:' + x.key, name: x.series, src: 'TGJU', why: why.join('؛ ') }, cats); }); };
    tg('hub.sig-gold.v1', 'gold', 'طلا و سکه'); tg('hub.sig-fx.v1', 'fx', 'ارز');
    var GL = g('hub.sigglobal.v1') || { data: {} }; (Hub.globalMkt ? Hub.globalMkt.SER : []).forEach(function (s) { var id = s.mk === 'intl' ? 'intl' : s.mk === 'crypto' ? 'crypto' : 'world', gr = G(id, id === 'intl' ? 'شاخص‌های جهانی' : id === 'crypto' ? 'رمزارز' : 'کالا، انرژی و نرخ بهره', null);
      gr.exp = (gr.exp || 0) + 1; gr.ident++; gr.valid++; var rows = GL.data && GL.data[s.id] || [], cats = [], why = [], L = rows.length ? rows[rows.length - 1].date : 0, need = s.intl ? 2000 : s.mk === 'crypto' ? 700 : 250;
      if (L > gr.last) gr.last = L; if (!rows.length) { cats.push(GL.lastErrs && GL.lastErrs.some(function (e) { return e.indexOf(s.name) === 0; }) ? 4 : 5); why.push('دریافت نشده' + (GL.srcOf && GL.srcOf[s.id] ? '' : ' (منابع: ' + [s.yh && 'Yahoo', s.fr && 'FRED', s.cg && 'CoinGecko', s.fred && 'FRED'].filter(Boolean).join('، ') + ')')); }
      else if (rows.length >= need) gr.full++; else { cats.push(s.mk === 'crypto' ? 5 : 10); why.push(rows.length + ' روز از ' + need); }
      if (rows.length && daysAgo(L) <= (s.fresh || 5) + 2) gr.fresh++; else if (rows.length) { cats.push(6); why.push('آخرین ' + L); }
      add(gr, { key: 'x:' + s.id, name: s.name, src: (GL.srcOf && GL.srcOf[s.id]) || s.src, why: why.join('؛ ') }, cats); });
    var out = Object.keys(groups).map(function (k) { return groups[k]; });
    var nCat = {}; items.forEach(function (it) { it.cats.forEach(function (c) { nCat[c] = (nCat[c] || 0) + 1; }); });
    return { at: Date.now(), groups: out, items: items, nCat: nCat, reg: RG ? { date: RG.date, n: RG.nIns, idx: RG.idx ? RG.idx.length : 0, ind: Object.keys(RG.ind || {}).length, funds: RG.fundReg ? RG.fundReg.list.length : 0, errs: RG.errs || [] } : null, lastSess: lastSess };
  }
  Hub.coverage = { build: build, CAT: CAT, ACT: ACT };
})(typeof window !== 'undefined' ? window : globalThis);
