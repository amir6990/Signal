/* =====================================================================
 * BUSINESS STRATEGY & SOLUTIONS — UI of the strategy engine (js/core/stratengine.js)
 *   1 diagnosis & intelligent intake (company text → facts; four-part form; modes)
 *   2 frameworks bank & selection (25 profiles; why chosen / why not; pin / exclude)
 *   3 framework analyses (only the selected ones; send to the existing tools)
 *   4 strategy architecture (guiding policy, pillars, enablers, staging, diagram)
 *   5 solutions & ranking (economic vs executional feasibility, weights, assumptions)
 *   6 hidden opportunities · 7 board report (9 sections, print / PDF) · Excel
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  if (!root.document || !Hub.toolkit) return;
  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit, B = function () { return Hub.stratBank; }, ENG = function () { return Hub.stratEngine; };
  var TRI = [['unk', 'نامشخص'], ['yes', 'بله'], ['no', 'خیر']];
  var LABEL = { exec: ['قابل اجرا', 'rec'], cond: ['مشروط', 'cond'], blocked: ['نیازمند رفع مانع', 'no'], excluded: ['حذف (تعارض با محدودیت)', 'no'], na: ['نامرتبط', 'ok'] };
  function fa(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); }
  function chip(l) { var x = LABEL[l] || [l, 'ok']; return h('span', { class: 'sev fit-' + x[1], text: x[0] }); }
  function list(a) { return h('ul', { class: 'studio-l' }, (a || []).map(function (x) { return h('li', { text: x }); })); }
  function table(head, rows, cls) { return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se ' + (cls || '') }, [h('thead', null, [h('tr', null, head.map(function (t) { return h('th', { class: 'lbl', text: t }); }))]), h('tbody', null, rows.map(function (r) { return h('tr', null, r.map(function (c) { return c && c.nodeType ? h('td', null, [c]) : h('td', { class: 'small', style: 'white-space:normal', text: c == null ? '' : String(c) }); })); }))])]); }
  function ensure(S) { var d = ENG().defaults(); if (!S.e) S.e = d; ['co', 'mkt', 'cap', 'cons', 'W', 'over'].forEach(function (k) { S.e[k] = Object.assign({}, d[k], S.e[k] || {}); }); ['res', 'units', 'cases'].forEach(function (k) { if (!Array.isArray(S.e[k])) S.e[k] = []; }); if (!S.e.up) S.e.up = {}; if (!S.e.combo) S.e.combo = { sel: { engine: true, studio: true, rm: true, ff: true, kn: true, bo: true, pw: true }, ffInto: true }; ['pin', 'ex', 'fwPin', 'fwEx'].forEach(function (k) { if (!Array.isArray(S.e.over[k])) S.e.over[k] = []; }); return S.e; }
  function toggle(arr, id) { var i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); }
  function mini(t, fn, title) { return h('button', { class: 'mini', type: 'button', text: t, title: title || t, onclick: fn }); }
  var MODE = { goal: 'راهبرد هدف‌محور', diag: 'راهبرد تشخیصی', full: 'ارزیابی جامع راهبردی' };

  /* ---------- 1 · diagnosis & intake ---------- */
  function diagTab(ctx) {
    var S = ctx.S, E = ensure(S), R = ctx.R.X, co = E.co, m = E.mkt, c = E.cap, cs = E.cons;
    var o = function (k, label, obj, key, opts, help) { return { key: k, label: label, options: opts, help: help, get: function () { return String(obj[key] == null ? 'unk' : obj[key]); }, set: function (v) { obj[key] = v; } }; };
    var t = function (k, label, obj, key) { return { key: k, label: label, text: true, get: function () { return obj[key] || ''; }, set: function (v) { obj[key] = v; } }; };
    var n = function (k, label, path, fmt) { return ctx.field(k, label, path, fmt || 'pct', { optional: true }); };
    var F15 = [['unk', 'نامشخص'], ['1', '۱ — ضعیف'], ['2', '۲'], ['3', '۳ — متوسط'], ['4', '۴'], ['5', '۵ — قوی']];
    var f15 = function (k, label, obj, key) { return { key: k, label: label, options: F15, get: function () { return obj[key] == null ? 'unk' : String(obj[key]); }, set: function (v) { obj[key] = v === 'unk' ? null : Number(v); } }; };
    var modeF = G.form({ id: 'se-mode', onChange: ctx.rerender, fields: [o('md', 'حالت عملکرد', E, 'mode', [['auto', 'خودکار (از روی هدف و دادهٔ موجود)'], ['goal', 'راهبرد هدف‌محور — هدف مشخص است'], ['diag', 'راهبرد تشخیصی — وضعیت روشن، جهت نامشخص'], ['full', 'ارزیابی جامع — شرکت نمی‌داند چه می‌خواهد']])] });
    var s1 = G.form({ id: 'se-co', onChange: ctx.rerender, fields: [{ type: 'head', label: 'بخش ۱ — مشخصات شرکت و مسئلهٔ راهبردی' }, t('nm', 'نام شرکت', co, 'name'), t('ind', 'صنعت و حوزهٔ فعالیت', co, 'industry'),
      o('sec', 'نوع صنعت', co, 'sector', [['unk', 'نامشخص'], ['manufacturing', 'تولیدی'], ['commodity', 'کالای پایه (فولاد، پتروشیمی، سیمان…)'], ['consumer', 'کالای مصرفی'], ['retail', 'خرده‌فروشی'], ['tech', 'فناوری / دیجیتال'], ['finance', 'مالی'], ['health', 'دارو و سلامت'], ['construction', 'ساختمان و پیمانکاری'], ['services', 'خدمات'], ['holding', 'هلدینگ'], ['other', 'سایر']]),
      o('stg', 'مرحلهٔ عمر کسب‌وکار', co, 'stage', [['unk', 'نامشخص'], ['startup', 'نوپا'], ['growth', 'رشد'], ['mature', 'بلوغ'], ['decline', 'افول'], ['turnaround', 'بحران / زیان']]),
      o('own', 'ساختار مالکیت', co, 'owner', [['unk', 'نامشخص'], ['family', 'خانوادگی'], ['private', 'خصوصی'], ['semi', 'خصولتی / نهادی'], ['state', 'دولتی'], ['pe', 'سرمایه‌گذار خصوصی']]),
      o('lst', 'پذیرش در بازار سرمایه', co, 'listed', [['unk', 'نامشخص'], ['none', 'غیربورسی'], ['ifb', 'فرابورس'], ['tse', 'بورس تهران']]),
      o('goal', 'هدف راهبردی اصلی', co, 'goal', ENG().GOALS), t('tg', 'هدف کمی یا آرمان (متن)', co, 'target'), ctx.field('hz', 'افق زمانی (سال)', 'e.co.horizon', 'dec', { optional: true }), t('q', 'پرسش راهبردی که باید پاسخ داده شود', co, 'question')] });
    var s2 = G.form({ id: 'se-mkt', onChange: ctx.rerender, fields: [{ type: 'head', label: 'بخش ۲ — صنعت، رقابت و محیط کلان' },
      o('gr', 'رشد بازار', m, 'growth', [['unk', 'نامشخص'], ['high', 'بالا'], ['med', 'متوسط'], ['low', 'پایین / راکد'], ['decline', 'در حال کوچک‌شدن']]), o('cn', 'تمرکز بازار', m, 'conc', [['unk', 'نامشخص'], ['fragmented', 'پراکنده'], ['moderate', 'متوسط'], ['concentrated', 'متمرکز']]),
      o('pos', 'جایگاه رقابتی', m, 'position', [['unk', 'نامشخص'], ['leader', 'رهبر'], ['challenger', 'چالشگر'], ['follower', 'پیرو'], ['niche', 'تمرکز بر بخش خاص']]), n('sh', 'سهم بازار', 'e.mkt.share'),
      f15('rv', 'شدت رقابت (۱ تا ۵)', m, 'rivalry'), f15('by', 'قدرت خریداران', m, 'buyers'), f15('sp', 'قدرت تأمین‌کنندگان', m, 'suppliers'), f15('en', 'تهدید ورود رقبای جدید', m, 'entry'), f15('sb', 'تهدید جایگزین‌ها', m, 'subs'),
      o('pc', 'قیمت‌گذاری دستوری', m, 'priceCtl', TRI), o('fx', 'وابستگی نهاده‌ها به ارز/واردات', m, 'fxInputs', TRI), o('ip', 'امکان انتقال تورم به قیمت', m, 'inflPass', [['unk', 'نامشخص'], ['full', 'کامل'], ['partial', 'جزئی'], ['none', 'ندارد']]),
      o('sn', 'اثر تحریم', m, 'sanctions', TRI), o('ds', 'تهدید اختلال فناورانه', m, 'disrupt', TRI), o('cy', 'قیمت/تقاضای چرخه‌ای', m, 'cyclical', TRI), o('sr', 'رقیب دولتی یا خصولتی', m, 'stateRival', TRI),
      o('ex', 'دسترسی به بازار صادراتی', m, 'exportOpen', TRI), o('un', 'نیاز برآورده‌نشدهٔ مشتری (با شاهد)', m, 'unmet', TRI), o('rc', 'تغییر مقررات در راه', m, 'regChange', TRI)] });
    var s3 = G.form({ id: 'se-cap', onChange: ctx.rerender, fields: [{ type: 'head', label: 'بخش ۳ — قابلیت‌ها، منابع و عملکرد (خالی = نامشخص)' },
      ctx.field('rev', 'فروش سال آخر (برای سنجش اثر مالی؛ واحد دلخواه)', 'e.cap.rev', 'num', { optional: true }), n('rg', 'رشد فروش', 'e.cap.revGrowth'), o('gt', 'روند حاشیهٔ سود', c, 'gmTrend', [['unk', 'نامشخص'], ['up', 'صعودی'], ['flat', 'ثابت'], ['down', 'نزولی']]),
      n('em', 'حاشیهٔ EBITDA', 'e.cap.ebitdaM'), n('pm', 'حاشیهٔ EBITDA صنعت / رقبا', 'e.cap.peerM'), n('ut', 'بهره‌برداری از ظرفیت', 'e.cap.util'), n('cc', 'سهم ۱۰ مشتری اول از فروش', 'e.cap.custConc'), n('es', 'سهم صادرات از فروش', 'e.cap.exportSh'),
      f15('dg', 'بلوغ دیجیتال (۱ تا ۵)', c, 'digital'), o('in', 'توان نوآوری', c, 'innov', [['unk', 'نامشخص'], ['strong', 'قوی'], ['some', 'محدود'], ['none', 'ندارد']]), o('mg', 'توان مدیریت', c, 'mgmt', [['unk', 'نامشخص'], ['strong', 'قوی'], ['adequate', 'کافی'], ['weak', 'ضعیف']]),
      o('xe', 'سابقهٔ اجرای برنامه‌ها', c, 'exec', [['unk', 'نامشخص'], ['good', 'خوب'], ['mixed', 'متوسط'], ['poor', 'ضعیف']]), o('cs', 'وضع نقدینگی', c, 'cash', [['unk', 'نامشخص'], ['strong', 'قوی'], ['adequate', 'کافی'], ['tight', 'تنگ']]),
      o('al', 'هم‌راستایی سازمان با راهبرد', c, 'align', [['unk', 'نامشخص'], ['yes', 'هم‌راستا'], ['partly', 'نسبی'], ['no', 'ناهم‌راستا']]), o('gv', 'حاکمیت شرکتی و حسابرسی', c, 'gov', [['unk', 'نامشخص'], ['ready', 'آماده (بدون بند اساسی)'], ['partial', 'نسبی'], ['weak', 'ضعیف']]),
      o('br', 'قدرت برند', c, 'brand', [['unk', 'نامشخص'], ['strong', 'قوی'], ['avg', 'متوسط'], ['weak', 'ضعیف']]), o('cp', 'موقعیت هزینه نسبت به رقبا', c, 'costPos', [['unk', 'نامشخص'], ['low', 'پایین‌تر'], ['avg', 'هم‌سطح'], ['high', 'بالاتر']]),
      o('df', 'تمایز محصول از نگاه مشتری', c, 'diff', [['unk', 'نامشخص'], ['high', 'بالا'], ['some', 'محدود'], ['none', 'ندارد']]), o('rc2', 'درآمد تکرارشونده', c, 'recurring', TRI), o('sb2', 'شرکت تابعه / پرتفوی کسب‌وکار', c, 'subs', TRI)] });
    var s4 = G.form({ id: 'se-cons', onChange: ctx.rerender, fields: [{ type: 'head', label: 'بخش ۴ — محدودیت‌ها، ترجیحات و اهداف («خیر» در پذیرش = محدودیت قطعی)' },
      o('ctl', 'الزام حفظ کنترل/مالکیت', cs, 'control', TRI), o('rk', 'ریسک‌پذیری', cs, 'risk', [['unk', 'نامشخص'], ['low', 'کم'], ['med', 'متوسط'], ['high', 'زیاد']]), o('pt', 'پذیرش شریک / سرمایه‌گذار', cs, 'partner', TRI),
      o('dv', 'پذیرش واگذاری کسب‌وکار یا دارایی', cs, 'divest', TRI), o('it', 'پذیرش ورود به بازار خارجی', cs, 'intl', TRI), o('da', 'تمایل به تحول دیجیتال', cs, 'digitalAppetite', TRI),
      ctx.field('cap', 'سرمایهٔ قابل تخصیص (اختیاری)', 'e.cons.capital', 'num', { optional: true }), ctx.field('tm', 'افق زمانی اجرا (ماه)', 'e.cons.time', 'dec', { optional: true }), t('rl', 'خطوط قرمز دیگر (متن)', cs, 'redLines')] });
    var res = ctx.list({ id: 'se-res', path: 'e.res', onChange: ctx.rerender, newRow: function () { return { name: '', type: 'asset', v: 'unk', r: 'unk', i: 'unk', o: 'unk', use: 'used' }; }, cols: [
      { key: 'name', label: 'منبع / قابلیت', kind: 'text' }, { key: 'type', label: 'نوع', kind: 'select', options: function () { return [['brand', 'برند'], ['licence', 'مجوز / امتیاز'], ['asset', 'دارایی فیزیکی'], ['tech', 'فناوری / دانش فنی'], ['data', 'داده'], ['network', 'شبکه / توزیع'], ['people', 'نیروی انسانی'], ['relation', 'روابط و دسترسی']]; } },
      { key: 'v', label: 'ارزشمند', kind: 'select', options: function () { return TRI; } }, { key: 'r', label: 'کمیاب', kind: 'select', options: function () { return TRI; } }, { key: 'i', label: 'سخت‌تقلید', kind: 'select', options: function () { return TRI; } }, { key: 'o', label: 'سازمان آماده', kind: 'select', options: function () { return TRI; } },
      { key: 'use', label: 'وضع استفاده', kind: 'select', options: function () { return [['used', 'در استفاده'], ['under', 'کم‌استفاده'], ['idle', 'بلااستفاده']]; } }] });
    var units = ctx.list({ id: 'se-units', path: 'e.units', onChange: ctx.rerender, newRow: function () { return { name: '', growth: 'unk', pos: 'unk', fit: 'unk' }; }, cols: [
      { key: 'name', label: 'واحد / شرکت تابعه', kind: 'text' }, { key: 'growth', label: 'رشد بازار', kind: 'select', options: function () { return [['unk', 'نامشخص'], ['high', 'بالا'], ['low', 'پایین']]; } },
      { key: 'pos', label: 'جایگاه نسبی', kind: 'select', options: function () { return [['unk', 'نامشخص'], ['strong', 'قوی'], ['weak', 'ضعیف']]; } }, { key: 'fit', label: 'همسو با هستهٔ گروه', kind: 'select', options: function () { return TRI; } }] });
    // intake
    var ta = h('textarea', { class: 'f-area', rows: 7, id: 'se-text', placeholder: 'متن شرکت را اینجا بنویسید یا بچسبانید: فعالیت، بازار، رقبا، مشکلات، اهداف، محدودیت‌ها… (فارسی یا انگلیسی)', 'aria-label': 'متن شرکت' });
    ta.value = E.text || ''; ta.addEventListener('input', function () { E.text = ta.value; });
    var go = h('button', { class: 'btn primary', type: 'button', text: 'استخراج و تحلیل متن', onclick: function () { E.text = ta.value; ctx.rerender(); } });
    var commit = h('button', { class: 'btn', type: 'button', text: 'تثبیت موارد استخراج‌شده در فرم', onclick: function () { (R.used || []).forEach(function (x) { var ks = x.k.split('.'); E[ks[0]][ks[1]] = x.v; }); ctx.rerender(); U.toast('موارد استخراج‌شده در فرم ثبت شد؛ هر کدام را می‌توانید اصلاح کنید.', 'good'); } });
    var xt = R.X && R.X.length ? table(['مورد', 'مقدار', 'جملهٔ شاهد', 'وضعیت'], R.X.map(function (x) { return [x.lab, typeof x.v === 'number' ? (x.v <= 1 && x.k !== 'cap.digital' ? Math.round(x.v * 100) + '٪' : fa(x.v)) : x.v, x.ev, x.ignored ? 'نادیده (فرم مقدار دارد)' : 'به‌کار رفت — تأیید کنید']; })) : h('p', { class: 'muted', text: E.text ? 'از متن موردی استخراج نشد؛ فرم را تکمیل کنید.' : 'متنی وارد نشده است.' });
    // scenarios, cases
    var scSel = h('select', { class: 'f-sel', 'aria-label': 'سناریوی آزمایشی راهبرد' }, [h('option', { value: '', text: 'سناریوهای آزمایشی…' })].concat((Hub.stratScenarios || []).map(function (s) { return h('option', { value: String(s.id), text: s.id + ' · ' + s.fa }); })));
    var load = h('button', { class: 'btn', type: 'button', text: 'بارگذاری سناریو', onclick: function () { var sc = (Hub.stratScenarios || []).filter(function (s) { return String(s.id) === scSel.value; })[0]; if (!sc) return; var keep = S.e.cases; S.e = ENG().merge(ENG().defaults(), JSON.parse(JSON.stringify(sc.E))); S.e.cases = keep; ctx.rerender(); U.toast('سناریوی ' + sc.id + ' بارگذاری شد. انتظار: ' + sc.expect, 'good'); } });
    var clr = h('button', { class: 'btn ghost', type: 'button', text: 'پاک کردن همهٔ ورودی‌ها', onclick: function () { if (clr.dataset.armed) { var keep = S.e.cases; S.e = ENG().defaults(); S.e.cases = keep; ctx.rerender(); } else { clr.dataset.armed = '1'; clr.textContent = 'برای تأیید دوباره بزنید'; setTimeout(function () { if (clr.isConnected) { delete clr.dataset.armed; clr.textContent = 'پاک کردن همهٔ ورودی‌ها'; } }, 5000); } } });
    var cn = h('input', { class: 'f-text', type: 'text', placeholder: 'نام بررسی', 'aria-label': 'نام بررسی' });
    var save = h('button', { class: 'btn', type: 'button', text: 'ذخیرهٔ این بررسی', onclick: function () { var snap = JSON.parse(JSON.stringify(S.e)); delete snap.cases; S.e.cases.push({ name: cn.value.trim() || (co.name || 'بررسی') + ' · ' + new Date().toLocaleDateString('fa-IR'), e: snap }); ctx.rerender(); U.toast('ذخیره شد؛ در زبانهٔ راه‌حل‌ها مقایسه می‌شود.', 'good'); } });
    var cases = E.cases.length ? h('ul', { class: 'studio-l' }, E.cases.map(function (x, i) { return h('li', null, [document.createTextNode(x.name + ' '), mini('بازکردن', function () { var keep = S.e.cases; S.e = ENG().merge(ENG().defaults(), JSON.parse(JSON.stringify(x.e))); S.e.cases = keep; ctx.rerender(); }), mini('×', function () { S.e.cases.splice(i, 1); ctx.rerender(); }, 'حذف')]); })) : h('p', { class: 'muted', text: 'هنوز بررسی‌ای ذخیره نشده است.' });
    // results
    var A = R.A, mx = Math.max.apply(null, Object.keys(A).map(function (k) { return A[k]; })) || 1;
    var bars = h('div', { class: 'se-bars' }, R.ranked.filter(function (k) { return A[k] > 0; }).slice(0, 6).map(function (k) { return h('div', { class: 'se-bar' }, [h('span', { class: 'small', text: B().ARCH[k][0] }), h('span', { class: 'se-bar-t' }, [h('span', { class: 'se-bar-f' + (k === R.main ? ' main' : ''), style: 'width:' + Math.round(A[k] / mx * 100) + '%' })]), h('span', { class: 'num small', text: A[k].toFixed(1) })]); }));
    var sig = R.sigList.length ? table(['نشانه', 'شدت', 'شاهد'], R.sigList.map(function (s) { return [s.fa, ['', 'کم', 'متوسط', 'زیاد'][s.sev], s.ev.join('؛ ') + (Object.keys(R.prov).length ? '' : '')]; })) : h('p', { class: 'muted', text: 'نشانه‌ای فعال نشد.' });
    var sum = h('div', { class: 'f-help' }, [h('p', null, [h('strong', { text: R.insufficient ? 'اطلاعات کافی نیست — پیشنهادی صادر نمی‌شود.' : 'مسئلهٔ اصلی: ' + B().ARCH[R.main][0] })]),
      h('p', { text: 'حالت: ' + MODE[R.mode] + (E.mode === 'auto' ? ' (خودکار)' : '') + ' · مسئلهٔ دوم: ' + (R.second ? B().ARCH[R.second][0] : '—') + ' · دادهٔ کلیدی معلوم: ' + fa(R.nk) + ' مورد' + (R.used.length ? ' · ' + fa(R.used.length) + ' مورد از متن' : '') }),
      R.insufficient ? h('p', { text: 'دست‌کم چهار مورد کلیدی (هدف، رشد بازار، جایگاه، روند حاشیه، نقدینگی…) یا متن شرکت لازم است.' }) : null]);
    return ctx.group([ctx.panel('تشخیص مسئله و ورودی هوشمند', [sum, h('div', { class: 'row-ctl' }, [scSel, load, clr]), modeF.el || modeF]),
      ctx.panel('ورودی متنی شرکت (موتور ۱)', [h('p', { class: 'f-help', text: 'موتور از متن، واقعیت‌ها را با جملهٔ شاهد استخراج می‌کند و فقط در خانه‌های خالی فرم به کار می‌برد. استخراج قاعده‌محور است و تأیید شما لازم است.' }), ta, h('div', { class: 'row-ctl' }, [go, commit]), xt]),
      ctx.two(ctx.panel('نتیجهٔ تشخیص — امتیاز مسائل', [bars]), ctx.panel('نشانه‌های فعال و شواهد', [sig])),
      R.gaps.length ? ctx.panel('اطلاعات «نیازمند بررسی» (برای چارچوب‌های منتخب)', [h('p', { class: 'f-help', text: R.gaps.join('، ') + '. تا تکمیل نشده، نتایج مربوط با اطمینان کمتر و بدون عدد فرضی ارائه می‌شود.' })]) : null,
      ctx.two(ctx.panel('بخش ۱', [s1.el || s1]), ctx.panel('بخش ۲', [s2.el || s2])), ctx.two(ctx.panel('بخش ۳', [s3.el || s3]), ctx.panel('بخش ۴', [s4.el || s4])),
      ctx.panel('منابع و قابلیت‌های راهبردی (برای VRIO و فرصت‌های پنهان)', [res]), ctx.panel('واحدهای کسب‌وکار / شرکت‌های تابعه (برای ماتریس پرتفوی)', [units]),
      ctx.panel('ذخیره و ادامهٔ بررسی', [h('div', { class: 'row-ctl' }, [cn, save]), cases])]);
  }

  /* ---------- 2 · frameworks bank ---------- */
  var FWF = [['fa', 'نام'], ['en', 'نام انگلیسی'], ['fam', 'خانواده'], ['role', 'نقش'], ['lvl', 'سطح تصمیم'], ['src', 'منبع اصلی'], ['q', 'پرسشی که پاسخ می‌دهد'], ['rel', 'مسائل مناسب'], ['not', 'زمانی که مناسب نیست'], ['in', 'ورودی‌های لازم'], ['out', 'خروجی‌ها'], ['stp', 'مراحل اجرا'], ['iran', 'تطبیق با بازار ایران'], ['pit', 'خطاهای رایج'], ['cmb', 'ترکیب‌پذیری'], ['eff', 'زمان و داده'], ['tool', 'ابزار مرتبط در هاب']];
  function fwVal(f, k) { var v = f[k]; if (k === 'fam') return B().FAM[v]; if (k === 'role') return B().ROLE[v]; if (k === 'rel') return Object.keys(v).sort(function (a, b) { return v[b] - v[a]; }).map(function (a) { return B().ARCH[a][0] + ' (' + fa(v[a]) + ')'; }).join('؛ '); if (k === 'in') return v.map(function (x) { return B().KEYS[x]; }).join('، '); if (k === 'cmb') return v.map(function (x) { return B().fw(x).fa; }).join('، '); if (k === 'tool') return v ? { 'five-forces': 'Five Forces', kernel: 'Strategy Kernel', 'blue-ocean': 'Blue Ocean', 'playing-to-win': 'Playing to Win' }[v] : '—'; return Array.isArray(v) ? v.join(' ← ') : v; }
  function fwProfile(f) { return h('dl', { class: 'rm-dl' }, [].concat.apply([], FWF.map(function (x) { return [h('dt', { text: x[1] }), h('dd', { text: fwVal(f, x[0]) })]; })).concat([h('dt', { text: 'آخرین بازبینی' }), h('dd', { text: B().REVIEWED })])); }
  function fwTab(ctx) {
    var S = ctx.S, E = ensure(S), R = ctx.R.X, ov = E.over;
    var sel = R.FS.sel.length ? table(['چارچوب', 'نقش', 'چرا انتخاب شد', 'پوشش داده'], R.FS.sel.map(function (r) { return [r.f.fa, B().ROLE[r.f.role], r.why, Math.round(r.cov.share * 100) + '٪']; })) : h('p', { class: 'muted', text: 'چارچوبی انتخاب نشد.' });
    var rows = R.FS.rows.slice().sort(function (a, b) { return (b.sel - a.sel) || b.score - a.score; });
    var t = h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, ['چارچوب', 'خانواده', 'وضعیت', 'دلیل', 'امتیاز تناسب', 'اقدام'].map(function (x) { return h('th', { class: 'lbl', text: x }); }))]),
      h('tbody', null, [].concat.apply([], rows.map(function (r) {
        var pin = ov.fwPin.indexOf(r.f.id) >= 0, ex = ov.fwEx.indexOf(r.f.id) >= 0;
        return [h('tr', { class: r.sel ? '' : 'fit-no' }, [h('td', null, [h('strong', { text: r.f.fa }), h('div', { class: 'small muted', text: r.f.en })]), h('td', { class: 'small', text: B().FAM[r.f.fam] }), h('td', null, [h('span', { class: 'sev ' + (r.sel ? 'fit-rec' : 'sev-info'), text: r.sel ? 'منتخب' : 'اجرا نشد' })]), h('td', { class: 'small', style: 'white-space:normal', text: r.why }), h('td', { class: 'num', text: r.score.toFixed(1) }),
          h('td', null, [mini(pin ? 'لغو سنجاق' : 'سنجاق', function () { toggle(ov.fwPin, r.f.id); ctx.rerender(); }, 'همیشه اجرا شود'), mini(ex ? 'بازگردان' : 'کنار بگذار', function () { toggle(ov.fwEx, r.f.id); ctx.rerender(); })])]),
          h('tr', { class: 'detail-row' }, [h('td', { colspan: '6', style: 'white-space:normal' }, [h('details', null, [h('summary', { text: 'پروفایل استاندارد چارچوب' }), fwProfile(r.f)])])])];
      })))])]);
    return ctx.group([ctx.panel('چارچوب‌های منتخب برای این مسئله — ' + fa(R.FS.sel.length) + ' از ' + fa(B().FW.length), [h('p', { class: 'f-help', text: 'انتخاب بر پایهٔ ارتباط با مسئلهٔ اصلی و دوم، نقش (تشخیص، انتخاب، اجرا)، پوشش داده و معماری راهبرد منتخب است. هیچ چارچوبی صرفاً به‌دلیل شهرت اجرا نمی‌شود. با «سنجاق» و «کنار بگذار» انتخاب را خودتان اصلاح کنید.' }), sel]),
      ctx.panel('بانک چارچوب‌های راهبردی (۲۵ چارچوب با پروفایل استاندارد)', [t])]);
  }

  /* ---------- 3 · analyses ---------- */
  function anaView(a) {
    var o = a.out, tool = a.f.tool;
    return h('div', { class: 'rm-phase', style: 'padding:12px 14px' }, [h('p', null, [h('strong', { text: a.f.fa }), document.createTextNode(' · ' + B().ROLE[a.f.role] + ' · پوشش داده ' + Math.round(a.cov * 100) + '٪')]), h('p', { class: 'f-help', text: 'پرسش: ' + a.f.q }),
      h('p', null, [h('strong', { text: 'نتیجه: ' }), document.createTextNode(o.v)]), o.rows && o.rows.length ? table(o.head || ['مورد', 'ارزیابی'], o.rows) : null,
      o.impl && o.impl.length ? h('div', null, [h('h3', { text: 'پیامد برای راهبرد' }), list(o.impl)]) : null,
      o.gaps && o.gaps.length ? h('p', { class: 'f-help', text: 'نیازمند بررسی: ' + o.gaps.join('، ') }) : null,
      tool ? h('p', { class: 'small muted', text: 'کاربرگ کامل این چارچوب در ابزار «' + fwVal(a.f, 'tool') + '» همین بخش؛ دکمهٔ «ارسال به ابزارها» خروجی را منتقل می‌کند.' }) : null,
      h('p', { class: 'small muted', text: 'منبع: ' + a.f.src })]);
  }
  function push(R) {
    var n = 0, Ef = R.Ef, st = U.store;
    if (Hub.tools.fiveForces) { var f = st.get('hub.ff.v1', null) || Hub.tools.fiveForces.sample(); var idm = { entry: 'entrants', subs: 'substitutes' }; ENG().forces(Ef).forEach(function (x) { var id = idm[x.id] || x.id; if (isFinite(x.v) && f.forces[id]) { f.forces[id].scores.base = x.v; f.forces[id].evidence = x.basis; } }); f.meta.industry = Ef.co.industry || f.meta.industry; st.set('hub.ff.v1', f); n++; }
    var k = R.analyses.filter(function (a) { return a.f.id === 'kernel'; })[0], Am = R.Am;
    if (Hub.tools.kernel && Am) { var k2 = st.get('hub.kernel.v1', null) || Hub.tools.kernel.sample(); k2.diagnosis = B().ARCH[R.main][0] + ' — ' + R.sigList.slice(0, 3).map(function (s) { return s.fa; }).join('، '); k2.policy = Am.a.policy; k2.actions = Am.picks.map(function (p) { return { action: p.r.s.fa, linked: true, owner: p.r.s.own, resources: '' }; }); k2.meta.title = Ef.co.name || k2.meta.title; st.set('hub.kernel.v1', k2); n++; }
    var b = R.analyses.filter(function (a) { return a.f.id === 'blue'; })[0];
    if (Hub.tools.blueOcean && b) { var b2 = st.get('hub.blue.v1', null) || Hub.tools.blueOcean.sample(); ['eliminate', 'reduce', 'raise', 'create'].forEach(function (key, i) { b2.errc[key] = b.out.rows[i][1]; }); st.set('hub.blue.v1', b2); n++; }
    var p = R.analyses.filter(function (a) { return a.f.id === 'ptw'; })[0];
    if (Hub.tools.ptw && p) { var p2 = st.get('hub.ptw.v1', null) || Hub.tools.ptw.sample(); var rr = p.out.rows; p2.cascade = { aspiration: rr[0][1], where: rr[1][1], how: rr[2][1], capabilities: rr[3][1], systems: rr[4][1] }; p2.wmbt = String(rr[5][1]).split('؛ ').filter(function (x) { return x && x !== '—'; }).map(function (w) { return { condition: w, test: '', status: 'untested' }; }); st.set('hub.ptw.v1', p2); n++; }
    return n;
  }
  function toStudio(R) {
    var st = U.store, s = st.get('hub.studio.v1', null) || (Hub.tools.studio && Hub.tools.studio.sample()); if (!s) return false; var Ef = R.Ef;
    Object.keys(s.profile).forEach(function (k) { s.profile[k] = ''; });
    s.profile.company = (Ef.co.name || '') + (Ef.co.industry ? ' — ' + Ef.co.industry : ''); s.profile.industry = Ef.co.industry || ''; s.profile.objectives = (Ef.co.target || ENG().goalFa(Ef.co.goal)); s.profile.question = Ef.co.question || '';
    s.profile.notes = (Ef.text || '') + '\n\nنشانه‌های تشخیص موتور: ' + R.sigList.map(function (x) { return x.fa + ' (' + x.ev[0] + ')'; }).join('؛ ');
    s.profile.capabilities = (Ef.res || []).filter(function (r) { return r.name; }).map(function (r) { return r.name; }).join('، '); s.profile.constraints = Ef.cons.redLines || ''; s.results = {}; s.conclusion = null; st.set('hub.studio.v1', s); return true;
  }
  function anaTab(ctx) {
    var R = ctx.R.X;
    var pb = h('button', { class: 'btn', type: 'button', text: 'ارسال به ابزارهای Five Forces، Kernel، Blue Ocean و Playing to Win', onclick: function () { var n = push(R); U.toast(n + ' ابزار به‌روز شد.', 'good'); } });
    var sb = h('button', { class: 'btn', type: 'button', text: 'ارسال متن و تشخیص به «استودیوی راهبرد» (تحلیل متنی با هوش مصنوعی یا موتور محلی)', onclick: function () { U.toast(toStudio(R) ? 'پروفایل استودیو جایگزین شد؛ در ابزار استودیو «Analyse» را بزنید.' : 'ابزار استودیو در دسترس نیست.', 'good'); } });
    return ctx.group([ctx.panel('تحلیل با چارچوب‌های منتخب — ' + fa(R.analyses.length) + ' چارچوب', [h('p', { class: 'f-help', text: 'هر تحلیل فقط از ورودی‌های شما و نتایج موتور ساخته می‌شود؛ هر جا داده نیست «نیازمند بررسی» آمده است و عدد فرضی جایگزین نشده.' }), h('div', { class: 'row-ctl' }, [pb, sb])].concat(R.analyses.length ? R.analyses.map(anaView) : [h('p', { class: 'muted', text: 'تحلیلی اجرا نشد.' })]))]);
  }

  /* ---------- 4 · architecture ---------- */
  function svgEl(t, a, txt) { var e = document.createElementNS('http://www.w3.org/2000/svg', t); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt != null) e.textContent = txt; return e; }
  function wrapTxt(s, n) { var w = String(s).split(' '), lines = [''], i; for (i = 0; i < w.length; i++) { if ((lines[lines.length - 1] + ' ' + w[i]).trim().length > n && lines[lines.length - 1]) lines.push(w[i]); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w[i]).trim(); } return lines.slice(0, 3); }
  function box(svg, x, y, w, hh, title, lines, accent) {
    svg.appendChild(svgEl('rect', { x: x, y: y, width: w, height: hh, rx: 7, fill: 'var(--panel-2, #152027)', stroke: accent ? 'var(--accent, #d9a54e)' : 'currentColor', 'stroke-opacity': accent ? '1' : '0.35', 'stroke-width': '1.3' }));
    if (title) svg.appendChild(svgEl('text', { x: x + w / 2, y: y + 17, 'text-anchor': 'middle', 'font-size': '11', fill: 'var(--accent, #d9a54e)', direction: 'rtl' }, title));
    (lines || []).forEach(function (l, i) { svg.appendChild(svgEl('text', { x: x + w / 2, y: y + (title ? 35 : 22) + i * 16, 'text-anchor': 'middle', 'font-size': '12.5', fill: 'currentColor', direction: 'rtl' }, l)); });
  }
  function archDiagram(R) {
    var Am = R.Am; if (!Am) return null;
    var W = 1040, n = Am.picks.length, cw = (W - 40) / Math.max(n, 1), H = 480, svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, style: 'display:block;width:100%;max-width:100%;height:auto', role: 'img', 'aria-label': 'نمودار معماری راهبرد' });
    svg.appendChild(svgEl('defs')).appendChild(svgEl('marker', { id: 'se-arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' })).appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'currentColor', 'fill-opacity': '0.6' }));
    var ln = function (x1, y1, x2, y2) { svg.appendChild(svgEl('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: 'currentColor', 'stroke-opacity': '0.5', 'stroke-width': '1.3', 'marker-end': 'url(#se-arr)' })); };
    box(svg, 20, 10, W - 40, 58, 'تشخیص', wrapTxt(B().ARCH[R.main][0] + ' — ' + R.sigList.slice(0, 3).map(function (s) { return s.fa; }).join('، '), 120), false);
    box(svg, 20, 92, W - 40, 74, 'سیاست راهنما — ' + Am.a.fa, wrapTxt(Am.a.policy, 120), true);
    ln(W / 2, 68, W / 2, 92);
    Am.picks.forEach(function (p, i) {
      var x = W - 20 - (i + 1) * cw + 8, w = cw - 16;
      ln(x + w / 2, 166, x + w / 2, 194);
      box(svg, x, 194, w, 96, 'رکن ' + fa(i + 1) + ': ' + p.pillar, wrapTxt(p.r.s.fa, Math.floor(w / 8.5)).concat([(LABEL[p.r.label] || [''])[0] + ' — امتیاز ' + fa(p.r.sc.total.toFixed(0))]), i === 0);
      if (p.next) { ln(x + w / 2, 290, x + w / 2, 312); box(svg, x, 312, w, 60, 'مرحلهٔ بعد', wrapTxt(p.next.s.fa, Math.floor(w / 8.5)).slice(0, 2), false); }
    });
    var ey = Am.picks.some(function (p) { return p.next; }) ? 392 : 314;
    box(svg, 20, ey, W - 40, 40, null, ['توانمندساز: ' + (Am.en ? Am.en.r.s.fa : '—') + ' · شاخص‌ها: ' + Am.picks.map(function (p) { return p.r.s.kpi[0]; }).join('، ')], false);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (ey + 52));
    return h('div', { class: 'grid-wrap', style: 'color:var(--fg);min-width:0;max-width:100%' }, [svg]);
  }
  function archView(R, A, full) {
    return h('div', { class: 'rm-phase', style: 'padding:12px 14px' }, [h('p', null, [h('strong', { text: A.a.fa + ' · امتیاز ' + A.score }), document.createTextNode(' '), chip(A.label), A.definitive ? h('span', { class: 'sev fit-rec', style: 'margin-inline-start:6px', text: 'قطعی' }) : null]),
      h('p', { class: 'f-help', text: 'سیاست راهنما: ' + A.a.policy }), h('p', { class: 'small', text: 'چارچوب‌های پشتیبان: ' + A.a.fw.map(function (id) { return B().fw(id).fa; }).join('، ') }),
      table(['رکن', 'حرکت انتخاب‌شده', 'وضعیت', 'امکان اقتصادی', 'امکان اجرایی', 'مرحلهٔ بعد'], A.picks.map(function (p) { return [p.pillar, p.r.s.fa, chip(p.r.label), fa(p.r.sc.econ), fa(p.r.sc.execS), p.next ? p.next.s.fa + ' (پس از ساخت قابلیت)' : '—']; }).concat(A.en ? [['توانمندساز', A.en.r.s.fa, chip(A.en.r.label), fa(A.en.r.sc.econ), fa(A.en.r.sc.execS), '—']] : [])),
      A.empty.length ? h('p', { class: 'f-help', text: 'رکن‌های بدون گزینه: ' + A.empty.map(function (e) { return e.pillar + ' — ' + e.why; }).join('؛ ') }) : null, full ? archDiagram(R) : null]);
  }
  function archTab(ctx) {
    var R = ctx.R.X;
    if (R.insufficient || !R.Am) return ctx.group([ctx.panel('معماری راهبرد', [h('p', { class: 'muted', text: 'اطلاعات کافی برای طراحی معماری نیست؛ زبانهٔ تشخیص را تکمیل کنید.' })])]);
    var others = R.act.filter(function (a) { return a !== R.Am; });
    return ctx.group([ctx.panel('معماری راهبرد پیشنهادی (موتور ۳)', [h('p', { class: 'f-help', text: 'تشخیص ← سیاست راهنما ← رکن‌ها ← توانمندساز. در هر رکن حرکتی انتخاب می‌شود که هم مسئله را حل کند و هم اجرایی باشد؛ حرکت ارزشمند ولی دشوار به «مرحلهٔ بعد» منتقل می‌شود (مرحله‌بندی الماس راهبرد).' }), archView(R, R.Am, true)]),
      ctx.panel('معماری‌های جایگزین فعال', others.length ? others.slice(0, 3).map(function (a) { return archView(R, a, false); }) : [h('p', { class: 'muted', text: 'معماری جایگزین فعالی نیست.' })]),
      ctx.panel('نقشهٔ راه اجرایی', [roadmapTable(R)])]);
  }
  function roadmapTable(R) { var rm = R.REC.roadmap || []; return rm.length ? table(['فاز', 'اقدام', 'ماه', 'مسئول', 'پیش‌نیاز', 'شاخص'], rm.map(function (s) { return [s.ph, s.step, fa(s.from) + ' تا ' + fa(s.to), s.own, (s.pre || []).join('؛ ') || '—', s.kpi]; })) : h('p', { class: 'muted', text: '—' }); }

  /* ---------- 5 · solutions & ranking ---------- */
  var SFLD = [['d', 'شرح'], ['typ', 'سطح'], ['pil', 'خانوادهٔ رکن'], ['ec', 'سازوکار اقتصادی'], ['pre', 'پیش‌نیازها'], ['stp', 'مراحل اجرا'], ['kpi', 'شاخص‌ها'], ['own', 'مسئول پیشنهادی'], ['risks', 'ریسک‌ها'], ['iran', 'ملاحظات بازار ایران'], ['not', 'شرایط عدم توصیه'], ['fw', 'چارچوب‌های پشتیبان'], ['law', 'مستندات مقرراتی'], ['tm', 'مدت اجرا'], ['H', 'افق']];
  var FLAG = { v: 'تطبیق‌شده با منبع رسمی (آبان ۱۴۰۵)', n: 'نیازمند استعلام ماده، تاریخ و آخرین اصلاحیه', p: 'رویهٔ بازار' };
  function solProfile(s) { return h('dl', { class: 'rm-dl' }, [].concat.apply([], SFLD.map(function (x) { var v = s[x[0]]; var t = x[0] === 'pil' ? B().PIL[v] : x[0] === 'fw' ? v.map(function (id) { return B().fw(id).fa; }).join('، ') : x[0] === 'law' ? (v || []).map(function (l) { return l[0] + ' [' + FLAG[l[1]] + ']'; }).join(' | ') || '—' : x[0] === 'tm' ? fa(v[0]) + ' تا ' + fa(v[1]) + ' ماه' : x[0] === 'H' ? 'افق ' + fa(v) : Array.isArray(v) ? v.join('؛ ') : v; return [h('dt', { text: x[1] }), h('dd', { text: t || '—' })]; }))); }
  function solTab(ctx) {
    var S = ctx.S, E = ensure(S), R = ctx.R.X, ov = E.over;
    var items = R.R.list.filter(function (r) { return r.label !== 'na' || ov.pin.indexOf(r.id) >= 0; }).sort(function (a, b) { return b.sc.total - a.sc.total; });
    var t = h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, ['#', 'راهکار', 'وضعیت', 'جایگاه', 'کل', 'تناسب', 'اثر', 'اجراپذیری', 'ریسک', 'زمان', 'پایداری', 'اقتصادی', 'اجرایی', ''].map(function (x, i) { return h('th', { class: i >= 4 && i <= 12 ? 'num' : 'lbl', text: x }); }))]),
      h('tbody', null, [].concat.apply([], items.map(function (r, i) { var s = r.sc, pin = ov.pin.indexOf(r.id) >= 0, ex = ov.ex.indexOf(r.id) >= 0;
        return [h('tr', { class: r.label === 'excluded' ? 'fit-no' : '' }, [h('td', { text: fa(i + 1) }), h('td', null, [h('strong', { text: r.s.fa }), h('div', { class: 'small muted', text: B().PIL[r.s.pil] + (r.definitive ? ' · قطعی' : '') + (pin ? ' · سنجاق‌شده' : '') })]), h('td', null, [chip(r.label)]), h('td', { class: 'small', text: r.quad }),
          h('td', { class: 'num' }, [h('strong', { text: s.total.toFixed(1) })])].concat(['fit', 'impact', 'feas', 'risk', 'time', 'moat', 'econ', 'execS'].map(function (k) { return h('td', { class: 'num', text: String(s[k]) }); })).concat([h('td', null, [mini(pin ? 'لغو سنجاق' : 'سنجاق', function () { toggle(ov.pin, r.id); ctx.rerender(); }), mini(ex ? 'بازگردان' : 'حذف', function () { toggle(ov.ex, r.id); ctx.rerender(); })])])),
          h('tr', { class: 'detail-row' }, [h('td', { colspan: '14', style: 'white-space:normal' }, [h('details', null, [h('summary', { text: 'جزئیات: شرایط اجرا، توضیح امتیاز، اثر مالی و پروفایل' }),
            h('h3', { text: 'شرایط اجرا (امکان اجرایی)' }), list(r.gates.length ? r.gates.map(function (g) { return { pass: '✓ ', fail: '✗ ', unk: '؟ ', conflict: '⛔ ' }[g.r] + g.n + ' — ' + { pass: 'برقرار', fail: 'برقرار نیست', unk: 'نیازمند بررسی', conflict: 'تعارض با محدودیت قطعی' }[g.r] + (g.note ? ' (' + g.note + ')' : ''); }) : ['شرط اجرایی خاصی ندارد']),
            h('h3', { text: 'توضیح امتیاز' }), list(['تناسب: ' + s.why.fit.join(''), 'اثر: ' + s.why.impact.join(''), 'اجراپذیری: ' + s.why.feas.join(''), 'ریسک: ' + s.why.risk.join(''), 'زمان: ' + s.why.time.join(''), 'پایداری: ' + s.why.moat.join('')]),
            h('h3', { text: 'اثر مالی (فقط با فرض‌های شما)' }), h('p', { class: 'f-help', text: r.q && isFinite(r.q.dEbitda) ? 'اثر سالانه بر EBITDA ≈ ' + U.fmtNum(r.q.dEbitda) + ' = ' + r.q.f + (r.q.note ? ' · ' + r.q.note : '') : r.q && r.q.note ? r.q.note : 'فرضی وارد نشده؛ در جدول «فرض‌های اثر مالی» پایین همین زبانه وارد کنید.' }),
            h('h3', { text: 'پروفایل راهکار' }), solProfile(r.s)])])])]; })))])]);
    var wf = G.form({ id: 'se-w', onChange: ctx.rerender, fields: [['feas', 'اجراپذیری'], ['fit', 'تناسب با مسئله'], ['impact', 'اثر اقتصادی'], ['risk', 'ریسک (معکوس)'], ['time', 'زمان تا اثر'], ['moat', 'حفظ مزیت رقابتی']].map(function (w) { return ctx.field('w' + w[0], w[1] + ' (وزن)', 'e.W.' + w[0], 'dec', { unit: '٪' }); }) });
    var top = items.filter(function (r) { return r.label !== 'excluded'; }).slice(0, 8);
    top.forEach(function (r) { if (!E.up[r.id]) E.up[r.id] = { rev: null, margin: null }; });
    var up = h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid se' }, [h('thead', null, [h('tr', null, ['راهکار', 'رشد فرضی فروش (٪)', 'بهبود فرضی حاشیهٔ EBITDA (واحد درصد)', 'اثر سالانه بر EBITDA'].map(function (x) { return h('th', { class: 'lbl', text: x }); }))]),
      h('tbody', null, top.map(function (r) { var u = E.up[r.id], inp = function (k) { var i = h('input', { class: 'f-text', type: 'text', inputmode: 'decimal', placeholder: 'نامشخص', 'aria-label': r.s.fa + ' ' + k, value: u[k] == null ? '' : String(Math.round(u[k] * 10000) / 100) }); i.addEventListener('change', function () { var v = String(i.value).trim(); u[k] = v === '' ? null : Number(v.replace(/[٫,]/g, '.')) / 100; ctx.rerender(); }); return i; };
        return h('tr', null, [h('td', { text: r.s.fa }), h('td', null, [inp('rev')]), h('td', null, [inp('margin')]), h('td', { class: 'num', text: r.q && isFinite(r.q.dEbitda) ? U.fmtNum(r.q.dEbitda) : '—' })]); }))])]);
    var cmp = E.cases.length ? table(['بررسی', 'حالت', 'مسئلهٔ اصلی', 'معماری', 'حرکت اصلی', 'جایگزین'], E.cases.map(function (cs) { var r = ENG().run(cs.e); return [cs.name, MODE[r.mode], B().ARCH[r.main][0], r.Am ? r.Am.a.fa : '—', r.REC.main ? r.REC.main.r.s.fa : '—', r.REC.alt ? r.REC.alt.s.fa : '—']; })) : h('p', { class: 'muted', text: 'برای مقایسه، در زبانهٔ تشخیص بررسی‌ها را ذخیره کنید.' });
    return ctx.group([ctx.panel('راه‌حل‌ها، رتبه‌بندی و امکان‌سنجی (موتور ۴)', [h('p', { class: 'f-help', text: 'امکان اقتصادی (تناسب، اثر، پایداری) جدا از امکان اجرایی (شرایط اجرا، ریسک، زمان) سنجیده می‌شود. «قطعی» یعنی همهٔ شرایط اجرا احراز شده و تناسب کافی است؛ نامشخص هرگز امتیاز مثبت نمی‌گیرد؛ تعارض با محدودیت قطعی شما = حذف.' }), t]),
      ctx.two(ctx.panel('وزن معیارها', [wf.el || wf]), ctx.panel('فرض‌های اثر مالی (ورودی شما — پیش‌فرض ندارد)', [h('p', { class: 'f-help', text: 'اثر = فروش × رشد فرضی × حاشیهٔ EBITDA فعلی + فروش جدید × بهبود فرضی حاشیه. فروش و حاشیه در بخش ۳ تشخیص.' }), up])),
      ctx.panel('حساسیت رتبه‌بندی به وزن‌ها', [sensTable(R)]), ctx.panel('مقایسهٔ بررسی‌های ذخیره‌شده', [cmp])]);
  }
  function sensTable(R) { return table(['پروفایل وزن', 'معماری برتر', 'حرکت اصلی', 'سه راهکار برتر'], R.sens.map(function (s) { return [s.fa, s.arch, s.mainPick, s.top.join('؛ ')]; })); }

  /* ---------- 6 · opportunities ---------- */
  function oppTab(ctx) {
    var R = ctx.R.X;
    return ctx.group([ctx.panel('فرصت‌ها و تهدیدهای پنهان راهبردی (موتور ۵)', [R.O.length ? table(['فرصت / تهدید', 'شاهد', 'راهکارهای مرتبط'], R.O.map(function (o) { return [o.t, o.ev, o.sol.map(function (id) { return B().sol(id).fa; }).join('، ') || '—']; })) : h('p', { class: 'muted', text: 'با داده‌های فعلی فرصت پنهانی شناسایی نشد. منابع و قابلیت‌ها را با وضع استفاده ثبت کنید.' }),
      h('p', { class: 'f-help', text: 'دارایی‌های فیزیکی بلااستفاده را برای مولدسازی (فروش و اجارهٔ مجدد، صندوق، مشارکت در ساخت) در موتور «راه‌حل‌های تأمین مالی» هاب بررسی کنید.' })])]);
  }

  /* ---------- 7 · board report ---------- */
  function reportBody(R, E) {
    var sec = function (t, kids) { return h('section', { class: 'rep-sec' }, [h('h2', { text: t })].concat(kids)); }, Ef = R.Ef, Am = R.Am, REC = R.REC;
    if (R.insufficient) return h('div', { class: 'print-report rep' }, [h('h1', { text: 'گزارش راهبرد — ' + (Ef.co.name || 'شرکت') }), h('p', { text: 'اطلاعات کافی برای صدور توصیه نیست. دست‌کم هدف، وضعیت بازار، جایگاه رقابتی و وضع مالی یا متن شرکت را وارد کنید.' })]);
    var main = REC.main, risks = Am ? [].concat.apply([], Am.picks.map(function (p) { return p.r.s.risks.map(function (x) { return x + ' (' + p.r.s.fa + ')'; }); })) : [];
    return h('div', { class: 'print-report rep' }, [
      h('h1', { text: 'گزارش راهبرد کسب‌وکار و راه‌حل‌ها — ' + (Ef.co.name || 'شرکت') }), h('p', { class: 'muted', text: 'موتور قاعده‌محور هاب · ' + new Date().toLocaleDateString('fa-IR') + ' · پیش‌نویس برای داوری مشاور و تصمیم هیئت‌مدیره؛ عدد فرضی تولید نشده و موارد «نیازمند بررسی» مشخص است.' }),
      sec('۱. خلاصهٔ مدیریتی', [list(['مسئلهٔ اصلی: ' + B().ARCH[R.main][0] + (R.second ? ' · مسئلهٔ دوم: ' + B().ARCH[R.second][0] : ''), 'معماری پیشنهادی: ' + (Am ? Am.a.fa + ' (' + LABEL[Am.label][0] + (Am.definitive ? '، قطعی' : '') + ')' : '—'), 'سیاست راهنما: ' + (Am ? Am.a.policy : '—'), 'حرکت اصلی: ' + (main ? main.r.s.fa + ' · ' + LABEL[main.r.label][0] : '—') + ' · جایگزین: ' + (REC.alt ? REC.alt.s.fa : '—') + ' · مکمل: ' + (REC.comp ? REC.comp.s.fa : '—'), 'مهم‌ترین فرصت‌ها: ' + (R.O.slice(0, 3).map(function (o) { return o.t; }).join('؛ ') || '—'), 'پایداری توصیه: معماری برتر در ' + fa(R.sens.filter(function (s) { return Am && s.arch === Am.a.fa; }).length) + ' از ' + fa(R.sens.length) + ' پروفایل وزن ثابت ماند.'])]),
      sec('۲. تشخیص مسئلهٔ اصلی و وضعیت فعلی', [h('p', { text: 'حالت: ' + MODE[R.mode] + '.' }), table(['نشانه', 'شاهد'], R.sigList.slice(0, 10).map(function (s) { return [s.fa, s.ev.join('؛ ')]; })), R.gaps.length ? h('p', { class: 'f-help', text: 'نیازمند بررسی: ' + R.gaps.join('، ') }) : null]),
      sec('۳. تحلیل‌ها با چارچوب‌های منتخب', R.analyses.map(function (a) { return h('div', null, [h('p', null, [h('strong', { text: a.f.fa + ': ' }), document.createTextNode(a.out.v)]), h('p', { class: 'small muted', text: 'چرا این چارچوب: ' + a.why }), a.out.rows && a.out.rows.length ? table(a.out.head || ['مورد', 'ارزیابی'], a.out.rows) : null]); })),
      sec('۴. فرصت‌های شناسایی‌شده', [R.O.length ? list(R.O.map(function (o) { return o.t + ' — ' + o.ev; })) : h('p', { class: 'muted', text: 'موردی شناسایی نشد.' })]),
      sec('۵. راه‌حل‌های پیشنهادی', [table(['نقش', 'راهکار', 'وضعیت', 'امکان اقتصادی', 'امکان اجرایی', 'شرح'], [['اصلی', main], ['جایگزین', REC.alt ? { r: REC.alt } : null], ['مکمل', REC.comp ? { r: REC.comp } : null]].filter(function (x) { return x[1]; }).map(function (x) { var r = x[1].r; return [x[0], r.s.fa, LABEL[r.label][0] + (r.definitive ? ' · قطعی' : ''), fa(r.sc.econ), fa(r.sc.execS), r.s.d]; }))]),
      sec('۶. معماری راهبردی و نمودار ساختار', Am ? [archView(R, Am, true)] : []),
      sec('۷. نقشهٔ راه اجرایی', [roadmapTable(R)]),
      sec('۸. تحلیل ریسک و حساسیت', [h('h3', { text: 'ریسک‌های اجرایی' }), list(risks.slice(0, 8)), h('h3', { text: 'حساسیت به وزن معیارها' }), sensTable(R), h('h3', { text: 'حساسیت به شرایط نامشخص' }), R.flips.length ? list(R.flips.map(function (f) { return 'اگر «' + f.gate + '» برقرار نباشد: «' + f.sol + '» مسدود و جایگزین آن «' + f.then + '»'; })) : h('p', { class: 'muted', text: 'حرکت‌های معماری شرط نامشخصی ندارند.' })]),
      E && E.combo ? comboAppendix(R, E, sec) : null,
      sec('۹. توصیهٔ نهایی مشاور', [h('p', { text: Am ? 'توصیه: معماری «' + Am.a.fa + '» با حرکت اصلی «' + (main ? main.r.s.fa : '—') + '»' + (REC.comp ? ' و توانمندساز «' + REC.comp.s.fa + '»' : '') + '. ' + (Am.definitive ? 'همهٔ حرکت‌ها شرایط اجرا را احراز کرده‌اند.' : 'دست‌کم یک حرکت مشروط است؛ پیش از تعهد، شرایط «نیازمند بررسی» احراز شود.') + (REC.altArch ? ' اگر شرایط احراز نشد، معماری جایگزین: «' + REC.altArch.a.fa + '».' : '') : 'معماری فعالی یافت نشد.' }),
        h('p', { class: 'f-help', text: 'آنچه موتور تصمیم نمی‌گیرد: انتخاب نهایی میان گزینه‌ها، اهداف عددی، قیمت‌گذاری، ارزش‌گذاری معاملات و روابط با ذی‌نفعان. موارد «نیازمند استعلام» مقرراتی پیش از اجرا از مرجع رسمی کنترل شود.' })])]);
  }
  function comboAppendix(R, E, sec) {
    var V = evalTools(R, E); if (!V.keys.length) return null;
    return sec('پیوست بخش ۸ — ارزیابی جداگانه و ترکیبی ابزارهای راهبرد', [h('p', { text: V.verdict }), table(['جزء', 'نتیجه'], V.synth), V.iss.length ? table(['سطح', 'یافته'], V.iss.map(function (x) { return [LV[x.lvl][0], x.t]; })) : null]);
  }
  function aiPrompt(R) {
    var Ef = R.Ef;
    return ['You are a senior strategy adviser preparing a board paper. Use ONLY the facts and engine outputs below; label every inference as an assumption; invent no numbers; write in Persian; keep JSON keys in English.',
      'Challenge the engine where the facts do not support it. Return ONE JSON object: {"executiveSummary":"...","challengesToEngine":["..."],"refinedArchitecture":{"guidingPolicy":"...","pillars":[{"pillar":"...","move":"...","why":"..."}]},"risks":[{"risk":"...","mitigation":"..."}],"whatMustBeTrue":["..."],"nextActions":[{"action":"...","owner":"...","timing":"..."}],"evidenceGaps":["..."]}',
      '# Company', 'Name: ' + (Ef.co.name || '') + ' | Industry: ' + (Ef.co.industry || '') + ' | Goal: ' + ENG().goalFa(Ef.co.goal) + ' | Question: ' + (Ef.co.question || ''), Ef.text ? 'Text: ' + Ef.text : '',
      '# Engine diagnosis', 'Main problem: ' + B().ARCH[R.main][0] + '; signals: ' + R.sigList.map(function (s) { return s.fa + ' (' + s.ev.join('; ') + ')'; }).join(' | '),
      '# Framework analyses', R.analyses.map(function (a) { return a.f.fa + ': ' + a.out.v + ' ' + (a.out.rows || []).map(function (r) { return r.join(' — '); }).join(' | '); }).join('\n'),
      '# Architecture', R.Am ? R.Am.a.fa + ' — ' + R.Am.a.policy + ' — ' + R.Am.picks.map(function (p) { return p.pillar + ': ' + p.r.s.fa + ' [' + p.r.label + ']'; }).join(' | ') : 'none',
      '# Data gaps', R.gaps.join(', ')].filter(Boolean).join('\n');
  }
  function reportTab(ctx) {
    var S = ctx.S, R = ctx.R.X, st = h('div', { class: 'studio-status', 'aria-live': 'polite' }), out = h('div');
    var pr = h('button', { class: 'btn primary', type: 'button', text: 'چاپ / ذخیره به PDF', onclick: function () { document.body.classList.add('printing-report'); setTimeout(function () { root.print(); document.body.classList.remove('printing-report'); }, 50); } });
    var cp = h('button', { class: 'btn', type: 'button', text: 'کپی پرامپت برای نقد و تعمیق گزارش با Claude', onclick: function () { var p = aiPrompt(R); if (navigator.clipboard) navigator.clipboard.writeText(p).then(function () { U.toast('پرامپت کپی شد.', 'good'); }, function () { ta.value = p; ta.select(); }); else { ta.value = p; ta.select(); } } });
    var ta = h('textarea', { class: 'f-area', rows: 3, placeholder: 'اگر کلیپ‌بورد مسدود بود، پرامپت اینجا نمایش داده می‌شود', 'aria-label': 'پرامپت' });
    var ai = h('button', { class: 'btn', type: 'button', text: 'نقد و تعمیق با هوش مصنوعی (در صورت اتصال)', onclick: function () {
      var sp = Hub.ai ? Hub.ai.sampler() : Promise.resolve(null);
      sp.then(function (s) { if (!s) { st.textContent = 'هوش مصنوعی وصل نیست؛ از «کپی پرامپت» استفاده کنید.'; return; } st.textContent = 'در حال نقد و تعمیق…'; return s.json(aiPrompt(R), { modelTier: 'complex' }).then(function (j) { S.ai = { json: j, at: new Date().toLocaleString() }; st.textContent = 'انجام شد · ' + S.ai.at; U.clear(out); out.appendChild(Hub.tools.studio.render(j)); }); }).catch(function (e) { st.textContent = 'درخواست ناموفق: ' + (e && (e.message || e.code)); });
    } });
    if (S.ai && S.ai.json && Hub.tools.studio) out.appendChild(Hub.tools.studio.render(S.ai.json));
    return ctx.group([ctx.panel('گزارش هیئت‌مدیره (۹ بخش)', [h('div', { class: 'row-ctl' }, [pr, h('span', { class: 'muted', text: 'خروجی اکسل از دکمهٔ «خروجی اکسل» بالای صفحه.' })]), reportBody(R, ensure(S))]),
      ctx.panel('نقد مستقل گزارش (اختیاری)', [h('p', { class: 'f-help', text: 'موتور قاعده‌محور است. برای نقد و تعمیق متنی، خروجی آن را به Claude بدهید؛ پاسخ پیش‌نویس است و تصمیم با شماست.' }), h('div', { class: 'row-ctl' }, [ai, cp]), st, ta, out])]);
  }

  /* ---------- Excel ---------- */
  function excel(b, R, E) {
    var opt = { rightToLeft: true }, put = function (sh, r, vals, kind) { vals.forEach(function (v, i) { sh.put(1 + i, r, v, kind || (typeof v === 'number' ? 'calc' : 'wrap'), typeof v === 'number' ? 'dec' : undefined); }); };
    var Ef = R.Ef, Am = R.Am;
    var s1 = b.sheet('تشخیص', [2, 40, 14, 80], opt); s1.title('تشخیص مسئلهٔ راهبردی', (Ef.co.name || '') + ' · حالت: ' + MODE[R.mode] + ' · مسئلهٔ اصلی: ' + B().ARCH[R.main][0]);
    put(s1, 4, ['مسئله', 'امتیاز', ''], 'hdr'); R.ranked.forEach(function (k, i) { put(s1, 5 + i, [B().ARCH[k][0], Math.round(R.A[k] * 10) / 10, k === R.main ? 'مسئلهٔ اصلی' : '']); });
    var y = 7 + R.ranked.length; put(s1, y, ['نشانه', 'شدت', 'شاهد'], 'hdr'); R.sigList.forEach(function (s, i) { put(s1, y + 1 + i, [s.fa, s.sev, s.ev.join('؛ ')]); });
    y += 3 + R.sigList.length; put(s1, y, ['مورد استخراج‌شده از متن', 'مقدار', 'جملهٔ شاهد'], 'hdr'); R.X.forEach(function (x, i) { put(s1, y + 1 + i, [x.lab, String(x.v), x.ev]); });
    var s2 = b.sheet('چارچوب‌ها', [2, 36, 12, 70, 12], opt); s2.title('انتخاب چارچوب‌ها', 'منتخب: ' + R.FS.sel.map(function (r) { return r.f.fa; }).join('، '));
    put(s2, 4, ['چارچوب', 'وضعیت', 'دلیل', 'امتیاز تناسب'], 'hdr'); R.FS.rows.slice().sort(function (a, b2) { return (b2.sel - a.sel) || b2.score - a.score; }).forEach(function (r, i) { put(s2, 5 + i, [r.f.fa, r.sel ? 'منتخب' : 'اجرا نشد', r.why, r.score]); });
    var s3 = b.sheet('تحلیل‌ها', [2, 34, 40, 60, 40], opt); s3.title('خروجی تحلیل چارچوب‌های منتخب'); y = 4;
    R.analyses.forEach(function (a) { put(s3, y, [a.f.fa, a.out.v], 'sec'); y++; if (a.out.rows) { put(s3, y, a.out.head || ['مورد', 'ارزیابی'], 'hdr'); y++; a.out.rows.forEach(function (r) { put(s3, y, r.map(function (x) { return String(x); })); y++; }); } (a.out.impl || []).forEach(function (t) { put(s3, y, ['پیامد', t]); y++; }); y++; });
    var s4 = b.sheet('راه‌حل‌ها', [2, 44, 16, 26, 10, 10, 10, 10, 10, 10, 14, 12, 12, 70], opt), W = Ef.W;
    s4.title('راه‌حل‌ها با امتیاز (کل = فرمول وزنی؛ وزن‌ها در ردیف ۳ قابل تغییر)', 'اقتصادی = ۰٫۴ تناسب + ۰٫۴ اثر + ۰٫۲ پایداری · اجرایی = ۰٫۵ اجراپذیری + ۰٫۳ ریسک + ۰٫۲ زمان');
    s4.put(1, 3, 'وزن‌ها →', 'sub'); ['fit', 'impact', 'feas', 'risk', 'time', 'moat'].forEach(function (k, i) { s4.put(4 + i, 3, Number(W[k]) || 0, 'in', 'dec'); });
    put(s4, 4, ['راهکار', 'وضعیت', 'جایگاه', 'تناسب', 'اثر', 'اجراپذیری', 'ریسک', 'زمان', 'پایداری', 'کل (فرمول)', 'اقتصادی (فرمول)', 'اجرایی (فرمول)', 'شرایط اجرا'], 'hdr');
    R.R.list.filter(function (r) { return r.label !== 'na'; }).sort(function (a, b2) { return b2.sc.total - a.sc.total; }).forEach(function (r, i) { var yy = 5 + i, s = r.sc; put(s4, yy, [r.s.fa, LABEL[r.label][0] + (r.definitive ? ' · قطعی' : ''), r.quad]);
      [s.fit, s.impact, s.feas, s.risk, s.time, s.moat].forEach(function (v, j) { s4.put(4 + j, yy, v, 'in', 'dec'); });
      s4.put(10, yy, { f: '=SUMPRODUCT(E' + yy + ':J' + yy + ',$E$3:$J$3)/SUM($E$3:$J$3)' }, 'calc', 'dec'); s4.put(11, yy, { f: '=0.4*E' + yy + '+0.4*F' + yy + '+0.2*J' + yy }, 'calc', 'dec'); s4.put(12, yy, { f: '=0.5*G' + yy + '+0.3*H' + yy + '+0.2*I' + yy }, 'calc', 'dec');
      s4.put(13, yy, r.gates.map(function (g) { return g.n + ': ' + { pass: 'برقرار', fail: 'برقرار نیست', unk: 'نیازمند بررسی', conflict: 'تعارض' }[g.r]; }).join(' · ') || '—', 'wrap'); });
    var s5 = b.sheet('معماری و نقشه راه', [2, 30, 50, 12, 12, 34, 50], opt); s5.title('معماری راهبرد: ' + (Am ? Am.a.fa : '—'), Am ? 'سیاست راهنما: ' + Am.a.policy : '');
    if (Am) { put(s5, 4, ['رکن', 'حرکت', 'وضعیت', 'امتیاز', 'مرحلهٔ بعد'], 'hdr'); Am.picks.forEach(function (p, i) { put(s5, 5 + i, [p.pillar, p.r.s.fa, LABEL[p.r.label][0], p.r.sc.total, p.next ? p.next.s.fa : '—']); }); if (Am.en) put(s5, 5 + Am.picks.length, ['توانمندساز', Am.en.r.s.fa, LABEL[Am.en.r.label][0], Am.en.r.sc.total, '—']); }
    y = 8 + (Am ? Am.picks.length : 0); put(s5, y, ['فاز', 'اقدام', 'از ماه', 'تا ماه', 'مسئول', 'شاخص'], 'hdr'); (R.REC.roadmap || []).forEach(function (s, i) { put(s5, y + 1 + i, [s.ph, s.step, s.from, s.to, s.own, s.kpi]); });
    var s6 = b.sheet('بانک چارچوب‌ها', [2].concat(FWF.map(function () { return 34; })), opt); s6.title('بانک چارچوب‌های راهبردی — پروفایل استاندارد', B().FW.length + ' چارچوب · آخرین بازبینی ' + B().REVIEWED);
    put(s6, 4, FWF.map(function (f) { return f[1]; }), 'hdr'); B().FW.forEach(function (f, i) { put(s6, 5 + i, FWF.map(function (x) { return String(fwVal(f, x[0]) || ''); })); });
    var s7 = b.sheet('بانک راه‌حل‌ها', [2, 8, 36].concat(SFLD.map(function () { return 34; })), opt); s7.title('بانک راه‌حل‌های راهبردی', B().SOL.length + ' راهکار + ' + B().ARCHT.length + ' معماری');
    put(s7, 4, ['شناسه', 'نام'].concat(SFLD.map(function (f) { return f[1]; })), 'hdr'); B().SOL.forEach(function (s, i) { put(s7, 5 + i, [s.id, s.fa].concat(SFLD.map(function (x) { var v = s[x[0]]; return x[0] === 'pil' ? B().PIL[v] : x[0] === 'fw' ? v.map(function (id) { return B().fw(id).fa; }).join('، ') : x[0] === 'law' ? (v || []).map(function (l) { return l[0] + ' [' + FLAG[l[1]] + ']'; }).join(' | ') : x[0] === 'tm' ? v[0] + '–' + v[1] + ' ماه' : Array.isArray(v) ? v.join(' | ') : String(v); }))); });
    var s8 = b.sheet('ورودی‌ها و فرض‌ها', [2, 40, 30, 22], opt); s8.title('ورودی‌ها، منبع هر مقدار و وزن‌ها', 'بدون عدد فرضی: مقدار خالی = نامشخص');
    put(s8, 4, ['ورودی', 'مقدار', 'منبع'], 'hdr'); var ky = Object.keys(B().KEYS).filter(function (k) { return k !== 'res' && k !== 'units'; });
    ky.forEach(function (k, i) { var v = k.split('.').reduce(function (a, x) { return a == null ? undefined : a[x]; }, Ef), kn = !(v === null || v === undefined || v === '' || v === 'unk'); put(s8, 5 + i, [B().KEYS[k], kn ? (k === 'co.goal' ? ENG().goalFa(v) : ({ yes: 'بله', no: 'خیر' }[v] || String(v))) : 'نامشخص', R.prov[k] === 'text' ? 'استخراج از متن (تأیید شود)' : kn ? 'ورودی شما' : '—']); });
    var yw = 7 + ky.length; put(s8, yw, ['وزن معیار', 'مقدار'], 'hdr'); Object.keys(Ef.W).forEach(function (k, i) { put(s8, yw + 1 + i, [{ feas: 'اجراپذیری', fit: 'تناسب', impact: 'اثر', risk: 'ریسک', time: 'زمان', moat: 'پایداری' }[k], Number(Ef.W[k]) || 0]); });
    if (E && E.combo) { var V = evalTools(R, E); if (V.keys.length) { var s9 = b.sheet('ارزیابی ترکیبی ابزارها', [2, 34, 22, 14, 90], opt); s9.title('ارزیابی جداگانه و ترکیبی ابزارهای راهبرد', V.verdict);
      put(s9, 4, ['ابزار', 'وضعیت', 'امتیاز', 'یافته‌ها'], 'hdr'); V.keys.forEach(function (k, i) { var x = V.X[k]; put(s9, 5 + i, [TOOLS.filter(function (t) { return t.k === k; })[0].fa + (x.sample ? ' (دادهٔ نمونه)' : ''), x.status, x.score, x.find.join(' | ')]); });
      var y9 = 7 + V.keys.length; put(s9, y9, ['جزء نتیجه', 'محتوا'], 'hdr'); V.synth.forEach(function (x, i) { put(s9, y9 + 1 + i, x); });
      y9 += 3 + V.synth.length; put(s9, y9, ['سطح', 'یافتهٔ میان‌ابزاری'], 'hdr'); V.iss.forEach(function (x, i) { put(s9, y9 + 1 + i, [LV[x.lvl][0], x.t]); }); } }
  }

  /* ---------- the six strategy tools inside the engine: run each one alone, or assess them together ---------- */
  var TOOLS = [
    { k: 'engine', fa: 'موتور راهبرد (تشخیص و معماری)', id: null },
    { k: 'studio', fa: 'استودیوی راهبرد', id: 'strategy-studio', key: 'hub.studio.v1' },
    { k: 'rm', fa: 'نقشهٔ راه پروژهٔ راهبرد', id: 'rm-strategy', key: 'hub.rm-strategy.v1' },
    { k: 'ff', fa: 'پنج نیروی رقابتی', id: 'five-forces', key: 'hub.ff.v1' },
    { k: 'kn', fa: 'هستهٔ راهبرد (روملت)', id: 'kernel', key: 'hub.kernel.v1' },
    { k: 'bo', fa: 'اقیانوس آبی (ERRC و بوم)', id: 'blue-ocean', key: 'hub.blue.v1' },
    { k: 'pw', fa: 'بازی برای بردن', id: 'playing-to-win', key: 'hub.ptw.v1' }];
  var FFL = { entrants: 'تهدید ورود رقبای جدید', suppliers: 'قدرت تأمین‌کنندگان', buyers: 'قدرت خریداران', substitutes: 'تهدید جایگزین‌ها', rivalry: 'شدت رقابت', state: 'دولت و مقررات (زمینه)' };
  var FFKW = { entrants: /ورود|entrant/i, suppliers: /تأمین|تامین|نهاده|ارز|supplier/i, buyers: /خریدار|مشتری|buyer|customer/i, substitutes: /جایگزین|substitut/i, rivalry: /رقابت|رقیب|rival|competit/i, state: /دولت|قیمت ?گذاری|مقررات|تحریم|regulat|price control/i };
  var COST = /هزینه|ارزان|cost|cheap/i, DIFF = /تمایز|کیفیت|برند|خدمت|differentiat|premium|quality|service/i;
  function isSample(t) { return /illustrative|\(فرضی\)|نمونه/i.test(String(t || '')); }
  function got(key) { try { return U.store.get(key, null); } catch (e) { return null; } }
  function pushFF(R) { var st = U.store, f = got('hub.ff.v1') || Hub.tools.fiveForces.sample(), idm = { entry: 'entrants', subs: 'substitutes' }, n = 0; ENG().forces(R.Ef).forEach(function (x) { var id = idm[x.id] || x.id; if (isFinite(x.v) && f.forces[id]) { f.forces[id].scores.base = x.v; f.forces[id].evidence = 'از موتور راهبرد: ' + x.basis; n++; } }); f.meta.industry = R.Ef.co.industry || R.Ef.co.name || f.meta.industry; st.set('hub.ff.v1', f); return n ? n + ' نیرو منتقل شد (فقط سناریوی پایه؛ نیروهای نامعلوم دست‌نخورده ماندند).' : 'در موتور هیچ نیرویی معلوم نیست؛ چیزی منتقل نشد.'; }
  function xctx(R) { return { S: R.S, R: R.R, archMain: R.Am, main: R.main, second: R.second, sigList: R.sigList, A: R.A, mode: R.mode }; }
  function pushKN(R) { if (!R.Am) return 'معماری فعالی نیست؛ چیزی منتقل نشد.'; var k2 = got('hub.kernel.v1') || Hub.tools.kernel.sample(); var a = ENG().ANA.kernel(R.Ef, xctx(R)); k2.diagnosis = a.rows[0][1]; k2.policy = R.Am.a.policy; k2.proximate = a.rows[3][1]; k2.actions = R.Am.picks.map(function (p) { return { action: p.r.s.fa, linked: true, owner: p.r.s.own, resources: '' }; }); k2.meta.title = R.Ef.co.name || k2.meta.title; U.store.set('hub.kernel.v1', k2); return 'تشخیص، سیاست راهنما، هدف نزدیک و ' + fa(k2.actions.length) + ' اقدام منتقل شد.'; }
  function pushBO(R) { var a = ENG().ANA.blue(R.Ef, xctx(R)), b2 = got('hub.blue.v1') || Hub.tools.blueOcean.sample(); ['eliminate', 'reduce', 'raise', 'create'].forEach(function (key, i) { b2.errc[key] = a.rows[i][1]; }); b2.meta.title = R.Ef.co.name || b2.meta.title; U.store.set('hub.blue.v1', b2); return 'جدول ERRC پیشنهادی منتقل شد؛ عوامل بوم را خودتان با شاهد مشتری امتیاز دهید.'; }
  function pushPW(R) { if (!R.Am) return 'معماری فعالی نیست؛ چیزی منتقل نشد.'; var a = ENG().ANA.ptw(R.Ef, xctx(R)), p2 = got('hub.ptw.v1') || Hub.tools.ptw.sample(), rr = a.rows; p2.cascade = { aspiration: rr[0][1], where: rr[1][1], how: rr[2][1], capabilities: rr[3][1], systems: rr[4][1] }; p2.wmbt = String(rr[5][1]).split('؛ ').filter(function (x) { return x && x !== '—'; }).map(function (w) { return { condition: w, test: '', status: 'untested' }; }); p2.meta.title = R.Ef.co.name || p2.meta.title; U.store.set('hub.ptw.v1', p2); return 'آبشار انتخاب‌ها و ' + fa(p2.wmbt.length) + ' شرط «چه باید درست باشد» منتقل شد.'; }
  function pushST(R) { return toStudio(R) ? 'پروفایل استودیو از متن و تشخیص موتور پر شد؛ «Analyse» را بزنید.' : 'استودیو در دسترس نیست.'; }
  var PUSH = { studio: pushST, ff: pushFF, kn: pushKN, bo: pushBO, pw: pushPW };
  function embedTab(T) {
    return function (ctx) {
      var tool = Hub.toolById && Hub.toolById(T.id), host = h('div', { class: 'embed-host' }), mounted = false, R = ctx.R.X, msg = h('span', { class: 'muted small', 'aria-live': 'polite' });
      function mount() { if (tool && tool.mount && !mounted) { U.clear(host); tool.mount(host); mounted = true; } }
      function unmount() { if (mounted) { try { tool.unmount(); } catch (e) { console.error(e); } mounted = false; } }
      var acts = [];
      if (PUSH[T.k]) acts.push(h('button', { class: 'btn', type: 'button', text: 'پرکردن این کاربرگ از خروجی موتور', onclick: function () { if (this.dataset.armed) { unmount(); msg.textContent = PUSH[T.k](R); mount(); delete this.dataset.armed; this.textContent = 'پرکردن این کاربرگ از خروجی موتور'; } else { this.dataset.armed = '1'; this.textContent = 'تأیید: ورودی‌های فعلی این کاربرگ جایگزین می‌شود'; } } }));
      acts.push(h('button', { class: 'btn ghost', type: 'button', text: 'ارزیابی همین ابزار', onclick: function () { unmount(); var E = ensure(ctx.S); TOOLS.forEach(function (x) { E.combo.sel[x.k] = x.k === T.k; }); var b = document.querySelector('[data-tab=combo]'); if (b) b.click(); } }));
      var el = h('div', { class: 'stack' }, [h('section', { class: 'panel' }, [h('h2', { text: T.fa + ' — اجرای کامل ابزار' }), h('p', { class: 'f-help', text: 'همان ابزار مستقل این بخش، با همان داده: هر تغییری اینجا در نسخهٔ مستقل هم دیده می‌شود. برای اجرای جداگانه همین‌جا کار کنید؛ برای ارزیابی ترکیبی به زبانهٔ «ارزیابی جداگانه و ترکیبی» بروید.' }), h('div', { class: 'row-ctl' }, acts.concat([msg]))]), tool && tool.mount ? host : h('p', { class: 'muted', text: 'این ابزار در این نسخه بارگذاری نشده است.' })]);
      return { el: el, after: mount, dispose: unmount };
    };
  }
  function ffEval(f) {
    var r = Hub.tools.fiveForces.run(f), keys = Object.keys(FFL), sc = keys.map(function (k) { var x = f.forces[k] || {}; return { k: k, w: Number(x.weight) || 0, b: Number(x.scores && x.scores.base), ev: String(x.evidence || '').trim() }; });
    var used = sc.filter(function (x) { return x.w > 0; }), top = used.slice().sort(function (a, b) { return b.b - a.b; })[0], noEv = used.filter(function (x) { return !x.ev; }).length;
    var score = Math.round(100 * (used.length ? (used.length - noEv) / used.length : 0) * 0.6 + (String(f.implications || '').trim() ? 20 : 0) + (isFinite(r.scen.downside.pressure) && r.scen.downside.pressure !== r.scen.base.pressure ? 20 : 0));
    return { score: score, sc: sc, top: top, P: r.scen, checks: r.checks, find: ['فشار وزنی (پایه) ' + (isFinite(r.scen.base.pressure) ? r.scen.base.pressure.toFixed(2) : '–') + ' از ۵ — جذابیت صنعت ' + (r.scen.base.pressure >= 3.5 ? 'پایین' : r.scen.base.pressure >= 2.5 ? 'متوسط' : 'بالا'), 'دامنهٔ سناریو: خوش‌بینانه ' + (r.scen.upside.pressure || 0).toFixed(2) + ' تا بدبینانه ' + (r.scen.downside.pressure || 0).toFixed(2), top ? 'نیروی غالب: ' + FFL[top.k] + ' (' + top.b + ' از ۵)' : 'نیرویی وزن ندارد', fa(noEv) + ' نیرو بدون شاهد'], sample: isSample(f.meta && f.meta.industry) || isSample(f.forces.rivalry && f.forces.rivalry.evidence) };
  }
  function evalTools(R, E) {
    var sel = E.combo.sel, out = [], X = {}, iss = [];
    var add = function (lvl, t, tools) { iss.push({ lvl: lvl, t: t, tools: tools }); };
    // ---- each tool alone ----
    if (sel.engine) { var sc0 = R.insufficient ? 0 : Math.round(Math.min(1, R.nk / 16) * 70 + (R.Am ? 20 : 0) + (R.Am && R.Am.definitive ? 10 : 0)); X.engine = { score: sc0, status: R.insufficient ? 'اطلاعات کافی نیست' : 'اجرا شده', find: R.insufficient ? ['دادهٔ کلیدی کمتر از حد لازم'] : ['مسئلهٔ اصلی: ' + B().ARCH[R.main][0], 'معماری: ' + (R.Am ? R.Am.a.fa + ' (' + LABEL[R.Am.label][0] + ')' : '—'), 'حرکت اصلی: ' + (R.REC.main ? R.REC.main.r.s.fa : '—'), fa(R.gaps.length) + ' دادهٔ «نیازمند بررسی»'], warn: [], sample: false }; }
    if (sel.studio) { var st = got('hub.studio.v1'); if (!st || !Hub.tools.studio) X.studio = { score: 0, status: 'شروع نشده', find: [], warn: [] }; else { var rr = Hub.tools.studio.run(st), pf = Object.keys(st.profile || {}), filled = pf.filter(function (k) { return String(st.profile[k] || '').trim(); }).length, cj = st.conclusion && st.conclusion.json;
      X.studio = { score: Math.round((pf.length ? filled / pf.length : 0) * 40 + (rr.selected ? rr.done / rr.selected : 0) * 40 + (cj ? 20 : 0)), status: cj ? 'نتیجه‌گیری دارد' : rr.done ? 'تحلیل بدون نتیجه‌گیری' : 'تحلیل اجرا نشده', st: st, find: ['پروفایل: ' + fa(filled) + ' از ' + fa(pf.length) + ' خانه', 'چارچوب‌های تحلیل‌شده: ' + fa(rr.done) + ' از ' + fa(rr.selected)].concat(cj && cj.recommendation ? ['توصیهٔ استودیو: ' + cj.recommendation] : []).concat(cj && cj.executiveSummary ? ['خلاصه: ' + String(cj.executiveSummary).slice(0, 400)] : []), warn: (rr.checks || []).map(function (c) { return c.msg; }), sample: isSample(st.profile && st.profile.company) }; } }
    if (sel.rm) { var rm = got('hub.rm-strategy.v1') || { done: {}, notes: {} }, M = (Hub.ROADMAP_AUTH || []).filter(function (x) { return x.id === 'rm-strategy'; })[0], steps = [];
      if (M) M.phases.forEach(function (p, i) { p.steps.forEach(function (s2, j) { steps.push({ key: i + '.' + j, t: s2.t, ph: p.name, done: !!(rm.done || {})[i + '.' + j] }); }); });
      var dn = steps.filter(function (x) { return x.done; }).length, nx = steps.filter(function (x) { return !x.done; }).slice(0, 3);
      X.rm = { score: steps.length ? Math.round(dn / steps.length * 100) : 0, status: fa(dn) + ' از ' + fa(steps.length) + ' گام', steps: steps, find: ['پیشرفت فرایند: ' + fa(dn) + ' از ' + fa(steps.length) + ' گام'].concat(nx.length ? ['گام‌های بعدی: ' + nx.map(function (x) { return x.t + ' (' + x.ph + ')'; }).join('؛ ')] : ['همهٔ گام‌ها تیک خورده']), warn: [], sample: false }; }
    if (sel.ff) { var f = got('hub.ff.v1'); X.ff = f ? Object.assign(ffEval(f), { status: 'کاربرگ دارد', f: f, warn: [] }) : { score: 0, status: 'شروع نشده', find: [], warn: [] }; if (f) X.ff.warn = X.ff.checks.map(function (c) { return c.msg; }); }
    if (sel.kn) { var k = got('hub.kernel.v1'); if (!k) X.kn = { score: 0, status: 'شروع نشده', find: [], warn: [] }; else { var kr = Hub.tools.kernel.run(k), parts = ['diagnosis', 'policy', 'proximate'].filter(function (x) { return String(k[x] || '').trim(); }).length;
      X.kn = { score: Math.round(parts / 3 * 50 + (isFinite(kr.coherence) ? kr.coherence * 40 : 0) + (kr.flags ? 0 : 10)), status: fa(parts) + ' از ۳ جزء', k: k, find: ['تشخیص: ' + (k.diagnosis || '—'), 'سیاست راهنما: ' + (k.policy || '—'), 'هدف نزدیک: ' + (k.proximate || '—'), 'انسجام اقدامات: ' + (isFinite(kr.coherence) ? Math.round(kr.coherence * 100) + '٪ از ' + fa(k.actions.length) + ' اقدام' : '—')], warn: kr.checks.map(function (c) { return c.msg; }), sample: isSample(k.diagnosis) }; } }
    if (sel.bo) { var b = got('hub.blue.v1'); if (!b) X.bo = { score: 0, status: 'شروع نشده', find: [], warn: [] }; else { var br = Hub.tools.blueOcean.run(b), ef = ['eliminate', 'reduce', 'raise', 'create'].filter(function (x) { return String(b.errc[x] || '').trim(); }).length, up = b.factors.filter(function (x) { return Number(x.you) - Number(x.industry) >= 3; }), dn2 = b.factors.filter(function (x) { return Number(x.you) - Number(x.industry) <= -3; });
      X.bo = { score: Math.round(ef / 4 * 50 + Math.min(1, br.divergence / 3) * 40 + (String(b.tagline || '').trim() ? 10 : 0)), status: 'واگرایی ' + br.divergence.toFixed(1), b: b, div: br.divergence, up: up, dn: dn2, find: ['واگرایی منحنی ارزش از صنعت: ' + br.divergence.toFixed(1) + ' (زیر ۱٫۵ = واگرایی کم)', 'عوامل افزایش‌یافته: ' + (up.map(function (x) { return x.name; }).join('، ') || '—'), 'عوامل کاهش‌یافته: ' + (dn2.map(function (x) { return x.name; }).join('، ') || '—'), 'شعار: ' + (b.tagline || '—')], warn: br.checks.map(function (c) { return c.msg; }), sample: isSample(b.tagline) || isSample(b.errc.eliminate) }; } }
    if (sel.pw) { var p = got('hub.ptw.v1'); if (!p) X.pw = { score: 0, status: 'شروع نشده', find: [], warn: [] }; else { var pr = Hub.tools.ptw.run(p), cf = ['aspiration', 'where', 'how', 'capabilities', 'systems'].filter(function (x) { return String(p.cascade[x] || '').trim(); }).length, failed = p.wmbt.filter(function (w) { return w.status === 'failed'; });
      X.pw = { score: Math.round(cf / 5 * 40 + pr.consistency * 30 + (p.wmbt.length ? pr.tested / p.wmbt.length : 0) * 30), status: fa(cf) + ' از ۵ انتخاب', p: p, failed: failed, find: ['آرمان: ' + (p.cascade.aspiration || '—'), 'حوزهٔ بازی: ' + (p.cascade.where || '—'), 'شیوهٔ بردن: ' + (p.cascade.how || '—'), 'شرط‌های «چه باید درست باشد»: ' + fa(p.wmbt.length) + ' (تأییدشده ' + fa(pr.tested) + '، ردشده ' + fa(failed.length) + ')'], warn: pr.checks.map(function (c) { return c.msg; }), sample: isSample(p.cascade.aspiration) }; } }
    Object.keys(X).forEach(function (k2) { if (X[k2].sample) add('crit', TOOLS.filter(function (t) { return t.k === k2; })[0].fa + ': هنوز دادهٔ نمونهٔ فرضی است؛ نتیجهٔ آن در ارزیابی معتبر نیست.', [k2]); });
    // ---- across tools ----
    var on = function (a, b2) { return X[a] && X[b2] && X[a].status !== 'شروع نشده' && X[b2].status !== 'شروع نشده'; };
    if (on('engine', 'ff')) { var idm = { entry: 'entrants', subs: 'substitutes' }; ENG().forces(R.Ef).forEach(function (x) { var id = idm[x.id] || x.id, w = X.ff.sc.filter(function (y) { return y.k === id; })[0]; if (isFinite(x.v) && w && w.w > 0 && isFinite(w.b) && Math.abs(w.b - x.v) >= 2) add('warn', 'ناسازگاری داده: «' + FFL[id] + '» در موتور ' + x.v + ' و در کاربرگ پنج نیرو ' + w.b + ' است. یکی را با شاهد اصلاح کنید.', ['engine', 'ff']); }); }
    if (on('ff', 'kn') && X.ff.top && X.ff.top.b >= 4 && !FFKW[X.ff.top.k].test(X.kn.k.diagnosis || '')) add('warn', 'تشخیص هستهٔ راهبرد به نیروی غالب صنعت («' + FFL[X.ff.top.k] + '»، ' + X.ff.top.b + ' از ۵) اشاره نمی‌کند؛ یا تشخیص ناقص است یا امتیاز پنج نیرو.', ['ff', 'kn']);
    if (on('kn', 'pw')) { var kc = COST.test(X.kn.k.policy || ''), kd = DIFF.test(X.kn.k.policy || ''), pc2 = COST.test(X.pw.p.cascade.how || ''), pd = DIFF.test(X.pw.p.cascade.how || ''); if ((kc && !kd && pd && !pc2) || (kd && !kc && pc2 && !pd)) add('crit', 'تعارض: سیاست راهنمای هستهٔ راهبرد بر ' + (kc ? 'هزینه' : 'تمایز') + ' تکیه دارد اما «شیوهٔ بردن» در بازی برای بردن بر ' + (pc2 ? 'هزینه' : 'تمایز') + '. یک انتخاب لازم است.', ['kn', 'pw']); else if (String(X.kn.k.policy || '').trim() && String(X.pw.p.cascade.how || '').trim()) add('info', 'دو صورت‌بندی از راهبرد وجود دارد (سیاست راهنما و شیوهٔ بردن)؛ متن‌ها را کنار هم بخوانید و یکی کنید.', ['kn', 'pw']); }
    if (on('bo', 'pw') && COST.test(X.pw.p.cascade.how || '') && !DIFF.test(X.pw.p.cascade.how || '') && X.bo.up.length > X.bo.dn.length) add('warn', 'بوم اقیانوس آبی بیشتر عوامل را افزایش می‌دهد (' + X.bo.up.map(function (x) { return x.name; }).join('، ') + ') درحالی‌که شیوهٔ بردن رهبری هزینه است؛ منطق هزینهٔ ERRC را بیازمایید.', ['bo', 'pw']);
    if (on('engine', 'bo') && (R.S.commod || R.main === 'pos') && X.bo.div < 1.5) add('warn', 'موتور مسئله را کالایی‌شدن/جایگاه ضعیف تشخیص داده، اما منحنی ارزش شما در بوم تقریباً همان منحنی صنعت است (واگرایی ' + X.bo.div.toFixed(1) + ').', ['engine', 'bo']);
    if (on('engine', 'kn') && R.Am) { if ((X.kn.k.policy || '').trim() === R.Am.a.policy) add('ok', 'سیاست راهنمای هستهٔ راهبرد با معماری موتور یکی است.', ['engine', 'kn']); else if (String(X.kn.k.policy || '').trim()) add('info', 'سیاست راهنمای کاربرگ («' + String(X.kn.k.policy).slice(0, 120) + '») با معماری موتور («' + R.Am.a.fa + '») متفاوت است؛ تفاوت را آگاهانه انتخاب کنید.', ['engine', 'kn']); }
    if (X.pw && X.pw.failed && X.pw.failed.length) add('crit', 'شرط «چه باید درست باشد» رد شده: ' + X.pw.failed.map(function (w) { return w.condition; }).join('؛ ') + ' — انتخاب مربوط باید بازنگری شود.', ['pw']);
    if (on('engine', 'pw') && R.Am) { var unk = [].concat.apply([], R.Am.picks.map(function (q) { return q.r.gates.filter(function (g) { return g.r === 'unk'; }); })); if (unk.length && !X.pw.p.wmbt.length) add('warn', fa(unk.length) + ' شرط نامشخص در حرکت‌های معماری موتور هست، اما در «چه باید درست باشد» هیچ شرطی برای آزمون ثبت نشده.', ['engine', 'pw']); }
    if (on('studio', 'ff') && X.studio.st.results && X.studio.st.results.fiveForces && X.studio.st.results.fiveForces.json) { var map = { 'Threat of new entrants': 'entrants', 'Supplier power': 'suppliers', 'Buyer power': 'buyers', 'Threat of substitutes': 'substitutes', Rivalry: 'rivalry' }; ((X.studio.st.results.fiveForces.json.forces) || []).forEach(function (q) { var id = map[q.force], w = X.ff.sc.filter(function (y) { return y.k === id; })[0]; if (id && w && isFinite(w.b) && Math.abs(Number(q.rating) - w.b) >= 2) add('warn', '«' + FFL[id] + '»: تحلیل متنی استودیو ' + q.rating + ' و کاربرگ پنج نیرو ' + w.b + ' — شاهد کدام قوی‌تر است؟', ['studio', 'ff']); }); }
    if (on('studio', 'engine') && X.studio.st.conclusion && X.studio.st.conclusion.json && X.studio.st.conclusion.json.recommendation && R.Am) add('info', 'مقایسهٔ کیفی: توصیهٔ استودیو «' + String(X.studio.st.conclusion.json.recommendation).slice(0, 160) + '» در برابر معماری موتور «' + R.Am.a.fa + '». هم‌جهتی را خودتان داوری کنید.', ['studio', 'engine']);
    if (X.rm && X.rm.steps && X.rm.steps.length) { var concl = (X.kn && X.kn.score >= 50) || (X.pw && X.pw.score >= 50) || (X.studio && X.studio.st && X.studio.st.conclusion); if (concl && X.rm.score < 50) add('warn', 'نتیجه‌گیری راهبردی پیش از تکمیل فرایند: فقط ' + fa(Math.round(X.rm.score)) + '٪ گام‌های نقشهٔ راه انجام شده (' + X.rm.steps.filter(function (x) { return !x.done; }).slice(0, 2).map(function (x) { return x.t; }).join('، ') + ' باقی است).', ['rm']); }
    // ---- worksheet-informed engine rerun (combination) ----
    var alt = null;
    if (sel.engine && X.ff && X.ff.sc && E.combo.ffInto) { var E2 = JSON.parse(JSON.stringify(E)), mp = { entrants: 'entry', suppliers: 'suppliers', buyers: 'buyers', substitutes: 'subs', rivalry: 'rivalry' }; X.ff.sc.forEach(function (x) { if (mp[x.k] && x.w > 0 && isFinite(x.b)) E2.mkt[mp[x.k]] = x.b; }); var R2 = ENG().run(E2); alt = { R2: R2, changed: !R.Am || !R2.Am || R2.Am.a.id !== R.Am.a.id || R2.main !== R.main }; }
    // ---- combined result ----
    var keys = Object.keys(X), avg = keys.length ? keys.reduce(function (a, k3) { return a + X[k3].score; }, 0) / keys.length : 0, crit = iss.filter(function (x) { return x.lvl === 'crit'; }).length, warn = iss.filter(function (x) { return x.lvl === 'warn'; }).length;
    var conf = crit ? 'پایین — تعارض یا دادهٔ نامعتبر وجود دارد' : avg >= 70 && !warn ? 'بالا' : avg >= 45 ? 'متوسط' : 'پایین — ابزارها ناقص‌اند';
    var synth = [];
    if (X.pw && X.pw.p) synth.push(['آرمان (بازی برای بردن)', X.pw.p.cascade.aspiration || '—']);
    synth.push(['مسئلهٔ اصلی', sel.engine && !R.insufficient ? B().ARCH[R.main][0] : X.kn && X.kn.k ? X.kn.k.diagnosis || '—' : '—']);
    if (X.ff && X.ff.top) synth.push(['نیروی غالب صنعت (کاربرگ پنج نیرو)', FFL[X.ff.top.k] + ' — ' + X.ff.top.b + ' از ۵']);
    synth.push(['سیاست راهنما', X.kn && X.kn.k && String(X.kn.k.policy || '').trim() ? X.kn.k.policy + (R.Am && sel.engine && X.kn.k.policy !== R.Am.a.policy ? ' (موتور: ' + R.Am.a.policy + ')' : '') : sel.engine && R.Am ? R.Am.a.policy : '—']);
    if (X.pw && X.pw.p) synth.push(['حوزهٔ بازی و شیوهٔ بردن', (X.pw.p.cascade.where || '—') + ' | ' + (X.pw.p.cascade.how || '—')]);
    if (X.bo && X.bo.b) synth.push(['حرکت ارزشی (ERRC)', ['eliminate', 'reduce', 'raise', 'create'].map(function (q, i) { return ['حذف', 'کاهش', 'افزایش', 'خلق'][i] + ': ' + (X.bo.b.errc[q] || '—'); }).join(' · ')]);
    if (sel.engine && R.Am) synth.push(['معماری و حرکت‌ها (موتور)', R.Am.a.fa + ' — ' + R.Am.picks.map(function (q) { return q.r.s.fa + ' [' + LABEL[q.r.label][0] + ']'; }).join('؛ ')]);
    if (X.kn && X.kn.k && X.kn.k.actions && X.kn.k.actions.length) synth.push(['اقدامات منسجم (هستهٔ راهبرد)', X.kn.k.actions.map(function (a) { return a.action + (a.owner ? ' — ' + a.owner : ''); }).join('؛ ')]);
    if (X.rm && X.rm.steps) synth.push(['گام بعدی فرایند (نقشهٔ راه)', (X.rm.steps.filter(function (x) { return !x.done; })[0] || { t: 'همه انجام شده' }).t]);
    if (alt) synth.push(['اثر امتیازهای کاربرگ پنج نیرو بر موتور', alt.changed ? 'تغییر می‌کند: مسئلهٔ اصلی ' + B().ARCH[alt.R2.main][0] + ' · معماری ' + (alt.R2.Am ? alt.R2.Am.a.fa : '—') : 'تغییری در مسئلهٔ اصلی و معماری ایجاد نمی‌کند (نتیجه مقاوم است)']);
    var verdict = keys.length === 1 ? 'ارزیابی جداگانهٔ «' + TOOLS.filter(function (t) { return t.k === keys[0]; })[0].fa + '»: کیفیت و کامل‌بودن ' + fa(X[keys[0]].score) + ' از ۱۰۰.' : 'ارزیابی ترکیبی ' + fa(keys.length) + ' ابزار: آمادگی میانگین ' + fa(Math.round(avg)) + ' از ۱۰۰؛ ' + fa(crit) + ' تعارض جدی، ' + fa(warn) + ' هشدار؛ اطمینان نتیجه: ' + conf + '.';
    var next = iss.filter(function (x) { return x.lvl === 'crit' || x.lvl === 'warn'; }).slice(0, 5).map(function (x) { return x.t; });
    keys.forEach(function (k4) { if (X[k4].score < 50) next.push('تکمیل «' + TOOLS.filter(function (t) { return t.k === k4; })[0].fa + '» (امتیاز ' + fa(X[k4].score) + ')'); });
    return { X: X, iss: iss, avg: avg, conf: conf, synth: synth, verdict: verdict, next: next, alt: alt, keys: keys };
  }
  var LV = { crit: ['تعارض جدی', 'fit-no'], warn: ['هشدار', 'fit-cond'], info: ['برای داوری شما', 'sev-info'], ok: ['هم‌سو', 'fit-rec'] };
  function comboTab(ctx) {
    var E = ensure(ctx.S), R = ctx.R.X, C = E.combo, out = h('div');
    var boxes = h('div', { class: 'row-ctl', style: 'flex-wrap:wrap' }, TOOLS.map(function (t) { var cb = h('input', { type: 'checkbox', 'aria-label': t.fa }); cb.checked = !!C.sel[t.k]; cb.addEventListener('change', function () { C.sel[t.k] = cb.checked; paint(); }); return h('label', { class: 'chk-l', style: 'margin-inline-end:14px' }, [cb, document.createTextNode(' ' + t.fa)]); }));
    var ffc = h('input', { type: 'checkbox', 'aria-label': 'امتیازهای کاربرگ پنج نیرو در موتور' }); ffc.checked = !!C.ffInto; ffc.addEventListener('change', function () { C.ffInto = ffc.checked; paint(); });
    var all = h('button', { class: 'btn ghost', type: 'button', text: 'انتخاب همه', onclick: function () { TOOLS.forEach(function (t) { C.sel[t.k] = true; }); ctx.rerender(); } });
    function paint() {
      U.clear(out); var keys = TOOLS.filter(function (t) { return C.sel[t.k]; });
      if (!keys.length) { out.appendChild(h('p', { class: 'muted', text: 'دست‌کم یک ابزار را انتخاب کنید.' })); return; }
      var V = evalTools(R, E); ctx.S.comboLast = { at: new Date().toLocaleString('fa-IR'), verdict: V.verdict };
      out.appendChild(h('div', { class: 'f-help' }, [h('p', null, [h('strong', { text: V.verdict })])]));
      out.appendChild(h('h3', { text: 'نتیجهٔ ' + (V.keys.length > 1 ? 'ترکیبی' : 'جداگانه') }));
      out.appendChild(table(['جزء', 'نتیجه'], V.synth));
      out.appendChild(h('h3', { text: 'ارزیابی هر ابزار' }));
      out.appendChild(table(['ابزار', 'وضعیت', 'کیفیت و کامل‌بودن (۰–۱۰۰)', 'یافته‌ها', 'کنترل‌های خود ابزار'], V.keys.map(function (k) { var x = V.X[k]; return [TOOLS.filter(function (t) { return t.k === k; })[0].fa + (x.sample ? ' (دادهٔ نمونه)' : ''), x.status, fa(x.score), list(x.find), x.warn && x.warn.length ? list(x.warn) : '—']; })));
      if (V.keys.length > 1) { out.appendChild(h('h3', { text: 'هم‌سویی و تعارض میان ابزارها' })); out.appendChild(V.iss.length ? table(['سطح', 'یافته', 'میان'], V.iss.map(function (x) { return [h('span', { class: 'sev ' + LV[x.lvl][1], text: LV[x.lvl][0] }), x.t, x.tools.map(function (k) { return TOOLS.filter(function (t) { return t.k === k; })[0].fa; }).join(' × ')]; })) : h('p', { class: 'muted', text: 'تعارض یا هشداری میان ابزارهای انتخاب‌شده دیده نشد.' })); }
      else if (V.iss.length) out.appendChild(table(['سطح', 'یافته'], V.iss.map(function (x) { return [h('span', { class: 'sev ' + LV[x.lvl][1], text: LV[x.lvl][0] }), x.t]; })));
      out.appendChild(h('h3', { text: 'اقدامات بعدی' })); out.appendChild(list(V.next.length ? V.next : ['ابزارهای انتخاب‌شده کامل و هم‌سو هستند؛ تصمیم نهایی با شماست.']));
      out.appendChild(h('p', { class: 'small muted', text: 'روش امتیاز: موتور = پوشش دادهٔ کلیدی ۷۰ + معماری ۲۰ + قطعی ۱۰ · استودیو = پروفایل ۴۰ + چارچوب‌های تحلیل‌شده ۴۰ + نتیجه‌گیری ۲۰ · نقشهٔ راه = درصد گام‌های انجام‌شده · پنج نیرو = نیروهای دارای شاهد ۶۰ + پیامدها ۲۰ + سناریوی متفاوت ۲۰ · هستهٔ راهبرد = سه جزء ۵۰ + انسجام اقدامات ۴۰ + نبود نشانهٔ راهبرد بد ۱۰ · اقیانوس آبی = ERRC ۵۰ + واگرایی ۴۰ + شعار ۱۰ · بازی برای بردن = پنج انتخاب ۴۰ + سازگاری ۳۰ + شرط‌های آزموده ۳۰. امتیاز «کیفیت ثبت» است، نه درستی راهبرد. تشخیص تعارض متنی با واژه‌های کلیدی است و قضاوت شما را لازم دارد.' }));
    }
    paint();
    return ctx.group([ctx.panel('ارزیابی جداگانه و ترکیبی ابزارهای راهبرد', [h('p', { class: 'f-help', text: 'یک ابزار را برای ارزیابی جداگانه، یا چند ابزار را برای ارزیابی ترکیبی انتخاب کنید. هر ابزار از دادهٔ ذخیره‌شدهٔ خودش خوانده می‌شود (همان زبانه‌های «ابزارهای راهبرد» یا نسخهٔ مستقل).' }), boxes, h('div', { class: 'row-ctl' }, [all, h('label', { class: 'chk-l' }, [ffc, document.createTextNode(' اجرای دوبارهٔ موتور با امتیازهای کاربرگ پنج نیرو (آزمون مقاومت نتیجه)')])]), out])]);
  }

  /* ---------- tool ---------- */
  function sample() { return { version: 1, tool: 'strategy-engine', settings: { lang: 'auto' }, sources: {}, e: ENG().merge(ENG().defaults(), JSON.parse(JSON.stringify((Hub.stratScenarios || [])[0] ? Hub.stratScenarios[0].E : {}))) }; }
  function blank() { return { version: 1, tool: 'strategy-engine', settings: { lang: 'auto' }, sources: {}, e: ENG().defaults() }; }
  function run(S) { ensure(S); var X = ENG().run(S.e); return { X: X, checks: X.insufficient ? [{ level: 'warning', msg: 'اطلاعات کافی برای توصیه نیست.' }] : [] }; }
  TK.define({
    id: 'strategy-engine', title: 'Business Strategy & Solutions engine', sections: ['strategy'], priority: -10, version: 1, storeKey: 'hub.strategyEngine.v1',
    summary: 'Company text or a four-part form in; diagnosis of the main strategic problem; 2–5 of 25 frameworks chosen for that problem; analyses; 36 strategic moves scored for economic and executional feasibility; a strategy architecture with roadmap; hidden opportunities; board report and Excel.',
    sample: sample, blank: blank, run: run, scenarios: false,
    eyebrow: function () { return 'Business strategy · Strategy & solutions engine'; }, heading: function (S) { return S && S.e && S.e.co && S.e.co.name ? S.e.co.name : 'شرکت جدید'; }, filename: function (S) { return 'Strategy_engine_' + ((S.e && S.e.co.name) || 'company').slice(0, 30); },
    xlsx: function (S, R) { var b = Hub.xl.book(root.ExcelJS, 'Strategy'); excel(b, R.X, ensure(S)); return b.wb; },
    kpis: function (ctx) { var X = function () { return ctx.R.X; }; return [
      ['Main problem', function () { return X().insufficient ? '–' : B().ARCH[X().main][0]; }, function () { return MODE[X().mode]; }],
      ['Strategy architecture', function () { return X().Am ? X().Am.a.fa : '–'; }, function () { return X().Am ? (X().Am.definitive ? 'قطعی' : LABEL[X().Am.label][0]) + ' · امتیاز ' + X().Am.score : 'اطلاعات کافی نیست'; }],
      ['Main move', function () { return X().REC.main ? X().REC.main.r.s.fa : '–'; }, function () { return X().REC.main ? LABEL[X().REC.main.r.label][0] : ''; }],
      ['Frameworks', function () { return fa(X().FS.sel.length) + ' / ' + fa(B().FW.length); }, function () { return 'منتخب برای این مسئله'; }],
      ['Opportunities', function () { return fa(X().O.length); }, function () { return 'فرصت/تهدید پنهان'; }]]; },
    tabs: [{ group: 'Strategy engine', items: [['diag', 'تشخیص و ورودی هوشمند', diagTab], ['fw', 'بانک و انتخاب چارچوب‌ها', fwTab], ['ana', 'تحلیل‌ها', anaTab], ['arch', 'معماری راهبرد و نقشهٔ راه', archTab], ['sol', 'راه‌حل‌ها و رتبه‌بندی', solTab], ['opp', 'فرصت‌های پنهان', oppTab], ['combo', 'ارزیابی جداگانه و ترکیبی', comboTab], ['report', 'گزارش هیئت‌مدیره', reportTab]] },
      { group: 'Strategy tools', items: TOOLS.filter(function (t) { return t.id; }).map(function (t) { return ['t-' + t.k, t.fa, embedTab(t)]; }) }]
  });
  Hub.stratUI = { reportBody: reportBody, excel: excel, aiPrompt: aiPrompt };
})(typeof window !== 'undefined' ? window : globalThis);
