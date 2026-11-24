/* =====================================================================
 * FINANCIAL ASTROLOGY DASHBOARD — directive 24 · 11. Reads Hub.astro (research engine); issues no trading signal.
 * Tabs: the sky and the event calendar · sensitive windows per market · test results · forecast ledger · method & registration.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub; if (!root.document || !Hub || !Hub.toolkit || !Hub.astro) return;
  var U = Hub.util, h = U.h, TK = Hub.toolkit, AS = Hub.astro, TE = Hub.tradeEngine, KEY = 'hub.astroUI.v1';
  var fa = TE ? TE.fa : function (x, d) { return isF(x) ? (+x).toLocaleString('fa-IR', { maximumFractionDigits: d == null ? 2 : d }) : '—'; }, pct = TE ? TE.pct : function (x, d) { return fa(x * 100, d) + '٪'; };
  var CLS = { stock: 'سهام', fund: 'صندوق', index: 'شاخص بورس', gold: 'طلا و سکه', fx: 'ارز', crypto: 'رمزارز', commodity: 'کالا و انرژی' };
  var LADC = { none: 'sev-muted', time: 'sev-info', vol: 'sev-warn', turn: 'sev-warn', tech: 'fit-cond', signal: 'fit-rec' };
  var WHYFA = { valid: 'معتبر', effect: 'اثر به اندازهٔ لازم یا هم‌جهت نیست', fdr: 'پس از اصلاح آزمون‌های متعدد معنادار نیست', thin: 'رویداد برون‌نمونه کمتر از ۱۵' };
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function table(head, rows) { return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, head.map(function (t) { return h('th', { class: 'lbl', text: t }); }))]),
    h('tbody', null, rows.map(function (r) { return h('tr', null, r.map(function (c) { return h('td', { 'data-notr': '1' }, [c instanceof Node ? c : document.createTextNode(c == null ? '—' : String(c))]); })); }))])]); }
  function P(t, cls) { return h('p', { class: cls || 'small', 'data-notr': '1', text: t }); }
  function chip(t, cls) { return h('span', { class: 'sev ' + (cls || 'sev-info'), 'data-notr': '1', text: t }); }
  function tUTC(t) { return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; }
  function tTeh(t) { return new Date(t).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function dTeh(t) { return new Date(t).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }); }
  function dInt(di) { return TE && TE.shamsi ? TE.shamsi(di) : String(di); }
  function sel(S, k, lab, opts, ctx) { var s = h('select', { class: 'f-sel', 'aria-label': lab }, opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); })); s.value = S[k] || opts[0][0]; s.addEventListener('change', function () { S[k] = s.value; ctx.rerender(); }); return h('label', { class: 'small' }, [lab + ' ', s]); }
  function statusOf(r) { return r ? (r.valid ? chip('معتبر (برون‌نمونه)', 'fit-rec') : chip('نامعتبر — ' + (WHYFA[r.why] || r.why || '—'), 'sev-muted')) : chip('آزموده‌نشده', 'sev-info'); }

  function sample() { return { version: 1, tool: 'astro', cls: 'all', valid: 'all', hz: '60', ev: 'all', planet: 'all', asset: 'all', hyp: 'all', lim: 80 }; }
  function run(S) { var D = AS.load(), X = Hub.tradeUI && Hub.tradeUI.engineMemo ? Hub.tradeUI.engineMemo() : null; X = X && X.X ? X.X : X; var ch = [];
    if (!AS.available()) ch.push({ level: 'critical', msg: 'کتابخانهٔ نجومی بارگذاری نشده است.' }); if (!D) ch.push({ level: 'warning', msg: 'آزمون‌ها هنوز اجرا نشده‌اند؛ دکمهٔ «اجرای آزمون‌ها» را بزنید.' });
    return { D: D, C: X && X.central ? X.central.by : {}, checks: ch }; }

  function runBtns(ctx) { var busy = false, msg = h('span', { class: 'small muted', 'data-notr': '1' });
    var go = function (o) { if (busy) return; busy = true; msg.textContent = 'در حال اجرا…'; AS.refresh(function (d, n) { msg.textContent = 'آزمون ' + fa(d, 0) + ' از ' + fa(n, 0) + ' سری'; }, o).then(function (D) { AS.ledgerSync(D); busy = false; U.toast('آزمون‌های نجومی تمام شد'); ctx.rerender(); }); };
    return h('div', { class: 'row-ctl' }, [h('button', { class: 'btn primary', type: 'button', text: 'اجرای آزمون‌ها (بازارها و شاخص‌ها، سپس سهام)', onclick: function () { go({}); } }),
      h('button', { class: 'btn', type: 'button', text: 'اجرای کامل از نو', onclick: function () { go({ force: true }); } }), msg]); }

  /* 1 · the sky now and the event calendar */
  function skyTab(ctx) { var S = ctx.S, now = new Date(), sk = AS.sky(now), L = AS.events(Date.now() - DAY, Date.now() + (+S.hz || 60) * DAY);
    var evOk = function (e) { if (S.ev !== 'all' && e.type !== S.ev && !(S.ev === 'moon' && /^moon/.test(e.type)) && !(S.ev === 'eclipse' && /Eclipse/.test(e.type))) return false; if (S.planet !== 'all' && (e.bodies || []).indexOf(S.planet) < 0) return false; return true; };
    var hypOf = function (e) { return AS.HYP.filter(function (H) { return e.ev.indexOf(H.ev) >= 0; }).map(function (H) { return H.id; }).join('، ') || '—'; };
    return ctx.group([ctx.panel('موقعیت اجرام آسمانی — ' + tTeh(now) + ' (تهران)', [table(['جرم', 'برج و درجه (زمین‌مرکزی، دایرةالبروج حارهٔ هم‌زمان)', 'طول دایرةالبروجی', 'سرعت ظاهری (درجه در روز)', 'جهت حرکت', 'طول خورشیدمرکزی'], sk.map(function (b) {
        return [b.fa, b.sign + ' ' + fa(b.deg, 1) + '°', fa(b.lon, 2) + '°', fa(b.sp, 3), b.b === 'Sun' || b.b === 'Moon' ? '—' : b.retro ? 'رجعی (بازگشتی ظاهری)' : 'مستقیم', isF(b.hel) ? fa(b.hel, 2) + '°' : '—']; })),
        P('محاسبه: astronomy-engine 2.1.19 (MIT)، دقت اعلام‌شده ±۱ دقیقهٔ قوسی؛ طول‌ها ظاهری و روی دایرةالبروج حارهٔ هم‌زمان‌اند. فاز ماه اکنون: ' + fa(AS.elong(Date.now()), 0) + '° (۰ = ماه نو، ۱۸۰ = ماه کامل).', 'small muted')]),
      ctx.panel('تقویم رویدادهای نجومی', [h('div', { class: 'row-ctl' }, [sel(S, 'hz', 'افق', [['30', '۳۰ روز'], ['60', '۶۰ روز'], ['120', '۱۲۰ روز'], ['365', 'یک سال']], ctx), sel(S, 'ev', 'نوع رویداد', [['all', 'همه'], ['moon', 'فازهای ماه'], ['eclipse', 'گرفت‌ها'], ['station', 'ایستگاه‌ها (آغاز و پایان رجعت)'], ['aspect', 'زوایا'], ['ingress', 'اعتدال و انقلاب']], ctx),
        sel(S, 'planet', 'جرم', [['all', 'همه']].concat(AS.BODIES.map(function (b) { return [b, AS.BFA[b]]; })), ctx)]),
        table(['زمان (UTC)', 'زمان تهران', 'رویداد', 'فرضیه‌های ثبت‌شدهٔ مرتبط'], L.filter(evOk).map(function (e) { return [tUTC(e.t), tTeh(e.t), e.fa, hypOf(e)]; })),
        P('رویدادها فقط تقویم‌اند؛ اینکه هر کدام برای یک بازار معنایی دارد یا نه، در «نتایج آزمون» با دادهٔ همان بازار سنجیده می‌شود.', 'small muted')])]); }

  /* 2 · sensitive windows per market */
  function winTab(ctx) { var S = ctx.S, R = ctx.R, D = R.D; if (!D) return ctx.group([ctx.panel('پنجره‌های حساس', [P('ابتدا آزمون‌ها را اجرا کنید.'), runBtns(ctx)])]);
    var rows = []; Object.keys(D.by).forEach(function (k) { var T = D.by[k]; if (!T.ok) return; if (S.cls !== 'all' && T.cls !== S.cls) return; var rec = R.C[k] || (R.C[k.replace(/^x:/, 'g:')]) || null, lad = AS.ladder(T, rec);
      AS.windows(T, +S.hz || 60).forEach(function (w) { if (S.valid === 'valid' && !w.valid) return; if (S.ev !== 'all' && w.H.ev !== S.ev) return; rows.push({ T: T, w: w, lad: lad }); }); });
    rows.sort(function (a, b) { return (b.w.valid - a.w.valid) || (a.w.t - b.w.t); });
    var near = Object.keys(D.by).map(function (k) { var T = D.by[k]; return T.ok ? { T: T, lad: AS.ladder(T, R.C[k] || null) } : null; }).filter(function (x) { return x && x.lad.lv !== 'none'; });
    var cnt = {}; near.forEach(function (x) { cnt[x.lad.lv] = (cnt[x.lad.lv] || 0) + 1; });
    return ctx.group([ctx.panel('وضعیت هر بازار در نردبان تصمیم (۱۰ روز آینده)', [P('ترتیب: هشدار زمانی نجومی ← هشدار نوسان ← پنجرهٔ احتمالی تغییر روند ← تأیید تکنیکال ← سیگنال معاملاتی تأییدشده. سه پلهٔ اول فقط با فرضیه‌ای که برای همان دارایی برون‌نمونه معتبر شده باشد بالا می‌روند؛ «سیگنال تأییدشده» فقط از موتور مرکزی می‌آید و رویداد نجومی هرگز دستور خرید یا فروش نمی‌سازد.'),
        table(['پله', 'تعداد بازار'], Object.keys(AS.LADFA).filter(function (k) { return k !== 'none'; }).map(function (k) { return [chip(AS.LADFA[k], LADC[k]), fa(cnt[k] || 0, 0)]; }))]),
      ctx.panel('پنجره‌های زمانی حساس — ' + fa(rows.length, 0) + ' مورد', [h('div', { class: 'row-ctl' }, [sel(S, 'cls', 'بازار', [['all', 'همه']].concat(Object.keys(CLS).map(function (c) { return [c, CLS[c]]; })), ctx), sel(S, 'valid', 'سطح اعتبار', [['all', 'همه'], ['valid', 'فقط فرضیه‌های معتبر']], ctx),
        sel(S, 'hz', 'افق', [['30', '۳۰ روز'], ['60', '۶۰ روز'], ['90', '۹۰ روز']], ctx), sel(S, 'ev', 'نوع چرخه', [['all', 'همه']].concat(AS.HYP.filter(function (H) { return H.out !== 'sq9' && H.ev !== 'lunarHalf' && H.ev !== 'retroMercury'; }).map(function (H) { return [H.ev, H.id + ' — ' + H.school]; })), ctx)]),
        table(['دارایی', 'بازار', 'رویداد', 'زمان رویداد (تهران)', 'پنجرهٔ احتمالی', 'فرضیه', 'وضعیت اعتبار برای همین دارایی', 'فراوانی تاریخی رخداد در پنجره / مبنای تصادفی', 'دامنهٔ قیمت سناریو (±۲ ATR·√w)', 'شاهد لازم برای تأیید', 'پلهٔ نردبان'],
          rows.slice(0, S.lim || 80).map(function (x) { var w = x.w, T = x.T; return [T.sym, CLS[T.cls] || T.cls, w.fa, tTeh(w.t), dTeh(w.from) + ' تا ' + dTeh(w.to), w.H.id + ' — ' + w.H.fa, statusOf(T.res.filter(function (r) { return r.id === w.H.id; })[0]),
            isF(w.hist) ? (w.H.out === 'vol' ? 'نسبت نوسان ' + fa(w.hist, 2) : pct(w.hist, 0)) + (isF(w.base) && w.H.out === 'piv' ? ' / ' + pct(w.base, 0) : '') : '—', isF(w.lo) ? fa(w.lo, 0) + ' – ' + fa(w.hi, 0) : '—',
            w.kind === 'turn' ? 'تشکیل نقطهٔ عطف: بازگشت ' + (w.H.sc === 'major' ? '۵' : '۲') + '×ATR از قیمت حدی درون پنجره، همراه با تغییر ساختار یا واگرایی در موتور تکنیکال' : w.kind === 'vol' ? 'بزرگ‌تر یا کوچک‌تر شدن نوسان روزانه نسبت به میانگین' : '—', chip(AS.LADFA[x.lad.lv], LADC[x.lad.lv])]; })),
        rows.length > (S.lim || 80) ? h('button', { class: 'btn ghost', type: 'button', text: 'نمایش بیشتر', onclick: function () { S.lim = (S.lim || 80) + 80; ctx.rerender(); } }) : null,
        P('احتمال تأخیر: پنجره ±w جلسه است؛ فراوانی تاریخی «رخداد درون پنجره» را می‌سنجد، نه روز دقیق. عددها کالیبره‌شده نیستند مگر فرضیه برای همان دارایی معتبر شده باشد.', 'small muted')].filter(Boolean))]); }

  /* 3 · test results */
  function resTab(ctx) { var S = ctx.S, D = ctx.R.D; if (!D) return ctx.group([ctx.panel('نتایج آزمون', [P('هنوز اجرا نشده است.'), runBtns(ctx)])]);
    var T = Object.keys(D.by).map(function (k) { return D.by[k]; }), ok = T.filter(function (t) { return t.ok; }), nV = 0, nT = 0;
    var sum = AS.HYP.map(function (H) { var rs = ok.map(function (t) { return t.res.filter(function (r) { return r.id === H.id; })[0]; }).filter(function (r) { return r && isF(r.OOS.p); }), v = rs.filter(function (r) { return r.valid; }).length; nV += v; nT += rs.length;
      var lifts = rs.map(function (r) { return r.OOS.lift; }).filter(isF).sort(function (a, b) { return a - b; }), ps = rs.map(function (r) { return r.OOS.p; }).sort(function (a, b) { return a - b; }), pw = rs.map(function (r) { return r.OOS.pow; }).filter(isF).sort(function (a, b) { return a - b; });
      var p05 = rs.filter(function (r) { return r.OOS.p < 0.05; }).length;
      return [H.id, H.fa, H.school, fa(rs.length, 0), fa(v, 0), lifts.length ? fa(lifts[lifts.length >> 1], 2) : '—', fa(p05, 0) + ' (انتظار تصادفی ≈ ' + fa(rs.length * 0.05, 0) + ')', ps.length ? fa(ps[ps.length >> 1], 2) : '—', pw.length ? pct(pw[pw.length >> 1], 0) : '—']; });
    var head = ctx.panel('خلاصه — ' + fa(ok.length, 0) + ' سری آزموده، ' + fa(nT, 0) + ' آزمون، ' + fa(nV, 0) + ' معتبر', [runBtns(ctx),
      P('هر فرضیه پیش از دیدن نتایج ثبت شده است (هش ' + AS.hypHash() + '). آزمون اصلی برون‌نمونه است (۴۰٪ آخر هر سری)، با آزمون جایگشت چرخشی و اصلاح نرخ کشف کاذب در هر خانواده (بازارها، شاخص‌ها، سهام). در ۲۰ آزمون مستقل به‌طور تصادفی حدود یکی زیر p=۰٫۰۵ می‌افتد؛ ستون «p<۰٫۰۵» را با همین انتظار مقایسه کنید.' + (D.pending ? ' ' + fa(D.pending, 0) + ' سری هنوز در صف است.' : '')),
      table(['فرضیه', 'شرح', 'مکتب', 'تعداد دارایی', 'معتبر پس از اصلاح', 'میانهٔ نسبت برون‌نمونه به مبنای تصادفی', 'p<۰٫۰۵ پیش از اصلاح', 'میانهٔ p', 'میانهٔ توان آزمون'], sum)]);
    var assets = ok.slice().sort(function (a, b) { return (a.fam === 'stock') - (b.fam === 'stock') || String(a.sym).localeCompare(String(b.sym)); });
    var pick = S.asset !== 'all' ? assets.filter(function (t) { return t.key === S.asset; }) : assets.filter(function (t) { return t.fam !== 'stock'; }).slice(0, 12);
    var det = ctx.panel('جزئیات هر دارایی', [h('div', { class: 'row-ctl' }, [sel(S, 'asset', 'دارایی', [['all', 'بازارها و شاخص‌های اصلی']].concat(assets.map(function (t) { return [t.key, t.sym + ' (' + (CLS[t.cls] || t.cls) + ')']; })), ctx), sel(S, 'hyp', 'فرضیه', [['all', 'همه']].concat(AS.HYP.map(function (H) { return [H.id, H.id + ' — ' + H.fa]; })), ctx)])].concat(pick.map(function (t) {
      var rs = t.res.filter(function (r) { return S.hyp === 'all' || r.id === S.hyp; });
      return h('div', null, [h('h4', { text: t.sym + ' — ' + fa(t.n, 0) + ' جلسه، از ' + dInt(t.from) + ' تا ' + dInt(t.to) + '؛ برون‌نمونه از ' + dInt(t.split) }),
        table(['فرضیه', 'رویداد (درون / برون‌نمونه)', 'درون‌نمونه: مشاهده / تصادفی', 'برون‌نمونه: مشاهده / تصادفی', 'نسبت برون‌نمونه', 'p جایگشت', 'q (FDR) / Holm', 'توان آزمون', 'رژیم پرنوسان / کم‌نوسان', 'سود خالص راهبرد (L3) / خرید و نگهداری', 'نتیجه'], rs.map(function (r) { var H = AS.HYP.filter(function (x) { return x.id === r.id; })[0], I = r.IS, O = r.OOS;
          var f = function (o) { return !isF(o.obs) ? '—' : H.out === 'piv' ? pct(o.obs, 1) + ' / ' + pct(o.null, 1) : H.out === 'ret' ? fa(o.obs * 1e4, 1) + ' / ' + fa(o.null * 1e4, 1) + ' (واحد: صدم درصد روزانه)' : fa(o.obs, 3) + ' / ' + fa(o.null, 3); };
          return [r.id + ' — ' + H.fa, fa(I.n, 0) + ' / ' + fa(O.n, 0), f(I), f(O), isF(O.lift) ? fa(O.lift, 2) : '—', isF(O.p) ? fa(O.p, 3) : '—', isF(r.q) ? fa(r.q, 3) + ' / ' + fa(r.pH, 3) : '—', isF(O.pow) ? pct(O.pow, 0) : '—',
            O.reg ? pct(O.reg.hi, 0) + ' (' + fa(O.reg.nHi, 0) + ') / ' + pct(O.reg.lo, 0) + ' (' + fa(O.reg.nLo, 0) + ')' : '—', H.out === 'ret' && isF(O.net) ? pct(O.net, 1) + ' / ' + pct(O.bh, 1) : '—', statusOf(r)]; })),
        t.inc ? P('آزمون ارزش افزوده (مدل خطی ریج، پیش‌رونده): خطای براییر برون‌نمونه با متغیرهای قیمتی ' + fa(t.inc.brierBase, 4) + '، با افزودن متغیرهای نجومی ' + fa(t.inc.brierAstro, 4) + ' (پیش‌بینی ثابت: ' + fa(t.inc.brierClim, 4) + ')؛ بهبود ' + fa(t.inc.gain * 1e4, 1) + ' واحد در ده‌هزار، p جایگشت ' + fa(t.inc.p, 3) + ' — ' + (t.inc.valid ? 'افزودن متغیرهای نجومی پیش‌بینی را بهتر کرده است.' : 'ارزش افزودهٔ معنادار نیست.')) : null].filter(Boolean)); })));
    var stocks = ok.filter(function (t) { return t.fam === 'stock'; }), sv = []; stocks.forEach(function (t) { t.res.forEach(function (r) { if (r.valid) sv.push([t.sym, r.id, fa(r.OOS.lift, 2), fa(r.q, 3)]); }); });
    var st = ctx.panel('سهام و صندوق‌ها — ' + fa(stocks.length, 0) + ' نماد آزموده', [stocks.length ? (sv.length ? table(['نماد', 'فرضیه', 'نسبت برون‌نمونه', 'q'], sv) : P('هیچ فرضیه‌ای برای هیچ نمادی پس از اصلاح نرخ کشف کاذب معتبر نشد.')) : P('سهام پس از بازارها و شاخص‌ها در صف آزمون قرار دارند.')]);
    var Hs = AS.history().runs, hist = ctx.panel('بازبینی مستمر — تاریخچهٔ اجراها', [Hs.length ? table(['زمان', 'نسخه', 'آزمون', 'معتبر', 'اعتبار از دست رفته', 'تازه معتبر'], Hs.slice().reverse().slice(0, 12).map(function (r) { return [tTeh(r.at), r.ver, fa(r.nT, 0), fa(r.nV, 0), r.lost.slice(0, 6).join('، ') || '—', r.gained.slice(0, 6).join('، ') || '—']; })) : P('هنوز اجرایی ثبت نشده است.'),
      P('پارامترهای فرضیه‌ها ثابت‌اند؛ هر اجرا با دادهٔ تازه همان آزمون را تکرار می‌کند. فرضیه‌ای که اعتبارش را از دست بدهد در ستون «از دست رفته» می‌آید. تغییر فرضیه‌ها فقط با نسخه و ثبت تازه مجاز است، تا جست‌وجوی پنهان الگو پیش نیاید.', 'small muted')]);
    return ctx.group([head, det, st, hist]); }

  /* 4 · forecast ledger */
  function ledTab(ctx) { var D = ctx.R.D, L = AS.ledgerLoad(), f = L.f.slice().reverse();
    var gr = L.f.filter(function (x) { return x.res; }), by = {}; gr.forEach(function (x) { var b = by[x.H] = by[x.H] || { n: 0, hit: 0, exp: 0, v: 0 }; b.n++; if (x.res.hit) b.hit++; if (isF(x.pBase)) b.exp += x.pBase; if (x.valid) b.v++; });
    return ctx.group([ctx.panel('ثبت پیش‌بینی پیش از رویداد', [h('div', { class: 'row-ctl' }, [h('button', { class: 'btn', type: 'button', text: 'ثبت پنجره‌های ۳۰ روز آینده و ارزیابی پنجره‌های گذشته', onclick: function () { var r = AS.ledgerSync(D); U.toast('ثبت: ' + fa(r.added, 0) + ' · ارزیابی: ' + fa(r.graded, 0)); ctx.rerender(); } })]),
        P('هر پیش‌بینی پیش از رویداد با شناسهٔ یکتا ثبت و بعد از پایان پنجره (+۲۵ روز برای تأیید نقطهٔ عطف) با دادهٔ واقعی سنجیده می‌شود. پیش‌بینی ثبت‌شده ویرایش نمی‌شود.'),
        table(['شناسه', 'دارایی', 'زمان ثبت', 'رویداد / فرضیه', 'پنجره', 'نوع رخداد مورد انتظار', 'جهت', 'دامنهٔ قیمت', 'فراوانی تاریخی / مبنا', 'شرط تأیید', 'شرط ابطال', 'نتیجه'], f.slice(0, 120).map(function (x) { var r = x.res;
          return [x.id, x.sym, tTeh(x.at), x.ev + ' · ' + x.H + (x.valid ? ' (معتبر)' : ' (نامعتبر)'), dTeh(x.from) + ' تا ' + dTeh(x.to), x.kind === 'turn' ? 'نقطهٔ عطف' : x.kind === 'vol' ? 'تغییر نوسان' : '—', x.dir === 'up' ? 'صعودی' : 'بدون جهت', isF(x.lo) ? fa(x.lo, 0) + ' – ' + fa(x.hi, 0) : '—',
            (isF(x.pHist) ? pct(x.pHist, 0) : '—') + ' / ' + (isF(x.pBase) ? pct(x.pBase, 0) : '—'), x.conf, x.inv, !r ? 'باز' : r.hit != null ? (r.hit ? 'رخ داد' : 'رخ نداد') + (isF(r.errDays) ? ' · خطای زمانی ' + fa(r.errDays, 0) + ' روز' : '') + (r.inBand != null ? ' · قیمت ' + (r.inBand ? 'درون' : 'بیرون') + ' دامنه' : '') : 'نسبت نوسان ' + fa(r.ratio, 2)]; }))]),
      ctx.panel('عملکرد پیش‌بینی‌های ارزیابی‌شده', [Object.keys(by).length ? table(['فرضیه', 'ارزیابی‌شده', 'رخ داد', 'نرخ رخداد', 'انتظار تصادفی (میانگین مبنا)', 'از معتبرها'], Object.keys(by).map(function (k) { var b = by[k]; return [k, fa(b.n, 0), fa(b.hit, 0), pct(b.hit / b.n, 0), pct(b.exp / b.n, 0), fa(b.v, 0)]; })) : P('هنوز پیش‌بینی‌ای ارزیابی نشده است؛ نخستین ارزیابی‌ها ۲۵ روز پس از پایان نخستین پنجره‌ها انجام می‌شود.')])]); }

  /* 5 · method, registration, sources */
  function methTab(ctx) {
    return ctx.group([ctx.panel('فرضیه‌های ثبت‌شده (پیش از آزمون) — ' + AS.VER + ' · ' + AS.hypHash(), [table(['شناسه', 'فرضیه', 'مکتب', 'پنجره (جلسه)', 'متغیر بازار', 'مقیاس نقطهٔ عطف'], AS.HYP.map(function (H) { return [H.id, H.fa, H.school, H.w ? '±' + fa(H.w, 0) : '—', { piv: 'نقطهٔ عطف (زیگزاگ ATR)', vol: 'نوسان (میانگین قدرمطلق بازده)', ret: 'بازده روزانه', sq9: 'فاصله تا شبکهٔ مربع ۹' }[H.out], H.sc === 'major' ? '۵×ATR' : H.sc === 'minor' ? '۲×ATR' : '—']; })),
        P('قاعدهٔ اعتبار: q<۰٫۰۵ (نرخ کشف کاذب در خانواده) + اثر هم‌جهت با فرضیه + نسبت ≥ ۱٫۱۵ (نقطهٔ عطف) یا انحراف نوسان ≥ ۱۰٪ + دست‌کم ۱۵ رویداد برون‌نمونه + هم‌علامتی درون‌نمونه؛ برای L3 علاوه بر این، سود خالص پس از کارمزد بیشتر از خرید و نگهداری.')]),
      ctx.panel('روش‌هایی که آزموده نشدند و چرا', [table(['روش', 'دلیل'], AS.NOTEST)]),
      ctx.panel('دادهٔ نجومی و کنترل دقت', [P('افمریس: astronomy-engine 2.1.19 (مجوز MIT؛ بر پایهٔ VSOP87). مختصات زمین‌مرکزی ظاهری روی دایرةالبروج حارهٔ هم‌زمان، و خورشیدمرکزی برای فرضیهٔ A3. همهٔ زمان‌ها UTC ذخیره می‌شوند و به زمان تهران تبدیل می‌شوند؛ رویداد به نخستین جلسه‌ای نسبت داده می‌شود که پایانش (۱۲:۳۰ تهران) پس از رویداد است. خطای زمان زوایا با درون‌یابی روزانه کمتر از حدود یک ساعت است.'),
        table(['رویداد مرجع', 'مقدار منتشرشده', 'محاسبهٔ این موتور'], [['خورشیدگرفتگی کامل', '2024-04-08 18:17 UTC', '18:17 UTC'], ['ماه کامل', '2024-01-25 17:54 UTC', '17:54 UTC'], ['ماه‌گرفتگی کامل', '2025-03-14 06:59 UTC', '06:58:42 UTC'], ['مقارنهٔ مشتری و زحل', '2020-12-21', '2020-12-21 ≈18:30 UTC'],
          ['تربیع‌های زحل و اورانوس', '2021-02-17، 2021-06-14، 2021-12-24', 'همان سه تاریخ'], ['ایستگاه‌های عطارد ۲۰۲۴', '04-01، 04-25، 08-05، 08-28', 'همان تاریخ‌ها']])]),
      ctx.panel('آنچه پژوهش‌های پیشین گزارش کرده‌اند', [P('اثر چرخهٔ ماه بر بازده سهام در چند پژوهش بین‌المللی گزارش شده است (بازده نزدیک ماه نو بیشتر از ماه کامل) و در پژوهش‌های دیگر تکرار نشده است؛ برای رجعت عطارد، پژوهشی دربارهٔ بازار آمریکا نوسان کمتر را در دورهٔ رجعت گزارش کرده که خلاف پیش‌بینی نجومی است. برای زوایای سیاره‌ای شواهد معتبر و قابل تکرار در منابع داوری‌شده یافت نشد. فهرست منابع در سند پروژه آمده است.'),
        P('همبستگی تاریخی به معنای رابطهٔ علّی نیست و رابطهٔ آماری معنادار هم لزوماً قابل معامله نیست. این موتور هرگز به‌تنهایی سیگنال معاملاتی نمی‌سازد.', 'small muted')])]); }

  var DAY = 86400000;
  function W(fn) { return function (ctx) { var r = fn(ctx); return r && r.el && !r.nodeType ? r : ctx.group([r]); }; }
  TK.define({
    id: 'astro', title: 'Financial astrology & planetary cycles (research engine)', sections: ['trading'], priority: 3, version: 1, storeKey: KEY, noFile: true,
    summary: 'A separate research engine: daily ephemeris (astronomy-engine), lunar phases, eclipses, stations, geocentric and heliocentric aspects, equinoxes, Gann time counts and the Square of Nine; 16 hypotheses registered before testing, each market on its own data, out-of-sample permutation tests with FDR, power, regime split, net-of-cost lunar strategy, incremental value over a price-only model, and a forecast ledger. It never issues a trading signal.',
    sample: sample, blank: sample, run: run, scenarios: false,
    eyebrow: function () { return 'Trading · Research'; }, heading: function () { return 'موتور اخترشناسی مالی و چرخه‌های نجومی (پژوهشی)'; }, filename: function () { return 'Financial_astrology'; },
    kpis: function (ctx) { var D = function () { return ctx.R.D; }; return [
      ['Tested series', function () { var d = D(); return d ? fa(Object.keys(d.by).filter(function (k) { return d.by[k].ok; }).length, 0) : '—'; }, function () { var d = D(); return d && d.at ? 'آخرین اجرا ' + tTeh(d.at) : 'اجرا نشده'; }],
      ['Valid hypotheses', function () { var d = D(), n = 0; if (d) Object.keys(d.by).forEach(function (k) { (d.by[k].res || []).forEach(function (r) { if (r.valid) n++; }); }); return fa(n, 0); }, function () { return 'پس از اصلاح نرخ کشف کاذب'; }],
      ['Next event', function () { var e = AS.events(Date.now(), Date.now() + 30 * DAY)[0]; return e ? dTeh(e.t) : '—'; }, function () { var e = AS.events(Date.now(), Date.now() + 30 * DAY)[0]; return e ? e.fa : ''; }],
      ['Forecast ledger', function () { var L = AS.ledgerLoad(); return fa(L.f.length, 0); }, function () { var L = AS.ledgerLoad(); return 'ارزیابی‌شده: ' + fa(L.f.filter(function (x) { return x.res; }).length, 0); }]]; },
    tabs: [{ group: 'اخترشناسی مالی', items: [['sky', 'آسمان امروز و تقویم رویدادها', W(skyTab)], ['win', 'پنجره‌های حساس هر بازار', W(winTab)], ['res', 'نتایج آزمون و اعتبار', W(resTab)], ['led', 'ثبت و ارزیابی پیش‌بینی‌ها', W(ledTab)], ['meth', 'روش، فرضیه‌های ثبت‌شده و منابع', W(methTab)]] }]
  });
})(window);
