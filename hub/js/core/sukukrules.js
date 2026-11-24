/* =====================================================================
 * SUKUK RULES — eligibility and maximum issue size under the SEO texts the
 * user supplied (Nov 2026):
 *   [IJ]  Ijara sukuk instruction, Supreme Council 1390/08/23 (as amended)
 *   [MU]  Murabaha sukuk instruction, SEO board 1390/09/26 (as amended; part 9:
 *         small and short-term murabaha)
 *   [CR]  Instruction on issuing debt securities using a credit rating, SEO
 *         board 1402/05/16 (cmr.seo.ir rule 61190, version printed 2024-02-07)
 *   [PM]  Murabaha issuance procedure (رویه اجرایی), 1402/11/15
 *   [PS]  Detailed procedure, private offering of small short-term murabaha,
 *         CAMC edition 1403/10/04
 *   [DV]  Act on Development of New Financial Instruments and Institutions,
 *         1388/09/25 (arts. 11–12: tax exemptions)
 *   [HB]  "Sukuk, Islamic financing instrument", Central Asset Management Co.
 *         (CAMC) handbook — instrument definitions and operating models
 * Every check carries its article so it can be verified. Texts change: the
 * versions above are what this engine encodes; confirm amendments on
 * cmr.seo.ir before filing. Screening only, not a legal opinion.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  function L(en, fa) { return { en: en, fa: fa }; }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function F(v) { return isFinite(v) ? Math.round(v).toLocaleString('en-US') : '–'; }

  var RATINGS = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-'];
  // [CR] art. 2(1), table 1: cap on liabilities / assets by rating class
  function debtRatioCap(r) { var i = RATINGS.indexOf(r); if (i < 0) return NaN; return i === 0 ? 0.90 : i <= 3 ? 0.85 : i <= 6 ? 0.80 : 0.75; }
  // [IJ] art. 5 t3 / [MU] art. 5 t3 base coefficient and replenishment level; [CR] art. 3 table 2: coefficients by rating (AAA → BBB-)
  var COLL = {
    tse1: { en: 'Shares, TSE main board', fa: 'سهام بازار اول بورس تهران', base: 1.3, comp: 1.0, r: [0.68, 0.75, 0.78, 0.81, 0.88, 0.91, 0.94, 1.01, 1.04, 1.07] },
    tse2: { en: 'Shares, TSE secondary board', fa: 'سهام بازار دوم بورس تهران', base: 1.5, comp: 1.1, r: [0.86, 0.95, 0.98, 1.01, 1.10, 1.13, 1.16, 1.25, 1.28, 1.31] },
    ifb1: { en: 'Shares, IFB first market', fa: 'سهام بازار اول فرابورس', base: 1.6, comp: 1.2, r: [0.94, 1.04, 1.07, 1.10, 1.20, 1.23, 1.26, 1.36, 1.39, 1.42] },
    ifb2: { en: 'Shares, IFB second market', fa: 'سهام بازار دوم فرابورس', base: 2.0, comp: 1.5, r: [1.28, 1.40, 1.44, 1.48, 1.60, 1.64, 1.68, 1.80, 1.84, 1.88] },
    own: { en: 'Originator’s shares pledged by its shareholder', fa: 'سهام بانی توثیق‌شده توسط سهامدار', base: 2.5, comp: 1.8, r: [1.60, 1.65, 1.73, 1.80, 1.88, 1.95, 2.00, 2.08, 2.15, 2.23] },
    bondBank: { en: 'Listed debt securities with bank guarantee', fa: 'اوراق بدهی پذیرفته‌شده با ضمانت بانک', base: 1.2, comp: 1.0, r: [0.48, 0.55, 0.58, 0.60, 0.67, 0.70, 0.72, 0.79, 0.82, 0.84] },
    bondOther: { en: 'Listed debt securities, non-bank guarantor', fa: 'اوراق بدهی پذیرفته‌شده با ضامن غیربانکی', base: 1.3, comp: 1.0, r: [0.55, 0.62, 0.65, 0.68, 0.75, 0.78, 0.81, 0.88, 0.91, 0.94] },
    deposit: { en: 'Bank deposit certificates', fa: 'اسناد سپردهٔ بانکی', base: 1.0, comp: NaN, r: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    etfFixed: { en: 'Fixed-income ETF units', fa: 'واحد صندوق درآمد ثابت قابل معامله', base: 1.3, comp: 1.2, r: [0.53, 0.61, 0.64, 0.66, 0.74, 0.77, 0.79, 0.87, 0.90, 0.92] },
    etfOther: { en: 'Mixed, equity or commodity ETF units', fa: 'واحد صندوق مختلط، سهامی یا کالایی قابل معامله', base: 1.5, comp: 1.3, r: [0.87, 0.96, 0.99, 1.02, 1.11, 1.14, 1.17, 1.26, 1.29, 1.32] }
  };
  function collCoef(type, rating) { var c = COLL[type]; if (!c) return NaN; var i = RATINGS.indexOf(rating); return i < 0 ? c.base : c.r[i]; }

  var IJ_ASSETS = { land: L('Land', 'زمین'), building: L('Buildings and installations', 'ساختمان و تأسیسات'), machinery: L('Machinery and equipment', 'ماشین‌آلات و تجهیزات'), vehicles: L('Vehicles', 'وسایل حمل‌ونقل'), shares: L('Listed shares (TSE / IFB)', 'سهام پذیرفته‌شده در بورس / فرابورس') };
  var MU_ASSETS = { materials: L('Materials and goods', 'مواد و کالا'), machinery: L('Machinery and equipment', 'ماشین‌آلات و تجهیزات'), land: L('Land', 'زمین'), building: L('Buildings and installations', 'ساختمان و تأسیسات'), vehicles: L('Vehicles', 'وسایل حمل‌ونقل'), software: L('Software and databases', 'نرم‌افزار و بانک اطلاعاتی'), shares: L('Shares', 'سهام') };
  var GUARANTORS = { bank: L('Bank / credit institution (CBI-supervised)', 'بانک / مؤسسهٔ اعتباری تحت نظارت بانک مرکزی'), insurer: L('Insurer (Central Insurance-supervised)', 'بیمه تحت نظارت بیمهٔ مرکزی'), tamin: L('Investment bank (تأمین سرمایه)', 'شرکت تأمین سرمایه'), invest: L('Investment company', 'شرکت سرمایه‌گذاری'), public: L('Public non-government body', 'نهاد عمومی غیردولتی'), gov: L('Government company or body', 'شرکت یا مؤسسهٔ دولتی'), none: L('None', 'ندارد') };

  function sample() {
    return { entity: 'company', form: 'joint', iran: 'yes', listed: 'no', op1: 'unqualified', op0: 'unqualified', insp: 'ok', trusted: 'yes', defaulted: 'no',
      rating: 'none', issueRating: 'same', guarantor: 'bank', guarantorControlled: 'no', bankGuaranteeCbi: 'yes', guarantorLimit: 0,
      outstanding: 0, interimCfoPositive: 'no', knowledge: 'no', smallOutstanding: 0, tenorMonths: 36, draft1405: 'no',
      coll: [], ijAssets: [], muAssets: [], useBookPpe: true, useCogsMaterials: true, materials: 0.6, months: 12 };
  }
  var OPF = { unqualified: 'مقبول', qualified: 'مشروط', adverse: 'مردود', disclaimer: 'عدم اظهارنظر', none: 'حسابرسی‌نشده' };
  var UNIT = { one: 1, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
  function rialFactor(D) { var f = UNIT[D.unit] || 1e6; return /IRT|toman|تومان/i.test(D.currency || '') ? f * 10 : f; }
  function fmtR(x) { if (!isFinite(x)) return '–'; var b = x / 1e9; return (Math.abs(b) >= 1 ? b.toLocaleString('en-US', { maximumFractionDigits: 0 }) : b.toFixed(2)) + ' bn rials'; }
  function fmtRfa(x) { if (!isFinite(x)) return '–'; var b = x / 1e9; return (Math.abs(b) >= 1 ? b.toLocaleString('en-US', { maximumFractionDigits: 0 }) : b.toFixed(2)) + ' میلیارد ریال'; }

  /* assess(D, X, T): D = company series (Hub.companyData.series), X = inputs above, T = { coupon, tenorYears } for the collateral sum */
  function assess(D, X, T) {
    X = X || sample(); T = T || {};
    var l = D.n - 1, f = rialFactor(D), tenorY = Math.max(0.25, num(X.tenorMonths) / 12), coupon = num(T.coupon) || 0.23;
    var TA = (D.taFile && D.taFile[l]) || D.ta[l], EQ = D.equity[l], TL = TA - EQ, ratio = TA ? TL / TA : NaN;
    var cfo = D.cfo || null, cfo2 = cfo && D.n >= 2 ? cfo[l] + cfo[l - 1] : cfo ? cfo[l] : NaN, bank = X.entity === 'bank', gov = X.entity === 'gov';
    var checks = [], rep = function (id, ok, label, detail, cite, waivedBy) { checks.push({ id: id, ok: ok, label: label, detail: detail, cite: cite, waivedBy: waivedBy || null }); return ok; };
    var bankGuar = X.guarantor === 'bank' && X.bankGuaranteeCbi === 'yes';
    // ---------- originator (bani) conditions: [IJ] art. 2, [MU] art. 2 ----------
    if (gov) rep('gov', true, L('Government body, state company or municipality', 'مؤسسه یا شرکت دولتی یا شهرداری'), L('Part (b) of art. 2: the private-company tests below do not apply.', 'بند (ب) مادهٔ ۲: آزمون‌های شرکت‌های غیردولتی اعمال نمی‌شود.'), '[IJ] 2(b), [MU] 2(b)');
    else {
      rep('form', X.form !== 'other' && X.iran === 'yes', L('Legal form and registration', 'شکل حقوقی و ثبت'), L('Joint-stock, cooperative, investment fund or non-government public body (municipalities excluded under murabaha 2(a)), registered with its main activity in Iran.', 'سهامی، تعاونی، صندوق سرمایه‌گذاری یا نهاد عمومی غیردولتی (در مرابحه به استثنای شهرداری)، ثبت‌شده با مرکز اصلی فعالیت در ایران.'), '[IJ] 2(a)(1-2), [MU] 2(a)(1)');
      var cfoOk = bank ? (cfo ? cfo[l] > 0 : false) : (isFinite(cfo2) && cfo2 > 0) || X.interimCfoPositive === 'yes';
      var cfoTxt = cfo ? (bank ? 'CFO last year ' + F(cfo[l]) : 'CFO ' + D.years[l - 1] + ' + ' + D.years[l] + ' = ' + F(cfo[l - 1] || 0) + ' + ' + F(cfo[l]) + ' = ' + F(cfo2)) + ' (' + D.unit + ')' : 'cash flow statement not found in the import';
      var cfoTxtFa = cfo ? (bank ? 'جریان نقد عملیاتی سال آخر ' + F(cfo[l]) : 'جریان نقد عملیاتی ' + D.years[l - 1] + ' + ' + D.years[l] + ' = ' + F(cfo2)) : 'صورت جریان وجوه نقد در داده‌های واردشده پیدا نشد';
      rep('cfo', cfoOk, L(bank ? 'Operating cash flow of the last year is positive' : 'Sum of operating cash flow over the last two years is positive', bank ? 'جریان نقد عملیاتی سال اخیر مثبت' : 'جمع جریان نقد عملیاتی دو سال مالی اخیر مثبت'),
        L(cfoTxt + '. Audited interim CFO of the current year may be added; a first fiscal period of ≥ 6 months counts as a year (SEO resolution 1401/12/20).', cfoTxtFa + '. جریان نقد عملیاتی میان‌دوره‌ای حسابرسی‌شدهٔ سال جاری قابل افزودن است؛ اولین دورهٔ مالی ≥ ۶ ماه یک سال محسوب می‌شود (مصوبهٔ تفسیری ۱۴۰۱/۱۲/۲۰).'), bank ? '[IJ] 2 t2, [MU] 2 t1' : '[IJ] 2(a)(3), [MU] 2(a)(2)',
        L('Waived if a CBI-licensed bank / credit institution guarantees payments with prior CBI approval' + (bank ? '' : '; for ijara also if fully collateralised with securities without rating discounts'), 'در صورت ضمانت بانک / مؤسسهٔ اعتباری دارای مجوز با تأیید بانک مرکزی معاف است' + (bank ? '' : '؛ در اجاره همچنین با توثیق کامل اوراق بهادار بدون تخفیف رتبه')));
      var cap = bank ? 0.95 : 0.90;
      rep('lev', ratio <= cap, L('Total liabilities / total assets ≤ ' + F(cap * 100) + '%', 'نسبت مجموع بدهی‌ها به دارایی‌ها ≤ ' + F(cap * 100) + '٪'),
        L('Now ' + (ratio * 100).toFixed(1) + '% (liabilities ' + F(TL) + ' / assets ' + F(TA) + ', ' + D.years[l] + ').', 'اکنون ' + (ratio * 100).toFixed(1) + '٪ (بدهی ' + F(TL) + ' / دارایی ' + F(TA) + '، ' + D.years[l] + ').'), bank ? '[IJ] 2 t2, [MU] 2 t1' : '[IJ] 2(a)(4), [MU] 2(a)(3)',
        L('Waived by the same bank guarantee (and for ijara by full collateral without rating discounts)', 'با همان ضمانت بانکی معاف است (و در اجاره با توثیق کامل بدون تخفیف رتبه)'));
      var badOp = function (o) { return o === 'adverse' || o === 'disclaimer' || o === 'none'; };
      rep('opinion', !badOp(X.op0) && !badOp(X.op1) && X.insp !== 'bad', L('Auditor and inspector opinions on the last two years: not adverse, not disclaimer', 'اظهارنظر حسابرس و بازرس دو سال اخیر: مردود یا عدم اظهارنظر نباشد'),
        L('Year −1: ' + X.op1 + '; last year: ' + X.op0 + (X.insp === 'bad' ? '; inspector: adverse / disclaimer' : '') + '.', 'سال قبل: ' + OPF[X.op1] + '؛ سال آخر: ' + OPF[X.op0] + (X.insp === 'bad' ? '؛ بازرس: مردود / عدم اظهارنظر' : '') + '.'), '[IJ] 2(a)(5), [MU] 2(a)(4)');
    }
    rep('trusted', X.trusted === 'yes', L('Auditor is on the SEO-trusted list; last year audited by an SEO-trusted auditor', 'حسابرس از مؤسسات معتمد سازمان؛ صورت‌های سال آخر توسط حسابرس معتمد حسابرسی شده'), L('Required from filing until the sukuk are settled; two audited years must be filed.', 'از ارائهٔ طرح تا تصفیهٔ اوراق الزامی است؛ صورت‌های حسابرسی‌شدهٔ دو سال اخیر ارائه می‌شود.'), '[IJ] 6, 20(2); [MU] 6, 17(2)');
    rep('default', X.defaulted !== 'yes', L('No late payment on capital-market securities in the last two years', 'نبود تأخیر در پرداخت اصل و فرع اوراق در دو سال اخیر'), L('A confirmed delay bars new issues for 2 years.', 'تأخیر احرازشده، انتشار اوراق جدید را تا ۲ سال ممنوع می‌کند.'), '[CR] 8');

    var waivable = { cfo: 1, lev: 1 }, hard = checks.filter(function (c) { return !c.ok && !waivable[c.id]; });
    var softFail = checks.filter(function (c) { return !c.ok && waivable[c.id]; });

    // ---------- credit enhancement routes ----------
    var routes = [], rIdx = RATINGS.indexOf(X.rating), rated = rIdx >= 0, issueR = X.issueRating === 'same' ? X.rating : X.issueRating;
    var listed = X.listed !== 'no', O = num(X.outstanding);
    // (1) guarantor
    var gOk = X.guarantor !== 'none' && X.guarantorControlled !== 'yes';
    routes.push({ key: 'guarantor', name: L('Guarantor', 'ضامن'), ok: gOk,
      cap: gOk ? (num(X.guarantorLimit) > 0 ? num(X.guarantorLimit) : Infinity) : 0,
      why: [gOk ? L((GUARANTORS[X.guarantor] || GUARANTORS.none).en + '. Must not be controlled by the originator (auditor confirms).', (GUARANTORS[X.guarantor] || GUARANTORS.none).fa + '. نباید تحت کنترل بانی باشد (تأیید حسابرس).') : L(X.guarantorControlled === 'yes' ? 'A guarantor controlled by the originator is not accepted.' : 'No guarantor.', X.guarantorControlled === 'yes' ? 'ضامن تحت کنترل بانی پذیرفته نیست.' : 'ضامن ندارد.'),
        L('Guarantor’s limit: ' + (num(X.guarantorLimit) > 0 ? F(num(X.guarantorLimit)) : 'not entered (the bank’s credit committee sets it)') + '.', 'سقف ضامن: ' + (num(X.guarantorLimit) > 0 ? F(num(X.guarantorLimit)) : 'وارد نشده (کمیتهٔ اعتباری بانک تعیین می‌کند)') + '.')],
      cite: '[IJ] 5, [MU] 5', waives: bankGuar ? ['cfo', 'lev'] : [] });
    // (2) rating, no guarantor: listed + rating ≥ BBB- + liabilities / assets cap
    var c = debtRatioCap(X.rating), capA = NaN, capB = NaN;
    if (rated) { capA = (c * TA - TL - O) / (1 - c); capB = c * TA - TL - O; }
    var rOk = rated && listed && RATINGS.indexOf(issueR) >= 0;
    routes.push({ key: 'rating', name: L('Credit rating, no guarantor', 'رتبهٔ اعتباری بدون ضامن'), ok: rOk && Math.min(capA, capB) > 0,
      cap: rOk ? Math.max(0, Math.min(capA, capB)) : 0, capA: capA, capB: capB, ratioCap: c,
      why: [L(listed ? 'Listed on TSE / IFB.' : 'Must be listed on TSE or IFB.', listed ? 'پذیرفته‌شده در بورس / فرابورس.' : 'باید در بورس تهران یا فرابورس پذیرفته شده باشد.'),
        L(rated ? 'Issuer rating ' + X.rating + ', issue rating ' + issueR + ' (both ≥ BBB-, monitored yearly).' : 'Needs an issuer and issue rating of at least BBB-.', rated ? 'رتبهٔ بانی ' + X.rating + '، رتبهٔ اوراق ' + issueR + ' (هر دو حداقل BBB-، پایش سالانه).' : 'به رتبهٔ بانی و اوراق حداقل BBB- نیاز است.'),
        L(rated ? 'Liabilities / assets after the issue ≤ ' + F(c * 100) + '% on the last audited statements, counting debt securities issued or approved since: max ' + F(Math.min(capA, capB)) + ' (' + D.unit + '); ' + F(capA) + ' if the proceeds are added to assets, ' + F(capB) + ' if not.' : '', rated ? 'نسبت بدهی به دارایی پس از انتشار ≤ ' + F(c * 100) + '٪ بر اساس آخرین صورت‌های حسابرسی‌شده، با احتساب اوراق منتشره یا دارای موافقت اصولی پس از آن: حداکثر ' + F(Math.min(capA, capB)) + '؛ ' + F(capA) + ' اگر وجوه به دارایی افزوده شود، ' + F(capB) + ' اگر نه.' : ''),
        L('Minimum purchase order 100,000 sheets (100 bn rials); marked symbol; buyers sign a risk statement.', 'حداقل سفارش خرید ۱۰۰٬۰۰۰ ورقه (۱۰۰ میلیارد ریال)؛ نماد نشان‌دار؛ بیانیهٔ ریسک خریداران.')].filter(function (x) { return x.en; }),
      cite: '[CR] 2, 5; [IJ] 5 t2; [MU] 5 t2', waives: [] });
    // (3) pledged securities (rating ≥ BBB- gives reduced coefficients; below BBB- → base table and "high risk")
    var cs = (X.coll || []).map(function (r) { var k = collCoef(r.type, rated ? X.rating : null); return { type: r.type, value: num(r.value), coef: k, cover: num(r.value) / k }; });
    var cover = cs.reduce(function (a, r) { return a + (isFinite(r.cover) ? r.cover : 0); }, 0), totV = cs.reduce(function (a, r) { return a + r.value; }, 0);
    var maxShare = totV ? Math.max.apply(null, cs.map(function (r) { return r.value / totV; })) : 0;
    var coverBase = cs.reduce(function (a, r) { var k = COLL[r.type] ? COLL[r.type].base : NaN; return a + (isFinite(k) ? r.value / k : 0); }, 0), capBase = coverBase / (1 + coupon * tenorY);
    var cap3 = cover / (1 + coupon * tenorY), cOk = cs.length > 0 && (rated || X.rating === 'below');
    routes.push({ key: 'collateral', name: L('Pledged securities instead of a guarantor', 'توثیق اوراق بهادار به‌جای ضامن'), ok: cOk && cap3 > 0, cap: cOk ? cap3 : 0, capBase: cOk ? capBase : 0, coll: cs,
      why: [L(cs.length ? 'Collateral ' + F(totV) + ' covers principal + profit at the coefficients' + (rated ? ' discounted for rating ' + X.rating : ' of the instruction (no rating discount)') + ': max principal = Σ value ÷ coefficient ÷ (1 + ' + (coupon * 100).toFixed(1) + '% × ' + tenorY.toFixed(2) + ' yrs) = ' + F(cap3) + '.' : 'Enter the securities you could pledge (value at 6-month average price).', cs.length ? 'وثیقه ' + F(totV) + ' اصل و سود را با ضرایب' + (rated ? ' تعدیل‌شده برای رتبهٔ ' + X.rating : ' دستورالعمل (بدون تخفیف رتبه)') + ' پوشش می‌دهد: حداکثر اصل = Σ ارزش ÷ ضریب ÷ (۱ + ' + (coupon * 100).toFixed(1) + '٪ × ' + tenorY.toFixed(2) + ' سال) = ' + F(cap3) + '.' : 'اوراق بهادار قابل توثیق را وارد کنید (ارزش بر اساس میانگین قیمت ۶ ماهه).'),
        L('A credit rating is required for this route (art. 10); below BBB- the symbol is labelled “high risk” and funds may not buy.', 'برای این مسیر رتبهٔ اعتباری لازم است (مادهٔ ۱۰)؛ کمتر از BBB- نماد «اوراق پرریسک» می‌شود و صندوق‌ها مجاز به خرید نیستند.'),
        L('Portfolio: at least 3 securities, none above 40% (30% in ijara if it is the underlying share) — now ' + (cs.length) + ' item(s), largest ' + (maxShare * 100).toFixed(0) + '%; shares traded on ≥ 80% of trading days in the last year; top-up within 10 working days if the 5-day average falls to the replenishment level.', 'سبد: حداقل ۳ ورقه، هیچ‌کدام بیش از ۴۰٪ (در اجاره اگر سهم مبنا باشد ۳۰٪) — اکنون ' + cs.length + ' قلم، بزرگ‌ترین ' + (maxShare * 100).toFixed(0) + '٪؛ سهام در ≥ ۸۰٪ روزهای معاملاتی سال گذشته معامله شده باشد؛ جبران ظرف ۱۰ روز کاری اگر میانگین ۵ روزه به حد جبران برسد.')],
      warn: cs.length && (cs.length < 3 || maxShare > 0.4), cite: '[IJ] 5 t3, [MU] 5 t3, [CR] 3, 4, 6, 10, 11', waives: !rated && X.rating !== 'below' ? [] : ['ijara-cfo-lev-if-no-discount'] });

    // ---------- instruments ----------
    // waivable fails (CFO, leverage) are cured by a CBI-approved bank guarantee; for ijara also by full collateral at the
    // instruction's coefficients without rating discounts ([IJ] 2 t3)
    function routeCap(r, ik) {
      if (hard.length || !r.ok) return -1;
      if (!softFail.length) return r.cap;
      if (r.key === 'guarantor' && bankGuar) return r.cap;
      if (r.key === 'collateral' && ik === 'ijara') return r.capBase;
      return -1;
    }
    var bestRoute = function (assetCap, ik) {
      var opts = routes.map(function (r) { return { route: r, amount: Math.min(assetCap, routeCap(r, ik)) }; }).filter(function (o) { return o.amount > 0; });
      opts.sort(function (a, b) { return b.amount - a.amount; }); return opts;
    };
    var inst = [];
    // Ijara
    var ijA = (X.ijAssets || []).filter(function (a) { return num(a.value) > 0; });
    var ijRows = ijA.length ? ijA : (X.useBookPpe && D.ppe[l] > 0 ? [{ kind: 'machinery', value: D.ppe[l], life: 10, insured: 'yes', lien: 'no', book: true }] : []);
    var ijOk = ijRows.filter(function (a) { return a.lien !== 'yes' && a.insured !== 'no' && (num(a.life) <= 0 || num(a.life) * 12 >= num(X.tenorMonths)); });
    var ijCap = ijOk.reduce(function (a, r) { return a + num(r.value); }, 0), ijMin = 50e9 / f;
    var ijOpts = bestRoute(ijCap, 'ijara'), ijBook = ijRows.some(function (r) { return r.book; });
    inst.push({ key: 'ijara', name: L('Ijara sukuk (asset purchase or sale-and-lease-back)', 'اوراق اجاره (تأمین دارایی یا تأمین نقدینگی)'), assetCap: ijCap, opts: ijOpts,
      status: hard.length ? 'no' : ijCap < ijMin ? 'no' : ijOpts.length ? (softFail.length || ijBook ? 'cond' : 'yes') : 'cond',
      max: ijOpts.length ? ijOpts[0].amount : 0,
      points: [L('Eligible assets: land, buildings and installations, machinery and equipment, vehicles, listed shares; owned, free of legal / contractual / judicial restrictions, transferable, insured until transfer; joint ownership only if the whole asset is transferred.', 'دارایی قابل قبول: زمین، ساختمان و تأسیسات، ماشین‌آلات و تجهیزات، وسایل حمل‌ونقل، سهام بورسی/فرابورسی؛ متعلق به بانی، بدون محدودیت قانونی/قراردادی/قضایی، قابل انتقال و بیمه تا زمان انتقال؛ دارایی مشاع فقط با واگذاری کل دارایی.'),
        L('Asset base ' + F(ijCap) + ' (' + D.unit + ')' + (ijBook ? ' — book value of fixed assets as a placeholder: replace with the official expert appraisal' : '') + '; minimum 50 bn rials (' + F(ijMin) + ' in your unit).', 'پایهٔ دارایی ' + F(ijCap) + (ijBook ? ' — ارزش دفتری دارایی ثابت به‌صورت موقت: با ارزیابی کارشناس رسمی جایگزین کنید' : '') + '؛ حداقل ۵۰ میلیارد ریال (' + F(ijMin) + ' به واحد شما).'),
        L('Tenor ≤ remaining economic life of the asset; contract types: lease-to-own, or lease with an option to sell at a set price.', 'سررسید ≤ عمر اقتصادی باقی‌ماندهٔ دارایی؛ نوع قرارداد: اجاره به شرط تملیک یا اجاره با اختیار فروش به قیمت معین.'),
        L('Gain on selling the asset to the SPV is tax-exempt and the transfer bears no tax or duty; depreciation of the step-up on buy-back is not tax-deductible.', 'درآمد فروش دارایی به نهاد واسط معاف از مالیات است و نقل‌وانتقال آن مالیات و عوارض ندارد؛ استهلاک ناشی از افزایش ارزش در بازخرید، هزینهٔ قابل‌قبول مالیاتی نیست.'),
        L('Underwriter is required when the asset cannot be split into units.', 'اگر دارایی قابل تفکیک به واحدهای معین نباشد، متعهد پذیره‌نویسی الزامی است.')],
      cite: '[IJ] 10, 10 t2, t4, 12, 16, 22; [DV] 11, 12' });
    // Murabaha
    var muA = (X.muAssets || []).filter(function (a) { return num(a.value) > 0; });
    var muRows = muA.length ? muA : (X.useCogsMaterials && D.cogs[l] > 0 ? [{ kind: 'materials', value: D.cogs[l] * num(X.materials) * Math.min(1, num(X.months) / 12), related: 'no', est: true }] : []);
    var muOk = muRows.filter(function (a) { return a.related !== 'yes'; }), muCap = muOk.reduce(function (a, r) { return a + num(r.value); }, 0), muMin = 10e9 / f;
    var muOpts = bestRoute(muCap, 'murabaha'), muEst = muRows.some(function (r) { return r.est; });
    inst.push({ key: 'murabaha', name: L('Murabaha sukuk (purchase of goods or assets)', 'اوراق مرابحه (تأمین دارایی)'), assetCap: muCap, opts: muOpts,
      status: hard.length ? 'no' : muCap < muMin ? 'no' : muOpts.length ? (softFail.length || muEst ? 'cond' : 'yes') : 'cond', max: muOpts.length ? muOpts[0].amount : 0,
      points: [L('Assets: materials and goods, machinery and equipment, land, buildings, vehicles, software and databases, shares; services that bring the asset into use count.', 'دارایی: مواد و کالا، ماشین‌آلات و تجهیزات، زمین، ساختمان، وسایل حمل‌ونقل، نرم‌افزار و بانک اطلاعاتی، سهام؛ خدمات لازم برای رساندن دارایی به وضعیت بهره‌برداری نیز پذیرفته است.'),
        L('Purchase base ' + F(muCap) + (muEst ? ' — estimated as ' + F(num(X.materials) * 100) + '% of cost of sales for ' + num(X.months) + ' months: replace with pro-forma invoices' : '') + '; minimum 10 bn rials (' + F(muMin) + ' in your unit).', 'پایهٔ خرید ' + F(muCap) + (muEst ? ' — برآورد ' + F(num(X.materials) * 100) + '٪ بهای تمام‌شده برای ' + num(X.months) + ' ماه: با پیش‌فاکتورها جایگزین کنید' : '') + '؛ حداقل ۱۰ میلیارد ریال (' + F(muMin) + ' به واحد شما).'),
        L('Originator and seller must have no common ownership; goods and services valued per the originator’s usual practice and confirmed by the auditor; fixed assets by a 3-member panel of official experts.', 'بانی و فروشنده نباید اتحاد مالکیتی داشته باشند؛ ارزش مواد، کالا و خدمات بر اساس رویهٔ متداول بانی با تأیید حسابرس؛ دارایی ثابت با هیئت ۳ نفرهٔ کارشناسان رسمی.'),
        L('Auditor confirms the purchase of the goods of any previous murabaha before a new approval.', 'پیش از موافقت جدید، تأییدیهٔ حسابرس دربارهٔ خرید کالای اوراق مرابحهٔ قبلی لازم است.')],
      cite: '[MU] 4, 10, 10 t3, t5; [PM] stage 2' });
    // Small and short-term murabaha
    var strongGuar = X.guarantor !== 'none' && X.guarantor !== 'invest' ? X.guarantorControlled !== 'yes' : false, smLim = X.draft1405 === 'yes' && strongGuar ? 5000e9 : 2000e9;
    var smCapR = Math.max(0, smLim - num(X.smallOutstanding) * f), smCap = smCapR / f;
    var smGuar = (X.guarantor === 'bank') || (X.knowledge === 'yes') || rated;
    var smOk = !hard.length && muCap >= muMin && num(X.tenorMonths) <= 18;
    inst.push({ key: 'smallMurabaha', name: L('Small and short-term murabaha (public or private offering)', 'اوراق مرابحهٔ کوچک و کوتاه‌مدت (عرضهٔ عمومی یا خصوصی)'), assetCap: Math.min(muCap, smCap), opts: [],
      status: !smOk ? (!hard.length && muCap >= muMin ? 'cond' : 'no') : smGuar ? (softFail.length && !bankGuar ? 'cond' : 'yes') : 'cond', max: !hard.length && muCap >= muMin ? Math.min(muCap, smCap) : 0,
      points: [L('Outstanding small murabaha of one originator ≤ ' + F(smLim / 1e9) + ' bn rials' + (smLim > 2000e9 ? ' (draft 1405 amendment, with a qualifying guarantor; not yet in force)' : '') + ' (' + F(smLim / f) + ' in your unit; room now ' + F(smCap) + '); tenor ≤ 18 months (you entered ' + num(X.tenorMonths) + '). A new one only after the previous is settled.', 'مانده اوراق مرابحهٔ کوچک هر بانی ≤ ' + F(smLim / 1e9) + ' میلیارد ریال' + (smLim > 2000e9 ? ' (پیش‌نویس اصلاحیهٔ ۱۴۰۵ با ضامن واجد شرایط؛ هنوز لازم‌الاجرا نیست)' : '') + ' (' + F(smLim / f) + ' به واحد شما؛ ظرفیت فعلی ' + F(smCap) + ')؛ سررسید ≤ ۱۸ ماه (ورودی شما ' + num(X.tenorMonths) + '). انتشار جدید فقط پس از تسویهٔ قبلی.'),
        L('Guarantee: bank payment guarantee, or (knowledge-based firms) a research and technology fund guarantee, or the rating route with a single pledged share. In a private offering with all buyers’ consent no guarantee is needed (funds may not buy).', 'تضمین: ضمانت‌نامهٔ تعهد پرداخت بانکی، یا (برای دانش‌بنیان) ضمانت صندوق پژوهش و فناوری، یا مسیر رتبه با توثیق یک سهم. در عرضهٔ خصوصی با موافقت همهٔ خریداران تضمین لازم نیست (صندوق‌ها مجاز به خرید نیستند).'),
        L('Underwriter and market maker optional; symbol labelled “small and short-term”; asset purchase within half the life (under 1 year) or up to 6 months before maturity, confirmed by the auditor.', 'متعهد پذیره‌نویس و بازارگردان اختیاری؛ نماد با عبارت «اوراق کوچک و کوتاه‌مدت»؛ خرید دارایی ظرف نیمی از عمر (کمتر از یک سال) یا تا ۶ ماه پیش از سررسید با تأیید حسابرس.'),
        L('Private offering: CAMC review ≤ 15 working days, deficiencies ≤ 20, committee report ≤ 15, contracts ≤ 10 after approval, offering window one month.', 'عرضهٔ خصوصی: بررسی شرکت مدیریت دارایی مرکزی ≤ ۱۵ روز کاری، رفع نقص ≤ ۲۰، گزارش کمیته ≤ ۱۵، قراردادها ≤ ۱۰ روز پس از تأیید، مهلت عرضه یک ماه.')],
      cite: '[MU] 39 and notes 1-4; [PS] stages 1-5' + (smLim > 2000e9 ? '; [D5]' : '') });
    // other sukuk from the handbook (no instruction text supplied here)
    [['istisna', L('Istisna’ sukuk (manufacturing / construction order)', 'اوراق استصناع (سفارش ساخت)'), L('Funds building an asset that becomes the holders’; fits projects with a feasibility study (parallel istisna’ via a contractor).', 'تجمیع وجوه برای ساخت کالا/پروژه‌ای که در تملک دارندگان است؛ مناسب طرح دارای توجیه اقتصادی (استصناع موازی با پیمانکار).')],
      ['manfaa', L('Manfa’a sukuk (future services)', 'اوراق منفعت (خدمات آینده)'), L('Holders own defined future services of a durable asset (hotel nights, flight hours, tuition); for service companies.', 'دارندگان مالک مقدار معین خدمات یا منافع آیندهٔ یک دارایی بادوام‌اند (اقامت هتل، ساعت پرواز، خدمات آموزشی)؛ برای شرکت‌های خدماتی.')],
      ['debtPurchase', L('Debt-purchase sukuk (receivables)', 'اوراق خرید دین (مطالبات)'), L('SPV buys term rial receivables arising from instalment sales, lease-to-own or ju’ala (not salaf); the originator collects and passes the instalments.', 'نهاد واسط مطالبات ریالی مدت‌دار ناشی از فروش اقساطی، اجاره به شرط تملیک یا جعاله (به‌جز سلف) را می‌خرد؛ بانی عامل وصول است.')],
      ['wakala', L('Wakala sukuk', 'اوراق وکالت'), L('The originator manages a defined investment portfolio as agent; suits growing working capital or improving the balance sheet.', 'بانی به‌عنوان وکیل، سبد سرمایه‌گذاری مشخصی را مدیریت می‌کند؛ مناسب افزایش سرمایه در گردش یا بهبود ترازنامه.')],
      ['salaf', L('Salaf (forward sale of a defined product)', 'اوراق سلف (پیش‌فروش کالای معین)'), L('Investors pre-buy a defined product of the originator.', 'سرمایه‌گذاران کالای معین بانی را پیش‌خرید می‌کنند.')],
      ['musharaka', L('Musharaka / mudaraba sukuk (expected return)', 'اوراق مشارکت / مضاربه (سود انتظاری)'), L('Holders share the result of a real project or trading activity; price changes of the asset fall on them.', 'دارندگان در نتیجهٔ طرح واقعی یا فعالیت بازرگانی شریک‌اند؛ تغییر ارزش دارایی متوجه آنان است.')]].forEach(function (o) {
      inst.push({ key: o[0], name: o[1], assetCap: NaN, opts: [], status: 'info', max: NaN, points: [o[2], L('The issuance instruction for this sukuk is not among the texts supplied; the originator tests above usually apply — check its own instruction on cmr.seo.ir.', 'دستورالعمل انتشار این اوراق در متون ارائه‌شده نیست؛ معمولاً همان شرایط بانی اعمال می‌شود — دستورالعمل خاص آن را در cmr.seo.ir کنترل کنید.')], cite: '[HB]' });
    });
    var ie = D.ie ? D.ie[l] : 0, ebitda = D.ebitda ? D.ebitda[l] : NaN;
    inst.forEach(function (i) { if (isFinite(i.max) && i.max > 0) { i.annualProfit = i.max * coupon; i.coverAfter = ebitda / (ie + i.annualProfit); } });
    var best = inst.filter(function (i) { return i.status === 'yes' || i.status === 'cond'; }).sort(function (a, b) { return (b.status === 'yes') - (a.status === 'yes') || b.max - a.max; })[0] || null;
    return { ebitda: ebitda, ie: ie, coupon: coupon, checks: checks, hard: hard, softFail: softFail, routes: routes, inst: inst, best: best, TA: TA, TL: TL, ratio: ratio, cfo2: cfo2, factor: f, unit: D.unit, year: D.years[l], bankGuar: bankGuar };
  }

  /* process and documents: [PM] stages 1-5 (public murabaha), [IJ] 20 */
  var PROCESS = [
    { step: L('Mandate an offering adviser; obtain acceptance letters (guarantor, selling agent, underwriter, market maker)', 'قرارداد مشاور عرضه؛ اخذ قبولی سمت ارکان (ضامن، عامل فروش، متعهد پذیره‌نویسی، بازارگردان)'), time: L('2–6 weeks', '۲ تا ۶ هفته'), cite: '[PM] 1' },
    { step: L('File for SEO in-principle approval with the registration statement and the auditor’s report on it', 'درخواست موافقت اصولی سازمان با بیانیهٔ ثبت و اظهارنظر حسابرس'), time: L('SEO answers within 30 days of a complete file', 'پاسخ سازمان ظرف ۳۰ روز پس از تکمیل مدارک'), cite: '[PM] 2' },
    { step: L('CAMC assigns the SPV; sign agency, selling, underwriting, market-making and guarantee / pledge contracts; CSDI confirmation', 'تخصیص نهاد واسط توسط شرکت مدیریت دارایی مرکزی؛ امضای قراردادهای وکالت، عاملیت فروش، تعهد پذیره‌نویسی، بازارگردانی و ضمانت / توثیق؛ تأییدیهٔ سپرده‌گذاری مرکزی'), time: L('2–4 weeks', '۲ تا ۴ هفته'), cite: '[PM] 3' },
    { step: L('Apply for the issue permit: registration form, subscription notice, signed contracts, fee receipt, land-registry confirmation of no restriction', 'درخواست مجوز انتشار: فرم ثبت، اعلامیهٔ پذیره‌نویسی، قراردادهای منعقده، فیش کارمزد ثبت، تأییدیهٔ ثبت اسناد بر نبود محدودیت'), time: L('1–3 weeks', '۱ تا ۳ هفته'), cite: '[PM] 4' },
    { step: L('Offer through the selling agent; underwriter buys the rest; report results within 15 days; SEO releases funds (or refunds within 15 days)', 'عرضه از طریق عامل فروش؛ خرید باقی‌مانده توسط متعهد پذیره‌نویسی؛ گزارش نتایج ظرف ۱۵ روز؛ آزادسازی وجوه (یا استرداد ظرف ۱۵ روز)'), time: L('1–3 weeks', '۱ تا ۳ هفته'), cite: '[PM] 5' }];
  var DOCS = [
    L('Audited statements of the last two years (last year by an SEO-trusted auditor) and the board report to the AGM', 'صورت‌های مالی حسابرسی‌شدهٔ دو سال اخیر (سال آخر توسط حسابرس معتمد) و گزارش هیئت‌مدیره به مجمع'),
    L('Registration statement with the auditor’s opinion on it, on compliance, on the asset, on no common ownership with the seller (murabaha) and on the guarantor not being controlled', 'بیانیهٔ ثبت با اظهارنظر حسابرس دربارهٔ آن، رعایت مقررات، شرایط دارایی، عدم اتحاد مالکیتی با فروشنده (مرابحه) و عدم کنترل ضامن'),
    L('Resolution of the competent body authorising the financing, naming the asset and terms', 'مصوبهٔ رکن ذی‌صلاح بانی برای تأمین مالی با مشخصات دارایی و شرایط اوراق'),
    L('Latest registered articles; official gazette notice of the latest board', 'آخرین اساسنامهٔ ثبت‌شده؛ آگهی آخرین تغییرات هیئت‌مدیره در روزنامهٔ رسمی'),
    L('Official experts’ report on the asset’s value and economic life (3-member panel for murabaha fixed assets); ownership deeds; pro-forma invoices for goods', 'گزارش کارشناسان رسمی دربارهٔ ارزش و عمر اقتصادی دارایی (هیئت ۳ نفره در مرابحه)؛ اسناد مالکیت؛ پیش‌فاکتور کالا'),
    L('Guarantee / rating report / pledge undertaking; acceptance letters of all parties', 'ضمانت‌نامه / گزارش رتبه‌بندی / تعهد توثیق؛ قبولی سمت همهٔ ارکان'),
    L('Land-registry or competent-authority confirmation that the asset can be transferred', 'تأییدیهٔ ثبت اسناد یا مرجع ذی‌صلاح بر قابلیت انتقال دارایی'),
    L('Auditor’s confirmation that goods of the previous murabaha were bought', 'تأییدیهٔ حسابرس دربارهٔ خرید کالای اوراق مرابحهٔ قبلی')];
  var SOURCES = [
    ['[IJ]', 'Ijara sukuk instruction (Supreme Council 1390/08/23; valid version 1402/05/16 on cmr.seo.ir, checked Nov 2026)', 'دستورالعمل انتشار اوراق اجاره (شورای عالی بورس ۱۳۹۰/۰۸/۲۳ و اصلاحات)'],
    ['[MU]', 'Murabaha sukuk instruction (SEO board 1390/09/26; valid version 1403/05/28 incl. part 9, checked Nov 2026; interpretive resolution 1401/12/20)', 'دستورالعمل انتشار اوراق مرابحه (هیئت‌مدیرهٔ سازمان ۱۳۹۰/۰۹/۲۶ و اصلاحات؛ بخش ۹ کوچک و کوتاه‌مدت)'],
    ['[CR]', 'Debt securities using a credit rating (SEO board 1402/05/16; valid version 1403/01/27 adds only a note to art. 9; checked Nov 2026)', 'دستورالعمل انتشار اوراق بدهی با استفاده از رتبهٔ اعتباری (هیئت‌مدیرهٔ سازمان ۱۴۰۲/۰۵/۱۶)'],
    ['[PM]', 'Murabaha issuance procedure (1402/11/15)', 'رویهٔ اجرایی انتشار اوراق مرابحه (۱۴۰۲/۱۱/۱۵)'],
    ['[PS]', 'Private offering of small short-term murabaha, detailed procedure (CAMC, 1403/10/04)', 'رویهٔ تفصیلی عرضهٔ خصوصی اوراق مرابحهٔ کوچک و کوتاه‌مدت (ویرایش ۱۴۰۳/۱۰/۰۴)'],
    ['[DV]', 'Act on Development of New Financial Instruments and Institutions (1388)', 'قانون توسعهٔ ابزارها و نهادهای مالی جدید (۱۳۸۸)'],
    ['[HB]', 'CAMC handbook “Sukuk, Islamic financing instrument”', 'کتابچهٔ «صکوک، ابزار تأمین مالی اسلامی» شرکت مدیریت دارایی مرکزی'],
    ['[D5]', 'Draft amendment of murabaha part 9 (“small and medium-term”), SEO consultation closed 1405/04/24 — not yet in the valid text', 'پیش‌نویس اصلاح بخش ۹ دستورالعمل مرابحه («کوچک و میان‌مدت»)، فراخوان سازمان تا ۱۴۰۵/۰۴/۲۴ — هنوز در متن معتبر نیامده'],
    ['[PR]', 'SEO approval practice: all outstanding sukuk ≤ registered capital — not a published resolution, but applied in practice (practitioner input, Nov 2026)', 'رویهٔ اجرایی سازمان در صدور مجوز: کل اوراق در جریان ≤ سرمایهٔ ثبتی — مصوبهٔ منتشرشده ندارد اما اجرا می‌شود (اطلاع کارشناسی، آبان ۱۴۰۵)'],
    ['[OLD]', 'Repealed earnings-based caps for unguaranteed issues: 1398 (AAA: ≤ 35% of 3-year average net income, CAMC news 1398/05/13) and the later BBB rule (≤ 60% of 2-year average net income; 80% ijara, 100% ijara of shares, Boursepress) — replaced by [CR]; used only as an optional benchmark', 'سقف‌های مبتنی بر سود (منسوخ) برای انتشار بدون ضامن: ۱۳۹۸ (AAA: ≤ ۳۵٪ میانگین سود خالص سه سال، خبر شرکت مدیریت دارایی مرکزی ۱۳۹۸/۰۵/۱۳) و مصوبهٔ بعدی BBB (≤ ۶۰٪ میانگین سود خالص دو سال؛ اجاره ۸۰٪ و اجارهٔ سهام ۱۰۰٪، بورس‌پرس) — جایگزین‌شده با [CR]؛ فقط به‌عنوان معیار اختیاری']];

  /* ---------- financial capacity at a given rate (not in the SEO texts: what guarantors, rating agencies and
     prudence look at). Each test gives the largest new principal X that keeps the metric within your limit,
     with the annual cost of the new sukuk = rate × X (rate: coupon, your own, or the true cost from the ytm
     method). Figures: last imported year; CFO = average of the last two years. ---------- */
  function finDefaults() {
    return { v: 2, payout: 0, minProfitCover: 1, minEbitCover: 1.5, minEbitdaCover: 2, maxNdEbitda: 3.5, pbtKeep: 0, niKeep: 0, maxDE: 1.5, minDscr: 1.2, capMult: 1, capital: 0, sukukOut: 0, taxRate: 0.25,
      coreOnly: true, maxNonOp: 0.2, niAvgMult: 0, niAvgYears: 2, cfoBasis: 'avg2', growth: 0, rollover: -1, ncYears: 3, cashUse: 0, sukukPrin: 'repay', fullService: true, iRate: 0 };
  }
  function nm(s) { return String(s || '').replace(/‌/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim(); }
  // interest-bearing borrowings split current / non-current from the balance-sheet lines (section headers), else all treated as current
  function borrowings(D) {
    var l = D.n - 1, cur = 0, nc = 0, suk = 0, found = false;
    (D.lines && D.lines.BS || []).forEach(function (r) {
      var lb = nm(r.label), g = nm(r.grp);
      if (!/تسهیلات|وام|اوراق (مرابحه|اجاره|منفعت|مشارکت|سلف|بدهی)|loan|borrowing|bond|sukuk/i.test(lb) || /پیش ?پرداخت|پرداختنی سود|سود .*پرداختنی|نسبت|ratio|جمع|total|interest payable|prepaid/i.test(lb)) return;
      var v = r.vals[l] || 0; if (!v) return; found = true;
      var isNC = /غیر ?جاری|بلند ?مدت|non.current|long.term/i.test(g + ' ' + lb), isC = !isNC && /جاری|کوتاه ?مدت|current|short.term/i.test(g + ' ' + lb);
      if (isNC) nc += v; else cur += v;
      if (/اوراق|bond|sukuk/i.test(lb)) suk += v;
    });
    if (!found) { cur = D.debt[l]; nc = 0; }
    return { current: cur, nonCurrent: nc, total: cur + nc, sukuk: suk, fromLines: found };
  }
  // cash-flow lines: new borrowing received and repaid last year (for the roll-over habit)
  function cfLine(D, re) { var l = D.n - 1, o = 0; (D.lines && D.lines.CF || []).forEach(function (r) { if (re.test(nm(r.label))) o += Math.abs(r.vals[l] || 0); }); return o; }
  function finCapacity(D, F, rate, tenorY, amort) {
    F = Object.assign(finDefaults(), F || {}); var l = D.n - 1, r = Math.max(1e-6, num(rate)), T = Math.max(1, Math.round(num(tenorY) || 1)), t = num(F.taxRate);
    var ebit = D.ebit[l], ebitda = D.ebitda[l], ie = Math.abs(D.ie[l] || 0), pbt = D.ebt[l], ni = D.ni[l], eq = D.equity[l], debt = D.debt[l], cash = D.cash[l], nd = debt + (D.debtLike ? D.debtLike[l] : 0) - cash;
    var nonOp = D.nonOp ? D.nonOp[l] : 0, nonOpShare = pbt > 0 ? nonOp / pbt : (nonOp > 0 ? Infinity : 0);
    var nonOp3 = D.nonOp ? D.nonOp.reduce(function (a, v) { return a + v; }, 0) : 0, pbt3 = D.ebt.reduce(function (a, v) { return a + v; }, 0), nonOpShare3 = pbt3 > 0 ? nonOp3 / pbt3 : NaN;
    var pbtCore = pbt - Math.max(0, nonOp), niCore = ni - Math.max(0, nonOp) * (1 - t);
    var pbtUse = F.coreOnly ? pbtCore : pbt, niUse = F.coreOnly ? niCore : ni;
    var cfoL = D.cfo ? D.cfo[l] : NaN, cfoA = D.cfo ? (D.n >= 2 ? (D.cfo[l] + D.cfo[l - 1]) / 2 : D.cfo[l]) : NaN, cfoM = D.cfo ? (D.n >= 2 ? Math.min(D.cfo[l], D.cfo[l - 1]) : D.cfo[l]) : NaN;
    var cfo0 = F.cfoBasis === 'last' ? cfoL : F.cfoBasis === 'min2' ? cfoM : cfoA;
    var capReg = num(F.capital) > 0 ? num(F.capital) : D.capital ? D.capital[l] : NaN, ret = D.retained ? D.retained[l] : NaN;
    // existing borrowings, their cost and repayment profile
    var B = borrowings(D), avgDebt = D.n >= 2 ? (D.debt[l] + D.debt[l - 1]) / 2 : D.debt[l], iR = num(F.iRate) > 0 ? num(F.iRate) : avgDebt > 0 ? ie / avgDebt : 0;
    var got = cfLine(D, /دریافت.*تسهیلات|proceeds from (borrowing|loan)/i), paid = cfLine(D, /پرداخت.*بابت (اصل )?تسهیلات|بازپرداخت.*تسهیلات|repayment of (borrowing|loan)/i);
    var rollHist = paid > 0 ? got / paid : NaN, roll = num(F.rollover) >= 0 ? Math.min(1, num(F.rollover)) : isFinite(rollHist) ? Math.min(1, rollHist) : 0;
    var ncY = Math.max(1, Math.round(num(F.ncYears) || 1));
    function schedule(X) {
      var rows = [], outE = B.total, cum = cash * num(F.cashUse), outS = X, minCov = Infinity, minCum = Infinity;
      for (var y = 1; y <= T + 0; y++) {
        var due = (y === 1 ? B.current : 0) + (y >= 2 && y <= ncY + 1 ? B.nonCurrent / ncY : 0) + (y >= 2 ? (B.current * roll) * 0 : 0);
        var intE = iR * outE, cfo = cfo0 * Math.pow(1 + num(F.growth), y - 1), coup = r * outS;
        var prinS = amort === 'equal' ? X / T : (y === T && F.sukukPrin === 'repay' ? X : 0);
        var payE = due * (1 - roll); outE = Math.max(0, outE - payE);
        var cover = (intE + coup) > 0 ? cfo / (intE + coup) : Infinity;
        cum += cfo - intE - coup - payE - prinS; if (amort === 'equal') outS -= X / T;
        rows.push({ y: y, cfo: cfo, intE: intE, payE: payE, coup: coup, prinS: prinS, net: cfo - intE - coup - payE - prinS, cum: cum, cover: cover, outE: outE });
        minCov = Math.min(minCov, cover); minCum = Math.min(minCum, cum);
      }
      return { rows: rows, minCov: minCov, minCum: minCum };
    }
    var S0 = schedule(0);
    // largest X keeping (a) CFO / (interest + coupons) ≥ limit every year, (b) cumulative cash ≥ 0 (full service)
    function solve(ok) { if (!ok(0)) return 0; var lo = 0, hi = Math.max(1, (Math.abs(cfo0) + B.total + Math.abs(ebitda)) * 20); if (ok(hi)) return hi; for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; } return lo; }
    var xCov = isFinite(cfo0) ? solve(function (X) { return schedule(X).minCov >= num(F.minDscr); }) : NaN;
    var xFull = isFinite(cfo0) ? solve(function (X) { return schedule(X).minCum >= 0; }) : NaN;
    var lim = function (x) { return isFinite(x) ? Math.max(0, x) : NaN; };
    var niYears = Math.min(D.n, Math.max(1, Math.round(num(F.niAvgYears) || 2))), niAvg = D.ni.slice(-niYears).reduce(function (a, v) { return a + v; }, 0) / niYears;
    // statements that were not imported: their tests are skipped (shown as "no data"), never read as zero
    var hasBS = !!((D.taFile && D.taFile[l] > 0) || D.ta[l] > 0 || eq !== 0 || debt !== 0 || cash !== 0), hasCF = isFinite(cfo0);
    var tests = [
      { key: 'ebitCover', on: num(F.minEbitCover) > 0, label: L('EBIT / finance cost after the issue', 'سود عملیاتی / هزینهٔ مالی پس از انتشار'), now: ie ? ebit / ie : Infinity, limit: '≥ ' + num(F.minEbitCover) + 'x', max: lim((ebit / num(F.minEbitCover) - ie) / r), f: 'X ≤ (EBIT ÷ limit − finance cost) ÷ rate' },
      { key: 'ebitdaCover', on: num(F.minEbitdaCover) > 0, label: L('EBITDA / finance cost after the issue', 'EBITDA / هزینهٔ مالی پس از انتشار'), now: ie ? ebitda / ie : Infinity, limit: '≥ ' + num(F.minEbitdaCover) + 'x', max: lim((ebitda / num(F.minEbitdaCover) - ie) / r), f: 'X ≤ (EBITDA ÷ limit − finance cost) ÷ rate' },
      { key: 'ndEbitda', on: num(F.maxNdEbitda) > 0 && hasBS, need: hasBS ? null : 'BS', label: L('Net debt / EBITDA after the issue (proceeds spent)', 'بدهی خالص / EBITDA پس از انتشار (با مصرف وجوه)'), now: ebitda > 0 ? nd / ebitda : Infinity, limit: '≤ ' + num(F.maxNdEbitda) + 'x', max: ebitda > 0 ? lim(num(F.maxNdEbitda) * ebitda - nd) : 0, f: 'X ≤ limit × EBITDA − net debt' },
      { key: 'pbt', on: true, label: L('Profit before tax after the new finance cost' + (F.coreOnly ? ' (operating: excl. non-operating income)' : ''), 'سود قبل از مالیات پس از هزینهٔ مالی جدید' + (F.coreOnly ? ' (عملیاتی: بدون درآمد غیرعملیاتی)' : '')), now: pbtUse, limit: num(F.pbtKeep) > 0 ? '≥ ' + Math.round(num(F.pbtKeep) * 100) + '% of today' : '≥ 0', max: pbtUse > 0 ? lim(pbtUse * (1 - num(F.pbtKeep)) / r) : 0, f: 'X ≤ PBT × (1 − share kept) ÷ rate', money: true },
      { key: 'ni', on: true, label: L('Net income after the new finance cost' + (F.coreOnly ? ' (operating)' : ''), 'سود خالص پس از هزینهٔ مالی جدید' + (F.coreOnly ? ' (عملیاتی)' : '')), now: niUse, limit: num(F.niKeep) > 0 ? '≥ ' + Math.round(num(F.niKeep)).toLocaleString('en-US') : '≥ 0', max: niUse > num(F.niKeep) ? lim((niUse - num(F.niKeep)) / (r * (1 - t))) : 0, f: 'X ≤ (NI − NI to keep) ÷ (rate × (1 − tax))', money: true },
      { key: 'de', on: num(F.maxDE) > 0 && hasBS, need: hasBS ? null : 'BS', label: L('Interest-bearing debt / equity after the issue', 'بدهی بهره‌دار / حقوق مالکانه پس از انتشار'), now: eq > 0 ? debt / eq : Infinity, limit: '≤ ' + num(F.maxDE) + 'x', max: eq > 0 ? lim(num(F.maxDE) * eq - debt) : 0, f: 'X ≤ limit × equity − debt' },
      { key: 'dscr', on: num(F.minDscr) > 0 && isFinite(cfo0), need: hasCF ? null : 'CF', label: L('Operating cash flow / (existing interest + coupons), every year of the tenor', 'جریان نقد عملیاتی / (بهرهٔ تسهیلات موجود + سود اوراق)، در همهٔ سال‌های عمر اوراق'), now: S0.minCov, limit: '≥ ' + num(F.minDscr) + 'x', max: lim(xCov), f: 'yearly schedule: max X with CFO_t ≥ limit × (interest_t + rate × X) for all t' },
      { key: 'service', on: !!F.fullService && isFinite(cfo0), need: hasCF ? null : 'CF', label: L('Cash never runs out: CFO covers interest, coupons, the non-rolled part of facility repayments and the sukuk principal' + (F.sukukPrin === 'repay' ? '' : ' (re-issued at maturity)'), 'کمبود نقد پیش نیاید: جریان نقد عملیاتی هزینهٔ مالی، سود اوراق، بخش تمدیدنشدهٔ اقساط تسهیلات و اصل اوراق' + (F.sukukPrin === 'repay' ? '' : ' (بازانتشار در سررسید)') + ' را پوشش دهد'), now: S0.minCum, limit: '≥ 0', max: lim(xFull), f: 'yearly schedule: max X with cumulative cash ≥ 0 in every year', money: true },
      { key: 'niAvg', on: num(F.niAvgMult) > 0, label: L('Unguaranteed amount ≤ ' + Math.round(num(F.niAvgMult) * 100) + '% of average net income, last ' + niYears + ' years (repealed SEO rule, benchmark only)', 'مبلغ بدون ضامن ≤ ' + Math.round(num(F.niAvgMult) * 100) + '٪ میانگین سود خالص ' + niYears + ' سال اخیر (ضابطهٔ منسوخ سازمان؛ فقط معیار)'), now: niAvg, limit: '≤ ' + Math.round(num(F.niAvgMult) * 100) + '% × avg NI', max: lim(num(F.niAvgMult) * niAvg - Math.max(num(F.sukukOut), B.sukuk)), f: 'X ≤ share × average NI − sukuk outstanding', money: true },
      { key: 'capital', on: num(F.capMult) > 0 && isFinite(capReg) && capReg > 0, need: isFinite(capReg) && capReg > 0 ? null : 'BS', label: L('All outstanding sukuk incl. this issue ≤ ' + num(F.capMult) + '× registered capital (unwritten SEO practice, enforced in approvals; no published resolution)', 'کل اوراق در جریان با این انتشار ≤ ' + num(F.capMult) + ' برابر سرمایهٔ ثبتی (رویهٔ اجرایی سازمان؛ مصوبهٔ منتشرشده ندارد اما در صدور مجوز اعمال می‌شود)'), now: capReg, limit: '≤ ' + num(F.capMult) + '× capital', max: lim(num(F.capMult) * capReg - Math.max(num(F.sukukOut), B.sukuk)), f: 'X ≤ multiple × capital − sukuk outstanding (' + Math.round(Math.max(num(F.sukukOut), B.sukuk)).toLocaleString('en-US') + ')', money: true },
      { key: 'nonOp', on: num(F.maxNonOp) > 0, gate: true, label: L('Non-operating income / profit before tax (last year; 3-year ' + (isFinite(nonOpShare3) ? (nonOpShare3 * 100).toFixed(0) + '%' : '–') + ')', 'درآمد غیرعملیاتی / سود قبل از مالیات (سال آخر؛ سه‌ساله ' + (isFinite(nonOpShare3) ? (nonOpShare3 * 100).toFixed(0) + '٪' : '–') + ')'), now: nonOpShare, pct: true, limit: '≤ ' + Math.round(num(F.maxNonOp) * 100) + '%', max: nonOpShare <= num(F.maxNonOp) ? Infinity : 0, f: 'quality gate: above the limit the earnings are not a sound base for debt' }];
    var art141 = isFinite(capReg) && capReg > 0 && isFinite(ret) && ret < 0 && -ret >= 0.5 * capReg;
    if (art141) tests.push({ key: 'art141', on: true, label: L('Commercial Code art. 141: accumulated losses ≥ half of capital', 'مادهٔ ۱۴۱ اصلاحیهٔ قانون تجارت: زیان انباشته ≥ نصف سرمایه'), now: -ret / capReg, pct: true, limit: '< 50%', max: 0, f: 'resolve first (capital increase / reduction)' });
    var on = tests.filter(function (x) { return x.on; }), maxX = on.length ? Math.min.apply(null, on.map(function (x) { return isFinite(x.max) ? x.max : Infinity; })) : NaN;
    var binding = on.filter(function (x) { return x.max === maxX; })[0] || null;
    var Sx = schedule(isFinite(maxX) ? maxX : 0);
    return { tests: tests, hasBS: hasBS, hasCF: hasCF, max: maxX, binding: binding, rate: r, ebit: ebit, ebitda: ebitda, ie: ie, pbt: pbt, ni: ni, pbtCore: pbtCore, niCore: niCore, nonOp: nonOp, nonOpShare: nonOpShare, nonOpShare3: nonOpShare3,
      eq: eq, debt: debt, nd: nd, cfo0: cfo0, cfoAvg: cfoA, cap: capReg, art141: art141, B: B, iR: iR, roll: roll, rollHist: rollHist, got: got, paid: paid, sched: Sx.rows, sched0: S0.rows, cashStart: cash * num(F.cashUse), T: T, F: F, year: D.years[l] };
  }
  Hub.sukukRules = { RATINGS: RATINGS, COLL: COLL, IJ_ASSETS: IJ_ASSETS, MU_ASSETS: MU_ASSETS, GUARANTORS: GUARANTORS, debtRatioCap: debtRatioCap, collCoef: collCoef, sample: sample, assess: assess, finDefaults: finDefaults, finCapacity: finCapacity, borrowings: borrowings, rialFactor: rialFactor, PROCESS: PROCESS, DOCS: DOCS, SOURCES: SOURCES, fmtR: fmtR, fmtRfa: fmtRfa };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.sukukRules;
})(typeof window !== 'undefined' ? window : globalThis);
