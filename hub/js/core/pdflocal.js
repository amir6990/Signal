/* =====================================================================
 * PDF LOCAL READER — reads financial statements from a PDF with no Claude
 * and no internet, entirely in this browser.
 *   • PDFs with a text layer (exported from Excel/Word): the positioned text
 *     items are used directly.
 *   • Scanned PDFs (most audited Codal sets): each statement page is
 *     rendered, Tesseract (Persian model, vendored) reads the line labels and
 *     the hub's own digit recogniser reads the numbers (Tesseract is weak on
 *     Persian digits; the recogniser was trained on real statement digits).
 * Both routes end in the same layout step: lines → label + numbers →
 * columns (note / years) → statements, in the same JSON shape Claude returns.
 * Values the recogniser was unsure of are listed so they can be checked.
 * Tesseract.js 6.0.1 + core 6.1.2 (Apache-2.0), fas traineddata 4.0.0 best_int.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
  var LETTER = /[ء-غف-يپچژکگیۀآA-Za-z]/;

  function T(en, fa) { return Hub.i18n && Hub.i18n.lang && Hub.i18n.lang() === 'fa' ? fa : en; }
  function normTxt(s) { return String(s || '').normalize('NFKC').replace(/[‌‏‎‪-‮]/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim(); }
  // lam-alef ligatures come out of many PDF text layers as «ال» instead of «لا»
  var LIG = [[/تسهیالت/g, 'تسهیلات'], [/کاال/g, 'کالا'], [/معامالت/g, 'معاملات'], [/اطالعات/g, 'اطلاعات'], [/بالعوض/g, 'بلاعوض'], [/اصالح/g, 'اصلاح'], [/اعالم/g, 'اعلام'], [/مالحظه/g, 'ملاحظه'], [/استهالک/g, 'استهلاک'], [/بالفاصله/g, 'بلافاصله'], [/طالی/g, 'طلای'], [/مبالغ/g, 'مبالغ'], [/انحالل/g, 'انحلال'], [/اوراق بهادار/g, 'اوراق بهادار'], [/حاللیت/g, 'حلالیت'], [/خالص/g, 'خالص'], [/بالقوه/g, 'بالقوه']];
  function fixLig(s) { LIG.forEach(function (r) { s = s.replace(r[0], r[1]); }); return s; }
  function latin(s) { return String(s).replace(/[۰-۹]/g, function (c) { return FA.indexOf(c); }).replace(/[٠-٩]/g, function (c) { return AR.indexOf(c); }).replace(/[٬،]/g, ',').replace(/[−–—]/g, '-'); }

  /* ---------- standard Codal line labels: OCR labels close to one of these are snapped to it ---------- */
  var CANON = "درآمدهای عملیاتی|درآمد عملیاتی|فروش|فروش خالص|درآمد حاصل از فروش|بهای تمام شده درآمدهای عملیاتی|بهای تمام شده کالای فروش رفته|بهای تمام شده|سود ناخالص|زیان ناخالص|هزینه های فروش، اداری و عمومی|هزینه های اداری و عمومی|هزینه های توزیع و فروش|هزینه های عمومی، اداری و تشکیلاتی|سایر درآمدها|سایر هزینه ها|سایر درآمدها و هزینه های عملیاتی|سایر اقلام عملیاتی|هزینه کاهش ارزش دریافتنی ها (هزینه استثنایی)|سود عملیاتی|زیان عملیاتی|هزینه های مالی|سایر درآمدها و هزینه های غیرعملیاتی|سایر درآمدهای غیرعملیاتی|سود قبل از مالیات|سود عملیات در حال تداوم قبل از مالیات|سود (زیان) عملیات در حال تداوم قبل از مالیات|هزینه مالیات بر درآمد|مالیات بر درآمد|سال جاری|سال های قبل|سود خالص عملیات در حال تداوم|سود (زیان) خالص عملیات متوقف شده|سود خالص|زیان خالص|سود (زیان) خالص|سود پایه هر سهم|عملیاتی (ریال)|غیرعملیاتی (ریال)|سود خالص هر سهم (ریال)|درآمد سود سهام|درآمد سود تضمین شده|جمع هزینه های عملیاتی|جمع هزینه ها|هزینه های حقوق و دستمزد و مزایا|هزینه حقوق و دستمزد|هزینه استهلاک|هزینه اجاره|سود حاصل از فروش سرمایه گذاری ها|سود (زیان) تغییر ارزش سرمایه گذاری ها|سود سپرده بانکی|جمع درآمدهای عملیاتی|درآمد حاصل از سرمایه گذاری ها|دارایی ها|دارایی های غیرجاری|دارایی های ثابت مشهود|دارایی های نامشهود|سرمایه گذاری در املاک|سرمایه گذاری های بلندمدت|دریافتنی های بلندمدت|سایر دارایی ها|دارایی مالیات انتقالی|جمع دارایی های غیرجاری|دارایی های جاری|پیش پرداخت ها|موجودی مواد و کالا|دریافتنی های تجاری و سایر دریافتنی ها|سرمایه گذاری های کوتاه مدت|موجودی نقد|دارایی های نگهداری شده برای فروش|دارایی های غیرجاری نگهداری شده برای فروش|جمع دارایی های جاری|جمع دارایی ها|حقوق مالکانه و بدهی ها|حقوق مالکانه|سرمایه|افزایش سرمایه در جریان|صرف سهام|صرف سهام خزانه|اندوخته قانونی|سایر اندوخته ها|مازاد تجدید ارزیابی دارایی ها|تفاوت تسعیر ارز عملیات خارجی|سود انباشته|زیان انباشته|سهام خزانه|جمع حقوق مالکانه|بدهی ها|بدهی های غیرجاری|پرداختنی های بلندمدت|تسهیلات مالی بلندمدت|بدهی مالیات انتقالی|ذخیره مزایای پایان خدمت کارکنان|جمع بدهی های غیرجاری|بدهی های جاری|پرداختنی های تجاری و سایر پرداختنی ها|پرداختنی های تجاری|سایر پرداختنی ها|مالیات پرداختنی|سود سهام پرداختنی|تسهیلات مالی|ذخایر|پیش دریافت ها|بدهی های مرتبط با دارایی های نگهداری شده برای فروش|جمع بدهی های جاری|جمع بدهی ها|جمع حقوق مالکانه و بدهی ها|جریان های نقدی حاصل از فعالیت های عملیاتی|نقد حاصل از عملیات|نقد مصرف شده در عملیات|پرداخت های نقدی بابت مالیات بر درآمد|جریان خالص ورود نقد حاصل از فعالیت های عملیاتی|جریان خالص خروج نقد حاصل از فعالیت های عملیاتی|جریان خالص ورود (خروج) نقد حاصل از فعالیت های عملیاتی|جریان های نقدی حاصل از فعالیت های سرمایه گذاری|دریافت های نقدی حاصل از فروش دارایی های ثابت مشهود|پرداخت های نقدی برای خرید دارایی های ثابت مشهود|پرداخت های نقدی برای خرید دارایی های نامشهود|دریافت های نقدی حاصل از فروش سرمایه گذاری های بلندمدت|پرداخت های نقدی برای تحصیل سرمایه گذاری های بلندمدت|دریافت های نقدی حاصل از فروش سرمایه گذاری های کوتاه مدت|پرداخت های نقدی برای تحصیل سرمایه گذاری های کوتاه مدت|دریافت های نقدی حاصل از سود سهام|دریافت های نقدی حاصل از سود سایر سرمایه گذاری ها|دریافت های نقدی حاصل از سود سپرده های بانکی|جریان خالص ورود نقد حاصل از فعالیت های سرمایه گذاری|جریان خالص خروج نقد حاصل از فعالیت های سرمایه گذاری|جریان خالص ورود (خروج) نقد حاصل از فعالیت های سرمایه گذاری|جریان خالص ورود (خروج) نقد قبل از فعالیت های تامین مالی|جریان های نقدی حاصل از فعالیت های تامین مالی|دریافت های نقدی حاصل از افزایش سرمایه|دریافت های نقد حاصل از افزایش سرمایه|دریافت های نقدی حاصل از تسهیلات|پرداخت های نقدی بابت اصل تسهیلات|پرداخت های نقدی بابت سود تسهیلات|دریافت های نقدی حاصل از انتشار اوراق|پرداخت های نقدی بابت اصل اوراق|پرداخت های نقدی بابت سود اوراق|پرداخت های نقدی بابت سود سهام|جریان خالص ورود نقد حاصل از فعالیت های تامین مالی|جریان خالص خروج نقد حاصل از فعالیت های تامین مالی|جریان خالص ورود (خروج) نقد حاصل از فعالیت های تامین مالی|خالص افزایش در موجودی نقد|خالص کاهش در موجودی نقد|خالص افزایش (کاهش) در موجودی نقد|مانده موجودی نقد در ابتدای سال|مانده موجودی نقد در ابتدای دوره|تاثیر تغییرات نرخ ارز|مانده موجودی نقد در پایان سال|مانده موجودی نقد در پایان دوره|معاملات غیرنقدی".split('|');
  function squash(s) { return normTxt(s).replace(/[\s()،,:.\-]/g, '').replace(/[أإ]/g, 'ا').replace(/ئ/g, 'ی'); }
  var CANON_SQ = null;
  function lev(a, b, cap) {
    var m = a.length, n = b.length; if (Math.abs(m - n) > cap) return cap + 1;
    var prev = new Array(n + 1), cur = new Array(n + 1), i, j; for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) { cur[0] = i; var lo = cap + 1; for (j = 1; j <= n; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < lo) lo = cur[j]; } if (lo > cap) return cap + 1; var t = prev; prev = cur; cur = t; }
    return prev[n];
  }
  function snapLabel(t) {
    if (!CANON_SQ) CANON_SQ = CANON.map(squash);
    var q = squash(t); if (q.length < 3) return t;
    var best = -1, bd = 1e9;
    for (var i = 0; i < CANON_SQ.length; i++) { var cap = Math.floor(Math.max(q.length, CANON_SQ[i].length) * 0.25); var d = lev(q, CANON_SQ[i], Math.min(cap, bd)); if (d < bd) { bd = d; best = i; } }
    if (best >= 0 && bd <= Math.max(1, Math.floor(Math.max(q.length, CANON_SQ[best].length) * 0.25))) return CANON[best];
    return t;
  }

  /* ---------- image helpers ---------- */
  function grayOf(canvas) {
    var ctx = canvas.getContext('2d'), d = ctx.getImageData(0, 0, canvas.width, canvas.height).data, n = canvas.width * canvas.height, g = new Uint8Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000 | 0;
    return g;
  }
  function otsu(g) {
    var hist = new Float64Array(256), i; for (i = 0; i < g.length; i++) hist[g[i]]++;
    var tot = g.length, sumAll = 0; for (i = 0; i < 256; i++) sumAll += i * hist[i];
    var wb = 0, sb = 0, best = 0, th = 128;
    for (var t = 0; t < 256; t++) { wb += hist[t]; if (!wb) continue; var wf = tot - wb; if (!wf) break; sb += t * hist[t]; var mb = sb / wb, mf = (sumAll - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf); if (v > best) { best = v; th = t; } }
    return Math.min(th, 200);
  }
  // 8-connected components of ink pixels (two-pass union–find)
  function components(bin, W, H) {
    var lab = new Int32Array(W * H), par = [0], x, y, i;
    function find(a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; }
    function uni(a, b) { a = find(a); b = find(b); if (a !== b) { if (a < b) par[b] = a; else par[a] = b; } }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x; if (!bin[i]) continue;
      var nb = [];
      if (x > 0 && lab[i - 1]) nb.push(lab[i - 1]);
      if (y > 0) { if (lab[i - W]) nb.push(lab[i - W]); if (x > 0 && lab[i - W - 1]) nb.push(lab[i - W - 1]); if (x < W - 1 && lab[i - W + 1]) nb.push(lab[i - W + 1]); }
      if (!nb.length) { var l = par.length; par.push(l); lab[i] = l; }
      else { var m = nb[0]; for (var k = 1; k < nb.length; k++) { if (nb[k] < m) m = nb[k]; } lab[i] = m; for (k = 0; k < nb.length; k++) uni(m, nb[k]); }
    }
    var map = new Int32Array(par.length), comps = [], id;
    for (i = 1; i < par.length; i++) { var r = find(i); if (!map[r]) { comps.push({ x0: 1e9, y0: 1e9, x1: -1, y1: -1, area: 0 }); map[r] = comps.length; } map[i] = map[r]; }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x; if (!lab[i]) continue; id = map[lab[i]]; lab[i] = id; var c = comps[id - 1];
      if (x < c.x0) c.x0 = x; if (x >= c.x1) c.x1 = x + 1; if (y < c.y0) c.y0 = y; if (y >= c.y1) c.y1 = y + 1; c.area++;
    }
    comps.forEach(function (c, k) { c.id = k + 1; c.w = c.x1 - c.x0; c.h = c.y1 - c.y0; c.yc = (c.y0 + c.y1) / 2; c.xc = (c.x0 + c.x1) / 2; });
    return { lab: lab, comps: comps, W: W };
  }

  /* ---------- digit recogniser ---------- */
  var NET = null;
  function f32(b64) { var s = atob(b64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Float32Array(u.buffer); }
  function net() {
    if (NET) return NET; var J = Hub.ocrDigits; if (!J) throw new Error('Digit recogniser not loaded.');
    NET = { G: J.G, nIn: J.nIn, nH: J.nH, cls: J.classes, fw: J.fw, W1: f32(J.W1), b1: f32(J.b1), W2: f32(J.W2), b2: f32(J.b2) };
    return NET;
  }
  // same feature as the training code: glyph centred in a square, area-averaged to G×G, plus 4 shape numbers
  function feature(CC, c, Hd, yref) {
    var N = net(), G = N.G, s = Math.max(c.w, c.h), oy = Math.floor((s - c.h) / 2), ox = Math.floor((s - c.w) / 2);
    var sq = new Float32Array(s * s), x, y;
    var lo = c.xa != null ? c.xa : -1, hi = c.xb != null ? c.xb : 1e9;
    for (y = 0; y < c.h; y++) for (x = 0; x < c.w; x++) { var X = c.x0 + x; if (X >= lo && X < hi && CC.lab[(c.y0 + y) * CC.W + X] === c.id) sq[(y + oy) * s + x + ox] = 1; }
    var out = new Float32Array(N.nIn), k = 0;
    for (var gy = 0; gy < G; gy++) {
      var ya = gy * s / G, yb = (gy + 1) * s / G;
      for (var gx = 0; gx < G; gx++) {
        var xa = gx * s / G, xb = (gx + 1) * s / G, acc = 0, wt = 0;
        for (var yy = Math.floor(ya); yy < Math.min(Math.ceil(yb), s); yy++) {
          var wy = Math.min(yy + 1, yb) - Math.max(yy, ya); if (wy <= 0) continue;
          for (var xx = Math.floor(xa); xx < Math.min(Math.ceil(xb), s); xx++) {
            var wx = Math.min(xx + 1, xb) - Math.max(xx, xa); if (wx <= 0) continue;
            acc += sq[yy * s + xx] * wy * wx; wt += wy * wx;
          }
        }
        out[k++] = wt ? acc / wt : 0;
      }
    }
    out[k++] = c.h / Hd * N.fw[0]; out[k++] = c.w / Hd * N.fw[1]; out[k++] = (c.yc - yref) / Hd * N.fw[2]; out[k++] = c.area / (c.w * c.h) * N.fw[3];
    return out;
  }
  function classify(v) {
    var N = net(), h = new Float32Array(N.nH), i, j;
    for (j = 0; j < N.nH; j++) h[j] = N.b1[j];
    for (i = 0; i < N.nIn; i++) { var xi = v[i]; if (!xi) continue; var row = i * N.nH; for (j = 0; j < N.nH; j++) h[j] += xi * N.W1[row + j]; }
    var nc = N.cls.length, o = new Float32Array(nc);
    for (j = 0; j < nc; j++) o[j] = N.b2[j];
    for (i = 0; i < N.nH; i++) { var hi = h[i] > 0 ? h[i] : 0; if (!hi) continue; for (j = 0; j < nc; j++) o[j] += hi * N.W2[i * nc + j]; }
    var mx = -1e9; for (j = 0; j < nc; j++) if (o[j] > mx) mx = o[j];
    var sum = 0; for (j = 0; j < nc; j++) { o[j] = Math.exp(o[j] - mx); sum += o[j]; }
    var ranked = []; for (j = 0; j < nc; j++) ranked.push({ c: N.cls[j], p: o[j] / sum });
    ranked.sort(function (a, b) { return b.p - a.p; });
    return ranked.slice(0, 3);
  }
  // part of a component between columns xa and xb (for digits that touch)
  function sub(CC, c, xa, xb) {
    var o = { id: c.id, xa: xa, xb: xb, x0: 1e9, x1: -1, y0: 1e9, y1: -1, area: 0 };
    for (var y = c.y0; y < c.y1; y++) for (var x = Math.max(xa, c.x0); x < Math.min(xb, c.x1); x++) if (CC.lab[y * CC.W + x] === c.id) { if (x < o.x0) o.x0 = x; if (x >= o.x1) o.x1 = x + 1; if (y < o.y0) o.y0 = y; if (y >= o.y1) o.y1 = y + 1; o.area++; }
    if (!o.area) return null;
    o.w = o.x1 - o.x0; o.h = o.y1 - o.y0; o.yc = (o.y0 + o.y1) / 2; o.xc = (o.x0 + o.x1) / 2; return o;
  }
  // a wide component may be two digits touching: cut it at the thinnest column of its middle
  function cut2(CC, c, Hd, yref) {
    var best = null;
    for (var x = Math.round(c.x0 + 0.3 * c.w); x <= Math.round(c.x0 + 0.7 * c.w); x++) {
      var ink = 0; for (var y = c.y0; y < c.y1; y++) if (CC.lab[y * CC.W + x] === c.id) ink++;
      if (!best || ink < best.ink) best = { x: x, ink: ink };
    }
    if (!best) return null;
    var A = sub(CC, c, c.x0, best.x), B = sub(CC, c, best.x, c.x1);
    if (!A || !B || A.w < 0.12 * Hd || B.w < 0.12 * Hd || A.h < 0.4 * Hd || B.h < 0.4 * Hd) return null;
    var ra = classify(feature(CC, A, Hd, yref)), rb = classify(feature(CC, B, Hd, yref));
    return /\d/.test(ra[0].c) && /\d/.test(rb[0].c) ? [ra, rb] : null;
  }
  // read one token; when it reads badly, try splitting its widest glyphs
  function readToken(CC, t, Hd, yref) {
    var base = t.map(function (c) { return classify(feature(CC, c, Hd, yref)); }), d0 = decode(base);
    if (d0.conf >= 0.75) return d0;
    var best = d0, wide = t.map(function (c, k) { return k; }).filter(function (k) { return t[k].w >= 0.45 * Hd && t[k].h >= 0.45 * Hd; }).sort(function (a, b) { return t[b].w - t[a].w; }).slice(0, 3);
    wide.forEach(function (k) {
      var parts = cut2(CC, t[k], Hd, yref); if (!parts) return;
      var ch = base.slice(0, k).concat(parts, base.slice(k + 1)), d = decode(ch);
      if (valid(d.s) && d.conf > best.conf + 0.05) best = d;
    });
    return best;
  }
  var VALID = [/^\(?\d{1,3}(,\d{3})+\)?$/, /^\(?\d{1,4}\)?$/, /^\d{2,4}\/\d{1,2}\/\d{1,4}$/, /^-$/];
  function valid(s) { return VALID.some(function (r) { return r.test(s); }); }
  // best reading of one token: top choice, else the cheapest single/double swap that makes a valid number
  // thousands separators in many statement fonts are a dot that reads as ۰: rebuild the grouping from the right
  function regroup(top) {
    var m = /^(\(?)([\d,]{5,})(\)?)$/.exec(top); if (!m) return null;
    var b = m[2], out = '', n = 0;
    for (var i = b.length - 1; i >= 0; i--) {
      var ch = b[i];
      if (n === 3) { if (ch === ',' || ch === '0') { out = ',' + out; n = 0; continue; } return null; }
      if (ch === ',') return null; out = ch + out; n++;
    }
    var r = m[1] + out + m[3];
    return /,/.test(out) && valid(r) ? r : null;
  }
  function decode(chars) {
    var top = chars.map(function (r) { return r[0].c; }).join(''), conf = Math.min.apply(null, chars.map(function (r) { return r[0].p; }));
    // "(…1" — a closing bracket read as ۱
    if (/^\([\d,]+1$/.test(top)) top = top.slice(0, -1) + ')';
    if (valid(top)) return { s: top, conf: conf };
    var rg = regroup(top); if (rg) return { s: rg, conf: Math.min(conf, 0.78) };
    // a stray «/» or a separator right after «(» inside an amount is a misread digit: take its best digit reading
    if (!/^\d{2,4}\/\d/.test(top)) {
      var alt = chars.map(function (r, k) { var c0 = r[0].c; if (c0 === '/' || (c0 === ',' && k > 0 && chars[k - 1][0].c === '(')) { var dg = r.filter(function (q) { return /\d/.test(q.c); })[0]; return dg ? dg.c : c0; } return c0; }).join('');
      if (alt !== top) { if (valid(alt)) return { s: alt, conf: Math.min(conf, 0.5) }; var rg2 = regroup(alt); if (rg2) return { s: rg2, conf: Math.min(conf, 0.5) }; top = alt; }
    }
    var best = null, i, j;
    function score(arr) { return arr.reduce(function (a, r, k) { return a * r; }, 1); }
    var base = chars.map(function (r) { return r[0].p; });
    for (i = 0; i < chars.length; i++) for (var a = 1; a < chars[i].length; a++) {
      if (chars[i][a].p < 0.15) continue;
      var t = chars.map(function (r) { return r[0].c; }); t[i] = chars[i][a].c; var str = t.join('');
      if (valid(str)) { var p = base.slice(); p[i] = chars[i][a].p; var sc = score(p); if (!best || sc > best.sc) best = { s: str, sc: sc, conf: Math.min(conf, chars[i][a].p) }; }
    }
    if (!best) for (i = 0; i < chars.length; i++) for (j = i + 1; j < chars.length; j++) {
      if (!chars[i][1] || !chars[j][1] || chars[i][1].p < 0.15 || chars[j][1].p < 0.15) continue;
      var t2 = chars.map(function (r) { return r[0].c; }); t2[i] = chars[i][1].c; t2[j] = chars[j][1].c;
      var s2 = t2.join(''); if (valid(s2)) { best = { s: s2, conf: Math.min(conf, chars[i][1] ? chars[i][1].p : 1, chars[j][1] ? chars[j][1].p : 1) }; break; }
    }
    if (best) return { s: best.s, conf: best.conf * 0.9 };
    // commas out of place but the digits are readable: keep the digits, mark unsure
    var dig = top.replace(/[,]/g, '');
    if (/^\(?\d+\)?$/.test(dig)) return { s: dig, conf: Math.min(conf, 0.5) };
    return { s: top, conf: 0 };
  }

  /* ---------- Tesseract (vendored, runs offline) ---------- */
  var TP = null;
  function tag(id) { var e = document.getElementById(id); return e ? e.textContent : null; }
  function tesseract(say) {
    if (TP) return TP;
    TP = new Promise(function (res, rej) {
      if (!root.Tesseract) return rej(new Error(T('The OCR engine is not included in this copy.', 'موتور OCR در این نسخه نیست.')));
      // the single-file build carries the engine inline; a module page of the multi-page build fetches the same files from vendor/
      var get = function (id, f) { return Hub.util.asset(id, f); };
      Promise.all([get('tess-worker', 'tess-worker.min.js'), get('tess-core', 'tess-core.js'), get('tess-fas', 'fas.traineddata.gz.b64')]).then(function (A) { start(A[0], A[1], A[2]); }); function start(worker, core, fas) {
      if (!worker || !core || !fas) return rej(new Error(T('The OCR engine is not included in this copy (use the single-file hub).', 'موتور OCR در این نسخه نیست (از فایل تک‌صفحه‌ای هاب استفاده کنید).')));
      var patch = 'var __fas=(function(){var s=atob(' + JSON.stringify(fas.replace(/\s+/g, '')) + '),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;})();' +
        'var __f=self.fetch;self.fetch=function(u,o){if(String(u).indexOf("fas.traineddata")>=0)return Promise.resolve(new Response(__fas.slice(0)));return __f.apply(self,arguments);};\n';
      var url = URL.createObjectURL(new Blob([core, '\n;self.TesseractCore=TesseractCore;\n', patch, worker], { type: 'text/javascript' }));
      say && say(T('Starting the offline OCR engine (first use takes a few seconds)…', 'راه‌اندازی موتور OCR آفلاین (بار اول چند ثانیه طول می‌کشد)…'));
      root.Tesseract.createWorker('fas', 1, { workerPath: url, workerBlobURL: false, corePath: 'https://local.invalid/core', langPath: 'https://local.invalid/lang', cacheMethod: 'none', gzip: true, logger: function () {} })
        .then(function (w) { return w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }).then(function () { return w; }); })
        .then(res, function (e) { TP = null; rej(new Error(T('The offline OCR engine could not start here (', 'موتور OCR آفلاین اینجا اجرا نشد (') + (e && e.message || e) + ').')); }); }
    });
    return TP;
  }
  function render(doc, i, width, rot) {
    return doc.getPage(i).then(function (p) {
      var R = ((p.rotate || 0) + (rot || 0)) % 360, v0 = p.getViewport({ scale: 1, rotation: R }), sc = (width || 2000) / v0.width, v = p.getViewport({ scale: sc, rotation: R });
      var c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
      var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      return p.render({ canvasContext: ctx, viewport: v }).promise.then(function () { return { canvas: c, page: p, viewport: v }; });
    });
  }
  // small skew of a scan: find the angle whose row profile is sharpest, then straighten
  function deskew(canvas) {
    var sw = 600, sc = sw / canvas.width, sh = Math.round(canvas.height * sc), c = document.createElement('canvas'); c.width = sw; c.height = sh;
    var x = c.getContext('2d'); x.drawImage(canvas, 0, 0, sw, sh);
    var g = grayOf(c), th = otsu(g), px = [], py = [], i;
    for (i = 0; i < g.length; i++) if (g[i] <= th) { px.push(i % sw); py.push((i / sw) | 0); }
    if (px.length < 200) return canvas;
    var best = 0, bs = -1;
    for (var a = -2.5; a <= 2.5001; a += 0.1) {
      var t = Math.tan(a * Math.PI / 180), hist = new Float64Array(sh + sw), s2 = 0;
      for (i = 0; i < px.length; i++) { var r = Math.round(py[i] + px[i] * t) + (sw >> 1); if (r >= 0 && r < hist.length) hist[r]++; }
      for (i = 0; i < hist.length; i++) s2 += hist[i] * hist[i];
      if (s2 > bs) { bs = s2; best = a; }
    }
    if (Math.abs(best) < 0.15) return canvas;
    var o = document.createElement('canvas'); o.width = canvas.width; o.height = canvas.height;
    var y = o.getContext('2d'); y.fillStyle = '#fff'; y.fillRect(0, 0, o.width, o.height);
    y.translate(o.width / 2, o.height / 2); y.rotate(best * Math.PI / 180); y.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return o;
  }
  function ocrWords(w, canvas) {
    return w.recognize(canvas, {}, { blocks: true, text: true }).then(function (r) {
      var out = [];
      (r.data.blocks || []).forEach(function (b) { (b.paragraphs || []).forEach(function (pa) { (pa.lines || []).forEach(function (l) {
        var line = { x0: l.bbox.x0, x1: l.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1, words: [] };
        (l.words || []).forEach(function (wd) { line.words.push({ t: normTxt(wd.text), x0: wd.bbox.x0, x1: wd.bbox.x1, y0: wd.bbox.y0, y1: wd.bbox.y1, conf: wd.confidence }); });
        out.push(line);
      }); }); });
      var ws = []; out.forEach(function (l) { l.words.forEach(function (w) { if (LETTER.test(w.t)) ws.push(w.conf); }); });
      return { lines: out, text: normTxt(r.data.text || ''), conf: ws.length ? ws.reduce(function (a, b) { return a + b; }, 0) / ws.length : 0, nWords: ws.length };
    });
  }

  /* ---------- page models: {labels:[{x0,x1,yc,t}], nums:[{x0,x1,yc,s,conf}], H, W, Hp, text} ---------- */
  function fromTextLayer(page, viewport) {
    return page.getTextContent().then(function (tc) {
      var items = tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
        var t = it.transform, x = t[4], y = t[5], hgt = Math.hypot(t[2], t[3]) || it.height || 8;
        var p0 = viewport.convertToViewportPoint(x, y), p1 = viewport.convertToViewportPoint(x + (it.width || 0), y + hgt);
        return { s: it.str, x0: Math.min(p0[0], p1[0]), x1: Math.max(p0[0], p1[0]), y0: Math.min(p0[1], p1[1]), y1: Math.max(p0[1], p1[1]) };
      });
      var labels = [], nums = [], hs = [], parens = [];
      items.forEach(function (it) {
        var s = fixLig(normTxt(it.s)), L = latin(s).replace(/\s+/g, ''), yc = (it.y0 + it.y1) / 2;
        if (/^\(?-?[\d,]*\d[\d,]*\)?$/.test(L) || /^\d{2,4}\/\d{1,2}\/\d{1,4}$/.test(L) || /^[-–—]$/.test(L)) { nums.push({ x0: it.x0, x1: it.x1, yc: yc, s: L.replace(/^-$/, '-'), conf: 1 }); hs.push(it.y1 - it.y0); }
        else if (/^[()]+$/.test(L)) parens.push({ x0: it.x0, x1: it.x1, yc: yc });
        else if (LETTER.test(s)) {
          // a column header such as «ده ماهه منتهی به 1404/10/30» carries its date: keep it for the year row
          var dm = latin(s).match(/(\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})/);
          if (dm && s.length < 45) nums.push({ x0: it.x0, x1: it.x1, yc: yc, s: dm[1], conf: 1 });
          else labels.push({ x0: it.x0, x1: it.x1, yc: yc, t: s, h: it.y1 - it.y0 });
        }
        else if (s.length) { // mixed items such as "یادداشت 12" are split into words
          s.split(' ').forEach(function (wd) { var l2 = latin(wd); if (/^\(?[\d,]*\d[\d,]*\)?$/.test(l2)) nums.push({ x0: it.x0, x1: it.x1, yc: yc, s: l2, conf: 1 }); });
        }
      });
      hs.sort(function (a, b) { return a - b; });
      var H = hs.length ? hs[Math.floor(hs.length / 2)] * 0.75 : 8;
      // brackets printed as separate items mark the neighbouring number negative
      parens.forEach(function (p) {
        var best = null, bd = 1e9;
        nums.forEach(function (n) { if (Math.abs(n.yc - p.yc) > 0.6 * H) return; var d = p.x1 <= n.x0 ? n.x0 - p.x1 : p.x0 >= n.x1 ? p.x0 - n.x1 : 0; if (d < bd) { bd = d; best = n; } });
        if (best && bd < 1.5 * H && !/^\(/.test(best.s)) best.s = '(' + best.s.replace(/[()]/g, '') + ')';
      });
      return { labels: labels, nums: nums, H: H, W: viewport.width, Hp: viewport.height, text: normTxt(labels.map(function (l) { return l.t; }).join(' ')), source: 'text' };
    });
  }
  // label words from Tesseract (the contiguous right-hand run of words with letters on each line)
  function labelRuns(lines, Hd) {
    var out = [];
    lines.forEach(function (l) {
      var ws = l.words.filter(function (w) { return LETTER.test(w.t) && w.t.replace(/[^؀-ۿA-Za-z]/g, '').length >= 1; }).sort(function (a, b) { return b.x1 - a.x1; });
      if (!ws.length) return;
      var run = [ws[0]];
      for (var i = 1; i < ws.length; i++) { if (run[run.length - 1].x0 - ws[i].x1 < 2.5 * Hd) run.push(ws[i]); else break; }
      var good = run.filter(function (w) { return w.conf >= 20; }); if (!good.length) return;
      out.push({ x0: Math.min.apply(null, run.map(function (w) { return w.x0; })), x1: Math.max.apply(null, run.map(function (w) { return w.x1; })), yc: (l.y0 + l.y1) / 2, y0: l.y0, y1: l.y1, t: snapLabel(normTxt(run.map(function (w) { return w.t; }).join(' '))), conf: good.reduce(function (a, w) { return a + w.conf; }, 0) / good.length });
    });
    return out;
  }
  function fromScan(canvas, ocr) {
    var W = canvas.width, Hp = canvas.height, g = grayOf(canvas), th = otsu(g), bin = new Uint8Array(g.length);
    for (var i = 0; i < g.length; i++) bin[i] = g[i] <= th ? 1 : 0;
    var CC = components(bin, W, Hp);
    // rough text height from the OCR lines, used to group label words
    var lh = ocr.lines.map(function (l) { return l.y1 - l.y0; }).sort(function (a, b) { return a - b; }), Hguess = lh.length ? lh[Math.floor(lh.length / 2)] * 0.6 : 20;
    var labels = labelRuns(ocr.lines, Hguess);
    // ink inside a label run belongs to the label
    function inLabel(c) { for (var k = 0; k < labels.length; k++) { var L = labels[k]; if (c.xc >= L.x0 - 2 && c.xc <= L.x1 + 2 && c.yc >= L.y0 - 2 && c.yc <= L.y1 + 2) return true; } return false; }
    var cand = CC.comps.filter(function (c) { return c.area >= 4 && !inLabel(c) && c.w < W * 0.2 && c.h < Hp * 0.05; });
    var hs = cand.map(function (c) { return c.h; }).sort(function (a, b) { return a - b; });
    if (!hs.length) return { labels: labels, nums: [], H: Hguess, W: W, Hp: Hp, text: ocr.text, source: 'ocr' };
    var p90 = hs[Math.floor(hs.length * 0.9)], big = hs.filter(function (h) { return h >= 0.5 * p90; }), Hd = big[Math.floor(big.length / 2)];
    cand = cand.filter(function (c) { return (c.h >= 0.12 * Hd || c.w >= 0.12 * Hd) && c.h < 2.2 * Hd && c.w < 3 * Hd; });
    // lines of number ink
    cand.sort(function (a, b) { return a.yc - b.yc; });
    var nl = [];
    cand.forEach(function (c) {
      var L = nl[nl.length - 1];
      if (L && Math.abs(c.yc - L.yc) < 0.6 * Hd) { L.c.push(c); var ys = L.c.map(function (d) { return d.yc; }).sort(function (a, b) { return a - b; }); L.yc = ys[Math.floor(ys.length / 2)]; }
      else nl.push({ yc: c.yc, c: [c] });
    });
    var nums = [];
    nl.forEach(function (L) {
      var cc = L.c.sort(function (a, b) { return a.x0 - b.x0; }), toks = [[cc[0]]];
      for (var k = 1; k < cc.length; k++) { var last = toks[toks.length - 1]; if (cc[k].x0 - last[last.length - 1].x1 > 0.7 * Hd) toks.push([cc[k]]); else last.push(cc[k]); }
      toks.forEach(function (t) {
        if (t.length > 16) return;
        var ys = t.filter(function (c) { return c.h >= 0.6 * Hd && c.h <= 1.3 * Hd; }).map(function (c) { return c.yc; }).sort(function (a, b) { return a - b; });
        var yref = ys.length ? ys[Math.floor(ys.length / 2)] : L.yc;
        var d = readToken(CC, t, Hd, yref);
        if (Hub.pdflocal.dbgTok && Math.abs(L.yc - Hub.pdflocal.dbgTok.y) < 8 && Math.abs(t[0].x0 - Hub.pdflocal.dbgTok.x) < 15) Hub.pdflocal.dbgTok.out = { Hd: Hd, d: d, comps: t.map(function (c) { var r = classify(feature(CC, c, Hd, yref)); var cu = cut2(CC, c, Hd, yref); return { w: c.w, h: c.h, wr: c.w / Hd, top: r.map(function (q) { return q.c + ':' + q.p.toFixed(2); }), cut: cu ? cu.map(function (q) { return q[0].c + ':' + q[0].p.toFixed(2); }) : null }; }) };
        nums.push({ x0: t[0].x0, x1: t[t.length - 1].x1, yc: L.yc, s: d.s, conf: d.conf, bad: d.conf <= 0 });
      });
    });
    return { labels: labels, nums: nums, H: Hd, W: W, Hp: Hp, text: ocr.text, source: 'ocr' };
  }

  // figures with no label beside them (Tesseract skipped a bold line): read just that strip of the label column
  function missingLabels(m, canvas, w) {
    var Hd = m.H, big = m.nums.filter(function (n) { return !n.bad && /,\d{3}/.test(n.s); });
    if (!big.length || !m.labels.length) return Promise.resolve(m);
    var valRight = Math.max.apply(null, big.map(function (n) { return n.x1; }));
    var labRight = Math.max.apply(null, m.labels.map(function (l) { return l.x1; }));
    var lines = [];
    big.forEach(function (n) {
      if (m.labels.some(function (l) { return Math.abs(l.yc - n.yc) < 1.6 * Hd; })) return;
      if (lines.some(function (y) { return Math.abs(y - n.yc) < 0.8 * Hd; })) return;
      lines.push(n.yc);
    });
    if (!lines.length || lines.length > 15) return Promise.resolve(m);
    var x0 = Math.round(valRight + 2.5 * Hd), x1 = Math.min(canvas.width, Math.round(labRight + Hd));
    if (x1 - x0 < 4 * Hd) return Promise.resolve(m);
    return w.setParameters({ tessedit_pageseg_mode: '7' }).then(function () {
      var chain = Promise.resolve();
      lines.forEach(function (yc) {
        chain = chain.then(function () {
          var y0 = Math.max(0, Math.round(yc - 0.9 * Hd)), hh = Math.round(1.8 * Hd), c = document.createElement('canvas'); c.width = x1 - x0; c.height = hh;
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(canvas, x0, y0, c.width, hh, 0, 0, c.width, hh);
          return w.recognize(c).then(function (r) {
            var t = normTxt(r.data.text || '').replace(/[0-9۰-۹\-–]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (t.replace(/[^\u0621-\u06CC]/g, '').length < 3) return;
            var wd = (r.data.words || []).filter(function (q) { return LETTER.test(q.text); }), lx0 = wd.length ? x0 + Math.min.apply(null, wd.map(function (q) { return q.bbox.x0; })) : x0 + 0.3 * c.width;
            m.labels.push({ x0: lx0, x1: x1, yc: yc, y0: yc - Hd / 2, y1: yc + Hd / 2, t: snapLabel(t), conf: r.data.confidence });
            m.nums = m.nums.filter(function (n) { return !(Math.abs(n.yc - yc) < 0.8 * Hd && n.x0 >= lx0 - Hd); });
          });
        });
      });
      return chain;
    }).then(function () { return w.setParameters({ tessedit_pageseg_mode: '6' }); }).then(function () { return m; }, function () { return w.setParameters({ tessedit_pageseg_mode: '6' }).then(function () { return m; }); });
  }

  /* ---------- layout: page model → typed table ---------- */
  var TYPES = [['skip', /تغییرات\s*(در\s*)?حقوق|حقوق\s*مالکانه\s*\(|سود\s*و\s*زیان\s*جامع|changes in equity|comprehensive income/i], ['CF', /جریان.{0,10}نقد|cash\s*flows?/i], ['BS', /وضعیت\s*مالی|ترازنامه|financial position|balance sheet/i], ['IS', /سود\s*و\s*زیان|profit or loss|income statement/i]];
  // label pieces on one printed line → one label (read right to left)
  function mergeLines(labels, Hd) {
    var ls = labels.slice().sort(function (a, b) { return a.yc - b.yc; }), out = [];
    ls.forEach(function (l) {
      var o = out[out.length - 1];
      if (o && Math.abs(l.yc - o.yc) < 0.5 * Math.max(Hd, 4)) { o.parts.push(l); o.x0 = Math.min(o.x0, l.x0); o.x1 = Math.max(o.x1, l.x1); }
      else out.push({ yc: l.yc, x0: l.x0, x1: l.x1, y0: l.y0, y1: l.y1, parts: [l] });
    });
    out.forEach(function (o) { o.t = normTxt(o.parts.sort(function (a, b) { return b.x1 - a.x1; }).map(function (p) { return p.t; }).join(' ')); });
    return out;
  }
  function titleOf(pm) {
    var top = pm.labels.filter(function (l) { return l.yc < pm.Hp * 0.3; }).sort(function (a, b) { return a.yc - b.yc; });
    var txt = normTxt(top.map(function (l) { return l.t; }).join(' | '));
    // a statement title is its own short line starting with «صورت» / «ترازنامه» (sentences in notes mention the titles too)
    var lines = mergeLines(top, pm.H || 10).map(function (l) { return l.t.replace(/^[^\u0600-\u06FFA-Za-z]+/, ''); });
    var TT = [['IS', 'صورت سود و زیان'], ['skip', 'صورت سود و زیان جامع'], ['BS', 'صورت وضعیت مالی'], ['BS', 'ترازنامه'], ['CF', 'صورت جریان های نقدی'], ['CF', 'صورت جریان وجوه نقد'], ['skip', 'صورت تغییرات در حقوق مالکانه']];
    for (var k = 0; k < lines.length; k++) {
      var t = lines[k]; if (t.length > 70) continue;
      var cons = /تلفیقی|consolidated/i.test(t), core = t.replace(/\s*(تلفیقی|گروه|شرکت اصلی|جدا(گانه)?)\s*/g, ' ').trim();
      if (/^(statement|consolidated|balance|income)/i.test(core)) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i][1].test(core)) return { type: TYPES[i][0], cons: cons || /consolidated/i.test(txt), text: t, all: txt }; continue; }
      // fuzzy: OCR often gets a letter or two wrong («جربان»)
      var q = squash(core), best = null, bd = 1e9;
      TT.forEach(function (x) { var c = squash(x[1]); var d = lev(q.slice(0, c.length + 2), c, 6); var d2 = lev(q, c, 6); d = Math.min(d, d2); if (d < bd) { bd = d; best = x; } });
      if (best && bd <= Math.max(1, Math.floor(squash(best[1]).length * 0.2))) return { type: best[0], cons: cons || /تلفیقی/.test(txt), text: t, all: txt };
    }
    return { type: null, text: txt, all: txt };
  }
  function unitOf(txt) {
    var t = normTxt(txt), cur = /دلار|USD/i.test(t) ? 'USD' : /تومان/.test(t) ? 'IRT' : 'IRR';
    var u = /میلیارد|billion/i.test(t) ? 'billion' : /میلیون|million/i.test(t) ? 'million' : /هزار|thousand/i.test(t) ? 'thousand' : null;
    return { unit: u, currency: cur };
  }
  function numVal(s) { var neg = /^\(/.test(s) || /\)$/.test(s) || /^-\d/.test(s); var d = s.replace(/[^\d]/g, ''); if (s === '-' || !d) return 0; var v = Number(d); return neg ? -v : v; }
  function isDate(s) { return /^\d{2,4}\/\d{1,2}\/\d{1,4}$/.test(s); }
  function yearOf(s) { var p = s.split('/'); var y = p[0].length === 4 ? p[0] : p[2]; return /^1[34]\d\d$|^20\d\d$/.test(y) ? y : null; }

  function table(pm) {
    var Hd = pm.H;
    var bad = pm.nums.filter(function (n) { return n.bad; });
    pm = { labels: pm.labels, nums: pm.nums.filter(function (n) { return !n.bad; }), H: pm.H, W: pm.W, Hp: pm.Hp };
    // first data line: the first number with thousands separators that has company (2 more within ~8 lines)
    var cy = pm.nums.filter(function (n) { return /,\d{3}/.test(n.s) && !(n.conf < 0.75 && /^1[34]0\d{1,3}$/.test(n.s.replace(/,/g, '0'))); }).map(function (n) { return n.yc; }).sort(function (a, b) { return a - b; }), firstData = 1e9;
    for (var q = 0; q < cy.length; q++) { var cnt = 0; for (var q2 = q; q2 < cy.length && cy[q2] <= cy[q] + 8 * Hd; q2++) cnt++; if (cnt >= 3) { firstData = cy[q]; break; } }
    if (firstData === 1e9 && cy.length) firstData = cy[0];
    var dates = pm.nums.filter(function (n) { return (isDate(n.s) && yearOf(n.s)) || (n.yc < firstData - 0.3 * Hd && /^(1[34]\d\d|20\d\d)$/.test(n.s)); })
      .map(function (n) { return isDate(n.s) ? n : { x0: n.x0, x1: n.x1, yc: n.yc, s: n.s + '/12/29', conf: n.conf }; })
      // headers such as «۳۰ آذر ۱۴۰۳»: a year inside an unreadable header token
      .concat(bad.filter(function (n) { return n.yc < firstData - 0.3 * Hd && /1[34]\d\d/.test(n.s.replace(/[^\d]/g, ' ')); }).map(function (n) { var y = /1[34]\d\d/.exec(n.s.replace(/[^\d]/g, ' '))[0]; return { x0: n.x0, x1: n.x1, yc: n.yc, s: y + '/12/29', conf: 0.5 }; }));
    // «سال ۱۴۰۳» headers: the ۰ of the year often reads as a separator
    if (!dates.length) dates = pm.nums.filter(function (n) { return n.yc < firstData - 0.3 * Hd && /1[34]0\d/.test(n.s.replace(/,/g, '0')); })
      .map(function (n) { return { x0: n.x0, x1: n.x1, yc: n.yc, s: /1[34]0\d/.exec(n.s.replace(/,/g, '0'))[0] + '/12/29', conf: 0.5 }; });
    var vals = pm.nums.filter(function (n) { return !isDate(n.s) && n.yc >= firstData - 0.3 * Hd; });
    // value lines joined to label lines by height
    var rows = [], header = [];
    mergeLines(pm.labels, Hd).forEach(function (l) { if (/^(یادداشت|یاداشت|note)$/i.test(l.t)) header.push(l); else rows.push({ yc: l.yc, label: l.t, lx0: l.x0, nums: [] }); });
    // number lines (tokens at one height)
    var nls = [];
    vals.slice().sort(function (a, b) { return a.yc - b.yc; }).forEach(function (n) { var L = nls[nls.length - 1]; if (L && Math.abs(n.yc - L.yc) < 0.5 * Hd) L.nums.push(n); else nls.push({ yc: n.yc, nums: [n] }); });
    // pair each number line with one label line: nearest first (a label can sit a little lower or higher than its figures)
    var pairs = [];
    nls.forEach(function (L, i) { rows.forEach(function (r, j) { var d = Math.abs(r.yc - L.yc); if (d < 1.6 * Hd && L.nums.every(function (n) { return n.x1 < r.lx0 + 0.5 * Hd; })) pairs.push({ i: i, j: j, d: d }); }); });
    pairs.sort(function (a, b) { return a.d - b.d; });
    var usedL = {}, usedR = {};
    pairs.forEach(function (p) { if (usedL[p.i] || usedR[p.j]) return; usedL[p.i] = usedR[p.j] = true; rows[p.j].nums = nls[p.i].nums; });
    nls.forEach(function (L, i) { if (!usedL[i]) rows.push({ yc: L.yc, label: '', lx0: Infinity, nums: L.nums }); });
    // labels on the same height as another label (two-word OCR splits) merge
    rows.sort(function (a, b) { return a.yc - b.yc; });
    // columns from the value centres
    var footA = rows.filter(function (r) { return /جدایی\s*ناپذیر|جزء\s*لاینفک|integral part/i.test(r.label); }).map(function (r) { return r.yc; }), footAY = footA.length ? Math.min.apply(null, footA) : 1e12;
    var xs = []; rows.forEach(function (r) { if (r.label && r.yc < footAY) r.nums.forEach(function (n) { xs.push((n.x0 + n.x1) / 2); }); });
    xs.sort(function (a, b) { return a - b; });
    var cl = [];
    xs.forEach(function (x) { var c = cl[cl.length - 1]; if (c && x - c.xs[c.xs.length - 1] < 2.5 * Hd) c.xs.push(x); else cl.push({ xs: [x] }); });
    cl.forEach(function (c) { c.x = c.xs[Math.floor(c.xs.length / 2)]; c.n = c.xs.length; });
    var nRows = rows.filter(function (r) { return r.label && r.nums.length && r.yc < footAY; }).length;
    cl = cl.filter(function (c) { return c.n >= Math.max(2, nRows * 0.15); });
    if (!cl.length) return null;
    // which cluster is the note column: small whole numbers, right of the values
    function members(c) { var a = []; rows.forEach(function (r) { r.nums.forEach(function (n) { if (Math.abs((n.x0 + n.x1) / 2 - c.x) < 2.5 * Hd) a.push(n); }); }); return a; }
    cl.forEach(function (c) { var m = members(c); c.small = m.length && m.every(function (n) { return /^\d{1,3}$/.test(n.s) && Number(n.s) < 200 || n.s === '-'; }); c.big = m.some(function (n) { return /,/.test(n.s) || n.s.replace(/\D/g, '').length >= 4; }); });
    cl.sort(function (a, b) { return a.x - b.x; });
    var noteX = header.length ? (header[0].x0 + header[0].x1) / 2 : null;
    cl.forEach(function (c) { var m = members(c); c.smallShare = m.length ? m.filter(function (n) { return /^\d{1,3}(-\d{1,3})?$/.test(n.s) && Number(n.s.split('-')[0]) < 200 || n.s === '-'; }).length / m.length : 0; });
    var noteCol = noteX != null ? cl.filter(function (c) { return Math.abs(c.x - noteX) < 3 * Hd; })[0] : null;
    if (!noteCol) { var rm = cl[cl.length - 1]; if (cl.length > 1 && rm && rm.smallShare >= 0.8) noteCol = rm; }
    var valueCols = cl.filter(function (c) { return c !== noteCol && !(c.small && !c.big); });
    if (!valueCols.length) return null;
    // years: a date header over the column, else newest at the right (Persian layout)
    valueCols.forEach(function (c) { var d = null, bd = 1e9; dates.forEach(function (n) { var dx = Math.abs((n.x0 + n.x1) / 2 - c.x); if (dx < 4 * Hd && dx < bd) { bd = dx; d = n; } }); c.date = d ? d.s : null; c.year = d ? yearOf(d.s) : null; });
    var guessed = valueCols.some(function (c) { return !c.year; });
    var order = valueCols.slice();
    function dkey(d) { var p = d.split('/').map(Number); if (p[0] < 100) p = [p[2], p[1], p[0]]; return p[0] * 10000 + p[1] * 100 + p[2]; }
    if (!guessed) order.sort(function (a, b) { return dkey(a.date) - dkey(b.date); });
    else order.sort(function (a, b) { return a.x - b.x; }); // leftmost = oldest
    // keep at most the 3 most recent columns
    order = order.slice(-3);
    var years = order.map(function (c, k) { return c.year || ('Y' + (k - order.length + 1 || '')).replace('Y0', 'Y'); });
    // duplicate years (interim + annual): add the month
    years = years.map(function (y, k) { return years.indexOf(y) !== k || years.lastIndexOf(y) !== k ? (order[k].date ? order[k].date.split('/').slice(0, 2).join('/') : y + '·' + k) : y; });
    var out = [], section = '', unsure = [];
    var foot = rows.filter(function (r) { return /جدایی\s*ناپذیر|جزء\s*لاینفک|integral part/i.test(r.label); }).map(function (r) { return r.yc; });
    var footY = foot.length ? Math.min.apply(null, foot) : 1e12;
    rows.forEach(function (r) {
      if (!r.label || r.yc >= footY - 0.3 * Hd || r.label.replace(/[^\u0621-\u06CCA-Za-z]/g, '').length < 3) return;
      if (r.yc < firstData - 0.3 * Hd && !r.nums.length) { if (r.yc > (dates.length ? Math.max.apply(null, dates.map(function (n) { return n.yc; })) : 0)) section = r.label.replace(/[:：]\s*$/, ''); return; }
      if (r.yc < firstData - 0.3 * Hd) return;
      var v = order.map(function () { return null; }), hit = false;
      r.nums.forEach(function (n) {
        var cx = (n.x0 + n.x1) / 2, k = -1, bd = 1e9;
        order.forEach(function (c, j) { var d = Math.abs(cx - c.x); if (d < bd) { bd = d; k = j; } });
        if (k >= 0 && bd < 4 * Hd) { v[k] = numVal(n.s); hit = true; if (n.conf < 0.75) unsure.push(r.label + ' (' + years[k] + ': ' + n.s + ')'); }
      });
      if (!hit) { if (r.label.length < 60 && !/صفحه|پیوست|یادداشت.*جدایی/.test(r.label)) section = r.label.replace(/[:：]\s*$/, ''); return; }
      out.push({ label: r.label.replace(/[:：]\s*$/, ''), section: section, values: v });
    });
    return { years: years, rows: out, guessed: guessed, unsure: unsure };
  }

  /* ---------- whole document ---------- */
  function hasTextLayer(page) { return page.getTextContent().then(function (tc) { var n = 0; tc.items.forEach(function (it) { if (LETTER.test(it.str || '')) n++; }); return n >= 8; }); }

  function read(doc, name, say) {
    say = say || function () {};
    var N = Math.min(doc.numPages, 45), pages = [], found = {}, ocrW = null, lastHit = 0;
    function engine() { return ocrW ? Promise.resolve(ocrW) : tesseract(say).then(function (w) { ocrW = w; return w; }); }
    function strip(i, rot) {
      return render(doc, i, 1400, rot).then(function (r) {
        var c = document.createElement('canvas'); c.width = r.canvas.width; c.height = Math.round(r.canvas.height * 0.28);
        c.getContext('2d').drawImage(r.canvas, 0, 0);
        return engine().then(function (w) { return ocrWords(w, c); }).then(function (o) {
          return { labels: o.lines.map(function (l) { return { x0: l.x0, x1: l.x1, yc: (l.y0 + l.y1) / 2, y0: l.y0, y1: l.y1, t: normTxt(l.words.map(function (w) { return w.t; }).join(' ')) }; }), nums: [], H: 10, W: c.width, Hp: r.canvas.height, text: o.text, source: 'strip', rot: rot, conf: o.conf, nWords: o.nWords };
        });
      });
    }
    function pageModel(i, full, rot) {
      return doc.getPage(i).then(function (p) {
        return hasTextLayer(p).then(function (txt) {
          if (txt) { var v = p.getViewport({ scale: 1.5 }); return fromTextLayer(p, v); }
          if (!full) {
            // title strip only: is this a statement page? A page scanned upside down or sideways reads as noise: turn it
            return strip(i, 0).then(function (pm) {
              if (titleOf(pm).type || (pm.conf >= 60 && pm.nWords >= 6)) return pm;
              var rots = [180, 90, 270], k = 0;
              function tryNext() { if (k >= rots.length) return pm; var r = rots[k++]; return strip(i, r).then(function (q) { return titleOf(q).type ? q : tryNext(); }); }
              return tryNext();
            });
          }
          return render(doc, i, 2000, rot).then(function (r) { var cv = deskew(r.canvas); return engine().then(function (w) { return ocrWords(w, cv).then(function (o) { var m = fromScan(cv, o); m.rot = rot; return missingLabels(m, cv, w); }); }).then(function (m) { if (Hub.pdflocal.debug) Hub.pdflocal.debug.push({ page: i, nums: m.nums, labels: m.labels, H: m.H, W: m.W }); return m; }); });
        });
      });
    }
    var i = 1;
    function next() {
      if (i > N) return Promise.resolve();
      // stop once IS, BS and CF were found and two pages passed without a statement
      var nf = (found.IS ? 1 : 0) + (found.BS ? 1 : 0) + (found.CF ? 1 : 0);
      if ((nf === 3 && i - lastHit > 2) || (nf === 2 && i - lastHit > 6) || (nf === 1 && i - lastHit > 10)) return Promise.resolve();
      var k = i++;
      say(T('Reading page ' + k + ' of ' + doc.numPages + ' on this device…', 'خواندن صفحهٔ ' + k + ' از ' + doc.numPages + ' روی همین دستگاه…'));
      return pageModel(k, false).then(function (pm) {
        var ti = titleOf(pm);
        if (!ti.type || ti.type === 'skip') { if (ti.type === 'skip') lastHit = k; return next(); }
        var full = pm.source === 'strip' ? (say(T('Page ' + k + ': ' + ti.text.slice(0, 60) + (pm.rot ? ' (page turned ' + pm.rot + '°)' : '') + ' — reading the lines (OCR)…', 'صفحهٔ ' + k + ': ' + ti.text.slice(0, 60) + (pm.rot ? ' (صفحه ' + pm.rot + ' درجه چرخانده شد)' : '') + ' — خواندن سطرها با OCR…')), pageModel(k, true, pm.rot || 0)) : Promise.resolve(pm);
        return full.then(function (fm) {
          var tb = table(fm);
          if (tb && tb.rows.length >= 4) { pages.push({ page: k, type: ti.type, cons: ti.cons, title: ti.text, unit: unitOf((fm.text || '') + ' ' + ti.all), tb: tb, source: fm.source }); found[ti.type] = true; lastHit = k; }
          return next();
        });
      });
    }
    return next().then(function () {
      if (!pages.length) throw new Error(T('No income statement, balance sheet or cash flow page was recognised in this PDF. If it is a scan, check it is legible; otherwise use the Excel export of the statements.', 'در این PDF صفحهٔ صورت سود و زیان، وضعیت مالی یا جریان‌های نقدی شناسایی نشد. اگر اسکن است خوانایی آن را بررسی کنید؛ در غیر این صورت از خروجی اکسل صورت‌ها استفاده کنید.'));
      // consecutive pages of the same statement are one statement
      var sts = [];
      pages.forEach(function (p) {
        var l = sts[sts.length - 1];
        if (l && l.type === p.type && l.cons === p.cons && l.last === p.page - 1 && l.years.join() === p.tb.years.join()) { l.rows = l.rows.concat(p.tb.rows); l.last = p.page; l.unsure = l.unsure.concat(p.tb.unsure); }
        else sts.push({ type: p.type, cons: p.cons, title: p.title + (p.cons ? '' : ''), years: p.tb.years, rows: p.tb.rows, last: p.page, first: p.page, unsure: p.tb.unsure, guessed: p.tb.guessed, unit: p.unit, source: p.source });
      });
      var anySep = sts.some(function (s) { return !s.cons; });
      var u = sts.map(function (s) { return s.unit; }).filter(function (x) { return x.unit; })[0] || { unit: null, currency: 'IRR' };
      return {
        local: true, unit: u.unit, currency: u.currency, source: sts.some(function (s) { return s.source === 'ocr'; }) ? 'ocr' : 'text',
        statements: sts.map(function (s) { return { type: s.type, title: s.title + ' (p. ' + s.first + (s.last > s.first ? '–' + s.last : '') + ')', years: s.years, rows: s.rows, guessed: s.guessed, pref: !(s.cons && anySep), unsure: s.unsure }; })
      };
    });
  }
  Hub.pdflocal = { read: read, _: { snapLabel: snapLabel, decode: decode, classify: classify, otsu: otsu, components: components, table: table, titleOf: titleOf } };
})(typeof window !== 'undefined' ? window : globalThis);
