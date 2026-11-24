/* =====================================================================
 * FINANCING SOLUTIONS — UI of the solution engine (seven tabs) and its
 * Excel export. The engine is js/core/finengine.js, the bank js/data/finbank-*.
 *   1 diagnosis (four-part form, assets, ratios, opportunities, saved cases)
 *   2 debt · 3 equity & hybrid · 4 asset monetization (each a full catalogue
 *     with gates, sizing, economics and the 30-field profile)
 *   5 structured solutions (multi-step, transaction diagram, flow of funds)
 *   6 comparison and ranking (editable weights, explainable scores, cases)
 *   7 final report and roadmap (print / PDF, Excel)
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  if (!root.document) return;
  var U = Hub.util, h = U.h, G = Hub.grid, B = function () { return Hub.finBank; }, ENG = function () { return Hub.finEngine; };
  function num(v) { return v === null || v === undefined || v === '' ? NaN : Number(v); }
  function N(v) { return isFinite(v) ? U.fmtNum(v) : 'نامشخص'; }
  function P(v, d) { return isFinite(v) ? U.fmtPct(v, d == null ? 1 : d) : 'نامشخص'; }
  function X(v) { return v === Infinity ? '∞' : isFinite(v) ? v.toFixed(2) + 'x' : 'نامشخص'; }
  var TRI = [['unk', 'نامشخص'], ['yes', 'بله'], ['no', 'خیر'], ['check', 'قابل بررسی'], ['inq', 'نیازمند استعلام']];
  var LABEL = { exec: ['قابل اجرا', 'good'], cond: ['مشروط', 'warn'], blocked: ['نیازمند رفع مانع', 'crit'], dev: ['توسعه‌ای', 'muted'], excluded: ['حذف (تعارض با محدودیت قطعی)', 'crit'], na: ['نامرتبط', 'muted'] };
  var FLAG = { v: 'متن و نسخه با منبع رسمی تطبیق شده (آبان ۱۴۰۵)', n: 'نیازمند استعلام ماده، تاریخ و آخرین اصلاحیه', p: 'رویهٔ بازار — حکم قانونی نیست' };
  var FIELDS = [['id', 'شناسه'], ['fa', 'نام فارسی'], ['en', 'نام انگلیسی'], ['e', 'موتور'], ['sub', 'زیرگروه'], ['d', 'شرح راهکار'], ['sv', 'مسئله‌ای که حل می‌کند'], ['fit', 'شرکت‌های مناسب'], ['nd', 'دارایی یا منبع موردنیاز'], ['mn', 'حداقل شرایط لازم'],
    ['str', 'ساختار حقوقی و مالی معامله'], ['src', 'روش تأمین منابع'], ['rep', 'نحوهٔ بازپرداخت یا ایجاد بازده'], ['par', 'ارکان اجرایی'], ['lic', 'مجوزهای موردنیاز'], ['law', 'مستندات قانونی و مقرراتی'], ['tm', 'مدت زمان تقریبی اجرا'], ['cost', 'هزینه‌های مستقیم و غیرمستقیم'], ['pro', 'مزایا'], ['con', 'معایب'],
    ['rk', 'ریسک‌های مالی، عملیاتی، حقوقی و مقرراتی'], ['acc', 'آثار حسابداری و مالیاتی'], ['own', 'آثار مالکیتی و کنترلی'], ['lim', 'محدودیت‌ها'], ['stp', 'مراحل عملیاتی'], ['cmp', 'ابزارهای مکمل'], ['cmb', 'ساختارهای ترکیبی قابل طراحی'], ['not', 'شرایط عدم توصیه'], ['rev', 'منابع و تاریخ آخرین بررسی'], ['st', 'وضعیت قابلیت اجرا در ایران']];
  function chip(label) { var l = LABEL[label] || [label, '']; return h('span', { class: 'sev fit-' + (l[1] === 'good' ? 'rec' : l[1] === 'warn' ? 'cond' : l[1] === 'crit' ? 'no' : 'ok'), text: l[0] }); }
  function list(a) { return h('ul', { class: 'studio-l' }, (a || []).map(function (x) { return h('li', { text: x }); })); }
  function solName(id) { var s = B().get(id); return s ? s.fa : id; }

  /* ---------- state ---------- */
  function ensure(S) { if (!S.e) S.e = ENG().defaults(); var d = ENG().defaults(); ['co', 'fin', 'cons', 'P', 'W'].forEach(function (k) { S.e[k] = Object.assign({}, d[k], S.e[k] || {}); }); if (!S.e.assets) S.e.assets = []; if (!S.e.cases) S.e.cases = []; if (!S.e.mode) S.e.mode = 'auto'; return S.e; }
  function compute(S, D, K) { ensure(S); return ENG().run(S.e, D, K); }

  /* ---------- 1 · diagnosis ---------- */
  function diagTab(ctx) {
    var S = ctx.S, E = ensure(S), Xr = ctx.R.X, co = E.co, f = E.fin, c = E.cons, purp = B().PURPOSE;
    var h1 = document.querySelector('.mh-title h1'); if (h1 && co.name) h1.textContent = co.name;
    var opt = function (k, label, obj, key, options, help) { return { key: k, label: label, options: options, help: help, get: function () { return String(obj[key]); }, set: function (v) { obj[key] = v; } }; };
    var on = function (k, label, path, fmt, unit) { return ctx.field(k, label, path, fmt || 'num', { optional: true, unit: unit || '' }); };
    var mode = G.form({ id: 'fe-mode', onChange: ctx.rerender, fields: [
      opt('md', 'حالت عملکرد سامانه', E, 'mode', [['auto', 'خودکار (از روی هدف و دارایی‌ها)'], ['goal', 'تأمین مالی هدف‌محور (هدف و مبلغ مشخص)'], ['asset', 'مولدسازی دارایی‌محور'], ['full', 'ارزیابی جامع راهبردی']]),
      opt('un', 'واحد همهٔ مبالغ', co, 'unit', [['million', 'میلیون ریال'], ['billion', 'میلیارد ریال'], ['thousand', 'هزار ریال']])] });
    var s1 = G.form({ id: 'fe-co', onChange: ctx.rerender, fields: [
      { type: 'head', label: 'بخش اول — مشخصات شرکت و هدف تأمین مالی' },
      { key: 'nm', label: 'نام شرکت', text: true, get: function () { return co.name; }, set: function (v) { co.name = v; } },
      { key: 'ind', label: 'صنعت و حوزهٔ فعالیت', text: true, get: function () { return co.industry; }, set: function (v) { co.industry = v; } },
      opt('lst', 'وضعیت پذیرش در بازار سرمایه', co, 'listing', [['unk', 'نامشخص'], ['none', 'غیربورسی'], ['ifb', 'فرابورس'], ['tse', 'بورس تهران']]),
      opt('frm', 'شخصیت حقوقی', co, 'form', [['unk', 'نامشخص'], ['pjs', 'سهامی عام'], ['prjs', 'سهامی خاص'], ['other', 'سایر']]),
      { key: 'own', label: 'ساختار سهامداری', text: true, get: function () { return co.ownership; }, set: function (v) { co.ownership = v; } },
      opt('sub', 'شرکت مادر / شرکت‌های تابعه دارد', co, 'parentSubs', TRI),
      opt('pur', 'هدف تأمین مالی', co, 'purpose', purp.map(function (p) { return [p[0], p[1]]; })),
      on('need', 'مبلغ موردنیاز', 'e.co.need'), on('nby', 'زمان موردنیاز (ماه)', 'e.co.needBy', 'dec'),
      { key: 'use', label: 'نوع مصرف منابع', text: true, get: function () { return co.use; }, set: function (v) { co.use = v; } },
      on('pc', 'هزینهٔ طرح / پروژه (در صورت وجود)', 'e.co.projectCost'),
      opt('ceq', 'امکان افزایش سرمایه', co, 'canEquity', TRI), opt('dap', 'تمایل به افزایش بدهی', co, 'debtAppetite', [['unk', 'نامشخص'], ['high', 'زیاد'], ['med', 'متوسط'], ['low', 'کم'], ['none', 'هیچ']]),
      opt('inv', 'امکان ورود سرمایه‌گذار', co, 'investorOk', TRI), opt('sal', 'امکان فروش دارایی', co, 'assetSaleOk', TRI),
      opt('ctl', 'اولویت حفظ مالکیت و کنترل', co, 'controlPriority', [['unk', 'نامشخص'], ['high', 'زیاد'], ['med', 'متوسط'], ['low', 'کم']]),
      opt('ime', 'محصول پذیرفته‌شده در بورس کالا', co, 'ime', TRI), opt('svc', 'ظرفیت خدمت قابل پیش‌فروش', co, 'service', TRI), opt('fx', 'درآمد ارزی', co, 'fxRevenue', TRI), opt('sm', 'کسب‌وکار کوچک (مناسب تأمین مالی جمعی)', co, 'smallCo', TRI),
      on('val', 'ارزش سهام شرکت (برای عرضه و رقیق‌شدن؛ در صورت وجود)', 'e.co.valuation'), on('sh', 'تعداد سهام (برای اثر بر سود هر سهم)', 'e.co.shares')] });
    var assets = ctx.list({ id: 'fe-assets', path: 'e.assets', onChange: ctx.rerender, newRow: function () { return { type: 'realestate', name: '', mv: null, bv: null, inc: null, util: null, idle: null, title: 'unk', transfer: 'unk', pledge: 'unk', use: 'other', strategic: 'unk', develop: 'unk', listed: 'unk', stake: null, sub: 'no', profitable: 'unk', longterm: 'unk', counter: 'unk', ime: 'unk' }; }, cols: [
      { key: 'type', label: 'نوع', kind: 'select', options: function () { var T = ENG().ATYPE; return Object.keys(T).map(function (k) { return [k, T[k]]; }); }, repaint: true },
      { key: 'name', label: 'نام / شرح', kind: 'text' }, { key: 'mv', label: 'ارزش روز کارشناسی', optional: true }, { key: 'bv', label: 'ارزش دفتری', optional: true }, { key: 'inc', label: 'درآمد سالانه (اجاره / سود)', optional: true },
      { key: 'util', label: 'نرخ بهره‌برداری', fmt: 'pct', optional: true }, { key: 'idle', label: 'سهم راکد', fmt: 'pct', optional: true },
      { key: 'title', label: 'سند و مالکیت', kind: 'select', options: function () { return [['unk', 'نامشخص'], ['clean', 'سالم'], ['issue', 'معارض / نیازمند اصلاح']]; } },
      { key: 'transfer', label: 'قابل انتقال', kind: 'select', options: function () { return TRI; } }, { key: 'pledge', label: 'قابل توثیق', kind: 'select', options: function () { return TRI; } },
      { key: 'use', label: 'کاربری (ملک)', kind: 'select', options: function () { return [['other', '—'], ['commercial', 'تجاری'], ['office', 'اداری'], ['industrial', 'صنعتی'], ['residential', 'مسکونی'], ['land', 'زمین']]; } },
      { key: 'strategic', label: 'اهمیت راهبردی', kind: 'select', options: function () { return [['unk', 'نامشخص'], ['high', 'زیاد'], ['med', 'متوسط'], ['low', 'کم / مازاد']]; } },
      { key: 'develop', label: 'امکان توسعه / تغییر کاربری', kind: 'select', options: function () { return TRI; } },
      { key: 'stake', label: 'درصد مالکیت (دارایی مالی)', optional: true }, { key: 'listed', label: 'بورسی', kind: 'select', options: function () { return TRI; } }, { key: 'profitable', label: 'سودده', kind: 'select', options: function () { return TRI; } },
      { key: 'longterm', label: 'مطالبات بلندمدت', kind: 'select', options: function () { return TRI; } }, { key: 'counter', label: 'طرف قرارداد / بدهکار', kind: 'select', options: function () { return [['unk', 'نامشخص'], ['gov', 'دولتی'], ['private', 'خصوصی']]; } },
      { key: 'ime', label: 'کالای بورس کالا', kind: 'select', options: function () { return TRI; } }] });
    var s3 = G.form({ id: 'fe-fin', onChange: ctx.rerender, fields: [
      { type: 'head', label: 'بخش سوم — اطلاعات مالی و اعتباری (خالی = نامشخص؛ اگر صورت‌ها وارد شده باشد از آن‌ها خوانده می‌شود)' },
      { type: 'note', label: 'علامت‌ها: هزینه‌ها و بدهی‌ها مثبت وارد شوند؛ فقط زیان، سود (زیان) انباشتهٔ منفی و جریان نقد منفی با علامت منفی.' },
      on('rev', 'فروش', 'e.fin.rev'), on('cogs', 'بهای تمام‌شدهٔ فروش', 'e.fin.cogs'), on('ebitda', 'EBITDA', 'e.fin.ebitda'), on('ebit', 'سود عملیاتی', 'e.fin.ebit'), on('fc', 'هزینهٔ مالی آخرین سال گزارش‌شده', 'e.fin.fc'),
      on('pbt', 'سود قبل از مالیات', 'e.fin.pbt'), on('ni', 'سود خالص سال آخر', 'e.fin.ni'), on('ni1', 'سود خالص سال قبل', 'e.fin.ni1'), on('cfo1', 'جریان نقد عملیاتی سال آخر', 'e.fin.cfo1'), on('cfo2', 'جریان نقد عملیاتی سال قبل', 'e.fin.cfo2'),
      on('ta', 'جمع دارایی‌ها', 'e.fin.ta'), on('tl', 'جمع بدهی‌ها', 'e.fin.tl'), on('eq', 'حقوق صاحبان سهام', 'e.fin.eq'), on('cap', 'سرمایهٔ ثبتی', 'e.fin.cap'), on('ret', 'سود (زیان) انباشته', 'e.fin.retained'),
      on('cash', 'موجودی نقد', 'e.fin.cash'), on('debt', 'بدهی بهره‌دار (تسهیلات و اوراق)', 'e.fin.debt'), on('dst', 'بدهی‌های سررسیدشونده تا یک سال', 'e.fin.debtST'), on('ca', 'دارایی‌های جاری', 'e.fin.ca'), on('cl', 'بدهی‌های جاری', 'e.fin.cl'),
      on('ar', 'مطالبات تجاری', 'e.fin.ar'), on('invf', 'موجودی کالا', 'e.fin.inv'), on('ap', 'پرداختنی‌های تجاری', 'e.fin.ap'), on('so', 'اوراق در جریان یا مصوب', 'e.fin.sukukOut'), on('obl', 'تعهدات مالی دیگر', 'e.fin.obligations'),
      opt('rt', 'رتبهٔ اعتباری', f, 'rating', [['unk', 'نامشخص'], ['none', 'ندارد'], ['BBB', 'BBB یا پایین‌تر'], ['A', 'محدودهٔ A'], ['AA', 'AA یا بالاتر']]), opt('gu', 'ضامن بانکی / نهادی در دسترس', f, 'guarantor', TRI),
      opt('op', 'اظهارنظر آخرین حسابرسی', f, 'opinion', [['unk', 'نامشخص'], ['unqualified', 'مقبول'], ['qualified', 'مشروط'], ['adverse', 'مردود / عدم اظهارنظر'], ['none', 'حسابرسی نشده']]),
      opt('df', 'سابقهٔ نکول', f, 'defaulted', TRI), opt('pi', 'سابقهٔ انتشار اوراق', f, 'priorIssues', TRI)] });
    var s4 = G.form({ id: 'fe-cons', onChange: ctx.rerender, fields: [
      { type: 'head', label: 'بخش چهارم — محدودیت‌ها و ترجیحات («بله» یعنی محدودیت قطعی است)' },
      opt('c1', 'عدم تمایل به فروش دارایی', c, 'noSale', TRI), opt('c2', 'عدم تمایل به انتقال مالکیت سهام', c, 'noOwn', TRI), opt('c3', 'ضرورت حفظ کنترل', c, 'control', TRI), opt('c4', 'عدم تمایل به افزایش بدهی', c, 'noDebt', TRI),
      opt('c5', 'محدودیت در توثیق', c, 'noPledge', TRI), opt('c6', 'محدودیت انتقال دارایی', c, 'noTransfer', TRI), opt('c7', 'محدودیت‌های سهامداری', c, 'shLimits', TRI), opt('c8', 'محدودیت‌های مالیاتی', c, 'tax', TRI),
      ctx.field('c9', 'محدودیت زمانی (ماه)', 'e.cons.timeLimit', 'dec', { optional: true }), opt('c10', 'محدودیت‌های مقرراتی', c, 'reg', TRI),
      opt('c11', 'امکان تأسیس شرکت تابعه', c, 'canSub', TRI), opt('c12', 'امکان ایجاد صندوق', c, 'canFund', TRI), opt('c13', 'امکان ورود شریک یا سرمایه‌گذار', c, 'partnerOk', TRI)] });
    // controls: scenarios, statements, cases, clear
    var scSel = h('select', { class: 'f-sel', 'aria-label': 'سناریوی آزمایشی' }, [h('option', { value: '', text: 'سناریوهای آزمایشی…' })].concat((Hub.finScenarios || []).map(function (s) { return h('option', { value: String(s.id), text: s.id + ' · ' + s.fa }); })));
    var loadSc = h('button', { class: 'btn', type: 'button', text: 'بارگذاری سناریو', onclick: function () { var sc = (Hub.finScenarios || []).filter(function (s) { return String(s.id) === scSel.value; })[0]; if (!sc) return; var keep = S.e.cases; S.e = ENG().merge(ENG().defaults(), JSON.parse(JSON.stringify(sc.E))); S.e.cases = keep; ctx.rerender(); U.toast('سناریوی ' + sc.id + ' بارگذاری شد. انتظار: ' + sc.expect, 'good'); } });
    var fromSt = h('button', { class: 'btn', type: 'button', text: 'پر کردن ارقام از صورت‌های واردشده', onclick: function () { var D = ctx.R.D; if (!D) { U.toast('صورت مالی وارد نشده است (نوار «داده‌های شرکت»).', 'warn'); return; } var F = ENG().run(Object.assign(ENG().defaults(), { fin: {} }), D).F; Object.keys(F.f).forEach(function (k) { if (typeof F.f[k] === 'number' && isFinite(F.f[k]) && k in E.fin) E.fin[k] = Math.round(F.f[k]); }); ctx.rerender(); } });
    var clearB = h('button', { class: 'btn ghost', type: 'button', text: 'پاک کردن همهٔ ورودی‌ها', onclick: function () { if (clearB.dataset.armed) { var keep = S.e.cases; S.e = ENG().defaults(); S.e.cases = keep; ctx.rerender(); } else { clearB.dataset.armed = '1'; clearB.textContent = 'برای تأیید دوباره بزنید'; setTimeout(function () { if (clearB.isConnected) { delete clearB.dataset.armed; clearB.textContent = 'پاک کردن همهٔ ورودی‌ها'; } }, 5000); } } });
    var caseName = h('input', { class: 'f-text', type: 'text', placeholder: 'نام سناریو / شرکت', 'aria-label': 'نام سناریو' });
    var saveC = h('button', { class: 'btn', type: 'button', text: 'ذخیرهٔ این بررسی', onclick: function () { var snap = JSON.parse(JSON.stringify(S.e)); delete snap.cases; S.e.cases.push({ name: caseName.value.trim() || (co.name || 'بررسی') + ' · ' + new Date().toLocaleDateString('fa-IR'), at: new Date().toISOString(), e: snap }); ctx.rerender(); U.toast('ذخیره شد؛ در زبانهٔ مقایسه دیده می‌شود.', 'good'); } });
    var cases = S.e.cases.length ? h('ul', { class: 'studio-l' }, S.e.cases.map(function (cs, i) { return h('li', null, [document.createTextNode(cs.name + ' '), h('button', { class: 'mini', type: 'button', text: 'بازکردن', onclick: function () { var keep = S.e.cases; S.e = ENG().merge(ENG().defaults(), JSON.parse(JSON.stringify(cs.e))); S.e.cases = keep; ctx.rerender(); } }), h('button', { class: 'mini', type: 'button', text: '×', title: 'حذف', onclick: function () { S.e.cases.splice(i, 1); ctx.rerender(); } })]); })) : h('p', { class: 'muted', text: 'هنوز بررسی‌ای ذخیره نشده است.' });
    // diagnosis output
    var Gd = Xr.G, rt = h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['شاخص', 'مقدار', 'وضعیت', 'فرمول / مبنا'].map(function (t) { return h('th', { class: 'lbl', text: t }); }))]),
      h('tbody', null, Gd.ratios.map(function (r) { var v = r.kind === 'text' ? r.note : r.kind === 'pct' ? P(r.v) : r.kind === 'x' ? X(r.v) : N(r.v); return h('tr', null, [h('td', { text: r.fa }), h('td', { class: r.kind === 'text' ? '' : 'num', text: v }), h('td', null, [h('span', { class: 'sev ' + (r.status === 'bad' ? 'fit-no' : r.status === 'warn' ? 'fit-cond' : r.status === 'unk' ? 'sev-info' : 'fit-rec'), text: { bad: 'نامطلوب', warn: 'هشدار', ok: 'مناسب', unk: 'نیازمند بررسی' }[r.status] })]), h('td', { class: 'small', text: r.formula + (r.note && r.kind !== 'text' ? ' · ' + r.note : '') })]); }))]);
    var src = Xr.F.src, srcTxt = Object.keys(src).filter(function (k) { return src[k] === 'statements'; }).length ? 'ارقامی که دستی وارد نشده، از صورت‌های واردشده خوانده شد.' : '';
    var probs = Gd.problems.length ? list(Gd.problems.map(function (p) { return p.fa + ' — ' + p.ev; })) : h('p', { class: 'muted', text: 'مسئلهٔ مالی بارزی با ارقام فعلی تشخیص داده نشد.' });
    var miss = Gd.missing.length ? h('p', { class: 'f-help', text: 'اطلاعات ناقص (نیازمند بررسی): ' + Gd.missing.map(function (k) { return { ta: 'جمع دارایی‌ها', tl: 'جمع بدهی‌ها', ebit: 'سود عملیاتی', fc: 'هزینهٔ مالی', cfo1: 'جریان نقد سال آخر', cfo2: 'جریان نقد سال قبل', cap: 'سرمایهٔ ثبتی' }[k]; }).join('، ') + '. بدون آن‌ها نسبت‌ها و ظرفیت بدهی «نامشخص» نمایش داده می‌شود و عدد فرضی جایگزین نمی‌شود.' }) : null;
    var opps = Xr.O.length ? h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['فرصت', 'شاهد', 'راهکارهای مرتبط', 'ارزش مرتبط'].map(function (t) { return h('th', { class: 'lbl', text: t }); }))]),
      h('tbody', null, Xr.O.map(function (o) { return h('tr', null, [h('td', { text: o.t }), h('td', { class: 'small', text: o.ev }), h('td', { class: 'small', text: o.sol.map(solName).join('، ') }), h('td', { class: 'num', text: N(o.val) })]); }))])]) : h('p', { class: 'muted', text: 'با دارایی‌ها و ارقام ثبت‌شده فرصتی شناسایی نشد؛ دارایی‌ها را در بخش دوم ثبت کنید.' });
    var sum = h('div', { class: 'f-help' }, [h('p', null, [h('strong', { text: 'حالت: ' + { goal: 'تأمین مالی هدف‌محور', asset: 'مولدسازی دارایی‌محور', full: 'ارزیابی جامع راهبردی' }[Xr.mode] + ' · مسئلهٔ اصلی: ' + Xr.mainProblem })]),
      h('p', { text: 'راهکارهای مرتبط: ' + Xr.count.applicable + ' از ' + Xr.count.all + ' · قطعی: ' + Xr.count.definitive + ' · حذف‌شده به‌دلیل محدودیت: ' + Xr.count.excluded + ' · ساختار ترکیبی فعال: ' + Xr.count.combos }), srcTxt ? h('p', { text: srcTxt }) : null]);
    return ctx.group([ctx.panel('تشخیص و ارزیابی شرکت', [sum, h('div', { class: 'row-ctl' }, [scSel, loadSc, fromSt, clearB]), mode.el || mode]),
      ctx.two(ctx.panel('نتیجهٔ تشخیص', [h('h3', { text: 'مسائل تشخیص‌داده‌شده' }), probs, miss, h('div', { class: 'grid-wrap' }, [rt])]), ctx.panel('فرصت‌های شناسایی‌شدهٔ تأمین مالی و مولدسازی', [opps])),
      ctx.two(ctx.panel('مشخصات و هدف', [s1.el || s1]), ctx.panel('اطلاعات مالی و اعتباری', [s3.el || s3])),
      ctx.panel('بخش دوم — دارایی‌ها و ظرفیت‌های مولدسازی (هر دارایی یک ردیف؛ خالی = نامشخص)', [assets]),
      ctx.two(ctx.panel('محدودیت‌ها و ترجیحات', [s4.el || s4]), ctx.panel('ذخیره و ادامهٔ بررسی', [h('div', { class: 'row-ctl' }, [caseName, saveC]), cases]))]);
  }

  /* ---------- solution detail ---------- */
  function profile(s) {
    var rows = FIELDS.map(function (fd) {
      var v = s[fd[0]], el;
      if (fd[0] === 'law') el = h('ul', { class: 'studio-l' }, v.map(function (l) { return h('li', { text: l[0] + ' — ' + FLAG[l[1]] }); }));
      else if (fd[0] === 'tm') el = document.createTextNode(v[0] + ' تا ' + v[1] + ' ماه');
      else if (fd[0] === 'e') el = document.createTextNode(B().ENGINE[v][0]);
      else if (fd[0] === 'st') el = document.createTextNode(B().STATUS[v][0]);
      else if (fd[0] === 'cmp') el = document.createTextNode(v.map(solName).join('، ') || '—');
      else if (fd[0] === 'cmb') el = document.createTextNode(v.map(function (id) { var c = B().COMBO.filter(function (x) { return x.id === id; })[0]; return c ? c.fa : id; }).join('، ') || '—');
      else if (fd[0] === 'rev') el = document.createTextNode('آخرین بازبینی پروفایل: ' + v + ' · منابع رسمی برای استعلام: qavanin.ir، rdis.ir، seo.ir، cbi.ir، ifb.ir، tse.ir، ime.co.ir');
      else if (Array.isArray(v)) el = list(v); else el = document.createTextNode(v == null ? '—' : String(v));
      return [h('dt', { text: fd[1] }), h('dd', null, [el])];
    });
    return h('dl', { class: 'rm-dl' }, [].concat.apply([], rows).concat(s.note ? [h('dt', { text: 'یادداشت' }), h('dd', { text: s.note })] : []));
  }
  function ecoView(e, r) {
    if (!e) return h('p', { class: 'muted', text: 'مبلغ بالقوه نامشخص یا صفر است؛ تحلیل کمی ممکن نیست.' });
    var rows = [['مبلغ پیشنهادی (ناخالص)', N(e.gross)], ['هزینهٔ یک‌بارهٔ انتشار / انتقال (فرض قابل تغییر)', P(e.up)], ['منابع خالص دریافتی', N(e.net)], ['هزینهٔ تمام‌شده (سالانه)', P(e.rate)], ['مبنای هزینهٔ تمام‌شده', e.rateNote]];
    if (isFinite(e.annual)) rows.push(['هزینهٔ مالی سالانه', N(e.annual)]);
    if (isFinite(e.irr)) rows.push(['نرخ بازده داخلی جریان تأمین مالی (هزینهٔ مؤثر)', P(e.irr, 2)]);
    if (isFinite(e.npv)) rows.push(['NPV جریان تأمین مالی با نرخ تنزیل شما (مثبت = ارزان‌تر از نرخ تنزیل)', N(e.npv)]);
    if (isFinite(e.ndE)) rows.push(['بدهی خالص / EBITDA پس از اجرا', X(e.ndE)]);
    if (isFinite(e.icov)) rows.push(['پوشش بهره پس از اجرا', X(e.icov)]);
    if (isFinite(e.la)) rows.push(['بدهی‌ها / دارایی‌ها پس از اجرا', P(e.la)]);
    if (isFinite(e.epsDelta)) rows.push(['اثر بر سود هر سهم (ریال، پس از مالیات)', N(e.epsDelta)]);
    if (isFinite(e.dilution)) rows.push(['رقیق‌شدن مالکیت', P(e.dilution)]);
    if (isFinite(e.eqAfter)) rows.push(['حقوق صاحبان سهام پس از اجرا', N(e.eqAfter)]);
    if (isFinite(e.oppCost)) rows.push(['هزینهٔ فرصت (بازده آتی دارایی فروخته‌شده)', N(e.oppCost) + ' در سال']);
    if (isFinite(e.ltv)) rows.push(['نسبت مبلغ تأمین مالی به ارزش دارایی', P(e.ltv)]);
    if (isFinite(e.assetMV)) rows.push(['ارزش کارشناسی / دفتری املاک', N(e.assetMV) + ' / ' + N(e.assetBV)]);
    if (isFinite(e.rentYield)) rows.push(['بازده اجاره‌ای املاک', P(e.rentYield)]);
    if (e.npvNote) rows.push(['یادداشت', e.npvNote]);
    rows.push(['اثر بر نقدینگی', '+' + N(e.net)]);
    var isNum = function (t) { return /^[\s\d,.\-−+٪%x()/]+$/.test(String(t)); };
    return h('table', { class: 'grid', style: 'width:auto;max-width:760px' }, [h('tbody', null, rows.map(function (x) { return h('tr', null, [h('td', { text: x[0] }), h('td', { class: isNum(x[1]) ? 'num' : 'small', style: 'white-space:normal', text: x[1] })]); }))]);
  }
  function detail(r) {
    return h('details', null, [h('summary', { text: 'جزئیات: شرایط، مبلغ، تحلیل مالی و پروفایل کامل' }),
      h('h3', { text: 'شرایط و موانع' }), h('ul', { class: 'studio-l' }, r.gates.map(function (g) { return h('li', { text: { pass: '✓ ', fail: '✗ ', unk: '؟ ', na: '— ', conflict: '⛔ ' }[g.r] + g.n + ' — ' + { pass: 'برقرار', fail: 'برقرار نیست', unk: 'نیازمند بررسی', na: 'نامرتبط', conflict: 'تعارض با محدودیت قطعی شرکت' }[g.r] }); })),
      h('h3', { text: 'مبلغ بالقوه' }), h('p', { text: (isFinite(r.z.amt) ? N(r.z.amt) : 'نامشخص') + ' = ' + r.z.formula }), r.z.as.length ? h('p', { class: 'f-help', text: 'فرض‌ها: ' + r.z.as.join('؛ ') }) : null,
      h('h3', { text: 'تحلیل اقتصادی و مالی' }), ecoView(r.eco, r),
      h('h3', { text: 'توضیح امتیاز' }), list([].concat(r.sc.why.reg, r.sc.why.fit, r.sc.why.cost, r.sc.why.speed, r.sc.why.own)),
      h('h3', { text: 'پروفایل راهکار' }), profile(r.s)]);
  }
  function engineTab(eng) {
    return function (ctx) {
      var Xr = ctx.R.X, rows = Xr.R.filter(function (r) { return r.s.e === eng; }), app = rows.filter(function (r) { return r.label !== 'na'; }).sort(function (a, b) { return b.sc.total - a.sc.total; }), na = rows.filter(function (r) { return r.label === 'na'; });
      var t = h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['راهکار', 'وضعیت برای این شرکت', 'وضعیت در ایران', 'امتیاز', 'مبلغ بالقوه', 'نکات کلیدی'].map(function (x, i) { return h('th', { class: i === 3 || i === 4 ? 'num' : 'lbl', text: x }); }))]),
        h('tbody', null, app.map(function (r) {
          var notes = [].concat(r.conflict.map(function (g) { return 'تعارض: ' + g.n; }), r.fail.map(function (g) { return 'مانع: ' + g.n; }), r.unk.map(function (g) { return 'نیازمند بررسی: ' + g.n; })).slice(0, 4);
          return [h('tr', { class: r.label === 'excluded' ? 'fit-no' : '' }, [h('td', null, [h('strong', { text: r.s.fa }), h('div', { class: 'small muted', text: r.s.sub + (r.definitive ? ' · پیشنهاد قطعی ممکن' : '') })]),
            h('td', null, [chip(r.label)]), h('td', { text: B().STATUS[r.s.st][0] }), h('td', { class: 'num', text: r.sc.total.toFixed(1) }), h('td', { class: 'num', text: isFinite(r.z.amt) ? (r.z.amt > 0 ? N(r.z.amt) : (r.s.k === 'enabler' ? 'توانمندساز' : '۰')) : 'نامشخص' }),
            h('td', { class: 'small' }, [list(notes.length ? notes : ['شرایط شناخته‌شده برقرار است'])])]), h('tr', { class: 'detail-row' }, [h('td', { colspan: '6', style: 'white-space:normal' }, [detail(r)])])];
        }).reduce(function (a, b) { return a.concat(b); }, []))])]);
      return ctx.group([ctx.panel(B().ENGINE[eng][0] + ' — ' + app.length + ' راهکار مرتبط', [h('p', { class: 'f-help', text: 'هر راهکار با شرایط مقرراتی، محدودیت‌های شرکت و دارایی‌ها سنجیده می‌شود. «قطعی» فقط وقتی است که همهٔ شرایط مقرراتی و دارایی احراز شده باشد؛ اطلاعات نامشخص امتیاز مثبت نمی‌گیرد. جزئیات هر ردیف، پروفایل استاندارد ۳۰ بخشی راهکار را نشان می‌دهد.' }), t,
        na.length ? h('p', { class: 'f-help', text: 'نامرتبط با این شرکت (دارایی یا پیش‌نیاز ثبت نشده): ' + na.map(function (r) { return r.s.fa; }).join('، ') }) : null])]);
    };
  }

  /* ---------- 5 · structured solutions ---------- */
  function diagram(c) {
    var W = 1040, cw = 250, rh = 118, nodes = {}, svgNS = 'http://www.w3.org/2000/svg';
    var el = function (tag, at, txt) { var e = document.createElementNS(svgNS, tag); Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); }); if (txt) e.textContent = txt; return e; };
    var rows = Math.max.apply(null, c.nodes.map(function (n) { return n[3]; })) + 1, Hh = rows * rh + 30, svg = el('svg', { viewBox: '0 0 ' + W + ' ' + Hh, width: '100%', role: 'img', 'aria-label': 'نمودار جریان معامله: ' + c.fa, style: 'max-width:' + W + 'px;direction:ltr' });
    var defs = el('defs', {}); var mk = el('marker', { id: 'arr-' + c.id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }); mk.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'currentColor' })); defs.appendChild(mk); svg.appendChild(defs);
    c.nodes.forEach(function (n) { var x = W - 20 - (n[2] + 1) * cw + 42, y = 15 + n[3] * rh; nodes[n[0]] = { x: x, y: y, w: cw - 84, h: 46 }; });
    var pair = {};
    c.edges.forEach(function (e) {
      var a = nodes[e[0]], b = nodes[e[1]]; if (!a || !b) return; var key = [e[0], e[1]].sort().join('|'), k = pair[key] = (pair[key] || 0) + 1, off = (k - 1) * 16 - (k > 1 ? 0 : 0), sgn = e[0] < e[1] ? 1 : -1;
      var ax0 = a.x + a.w / 2, ay0 = a.y + a.h / 2, bx0 = b.x + b.w / 2, by0 = b.y + b.h / 2, L0 = Math.sqrt((bx0 - ax0) * (bx0 - ax0) + (by0 - ay0) * (by0 - ay0)) || 1, nx = -(by0 - ay0) / L0 * sgn, ny = (bx0 - ax0) / L0 * sgn, o2 = (pair[key] > 1 || c.edges.some(function (q) { return q[0] === e[1] && q[1] === e[0]; })) ? 8 + off : 0;
      var ax = ax0 + nx * o2, ay = ay0 + ny * o2, bx = bx0 + nx * o2, by = by0 + ny * o2, dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy) || 1;
      var sx = ax + dx / L * (a.w / 2 * Math.abs(dx / L) + a.h / 2 * Math.abs(dy / L)), sy = ay + dy / L * (a.w / 2 * Math.abs(dx / L) + a.h / 2 * Math.abs(dy / L)), ex = bx - dx / L * (b.w / 2 * Math.abs(dx / L) + b.h / 2 * Math.abs(dy / L)), ey = by - dy / L * (b.w / 2 * Math.abs(dx / L) + b.h / 2 * Math.abs(dy / L));
      svg.appendChild(el('line', { x1: sx, y1: sy, x2: ex, y2: ey, stroke: 'currentColor', 'stroke-opacity': '0.55', 'stroke-width': '1.4', 'marker-end': 'url(#arr-' + c.id + ')' }));
      svg.appendChild(el('text', { x: (sx + ex) / 2 + nx * 9, y: (sy + ey) / 2 + ny * 9 + 4, 'text-anchor': 'middle', 'font-size': '11', fill: 'currentColor', direction: 'rtl', stroke: 'var(--panel, #10181c)', 'stroke-width': '4', 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, e[2]));
    });
    c.nodes.forEach(function (n) { var b = nodes[n[0]]; svg.appendChild(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6, fill: 'var(--panel-2, #152027)', stroke: 'var(--accent, #d9a54e)', 'stroke-width': '1.2' })); svg.appendChild(el('text', { x: b.x + b.w / 2, y: b.y + b.h / 2 + 4, 'text-anchor': 'middle', 'font-size': '12.5', fill: 'currentColor', direction: 'rtl' }, n[1])); });
    return h('div', { class: 'grid-wrap', style: 'color:var(--fg)' }, [svg]);
  }
  var QL = ['چه شخص حقوقی مالک دارایی است؟', 'چه شخصی منابع را دریافت می‌کند؟', 'چه نهادی اوراق یا واحدها را منتشر می‌کند؟', 'چه کسی تعهد پرداخت دارد؟', 'جریان وجوه از کجا به کجا؟', 'سرمایه‌گذار چه حقی دریافت می‌کند؟', 'دارایی در پایان دوره در مالکیت کیست؟', 'ریسک اصلی هر طرف'];
  function comboView(cv) {
    var c = cv.c;
    return h('div', { class: 'rm-phase', style: 'padding:12px 14px' }, [
      h('p', null, [h('strong', { text: c.fa + ' · امتیاز ' + cv.score + ' · منابع نقد قابل جذب ≈ ' + N(cv.cash) }), document.createTextNode(' '), chip(cv.label), cv.conditionalTag ? h('span', { class: 'sev fit-cond', text: cv.conditionalTag, style: 'margin-inline-start:6px' }) : null]),
      h('p', { class: 'f-help', text: c.why }), h('h3', { text: 'مراحل' }), h('ol', { class: 'steps' }, c.ph.map(function (p) { return h('li', { text: p[0] + (p[1].length ? ' — ' + p[1].map(solName).join(' / ') : '') }); })),
      h('h3', { text: 'نمودار جریان معامله' }), diagram(c), h('h3', { text: 'ساختار مالکیت، جریان وجوه و نقش ارکان' }),
      h('table', { class: 'grid aud' }, [h('tbody', null, QL.map(function (q, i) { return h('tr', null, [h('td', { text: q }), h('td', { text: c.q[i] })]); }))]),
      h('h3', { text: 'شرایط اجرا' }), list(c.cond), h('p', { class: 'f-help', text: 'مبلغ ساختار: هر دارایی یا نیاز فقط یک بار تأمین مالی می‌شود و جمع بدهی‌های شرکتی از ظرفیت بدهی بیشتر نمی‌شود. اجزا: ' + cv.comps.map(function (r) { return r.s.fa + ' (' + LABEL[r.label][0] + ')'; }).join('، ') })]);
  }
  function structTab(ctx) {
    var Xr = ctx.R.X, act = Xr.C.filter(function (c) { return c.active; }).sort(function (a, b) { return b.score - a.score; }), off = Xr.C.filter(function (c) { return !c.active; });
    return ctx.group([ctx.panel('ساختارهای ترکیبی و چندمرحله‌ای — ' + act.length + ' ساختار فعال', act.length ? act.map(comboView) : [h('p', { class: 'muted', text: 'با اطلاعات فعلی، ساختار ترکیبی فعالی وجود ندارد.' })]),
      ctx.panel('ساختارهای غیرفعال', [list(off.map(function (c) { return c.c.fa + ' — ' + (c.missing || []).join('، '); }))])]);
  }

  /* ---------- 6 · ranking ---------- */
  function rankTab(ctx) {
    var S = ctx.S, E = ensure(S), Xr = ctx.R.X, W = E.W, Pm = E.P;
    var wf = G.form({ id: 'fe-w', onChange: ctx.rerender, fields: [['reg', 'قابلیت اجرایی و مقرراتی'], ['fit', 'تناسب با نیاز شرکت'], ['cost', 'هزینهٔ تأمین مالی'], ['speed', 'سرعت اجرا'], ['own', 'حفظ مالکیت و انعطاف‌پذیری']].map(function (w) { return ctx.field('w' + w[0], w[1] + ' (وزن)', 'e.W.' + w[0], 'dec', { unit: '٪' }); }) });
    var pf = G.form({ id: 'fe-p', onChange: ctx.rerender, fields: [{ type: 'note', label: 'فرض‌ها ورودی شما هستند، نه نرخ بازار. هر عددی که بر نتیجه اثر دارد اینجا قابل تغییر است.' }].concat(Object.keys(ENG().PLAB).map(function (k) { var pc = /Rate|rate|Cost|cost|Share|share|Discount|Offer|Cover|ltv|laCap|tax|ipoFloat|projDebt|projEq|eqCost|hurdle/.test(k) && !/maxLev|minCov|tenor|crowdCap/.test(k); return ctx.field('p' + k, ENG().PLAB[k], 'e.P.' + k, pc ? 'pct2' : k === 'crowdCap' ? 'num' : 'dec', { optional: Pm[k] === null || k === 'eqCost' || k === 'hurdle' || k === 'crowdCap', unit: pc ? '٪' : '' }); })) });
    var items = Xr.R.filter(function (r) { return r.label !== 'na'; }).map(function (r) { return { n: r.s.fa, e: B().ENGINE[r.s.e][0], lab: r.label, def: r.definitive, sc: r.sc, amt: r.z.amt }; })
      .concat(Xr.C.filter(function (c) { return c.active; }).map(function (c) { return { n: c.c.fa, e: 'ساختار ترکیبی', lab: c.label, def: c.definitive, sc: { total: c.score }, amt: c.cash }; })).sort(function (a, b) { return b.sc.total - a.sc.total; });
    var t = h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['#', 'راهکار', 'موتور', 'وضعیت', 'قطعی؟', 'کل', 'اجرایی', 'تناسب', 'هزینه', 'سرعت', 'مالکیت', 'مبلغ'].map(function (x, i) { return h('th', { class: i >= 5 ? 'num' : 'lbl', text: x }); }))]),
      h('tbody', null, items.map(function (it, i) { var s = it.sc; return h('tr', { class: it.lab === 'excluded' ? 'fit-no' : '' }, [h('td', { text: String(i + 1) }), h('td', { text: it.n }), h('td', { class: 'small', text: it.e }), h('td', null, [chip(it.lab)]), h('td', { text: it.def ? 'بله' : 'خیر' }),
        h('td', { class: 'num' }, [h('strong', { text: s.total.toFixed(1) })]), h('td', { class: 'num', text: s.reg != null ? s.reg : '–' }), h('td', { class: 'num', text: s.fit != null ? s.fit : '–' }), h('td', { class: 'num', text: s.cost != null ? s.cost : '–' }), h('td', { class: 'num', text: s.speed != null ? s.speed : '–' }), h('td', { class: 'num', text: s.own != null ? s.own : '–' }), h('td', { class: 'num', text: isFinite(it.amt) ? N(it.amt) : 'نامشخص' })]); }))])]);
    var cmp = E.cases.length ? h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['سناریو', 'حالت', 'مسئلهٔ اصلی', 'راهکار اصلی', 'امتیاز', 'جایگزین', 'مکمل'].map(function (x) { return h('th', { class: 'lbl', text: x }); }))]),
      h('tbody', null, E.cases.map(function (cs) { var r = ENG().run(cs.e, null, null), m = r.REC, nm = function (x) { return x ? (x.type === 's' ? x.r.s.fa : x.c.c.fa) : '—'; }; return h('tr', null, [h('td', { text: cs.name }), h('td', { text: r.mode }), h('td', { class: 'small', text: r.mainProblem }), h('td', { text: nm(m.main) }), h('td', { class: 'num', text: m.main ? String(m.main.score) : '–' }), h('td', { class: 'small', text: nm(m.alt) }), h('td', { class: 'small', text: nm(m.comp) })]); }))])]) : h('p', { class: 'muted', text: 'برای مقایسهٔ چند سناریو، در زبانهٔ تشخیص هر بررسی را ذخیره کنید.' });
    return ctx.group([ctx.panel('مقایسه و رتبه‌بندی راهکارها', [h('p', { class: 'f-help', text: 'امتیاز کل = میانگین وزنی پنج معیار (۰ تا ۱۰۰). عدم احراز شرایط مقرراتی مانع «قطعی» شدن است؛ اطلاعات نامشخص امتیاز منفی می‌گیرد؛ راهکار در تعارض با محدودیت قطعی شرکت «حذف» نمایش داده می‌شود. توضیح امتیاز هر راهکار در جزئیات زبانه‌های موتورها.' }), t]),
      ctx.two(ctx.panel('وزن معیارها', [wf.el || wf]), ctx.panel('فرض‌های محاسبه', [pf.el || pf])), ctx.panel('مقایسهٔ سناریوهای ذخیره‌شده', [cmp])]);
  }

  /* ---------- 7 · report ---------- */
  function recName(x) { return x ? (x.type === 's' ? x.r.s.fa : x.c.c.fa) : '—'; }
  function reportBody(Xr) {
    var R = Xr.REC, Gd = Xr.G, f = Xr.F.f, co = Xr.E.co, sec = function (t, kids) { return h('section', { class: 'rep-sec' }, [h('h2', { text: t })].concat(kids)); };
    var item = function (x, role) {
      if (!x) return h('p', { class: 'muted', text: role + ': موردی نیست.' });
      var cash = x.type === 's' ? x.r.z.amt : x.c.cash;
      return h('div', null, [h('p', null, [h('strong', { text: role + ': ' + recName(x) }), document.createTextNode(' · امتیاز ' + x.score + ' · ' + (x.def ? 'پیشنهاد قطعی' : 'مشروط به احراز شرایط') + ' · مبلغ ≈ ' + (isFinite(cash) ? N(cash) : 'نامشخص'))]),
        x.type === 's' ? h('p', { class: 'f-help', text: x.r.s.d }) : h('p', { class: 'f-help', text: x.c.c.why })]);
    };
    var main = R.main, sol = Xr.R.filter(function (r) { return r.label !== 'na' && r.label !== 'excluded' && r.s.k !== 'enabler'; }).sort(function (a, b) { return b.sc.total - a.sc.total; }).slice(0, 8);
    var solRows = sol.map(function (r) { return h('tr', null, [h('td', { text: r.s.fa }), h('td', { class: 'small', text: r.s.str }), h('td', { class: 'num', text: isFinite(r.z.amt) ? N(r.z.amt) : 'نامشخص' }), h('td', { class: 'small', text: r.s.cost }), h('td', { text: r.s.tm[0] + '–' + r.s.tm[1] + ' ماه' }), h('td', { class: 'small', text: r.s.mn.slice(0, 3).join('؛ ') }), h('td', { class: 'small', text: r.s.pro.slice(0, 2).join('؛ ') }), h('td', { class: 'small', text: r.s.con.slice(0, 2).join('؛ ') }), h('td', { class: 'small', text: r.s.rk.slice(0, 2).join('؛ ') }), h('td', { class: 'small', text: r.s.law.map(function (l) { return l[0] + (l[1] === 'v' ? ' ✓' : l[1] === 'p' ? ' (رویه)' : ' (استعلام)'); }).join('؛ ') })]); });
    var mainR = main ? (main.type === 's' ? main.r : null) : null, mainEco = mainR ? ecoView(mainR.eco, mainR) : (main ? h('p', { class: 'f-help', text: 'تحلیل هر جزء ساختار در جزئیات زبانه‌های موتورها آمده است. منابع نقد قابل جذب ساختار ≈ ' + N(main.c.cash) }) : null);
    var rm = h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['مرحله', 'زمان‌بندی تقریبی (ماه)', 'مسئول پیشنهادی', 'اسناد موردنیاز', 'نهادهای درگیر', 'مجوزها'].map(function (x) { return h('th', { class: 'lbl', text: x }); }))]),
      h('tbody', null, R.roadmap.map(function (s) { return h('tr', null, [h('td', { text: s.step }), h('td', { class: 'num', text: s.from + ' تا ' + s.to }), h('td', { text: s.owner }), h('td', { class: 'small', text: (s.docs || []).join('؛ ') || '—' }), h('td', { class: 'small', text: (s.inst || []).join('، ') }), h('td', { class: 'small', text: (s.lic || []).join('؛ ') || '—' })]); }))]);
    var risks = main ? (main.type === 's' ? main.r.s.rk : [].concat.apply([], main.c.comps.map(function (r) { return r.s.rk.slice(0, 2); }))) : [];
    var sens = mainR && mainR.s.k === 'debt' && isFinite(mainR.z.amt) ? (function () { var base = Xr.E.P.debtRate; return h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['نرخ بدهی', 'ظرفیت بدهی', 'پوشش بهره پس از اجرا'].map(function (x, i) { return h('th', { class: i ? 'num' : 'lbl', text: x }); }))]), h('tbody', null, [base - 0.05, base, base + 0.05, base + 0.1].map(function (r) { var E2 = JSON.parse(JSON.stringify(Xr.E)); E2.P.debtRate = r; var Y = ENG().run(E2, null, null), rr = Y.R.filter(function (z) { return z.id === mainR.id; })[0]; return h('tr', null, [h('td', { text: P(r) }), h('td', { class: 'num', text: N(Y.G.debtCap) }), h('td', { class: 'num', text: rr && rr.eco ? X(rr.eco.icov) : '–' })]); }))]); })() : null;
    return h('div', { class: 'print-report rep' }, [
      h('h1', { text: 'گزارش مشاورهٔ تأمین مالی و مولدسازی دارایی — ' + (co.name || 'شرکت') }), h('p', { class: 'muted', text: 'تهیه‌شده با موتور قاعده‌محور هاب · ' + new Date().toLocaleDateString('fa-IR') + ' · پیش‌نویس برای داوری مشاور؛ تصمیم نهایی، ارزش‌گذاری، استعلام حقوقی و مالیاتی با شماست.' }),
      sec('۱. خلاصهٔ مدیریتی', [list(['وضعیت شرکت: ' + (Gd.problems.length ? Gd.problems.map(function (p) { return p.fa; }).join('؛ ') : 'مسئلهٔ مالی بارزی تشخیص داده نشد'), 'مسئلهٔ اصلی: ' + Xr.mainProblem, 'هدف تأمین مالی: ' + (B().PURPOSE.filter(function (p) { return p[0] === co.purpose; })[0] || ['', 'نامشخص'])[1] + (isFinite(num(co.need)) ? ' · مبلغ ' + N(num(co.need)) : ''),
        'ظرفیت‌های موجود: ظرفیت بدهی جدید ' + N(Gd.debtCap) + '؛ سقف سرمایه برای اوراق ' + N(Gd.capCeil) + '؛ دارایی‌های قابل توثیق ' + N(Xr.V.pledgeRE + Xr.V.finListed), 'مهم‌ترین فرصت‌ها: ' + (Xr.O.slice(0, 3).map(function (o) { return o.t; }).join('؛ ') || '—'), 'پیشنهاد نهایی: ' + recName(main) + (R.condOnly ? ' (هیچ راهکار قطعی‌ای نبود؛ پیشنهاد مشروط است)' : '')])]),
      sec('۲. تشخیص وضعیت مالی و دارایی‌ها', [list(['ساختار مالی: بدهی‌ها/دارایی‌ها ' + P(Gd.la) + '، بدهی خالص/EBITDA ' + X(Gd.nd / f.ebitda) + '، پوشش بهره ' + X(Gd.cov), 'ظرفیت بدهی: کمترِ سقف اهرم ' + N(Gd.capLev) + '، پوشش بهره ' + N(Gd.capCov) + ' و بازپرداخت از سود ' + N(Gd.capRep), 'دارایی‌ها: املاک ' + N(Xr.V.re) + ' (درآمدزا ' + N(Xr.V.reIncome) + '، راکد/کم‌بازده ' + N(Xr.V.reIdle) + ')، ماشین‌آلات ' + N(Xr.V.mach) + '، دارایی مالی ' + N(Xr.V.fin) + '، مطالبات ' + N(Xr.V.ar), 'جریان نقد: سال آخر ' + N(f.cfo1) + '، جمع دو سال ' + N(Gd.cfoSum), 'محدودیت‌ها: ' + (Xr.R.filter(function (r) { return r.label === 'excluded'; }).map(function (r) { return r.s.fa; }).join('، ') || 'محدودیت قطعی ثبت نشده'), 'اطلاعات نیازمند بررسی: ' + (Gd.missing.join('، ') || '—')]), Xr.O.length ? list(Xr.O.map(function (o) { return 'فرصت: ' + o.t + ' — ' + o.ev; })) : null]),
      sec('۳. راهکارهای شناسایی‌شده', [h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['راهکار', 'ساختار', 'مبلغ بالقوه', 'هزینه', 'مدت', 'پیش‌نیازها', 'مزایا', 'معایب', 'ریسک‌ها', 'مستندات'].map(function (x) { return h('th', { class: 'lbl', text: x }); }))]), h('tbody', null, solRows)])])]),
      sec('۴. مقایسه و رتبه‌بندی', [list(Xr.R.filter(function (r) { return r.label !== 'na'; }).sort(function (a, b) { return b.sc.total - a.sc.total; }).slice(0, 10).map(function (r, i) { return (i + 1) + '. ' + r.s.fa + ' — ' + r.sc.total.toFixed(1) + ' (' + LABEL[r.label][0] + (r.definitive ? '، قطعی' : '') + ')'; }))]),
      sec('۵. ساختار پیشنهادی نهایی', [item(R.main, 'راهکار اصلی'), item(R.alt, 'راهکار جایگزین'), item(R.comp, 'راهکار مکمل'), main && main.type === 'c' ? comboView(main.c) : (Xr.C.filter(function (c) { return c.active; }).sort(function (a, b) { return b.score - a.score; })[0] ? comboView(Xr.C.filter(function (c) { return c.active; }).sort(function (a, b) { return b.score - a.score; })[0]) : null)]),
      sec('۶. تحلیل اقتصادی و مالی', [mainEco, sens ? h('h3', { text: 'حساسیت ظرفیت به نرخ' }) : null, sens, h('p', { class: 'f-help', text: 'مقایسه با عدم اجرا: ' + (Xr.V.reIdle > 0 && isFinite(num(Xr.E.P.hurdle)) ? 'هزینهٔ فرصت دارایی‌های راکد ≈ ' + N(Xr.V.reIdle * num(Xr.E.P.hurdle)) + ' در سال.' : 'نرخ تنزیل وارد نشده؛ هزینهٔ فرصت عدم اجرا محاسبه نشد.') + ' همهٔ فرض‌ها در زبانهٔ «مقایسه و رتبه‌بندی» قابل تغییر است.' })]),
      sec('۷. برنامهٔ عملیاتی', [rm, h('h3', { text: 'نقاط تصمیم‌گیری' }), list(['تأیید هیئت‌مدیره بر ساختار پیشنهادی', 'نتیجهٔ ارزیابی کارشناس رسمی و استعلام مالیاتی پیش از انتقال هر دارایی', 'اخذ ضمانت یا رتبه پیش از ثبت نزد سازمان', 'مصوبهٔ مجمع (در افزایش سرمایه یا انتقال دارایی‌های عمده)']), h('h3', { text: 'ریسک‌های اجرایی' }), list(risks.slice(0, 6))]),
      sec('۸. نتیجه‌گیری و توصیهٔ مشاور', [h('p', { text: main ? 'توصیه: ' + recName(main) + (R.alt ? '؛ در صورت عدم احراز شرایط، ' + recName(R.alt) : '') + (R.comp ? '؛ و به‌عنوان مکمل ' + recName(R.comp) + '.' : '.') + (R.condOnly ? ' هیچ راهکاری همهٔ شرایط مقرراتی را احراز نکرد؛ ابتدا موارد «نیازمند بررسی» را تکمیل کنید.' : '') : 'با اطلاعات فعلی پیشنهادی ممکن نیست؛ بخش‌های ۱ تا ۳ فرم را تکمیل کنید.' }),
        h('p', { class: 'f-help', text: 'موارد نیازمند ارزش‌گذاری، استعلام حقوقی و مالیاتی پیش از تصمیم: ارزش کارشناسی دارایی‌ها، آثار مالیاتی انتقال، متن جاری دستورالعمل‌ها (مواردی که «نیازمند استعلام» علامت خورده‌اند)، و نرخ‌ها و کارمزدهای بازار در زمان اجرا.' })])]);
  }
  /* ---------- 7 · report in pyramid order: answer → key reasons → evidence → what cannot be completed ---------- */
  var MISS = { ta: 'جمع دارایی‌ها', tl: 'جمع بدهی‌ها', ebit: 'سود عملیاتی', fc: 'هزینهٔ مالی', cfo1: 'جریان نقد عملیاتی سال آخر', cfo2: 'جریان نقد عملیاتی سال قبل', cap: 'سرمایهٔ ثبت‌شده' };
  var RST = { ok: 'مناسب', warn: 'هشدار', bad: 'نامطلوب', unk: 'نامشخص' }, GR = { pass: 'احراز شد', fail: 'احراز نشد', unk: 'نامشخص', conflict: 'تعارض با محدودیت شما', na: 'نامرتبط' };
  function finReport(Xr) {
    var R = Xr.REC, Gd = Xr.G, f = Xr.F.f, E = Xr.E, co = E.co, main = R.main, Bk = [], need = num(co.need), unit = { million: 'میلیون ریال', billion: 'میلیارد ریال', thousand: 'هزار ریال' }[co.unit] || 'میلیون ریال';
    var purpose = (B().PURPOSE.filter(function (p) { return p[0] === co.purpose; })[0] || ['', ''])[1], cashOf = function (x) { return x ? (x.type === 's' ? x.r.z.amt : x.c.cash) : NaN; }, parts = function (x) { return x ? (x.type === 's' ? [x.r] : x.c.comps) : []; };
    var gaps = [];   // every item that could not be completed, with what is missing
    Bk.push({ t: 'h1', x: 'گزارش راه‌حل تأمین مالی — ' + (co.name || 'شرکت (نام وارد نشده)') });
    Bk.push({ t: 'meta', x: 'تاریخ تهیه: ' + new Date().toLocaleDateString('fa-IR') + ' · واحد مبالغ: ' + unit + ' · منبع اعداد: اطلاعات واردشدهٔ شما' + (Xr.F.fromStatements ? ' و صورت‌های مالی بارگذاری‌شده' : '') + ' · خروجی موتور قاعده‌محور؛ تصمیم نهایی با شماست.' });
    // ---------- 1 answer ----------
    Bk.push({ t: 'h2', x: '۱. نتیجهٔ اصلی' });
    if (!main) {
      var why0 = Gd.missing.map(function (k) { return MISS[k] || k; }).concat((E.assets || []).length ? [] : ['فهرست دارایی‌ها']).concat(need > 0 ? [] : ['مبلغ موردنیاز']).concat(co.purpose === 'unknown' || !purpose ? ['هدف تأمین مالی'] : []);
      Bk.push({ t: 'gap', x: 'این بخش به دلیل کمبود اطلاعات قابل تکمیل نیست. برای پیشنهاد راه‌حل دست‌کم این موارد لازم است: ' + (why0.join('، ') || 'اطلاعات مالی و دارایی‌های شرکت') + '.' });
    } else {
      var amt = cashOf(main), cov = need > 0 && isFinite(amt) ? amt / need : NaN;
      Bk.push({ t: 'lead', x: 'راه‌حل پیشنهادی: ' + recName(main) + ' — ' + (main.def ? (parts(main).some(function (r) { return r.unk.length; }) ? 'شرایط مقرراتی و دارایی احراز شده، ولی ' + fa0(parts(main).reduce(function (t, r) { return t + r.unk.length; }, 0)) + ' ترجیح یا محدودیت شما هنوز نامشخص است' : 'پیشنهاد قطعی (همهٔ شرایط احراز شده)') : 'پیشنهاد مشروط (بخشی از شرایط هنوز احراز نشده یا نامشخص است)') + '. ' +
        (isFinite(amt) ? 'مبلغ قابل تأمین طبق اطلاعات فعلی: ' + N(amt) + (need > 0 ? ' در برابر نیاز ' + N(need) + ' (' + P(cov, 0) + ' نیاز).' : '.') : 'مبلغ قابل تأمین: قابل محاسبه نیست.') +
        (R.alt ? ' جایگزین در صورت احرازنشدن شرایط: ' + recName(R.alt) + '.' : '') + (R.comp ? ' مکمل: ' + recName(R.comp) + '.' : '') });
      if (!(need > 0)) gaps.push('پوشش نیاز: مبلغ موردنیاز وارد نشده است.');
      if (!isFinite(amt)) gaps.push('مبلغ قابل تأمین راه‌حل اصلی: دادهٔ لازم برای فرمول «' + (main.type === 's' ? main.r.z.formula : 'اجزای ساختار') + '» وارد نشده است.');
    }
    // ---------- 2 reasons (need vs capacity · feasibility · cost, time and control) ----------
    if (main) {
      var ps = parts(main), gAll = [].concat.apply([], ps.map(function (r) { return r.gates.map(function (g) { return { n: g.n, r: g.r, s: r.s.fa }; }); })), gp = gAll.filter(function (g) { return g.r === 'pass'; }).length, gu = gAll.filter(function (g) { return g.r === 'unk'; }), gf = gAll.filter(function (g) { return g.r === 'fail' || g.r === 'conflict'; });
      var m0 = ps[0], tm = [Math.max.apply(null, ps.map(function (r) { return r.s.tm[0]; })), Math.max.apply(null, ps.map(function (r) { return r.s.tm[1]; }))];
      var ranked = Xr.R.filter(function (r) { return r.label !== 'na' && r.label !== 'excluded' && r.s.k !== 'enabler'; }).sort(function (a, b) { return b.sc.total - a.sc.total; });
      Bk.push({ t: 'h2', x: '۲. سه دلیل کلیدی' });
      Bk.push({ t: 'ol', x: [
        'نیاز در برابر ظرفیت: ' + (need > 0 ? 'نیاز ' + N(need) + (purpose ? ' برای ' + purpose : '') : 'مبلغ نیاز وارد نشده') + '؛ ظرفیت بدهی جدید شرکت ' + (isFinite(Gd.debtCap) ? N(Gd.debtCap) : 'قابل محاسبه نیست') + '؛ مبلغ قابل تأمین از این راه‌حل ' + (isFinite(cashOf(main)) ? N(cashOf(main)) : 'قابل محاسبه نیست') + '.',
        'قابلیت اجرا: از ' + fa0(gAll.length) + ' شرط این راه‌حل، ' + fa0(gp) + ' شرط احراز شده، ' + fa0(gf.length) + ' شرط احراز نشده و ' + fa0(gu.length) + ' شرط نامشخص است' + (gf.length ? ' (احرازنشده: ' + gf.map(function (g) { return g.n; }).join('، ') + ')' : '') + '. وضعیت: ' + ps.map(function (r) { return LABEL[r.label][0]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ') + '.',
        'هزینه، زمان و کنترل: ' + (m0.eco && isFinite(m0.eco.rate) ? 'نرخ تمام‌شده ' + P(m0.eco.rate) + (isFinite(m0.eco.up) ? ' و هزینهٔ یک‌باره ' + P(m0.eco.up) : '') : 'نرخ تمام‌شده قابل محاسبه نیست') + '؛ زمان اجرا ' + fa0(tm[0]) + ' تا ' + fa0(tm[1]) + ' ماه؛ امتیاز کل ' + main.score + (ranked[1] && main.type === 's' ? ' در برابر ' + ranked.filter(function (r) { return r.id !== m0.id; })[0].sc.total.toFixed(1) + ' برای گزینهٔ بعدی (' + ranked.filter(function (r) { return r.id !== m0.id; })[0].s.fa + ')' : '') + '.'] });
      if (gu.length) gaps.push('شرایط نامشخص راه‌حل اصلی (تا روشن نشوند پیشنهاد مشروط می‌ماند): ' + gu.map(function (g) { return g.n; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('، ') + '.');
      if (!(m0.eco && isFinite(m0.eco.rate))) gaps.push('نرخ تمام‌شدهٔ راه‌حل اصلی: نرخ یا مبلغ لازم وارد نشده است.');
    }
    // ---------- 3 evidence ----------
    Bk.push({ t: 'h2', x: '۳. شواهد' });
    Bk.push({ t: 'h3', x: 'الف) وضعیت مالی شرکت' });
    var rr = Gd.ratios.filter(function (r) { return r.kind === 'text' ? r.note : isFinite(r.v); });
    if (rr.length) Bk.push({ t: 'table', head: ['شاخص', 'مقدار', 'وضعیت', 'فرمول'], rows: rr.map(function (r) { return [r.fa, r.kind === 'text' ? r.note : r.kind === 'pct' ? P(r.v) : r.kind === 'x' ? X(r.v) : N(r.v), r.kind === 'text' ? '—' : (RST[r.status] || r.status), r.formula + (r.note && r.kind !== 'text' ? ' — ' + r.note : '')]; }) });
    else Bk.push({ t: 'gap', x: 'این بخش به دلیل کمبود اطلاعات قابل تکمیل نیست: هیچ‌یک از اعداد صورت‌های مالی وارد نشده است.' });
    var unkR = Gd.ratios.filter(function (r) { return r.kind !== 'text' && !isFinite(r.v); }); if (unkR.length) gaps.push('شاخص‌های مالی محاسبه‌نشده: ' + unkR.map(function (r) { return r.fa; }).join('، ') + '.');
    Bk.push({ t: 'ul', x: ['مسئلهٔ اصلی تشخیص‌داده‌شده: ' + (Xr.mainProblem || '—'), 'مسائل مالی: ' + (Gd.problems.length ? Gd.problems.map(function (p) { return p.fa; }).join('؛ ') : 'با اعداد واردشده مسئله‌ای تشخیص داده نشد'), 'ظرفیت بدهی: کمترینِ سقف اهرم ' + N(Gd.capLev) + '، سقف پوشش بهره ' + N(Gd.capCov) + ' و سقف بازپرداخت از سود ' + N(Gd.capRep) + '.'] });
    if ((E.assets || []).length) Bk.push({ t: 'table', head: ['دارایی', 'نوع', 'ارزش روز', 'ارزش دفتری'], rows: E.assets.map(function (a) { return [a.name || '—', ENG().ATYPE[a.type] || a.type, isFinite(num(a.mv)) ? N(num(a.mv)) : 'وارد نشده', isFinite(num(a.bv)) ? N(num(a.bv)) : 'وارد نشده']; }) });
    else gaps.push('راهکارهای مولدسازی دارایی: هیچ دارایی‌ای وارد نشده است.');
    (E.assets || []).forEach(function (a) { if (a.type === 'realestate' && !isFinite(num(a.inc))) gaps.push('درآمد سالانهٔ «' + (a.name || 'ملک') + '» وارد نشده است؛ درآمدزا یا راکد بودن آن قابل تشخیص نیست.'); });
    if (Xr.O.length) Bk.push({ t: 'ul', x: Xr.O.map(function (o) { return 'فرصت: ' + o.t + ' — ' + o.ev; }) });
    Bk.push({ t: 'h3', x: 'ب) مقایسهٔ راه‌حل‌ها' });
    var rk = Xr.R.filter(function (r) { return r.label !== 'na' && r.s.k !== 'enabler'; }).sort(function (a, b) { return b.sc.total - a.sc.total; }).slice(0, 10);
    if (rk.length) Bk.push({ t: 'table', head: ['رتبه', 'راه‌حل', 'وضعیت', 'قطعی', 'مبلغ بالقوه', 'نرخ تمام‌شده', 'زمان (ماه)', 'امتیاز', 'شرایط احرازنشده یا نامشخص'], rows: rk.map(function (r, i) { return [fa0(i + 1), r.s.fa, LABEL[r.label][0], r.definitive ? 'بله' : 'خیر', isFinite(r.z.amt) ? N(r.z.amt) : 'نامشخص', r.eco && isFinite(r.eco.rate) ? P(r.eco.rate) : 'نامشخص', r.s.tm[0] + '–' + r.s.tm[1], r.sc.total.toFixed(1), r.gates.filter(function (g) { return g.r !== 'pass'; }).map(function (g) { return g.n + ' (' + GR[g.r] + ')'; }).join('؛ ') || '—']; }) });
    Bk.push({ t: 'small', x: 'امتیاز = میانگین وزنی پنج معیار با وزن‌های شما: اجرایی ' + E.W.reg + '، تناسب ' + E.W.fit + '، هزینه ' + E.W.cost + '، سرعت ' + E.W.speed + '، مالکیت ' + E.W.own + '.' });
    if (main) {
      Bk.push({ t: 'h3', x: 'ج) جزئیات راه‌حل پیشنهادی' });
      parts(main).forEach(function (r) { Bk.push({ t: 'h4', x: r.s.fa });
        Bk.push({ t: 'ul', x: ['شرح: ' + r.s.d, 'ساختار معامله: ' + r.s.str, 'مبلغ: ' + (isFinite(r.z.amt) ? N(r.z.amt) : 'نامشخص') + ' — فرمول: ' + r.z.formula, 'شرایط: ' + r.gates.map(function (g) { return g.n + ' (' + GR[g.r] + ')'; }).join('؛ '), 'هزینه‌ها: ' + r.s.cost, 'ریسک‌ها: ' + r.s.rk.join('؛ '),
          'مستندات قانونی: ' + r.s.law.map(function (l) { return l[0] + ' [' + (l[1] === 'v' ? 'تطبیق‌شده با منبع رسمی، آبان ۱۴۰۵' : l[1] === 'p' ? 'رویهٔ بازار، نه حکم قانونی' : 'نیازمند استعلام متن و آخرین اصلاحیه') + ']'; }).join('؛ ')] });
        if (r.s.law.some(function (l) { return l[1] === 'n'; })) gaps.push('مستندات قانونی «' + r.s.fa + '»: بخشی از مواد با منبع رسمی تطبیق نشده و نیازمند استعلام است.'); });
      if (R.roadmap.length) { Bk.push({ t: 'h3', x: 'د) برنامهٔ اجرا' }); Bk.push({ t: 'table', head: ['مرحله', 'از ماه', 'تا ماه', 'مسئول', 'اسناد', 'نهادها', 'مجوزها'], rows: R.roadmap.map(function (s) { return [s.step, s.from, s.to, s.owner, (s.docs || []).join('؛ ') || '—', (s.inst || []).join('، ') || '—', (s.lic || []).join('؛ ') || '—']; }) }); }
    }
    Bk.push({ t: 'h3', x: 'ه) فرض‌های محاسبه (ورودی شما، نه نرخ بازار)' });
    Bk.push({ t: 'table', head: ['فرض', 'مقدار'], rows: Object.keys(ENG().PLAB).map(function (k) { return [ENG().PLAB[k], E.P[k] == null || E.P[k] === '' ? 'وارد نشده' : String(E.P[k])]; }) });
    if (E.P.hurdle == null || E.P.hurdle === '') gaps.push('هزینهٔ فرصت و NPV: نرخ تنزیل وارد نشده است.');
    Gd.missing.forEach(function (k) { gaps.push((MISS[k] || k) + ' وارد نشده است.'); });
    ['listing', 'form'].forEach(function (k) { if (co[k] === 'unk') gaps.push((k === 'listing' ? 'وضعیت پذیرش در بازار سرمایه' : 'شخصیت حقوقی') + ' نامشخص است.'); });
    ['opinion', 'rating', 'guarantor'].forEach(function (k) { if (E.fin[k] === 'unk') gaps.push({ opinion: 'اظهارنظر حسابرس', rating: 'رتبهٔ اعتباری', guarantor: 'وجود ضامن' }[k] + ' نامشخص است.'); });
    // ---------- 4 gaps ----------
    Bk.push({ t: 'h2', x: '۴. آنچه با اطلاعات فعلی قابل تکمیل نیست' });
    gaps = gaps.filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (gaps.length) Bk.push({ t: 'ul', x: gaps }); else Bk.push({ t: 'p', x: 'همهٔ بخش‌های گزارش با اطلاعات واردشده تکمیل شده است.' });
    Bk.push({ t: 'small', x: 'نرخ‌ها، سقف‌ها و کارمزدها ورودی شما هستند و باید با متن جاری مقررات (سازمان بورس، فرابورس، بورس تهران، بورس کالا) و شرایط روز بازار تطبیق داده شوند. این گزارش غربالگری است و جای مشاور حقوقی و مالیاتی انتشار را نمی‌گیرد.' });
    return Bk;
  }
  function fa0(v) { return String(v).replace(/\d/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }); }
  function reportTab(ctx) {
    var Xr = ctx.R.X, Bk = finReport(Xr), R = Xr.REC, main = R.main, extra = [];
    if (main && main.type === 'c') extra.push(comboView(main.c)); else if (main && main.type === 's' && main.r.eco) extra.push(ecoView(main.r.eco, main.r));
    return ctx.group([ctx.panel('گزارش راه‌حل و نقشهٔ اجرا', [h('p', { class: 'f-help', 'data-notr': '1', text: 'ساختار گزارش: اول نتیجه، بعد سه دلیل، بعد شواهد، و در پایان هر چیزی که با اطلاعات فعلی قابل تکمیل نیست. هیچ عددی جز اعداد واردشدهٔ شما و محاسبه از روی آن‌ها در گزارش نیست.' }), Hub.report.buttons(function () { return finReport(ctx.R.X); }, 'Financing_Solution_' + (Xr.E.co.name || 'report').replace(/\s+/g, '_')), Hub.report.lintPanel(function () { return finReport(ctx.R.X); }), Hub.report.dom(Bk)]), ctx.panel('گزارش در قالب مقاله', [Hub.report.articlePanel(function () { return finReport(ctx.R.X); }, { name: 'Financing_Article' })]),
      extra.length ? ctx.panel('نمودار و تحلیل اقتصادی راه‌حل پیشنهادی', extra) : null, ctx.panel('گزارش تفصیلی (نسخهٔ قبلی)', [h('details', null, [h('summary', { 'data-notr': '1', text: 'نمایش' }), reportBody(Xr)])])]);
  }
  /* ---------- 0 · intake: write the situation, confirm what was read, get the solution ---------- */
  function intakeTab(ctx) {
    var S = ctx.S, E = ensure(S), Xr = ctx.R.X, I = Hub.finIntake, st = h('div', { class: 'studio-status', 'aria-live': 'polite' }), box = h('div'), items = S._intake || [];
    var ta = h('textarea', { class: 'f-area', rows: 9, dir: 'rtl', 'aria-label': 'شرح وضعیت و نیاز', placeholder: 'مثال: شرکت تولیدی سهامی خاص و غیربورسی هستیم. فروش سالانه ۱۲٬۰۰۰ میلیارد ریال، سود عملیاتی ۲٬۴۰۰ میلیارد ریال، هزینهٔ مالی ۶۰۰ میلیارد ریال، جمع دارایی‌ها ۲۰٬۰۰۰ میلیارد ریال، جمع بدهی‌ها ۹٬۰۰۰ میلیارد ریال، تسهیلات بانکی ۴٬۰۰۰ میلیارد ریال. برای سرمایه در گردش به ۳٬۰۰۰ میلیارد ریال نیاز داریم، ظرف ۶ ماه. یک ملک اداری به ارزش ۵٬۰۰۰ میلیارد ریال داریم. ضامن بانکی داریم و تمایلی به افزایش سرمایه نداریم.' }); ta.value = E.note || ''; ta.addEventListener('change', function () { E.note = ta.value; });
    function paint() {
      U.clear(box); if (!items.length) return;
      var tb = h('tbody', null, items.map(function (it) { var cb = h('input', { type: 'checkbox', 'aria-label': 'تأیید ' + it.label, disabled: it.value == null }); cb.checked = !!it.ok && it.value != null; cb.addEventListener('change', function () { it.ok = cb.checked; });
        return h('tr', null, [h('td', null, [cb]), h('td', { 'data-notr': '1', text: it.label + (it.ai ? ' (هوش مصنوعی)' : '') }), h('td', { 'data-notr': '1', class: it.value == null ? 'warn-t' : '', text: it.text }), h('td', { class: 'small', 'data-notr': '1', style: 'white-space:normal', text: '«' + it.quote + '»' })]); }));
      box.appendChild(h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, ['تأیید', 'فیلد', 'مقدار خوانده‌شده (' + ({ million: 'میلیون ریال', billion: 'میلیارد ریال', thousand: 'هزار ریال' }[E.co.unit] || 'میلیون ریال') + ')', 'عبارت متن شما'].map(function (x) { return h('th', { class: 'lbl', 'data-notr': '1', text: x }); }))]), tb])]));
      box.appendChild(h('div', { class: 'row-ctl' }, [h('button', { class: 'btn primary', type: 'button', 'data-notr': '1', text: 'اعمال موارد تأییدشده و ساخت راه‌حل', onclick: function () { var n = I.apply(E, items); S._intake = []; U.toast(fa0(n) + ' مورد در فرم ثبت شد.', 'good'); ctx.rerender(); } })]));
      box.appendChild(h('p', { class: 'small muted', 'data-notr': '1', text: 'فقط چیزی خوانده می‌شود که در متن نوشته‌اید؛ کنار هر مقدار عبارت خود شما آمده است. مبلغی که واحد پولش نوشته نشده اعمال نمی‌شود. هر چیزی که در متن نبود «نامشخص» می‌ماند و در گزارش به‌عنوان کمبود اطلاعات می‌آید.' }));
    }
    var read = h('button', { class: 'btn primary', type: 'button', 'data-notr': '1', text: 'خواندن اطلاعات از متن', onclick: function () { E.note = ta.value; items = S._intake = I.parse(ta.value, E.co.unit); st.textContent = items.length ? fa0(items.length) + ' مورد خوانده شد؛ بررسی و تأیید کنید.' : 'چیزی که با فیلدهای فرم جور باشد در متن پیدا نشد. اعداد را با واحد بنویسید (مثلاً «فروش ۱۲٬۰۰۰ میلیارد ریال»).'; paint(); } });
    var ai = h('button', { class: 'btn', type: 'button', 'data-notr': '1', text: 'خواندن با هوش مصنوعی (در صورت اتصال)', onclick: function () { E.note = ta.value; var sp = Hub.ai ? Hub.ai.sampler() : Promise.resolve(null);
      sp.then(function (s) { if (!s) { st.textContent = 'هوش مصنوعی وصل نیست؛ از «خواندن اطلاعات از متن» استفاده کنید.'; return; } st.textContent = 'در حال خواندن…';
        var prompt = 'Extract ONLY facts that are explicitly written in the Persian text below. Do not infer, estimate or add anything. Return JSON {"items":[{"k":field,"value":value,"digits":"the digits of the number exactly as they appear in the text (numbers only)","quote":"the exact phrase copied from the text"}]}. Numeric values must be in ' + ({ million: 'million rials', billion: 'billion rials', thousand: 'thousand rials' }[E.co.unit] || 'million rials') + ' (1 toman = 10 rials; 1 همت = 10,000 billion rials). Skip any amount whose currency is not stated. Fields: ' + I.fields().map(function (f) { return f[0] + ' (' + f[1] + ': ' + f[2] + ')'; }).join('; ') + '.\n\nTEXT:\n' + ta.value;
        return s.json(prompt, { modelTier: 'complex' }).then(function (j) { var c = I.check(ta.value, j && j.items), have = {}; items = I.parse(ta.value, E.co.unit); items.forEach(function (x) { have[x.k] = 1; }); c.items.forEach(function (x) { if (!have[x.k]) items.push(x); }); S._intake = items;
          st.textContent = fa0(items.length) + ' مورد خوانده شد' + (c.dropped ? '؛ ' + fa0(c.dropped) + ' مورد از پاسخ هوش مصنوعی کنار گذاشته شد چون عبارتش در متن شما نبود.' : '.'); paint(); }); }).catch(function (e) { st.textContent = 'ناموفق: ' + (e && e.message || e); }); } });
    paint();
    var Bk = finReport(Xr), cut = 0; for (var i = 0; i < Bk.length; i++) if (Bk[i].t === 'h2' && /^۳\./.test(Bk[i].x)) { cut = i; break; }
    var gapI = -1; for (var j = 0; j < Bk.length; j++) if (Bk[j].t === 'h2' && /^۴\./.test(Bk[j].x)) gapI = j;
    var brief = Bk.slice(1, cut || Bk.length).concat(gapI >= 0 ? Bk.slice(gapI) : []);
    return ctx.group([ctx.panel('۱. وضعیت شرکت و نیازتان را بنویسید', [h('p', { class: 'f-help', 'data-notr': '1', text: 'به زبان خودتان بنویسید: شرکت چیست، اعداد اصلی مالی، چقدر و برای چه نیاز دارید، چه دارایی‌هایی دارید و چه محدودیت‌هایی. برنامه اعداد و شرایط را می‌خواند، برای تأیید نشان می‌دهد و بعد راه‌حل می‌سازد. فرم کامل در زبانهٔ «تشخیص و ارزیابی شرکت» است و هر دو یک داده را پر می‌کنند.' }), ta, h('div', { class: 'row-ctl' }, [read, ai]), st, box]),
      ctx.panel('۲. راه‌حل با اطلاعات فعلی', [Hub.report.dom(brief), h('div', { class: 'row-ctl' }, [h('button', { class: 'btn', type: 'button', 'data-notr': '1', text: 'گزارش کامل', onclick: function () { var b = document.querySelectorAll('[data-tab="report"]'); if (b.length) b[0].click(); } }), h('button', { class: 'btn', type: 'button', 'data-notr': '1', text: 'تکمیل فرم', onclick: function () { var b = document.querySelectorAll('[data-tab="diag"]'); if (b.length) b[0].click(); } })])])]);
  }

  /* ---------- Excel ---------- */
  function excel(b, S, Xr) {
    var opt = { rightToLeft: true }, put = function (sh, r, vals, kind) { vals.forEach(function (v, i) { sh.put(1 + i, r, v, kind || (typeof v === 'number' ? 'calc' : 'wrap'), typeof v === 'number' ? 'money' : undefined); }); };
    var D1 = b.sheet('تشخیص', [2, 46, 18, 14, 60], opt); D1.title('تشخیص وضعیت مالی', (Xr.E.co.name || '') + ' · حالت: ' + Xr.mode + ' · مسئلهٔ اصلی: ' + Xr.mainProblem);
    put(D1, 4, ['شاخص', 'مقدار', 'وضعیت', 'فرمول'], 'hdr'); Xr.G.ratios.forEach(function (r, i) { put(D1, 5 + i, [r.fa, r.kind === 'text' ? r.note : (isFinite(r.v) ? r.v : 'نامشخص'), r.status, r.formula]); });
    var o0 = 7 + Xr.G.ratios.length; put(D1, o0, ['فرصت', 'ارزش', 'راهکارها', 'شاهد'], 'hdr'); Xr.O.forEach(function (o, i) { put(D1, o0 + 1 + i, [o.t, isFinite(o.val) ? o.val : '', o.sol.map(solName).join('، '), o.ev]); });
    var S2 = b.sheet('راهکارها', [2, 44, 18, 14, 12, 10, 10, 10, 10, 10, 16, 60, 60], opt); S2.title('راهکارهای مرتبط با امتیاز و مبلغ', 'وزن‌ها: اجرایی ' + Xr.E.W.reg + '، تناسب ' + Xr.E.W.fit + '، هزینه ' + Xr.E.W.cost + '، سرعت ' + Xr.E.W.speed + '، مالکیت ' + Xr.E.W.own);
    put(S2, 4, ['راهکار', 'موتور', 'وضعیت', 'قطعی', 'اجرایی', 'تناسب', 'هزینه', 'سرعت', 'مالکیت', 'امتیاز کل (فرمول)', 'مبلغ بالقوه', 'فرمول مبلغ', 'شرایط و موانع'], 'hdr');
    var rows = Xr.R.filter(function (r) { return r.label !== 'na'; }).sort(function (a, b) { return b.sc.total - a.sc.total; });
    S2.put(1, 3, 'وزن‌ها →', 'sub'); ['reg', 'fit', 'cost', 'speed', 'own'].forEach(function (k, i) { S2.put(5 + i, 3, Xr.E.W[k], 'in', 'dec'); });
    rows.forEach(function (r, i) { var y = 5 + i; put(S2, y, [r.s.fa, B().ENGINE[r.s.e][0], LABEL[r.label][0], r.definitive ? 'بله' : 'خیر']); [r.sc.reg, r.sc.fit, r.sc.cost, r.sc.speed, r.sc.own].forEach(function (v, j) { S2.put(5 + j, y, v, 'in', 'dec'); });
      S2.put(10, y, { f: '=SUMPRODUCT(F' + y + ':J' + y + ',$F$3:$J$3)/SUM($F$3:$J$3)' }, 'calc', 'dec'); S2.put(11, y, isFinite(r.z.amt) ? r.z.amt : null, 'calc', 'money'); S2.put(12, y, r.z.formula, 'wrap'); S2.put(13, y, r.gates.map(function (g) { return g.n + ': ' + g.r; }).join(' · '), 'wrap'); });
    var S3 = b.sheet('ساختار و نقشه اجرا', [2, 50, 14, 30, 50, 50], opt), R = Xr.REC; S3.title('ساختار پیشنهادی و برنامهٔ عملیاتی', 'اصلی: ' + recName(R.main) + ' · جایگزین: ' + recName(R.alt) + ' · مکمل: ' + recName(R.comp));
    put(S3, 4, ['مرحله', 'از ماه', 'تا ماه', 'مسئول', 'اسناد', 'نهادها'], 'hdr'); R.roadmap.forEach(function (s, i) { put(S3, 5 + i, [s.step, s.from, s.to, s.owner, (s.docs || []).join('؛ '), (s.inst || []).join('، ')]); });
    if (R.main && R.main.type === 'c') { var y0 = 7 + R.roadmap.length; put(S3, y0, ['پرسش ساختار', 'پاسخ'], 'hdr'); QL.forEach(function (q, i) { put(S3, y0 + 1 + i, [q, R.main.c.c.q[i]]); }); put(S3, y0 + 10, ['جریان وجوه: از', 'به', 'شرح'], 'hdr'); R.main.c.c.edges.forEach(function (e, i) { var nm = function (id) { return (R.main.c.c.nodes.filter(function (n) { return n[0] === id; })[0] || [])[1]; }; put(S3, y0 + 11 + i, [nm(e[0]), nm(e[1]), e[2]]); }); }
    var S4 = b.sheet('تحلیل مالی', [2, 40, 16, 16, 16, 16, 16, 16, 16], opt); S4.title('تحلیل اقتصادی راهکارهای دارای مبلغ', 'هزینهٔ یک‌باره و نرخ‌ها فرض‌های قابل تغییر شما هستند');
    put(S4, 4, ['راهکار', 'ناخالص', 'هزینهٔ یک‌باره ٪', 'خالص (فرمول)', 'نرخ تمام‌شده', 'هزینهٔ سالانه (فرمول)', 'بدهی خالص/EBITDA پس از', 'پوشش بهره پس از'], 'hdr');
    rows.filter(function (r) { return r.eco; }).forEach(function (r, i) { var y = 5 + i, e = r.eco; S4.put(1, y, r.s.fa, 'wrap'); S4.put(2, y, e.gross, 'in', 'money'); S4.put(3, y, e.up, 'in', 'pct2'); S4.put(4, y, { f: '=C' + y + '*(1-D' + y + ')' }, 'calc', 'money'); S4.put(5, y, isFinite(e.rate) ? e.rate : null, 'in', 'pct2'); S4.put(6, y, isFinite(e.rate) && r.s.k === 'debt' ? { f: '=C' + y + '*F' + y } : null, 'calc', 'money'); S4.put(7, y, isFinite(e.ndE) ? e.ndE : null, 'calc', 'dec'); S4.put(8, y, isFinite(e.icov) ? e.icov : null, 'calc', 'dec'); });
    var S5 = b.sheet('بانک راهکارها', [2, 8, 34].concat(FIELDS.slice(3).map(function () { return 40; })), opt); S5.title('بانک اطلاعاتی راهکارها — پروفایل استاندارد ۳۰ بخشی', B().SOL.length + ' راهکار مستقل + ' + B().COMBO.length + ' ساختار ترکیبی · آخرین بازبینی ' + B().REVIEWED);
    put(S5, 4, FIELDS.map(function (f) { return f[1]; }), 'hdr');
    B().SOL.forEach(function (s, i) { put(S5, 5 + i, FIELDS.map(function (f) { var v = s[f[0]]; return f[0] === 'law' ? v.map(function (l) { return l[0] + ' [' + FLAG[l[1]] + ']'; }).join(' | ') : f[0] === 'tm' ? v[0] + '–' + v[1] + ' ماه' : f[0] === 'e' ? B().ENGINE[v][0] : f[0] === 'st' ? B().STATUS[v][0] : Array.isArray(v) ? v.join(' | ') : v; })); });
    var S6 = b.sheet('فرض‌ها و ورودی‌ها', [2, 60, 20], opt); S6.title('فرض‌های محاسبه (ورودی شما — نرخ بازار نیست)');
    Object.keys(ENG().PLAB).forEach(function (k, i) { put(S6, 4 + i, [ENG().PLAB[k], Xr.E.P[k] == null ? 'وارد نشده' : Xr.E.P[k]]); });
  }

  Hub.finUI = { intakeTab: intakeTab, finReport: finReport, ensure: ensure, compute: compute, diagTab: diagTab, engineTab: engineTab, structTab: structTab, rankTab: rankTab, reportTab: reportTab, excel: excel, reportBody: reportBody };
})(typeof window !== 'undefined' ? window : globalThis);
