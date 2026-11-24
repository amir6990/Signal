/* =====================================================================
 * STRICT AUDITOR — analytical review of a company's statements.
 *   1. Rule-based tests run on the imported statements (Excel or PDF via the
 *      Company data bar): arithmetic and consistency, cash-flow
 *      reconciliation, earnings quality (accruals, CFO vs profit, Beneish M),
 *      working capital, margins, tax, liquidity, leverage, going concern
 *      (Altman Z'', Commercial Code art. 141), legal reserve (art. 140),
 *      dividends, related parties, unusual movements.
 *      Each finding carries the evidence, a question for management and a
 *      recommended remedy / audit procedure.
 *   2. Claude review (inside the claude.ai artifact): a strict-auditor
 *      reading of every line plus the rule findings, optionally with pages of
 *      the notes from the PDF, returning risks, findings, questions,
 *      documents to request and adjustments to consider.
 * Analytical procedures flag where to look; they are not an audit opinion.
 * References: ISA 520 (analytical procedures), ISA 240 (fraud), ISA 570
 * (going concern); Iranian Commercial Code amendment of 1347 arts. 140, 141,
 * 240; Direct Taxation Act art. 105 (25% corporate rate); Altman (2000)
 * Z''-score; Beneish (1999) M-score.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var U = Hub.util;
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function fa() { return Hub.i18n && Hub.i18n.lang() === 'fa'; }
  function L(en, f) { return { en: en, fa: f }; }
  function tx(o) { return o && typeof o === 'object' && 'en' in o ? (fa() ? o.fa : o.en) : o; }
  var SEV = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

  function sample() {
    return { version: 1, tool: 'auditor', settings: { inflation: 0.35, materiality: 0.005, lang: 'auto' }, loaded: null, review: null, pages: '', sources: {} };
  }
  function pct(v) { return isFinite(v) ? (v * 100).toFixed(1) + '%' : '–'; }
  function f0(v) { return isFinite(v) ? Math.round(v).toLocaleString('en-US') : '–'; }
  function ser(a) { return a.map(f0).join(' → '); }
  function avg(a, i) { return i > 0 ? (a[i] + a[i - 1]) / 2 : a[i]; }
  function g(a, i) { return i > 0 && a[i - 1] ? a[i] / a[i - 1] - 1 : NaN; }

  function analyse(D, S) {
    var F = [], n = D.n, l = n - 1, Y = D.years, mat = Math.max(0.5, Math.abs(D.ta[l]) * num(S.settings.materiality));
    function add(sev, area, title, evidence, q, act, ref) { F.push({ sev: sev, area: area, title: title, evidence: evidence, q: q, act: act, ref: ref || '' }); }
    var yr = function (i) { return Y[i]; };

    /* 0. completeness */
    if (!D.lines.CF.length) add('medium', L('Completeness', 'کامل بودن'), L('No cash-flow statement imported', 'صورت جریان‌های نقدی وارد نشده است'), '', L('Provide the audited cash-flow statement.', 'صورت جریان‌های نقدی حسابرسی‌شده را ارائه کنید.'), L('Import the cash-flow statement so cash conversion and the cash reconciliation can be tested.', 'صورت جریان‌های نقدی را وارد کنید تا تبدیل سود به نقد و تطبیق وجه نقد آزمون شود.'));
    if (!D.da.some(function (v) { return v; })) add('medium', L('Completeness', 'کامل بودن'), L('Depreciation and amortisation not found', 'استهلاک پیدا نشد'), '', L('What is the depreciation charge for each year (notes / cash-flow reconciliation)?', 'هزینهٔ استهلاک هر سال (یادداشت‌ها / صورت تطبیق جریان نقد) چقدر است؟'), L('Add D&A from the notes; EBITDA and coverage ratios are understated without it.', 'استهلاک را از یادداشت‌ها اضافه کنید؛ بدون آن EBITDA و نسبت‌های پوشش کمتر از واقع است.'));

    /* 1. arithmetic */
    D.check.forEach(function (c, i) { if (Math.abs(c) > mat) add('critical', L('Arithmetic', 'صحت محاسباتی'), L('Balance sheet does not balance in ' + yr(i), 'ترازنامهٔ سال ' + yr(i) + ' تراز نیست'), 'Δ = ' + f0(c), L('Which line is missing or double counted?', 'کدام سطر جا افتاده یا دوبار شمرده شده است؟'), L('Re-import with every line; check the roles of subtotals (they must be "Ignore").', 'همهٔ سطرها را دوباره وارد کنید؛ نقش جمع‌های فرعی باید «نادیده» باشد.')); });
    if (D.taFile) D.taFile.forEach(function (t, i) { if (t && Math.abs(t - D.ta[i]) > mat) add('high', L('Arithmetic', 'صحت محاسباتی'), L('Sum of asset lines differs from the printed total assets (' + yr(i) + ')', 'جمع سطرهای دارایی با جمع دارایی‌های چاپ‌شده برابر نیست (' + yr(i) + ')'), L('printed ' + f0(t) + ' vs lines ' + f0(D.ta[i]), 'چاپ‌شده ' + f0(t) + ' در برابر جمع سطرها ' + f0(D.ta[i])), L('Is a line omitted, or a subtotal counted as a line?', 'آیا سطری حذف شده یا جمع فرعی به‌عنوان سطر شمرده شده است؟'), L('Footing test: re-add the statement and agree to the trial balance.', 'آزمون جمع‌زنی: صورت را دوباره جمع بزنید و با تراز آزمایشی تطبیق دهید.'), 'ISA 520'); });
    if (D.dCashCF && n > 1) for (var i = 1; i < n; i++) {
      var dc = D.cash[i] - D.cash[i - 1], cf = D.dCashCF[i] + (D.fxOnCash ? D.fxOnCash[i] : 0);
      if (Math.abs(cf - dc) > mat) add('high', L('Cash', 'وجه نقد'), L('Cash-flow statement does not reconcile to the change in cash (' + yr(i) + ')', 'صورت جریان نقد با تغییر وجه نقد ترازنامه تطبیق نمی‌کند (' + yr(i) + ')'), L('CF ' + f0(cf) + ' vs Δ balance sheet cash ' + f0(dc), 'جریان نقد ' + f0(cf) + ' در برابر تغییر وجه نقد ' + f0(dc)), L('Are restricted cash, short-term deposits or FX effects classified differently in the two statements?', 'آیا وجه نقد مسدود، سپرده‌های کوتاه‌مدت یا اثر نرخ ارز در دو صورت متفاوت طبقه‌بندی شده‌اند؟'), L('Agree cash to bank confirmations and reconciliations; align the definition of cash.', 'وجه نقد را با تأییدیه و صورت مغایرت بانکی تطبیق دهید و تعریف وجه نقد را یکسان کنید.'));
    }

    /* 2. earnings quality */
    if (D.cfo) {
      if (D.ni[l] > 0 && D.cfo[l] < 0) add('high', L('Earnings quality', 'کیفیت سود'), L('Profit with negative operating cash flow (' + yr(l) + ')', 'سود مثبت با جریان نقد عملیاتی منفی (' + yr(l) + ')'), L('net income ' + f0(D.ni[l]) + ', CFO ' + f0(D.cfo[l]), 'سود خالص ' + f0(D.ni[l]) + '، جریان نقد عملیاتی ' + f0(D.cfo[l])), L('Why does profit not turn into cash: receivables, inventory build-up, or revenue recognised before delivery?', 'چرا سود به نقد تبدیل نمی‌شود: مطالبات، انباشت موجودی یا شناسایی درآمد پیش از تحویل؟'), L('Test revenue cut-off and the recoverability of receivables; review subsequent receipts.', 'آزمون انقطاع درآمد و قابلیت وصول مطالبات؛ بررسی وصولی‌های بعد از تاریخ ترازنامه.'), 'ISA 240');
      var acc = (D.ni[l] - D.cfo[l]) / (avg(D.ta, l) || NaN);
      if (acc > 0.1) add(acc > 0.2 ? 'high' : 'medium', L('Earnings quality', 'کیفیت سود'), L('High accruals: profit well above operating cash flow', 'اقلام تعهدی بالا: سود بسیار بیشتر از جریان نقد عملیاتی'), L('(NI − CFO) / average assets = ' + pct(acc), '(سود خالص − جریان نقد عملیاتی) / میانگین دارایی‌ها = ' + pct(acc)), L('Which accruals drive the gap?', 'کدام اقلام تعهدی این فاصله را ایجاد کرده‌اند؟'), L('Analyse the reconciliation of profit to CFO line by line; test the largest accruals.', 'صورت تطبیق سود و جریان نقد عملیاتی را سطربه‌سطر تحلیل و بزرگ‌ترین اقلام تعهدی را آزمون کنید.'), 'Sloan (1996)');
    }
    var oo = D.otherOp[l], eb = D.ebit[l];
    if (eb > 0 && Math.abs(oo) / eb > 0.3) add('medium', L('Earnings quality', 'کیفیت سود'), L('Other operating items are a large share of operating profit', 'سایر اقلام عملیاتی سهم بزرگی از سود عملیاتی دارند'), L(f0(oo) + ' = ' + pct(Math.abs(oo) / eb) + ' of EBIT', f0(oo) + ' = ' + pct(Math.abs(oo) / eb) + ' سود عملیاتی'), L('What is in this line, and is it recurring?', 'این سطر شامل چه اقلامی است و آیا تکرارشونده است؟'), L('Obtain the note; reclassify one-off items out of operating profit for valuation.', 'یادداشت را بگیرید؛ اقلام غیرتکراری را برای ارزش‌گذاری از سود عملیاتی خارج کنید.'));
    if (D.ebt[l] > 0 && D.nonOp[l] / D.ebt[l] > 0.3) add('medium', L('Earnings quality', 'کیفیت سود'), L('Non-operating income is a large share of profit before tax', 'درآمد غیرعملیاتی سهم بزرگی از سود پیش از مالیات دارد'), pct(D.nonOp[l] / D.ebt[l]), L('Which gains (asset sales, FX, investments) are included, and will they recur?', 'چه سودهایی (فروش دارایی، تسعیر ارز، سرمایه‌گذاری) در آن است و آیا تکرار می‌شود؟'), L('Vouch the largest items; separate recurring from one-off.', 'بزرگ‌ترین اقلام را با مستندات بررسی و تکراری را از غیرتکراری جدا کنید.'));

    /* 3. revenue, margins, working capital */
    if (n > 1) {
      var rg = g(D.revenue, l), arg = g(D.ar, l), ig = g(D.inv, l), cg = g(D.cogs, l);
      if (isFinite(rg) && isFinite(arg) && D.ar[l] > mat && arg - rg > 0.2) add('high', L('Revenue / receivables', 'درآمد / مطالبات'), L('Receivables grow much faster than revenue', 'مطالبات بسیار سریع‌تر از درآمد رشد کرده است'), L('receivables ' + pct(arg) + ' vs revenue ' + pct(rg), 'مطالبات ' + pct(arg) + ' در برابر درآمد ' + pct(rg)), L('Have credit terms been extended, or is revenue booked before the risks pass?', 'آیا دورهٔ اعتبار مشتریان افزایش یافته یا درآمد پیش از انتقال ریسک شناسایی شده است؟'), L('Confirm the largest receivables; test cut-off around year end; review the ageing and the allowance for doubtful debts.', 'تأییدیهٔ مطالبات بزرگ؛ آزمون انقطاع پایان سال؛ بررسی سنی مطالبات و ذخیرهٔ مطالبات مشکوک‌الوصول.'), 'ISA 240 / ISA 505');
      var dso = D.revenue[l] ? D.ar[l] / D.revenue[l] * 365 : NaN;
      if (dso > 120) add('medium', L('Receivables', 'مطالبات'), L('Long collection period', 'دورهٔ وصول طولانی'), L('DSO ' + f0(dso) + ' days', 'دورهٔ وصول ' + f0(dso) + ' روز'), L('Which customers are overdue, and what security is held?', 'کدام مشتریان معوق‌اند و چه وثیقه‌ای وجود دارد؟'), L('Ageing analysis; specific allowance for overdue balances.', 'تحلیل سنی؛ ذخیرهٔ اختصاصی برای مانده‌های معوق.'));
      if (isFinite(ig) && isFinite(cg) && D.inv[l] > mat && ig - cg > 0.25) add('medium', L('Inventory', 'موجودی کالا'), L('Inventory grows much faster than cost of sales', 'موجودی بسیار سریع‌تر از بهای تمام‌شده رشد کرده است'), L('inventory ' + pct(ig) + ' vs cost of sales ' + pct(cg), 'موجودی ' + pct(ig) + ' در برابر بهای تمام‌شده ' + pct(cg)), L('Is there slow-moving or obsolete stock, or costs capitalised into inventory?', 'آیا موجودی راکد یا نابابی هست یا هزینه‌ای به موجودی منظور شده است؟'), L('Attend the stock count; test net realisable value; review costing.', 'حضور در شمارش موجودی؛ آزمون خالص ارزش فروش؛ بررسی بهای تمام‌شده.'), 'ISA 501');
      var gm0 = D.revenue[l - 1] ? D.gp[l - 1] / D.revenue[l - 1] : NaN, gm1 = D.revenue[l] ? D.gp[l] / D.revenue[l] : NaN;
      if (isFinite(gm0) && isFinite(gm1) && Math.abs(gm1 - gm0) > 0.05) add('medium', L('Margins', 'حاشیهٔ سود'), L('Gross margin moved by more than 5 points', 'حاشیهٔ سود ناخالص بیش از ۵ واحد تغییر کرده است'), pct(gm0) + ' → ' + pct(gm1), L('What explains it: prices, mix, input costs, or costing / cut-off?', 'علت چیست: قیمت فروش، ترکیب محصول، هزینهٔ نهاده‌ها یا بهای تمام‌شده / انقطاع؟'), L('Price-volume-mix analysis by product; test the costing system and cut-off.', 'تحلیل قیمت-مقدار-ترکیب به تفکیک محصول؛ آزمون سیستم بهای تمام‌شده و انقطاع.'));
      var real = (1 + rg) / (1 + num(S.settings.inflation)) - 1;
      if (isFinite(real) && real < -0.05) add('info', L('Revenue', 'درآمد'), L('Revenue fell in real terms', 'درآمد به قیمت ثابت کاهش یافته است'), L('nominal ' + pct(rg) + ', real ' + pct(real) + ' at ' + pct(num(S.settings.inflation)) + ' inflation', 'اسمی ' + pct(rg) + '، حقیقی ' + pct(real) + ' با تورم ' + pct(num(S.settings.inflation))), L('Volumes, prices or lost customers?', 'کاهش مقدار، قیمت یا از دست رفتن مشتری؟'), L('Split revenue into volume and price.', 'درآمد را به مقدار و قیمت تفکیک کنید.'));
    }

    /* 4. tax */
    var etr = D.ebt[l] > 0 ? D.tax[l] / D.ebt[l] : NaN;
    if (isFinite(etr) && (etr < 0.15 || etr > 0.3)) add('medium', L('Tax', 'مالیات'), L('Effective tax rate far from the 25% statutory rate', 'نرخ مؤثر مالیات با نرخ قانونی ۲۵٪ فاصلهٔ زیادی دارد'), pct(etr), L('Which exemptions or disallowed expenses explain it (export, listing discount, non-deductible items), and are prior-year assessments settled?', 'کدام معافیت یا هزینهٔ غیرقابل‌قبول (صادرات، تخفیف شرکت‌های بورسی، هزینه‌های غیرقابل‌قبول) علت آن است و آیا برگ‌های قطعی سال‌های قبل تسویه شده است؟'), L('Tax reconciliation; status of assessments by year; provision for open years.', 'صورت تطبیق مالیات؛ وضعیت برگ‌های تشخیص و قطعی هر سال؛ ذخیرهٔ سال‌های باز.'), 'Direct Taxation Act art. 105');

    /* 5. legal: art. 141, legal reserve, dividends */
    if (D.capital && D.capital[l] > 0 && D.retained[l] < 0 && -D.retained[l] >= 0.5 * D.capital[l]) add('critical', L('Going concern / legal', 'تداوم فعالیت / حقوقی'), L('Accumulated losses at least half of share capital (Commercial Code art. 141)', 'زیان انباشته دست‌کم نصف سرمایه (ماده ۱۴۱ اصلاحیهٔ قانون تجارت)'), L('losses ' + f0(-D.retained[l]) + ' vs capital ' + f0(D.capital[l]), 'زیان انباشته ' + f0(-D.retained[l]) + ' در برابر سرمایه ' + f0(D.capital[l])), L('Has the extraordinary general meeting been called to decide on dissolution or capital reduction?', 'آیا مجمع عمومی فوق‌العاده برای تصمیم دربارهٔ انحلال یا کاهش سرمایه دعوت شده است؟'), L('Board must call an EGM; consider a capital increase or reduction plan; going-concern assessment.', 'هیئت‌مدیره باید مجمع فوق‌العاده را دعوت کند؛ برنامهٔ افزایش یا کاهش سرمایه؛ ارزیابی تداوم فعالیت.'), 'Commercial Code (1347) art. 141; ISA 570');
    if (D.capital && D.legalReserve && n > 1 && D.ni[l - 1] > 0 && D.legalReserve[l] < 0.1 * D.capital[l] - mat) {
      var need = Math.min(0.05 * D.ni[l - 1], 0.1 * D.capital[l] - D.legalReserve[l - 1]), got = D.legalReserve[l] - D.legalReserve[l - 1];
      if (got < need - mat) add('medium', L('Legal', 'حقوقی'), L('Legal reserve transfer looks short (Commercial Code art. 140)', 'انتقال به اندوختهٔ قانونی کمتر از حد لازم به نظر می‌رسد (ماده ۱۴۰)'), L('expected ≈ ' + f0(need) + ', recorded ' + f0(got), 'انتظار ≈ ' + f0(need) + '، ثبت‌شده ' + f0(got)), L('Was one-twentieth of net profit transferred until the reserve reaches one-tenth of capital?', 'آیا یک‌بیستم سود خالص تا رسیدن اندوخته به یک‌دهم سرمایه منتقل شده است؟'), L('Correct the appropriation at the next AGM.', 'تخصیص را در مجمع بعدی اصلاح کنید.'), 'Commercial Code (1347) art. 140');
    }
    if (D.divPayable && n > 1 && D.divPayable[l] > mat && D.dividends[l] >= 0 && D.divPayable[l] > Math.max(D.dividends[l], 1) * 0.75) add('medium', L('Dividends', 'سود سهام'), L('Large dividends payable outstanding', 'ماندهٔ قابل‌توجه سود سهام پرداختنی'), L('payable ' + f0(D.divPayable[l]) + ' vs paid in the year ' + f0(D.dividends[l]), 'پرداختنی ' + f0(D.divPayable[l]) + ' در برابر پرداخت سال ' + f0(D.dividends[l])), L('Are dividends paid within eight months of the AGM (art. 240)? Who are the unpaid holders?', 'آیا سود ظرف هشت ماه از مجمع پرداخت شده است (ماده ۲۴۰)؟ سهام‌داران پرداخت‌نشده چه کسانی‌اند؟'), L('Payment schedule; treat as debt-like in valuation.', 'برنامهٔ پرداخت؛ در ارزش‌گذاری به‌عنوان شبه‌بدهی.'), 'Commercial Code (1347) art. 240');
    if (D.ni[l] > 0 && D.dividends[l] > D.ni[l] * 1.05) add('low', L('Dividends', 'سود سهام'), L('Dividends paid exceed net income', 'سود سهام پرداختی بیشتر از سود خالص است'), f0(D.dividends[l]) + ' > ' + f0(D.ni[l]), L('Is the payout funded by debt?', 'آیا تقسیم سود با بدهی تأمین شده است؟'), L('Review the funding of the payout against the cash need.', 'منبع تأمین تقسیم سود را با نیاز نقدینگی بسنجید.'));
    D.related.forEach(function (r) { var v = r.vals[l]; if (Math.abs(v) > mat) add('medium', L('Related parties', 'اشخاص وابسته'), L('Balances or transactions with related parties', 'مانده یا معاملات با اشخاص وابسته'), r.label + ': ' + f0(v), L('Terms, approvals (art. 129) and recoverability?', 'شرایط، تصویب (ماده ۱۲۹) و قابلیت وصول؟'), L('Obtain the list of related parties and board approvals; confirm balances; test arm’s-length terms.', 'فهرست اشخاص وابسته و مصوبات هیئت‌مدیره؛ تأییدیهٔ مانده‌ها؛ آزمون شرایط معاملات.'), 'IAS 24 / Iranian standard 12; Commercial Code art. 129'); });

    /* 6. liquidity, leverage, going concern */
    var cr = D.cl[l] ? D.ca[l] / D.cl[l] : NaN, qr = D.cl[l] ? (D.ca[l] - D.inv[l]) / D.cl[l] : NaN;
    if (isFinite(cr) && cr < 1) add(cr < 0.8 ? 'high' : 'medium', L('Liquidity', 'نقدینگی'), L('Current liabilities exceed current assets', 'بدهی‌های جاری بیشتر از دارایی‌های جاری است'), L('current ratio ' + cr.toFixed(2) + ', quick ' + (isFinite(qr) ? qr.toFixed(2) : '–'), 'نسبت جاری ' + cr.toFixed(2) + '، آنی ' + (isFinite(qr) ? qr.toFixed(2) : '–')), L('How will maturing obligations be met over the next 12 months?', 'تعهدات سررسیدشدهٔ ۱۲ ماه آینده چگونه پرداخت می‌شود؟'), L('12-month cash forecast; roll-over commitments from banks; see Financing Solutions.', 'پیش‌بینی نقدی ۱۲ ماهه؛ تعهد تمدید تسهیلات؛ ابزار راه‌حل تأمین مالی.'), 'ISA 570');
    var nd = D.debt[l] + D.debtLike[l] - D.cash[l], lev = D.ebitda[l] > 0 ? nd / D.ebitda[l] : NaN, cov = D.ie[l] > 0 ? D.ebit[l] / D.ie[l] : NaN;
    if (D.ebitda[l] <= 0 && D.debt[l] > mat) add('high', L('Leverage', 'اهرم'), L('Debt with non-positive EBITDA', 'بدهی با EBITDA غیرمثبت'), L('debt ' + f0(D.debt[l]), 'بدهی ' + f0(D.debt[l])), L('How is debt serviced?', 'خدمت بدهی چگونه پرداخت می‌شود؟'), L('Covenant review; restructuring options.', 'بررسی تعهدات تسهیلات؛ گزینه‌های بازسازی بدهی.'));
    else if (lev > 3) add(lev > 4 ? 'high' : 'medium', L('Leverage', 'اهرم'), L('High net debt to EBITDA', 'نسبت بدهی خالص به EBITDA بالا'), lev.toFixed(1) + 'x', L('Which covenants apply, and what headroom is left?', 'کدام تعهدات تسهیلات اعمال می‌شود و چه فضایی باقی مانده است؟'), L('Obtain loan agreements; test covenants at year end.', 'قراردادهای تسهیلات را بگیرید؛ تعهدات را در پایان سال آزمون کنید.'));
    if (isFinite(cov) && cov < 3) add(cov < 1.5 ? 'high' : 'medium', L('Leverage', 'اهرم'), L('Low interest cover', 'پوشش بهرهٔ پایین'), L('EBIT / interest = ' + cov.toFixed(2) + 'x', 'EBIT / هزینهٔ مالی = ' + cov.toFixed(2) + 'x'), L('Can the company carry its current debt if rates rise?', 'اگر نرخ‌ها بالا برود، شرکت توان حمل بدهی فعلی را دارد؟'), L('Stress test on rates; refinancing plan.', 'آزمون فشار نرخ؛ برنامهٔ بازتأمین مالی.'));
    if (n > 1 && D.ie[l] > mat) { var rate = D.ie[l] / ((D.debt[l] + D.debt[l - 1]) / 2 || NaN);
      if (isFinite(rate) && (rate < 0.1 || rate > 0.5)) add('medium', L('Finance cost', 'هزینهٔ مالی'), L('Implied interest rate out of the expected range', 'نرخ بهرهٔ ضمنی خارج از دامنهٔ مورد انتظار'), L('finance cost / average borrowings = ' + pct(rate), 'هزینهٔ مالی / میانگین تسهیلات = ' + pct(rate)), L('Is interest capitalised, are there off-balance-sheet borrowings, or is debt misclassified?', 'آیا هزینهٔ مالی به دارایی منظور شده، تسهیلات خارج از ترازنامه وجود دارد یا بدهی اشتباه طبقه‌بندی شده است؟'), L('Recompute interest per facility; review capitalised borrowing costs.', 'محاسبهٔ مجدد بهره برای هر تسهیلات؛ بررسی مخارج تأمین مالی منظورشده به دارایی.')); }
    if (D.equity[l] < 0) add('critical', L('Going concern', 'تداوم فعالیت'), L('Negative equity', 'حقوق مالکانهٔ منفی'), f0(D.equity[l]), L('What is the recapitalisation plan?', 'برنامهٔ تجدید ساختار سرمایه چیست؟'), L('Going-concern assessment; capital increase or debt conversion.', 'ارزیابی تداوم فعالیت؛ افزایش سرمایه یا تبدیل بدهی.'), 'ISA 570');
    if (n > 1 && D.ni[l] < 0 && D.ni[l - 1] < 0) add('high', L('Going concern', 'تداوم فعالیت'), L('Losses in two consecutive years', 'زیان دو سال پیاپی'), ser(D.ni), L('What turns the business around, and by when?', 'چه چیزی وضعیت را برمی‌گرداند و تا چه زمانی؟'), L('Management’s plans and forecasts; sensitivity of the going-concern conclusion.', 'برنامه‌ها و پیش‌بینی‌های مدیریت؛ حساسیت نتیجه‌گیری تداوم فعالیت.'), 'ISA 570');
    // Altman Z'' (non-manufacturers / emerging markets): 6.56 X1 + 3.26 X2 + 6.72 X3 + 1.05 X4
    var X1 = (D.ca[l] - D.cl[l]) / D.ta[l], X2 = D.retained[l] / D.ta[l], X3 = D.ebit[l] / D.ta[l], X4 = D.equity[l] / (D.tl[l] || NaN);
    var Z = 6.56 * X1 + 3.26 * X2 + 6.72 * X3 + 1.05 * X4;
    if (isFinite(Z)) add(Z < 1.1 ? 'high' : Z < 2.6 ? 'medium' : 'info', L('Going concern', 'تداوم فعالیت'), L('Altman Z″-score ' + Z.toFixed(2) + (Z < 1.1 ? ' (distress zone)' : Z < 2.6 ? ' (grey zone)' : ' (safe zone)'), 'امتیاز Z″ آلتمن ' + Z.toFixed(2) + (Z < 1.1 ? ' (منطقهٔ پریشانی)' : Z < 2.6 ? ' (منطقهٔ خاکستری)' : ' (منطقهٔ امن)')),
      'X1 ' + X1.toFixed(2) + ' · X2 ' + X2.toFixed(2) + ' · X3 ' + X3.toFixed(2) + ' · X4 ' + (isFinite(X4) ? X4.toFixed(2) : '–'), L('Indicator only; was calibrated on US data.', 'فقط یک نشانگر است؛ با داده‌های آمریکا کالیبره شده است.'), L(Z < 2.6 ? 'Strengthen the going-concern assessment.' : 'No action from this test.', Z < 2.6 ? 'ارزیابی تداوم فعالیت را تقویت کنید.' : 'این آزمون اقدامی لازم ندارد.'), 'Altman (2000), Z″ for non-manufacturers');
    // Beneish M-score (8 variables)
    if (n > 1 && D.revenue[l - 1] > 0 && D.ar[l - 1] > 0 && D.ppe[l - 1] > 0) {
      var p = l - 1, s0 = D.revenue[p], s1 = D.revenue[l];
      var DSRI = (D.ar[l] / s1) / (D.ar[p] / s0), GMI = (D.gp[p] / s0) / (D.gp[l] / s1), AQI = (1 - (D.ca[l] + D.ppe[l]) / D.ta[l]) / (1 - (D.ca[p] + D.ppe[p]) / D.ta[p]), SGI = s1 / s0;
      var DEPI = (D.da[p] / (D.da[p] + D.ppe[p])) / (D.da[l] / (D.da[l] + D.ppe[l])), SGAI = (D.opex[l] / s1) / (D.opex[p] / s0), LVGI = ((D.cl[l] + D.debt[l]) / D.ta[l]) / ((D.cl[p] + D.debt[p]) / D.ta[p]);
      var TATA = D.cfo ? (D.ni[l] - D.cfo[l]) / D.ta[l] : NaN;
      var M = -4.84 + 0.92 * DSRI + 0.528 * GMI + 0.404 * AQI + 0.892 * SGI + 0.115 * (isFinite(DEPI) ? DEPI : 1) - 0.172 * SGAI + 4.679 * (isFinite(TATA) ? TATA : 0) - 0.327 * LVGI;
      if (isFinite(M)) add(M > -1.78 ? 'high' : 'info', L('Earnings quality', 'کیفیت سود'), L('Beneish M-score ' + M.toFixed(2) + (M > -1.78 ? ' (above −1.78: manipulation-risk flag)' : ' (below −1.78)'), 'امتیاز M بنیش ' + M.toFixed(2) + (M > -1.78 ? ' (بالاتر از −۱٫۷۸: نشانهٔ ریسک دستکاری سود)' : ' (پایین‌تر از −۱٫۷۸)')),
        'DSRI ' + DSRI.toFixed(2) + ' · GMI ' + GMI.toFixed(2) + ' · AQI ' + AQI.toFixed(2) + ' · SGI ' + SGI.toFixed(2) + ' · SGAI ' + SGAI.toFixed(2) + ' · LVGI ' + LVGI.toFixed(2) + ' · TATA ' + (isFinite(TATA) ? TATA.toFixed(3) : '–'),
        L('High inflation inflates sales growth (SGI) and the score; read the components, not only the total.', 'تورم بالا رشد فروش (SGI) و امتیاز را بزرگ می‌کند؛ اجزا را بخوانید، نه فقط عدد کل را.'), L(M > -1.78 ? 'Extend revenue and receivables testing (ISA 240).' : 'No action from this test.', M > -1.78 ? 'آزمون‌های درآمد و مطالبات را گسترش دهید (ISA 240).' : 'این آزمون اقدامی لازم ندارد.'), 'Beneish (1999)');
    }
    /* 7. depreciation and capex */
    if (n > 1 && D.ppe[l - 1] > mat && D.da[l] > 0 && D.da[l - 1] > 0) {
      var d0 = D.da[l - 1] / D.ppe[l - 1], d1 = D.da[l] / ((D.ppe[l] + D.ppe[l - 1]) / 2);
      if (Math.abs(d1 / d0 - 1) > 0.3) add('low', L('Fixed assets', 'دارایی‌های ثابت'), L('Depreciation rate changed noticeably', 'نرخ استهلاک تغییر محسوسی کرده است'), pct(d0) + ' → ' + pct(d1), L('Change in useful lives, revaluation, or large additions late in the year?', 'تغییر عمر مفید، تجدید ارزیابی یا خرید بزرگ در اواخر سال؟'), L('Recompute depreciation for the main classes.', 'استهلاک طبقات اصلی را دوباره محاسبه کنید.'));
    }
    if (n > 1 && D.capex[l] < D.da[l] && D.capex[l - 1] < D.da[l - 1] && D.da[l] > 0) add('low', L('Fixed assets', 'دارایی‌های ثابت'), L('Capex below depreciation for two years', 'مخارج سرمایه‌ای دو سال کمتر از استهلاک'), L('capex ' + ser(D.capex) + ', D&A ' + ser(D.da), 'مخارج سرمایه‌ای ' + ser(D.capex) + '، استهلاک ' + ser(D.da)), L('Is maintenance being deferred?', 'آیا نگهداری و تعمیرات به تعویق افتاده است؟'), L('Review the asset register and maintenance plan.', 'دفتر دارایی‌ها و برنامهٔ نگهداری را بررسی کنید.'));
    /* 8. unusual movements in balance-sheet lines */
    if (n > 1) D.bsLines.map(function (r) { var a = r.vals[l - 1], b = r.vals[l]; return { r: r, ch: a ? b / a - 1 : (b ? Infinity : 0), sz: Math.abs(b - a) }; })
      .filter(function (x) { return x.sz > 0.05 * Math.abs(D.ta[l]) && Math.abs(x.ch) > 1; }).sort(function (a, b) { return b.sz - a.sz; }).slice(0, 6)
      .forEach(function (x) { add('medium', L('Unusual movement', 'تغییر غیرعادی'), L('Large change in “' + x.r.label + '”', 'تغییر بزرگ در «' + x.r.label + '»'), ser(x.r.vals) + ' (' + (isFinite(x.ch) ? pct(x.ch) : 'new') + ')', L('What transactions drove this change?', 'چه معاملاتی این تغییر را ایجاد کرده است؟'), L('Vouch the main movements to contracts and approvals.', 'تغییرات اصلی را با قراردادها و مصوبات تطبیق دهید.'), 'ISA 520'); });

    F.sort(function (a, b) { return SEV[b.sev] - SEV[a.sev]; });
    var ratios = { currentRatio: cr, quickRatio: qr, netDebtEbitda: lev, interestCover: cov, z: Z, etr: etr, dso: D.revenue[l] ? D.ar[l] / D.revenue[l] * 365 : NaN,
      dio: D.cogs[l] ? D.inv[l] / D.cogs[l] * 365 : NaN, gm: D.revenue[l] ? D.gp[l] / D.revenue[l] : NaN, ebitdaM: D.revenue[l] ? D.ebitda[l] / D.revenue[l] : NaN, cfoNi: D.cfo && D.ni[l] ? D.cfo[l] / D.ni[l] : NaN, roe: D.equity[l] ? D.ni[l] / D.equity[l] : NaN };
    return { findings: F, ratios: ratios };
  }

  function run(S) {
    var rec = Hub.companyData && Hub.companyData.get(), D = rec && Hub.companyData.series(rec);
    if (!D) return { empty: true, findings: [], ratios: {}, checks: [{ level: 'warning', msg: 'No company statements loaded. Use the Company data bar.' }] };
    var A = analyse(D, S), c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }; A.findings.forEach(function (f) { c[f.sev]++; });
    return { D: D, rec: rec, findings: A.findings, ratios: A.ratios, count: c, checks: c.critical ? [{ level: 'critical', msg: c.critical + ' critical finding(s).' }] : [] };
  }

  /* ---------- Claude review prompt ---------- */
  function statementsText(D) {
    var out = ['Years: ' + D.years.join(' | ') + ' · unit: ' + (D.unit || '?') + ' ' + (D.currency || '')];
    [['IS', 'Income statement'], ['BS', 'Balance sheet'], ['CF', 'Cash flow statement']].forEach(function (t) {
      if (!D.lines[t[0]].length) return; out.push('\n## ' + t[1]);
      D.lines[t[0]].forEach(function (r) { out.push((r.grp ? '[' + r.grp + '] ' : '') + r.label + '\t' + r.vals.map(f0).join('\t')); });
    });
    return out.join('\n');
  }
  function reviewPrompt(S, R, lang, withPages) {
    var rules = R.findings.map(function (f) { return '- [' + f.sev + '] ' + f.area.en + ': ' + f.title.en + (f.evidence ? ' (' + (f.evidence.en || f.evidence) + ')' : ''); }).join('\n');
    return ['You are a strict, sceptical statutory auditor (ISA, Iranian accounting standards / IFRS, Iranian Commercial Code and Direct Taxation Act).',
      'Review the financial statements below line by line. Look for: arithmetic and classification errors, unusual relationships between lines and years, revenue recognition and cut-off risk, receivables and inventory valuation, related parties, debt and covenants, tax exposures, provisions and contingencies, going concern, disclosure gaps, and anything that looks inconsistent.',
      'Use only the data given' + (withPages ? ' and the attached page images (pages of the report, including notes)' : '') + '. Quote the line and the figures behind every observation. Do not invent facts; when something cannot be judged from the data, say what document is needed.',
      'Be demanding: every finding gets a precise question for management and a concrete remedy or audit procedure.',
      'Write all text values in ' + (lang === 'fa' ? 'Persian (Farsi); keep JSON keys in English' : 'English') + '. Answer with ONE JSON object, no commentary:',
      '{"overallAssessment":"...","riskRating":"low|medium|high|very high","keyRisks":[{"area":"...","risk":"...","assertion":"existence|completeness|valuation|cut-off|presentation|rights","why":"..."}],"findings":[{"area":"...","observation":"...","evidence":"lines and figures","severity":"critical|high|medium|low","questionForManagement":"...","documentsToRequest":["..."],"suggestedRemedy":"..."}],"adjustmentsToConsider":[{"item":"...","reason":"...","estimatedEffect":"..."}],"goingConcern":"...","disclosureGaps":["..."],"questionsForManagement":["..."],"nextSteps":["..."]}',
      '\n# Statements\n' + statementsText(R.D), '\n# Automated analytical findings (verify, extend, challenge)\n' + (rules || '(none)'), '\n# Key ratios (last year)\n' + JSON.stringify(R.ratios)].join('\n');
  }

  function build(ExcelJS, S, R) {
    var X = Hub.xl, b = X.book(ExcelJS, 'Auditor'), F = b.sheet('Findings', [2, 10, 18, 46, 40, 50, 50, 26]);
    F.title('Strict auditor · analytical review', R.rec ? R.rec.file + ' · ' + R.D.years.join(' / ') : '');
    ['Severity', 'Area', 'Finding', 'Evidence', 'Question for management', 'Remedy / procedure', 'Reference'].forEach(function (hd, i) { F.put(1 + i, 4, hd, 'hdr'); });
    (R.findings || []).forEach(function (f, i) { [f.sev, tx(f.area), tx(f.title), tx(f.evidence), tx(f.q), tx(f.act), f.ref].forEach(function (v, j) { F.put(1 + j, 5 + i, v || '', 'wrap'); }); });
    var Q = b.sheet('Ratios', [2, 34, 16]); Q.title('Key ratios (last year)'); var k = 4;
    Object.keys(R.ratios || {}).forEach(function (key) { Q.put(1, k, key); Q.put(2, k, isFinite(R.ratios[key]) ? R.ratios[key] : null, 'calc', /Ratio|Cover|Ebitda$|z$/.test(key) ? 'dec' : /dso|dio/.test(key) ? 'int' : 'pct'); k++; });
    if (S.review && S.review.json) { var C = b.sheet('Claude review', [2, 46, 110]); C.title('Claude review (draft for your judgement)'); Hub.aiText.flatten(S.review.json, '').forEach(function (r, i) { C.put(1, 4 + i, r[0]); C.put(2, 4 + i, r[1], 'wrap'); }); }
    return b.wb;
  }

  Hub.tools = Hub.tools || {}; Hub.tools.auditor = { analyse: analyse, run: run, reviewPrompt: reviewPrompt, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.auditor;
  if (!root.document || !Hub.toolkit) return;

  /* ======================= UI ======================= */
  var h = U.h, TK = Hub.toolkit;
  var SEVL = { critical: L('Critical', 'بحرانی'), high: L('High', 'زیاد'), medium: L('Medium', 'متوسط'), low: L('Low', 'کم'), info: L('Info', 'اطلاعات') };
  var copyText = Hub.aiText.copy;
  function lang(S) { return S.settings.lang === 'auto' ? (fa() ? 'fa' : 'en') : S.settings.lang; }
  /* ---------- the ten-part strict-auditor report, built only from local results (Excel/PDF extraction, rule engine, notes) ---------- */
  var SECMAP = { 3: /^(Arithmetic|Completeness|Cash)$/, 4: /^(Tax|Fixed assets|Inventory|Legal|Dividends|Margins|Unusual movement|Finance cost)$/, 7: /^(Related parties)$/, 8: /^(Earnings quality|Revenue \/ receivables|Receivables|Revenue)$/, 9: /^(Going concern|Going concern \/ legal|Leverage)$/ };
  var SEVFA = { critical: 'بحرانی', high: 'زیاد', medium: 'متوسط', low: 'کم', info: 'اطلاعات' };
  function fN(v) { return isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—'; }
  function reportBlocks(S) {
    var AC = Hub.auditCore, R = AC && AC.result(), B = [], CD = Hub.companyData, N = CD && CD.notes ? CD.notes() : null, rep = N && N.report;
    B.push({ t: 'h1', x: 'گزارش حسابرس سخت‌گیر' });
    if (!R) { B.push({ t: 'warn', x: 'صورت‌های مالی وارد نشده است. از نوار «Company data» فایل Excel یا PDF را وارد کنید.' }); return B; }
    var F = R.findings, ff = function (re) { return F.filter(function (f) { return re.test(f.area.en || f.area); }); };
    var rows = function (list) { return list.map(function (f) { return [SEVFA[f.sev], tx(f.area), tx(f.title) + (tx(f.evidence) ? ' — ' + tx(f.evidence) : ''), tx(f.q), tx(f.act)]; }); };
    var tbl = function (list, empty) { return list.length ? { t: 'table', head: ['شدت', 'حوزه', 'یافته و شواهد', 'پرسش از مدیریت', 'اقدام / روش رسیدگی'], rows: rows(list) } : { t: 'p', x: empty || 'یافته‌ای در این بخش نیست.' }; };
    B.push({ t: 'small', x: 'شناسهٔ تحلیل ' + R.id + ' · ' + R.ver + ' · ' + R.src + ' · سال آخر ' + R.year + ' · واحد ' + (R.unit || '؟') + ' ' + (R.currency || '') + ' · اجرا روی همین دستگاه، بدون اتصال' });
    B.push({ t: 'h2', x: '۱. فایل‌ها و پرونده' }, { t: 'p', x: 'فایل: ' + R.file + ' · سال‌ها: ' + R.years.join('، ') + (rep ? ' · وضعیت استخراج: ' + rep.statusFa : '') });
    var co = AC.caseFile().companies[CD.get().company || R.file], vv = co ? co.versions : [];
    if (vv.length > 1) { var d = vv[vv.length - 1].diff; if (d) B.push({ t: 'ul', x: ['تغییر نسبت به نسخهٔ قبلی (' + vv[vv.length - 2].savedAt + '): ' + (d.changed.length ? d.changed.map(function (c) { return (AC.KEYFA[c.k] || c.k) + ' ' + fN(c.from) + ' → ' + fN(c.to); }).join('؛ ') : 'ارقام کلیدی بدون تغییر'), 'یافته‌های تازه: ' + (d.added.length || 0) + ' · رفع‌شده: ' + (d.cleared.length || 0)] }); }
    B.push({ t: 'h2', x: '۲. استخراج و کنترل کامل اطلاعات' });
    B.push(rep ? { t: 'ul', x: ['برگه‌ها: ' + rep.nSheets + ' · سطرها ' + rep.rows + ' · سلول‌ها ' + rep.cells, 'سلول‌های خطادار: ' + rep.errors + ' · فرمول‌های بدون مقدار: ' + rep.noCache, 'برگه‌های استخراج‌نشده: ' + ((rep.unused || []).map(function (u) { return u.name + ' (' + u.why + ')'; }).join('؛ ') || 'هیچ')].concat((rep.recon || []).map(function (x) { return 'تطبیق ' + x.c + ': ' + (x.ok === true ? 'منطبق' : x.ok === false ? 'نامنطبق' : 'انجام نشد') + ' — ' + x.t; })) } : { t: 'p', x: 'گزارش کنترل استخراج برای این فایل نیست (پیش از این نسخه وارد شده یا از PDF/متن چسبانده آمده است).' });
    B.push({ t: 'h2', x: '۳. صحت و یکپارچگی صورت‌های مالی' }, tbl(ff(SECMAP[3])));
    B.push({ t: 'h2', x: '۴. تحلیل تخصصی حسابرسی و حسابداری' }, tbl(ff(SECMAP[4])));
    var r = R.ratios, fx = function (v, d) { return isFinite(v) ? v.toFixed(d == null ? 2 : d) : '—'; }, pc = function (v) { return isFinite(v) ? (v * 100).toFixed(1) + '٪' : '—'; };
    B.push({ t: 'h2', x: '۵. نسبت‌ها و شاخص‌های مالی (تعاریف واحد در همهٔ بخش‌ها)' }, { t: 'table', head: ['نسبت', 'مقدار', 'تعریف'], rows: [['جاری', fx(r.currentRatio), R.defs.currentRatio], ['آنی', fx(r.quickRatio), R.defs.quickRatio], ['بدهی', pc(r.debtRatio), R.defs.debtRatio], ['بدهی خالص ÷ EBITDA', fx(r.netDebtEbitda, 1), R.defs.netDebtEbitda], ['پوشش هزینهٔ مالی', fx(r.interestCover, 1), R.defs.interestCover], ['جریان نقد ÷ سود', fx(r.cfoNi), R.defs.cfoNi], ['حاشیهٔ ناخالص', pc(r.gm), R.defs.gm], ['حاشیهٔ EBITDA', pc(r.ebitdaM), R.defs.ebitdaM], ['بازده حقوق مالکانه', pc(r.roe), R.defs.roe], ['دورهٔ وصول (روز)', fx(r.dso, 0), R.defs.dso], ['دورهٔ موجودی (روز)', fx(r.dio, 0), R.defs.dio], ['نرخ مؤثر مالیات', pc(r.etr), R.defs.etr], ['Altman Z″', fx(r.z), R.defs.z]] });
    B.push({ t: 'h2', x: '۶. مغایرت‌ها و ریسک‌های اصلی' }, tbl(F.filter(function (f) { return f.sev === 'critical' || f.sev === 'high'; }), 'یافتهٔ بحرانی یا زیاد نیست.'));
    B.push({ t: 'h2', x: '۷. یادداشت‌های توضیحی و گزارش حسابرس' }, tbl(ff(SECMAP[7]), 'یافته‌ای دربارهٔ اشخاص وابسته نیست.'));
    if (N && N.notes && N.notes.length) { var cats = {}; N.notes.forEach(function (b) { cats[b.cat] = (cats[b.cat] || 0) + 1; }); B.push({ t: 'p', x: 'جداول یادداشت استخراج‌شده: ' + Object.keys(cats).map(function (k) { return ((Hub.stmtImport && Hub.stmtImport.CATFA[k]) || k) + ' ' + cats[k]; }).join('، ') + '. بررسی متنی محلی قاعده‌محور است؛ تفسیر عمیق متن به مدل زبانی نیاز دارد (اختیاری).' }); }
    if (S.review && S.review.json && S.review.local) B.push({ t: 'p', x: 'بررسی محلی متن (بدون هوش مصنوعی) در ' + S.review.at + ' انجام شده؛ نتیجه در زبانهٔ «بررسی عمیق» است.' });
    B.push({ t: 'h2', x: '۸. کیفیت سود و جریان نقد' }, { t: 'p', x: 'سود خالص ' + fN(R.key.ni) + ' · جریان نقد عملیاتی ' + fN(R.key.cfo) + (isFinite(R.key.cfoPrev) ? ' (سال قبل ' + fN(R.key.cfoPrev) + ')' : '') + ' · نسبت جریان نقد به سود ' + fx(r.cfoNi) }, tbl(ff(SECMAP[8])));
    B.push({ t: 'h2', x: '۹. ریسک مالی و تداوم فعالیت' }, { t: 'p', x: 'Altman Z″ ' + fx(r.z) + ' (بحران < ۱٫۱ · امن > ۲٫۶) · نسبت بدهی ' + pc(r.debtRatio) }, tbl(ff(SECMAP[9])));
    var c = R.count, top = F.filter(function (f) { return f.sev === 'critical' || f.sev === 'high'; }).slice(0, 5);
    B.push({ t: 'h2', x: '۱۰. نتیجه‌گیری حسابرس سخت‌گیر' }, { t: 'p', x: 'بحرانی ' + c.critical + ' · زیاد ' + c.high + ' · متوسط ' + c.medium + ' · کم ' + c.low + '. ' + (c.critical ? 'تا روشن‌شدن یافته‌های بحرانی، صورت‌های مالی مبنای قابل اتکایی برای تصمیم تأمین مالی یا ارزش‌گذاری نیستند.' : c.high ? 'صورت‌ها با احتیاط و پس از پاسخ مدیریت به یافته‌های زیاد قابل استفاده‌اند.' : 'در آزمون‌های تحلیلی، مانع اصلی دیده نشد.') },
      { t: 'ul', x: top.map(function (f) { return tx(f.title) + ' — ' + tx(f.q); }) }, { t: 'small', x: 'روش‌های تحلیلی محل بررسی را نشان می‌دهند و اظهارنظر حسابرسی نیستند (ISA 520). محاسبات با کد و قواعد ثابت انجام شده و قابل بازتولید است؛ هیچ مدل زبانی ارقام را تغییر نداده است.' });
    return B;
  }
  TK.define({
    id: 'auditor', title: 'Strict Auditor (statements review)', sections: ['statements'], priority: -4, version: 1, storeKey: 'hub.auditor.v1',
    summary: 'Upload the statements (Excel or PDF): line-by-line analytical review, earnings quality, going concern, legal checks, then questions for management and remedies; Claude adds a strict auditor’s reading.',
    sample: sample, run: run, scenarios: false,
    fromCompany: function (S, M) { S.loaded = { file: M.file, savedAt: M.savedAt }; S.review = null; return fa() ? 'صورت‌های مالی برای بررسی بارگذاری شد.' : 'Statements loaded for review.'; },
    headControls: function (ctx, seg) { return [seg('Output language', [['auto', 'Interface'], ['fa', 'فارسی'], ['en', 'English']], ctx.S.settings.lang, function (v) { ctx.S.settings.lang = v; ctx.rerender(); })]; },
    eyebrow: function () { return 'Financial management · Strict auditor'; }, heading: function (S) { var r = Hub.companyData && Hub.companyData.get(); return r ? r.file : 'No statements loaded'; },
    filename: function () { return 'Audit_review'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R); },
    kpis: function (ctx) { var C = function () { return ctx.R.count || {}; }; return [
      ['Critical', function () { return String(C().critical || 0); }, function () { return 'findings'; }], ['High', function () { return String(C().high || 0); }, function () { return 'findings'; }],
      ['Medium / low', function () { return (C().medium || 0) + ' / ' + (C().low || 0); }, function () { return 'findings'; }],
      ['Altman Z″', function () { var z = ctx.R.ratios && ctx.R.ratios.z; return isFinite(z) ? z.toFixed(2) : '–'; }, function () { return 'safe > 2.6 · distress < 1.1'; }],
      ['Deep review', function () { return ctx.S.review && ctx.S.review.json ? (ctx.S.review.json.riskRating || 'Ready') : '–'; }, function () { return ctx.S.review ? ctx.S.review.at : 'not run'; }]]; },
    tabs: [{ group: 'Review', items: [['file', 'پرونده، فایل‌ها و حالت آفلاین', function (ctx) { return filesTab(ctx); }], ['findings', 'Findings', function (ctx) {
      var S = ctx.S, R = ctx.R;
      if (R.empty) return ctx.group([ctx.panel('Start', [h('p', { class: 'muted', text: 'Use the Company data bar above: import the Excel file or the PDF of the statements (or paste the rows). The review runs as soon as the statements are loaded.' })])]);
      var sev = h('select', { class: 'f-sel', 'aria-label': 'Minimum severity' }, [['info', 'All'], ['low', 'Low and above'], ['medium', 'Medium and above'], ['high', 'High and above'], ['critical', 'Critical']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      sev.value = S.settings.minSev || 'low';
      var box = h('div');
      function paint() {
        U.clear(box); var min = SEV[sev.value];
        var list = R.findings.filter(function (f) { return SEV[f.sev] >= min; });
        var t = h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['Severity', 'Area', 'Finding and evidence', 'Question for management', 'Remedy / procedure'].map(function (x) { return h('th', { class: 'lbl', text: x }); }))]),
          h('tbody', null, list.map(function (f) { return h('tr', { class: 'sev-' + f.sev }, [h('td', null, [h('span', { class: 'sev sev-' + f.sev, 'data-notr': '1', text: tx(SEVL[f.sev]) })]), h('td', { 'data-notr': '1', text: tx(f.area) }),
            h('td', { 'data-notr': '1' }, [h('strong', { text: tx(f.title) }), h('div', { class: 'muted', text: tx(f.evidence) || '' }), f.ref ? h('div', { class: 'muted small', text: f.ref }) : null]),
            h('td', { 'data-notr': '1', text: tx(f.q) }), h('td', { 'data-notr': '1', text: tx(f.act) })]); }))]);
        box.appendChild(list.length ? h('div', { class: 'grid-wrap' }, [t]) : h('p', { class: 'muted', text: 'No findings at this level.' }));
      }
      sev.addEventListener('change', function () { S.settings.minSev = sev.value; paint(); });
      paint();
      var r = R.ratios, fx = function (v, d) { return isFinite(v) ? v.toFixed(d == null ? 2 : d) : '–'; };
      var rt = h('table', { class: 'grid' }, [h('tbody', null, [['Current ratio', fx(r.currentRatio)], ['Quick ratio', fx(r.quickRatio)], ['Net debt / EBITDA', fx(r.netDebtEbitda, 1) + 'x'], ['EBIT / interest', fx(r.interestCover, 1) + 'x'],
        ['Gross margin', U.fmtPct(r.gm, 1)], ['EBITDA margin', U.fmtPct(r.ebitdaM, 1)], ['CFO / net income', fx(r.cfoNi)], ['Return on equity', U.fmtPct(r.roe, 1)], ['DSO (days)', fx(r.dso, 0)], ['DIO (days)', fx(r.dio, 0)], ['Effective tax rate', U.fmtPct(r.etr, 1)]]
        .map(function (x) { return h('tr', null, [h('td', { class: 'lbl', text: x[0] }), h('td', { class: 'num', text: x[1] })]); }))]);
      var setf = Hub.grid.form({ id: 'aud-s', onChange: ctx.rerender, fields: [ctx.field('inf', 'Inflation for real growth test', 'settings.inflation', 'pct', { unit: '%' }), ctx.field('mat', 'Tolerance (share of total assets)', 'settings.materiality', 'pct2', { unit: '%' })] });
      return ctx.group([ctx.panel('Findings · ' + R.findings.length + ' (most severe first)', [h('div', { class: 'row-ctl' }, [sev]), box, h('p', { class: 'f-help', text: 'Analytical procedures point to where to look; they are not an audit opinion. Thresholds: Altman Z″ distress < 1.1, safe > 2.6; Beneish M > −1.78 flags manipulation risk; statutory corporate tax 25%.' })]),
        ctx.two(ctx.panel('Key ratios · ' + R.D.years[R.D.n - 1], [rt]), ctx.panel('Settings', [setf]))]);
    }], ['claude', 'Deep review', function (ctx) {
      var S = ctx.S, R = ctx.R;
      if (R.empty) return ctx.group([ctx.panel('Claude review', [h('p', { class: 'muted', text: 'Load the statements first (Company data bar).' })])]);
      var st = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
      var pdf = Hub.pdfread && Hub.pdfread.last();
      var pages = h('input', { class: 'f-text', value: S.pages || '', placeholder: pdf ? 'e.g. 9-14 (notes)' : 'no PDF loaded in this session', 'aria-label': 'PDF pages to attach', disabled: !pdf });
      pages.addEventListener('change', function () { S.pages = pages.value; });
      function parsePages(s) { var o = []; String(s || '').split(/[,،]/).forEach(function (p) { var m = p.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/); if (m) for (var k = +m[1]; k <= +(m[2] || m[1]); k++) o.push(k); }); return o; }
      function localReview() {
        st.textContent = lang(S) === 'fa' ? 'بررسی محلی (قاعده‌محور)…' : 'Local rule-based review…';
        var n = pdf ? Math.min(pdf.numPages, 80) : 0, all = []; for (var i = 1; i <= n; i++) all.push(i);
        return (n ? Hub.pdfread.textOf(all) : Promise.resolve('')).then(function (txt) { var j = Hub.localAI.audit(S, R, lang(S), txt); j.method = lang(S) === 'fa' ? 'بررسی محلی قاعده‌محور (بدون هوش مصنوعی): از یافته‌های خودکار، نسبت‌ها و متن PDF' : 'Local rule-based review (no AI): automated findings, ratios and the PDF text'; return j; });
      }
      var loc = h('button', { class: 'btn primary', type: 'button', text: 'بررسی کامل محلی (بدون اتصال و بدون هوش مصنوعی)', onclick: function () { loc.disabled = true; localReview().then(function (j) { S.review = { json: j, at: new Date().toLocaleString(), local: true }; st.textContent = ''; ctx.rerender(); }, function (e) { loc.disabled = false; st.textContent = String(e && e.message || e); }); } });
      var go = h('button', { class: 'btn', type: 'button', text: 'تحلیل تکمیلی ابری با Claude (اختیاری)', onclick: function () {
        go.disabled = true; st.textContent = 'Connecting to Claude…';
        Hub.pdfread.sampler().then(function (sample) {
          if (!sample) return localReview();
          var list = parsePages(S.pages);
          return sample.limits().catch(function () { return {}; }).then(function (lim) {
            var maxI = lim && lim.images ? lim.images.maxCount || 0 : 0;
            var imgs = list.length && maxI && pdf ? Hub.pdfread.pagesAsImages(list.slice(0, maxI)) : Promise.resolve(null);
            return imgs.then(function (im) {
              st.textContent = 'Claude is reviewing ' + (R.D.lines.IS.length + R.D.lines.BS.length + R.D.lines.CF.length) + ' lines' + (im && im.length ? ' and ' + im.length + ' PDF pages' : '') + '…';
              return sample.json(reviewPrompt(S, R, lang(S), !!(im && im.length)), Object.assign({ modelTier: 'complex' }, im && im.length ? { images: im } : {}));
            });
          });
        }).then(function (j) { S.review = { json: j, at: new Date().toLocaleString() }; st.textContent = ''; ctx.rerender(); })
          .catch(function (e) { go.disabled = false; st.textContent = e && e.code === 'offline' ? 'Claude is not reachable from this copy (it works inside the claude.ai artifact, or here with your Anthropic API key on Data sources & keys). Use Copy prompt, paste it into Claude with the PDF attached, then paste the JSON answer below.' : 'Claude review failed: ' + (e && e.message || e); });
      } });
      var ans = h('textarea', { class: 'f-area', rows: 3, placeholder: 'Paste Claude’s JSON answer here', 'aria-label': 'Claude answer' });
      var copy = h('button', { class: 'btn ghost', type: 'button', text: 'Copy prompt', onclick: function () { copyText(reviewPrompt(S, R, lang(S), false), ans); } });
      var imp = h('button', { class: 'btn ghost', type: 'button', text: 'Import answer', onclick: function () { try { S.review = { json: Hub.aiText.parseJSON(ans.value), at: new Date().toLocaleString() }; ctx.rerender(); } catch (e) { U.toast(e.message, 'crit'); } } });
      var out = S.review && S.review.json ? Hub.aiText.render(S.review.json) : h('p', { class: 'muted', text: 'Not run yet.' });
      return ctx.group([ctx.panel('Strict auditor’s reading (local first; cloud optional)', [h('p', { class: 'muted', text: 'Claude reads every imported line and the automated findings' + (pdf ? ', plus the PDF pages you list (e.g. the notes)' : '') + ', and returns risks, findings with evidence, questions for management, documents to request and adjustments to consider. A draft for your judgement, not an audit opinion.' }),
        h('div', { class: 'row-ctl' }, [loc, h('label', { class: 'muted', text: 'PDF pages to attach' }), pages, go, copy]), st, h('details', null, [h('summary', { text: 'Offline: import an answer' }), ans, h('div', { class: 'row-ctl' }, [imp])])]),
        ctx.panel('Review' + (S.review ? ' · ' + S.review.at : ''), [out])]);
    }], ['report', 'گزارش نهایی (۱۰ بخش)', function (ctx) { return ctx.group([ctx.panel('گزارش نهایی حسابرس سخت‌گیر', [Hub.report.buttons(function () { return reportBlocks(ctx.S); }, 'strict-auditor'), Hub.report.dom(reportBlocks(ctx.S))])]); }]] }]
  });
  /* files, case file and offline status: what was imported, every version with its diff, what runs without a connection */
  function filesTab(ctx) {
    var AC = Hub.auditCore, R = AC && AC.result(), CD = Hub.companyData, rec = CD && CD.get(), N = CD && CD.notes ? CD.notes() : null, kids = [];
    var cloud = h('input', { type: 'checkbox', 'aria-label': 'cloud PDF' }); try { cloud.checked = localStorage.getItem('hub.cloudPdf') === '1'; } catch (e) { /* storage */ }
    cloud.addEventListener('change', function () { try { localStorage.setItem('hub.cloudPdf', cloud.checked ? '1' : '0'); } catch (e) { /* storage */ } U.toast(cloud.checked ? 'خواندن PDF با Claude (در صورت اتصال) فعال شد؛ بدون اتصال، خواندن محلی ادامه می‌یابد.' : 'خواندن PDF فقط روی همین دستگاه.', 'good'); });
    kids.push(h('p', { 'data-notr': '1', text: 'حسابرس سخت‌گیر به‌طور کامل روی همین دستگاه اجرا می‌شود: خواندن Excel و PDF، استخراج، کنترل‌ها، نسبت‌ها، کیفیت سود، تداوم فعالیت و گزارش نهایی بدون اینترنت و بدون مدل زبانی انجام می‌شوند. Claude فقط یک تحلیل تکمیلی اختیاری است و جایگزین موتور محلی نمی‌شود.' }));
    kids.push(h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['قابلیت', 'بدون اتصال (Offline)', 'نیاز به مدل یا منبع بیرونی', 'محدودیت'].map(function (x) { return h('th', { text: x }); }))]), h('tbody', null, AC.CAPS.map(function (c) { return h('tr', null, c.map(function (x) { return h('td', { 'data-notr': '1', text: x }); })); }))])]));
    kids.push(h('label', { class: 'small', 'data-notr': '1' }, [cloud, ' استفاده از Claude برای خواندن PDF وقتی اتصال هست (پیش‌فرض: خاموش — خواندن محلی)']));
    var p1 = ctx.panel('حالت اجرا: محلی و مستقل از Cloud', kids), k2 = [];
    if (!rec) k2.push(h('p', { class: 'muted', text: 'فایلی وارد نشده است. از نوار «Company data» بالای همین صفحه Excel یا PDF صورت‌های مالی را وارد کنید.' }));
    else {
      k2.push(h('p', { 'data-notr': '1', text: 'فایل فعلی: ' + rec.file + ' · ذخیره ' + rec.savedAt + (R ? ' · شناسهٔ تحلیل ' + R.id + ' (' + R.ver + ')' : '') }));
      k2.push(Hub.stmtImport && Hub.stmtImport.reportDom ? Hub.stmtImport.reportDom(N && N.report) : h('span'));
      var co = AC.caseFile().companies[rec.company || rec.file];
      if (co && co.versions.length) k2.push(h('h4', { 'data-notr': '1', text: 'پروندهٔ مالی شرکت — نسخه‌ها' }), h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['نسخه', 'فایل', 'سال‌ها', 'بحرانی / زیاد / متوسط', 'جریان نقد عملیاتی', 'سود خالص', 'تغییر نسبت به نسخهٔ قبل'].map(function (x) { return h('th', { text: x }); }))]),
        h('tbody', null, co.versions.slice().reverse().map(function (v) { var d = v.diff; return h('tr', null, [v.id + ' · ' + v.savedAt, v.file, v.years.join('، '), v.count.critical + ' / ' + v.count.high + ' / ' + v.count.medium, fN(v.key.cfo), fN(v.key.ni),
          !d ? 'اولین نسخه' : (d.sameYears ? '' : 'سال‌ها تغییر کرده؛ ') + (d.changed.length ? d.changed.slice(0, 5).map(function (c) { return (AC.KEYFA[c.k] || c.k) + ' ' + fN(c.from) + '→' + fN(c.to); }).join('، ') : 'ارقام کلیدی بدون تغییر') + ' · یافتهٔ تازه ' + d.added.length + '، رفع‌شده ' + d.cleared.length].map(function (x) { return h('td', { 'data-notr': '1', text: String(x) }); })); }))])]));
    }
    return ctx.group([p1, ctx.panel('پرونده و فایل‌های مالی', k2)]);
  }
})(typeof window !== 'undefined' ? window : globalThis);
