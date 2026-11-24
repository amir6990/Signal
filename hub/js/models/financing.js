/* =====================================================================
 * FINANCING SOLUTIONS — which funding routes fit this company, given its
 * statements and the instruments of the Iranian capital market.
 *   Engine: debt capacity from leverage and coverage limits you set, then
 *   each instrument is tested against the company's figures (assets that can
 *   back an اجاره, purchases for a مرابحه, receivables for خرید دین, IME
 *   commodities for سلف / گواهی سپرده, projects for مشارکت / استصناع /
 *   صندوق پروژه, equity routes, IPO, bank and leasing) and against the
 *   gates you confirm (audit opinion, legal form, listing, rating or
 *   guarantor, Commercial Code art. 141).
 *   Claude (inside the claude.ai artifact) turns this into a funding
 *   structure, preparations, a roadmap and risks.
 * Regulatory references name the instrument's instruction / law. Numeric
 * thresholds (rate caps, crowdfunding ceilings, listing criteria) change
 * often: they are inputs here, to be confirmed against the current text on
 * seo.ir, ifb.ir, tse.ir or ime.co.ir before use. The tool screens; it is
 * not legal advice and does not replace the advisers of the issue.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var U = Hub.util;
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function fa() { return Hub.i18n && Hub.i18n.lang() === 'fa'; }
  function L(en, f) { return { en: en, fa: f }; }
  function tx(o) { return o && typeof o === 'object' && 'en' in o ? (fa() ? o.fa : o.en) : o; }
  var LEVEL = { rec: 3, ok: 2, cond: 1, no: 0 };

  function sample() {
    return { version: 1, tool: 'financing', settings: { lang: 'auto' }, loaded: null, advice: null, sources: {},
      q: { need: 0, purpose: 'wc', tenor: 3, listed: 'no', form: 'pjs', opinion: 'unqualified', rating: 'none', guarantor: 'yes', assetValue: 0, materials: 0.6, ime: 'no', service: 'no',
        projectCost: 0, arShare: 0.5, dilution: 'no', couponCap: 0.445, bankRate: 0.3, maxLev: 3.5, minCov: 2, cfCap: 0, cfSize: 'no' }, sk: skDefault() };
  }
  /* Sukuk cost terms: defaults of the user's ytm calculator (محاسبه‌گر نرخ مؤثر اوراق): coupon 23%, quarterly,
     SEO-approved rate 44.5%, next business day, Thursday + Friday weekend, lunar holidays, and its fee rows. */
  function todayJ() { var J = Hub.jalali, t = new Date(); if (!J) return '1405/08/17'; var a = J.d2j(J.g2d(t.getFullYear(), t.getMonth() + 1, t.getDate())); return a.jy + '/' + String(a.jm).padStart(2, '0') + '/' + String(a.jd).padStart(2, '0'); }
  function skDefault() {
    return { coupon: 0.23, freq: 4, issueDate: todayJ(), cap: 0.445, principal: 'bullet', couponConv: 'equal', cal: { conv: 'next', weekend: 2, lunar: true, extra: '' },
      fees: [{ name: 'Market maker (بازارگردان)', pct: 0.1167, unit: '%', basis: 'y', timing: 's', delay: 0, seo: true },
        { name: 'Guarantor (ضامن)', pct: 0.01, unit: '%', basis: 'y', timing: 's', delay: 0, seo: true },
        { name: 'Underwriter (متعهد پذیره‌نویسی)', pct: 0.02, unit: '%', basis: 'o', timing: '0', delay: 3, seo: true },
        { name: 'Offering adviser and other (مشاور عرضه و سایر)', pct: 0.015, unit: '%', basis: 'o', timing: '0', delay: 3, seo: true },
        { name: 'Side-letter excess (مازاد الحاقیه)', pct: 0.066, unit: '%', basis: 'o', timing: '0', delay: 3, seo: false }] };
  }
  /* cost of a sukuk issue with the ytm method: computed by the Bond Issue engine (bondissue.js), where it now lives so that
     the sukuk-capacity tool on the bonds page can use it without loading this tool */
  function biState(S, amount) { return Hub.tools.bondIssue.biState(S, amount); }
  function sukukCost(S, amount) { var BI = Hub.tools && Hub.tools.bondIssue; return BI && BI.sukukCost ? BI.sukukCost(S, amount) : null; }

  var PURPOSE = { wc: L('Working capital / raw materials', 'سرمایه در گردش / مواد اولیه'), capex: L('Machinery and equipment (capex)', 'ماشین‌آلات و تجهیزات'), project: L('New project / plant', 'طرح یا کارخانهٔ جدید'),
    refi: L('Refinance existing debt', 'بازتأمین بدهی موجود'), acq: L('Acquisition', 'تملک شرکت دیگر'), repair: L('Repair the balance sheet (losses, leverage)', 'اصلاح ترازنامه (زیان، اهرم)') };

  /* regulatory screen of the sukuk routes: Hub.sukukRules with the answers of this tool; details the Sukuk
     Issuance Capacity tool has saved (assets, collateral, guarantor type) are reused */
  function sukukInputs(S) {
    var SR = Hub.sukukRules; if (!SR) return null;
    var st = U && U.store ? U.store.get('hub.sukukcap.v1', null) : null, X = JSON.parse(JSON.stringify(st && st.x ? st.x : SR.sample())), q = S.q;
    X.op0 = X.op1 = q.opinion; X.form = q.form === 'other' ? 'other' : 'joint'; X.listed = q.listed === 'tse' ? 'tse1' : q.listed === 'ifb' ? 'ifb1' : 'no';
    X.rating = q.rating === 'none' ? 'none' : q.rating; X.guarantor = q.guarantor === 'yes' ? (X.guarantor && X.guarantor !== 'none' ? X.guarantor : 'bank') : 'none';
    X.tenorMonths = Math.round(num(q.tenor) * 12) || 12; X.materials = num(q.materials);
    if (num(q.assetValue) > 0 && !(X.ijAssets || []).some(function (a) { return num(a.value) > 0; })) X.ijAssets = [{ kind: 'machinery', value: num(q.assetValue), life: 0, insured: 'yes', lien: 'no' }];
    return X;
  }
  function evaluate(D, q, K, A) {
    var l = D.n - 1, ebitda = D.ebitda[l], nd = D.debt[l] + D.debtLike[l] - D.cash[l], ie = D.ie[l];
    var capLev = Math.max(0, num(q.maxLev) * ebitda - nd);
    // cost of the new debt for the coverage limit: true issuer cost from the sukuk calculation, else the cap you entered
    var kd = K && isFinite(K.all) ? K.all : num(q.couponCap);
    var capCov = kd > 0 ? Math.max(0, (ebitda / Math.max(num(q.minCov), 0.01) - ie) / kd) : Infinity;
    var debtCap = ebitda > 0 ? Math.min(capLev, capCov) : 0, need = num(q.need);
    var art141 = D.capital && D.capital[l] > 0 && D.retained[l] < 0 && -D.retained[l] >= 0.5 * D.capital[l];
    var negEq = D.equity[l] <= 0, audited = q.opinion === 'unqualified' || q.opinion === 'qualified', sjs = q.form === 'pjs' || q.form === 'prjs';
    var creditOk = q.guarantor === 'yes' || q.rating === 'A' || q.rating === 'AA';
    var ppeVal = num(q.assetValue) > 0 ? num(q.assetValue) : D.ppe[l], purch = D.cogs[l] * num(q.materials), ar = D.ar[l] * num(q.arShare);
    var cr = D.cl[l] ? D.ca[l] / D.cl[l] : NaN, profit = D.ni[l] > 0, profit2 = D.n > 1 ? D.ni[l - 1] > 0 && profit : profit;
    var P = q.purpose, out = [];
    var skCost = K && isFinite(K.all) ? 'true cost ' + U.fmtPct(K.all, 2) + ' · SEO rate ' + U.fmtPct(K.seo, 2) + ' (cap ' + U.fmtPct(K.cap, 1) + ')' : 'see Sukuk cost tab';
    function sukukGates(why) {
      var g = [];
      if (A) {
        A.hard.forEach(function (c) { g.push(L(c.label.en + ' — ' + c.detail.en + ' (' + c.cite + ')', c.label.fa + ' — ' + c.detail.fa + ' (' + c.cite + ')')); });
        if (!A.bankGuar) A.softFail.forEach(function (c) { g.push(L(c.label.en + ' — ' + c.detail.en + ' (' + c.cite + '). ' + c.waivedBy.en + '.', c.label.fa + ' — ' + c.detail.fa + ' (' + c.cite + '). ' + c.waivedBy.fa + '.')); });
        if (!A.routes.some(function (r) { return r.ok; })) g.push(L('No credit route: a guarantor, a rating ≥ BBB- with listing, or pledged securities is needed ([IJ] 5, [MU] 5, [CR] 2-3).', 'مسیر اعتباری وجود ندارد: ضامن، رتبهٔ حداقل BBB- همراه با پذیرش در بازار، یا توثیق اوراق بهادار لازم است.'));
        if (art141) g.push(L('Accumulated losses ≥ half of capital (art. 141): fix the equity first.', 'زیان انباشته ≥ نصف سرمایه (ماده ۱۴۱): ابتدا حقوق مالکانه را اصلاح کنید.'));
        if (ebitda <= 0) g.push(L('EBITDA is not positive: no debt-service capacity.', 'EBITDA مثبت نیست: توان بازپرداخت بدهی وجود ندارد.'));
        return g;
      }
      if (!audited) g.push(L('Audited statements with an unqualified or qualified opinion are expected for an issue; adverse / disclaimer blocks it.', 'برای انتشار، صورت‌های مالی حسابرسی‌شده با نظر مقبول یا مشروط لازم است؛ نظر مردود یا عدم اظهارنظر مانع است.'));
      if (!sjs) g.push(L('The originator must be a company that can sign the contracts with the SPV (usually a joint-stock company).', 'بانی باید شرکتی باشد که بتواند با نهاد واسط قرارداد ببندد (معمولاً شرکت سهامی).'));
      if (!creditOk) g.push(L('A guarantor (bank or eligible financial institution) is needed, or a credit rating strong enough for an unguaranteed issue.', 'ضامن (بانک یا نهاد مالی مجاز) یا رتبهٔ اعتباری کافی برای انتشار بدون ضامن لازم است.'));
      if (art141) g.push(L('Accumulated losses ≥ half of capital (art. 141): fix the equity first.', 'زیان انباشته ≥ نصف سرمایه (ماده ۱۴۱): ابتدا حقوق مالکانه را اصلاح کنید.'));
      if (ebitda <= 0) g.push(L('EBITDA is not positive: no debt-service capacity.', 'EBITDA مثبت نیست: توان بازپرداخت بدهی وجود ندارد.'));
      return g;
    }
    function push(key, name, level, why, cap, extra) { out.push(Object.assign({ key: key, name: name, level: level, why: why, capacity: cap }, extra || {})); }
    var g0 = sukukGates([]), blocked = g0.length > 0, sukLevel = function (fitPurpose) { return blocked ? 'cond' : fitPurpose ? 'rec' : 'ok'; };
    var docs = L('SEO approval; SPV (نهاد واسط); trustee (امین); guarantor or rating; auditor; underwriter; market maker; offering adviser; see the Bond / sukuk roadmap.', 'مجوز سازمان بورس؛ نهاد واسط؛ امین؛ ضامن یا رتبه‌بندی؛ حسابرس؛ متعهد پذیره‌نویس؛ بازارگردان؛ مشاور عرضه؛ نقشهٔ راه انتشار اوراق را ببینید.');
    var basis = L('Securities Market Act (1384); Act on Development of New Financial Instruments and Institutions (1388); SEO issuance instruction for the instrument (check the latest amendment on seo.ir / rdis.ir).', 'قانون بازار اوراق بهادار (۱۳۸۴)؛ قانون توسعهٔ ابزارها و نهادهای مالی جدید (۱۳۸۸)؛ دستورالعمل انتشار همان اوراق (آخرین اصلاحیه را در seo.ir / rdis.ir کنترل کنید).');

    // مرابحه
    push('murabaha', L('Murabaha sukuk (اوراق مرابحه)', 'اوراق مرابحه'), sukLevel(P === 'wc' || P === 'capex'),
      [L('Finances the purchase of identified goods: raw materials, equipment. Annual purchases ≈ ' + U.fmtNum(purch) + ' (' + Math.round(num(q.materials) * 100) + '% of cost of sales).', 'خرید دارایی یا کالای مشخص را تأمین می‌کند: مواد اولیه، تجهیزات. خرید سالانه ≈ ' + U.fmtNum(purch) + ' (' + Math.round(num(q.materials) * 100) + '٪ بهای تمام‌شده).')].concat(g0),
      Math.min(debtCap, purch), { docs: docs, basis: L('SEO instruction for murabaha sukuk (approved 1390/09/26, as amended).', 'دستورالعمل انتشار اوراق مرابحه (مصوب ۱۳۹۰/۰۹/۲۶ و اصلاحات بعدی).'), cost: skCost });
    // اجاره
    push('ijara', L('Ijara / lease sukuk (اوراق اجاره), incl. sale and lease-back', 'اوراق اجاره (از جمله فروش و اجارهٔ مجدد)'), ppeVal > 0 ? sukLevel(P === 'refi' || P === 'capex' || P === 'wc') : 'no',
      [L('Backed by owned tangible assets free of liens, valued by an official expert and insured. Asset base ≈ ' + U.fmtNum(ppeVal) + (num(q.assetValue) > 0 ? ' (appraisal)' : ' (book value; appraisal is usually higher in inflation)') + '.', 'پشتوانه: دارایی مشهود متعلق به شرکت، بدون وثیقه، با ارزیابی کارشناس رسمی و بیمه. ارزش دارایی ≈ ' + U.fmtNum(ppeVal) + (num(q.assetValue) > 0 ? ' (ارزیابی)' : ' (ارزش دفتری؛ در تورم، ارزش کارشناسی معمولاً بیشتر است)') + '.')].concat(g0),
      Math.min(debtCap, ppeVal), { docs: docs, basis: L('SEO instruction for ijara sukuk (approved 1389/05/11, amended 1390/08/23 and later).', 'دستورالعمل انتشار اوراق اجاره (مصوب ۱۳۸۹/۰۵/۱۱، اصلاحیه ۱۳۹۰/۰۸/۲۳ و بعد).'), cost: skCost + (K && isFinite(K.all) ? ' + appraisal, insurance' : '') });
    // منفعت
    push('manfaa', L('Manfa’a sukuk (اوراق منفعت) — pre-sale of future services', 'اوراق منفعت — پیش‌فروش خدمات آینده'), q.service === 'yes' ? sukLevel(P === 'wc') : 'no',
      [L(q.service === 'yes' ? 'The company sells capacity of a service (seats, rooms, airtime, transport…) that can be pre-sold.' : 'Needs a service capacity that can be pre-sold (airline, hotel, telecom, transport). Not indicated.', q.service === 'yes' ? 'شرکت ظرفیت خدمتی دارد که قابل پیش‌فروش است (صندلی، اتاق، مکالمه، حمل…).' : 'به ظرفیت خدمت قابل پیش‌فروش (هوایی، هتل، مخابرات، حمل‌ونقل) نیاز دارد؛ اعلام نشده است.')].concat(q.service === 'yes' ? g0 : []),
      q.service === 'yes' ? Math.min(debtCap, D.revenue[l] * 0.3) : 0, { docs: docs, basis: basis, cost: skCost });
    // سلف موازی / گواهی سپرده کالایی
    push('salaf', L('Standard parallel salaf (سلف موازی استاندارد) on IME', 'سلف موازی استاندارد در بورس کالا'), q.ime === 'yes' ? (blocked ? 'cond' : P === 'wc' ? 'rec' : 'ok') : 'no',
      [L(q.ime === 'yes' ? 'Pre-sale of a standard commodity listed on the Iran Mercantile Exchange; fits producers of steel, petrochemicals, cement, metals.' : 'Needs a standard product admitted on the Iran Mercantile Exchange. Not indicated.', q.ime === 'yes' ? 'پیش‌فروش کالای استاندارد پذیرفته‌شده در بورس کالا؛ مناسب تولیدکنندگان فولاد، پتروشیمی، سیمان و فلزات.' : 'به کالای استاندارد پذیرفته‌شده در بورس کالا نیاز دارد؛ اعلام نشده است.')],
      q.ime === 'yes' ? D.revenue[l] * 0.25 : 0, { docs: L('IME admission of the commodity; guarantee; delivery terms.', 'پذیرش کالا در بورس کالا؛ ضمانت؛ شرایط تحویل.'), basis: L('IME / SEO rules for standard parallel salaf (check ime.co.ir).', 'ضوابط سلف موازی استاندارد بورس کالا (ime.co.ir را کنترل کنید).'), cost: 'implied yield' });
    push('cdc', L('Commodity deposit certificates (گواهی سپرده کالایی)', 'گواهی سپرده کالایی'), q.ime === 'yes' && D.inv[l] > 0 ? 'ok' : 'no',
      [L('Inventory in an IME-approved warehouse can be pledged or sold through certificates. Inventory ≈ ' + U.fmtNum(D.inv[l]) + '.', 'موجودی در انبار مورد تأیید بورس کالا از طریق گواهی قابل فروش یا توثیق است. موجودی ≈ ' + U.fmtNum(D.inv[l]) + '.')],
      q.ime === 'yes' ? D.inv[l] * 0.7 : 0, { docs: L('IME-approved warehouse; commodity admitted.', 'انبار مورد تأیید بورس کالا؛ پذیرش کالا.'), basis: L('IME instruction for commodity deposit certificates (ime.co.ir).', 'دستورالعمل گواهی سپردهٔ کالایی بورس کالا (ime.co.ir).'), cost: 'market discount' });
    // خرید دین
    push('debtpurchase', L('Debt-purchase sukuk (اوراق خرید دین) — receivables', 'اوراق خرید دین — مطالبات'), D.ar[l] > 0 ? (blocked ? 'cond' : P === 'wc' ? 'rec' : 'ok') : 'no',
      [L('Turns receivables from creditworthy customers into cash. Eligible receivables ≈ ' + U.fmtNum(ar) + ' (' + Math.round(num(q.arShare) * 100) + '% of trade receivables).', 'مطالبات از مشتریان خوش‌حساب را به نقد تبدیل می‌کند. مطالبات واجد شرایط ≈ ' + U.fmtNum(ar) + ' (' + Math.round(num(q.arShare) * 100) + '٪ دریافتنی‌های تجاری).')].concat(g0),
      ar, { docs: docs, basis: basis, cost: skCost });
    // مشارکت / استصناع / صندوق پروژه
    var proj = num(q.projectCost) > 0;
    push('musharaka', L('Musharaka / istisna’ sukuk (اوراق مشارکت / استصناع) — projects', 'اوراق مشارکت / استصناع — طرح‌ها'), proj ? sukLevel(P === 'project') : 'no',
      [L(proj ? 'Project cost ' + U.fmtNum(num(q.projectCost)) + ': participation or manufacturing-order financing tied to the project.' : 'Needs a defined project with a feasibility study. Not indicated.', proj ? 'هزینهٔ طرح ' + U.fmtNum(num(q.projectCost)) + ': تأمین مالی مشارکتی یا سفارش ساخت وابسته به طرح.' : 'به طرح مشخص با مطالعهٔ امکان‌سنجی نیاز دارد؛ اعلام نشده است.')].concat(proj ? g0 : []),
      proj ? Math.min(num(q.projectCost), Math.max(debtCap, 0)) : 0, { docs: docs, basis: basis, cost: skCost });
    push('projectfund', L('Project fund (صندوق پروژه) on IFB', 'صندوق پروژه در فرابورس'), proj ? (P === 'project' ? 'ok' : 'cond') : 'no',
      [L(proj ? 'Equity-like project vehicle: investors share the project risk; suits large projects with long construction.' : 'Needs a defined project. Not indicated.', proj ? 'ساختار شبه‌سهامی برای طرح: سرمایه‌گذاران در ریسک طرح شریک‌اند؛ مناسب طرح‌های بزرگ با دورهٔ ساخت طولانی.' : 'به طرح مشخص نیاز دارد؛ اعلام نشده است.')],
      proj ? num(q.projectCost) : 0, { docs: L('Feasibility study; fund manager; IFB registration.', 'مطالعهٔ امکان‌سنجی؛ مدیر صندوق؛ ثبت در فرابورس.'), basis: L('SEO / IFB rules for project funds (check ifb.ir).', 'ضوابط صندوق پروژه (ifb.ir را کنترل کنید).'), cost: 'investor return' });
    // equity routes
    var eqNeed = art141 || negEq || P === 'repair' || debtCap < need;
    push('rights', L('Capital increase from cash contributions (rights issue)', 'افزایش سرمایه از محل آورده نقدی (حق تقدم)'), q.dilution === 'yes' || q.listed !== 'no' ? (eqNeed ? 'rec' : 'ok') : 'cond',
      [L(eqNeed ? 'Equity is the right tool when losses, leverage or a gap above debt capacity exist.' : 'Adds permanent capital without debt service.', eqNeed ? 'وقتی زیان، اهرم بالا یا شکاف بیش از ظرفیت بدهی وجود دارد، سهام ابزار درست است.' : 'سرمایهٔ دائمی بدون بار بازپرداخت اضافه می‌کند.'),
        L(q.dilution === 'yes' ? 'Shareholders accept dilution or will subscribe.' : 'Shareholders have not confirmed they will subscribe or accept dilution.', q.dilution === 'yes' ? 'سهام‌داران رقیق‌شدن را می‌پذیرند یا پذیره‌نویسی می‌کنند.' : 'سهام‌داران پذیره‌نویسی یا رقیق‌شدن را تأیید نکرده‌اند.')],
      need, { docs: L('Board report on the capital increase; auditor’s opinion on it; EGM; SEO registration for public companies.', 'گزارش توجیهی هیئت‌مدیره؛ اظهارنظر حسابرس؛ مجمع فوق‌العاده؛ ثبت نزد سازمان برای شرکت‌های عام.'), basis: L('Commercial Code (1347) on capital increase and pre-emption rights; SEO registration instruction for listed companies.', 'لایحهٔ اصلاحی قانون تجارت (۱۳۴۷): افزایش سرمایه و حق تقدم؛ دستورالعمل ثبت افزایش سرمایه نزد سازمان.'), cost: 'cost of equity' });
    push('reval', L('Capital increase from revaluation of fixed assets', 'افزایش سرمایه از محل تجدید ارزیابی دارایی‌ها'), D.ppe[l] > 0 && (art141 || negEq || P === 'repair' || (isFinite(nd / D.equity[l]) && nd / D.equity[l] > 1)) ? 'rec' : D.ppe[l] > 0 ? 'ok' : 'no',
      [L('No cash is raised; equity rises with the revaluation surplus, which improves leverage ratios, art. 141 position and borrowing capacity.', 'وجه نقدی جذب نمی‌شود؛ حقوق مالکانه با مازاد تجدید ارزیابی افزایش می‌یابد و نسبت‌های اهرمی، وضعیت ماده ۱۴۱ و ظرفیت استقراض بهبود می‌یابد.')],
      0, { docs: L('Official expert valuation; EGM; tax treatment confirmed.', 'ارزیابی کارشناس رسمی؛ مجمع فوق‌العاده؛ تأیید رفتار مالیاتی.'), basis: L('Direct Taxation Act art. 149 (revaluation surplus transferred to capital) — confirm the current text and conditions.', 'ماده ۱۴۹ قانون مالیات‌های مستقیم (انتقال مازاد تجدید ارزیابی به سرمایه) — متن و شرایط فعلی را کنترل کنید.'), cost: 'valuation and registration costs' });
    push('retained', L('Capital increase from retained earnings / reserves', 'افزایش سرمایه از محل سود انباشته / اندوخته‌ها'), D.retained[l] > 0 ? 'ok' : 'no',
      [L('No new cash; keeps profit in the company instead of paying it out. Retained earnings ≈ ' + U.fmtNum(D.retained[l]) + '.', 'وجه جدید جذب نمی‌شود؛ سود را به‌جای تقسیم در شرکت نگه می‌دارد. سود انباشته ≈ ' + U.fmtNum(D.retained[l]) + '.')],
      0, { docs: L('EGM; auditor’s opinion.', 'مجمع فوق‌العاده؛ اظهارنظر حسابرس.'), basis: L('Commercial Code (1347).', 'لایحهٔ اصلاحی قانون تجارت (۱۳۴۷).'), cost: '—' });
    push('ipo', L('IPO on TSE / IFB (initial public offering)', 'عرضهٔ اولیه در بورس / فرابورس'), q.listed !== 'no' ? 'no' : profit2 && audited ? (P === 'project' || P === 'capex' || P === 'acq' ? 'ok' : 'cond') : 'cond',
      [L(q.listed !== 'no' ? 'Already listed.' : profit2 ? 'Profitable in the last two years: a listing candidate; the board, governance and size criteria of the target market apply.' : 'Not profitable in the last two years: listing on the main markets is unlikely until profitability is shown.', q.listed !== 'no' ? 'شرکت هم‌اکنون پذیرفته شده است.' : profit2 ? 'دو سال اخیر سودده: نامزد پذیرش؛ معیارهای اندازه، حاکمیت و بازار هدف اعمال می‌شود.' : 'دو سال اخیر سودده نیست: پذیرش در بازارهای اصلی تا اثبات سودآوری بعید است.')],
      need, { docs: L('Admission file; audited statements; valuation; underwriter and market maker; see the IPO roadmap.', 'پروندهٔ پذیرش؛ صورت‌های حسابرسی‌شده؛ ارزش‌گذاری؛ متعهد پذیره‌نویسی و بازارگردان؛ نقشهٔ راه عرضهٔ اولیه.'), basis: L('Admission instructions of TSE and IFB (check tse.ir / ifb.ir for the current criteria).', 'دستورالعمل‌های پذیرش بورس تهران و فرابورس (معیارهای فعلی را در tse.ir / ifb.ir کنترل کنید).'), cost: 'IPO discount + fees' });
    push('crowd', L('Crowdfunding (تأمین مالی جمعی)', 'تأمین مالی جمعی'), q.listed === 'no' && q.cfSize === 'yes' && (num(q.cfCap) <= 0 || need <= num(q.cfCap)) ? 'ok' : 'no',
      [L(q.cfSize === 'yes' ? 'Small, unlisted business with a defined plan' + (num(q.cfCap) > 0 ? '; need within the current ceiling of ' + U.fmtNum(num(q.cfCap)) : '; enter the current ceiling to test the amount') + '.' : 'For small unlisted businesses with modest amounts. Not indicated.', q.cfSize === 'yes' ? 'کسب‌وکار کوچک غیربورسی با طرح مشخص' + (num(q.cfCap) > 0 ? '؛ مبلغ در سقف فعلی ' + U.fmtNum(num(q.cfCap)) : '؛ سقف فعلی را وارد کنید') + '.' : 'برای کسب‌وکارهای کوچک غیربورسی با مبالغ محدود؛ اعلام نشده است.')],
      q.cfSize === 'yes' ? (num(q.cfCap) > 0 ? Math.min(need, num(q.cfCap)) : need) : 0, { docs: L('Licensed crowdfunding platform; guarantee as required by the platform.', 'سکوی تأمین مالی جمعی دارای مجوز؛ ضمانت طبق ضوابط سکو.'), basis: L('SEO crowdfunding instruction, supervised by IFB (check ifb.ir for ceilings).', 'دستورالعمل تأمین مالی جمعی سازمان بورس با نظارت فرابورس (سقف‌ها را در ifb.ir کنترل کنید).'), cost: 'platform return + fee' });
    push('gam', L('GAM certificates (اوراق گام) via banks — supply-chain credit', 'اوراق گام از طریق بانک — اعتبار زنجیرهٔ تأمین'), P === 'wc' ? 'ok' : 'cond',
      [L('Bank-issued certificates paying suppliers for production inputs; suits working capital with a bank relationship. Trade payables ≈ ' + U.fmtNum(D.ap[l]) + '.', 'گواهی صادرشده توسط بانک برای پرداخت به تأمین‌کنندگان نهاده‌های تولید؛ مناسب سرمایه در گردش با رابطهٔ بانکی. پرداختنی‌های تجاری ≈ ' + U.fmtNum(D.ap[l]) + '.')],
      Math.min(D.ap[l], debtCap), { docs: L('Bank credit line; supplier invoices.', 'خط اعتباری بانک؛ فاکتور تأمین‌کنندگان.'), basis: L('Central Bank of Iran scheme for GAM certificates (check cbi.ir).', 'سازوکار اوراق گام بانک مرکزی (cbi.ir را کنترل کنید).'), cost: 'discount rate set by the market' });
    push('bank', L('Bank facilities (تسهیلات بانکی) — benchmark', 'تسهیلات بانکی — مبنای مقایسه'), ebitda > 0 ? 'ok' : 'cond',
      [L('Benchmark for every capital-market route: rate ' + U.fmtPct(num(q.bankRate), 1) + ' (your input) plus collateral and compensating balances.', 'مبنای مقایسهٔ همهٔ گزینه‌های بازار سرمایه: نرخ ' + U.fmtPct(num(q.bankRate), 1) + ' (ورودی شما) به‌علاوهٔ وثیقه و سپردهٔ جبرانی.')],
      debtCap, { docs: L('Collateral; credit file.', 'وثیقه؛ پروندهٔ اعتباری.'), basis: L('Banking rules of the Central Bank of Iran.', 'ضوابط بانک مرکزی.'), cost: U.fmtPct(num(q.bankRate), 1) + ' + collateral costs' });
    push('leasing', L('Leasing (لیزینگ)', 'لیزینگ'), P === 'capex' ? 'ok' : 'cond',
      [L('Equipment or vehicles financed by a licensed leasing company; the asset is the security.', 'تجهیزات یا خودرو با تأمین مالی شرکت لیزینگ مجاز؛ خود دارایی وثیقه است.')],
      P === 'capex' ? Math.min(need, debtCap) : 0, { docs: L('Pro-forma invoice; leasing contract.', 'پیش‌فاکتور؛ قرارداد لیزینگ.'), basis: L('CBI rules for leasing companies.', 'ضوابط بانک مرکزی برای شرکت‌های لیزینگ.'), cost: 'lease rate' });
    if (A) {
      var IM = {}, ST = { yes: L('eligible', 'واجد شرایط'), cond: L('eligible with conditions', 'مشروط'), no: L('not eligible', 'فاقد شرایط') };
      A.inst.forEach(function (i) { IM[i.key] = i; });
      var regLine = function (i) { var r = i.opts && i.opts[0] ? i.opts[0].route.name : null; return L('SEO rules: ' + ST[i.status].en + (i.max > 0 ? '; regulatory maximum ' + U.fmtNum(i.max) + (r ? ' via ' + r.en.toLowerCase() : '') : '') + ' (' + i.cite + '). Details: Sukuk Issuance Capacity.', 'ضوابط سازمان: ' + ST[i.status].fa + (i.max > 0 ? '؛ سقف مقرراتی ' + U.fmtNum(i.max) + (r ? ' از مسیر ' + r.fa : '') : '') + ' (' + i.cite + '). جزئیات: ابزار ظرفیت انتشار اوراق.'); };
      out.forEach(function (o) {
        var i = IM[o.key]; if (!i || i.status === 'info') return;
        if (i.status === 'no') o.level = 'no'; else if (i.status === 'cond' && o.level === 'rec') o.level = 'cond';
        o.capacity = Math.min(debtCap, Math.max(0, i.max || 0)); o.why.push(regLine(i));
      });
      var sm = IM.smallMurabaha;
      if (sm) push('smallMurabaha', L('Small and short-term murabaha (≤ 2,000 bn rials, ≤ 18 months)', 'اوراق مرابحهٔ کوچک و کوتاه‌مدت (≤ ۲٬۰۰۰ میلیارد ریال، ≤ ۱۸ ماه)'),
        sm.status === 'no' ? 'no' : sm.status === 'cond' || blocked ? 'cond' : P === 'wc' ? 'rec' : 'ok', sm.points.slice(0, 2).concat([regLine(sm)]), Math.min(debtCap, Math.max(0, sm.max || 0)),
        { docs: L('Offering adviser; selling agent; bank (or research-fund) payment guarantee, rating with one pledged share, or buyers’ consent in a private offering; underwriter and market maker optional.', 'مشاور عرضه؛ عامل فروش؛ ضمانت‌نامهٔ تعهد پرداخت بانکی (یا صندوق پژوهش و فناوری)، رتبه با توثیق یک سهم، یا موافقت خریداران در عرضهٔ خصوصی؛ متعهد پذیره‌نویس و بازارگردان اختیاری.'),
          basis: L('Murabaha instruction part 9 (art. 39); private offering procedure, CAMC 1403/10/04.', 'دستورالعمل مرابحه بخش ۹ (مادهٔ ۳۹)؛ رویهٔ عرضهٔ خصوصی، ویرایش ۱۴۰۳/۱۰/۰۴.'), cost: skCost });
    }
    var cov = ie > 0 ? ebitda / ie : Infinity, DEBT = { smallMurabaha: 1, murabaha: 1, ijara: 1, manfaa: 1, musharaka: 1, gam: 1, bank: 1, leasing: 1 };
    out.forEach(function (o) {
      if (!DEBT[o.key] || o.level === 'no') return;
      if (debtCap <= 0) { o.level = 'cond'; o.why.push(L('No room for new debt at your limits (net debt / EBITDA ≤ ' + q.maxLev + 'x, EBITDA / interest ≥ ' + q.minCov + 'x; now ' + (isFinite(cov) ? cov.toFixed(1) + 'x' : 'n/a') + '). Fix leverage first or relax the limits deliberately.', 'با سقف‌های شما جایی برای بدهی جدید نیست (بدهی خالص / EBITDA ≤ ' + q.maxLev + '، EBITDA / هزینهٔ مالی ≥ ' + q.minCov + '؛ اکنون ' + (isFinite(cov) ? cov.toFixed(1) : '–') + '). ابتدا اهرم را اصلاح کنید یا آگاهانه سقف‌ها را تغییر دهید.')); }
      else if (need > 0 && o.capacity < need && o.level === 'rec') o.why.push(L('Covers ' + Math.round(o.capacity / need * 100) + '% of the need on its own; combine with another route.', 'به‌تنهایی ' + Math.round(o.capacity / need * 100) + '٪ نیاز را پوشش می‌دهد؛ با مسیر دیگری ترکیب کنید.'));
    });
    if (debtCap <= 0) out.forEach(function (o) { if (o.key === 'debtpurchase' && o.level !== 'no') o.why.push(L('Receivables are sold, but the originator usually guarantees them: lenders will still look at your leverage.', 'مطالبات فروخته می‌شود، اما بانی معمولاً آن را تضمین می‌کند: تأمین‌کنندگان همچنان به اهرم شما نگاه می‌کنند.')); });
    out.forEach(function (o) { if (o.key === 'bank') o.costRate = Math.pow(1 + num(q.bankRate) / 12, 12) - 1; });
    var SUK = { smallMurabaha: 1, murabaha: 1, ijara: 1, manfaa: 1, musharaka: 1, debtpurchase: 1 };
    if (K && isFinite(K.all)) out.forEach(function (o) {
      if (!SUK[o.key] || o.level === 'no') return;
      o.costRate = K.all;
      if (K.overCap) { o.level = o.level === 'rec' ? 'cond' : o.level; o.why.push(L('With your terms the SEO rate is ' + U.fmtPct(K.seo, 2) + ', above the approved ' + U.fmtPct(K.cap, 2) + ': coupon at most ' + (isFinite(K.maxCoupon) ? U.fmtPct(K.maxCoupon, 2) : '–') + ' or lower fees (Sukuk cost tab).', 'با شرایط شما نرخ سازمان ' + U.fmtPct(K.seo, 2) + ' و بالاتر از نرخ مورد تأیید ' + U.fmtPct(K.cap, 2) + ' است: نرخ کوپن حداکثر ' + (isFinite(K.maxCoupon) ? U.fmtPct(K.maxCoupon, 2) : '–') + ' یا کارمزد کمتر (زبانهٔ هزینهٔ اوراق).')); }
      if (K.all > K.loanEff) o.why.push(L('True issuer cost ' + U.fmtPct(K.all, 2) + ' is above the bank loan’s effective ' + U.fmtPct(K.loanEff, 2) + ': on cost alone the bank is cheaper; the case for sukuk is tenor, size or collateral.', 'هزینهٔ واقعی بانی ' + U.fmtPct(K.all, 2) + ' بالاتر از نرخ مؤثر تسهیلات بانکی ' + U.fmtPct(K.loanEff, 2) + ' است: از نظر هزینه، بانک ارزان‌تر است؛ توجیه اوراق، سررسید، حجم یا وثیقه است.'));
      else o.why.push(L('True issuer cost ' + U.fmtPct(K.all, 2) + ' vs bank ' + U.fmtPct(K.loanEff, 2) + ' effective.', 'هزینهٔ واقعی بانی ' + U.fmtPct(K.all, 2) + ' در برابر نرخ مؤثر بانک ' + U.fmtPct(K.loanEff, 2) + '.'));
    });
    out.forEach(function (o) { o.score = LEVEL[o.level] * 10 + (o.capacity >= need && need > 0 ? 3 : 0); });
    out.sort(function (a, b) { return b.score - a.score; });
    return { kd: kd, cov: cov, debtCap: debtCap, capLev: capLev, capCov: capCov, nd: nd, ebitda: ebitda, gates: g0, art141: art141, negEq: negEq, currentRatio: cr, list: out, need: need };
  }

  function run(S) {
    var rec = Hub.companyData && Hub.companyData.get(), D = rec && Hub.companyData.series(rec);
    if (!S.sk) S.sk = skDefault();
    // the solution engine runs with or without statements (manual figures and assets)
    var Kx = null; try { Kx = num(S.e && S.e.co && S.e.co.need) > 0 ? sukukCost(S, num(S.e.co.need)) : null; } catch (e) { Kx = null; }
    var XE = Hub.finUI ? Hub.finUI.compute(S, D || null, Kx && isFinite(Kx.all) ? Kx : null) : null;
    if (!D) return { empty: true, list: [], X: XE, D: null, checks: XE && XE.REC.main ? [] : [{ level: 'warning', msg: 'Enter the company on the Diagnosis tab, or load statements from the Company data bar.' }] };
    var K = sukukCost(S, num(S.q.need)), X = sukukInputs(S), A = X ? Hub.sukukRules.assess(D, X, { coupon: S.sk ? num(S.sk.coupon) : 0.23 }) : null;
    var E = evaluate(D, S.q, K, A); E.A = A; E.D = D; E.rec = rec; E.K = K; E.X = XE;
    E.checks = (E.gates.length ? [{ level: 'warning', msg: E.gates.length + ' gate(s) to clear before a sukuk issue.' }] : []).concat(num(S.q.need) <= 0 ? [{ level: 'warning', msg: 'Enter the amount you need to raise.' }] : [])
      .concat(K && K.error ? [{ level: 'warning', msg: 'Sukuk cost: ' + K.error }] : K && K.overCap ? [{ level: 'warning', msg: 'Sukuk SEO rate above the approved rate.' }] : []);
    return E;
  }

  function advicePrompt(S, R, lang) {
    var q = S.q, rows = R.list.map(function (o) { return '- ' + o.name.en + ' — ' + o.level + ' — capacity ' + Math.round(o.capacity) + ' — ' + o.why.map(function (w) { return w.en; }).join(' ') + ' — basis: ' + o.basis.en; }).join('\n');
    return ['You are a senior Iranian capital-markets adviser (debt and equity). Design the funding solution for the company below using the instruments of the Iranian capital market (SEO-regulated sukuk: murabaha, ijara, manfa’a, salaf, musharaka, istisna’, debt purchase, mudaraba; IFB project funds and crowdfunding; IME instruments; capital increases; IPO) and bank alternatives.',
      'Use only the data given. Name the regulation behind each route (law, SEO / IFB / IME / CBI instruction). Where a numeric threshold (rate cap, ceiling, admission criterion) matters and you are not certain of its current value, say so and tell the user what to verify and where. Do not invent figures.',
      'Be practical: a recommended structure (possibly a combination), amounts within capacity, tenor, indicative all-in cost against the bank benchmark, conditions and preparations, a step-by-step roadmap with timing, what is not suitable and why, and risks with mitigants.',
      'Write all text values in ' + (lang === 'fa' ? 'Persian (Farsi); keep JSON keys in English' : 'English') + '. Answer with ONE JSON object, no commentary:',
      '{"diagnosis":"...","fundingNeed":"...","recommendedStructure":[{"instrument":"...","amount":"...","tenor":"...","rationale":"...","conditions":["..."],"indicativeCost":"..."}],"alternatives":[{"instrument":"...","rationale":"..."}],"notSuitable":[{"instrument":"...","reason":"..."}],"preparationsNeeded":["..."],"roadmap":[{"step":"...","timeline":"..."}],"risksAndMitigants":[{"risk":"...","mitigation":"..."}],"regulatoryBasis":[{"instrument":"...","document":"...","verifyWith":"..."}],"nextSteps":["..."]}',
      '\n# Request\nAmount needed: ' + q.need + ' (' + (R.D.currency || '') + ' ' + (R.D.unit || '') + '), purpose: ' + PURPOSE[q.purpose].en + ', tenor: ' + q.tenor + ' years, listed: ' + q.listed + ', legal form: ' + q.form + ', audit opinion: ' + q.opinion + ', rating: ' + q.rating + ', guarantor available: ' + q.guarantor + ', IME commodity: ' + q.ime + ', pre-sellable service: ' + q.service + ', project cost: ' + q.projectCost + ', shareholders accept dilution: ' + q.dilution + ', bank rate (user input): ' + q.bankRate,
      '\n# Sukuk cost (user\'s ytm method: Shamsi schedule, business-day adjusted, fees of the parties, XIRR act/365)\n' + (R.K && isFinite(R.K.all) ? 'Coupon ' + S.sk.coupon + ', ' + S.sk.freq + ' payments a year, issue date ' + S.sk.issueDate + ', tenor ' + R.K.years + ' years; fees: ' + S.sk.fees.map(function (f) { return f.name + ' ' + f.pct + (f.unit === 'A' ? ' (amount)' : '') + ' ' + (f.basis === 'y' ? 'annual' : 'one-off') + (f.seo ? ', in SEO rate' : ', outside SEO rate'); }).join('; ') +
        '. Rate presented to SEO ' + R.K.seo.toFixed(4) + ' vs approved rate ' + R.K.cap + (R.K.overCap ? ' (ABOVE)' : '') + '; true issuer cost ' + R.K.all.toFixed(4) + '; coupons only ' + R.K.bare.toFixed(4) + '; maximum coupon within the approved rate ' + (isFinite(R.K.maxCoupon) ? R.K.maxCoupon.toFixed(4) : 'n/a') + '; net proceeds on day one ' + Math.round(R.K.net) + '; bank loan effective ' + R.K.loanEff.toFixed(4) + '. Use these figures for the cost of sukuk routes.' : 'not computed'),
      '\n# Debt capacity (leverage ≤ ' + q.maxLev + 'x net debt / EBITDA, EBITDA / interest ≥ ' + q.minCov + 'x)\n' + Math.round(R.debtCap) + ' (leverage limit ' + Math.round(R.capLev) + ', coverage limit ' + (isFinite(R.capCov) ? Math.round(R.capCov) : 'n/a') + '); net debt ' + Math.round(R.nd) + '; EBITDA ' + Math.round(R.ebitda),
      '\n# Screening of instruments\n' + rows,
      (R.A ? '\n# Regulatory screen (SEO texts: ijara instruction 1390/08/23, murabaha instruction 1390/09/26 incl. part 9, credit-rating instruction 1402/05/16, murabaha procedure 1402/11/15, CAMC small-murabaha procedure 1403/10/04, Development Act 1388 arts. 11-12)\n' +
        R.A.checks.map(function (c) { return '- ' + (c.ok ? 'PASS ' : 'FAIL ') + c.label.en + ': ' + c.detail.en + ' [' + c.cite + ']'; }).join('\n') + '\n' +
        R.A.routes.map(function (r) { return '- Route ' + r.name.en + ': ' + (r.ok ? 'available, cap ' + (isFinite(r.cap) ? Math.round(r.cap) : 'guarantor limit') : 'not available') + ' — ' + r.why.map(function (w) { return w.en; }).join(' ') + ' [' + r.cite + ']'; }).join('\n') + '\n' +
        R.A.inst.map(function (i) { return '- ' + i.name.en + ': ' + i.status + (i.max > 0 ? ', regulatory max ' + Math.round(i.max) : '') + ' — ' + i.points.map(function (p) { return p.en; }).join(' ') + ' [' + i.cite + ']'; }).join('\n') : ''),
      '\n# Statements\n' + (function () { var D = R.D, o = ['Years: ' + D.years.join(' | ')]; ['IS', 'BS', 'CF'].forEach(function (t) { D.lines[t].forEach(function (r) { o.push(t + ' · ' + (r.grp ? '[' + r.grp + '] ' : '') + r.label + '\t' + r.vals.map(function (v) { return Math.round(v); }).join('\t')); }); }); return o.join('\n'); })()].join('\n');
  }

  function build(ExcelJS, S, R) {
    var X = Hub.xl, b = X.book(ExcelJS, 'Financing');
    if (R.X && Hub.finUI) Hub.finUI.excel(b, S, R.X); if (Hub.finDiscUI && S.disc) Hub.finDiscUI.excel(b, S);
    var F = b.sheet('Screening', [2, 40, 14, 18, 70, 50, 50]);
    F.title('Financing solutions · screening', R.rec ? R.rec.file + ' · need ' + U.fmtNum(num(S.q.need)) + ' · ' + tx(PURPOSE[S.q.purpose]) : '');
    F.put(1, 3, 'Debt capacity'); F.put(2, 3, R.debtCap, 'calc', 'money');
    ['Instrument', 'Fit', 'Capacity', 'Why', 'Documents and parties', 'Regulatory basis (verify)'].forEach(function (hd, i) { F.put(1 + i, 5, hd, 'hdr'); });
    (R.list || []).forEach(function (o, i) { [tx(o.name), tx({ rec: L('Recommended', 'پیشنهادی'), ok: L('Possible', 'ممکن'), cond: L('Conditional', 'مشروط'), no: L('Not suitable', 'نامناسب') }[o.level]), o.capacity, o.why.map(tx).join(' '), tx(o.docs), tx(o.basis)].forEach(function (v, j) { F.put(1 + j, 6 + i, v, j === 2 ? 'calc' : 'wrap', j === 2 ? 'money' : undefined); }); });
    if (R.K && R.K.sc && Hub.tools.bondIssue) {
      var BI = Hub.tools.bondIssue, Jj = Hub.jalali, Sk = b.sheet('Sukuk cost', [2, 30, 14, 18, 18, 18]);
      Sk.title('Sukuk cost · ytm method', 'Dated issuer cash flows; XIRR formulas are live (Excel XIRR, act/365)');
      var fl = { all: BI.flows(R.K.sc, 'all'), seo: BI.flows(R.K.sc, 'seo'), bare: BI.flows(R.K.sc, 'bare') }, dates = fl.all.map(function (x) { return x.date; });
      ['Shamsi date', 'Date', 'All fees (true cost)', 'Fees in SEO rate', 'Coupons only'].forEach(function (t, i) { Sk.put(1 + i, 4, t, 'hdr'); });
      var pick = function (arr, d) { var m = arr.filter(function (x) { return x.date === d; })[0]; return m ? m.cf : 0; };
      dates.forEach(function (d, i) { var r = 5 + i; Sk.put(1, r, Jj.jstr(d)); Sk.put(2, r, { date: Jj.toDate(d) }, null, 'date'); Sk.put(3, r, pick(fl.all, d), 'calc', 'money'); Sk.put(4, r, pick(fl.seo, d), 'calc', 'money'); Sk.put(5, r, pick(fl.bare, d), 'calc', 'money'); });
      var e = 4 + dates.length, kr = e + 2;
      ['True issuer cost', 'Rate presented to SEO', 'Coupons only'].forEach(function (t, i) { var col = ['D', 'E', 'F'][i]; Sk.put(1, kr + i, t, 'total'); Sk.put(3, kr + i, { f: '=XIRR(' + col + '5:' + col + e + ',C5:C' + e + ')' }, 'total', 'pct2'); });
      Sk.put(1, kr + 3, 'Rate approved by SEO'); Sk.put(3, kr + 3, num(S.sk.cap), 'in', 'pct2');
      Sk.put(1, kr + 4, 'Within the approved rate (1 = yes)'); Sk.put(3, kr + 4, { f: '=IF(D' + (kr + 1) + '<=D' + (kr + 3) + ',1,0)' }, 'calc', 'int');
    }
    var G = b.sheet('Inputs and gates', [2, 60, 30]); G.title('Your answers and the gates');
    Object.keys(S.q).forEach(function (k, i) { G.put(1, 4 + i, k); G.put(2, 4 + i, S.q[k], 'in'); });
    (R.gates || []).forEach(function (g, i) { G.put(1, 6 + Object.keys(S.q).length + i, tx(g), 'wrap'); });
    if (S.advice && S.advice.json) { var C = b.sheet('Claude advice', [2, 46, 110]); C.title('Funding solution (draft for your judgement)'); Hub.aiText.flatten(S.advice.json, '').forEach(function (r, i) { C.put(1, 4 + i, r[0]); C.put(2, 4 + i, r[1], 'wrap'); }); }
    return b.wb;
  }

  Hub.tools = Hub.tools || {}; Hub.tools.financing = { evaluate: evaluate, run: run, sample: sample, advicePrompt: advicePrompt, sukukCost: sukukCost, skDefault: skDefault };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.financing;
  if (!root.document || !Hub.toolkit) return;

  /* ======================= UI ======================= */
  var h = U.h, TK = Hub.toolkit, G = Hub.grid;
  var LV = { rec: L('Recommended', 'پیشنهادی'), ok: L('Possible', 'ممکن'), cond: L('Conditional', 'مشروط'), no: L('Not suitable', 'نامناسب') };
  function lang(S) { return S.settings.lang === 'auto' ? (fa() ? 'fa' : 'en') : S.settings.lang; }
  TK.define({
    id: 'financing', title: 'Financing Solutions (Iran capital market)', sections: ['financing', 'finmgmt', 'bonds', 'ipo', 'ib'], priority: -4, version: 1, storeKey: 'hub.financing.v1',
    summary: 'Corporate financing and asset monetization engine: diagnosis, 48 solutions in three engines (debt, equity & hybrid, asset monetization), 12 multi-step structures with transaction diagrams, scoring, hidden opportunities, report and roadmap. Classic screening: upload the statements (Excel or PDF): debt capacity, then every route — murabaha, ijara, manfa’a, salaf, debt purchase, musharaka / istisna’, project fund, capital increase, IPO, crowdfunding, GAM, bank, leasing — screened against the company and the rules; Claude designs the structure.',
    sample: sample, run: run, scenarios: false,
    fromCompany: function (S, M) { S.loaded = { file: M.file, savedAt: M.savedAt }; S.advice = null; return fa() ? 'صورت‌های مالی برای بررسی تأمین مالی بارگذاری شد.' : 'Statements loaded for the financing review.'; },
    headControls: function (ctx, seg) { return [seg('Output language', [['auto', 'Interface'], ['fa', 'فارسی'], ['en', 'English']], ctx.S.settings.lang, function (v) { ctx.S.settings.lang = v; ctx.rerender(); })]; },
    eyebrow: function () { return 'Financial management · Financing solutions'; }, heading: function (S) { var r = Hub.companyData && Hub.companyData.get(); return S && S.e && S.e.co && S.e.co.name ? S.e.co.name : r ? r.file : 'No statements loaded'; },
    filename: function () { return 'Financing_solutions'; },
    xlsx: function (S, R) { if (R.empty) { var b0 = Hub.xl.book(root.ExcelJS, 'Financing'); if (R.X) Hub.finUI.excel(b0, S, R.X); if (Hub.finDiscUI && S.disc) Hub.finDiscUI.excel(b0, S); return b0.wb; } var wb = build(root.ExcelJS, S, R); return wb; },
    kpis: function (ctx) { var X = function () { return ctx.R.X; }, nm = function (x) { return x ? (x.type === 's' ? x.r.s.fa : x.c.c.fa) : '–'; }; return [
      ['Main recommendation', function () { return X() ? nm(X().REC.main) : '–'; }, function () { var m = X() && X().REC.main; return m ? (m.def ? 'قطعی' : 'مشروط') + ' · امتیاز ' + m.score : 'اطلاعات کافی نیست'; }],
      ['Debt capacity', function () { return X() && isFinite(X().G.debtCap) ? U.fmtNum(X().G.debtCap) : '–'; }, function () { return 'اهرم، پوشش بهره، بازپرداخت از سود'; }],
      ['Definitive routes', function () { return X() ? String(X().count.definitive) : '–'; }, function () { return X() ? 'از ' + X().count.applicable + ' راهکار مرتبط' : ''; }],
      ['Structures', function () { return X() ? String(X().count.combos) : '–'; }, function () { return 'ساختار ترکیبی فعال'; }],
      ['Opportunities', function () { return X() ? String(X().O.length) : '–'; }, function () { return 'فرصت شناسایی‌شده'; }]]; },
    tabs: [{ group: 'Solution engine', items: [['disc', 'کشف فرصت از مسئلهٔ خام', function (ctx) { return Hub.finDiscUI.tab(ctx); }], ['intake', 'بنویسید و راه‌حل بگیرید', function (ctx) { return Hub.finUI.intakeTab(ctx); }], ['diag', 'تشخیص و ارزیابی شرکت', function (ctx) { return Hub.finUI.diagTab(ctx); }], ['debt', 'تأمین مالی بدهی', function (ctx) { return Hub.finUI.engineTab('D')(ctx); }],
      ['equity', 'سرمایه‌ای و ترکیبی', function (ctx) { return Hub.finUI.engineTab('E')(ctx); }], ['asset', 'مولدسازی دارایی‌ها', function (ctx) { return Hub.finUI.engineTab('A')(ctx); }], ['struct', 'ساختارهای ترکیبی', function (ctx) { return Hub.finUI.structTab(ctx); }],
      ['rank', 'مقایسه و رتبه‌بندی', function (ctx) { return Hub.finUI.rankTab(ctx); }], ['report', 'گزارش نهایی و نقشهٔ اجرا', function (ctx) { return Hub.finUI.reportTab(ctx); }]] },
      { group: 'Statements screening', items: [['screen', 'Screening', function (ctx) {
      var S = ctx.S, R = ctx.R, q = S.q;
      var f = G.form({ id: 'fin-q', onChange: ctx.rerender, fields: [
        { type: 'head', label: 'What you need' },
        ctx.field('need', 'Amount to raise (unit of the statements)', 'q.need', 'num'),
        { key: 'pur', label: 'Purpose', options: Object.keys(PURPOSE).map(function (k) { return [k, tx(PURPOSE[k])]; }), get: function () { return q.purpose; }, set: function (v) { q.purpose = v; } },
        ctx.field('ten', 'Tenor (years)', 'q.tenor', 'dec'),
        { type: 'head', label: 'Gates' },
        { key: 'lst', label: 'Listing', options: [['no', 'Not listed'], ['ifb', 'IFB (فرابورس)'], ['tse', 'TSE (بورس تهران)']], get: function () { return q.listed; }, set: function (v) { q.listed = v; } },
        { key: 'frm', label: 'Legal form', options: [['pjs', 'Public joint-stock (سهامی عام)'], ['prjs', 'Private joint-stock (سهامی خاص)'], ['other', 'Other']], get: function () { return q.form; }, set: function (v) { q.form = v; } },
        { key: 'op', label: 'Last audit opinion', options: [['unqualified', 'Unqualified (مقبول)'], ['qualified', 'Qualified (مشروط)'], ['adverse', 'Adverse / disclaimer (مردود / عدم اظهارنظر)'], ['none', 'Not audited']], get: function () { return q.opinion; }, set: function (v) { q.opinion = v; } },
        { key: 'rt', label: 'Credit rating', options: [['none', 'None'], ['BBB', 'BBB or lower'], ['A', 'A range'], ['AA', 'AA or higher']], get: function () { return q.rating; }, set: function (v) { q.rating = v; } },
        { key: 'gu', label: 'Bank / institutional guarantor available', options: [['yes', 'Yes'], ['no', 'No']], get: function () { return q.guarantor; }, set: function (v) { q.guarantor = v; } },
        { type: 'head', label: 'What can back the funding' },
        ctx.field('av', 'Appraised value of unencumbered fixed assets (0 = book value)', 'q.assetValue', 'num'),
        ctx.field('mt', 'Materials share of cost of sales', 'q.materials', 'pct', { unit: '%' }),
        ctx.field('ars', 'Receivables from creditworthy customers (share)', 'q.arShare', 'pct', { unit: '%' }),
        { key: 'ime', label: 'Standard commodity on the Iran Mercantile Exchange', options: [['no', 'No'], ['yes', 'Yes']], get: function () { return q.ime; }, set: function (v) { q.ime = v; } },
        { key: 'svc', label: 'Pre-sellable service capacity', options: [['no', 'No'], ['yes', 'Yes']], get: function () { return q.service; }, set: function (v) { q.service = v; } },
        ctx.field('pc', 'Project cost (0 = no project)', 'q.projectCost', 'num'),
        { key: 'dil', label: 'Shareholders accept dilution / will subscribe', options: [['no', 'No'], ['yes', 'Yes']], get: function () { return q.dilution; }, set: function (v) { q.dilution = v; } },
        { key: 'cfs', label: 'Small unlisted business (crowdfunding)', options: [['no', 'No'], ['yes', 'Yes']], get: function () { return q.cfSize; }, set: function (v) { q.cfSize = v; } },
        { type: 'head', label: 'Your limits and current market numbers (verify)' },
        ctx.field('br', 'Bank lending rate (your quote)', 'q.bankRate', 'pct2', { unit: '%' }),
        ctx.field('ml', 'Maximum net debt / EBITDA', 'q.maxLev', 'dec', { unit: 'x' }), ctx.field('mc', 'Minimum EBITDA / interest', 'q.minCov', 'dec', { unit: 'x' }),
        ctx.field('cfc', 'Crowdfunding ceiling per project (current, verify with IFB; 0 = unknown)', 'q.cfCap', 'num')] });
      if (R.empty) return ctx.group([ctx.two(ctx.panel('Start', [h('p', { class: 'muted', text: 'Use the Company data bar above: import the Excel file or the PDF of the statements (or paste the rows), then answer the questions on the right.' })]), ctx.panel('Your situation', [f]))]);
      var t = h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['Instrument', 'Fit', 'Indicative capacity', 'Indicative cost', 'Why', 'Documents and parties', 'Regulatory basis (verify)'].map(function (x) { return h('th', { class: 'lbl', text: x }); }))]),
        h('tbody', null, R.list.map(function (o) { return h('tr', { class: 'fit-' + o.level }, [h('td', { 'data-notr': '1' }, [h('strong', { text: tx(o.name) })]), h('td', null, [h('span', { class: 'sev fit-' + o.level, 'data-notr': '1', text: tx(LV[o.level]) })]),
          h('td', { class: 'num', text: o.capacity > 0 ? U.fmtNum(o.capacity) : '–' }), h('td', { class: 'num', text: isFinite(o.costRate) ? U.fmtPct(o.costRate, 2) : '–' }), h('td', { 'data-notr': '1' }, [h('ul', { class: 'studio-l' }, o.why.map(function (w) { return h('li', { text: tx(w) }); }))]),
          h('td', { 'data-notr': '1', class: 'small', text: tx(o.docs) }), h('td', { 'data-notr': '1', class: 'small muted', text: tx(o.basis) })]); }))]);
      var cap = h('p', { class: 'f-help', 'data-notr': '1', text: fa() ? ('ظرفیت بدهی: ' + U.fmtNum(R.debtCap) + ' = کمترِ سقف اهرم (' + U.fmtNum(R.capLev) + ') و سقف پوشش بهره (' + (isFinite(R.capCov) ? U.fmtNum(R.capCov) : '–') + ')؛ بدهی خالص ' + U.fmtNum(R.nd) + '، EBITDA ' + U.fmtNum(R.ebitda) + '؛ هزینهٔ بدهی جدید ' + U.fmtPct(R.kd, 2) + (R.K && isFinite(R.K.all) ? ' (هزینهٔ واقعی اوراق، زبانهٔ هزینهٔ اوراق)' : '') + '. ظرفیت هر ابزار، کمترِ ظرفیت بدهی و پشتوانهٔ همان ابزار است.')
        : ('Debt capacity ' + U.fmtNum(R.debtCap) + ' = lower of the leverage limit (' + U.fmtNum(R.capLev) + ') and the interest-cover limit (' + (isFinite(R.capCov) ? U.fmtNum(R.capCov) : '–') + '); net debt ' + U.fmtNum(R.nd) + ', EBITDA ' + U.fmtNum(R.ebitda) + '; new debt costed at ' + U.fmtPct(R.kd, 2) + (R.K && isFinite(R.K.all) ? ' (true sukuk cost, Sukuk cost tab)' : '') + '. Each instrument’s capacity is the lower of debt capacity and what backs it.') });
      var gates = R.gates.length ? h('ul', { class: 'studio-l', 'data-notr': '1' }, R.gates.map(function (g) { return h('li', { text: tx(g) }); })) : h('p', { class: 'muted', text: 'No gate blocks a sukuk issue on the information given.' });
      return ctx.group([ctx.panel('Routes ranked for this company', [cap, h('div', { class: 'grid-wrap' }, [t]), h('p', { class: 'f-help', text: 'Screening only: thresholds that change (rate caps, ceilings, admission criteria) are your inputs; confirm them and the instruction texts on seo.ir, ifb.ir, tse.ir, ime.co.ir and cbi.ir before acting. Detailed costing: Bond Issue vs No-issue; process: the roadmaps.' })]),
        ctx.two(ctx.panel('Your situation', [f]), ctx.panel('Gates before a sukuk issue', [gates]))]);
    }], ['sukuk', 'Sukuk cost (ytm)', function (ctx) {
      var S = ctx.S, k = S.sk, K = ctx.R.K || sukukCost(S, num(S.q.need)), J = Hub.jalali;
      var terms = G.form({ id: 'fin-sk', onChange: ctx.recompute, fields: [
        { key: 'am', label: 'Face amount (= amount to raise; change it on Screening)', calc: function () { return U.fmtNum(num(S.q.need) > 0 ? num(S.q.need) : 1000000) + (num(S.q.need) > 0 ? '' : (fa() ? ' (موقت)' : ' (placeholder)')); } },
        { key: 'te', label: 'Tenor (years, from Screening)', calc: function () { return String(Math.max(1, Math.round(num(S.q.tenor)) || 1)); } },
        ctx.field('cp', 'Coupon / profit rate (annual)', 'sk.coupon', 'pct2', { unit: '%' }),
        { key: 'fq', label: 'Coupon payments per year', options: [['4', '4 · quarterly'], ['2', '2 · semi-annual'], ['12', '12 · monthly'], ['1', '1 · annual']], get: function () { return String(k.freq); }, set: function (v) { k.freq = +v; } },
        { key: 'd0', label: 'Subscription date', text: true, unit: '1405/11/12 or 2027-02-01', get: function () { return k.issueDate; }, set: function (v) { if (J && isFinite(J.parse(v))) k.issueDate = v.trim(); else U.toast('Date not recognised: 1405/11/12 (Shamsi) or 2027-02-01', 'warn'); } },
        ctx.field('cap', 'Rate approved by SEO (cap on the rate presented)', 'sk.cap', 'pct2', { unit: '%' }),
        { key: 'cc', label: 'Coupon convention', options: [['equal', 'Equal: face × rate ÷ payments per year'], ['act365', 'Actual days ÷ 365']], get: function () { return k.couponConv; }, set: function (v) { k.couponConv = v; } },
        { key: 'pr', label: 'Principal', options: [['bullet', 'Bullet at maturity'], ['equal', 'Equal instalments with each coupon']], get: function () { return k.principal; }, set: function (v) { k.principal = v; } },
        { key: 'cv', label: 'Payment date adjustment', options: [['next', 'Next business day'], ['modfollow', 'Next business day, same month'], ['prev', 'Previous business day'], ['none', 'No adjustment']], get: function () { return k.cal.conv; }, set: function (v) { k.cal.conv = v; } },
        { key: 'wk', label: 'Weekend', options: [['2', 'Thursday and Friday'], ['1', 'Friday only']], get: function () { return String(k.cal.weekend); }, set: function (v) { k.cal.weekend = +v; } },
        { key: 'lu', label: 'Lunar holidays', options: [['1', 'Apply (approximate)'], ['0', 'Ignore']], get: function () { return k.cal.lunar ? '1' : '0'; }, set: function (v) { k.cal.lunar = v === '1'; } },
        { key: 'xh', label: 'Extra or corrected holidays (Shamsi, comma-separated)', text: true, get: function () { return k.cal.extra; }, set: function (v) { k.cal.extra = v; } }] });
      var BAS = { o: 'One-off', y: 'Annual' }, TO = { '0': 'Issue date', M: 'Maturity' }, TY = { s: 'Start of each year', m: 'Middle of each year', e: 'End of each year', all: 'Whole term, prepaid at issue' };
      var fees = ctx.list({ id: 'fin-fees', path: 'sk.fees', newRow: function () { return { name: 'New party', pct: 0, unit: '%', basis: 'o', timing: '0', delay: 0, seo: true }; }, cols: [
        { key: 'name', label: 'Party / fee', kind: 'text' }, { key: 'pct', label: 'Rate or amount', fmt: 'num4' },
        { key: 'unit', label: 'Unit', kind: 'select', options: function () { return [['%', '% of face (enter as decimal)'], ['A', 'Fixed amount']]; } },
        { key: 'basis', label: 'Basis', kind: 'select', options: function () { return [['o', BAS.o], ['y', BAS.y]]; }, onSet: function (row) { row.timing = row.basis === 'y' ? 's' : '0'; }, repaint: true },
        { key: 'timing', label: 'Timing', kind: 'select', options: function (row) { var o = row.basis === 'y' ? TY : TO; return Object.keys(o).map(function (x) { return [x, o[x]]; }); } },
        { key: 'delay', label: 'Delay (days)' }, { key: 'seo', label: 'In SEO rate', kind: 'bool' }] });
      var res;
      if (!K || K.error) res = h('p', { class: 'muted', text: K && K.error ? K.error : 'Bond Issue engine not loaded.' });
      else res = h('table', { class: 'grid' }, [h('tbody', null, [
        ['Rate presented to SEO (fees flagged “in SEO rate”)', U.fmtPct(K.seo, 2), K.overCap],
        ['Rate approved by SEO', U.fmtPct(K.cap, 2)],
        [K.overCap ? 'Above the approved rate by' : 'Headroom to the approved rate', ((K.overCap ? K.seo - K.cap : K.cap - K.seo) * 100).toFixed(2) + ' pp', K.overCap],
        ['True issuer cost (all fees, incl. side letter)', U.fmtPct(K.all, 2)],
        ['Coupons only', U.fmtPct(K.bare, 2)],
        ['Maximum coupon within the approved rate', isFinite(K.maxCoupon) ? U.fmtPct(K.maxCoupon, 2) : 'not reachable even at zero coupon'],
        ['Allowed scale of SEO-rate fees within the approved rate', isFinite(K.feeScale) ? K.feeScale.toFixed(3) + '× current' : 'not reachable even with zero fees'],
        ['Net proceeds on the subscription date', U.fmtNum(K.net)],
        ['Bank loan, effective (monthly compounding of your quote)', U.fmtPct(K.loanEff, 2), K.all > K.loanEff],
        ['Payment dates moved to a business day', String(K.shifts)]].map(function (r) { return h('tr', { class: r[2] ? 'flag' : '' }, [h('th', { class: 'lbl', scope: 'row', text: r[0] }), h('td', { class: 'num', text: r[1] })]); }))]);
      var st = h('p', { class: 'muted', 'aria-live': 'polite' });
      var pull = h('button', { class: 'btn ghost', type: 'button', text: 'Load terms from Bond Issue vs No-issue', onclick: function () {
        var b = U.store.get('hub.bondissue.v2', null); if (!b || !b.bond) { st.textContent = 'No saved Bond Issue terms yet.'; return; }
        k.coupon = num(b.bond.coupon); k.freq = num(b.bond.freq) || 4; k.issueDate = b.bond.issueDate; k.cap = num(b.cap); k.cal = JSON.parse(JSON.stringify(b.cal)); k.fees = JSON.parse(JSON.stringify(b.fees));
        k.principal = b.settings.principal; k.couponConv = b.settings.couponConv; ctx.rerender(); U.toast('Terms loaded from Bond Issue vs No-issue.', 'good');
      } });
      var push = h('button', { class: 'btn primary', type: 'button', text: 'Open in Bond Issue vs No-issue', onclick: function () {
        var BI = Hub.tools.bondIssue, x = biState(S, num(S.q.need)), D = ctx.R.D;
        if (D) { var l = D.n - 1; x.meta.issuer = (ctx.R.rec && ctx.R.rec.file) || 'Issuer'; x.meta.unit = D.unit || x.meta.unit; x.meta.currency = D.currency || x.meta.currency;
          x.co = { capital: D.capital ? D.capital[l] : 0, equity: D.equity[l], netIncome: D.ni[l], ebitda: D.ebitda[l], financeCost: D.ie[l], taxRate: 0.25 }; }
        x.sources = { 'bond.amount': 'Financing Solutions · ' + U.stamp() };
        U.store.set('hub.bondissue.v2', x); location.hash = '#bond-issue';
      } });
      return ctx.group([ctx.panel('Sukuk cost · your ytm method', [h('p', { class: 'muted', text: 'Same method as your ytm calculator: payment dates step whole Shamsi months from subscription and move to business days (weekend, fixed and lunar holidays); fees of the parties are dated cash flows; the rate presented to SEO counts only fees flagged “in SEO rate” (leave the side letter unticked); true issuer cost counts all; XIRR on actual/365. Percent fees make the rates independent of the amount.' }), res,
        h('div', { class: 'row-ctl' }, [push, pull]), st]),
        ctx.two(ctx.panel('Issue terms', [terms]), ctx.panel('Fees of the issue parties (ارکان)', [h('p', { class: 'muted', text: 'Rates as decimals of face (0.02 = 2%) or fixed amounts. Defaults are the rows of your ytm calculator.' }), fees]))]);
    }], ['advice', 'Funding solution', function (ctx) {
      var S = ctx.S, R = ctx.R;
      if (R.empty) return ctx.group([ctx.panel('Claude solution', [h('p', { class: 'muted', text: 'Load the statements first (Company data bar).' })])]);
      var st = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
      var ans = h('textarea', { class: 'f-area', rows: 3, placeholder: 'Paste Claude’s JSON answer here', 'aria-label': 'Claude answer' });
      function localAdv() { var j = Hub.localAI.financing(S, R, lang(S)); j.method = lang(S) === 'fa' ? 'راه‌حل محلی قاعده‌محور (بدون هوش مصنوعی): از غربالگری ابزارها، ظرفیت بدهی و ضوابط سازمان بورس' : 'Local rule-based solution (no AI): from the instrument screening, debt capacity and SEO rules'; return Promise.resolve(j); }
      var loc = h('button', { class: 'btn', type: 'button', text: 'Local solution (no AI)', onclick: function () { localAdv().then(function (j) { S.advice = { json: j, at: new Date().toLocaleString(), local: true }; ctx.rerender(); }); } });
      var go = h('button', { class: 'btn primary', type: 'button', text: 'Design the funding solution (AI if connected, else local)', onclick: function () {
        go.disabled = true; st.textContent = 'Claude is designing the funding structure…';
        Hub.pdfread.sampler().then(function (sample) { if (!sample) return localAdv(); return sample.json(advicePrompt(S, R, lang(S)), { modelTier: 'complex' }); })
          .then(function (j) { S.advice = { json: j, at: new Date().toLocaleString() }; ctx.rerender(); })
          .catch(function (e) { go.disabled = false; st.textContent = e && e.code === 'offline' ? 'Claude is not reachable from this copy (it works inside the claude.ai artifact, or here with your Anthropic API key on Data sources & keys). Use Copy prompt, paste it into Claude, then paste the JSON answer below.' : 'Failed: ' + (e && e.message || e); });
      } });
      var copy = h('button', { class: 'btn ghost', type: 'button', text: 'Copy prompt', onclick: function () { Hub.aiText.copy(advicePrompt(S, R, lang(S)), ans); } });
      var imp = h('button', { class: 'btn ghost', type: 'button', text: 'Import answer', onclick: function () { try { S.advice = { json: Hub.aiText.parseJSON(ans.value), at: new Date().toLocaleString() }; ctx.rerender(); } catch (e) { U.toast(e.message, 'crit'); } } });
      var out = S.advice && S.advice.json ? Hub.aiText.render(S.advice.json) : h('p', { class: 'muted', text: 'Not run yet.' });
      return ctx.group([ctx.panel('Funding solution (AI or local)', [h('p', { class: 'muted', text: 'Claude receives the statements, your answers, the debt capacity and the screening, and returns a recommended structure, alternatives, what does not fit, preparations, a roadmap, risks and the regulations to verify. A draft for your judgement.' }),
        h('div', { class: 'row-ctl' }, [go, loc, copy]), st, h('details', null, [h('summary', { text: 'Offline: import an answer' }), ans, h('div', { class: 'row-ctl' }, [imp])])]),
        ctx.panel('Solution' + (S.advice ? ' · ' + S.advice.at : ''), [out])]);
    }]] }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
