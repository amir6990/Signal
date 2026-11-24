/* =====================================================================
 * FINANCING INTAKE — reads a free-text description of a company and its funding need and
 * proposes values for the financing engine's form. Nothing is applied until the user ticks it.
 * Rules (no guessing):
 *   · a value is proposed only when the text states it; every proposal carries the exact phrase it came from
 *   · an amount without a currency (ریال / تومان / همت) is shown as "unit not stated" and is not ticked
 *   · همت = هزار میلیارد تومان = 10,000 میلیارد ریال
 * check(text, items) validates items that came from an AI model: an item whose quote is not in the text is dropped.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  function norm(s) { return String(s == null ? '' : s).replace(/[۰-۹]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c); }).replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); }).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀ]/g, 'ه').replace(/هٔ/g, 'ه').replace(/‌/g, ' ').replace(/[٬]/g, ',').replace(/[٫]/g, '.'); }
  var NUM = '(\\d[\\d,]*(?:[./]\\d+)?)\\s*(هزار میلیارد|میلیارد|میلیون|هزار|همت)?\\s*(ریال|تومان|تومن)?';
  var UNIT = { thousand: 1e3, million: 1e6, billion: 1e9 };
  // -> rials, or null when the currency is not stated
  function rials(m) {
    var v = parseFloat(String(m[1]).replace(/,/g, '').replace('/', '.')); if (!isFinite(v)) return { v: NaN };
    var sc = m[2], cur = m[3];
    if (sc === 'همت') return { v: v * 1e13, said: m[0].trim() };
    var k = sc === 'هزار میلیارد' ? 1e12 : sc === 'میلیارد' ? 1e9 : sc === 'میلیون' ? 1e6 : sc === 'هزار' ? 1e3 : 1;
    if (!cur) return { v: NaN, raw: v * k, said: m[0].trim(), noCur: true };
    return { v: v * k * (cur === 'ریال' ? 1 : 10), said: m[0].trim() };
  }
  var AMT = [   // most specific first; a stretch of text is used once
    ['co.need', 'مبلغ موردنیاز', 'نیاز(?:مند)?(?: به)?(?: تامین مالی)?(?: مبلغ)?|مبلغ مورد ?نیاز|تامین مالی(?: به مبلغ| معادل)?|به دنبال(?: تامین| جذب)?'],
    ['co.projectCost', 'هزینهٔ طرح / پروژه', 'هزینه (?:ی )?(?:طرح|پروژه)|سرمایه گذاری (?:طرح|پروژه)'],
    ['fin.cogs', 'بهای تمام‌شده', 'بهای تمام شده'],
    ['fin.ebitda', 'EBITDA', 'EBITDA|ebitda|ایبیتدا|سود قبل از بهره،? مالیات و استهلاک'],
    ['fin.ebit', 'سود عملیاتی', 'سود عملیاتی'],
    ['fin.pbt', 'سود قبل از مالیات', 'سود قبل از مالیات'],
    ['fin.ni', 'سود خالص', 'سود خالص'],
    ['fin.fc', 'هزینهٔ مالی', 'هزینه (?:های )?مالی'],
    ['fin.cfo1', 'جریان نقد عملیاتی سال آخر', 'جریان (?:وجوه )?نقدی? (?:حاصل از )?(?:فعالیت های )?عملیاتی?'],
    ['fin.eq', 'حقوق مالکانه', 'حقوق (?:صاحبان سهام|مالکانه)'],
    ['fin.cap', 'سرمایهٔ ثبت‌شده', 'سرمایه (?:ی )?ثبت شده|سرمایه (?:ی )?شرکت'],
    ['fin.cash', 'وجه نقد', 'وجه نقد|موجودی نقد|نقدینگی'],
    ['fin.debt', 'بدهی بهره‌دار (تسهیلات)', 'تسهیلات(?: مالی| بانکی)?|بدهی (?:های )?(?:مالی|بانکی|بهره دار)'],
    ['fin.ar', 'مطالبات', 'مطالبات|حساب های دریافتنی'],
    ['fin.inv', 'موجودی کالا', 'موجودی (?:مواد و )?کالا'],
    ['fin.ta', 'جمع دارایی‌ها', '(?:جمع |کل |مجموع )?دارایی ?ها'],
    ['fin.tl', 'جمع بدهی‌ها', '(?:جمع |کل |مجموع )?بدهی ?ها'],
    ['co.valuation', 'ارزش سهام شرکت', 'ارزش (?:روز )?(?:شرکت|سهام)'],
    ['fin.rev', 'فروش / درآمد عملیاتی', 'فروش(?: سالانه| خالص)?|درآمد(?: عملیاتی| سالانه)?']
  ];
  var CAT = [
    ['co.purpose', 'هدف تأمین مالی', [['wc', 'سرمایه در گردش', 'سرمایه در گردش'], ['project', 'تأمین مالی پروژه', 'تامین مالی پروژه'], ['expand', 'طرح توسعه', 'طرح توسعه|توسعه (?:ی )?(?:خط|ظرفیت|کارخانه)'], ['fixed', 'سرمایه‌گذاری ثابت', 'خرید (?:ماشین آلات|تجهیزات)|سرمایه گذاری ثابت'], ['refi', 'بازپرداخت بدهی', '(?:بازپرداخت|تسویه) (?:ی )?(?:بدهی|تسهیلات)'], ['restructure', 'اصلاح ساختار مالی', 'اصلاح ساختار (?:مالی|سرمایه)'], ['monet', 'مولدسازی دارایی', 'مولدسازی']]],
    ['co.listing', 'وضعیت پذیرش', [['none', 'غیربورسی', 'غیر ?بورسی|در بورس (?:پذیرفته )?نیست|پذیرفته نشده'], ['ifb', 'فرابورس', 'فرابورس'], ['tse', 'بورس تهران', 'بورس (?:اوراق بهادار )?تهران|پذیرفته شده در بورس(?! کالا)']]],
    ['co.form', 'شخصیت حقوقی', [['pjs', 'سهامی عام', 'سهامی عام'], ['prjs', 'سهامی خاص', 'سهامی خاص']]],
    ['fin.opinion', 'اظهارنظر حسابرس', [['unqualified', 'مقبول', '(?:گزارش|اظهار ?نظر)[^.؛\\n]{0,25}مقبول'], ['qualified', 'مشروط', '(?:گزارش|اظهار ?نظر)[^.؛\\n]{0,25}مشروط'], ['none', 'حسابرسی نشده', 'حسابرسی نشده']]],
    ['fin.guarantor', 'ضامن در دسترس', [['no', 'خیر', 'ضامن (?:بانکی )?(?:ندارد|نداریم|نیست)|بدون ضامن'], ['yes', 'بله', 'ضامن (?:بانکی |معتبر )?(?:دارد|داریم|در دسترس)']]],
    ['co.fxRevenue', 'درآمد ارزی', [['no', 'خیر', 'درآمد ارزی (?:ندارد|نداریم)'], ['yes', 'بله', 'درآمد ارزی(?: دارد| داریم)?']]],
    ['co.ime', 'محصول پذیرفته‌شده در بورس کالا', [['yes', 'بله', '(?:پذیرفته شده|عرضه)[^.؛\\n]{0,20}در بورس کالا|در بورس کالا (?:پذیرفته|عرضه)']]],
    ['co.canEquity', 'امکان افزایش سرمایه', [['no', 'خیر', '(?:نمی خواه|تمایل(?:ی)? ندار|امکان[^.؛\\n]{0,12}ندار|بدون)[^.؛\\n]{0,30}افزایش سرمایه|افزایش سرمایه[^.؛\\n]{0,25}(?:ممکن نیست|نمی خواه|مد نظر نیست|ندار)'], ['yes', 'بله', 'افزایش سرمایه (?:ممکن است|امکان پذیر است|مد نظر است)']]],
    ['co.investorOk', 'امکان ورود سرمایه‌گذار', [['no', 'خیر', '(?:نمی خواه|تمایل(?:ی)? ندار|بدون)[^.؛\\n]{0,30}(?:سهامدار جدید|شریک|سرمایه گذار جدید)|(?:سهامدار جدید|شریک|سرمایه گذار جدید)[^.؛\\n]{0,25}(?:نمی خواه|ندار)'], ['yes', 'بله', '(?:آماده|پذیرا|موافق)[^.؛\\n]{0,20}(?:ورود )?(?:سرمایه گذار|شریک)']]],
    ['co.assetSaleOk', 'امکان فروش دارایی', [['no', 'خیر', '(?:نمی خواه|تمایل(?:ی)? ندار|بدون)[^.؛\\n]{0,30}فروش (?:دارایی|ملک|املاک)|فروش (?:دارایی|ملک|املاک)[^.؛\\n]{0,25}(?:نمی خواه|ندار|ممکن نیست)'], ['yes', 'بله', '(?:آماده|امکان)[^.؛\\n]{0,15}فروش (?:دارایی|ملک|املاک)']]],
    ['co.controlPriority', 'اولویت حفظ کنترل', [['high', 'زیاد', 'حفظ (?:کنترل|مالکیت)']]]
  ];
  var ASSET = [['realestate', 'ملک|زمین|ساختمان|سوله|انبار|املاک'], ['machinery', 'ماشین آلات|تجهیزات|خط تولید']];
  function show(v, unit) { var x = v / (UNIT[unit] || 1e6); return (Math.round(x * 100) / 100).toLocaleString('en-US'); }
  function parse(text, unit) {
    var t = norm(text), out = [], used = [], free = function (a, b) { return !used.some(function (u) { return a < u[1] && b > u[0]; }); };
    AMT.forEach(function (F) {
      var re = new RegExp('(' + F[2] + ')[^\\d\\n.؛،]{0,45}?' + NUM, 'g'), m;
      while ((m = re.exec(t))) { var a = m.index, b = a + m[0].length; if (!free(a, b)) continue; var mm = [m[0].slice(m[1].length), m[2], m[3], m[4]], r = rials(mm); if (!isFinite(r.v) && !r.noCur) continue;
        used.push([a, b]); if (out.some(function (o) { return o.k === F[0]; })) continue;
        out.push({ k: F[0], label: F[1], value: r.noCur ? null : Math.round(r.v / (UNIT[unit] || 1e6) * 1000) / 1000, text: r.noCur ? 'واحد پول نوشته نشده (ریال یا تومان؟)' : show(r.v, unit), quote: text.slice(a, b), ok: !r.noCur, kind: 'num' }); break; }
    });
    // "به ۳۰۰ میلیارد تومان نیاز داریم": the amount comes before the word
    if (!out.some(function (o) { return o.k === 'co.need' && o.ok; })) { var rn = new RegExp('(?:به |مبلغ )' + NUM + '[^\\d\\n.؛،]{0,20}?(?:نیاز|لازم|احتیاج)').exec(t);
      if (rn) { var r0 = rials([rn[0], rn[1], rn[2], rn[3]]); out = out.filter(function (o) { return o.k !== 'co.need'; }); out.unshift({ k: 'co.need', label: 'مبلغ موردنیاز', value: r0.noCur ? null : Math.round(r0.v / (UNIT[unit] || 1e6) * 1000) / 1000, text: r0.noCur ? 'واحد پول نوشته نشده (ریال یا تومان؟)' : show(r0.v, unit), quote: text.slice(rn.index, rn.index + rn[0].length), ok: !r0.noCur, kind: 'num' }); } }
    var mo = /(?:ظرف|طی|تا|در)\s*(\d{1,3})\s*ماه(?: آینده)?/.exec(t); if (mo) out.push({ k: 'co.needBy', label: 'زمان موردنیاز (ماه)', value: +mo[1], text: mo[1], quote: text.slice(mo.index, mo.index + mo[0].length), ok: true, kind: 'num' });
    CAT.forEach(function (C) { for (var i = 0; i < C[2].length; i++) { var m = new RegExp(C[2][i][2]).exec(t); if (m) { out.push({ k: C[0], label: C[1], value: C[2][i][0], text: C[2][i][1], quote: text.slice(m.index, m.index + m[0].length), ok: true, kind: 'cat' }); break; } } });
    ASSET.forEach(function (A) { var re = new RegExp('((?:' + A[1] + ')[^.؛\\n\\d]{0,50}?)(?:به )?ارزش[^\\d\\n.؛]{0,20}?' + NUM, 'g'), m;
      while ((m = re.exec(t))) { var r = rials([m[0], m[2], m[3], m[4]]); out.push({ k: 'asset', label: 'دارایی (' + (A[0] === 'realestate' ? 'ملک' : 'ماشین‌آلات') + ')', value: r.noCur ? null : { type: A[0], name: text.slice(m.index, m.index + m[1].length).trim(), mv: Math.round(r.v / (UNIT[unit] || 1e6) * 1000) / 1000 }, text: r.noCur ? 'واحد پول نوشته نشده' : m[1].trim() + ' — ' + show(r.v, unit), quote: text.slice(m.index, m.index + m[0].length), ok: !r.noCur, kind: 'asset' }); } });
    return out;
  }
  // items from a language model: keep only known fields whose quote really is in the text
  function check(text, items) {
    var t = norm(text), known = {}; AMT.forEach(function (F) { known[F[0]] = F[1]; }); CAT.forEach(function (C) { known[C[0]] = C[1]; }); known['co.needBy'] = 'زمان موردنیاز (ماه)'; known['co.name'] = 'نام شرکت'; known['co.industry'] = 'صنعت';
    var kept = [], dropped = 0;
    (items || []).forEach(function (it) { if (!it || !known[it.k] || !it.quote || t.indexOf(norm(it.quote)) < 0) { dropped++; return; }
      var cat = CAT.filter(function (C) { return C[0] === it.k; })[0];
      if (cat) { var o = cat[2].filter(function (x) { return x[0] === it.value; })[0]; if (!o) { dropped++; return; } kept.push({ k: it.k, label: known[it.k], value: it.value, text: o[1], quote: it.quote, ok: true, kind: 'cat', ai: true }); return; }
      if (it.k === 'co.name' || it.k === 'co.industry') { if (t.indexOf(norm(it.value)) < 0) { dropped++; return; } kept.push({ k: it.k, label: known[it.k], value: String(it.value), text: String(it.value), quote: it.quote, ok: true, kind: 'text', ai: true }); return; }
      var v = Number(it.value); if (!isFinite(v)) { dropped++; return; }
      // the digits of the number must appear in the quote
      var dg = String(it.digits == null ? '' : it.digits).replace(/[^\d]/g, ''); if (!dg || norm(it.quote).replace(/[^\d]/g, '').indexOf(dg) < 0) { dropped++; return; }
      kept.push({ k: it.k, label: known[it.k], value: v, text: String(v), quote: it.quote, ok: true, kind: 'num', ai: true }); });
    return { items: kept, dropped: dropped };
  }
  function apply(E, items) {
    var n = 0; items.forEach(function (it) { if (!it.ok || it.value == null) return;
      if (it.kind === 'asset') { E.assets = E.assets || []; if (!E.assets.some(function (a) { return a.name === it.value.name && a.mv === it.value.mv; })) { E.assets.push({ type: it.value.type, name: it.value.name, mv: it.value.mv, bv: null, inc: null, util: null, idle: null, title: 'unk', transfer: 'unk', pledge: 'unk', use: 'other', strategic: 'unk', develop: 'unk', listed: 'unk', stake: null, sub: 'no', profitable: 'unk', longterm: 'unk', counter: 'unk', ime: 'unk' }); n++; } return; }
      var p = it.k.split('.'), o = E[p[0]]; if (!o) return; o[p[1]] = it.value; n++; });
    return n;
  }
  function fields() { return AMT.map(function (F) { return [F[0], F[1], 'number']; }).concat(CAT.map(function (C) { return [C[0], C[1], C[2].map(function (x) { return x[0]; }).join('|')]; })).concat([['co.needBy', 'زمان موردنیاز (ماه)', 'number'], ['co.name', 'نام شرکت', 'text'], ['co.industry', 'صنعت', 'text']]); }
  Hub.finIntake = { parse: parse, check: check, apply: apply, fields: fields, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.finIntake;
})(typeof window !== 'undefined' ? window : globalThis);
