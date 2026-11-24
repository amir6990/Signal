/* =====================================================================
 * AUDIT CORE — the single engine behind the Strict Auditor.
 *
 * One analysis per imported statement file, computed locally (no cloud,
 * no language model): the rule engine of the Strict Auditor run on the
 * company series. Every other section (financing, valuation, company
 * model) reads the same result through Hub.auditCore.result(), so a figure
 * such as operating cash flow has one value, one definition and one
 * calculation ID across the hub.
 *
 *   result()          -> { id, ver, at, file, years, unit, currency, key, ratios, findings, count, defs } | null
 *   caseFile()        -> the company case file: every imported version with its key figures, findings and the diff to the previous one
 *   compare(label, theirs, ours, kind) -> one consistency line (used by other sections to report a mismatch)
 *   CAPS              -> what runs offline / needs a local model / needs an online source
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var RULES_VER = 'audit-rules 2026.11.1';
  var CKEY = 'hub.coFile.v1';
  // one definition per ratio, shown wherever the ratio is shown
  var DEFS = {
    currentRatio: 'دارایی‌های جاری ÷ بدهی‌های جاری (پایان سال)',
    quickRatio: '(دارایی‌های جاری − موجودی کالا) ÷ بدهی‌های جاری',
    debtRatio: 'جمع بدهی‌ها ÷ جمع دارایی‌ها',
    netDebtEbitda: '(بدهی مالی − وجه نقد) ÷ EBITDA',
    interestCover: 'سود عملیاتی ÷ هزینهٔ مالی',
    cfoNi: 'جریان نقد عملیاتی ÷ سود خالص',
    z: 'Altman Z″ (۲۰۰۰): ۶٫۵۶·X1 + ۳٫۲۶·X2 + ۶٫۷۲·X3 + ۱٫۰۵·X4',
    gm: 'سود ناخالص ÷ درآمد', ebitdaM: 'EBITDA ÷ درآمد', roe: 'سود خالص ÷ حقوق مالکانه', dso: 'مطالبات تجاری ÷ درآمد × ۳۶۵', dio: 'موجودی کالا ÷ بهای تمام‌شده × ۳۶۵', etr: 'مالیات ÷ سود قبل از مالیات'
  };
  // what the auditor does without any connection
  var CAPS = [
    ['خواندن Excel', 'کامل', '—', 'خوانندهٔ محلی فقط‌مقدار؛ حافظهٔ کم'],
    ['خواندن PDF (لایهٔ متنی)', 'کامل', '—', 'pdf.js محلی'],
    ['خواندن PDF اسکن‌شده', 'کامل (OCR محلی)', '—', 'Tesseract محلی؛ دقت کمتر — جمع‌ها را تطبیق دهید'],
    ['استخراج و گزارش کنترل استخراج', 'کامل', '—', 'تطبیق جمع‌ها، فرمول‌های بی‌مقدار، علت استخراج‌نشدن'],
    ['کنترل‌های حسابداری و مغایرت‌ها', 'کامل', '—', 'موتور قواعد ' + RULES_VER],
    ['نسبت‌ها، سرمایه در گردش، بدهی و توان بازپرداخت', 'کامل', '—', 'تعاریف یکسان در همهٔ بخش‌ها'],
    ['کیفیت سود و جریان نقد، تداوم فعالیت (Altman، ماده ۱۴۱)', 'کامل', '—', ''],
    ['بررسی یادداشت‌ها و متن گزارش حسابرس', 'قاعده‌محور (کلیدواژه و عدد)', 'تفسیر عمیق متن: مدل محلی یا ابری', 'بدون مدل، تناقض‌های ظریف متنی تشخیص داده نمی‌شوند'],
    ['گزارش نهایی و ذخیره در پرونده', 'کامل', '—', ''],
    ['آخرین مقررات و اطلاعات تازهٔ کدال', 'با آخرین نسخهٔ ذخیره‌شده در برنامه', 'منبع آنلاین', 'تاریخ مقررات به‌کاررفته در هر یافته ذکر شده است']];

  function hashStr(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }
  var MEMO = null;
  function result() {
    var CD = Hub.companyData, A = Hub.tools && Hub.tools.auditor, rec = CD && CD.get(); if (!rec || !A) return null;
    var S0 = (Hub.util && Hub.util.store && Hub.util.store.get('hub.auditor.v1', null)) || A.sample(), st = S0.settings || A.sample().settings;
    var sig = hashStr(JSON.stringify([rec.file, rec.savedAt, rec.unit, rec.blocks.map(function (b) { return [b.type, b.years, b.rows.length, b.rows.map(function (r) { return r.vals; })]; }), st.materiality, st.inflation, RULES_VER]));
    if (MEMO && MEMO.sig === sig) return MEMO.r;
    var D = CD.series(rec); if (!D) return null;
    var X = A.analyse(D, { settings: st }), l = D.n - 1, c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }; X.findings.forEach(function (f) { c[f.sev]++; });
    var key = { revenue: D.revenue[l], ni: D.ni[l], ebitda: D.ebitda[l], ebit: D.ebit[l], cfo: D.cfo ? D.cfo[l] : NaN, cfoPrev: D.cfo && l > 0 ? D.cfo[l - 1] : NaN, ta: D.ta[l], tl: D.tl ? D.tl[l] : NaN, equity: D.equity[l], debt: D.debt[l], cash: D.cash[l] };
    key.debtRatio = key.ta ? key.tl / key.ta : NaN;
    var r = { id: 'AUD-' + sig.slice(0, 8), ver: RULES_VER, at: new Date().toISOString(), file: rec.file, savedAt: rec.savedAt, years: D.years, year: D.years[l], unit: D.unit, currency: D.currency,
      key: key, ratios: Object.assign({ debtRatio: key.debtRatio }, X.ratios), findings: X.findings, count: c, defs: DEFS, src: 'فایل ' + rec.file + ' (واردشده ' + rec.savedAt + ')' };
    MEMO = { sig: sig, r: r }; record(r, rec); return r;
  }

  // company case file: one entry per imported version; the diff to the previous version is kept with it
  function caseFile() { var St = Hub.util && Hub.util.store; return (St && St.get(CKEY, null)) || { companies: {} }; }
  function record(r, rec) {
    try {
      var St = Hub.util && Hub.util.store; if (!St) return; var C = caseFile(), name = rec.company || rec.file, co = C.companies[name] = C.companies[name] || { name: name, versions: [] };
      var last = co.versions[co.versions.length - 1]; if (last && last.id === r.id) return;
      var N = Hub.companyData.notes ? Hub.companyData.notes() : null, titles = r.findings.map(function (f) { return f.sev + '|' + (f.title.fa || f.title); });
      var v = { id: r.id, ver: r.ver, at: r.at, file: r.file, savedAt: r.savedAt, years: r.years, unit: r.unit, currency: r.currency, key: r.key, ratios: r.ratios, count: r.count, titles: titles,
        report: N && N.report ? { status: N.report.status, statusFa: N.report.statusFa, hash: N.report.hash, sheets: N.report.nSheets, recon: N.report.recon } : null };
      if (last) v.diff = diff(last, v);
      co.versions.push(v); if (co.versions.length > 20) co.versions = co.versions.slice(-20); St.set(CKEY, C);
    } catch (e) { /* the case file is optional; the analysis still stands */ }
  }
  function diff(a, b) {
    var keys = Object.keys(b.key).filter(function (k) { return isFinite(a.key[k]) || isFinite(b.key[k]); }), ch = [];
    keys.forEach(function (k) { var x = a.key[k], y = b.key[k]; if (!(isFinite(x) && isFinite(y) && Math.abs(x - y) <= Math.max(1, Math.abs(x) * 1e-6))) ch.push({ k: k, from: x, to: y }); });
    var added = b.titles.filter(function (t) { return a.titles.indexOf(t) < 0; }), gone = a.titles.filter(function (t) { return b.titles.indexOf(t) < 0; });
    return { sameYears: JSON.stringify(a.years) === JSON.stringify(b.years), years: [a.years, b.years], changed: ch, added: added, cleared: gone, count: [a.count, b.count] };
  }
  /* one consistency line: another section's figure against the auditor's. kind 'sign' compares the sign, 'ratio' the value within 0.5 point */
  function compare(label, theirs, ours, kind, why) {
    var ok = !isFinite(theirs) || !isFinite(ours) ? null : kind === 'sign' ? (theirs > 0) === (ours > 0) : Math.abs(theirs - ours) <= 0.005;
    return { label: label, theirs: theirs, ours: ours, ok: ok, why: ok === false ? (why || 'اختلاف بی‌توضیح: منبع یا ورودی دستی این بخش با فایل حسابرسی‌شده یکی نیست') : '' };
  }
  var KEYFA = { revenue: 'درآمد', ni: 'سود خالص', ebitda: 'EBITDA', ebit: 'سود عملیاتی', cfo: 'جریان نقد عملیاتی', cfoPrev: 'جریان نقد عملیاتی سال قبل', ta: 'جمع دارایی‌ها', tl: 'جمع بدهی‌ها', equity: 'حقوق مالکانه', debt: 'بدهی مالی', cash: 'وجه نقد', debtRatio: 'نسبت بدهی' };

  Hub.auditCore = { RULES_VER: RULES_VER, DEFS: DEFS, CAPS: CAPS, KEYFA: KEYFA, result: result, caseFile: caseFile, compare: compare, reset: function () { MEMO = null; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.auditCore;
})(typeof window !== 'undefined' ? window : globalThis);
