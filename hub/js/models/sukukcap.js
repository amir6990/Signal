/* =====================================================================
 * SUKUK ISSUANCE CAPACITY — can this company issue sukuk, which kind, through
 * which credit route, and up to how much, under the SEO texts encoded in
 * js/core/sukukrules.js. Statements come from the Company data bar (Excel,
 * PDF or pasted rows); the gates a statement cannot show (audit opinions,
 * rating, guarantor, collateral, assets) are your inputs.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  if (!root.document || !Hub.toolkit) return;
  var U = Hub.util, h = U.h, TK = Hub.toolkit, G = Hub.grid, R = Hub.sukukRules;
  // header cells aligned like their column: first column label, numbers as numbers, listed text columns as text
  function thMap(txt) { txt = txt || []; return function (t, i) { return Hub.util.h('th', { class: i === 0 ? 'lbl' : txt.indexOf(i) >= 0 ? 'txth' : 'num', text: t }); }; }
  function fa() { return Hub.i18n && Hub.i18n.lang() === 'fa'; }
  function tx(o) { return o && typeof o === 'object' && 'en' in o ? (fa() ? o.fa : o.en) : o; }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  var ST = { yes: ['Eligible', 'واجد شرایط', 'fit-rec'], cond: ['Eligible with conditions', 'مشروط', 'fit-cond'], no: ['Not eligible', 'فاقد شرایط', 'fit-no'], info: ['See its own instruction', 'دستورالعمل خاص', 'fit-ok'] };

  function sample() { return { version: 1, tool: 'sukuk-capacity', x: R.sample(), coupon: 0.23, fin: R.finDefaults(), rateMode: 'coupon', rateManual: 0.30, amort: 'bullet', sources: {} }; }
  // rate used to size the issue: your own rate, the coupon, or the true issuer cost from the ytm method (Financing Solutions terms)
  function ytmCost(S) {
    var FI = Hub.tools.financing; if (!FI || !FI.sukukCost) return NaN;
    var st = U.store.get('hub.financing.v1', null), sk = st && st.sk ? st.sk : FI.skDefault();
    var k = FI.sukukCost({ sk: sk, q: { tenor: Math.max(1, Math.round(num(S.x.tenorMonths) / 12)), bankRate: 0.3, need: 1000000 } }, 1000000);
    return k && isFinite(k.all) ? k.all : NaN;
  }
  function rateOf(S) { return S.rateMode === 'coupon' ? num(S.coupon) : S.rateMode === 'ytm' ? ytmCost(S) : num(S.rateManual); }
  function run(S) {
    var rec = Hub.companyData && Hub.companyData.get(), D = rec && Hub.companyData.series(rec);
    if (!D) return { empty: true, checks: [{ level: 'warning', msg: 'No company statements loaded. Use the Company data bar.' }] };
    if (!S.fin || S.fin.v !== 2) { S.fin = Object.assign(R.finDefaults(), S.fin || {}, { v: 2, capMult: 1 }); S.rateMode = 'coupon'; S.coupon = 0.23; S.rateManual = S.rateManual || 0.30; S.amort = S.amort || 'bullet'; }
    var A = R.assess(D, S.x, { coupon: num(S.coupon) }); A.D = D; A.rec = rec;
    var rate = rateOf(S), T = num(S.x.tenorMonths) / 12;
    A.rate = rate; A.F = isFinite(rate) && rate > 0 ? R.finCapacity(D, S.fin, rate, T, S.amort) : null;
    A.regMax = A.best ? A.best.max : 0;
    // capital practice [PR]: applied by the SEO although unpublished, so it limits the regulatory maximum itself
    var capT = A.F && A.F.tests.filter(function (t) { return t.key === 'capital' && t.on; })[0];
    // the capital cap must never drop out silently: no capital found → say so and ask for it
    A.capMissing = !!(A.F && num(S.fin.capMult) > 0 && !capT);
    A.capPractice = capT ? capT.max : NaN; if (capT && isFinite(capT.max)) A.regMax = Math.min(A.regMax, capT.max);
    A.recMax = A.F ? Math.min(A.regMax, A.F.max) : A.regMax;
    // second basis (user rule: compute both): earnings and balance-sheet tests only, without the cash-flow schedule tests
    A.Fe = A.F ? R.finCapacity(D, Object.assign({}, S.fin, { minDscr: 0, fullService: false }), rate, T, S.amort) : null;
    A.recEarn = A.Fe ? Math.min(A.regMax, A.Fe.max) : NaN;
    A.cfBind = !!(A.F && A.F.binding && /^(dscr|service)$/.test(A.F.binding.key));
    // no balance sheet: leverage, equity and capital cannot be tested, so no capacity is stated
    A.noBS = A.F ? !A.F.hasBS : !(D.ta[D.n - 1] > 0); A.noCF = !D.cfo;
    if (A.noBS) A.recMax = NaN;
    /* ---------- recommended capacity: one number, every limit shown ----------
       ceiling = registered capital (SEO practice) − sukuk outstanding;
       the eligible instrument and credit route (asset base, guarantor, rating) can only lower it;
       earnings and leverage tests (EBIT / EBITDA cover, PBT, NI, net debt / EBITDA, D/E) can only lower it;
       debt-service tests on operating cash flow bind only if the company fails the regulatory cash test
       (sum of CFO over two years ≤ 0); with positive CFO they are reported as warnings, not as limits. */
    A.cfoPos = isFinite(A.cfo2) && A.cfo2 > 0;
    var lim = function (key, en, fa, v, applied, note) { return { key: key, label: { en: en, fa: fa }, v: v, applied: applied, note: note || null }; };
    var instRaw = A.best ? A.best.max : 0;
    // instruments above the capital ceiling are cut to it (the table and the best route show the capped amount)
    if (isFinite(A.capPractice)) A.inst.forEach(function (i) { if (isFinite(i.max) && i.max > A.capPractice) { i.maxRaw = i.max; i.max = Math.max(0, A.capPractice); i.points.unshift({ en: 'Cut to the capital ceiling ' + U.fmtNum(i.max) + ' (asset base / route allow ' + U.fmtNum(i.maxRaw) + ').', fa: 'به سقف سرمایه ' + U.fmtNum(i.max) + ' محدود شد (پایهٔ دارایی / مسیر اعتباری ' + U.fmtNum(i.maxRaw) + ' اجازه می‌دهد).' }); } });
    var cfKeys = A.F ? A.F.tests.filter(function (t) { return t.on && /^(dscr|service)$/.test(t.key); }) : [];
    var cfMax = cfKeys.length ? Math.min.apply(null, cfKeys.map(function (t) { return isFinite(t.max) ? t.max : Infinity; })) : Infinity;
    var eTests = A.Fe ? A.Fe.tests.filter(function (t) { return t.on && t.key !== 'capital'; }) : [];
    var eMax = eTests.length ? Math.min.apply(null, eTests.map(function (t) { return isFinite(t.max) ? t.max : Infinity; })) : Infinity;
    var eBind = eTests.filter(function (t) { return t.max === eMax; })[0];
    var lD = D.n - 1; if (S.fin.payout == null) S.fin.payout = 0; if (S.fin.minProfitCover == null) S.fin.minProfitCover = 1;
    A.coreIn = function (r) { return { sales: D.revenue[lD], ebit: D.ebit[lD], ebitda: D.ebitda[lD], finCost: Math.abs(D.ie[lD] || 0), nonOp: D.nonOp ? D.nonOp[lD] : 0, pbt: D.ebt[lD], ni: D.ni[lD],
      debt: D.debt[lD] + (D.debtLike ? D.debtLike[lD] : 0), curDebt: A.F && A.F.B ? A.F.B.current : 0, roll: A.F && isFinite(A.F.roll) ? A.F.roll : 1, rollKnown: !!(A.F && (num(S.fin.rollover) >= 0 || isFinite(A.F.rollHist))), cash: D.cash[lD], equity: D.equity[lD], ta: (D.taFile && D.taFile[lD]) || D.ta[lD],
      capCeil: A.capPractice, routeMax: A.best ? instRaw : 0, routeNote: A.best ? { en: A.best.name.en, fa: A.best.name.fa } : { en: 'no eligible route with the current answers', fa: 'با پاسخ‌های فعلی مسیری واجد شرایط نیست' },
      cfo: A.F && isFinite(A.F.cfo0) ? A.F.cfo0 : null, cfo2: A.cfo2, rate: r, T: T, payout: S.fin.payout, kProfit: S.fin.minProfitCover, kEbit: S.fin.minEbitCover, minEbitda: S.fin.minEbitdaCover,
      maxNd: S.fin.maxNdEbitda, maxDE: S.fin.maxDE, minDscr: S.fin.minDscr, coreOnly: !!S.fin.coreOnly, taxIn: S.fin.taxRate }; };
    A.C = capCore(A.coreIn(rate));
    A.limits = A.C.limits;
    A.recMax = A.noBS ? NaN : A.C.rec; A.recBind = A.C.bind; A.recStrict = A.noBS ? NaN : A.C.strict;
    // second rate basis: the issuer's true all-in cost (ytm method, fees included) from the "Sukuk cost (ytm)" tab
    A.Y = ytCost(S, isFinite(A.recMax) && A.recMax > 0 ? A.recMax : 1000, rate);
    A.Ctrue = A.Y && isFinite(A.Y.all) ? capCore(A.coreIn(A.Y.all)) : null;
    A.IP = isFinite(A.recMax) && isFinite(rate) ? interestPlan(A.recMax, rate, T, S.yt ? S.yt.freq : 4, 'bullet', Math.abs(D.ie[lD] || 0), A.Y && isFinite(A.Y.all) ? A.Y.all : NaN, S.yt ? S.yt.issueDate : '') : null;
    A.sens = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55].concat(isFinite(rate) ? [rate] : []).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; })
      .map(function (r) { var f = R.finCapacity(D, S.fin, r, T, S.amort); var fe = R.finCapacity(D, Object.assign({}, S.fin, { minDscr: 0, fullService: false }), r, T, S.amort); return { rate: r, fin: f.max, binding: f.binding, rec: A.noBS ? NaN : capCore(A.coreIn(r)).rec, recE: A.noBS ? NaN : capCore(A.coreIn(r)).strict }; });
    A.conds = A.checks; var gap = A.noBS ? [{ level: 'critical', msg: 'No balance sheet in the imported data: leverage, equity, capital and the liabilities/assets rule cannot be tested, so no capacity is stated. Import the statement of financial position' + (A.noCF ? ' and the cash flow statement.' : '.') }] : A.noCF ? [{ level: 'warning', msg: 'No cash flow statement in the imported data: the operating cash flow rule and the debt-service tests were skipped. Import the cash flow statement.' }] : [];
    if (A.capMissing) gap.push({ level: 'critical', msg: 'Registered capital not found in the imported data, so the capital cap (all sukuk ≤ capital, enforced by the SEO) is NOT applied. Enter the registered capital in Limits → Registered capital.' });
    A.checks = gap.concat(A.hard.length ? [{ level: 'critical', msg: A.hard.length + ' originator condition(s) not met.' }] : A.softFail.length ? [{ level: 'warning', msg: 'Cash-flow or leverage test fails: needs a CBI-approved bank guarantee (or, for ijara, full collateral).' }] : []);
    return A;
  }
  function stTxt(k) { var s = ST[k]; return fa() ? s[1] : s[0]; }

  /* ---------- Excel: how the recommended capacity is calculated, with live formulas ---------- */
  function calcSheets(b, S, A) {
    var F = fa(), T = function (en, fa_) { return F ? fa_ : en; };
    var m = Object.assign(mDefault(), S.m || {});
    // no manual figures yet but statements are loaded: start from the statements
    if (!(num(m.ta) > 0) && A && !A.empty && A.D) { var D = A.D, l = D.n - 1; m.ta = (D.taFile && D.taFile[l]) || D.ta[l]; m.eq = D.equity[l]; m.tl = m.ta - m.eq; m.cap = D.capital ? D.capital[l] : 0; m.cfo1 = D.cfo ? D.cfo[l] : 0; m.cfo2 = D.cfo && l > 0 ? D.cfo[l - 1] : m.cfo1; m.ebit = D.ebit[l]; m.fc = Math.abs(D.ie[l] || 0); m.rate = isFinite(A.rate) ? A.rate : m.rate; m.months = Math.round(num(S.x.tenorMonths)) || m.months; m.out = num(S.fin.sukukOut); }
    var W = b.sheet(T('Capacity method', 'روش محاسبه ظرفیت'), [2, 58, 20, 70], F ? { rightToLeft: true } : undefined), r = 4, ref = {};
    W.title(T('How the recommended issue capacity is calculated', 'نحوهٔ محاسبهٔ ظرفیت پیشنهادی انتشار اوراق'), T('Blue cells are inputs: change them and every result recalculates. Unit: ', 'سلول‌های آبی ورودی‌اند؛ با تغییر آن‌ها همهٔ نتایج دوباره حساب می‌شود. واحد: ') + ({ million: T('million rials', 'میلیون ریال'), billion: T('billion rials', 'میلیارد ریال'), thousand: T('thousand rials', 'هزار ریال') }[m.unit] || m.unit));
    var inp = function (key, label, v, fmt, note) { W.put(1, r, label); W.put(2, r, v, 'in', fmt || 'money'); if (note) W.put(3, r, note, 'sub'); ref[key] = 'C' + r; r++; };
    var calc = function (key, label, f, fmt, note, kind) { W.put(1, r, label, kind === 'total' ? 'total' : null); W.put(2, r, { f: f }, kind || 'calc', fmt || 'money'); if (note) W.put(3, r, note, 'sub'); ref[key] = 'C' + r; r++; };
    var R = function (k) { return ref[k]; };
    W.sec(r++, T('1. Inputs', '۱. ورودی‌ها'), 3);
    inp('ta', T('Total assets', 'جمع دارایی‌ها'), num(m.ta)); inp('tl', T('Total liabilities', 'جمع بدهی‌ها'), num(m.tl));
    inp('eq', T('Shareholders’ equity', 'حقوق صاحبان سهام'), num(m.eq) || num(m.ta) - num(m.tl)); inp('cap', T('Registered capital', 'سرمایهٔ ثبتی'), num(m.cap));
    inp('out', T('Sukuk outstanding or approved', 'اوراق در جریان یا مصوب'), num(m.out)); inp('mult', T('Capital ceiling multiple', 'ضریب سقف سرمایه'), num(m.capMult) || 1, 'dec');
    inp('cfo1', T('Operating cash flow, last year', 'جریان نقد عملیاتی سال آخر'), num(m.cfo1)); inp('cfo2', T('Operating cash flow, the year before', 'جریان نقد عملیاتی سال قبل'), num(m.cfo2));
    inp('ebit', T('Operating profit (EBIT)', 'سود عملیاتی (EBIT)'), num(m.ebit), 'money', T('negative if an operating loss', 'در صورت زیان، منفی'));
    inp('fc', T('Finance cost of the last reported year (positive)', 'هزینهٔ مالی آخرین سال گزارش‌شده (عدد مثبت)'), Math.abs(num(m.fc)));
    var pbtIn = m.pbt !== null && m.pbt !== undefined && m.pbt !== '' && isFinite(num(m.pbt));
    inp('pbt', T('Profit before tax (optional; blank = EBIT − finance cost)', 'سود قبل از مالیات (اختیاری؛ خالی = سود عملیاتی − هزینهٔ مالی)'), pbtIn ? num(m.pbt) : '', 'money', T('used only in the repayment test (d)', 'فقط در آزمون بازپرداخت (د)'));
    inp('rate', T('Sukuk profit rate (annual)', 'نرخ سود اوراق (سالانه)'), num(m.rate), 'pct2'); inp('months', T('Tenor (months)', 'مدت اوراق (ماه)'), num(m.months), '0');
    inp('freq', T('Coupons per year', 'تعداد کوپن در سال'), 4, '0');
    inp('small', T('Small and short-term issue (1 = yes, 0 = no)', 'اوراق کوچک و کوتاه‌مدت (۱ = بله، ۰ = خیر)'), m.type === 'small' ? 1 : 0, '0');
    inp('c', T('Liabilities / assets cap (90% ordinary, 95% banks and leasing)', 'سقف نسبت بدهی به دارایی (۹۰٪ عادی، ۹۵٪ بانک و لیزینگ)'), m.ctype === 'bank' ? 0.95 : 0.9, 'pct');
    inp('k', T('Minimum interest cover after the issue', 'حداقل پوشش بهره پس از انتشار'), num(m.cover) || 1.5, 'x2');
    inp('tax', T('Tax rate', 'نرخ مالیات'), num(m.tax), 'pct'); inp('pay', T('Dividend payout', 'سهم سود تقسیمی'), num(m.payout), 'pct');
    inp('scap', T('Small-issue cap: 2,000 bn rials in this unit', 'سقف اوراق کوچک: ۲٬۰۰۰ میلیارد ریال به این واحد'), 2000 * (UNIT_PER_BN[m.unit] || 1e3));
    r++; W.sec(r++, T('2. Required conditions (SEO)', '۲. شرط‌های لازم (سازمان بورس)'), 3);
    calc('la0', T('Liabilities / assets now', 'نسبت بدهی به دارایی اکنون'), '=IF(' + R('ta') + '>0,' + R('tl') + '/' + R('ta') + ',0)', 'pct2', T('= liabilities ÷ assets', '= بدهی‌ها ÷ دارایی‌ها'));
    calc('ok1', T('Liabilities / assets within the cap (1 = yes)', 'نسبت بدهی به دارایی زیر سقف (۱ = بله)'), '=IF(' + R('la0') + '<=' + R('c') + ',1,0)', '0');
    calc('cfos', T('Operating cash flow, two years', 'جمع جریان نقد عملیاتی دو سال'), '=' + R('cfo1') + '+' + R('cfo2'));
    calc('ok2', T('Two-year cash flow positive (1 = yes)', 'جمع جریان نقد دو سال مثبت (۱ = بله)'), '=IF(' + R('cfos') + '>0,1,0)', '0');
    calc('ok3', T('Tenor ≤ 18 months for a small issue (1 = yes)', 'مدت ≤ ۱۸ ماه برای اوراق کوچک (۱ = بله)'), '=IF(OR(' + R('small') + '=0,' + R('months') + '<=18),1,0)', '0');
    calc('okA', T('All conditions met (1 = yes)', 'همهٔ شرط‌ها برقرار (۱ = بله)'), '=' + R('ok1') + '*' + R('ok2') + '*' + R('ok3'), '0', null, 'total');
    r++; W.sec(r++, T('3. Limits on the issue (X)', '۳. حدهای مبلغ انتشار (X)'), 3);
    calc('T', T('Tenor in years', 'مدت به سال'), '=' + R('months') + '/12', 'dec');
    calc('keep', T('q = share of profit retained = (1 − tax) × (1 − payout)', 'q = سهم سود ماندگار = (۱ − مالیات) × (۱ − تقسیم سود)'), '=(1-' + R('tax') + ')*(1-' + R('pay') + ')', 'dec4');
    calc('xcap', T('a) Capital ceiling = capital × multiple − outstanding', 'الف) سقف سرمایه = سرمایه × ضریب − اوراق در جریان'), '=IF(' + R('cap') + '>0,MAX(0,' + R('mult') + '*' + R('cap') + '-' + R('out') + '),1E+30)', 'money', T('not applied if capital is 0', 'اگر سرمایه صفر باشد اعمال نمی‌شود'));
    calc('xla', T('b) Liabilities / assets after the issue ≤ cap: (c × assets − liabilities) ÷ (1 − c)', 'ب) نسبت بدهی به دارایی پس از انتشار ≤ سقف: (c × دارایی‌ها − بدهی‌ها) ÷ (۱ − c)'), '=MAX(0,(' + R('c') + '*' + R('ta') + '-' + R('tl') + ')/(1-' + R('c') + '))');
    calc('xcov', T('c) Interest cover after the issue: (EBIT ÷ k − finance cost) ÷ rate', 'ج) پوشش بهره پس از انتشار: (سود عملیاتی ÷ k − هزینهٔ مالی) ÷ نرخ'), '=IF(' + R('rate') + '>0,MAX(0,(' + R('ebit') + '/' + R('k') + '-' + R('fc') + ')/' + R('rate') + '),1E+30)');
    calc('B', T('B = repayment base: PBT if entered, else EBIT − finance cost', 'B = مبنای بازپرداخت: سود قبل از مالیات اگر وارد شده، وگرنه سود عملیاتی − هزینهٔ مالی'), '=IF(ISNUMBER(' + R('pbt') + '),' + R('pbt') + ',' + R('ebit') + '-' + R('fc') + ')');
    calc('xrep', T('d) Repayment from profit: B × q ÷ (rate × q + 1 ÷ years)', 'د) بازپرداخت از محل سود: B × q ÷ (نرخ × q + ۱ ÷ سال)'), '=IF(' + R('B') + '>0,' + R('B') + '*' + R('keep') + '/(' + R('rate') + '*' + R('keep') + '+1/' + R('T') + '),0)');
    calc('xsm', T('e) Small and short-term cap', 'هـ) سقف اوراق کوچک و کوتاه‌مدت'), '=IF(' + R('small') + '=1,' + R('scap') + ',1E+30)', 'money', T('1E+30 = not applied', '1E+30 یعنی اعمال نشده'));
    r++;
    calc('rec', T('RECOMMENDED ISSUE CAPACITY = lowest limit (0 if a condition fails)', 'ظرفیت پیشنهادی انتشار = کمترین حد (اگر شرطی برقرار نباشد، صفر)'), '=IF(' + R('okA') + '=1,MIN(' + [R('xcap'), R('xla'), R('xcov'), R('xrep'), R('xsm')].join(',') + '),0)', 'money', null, 'total');
    var labs = F ? ['سقف سرمایه', 'نسبت بدهی به دارایی', 'پوشش بهره', 'بازپرداخت از محل سود', 'سقف اوراق کوچک'] : ['Capital ceiling', 'Liabilities / assets', 'Interest cover', 'Repayment from profit', 'Small-issue cap'];
    W.put(1, r, T('Binding limit', 'حد محدودکننده'));
    W.put(2, r, { f: '=IF(' + R('okA') + '<>1,"' + T('condition fails', 'شرط برقرار نیست') + '",' + [['xcap', 0], ['xla', 1], ['xcov', 2], ['xrep', 3]].map(function (p) { return 'IF(' + R('rec') + '=' + R(p[0]) + ',"' + labs[p[1]] + '",'; }).join('') + '"' + labs[4] + '"))))' + ')' }, 'calc'); r += 2;
    W.sec(r++, T('Symbols', 'تعریف نمادها'), 3); SYMS.forEach(function (x) { W.put(1, r, x[0]); W.put(2, r, F ? x[2] : x[1], 'wrap'); r++; }); r++;
    W.sec(r++, T('4. Annual profit (interest) on the sukuk', '۴. سود (بهره) سالانهٔ اوراق'), 3);
    calc('ann', T('Annual sukuk profit = capacity × rate', 'سود سالانهٔ اوراق = ظرفیت × نرخ'), '=' + R('rec') + '*' + R('rate'), 'money', null, 'total');
    calc('per', T('Each coupon = annual ÷ coupons per year', 'هر کوپن = سود سالانه ÷ تعداد کوپن'), '=' + R('ann') + '/' + R('freq'));
    calc('ncp', T('Number of coupons', 'تعداد کوپن‌ها'), '=ROUND(' + R('months') + '*' + R('freq') + '/12,0)', '0');
    calc('toti', T('Total profit over the tenor', 'جمع سود طی مدت'), '=' + R('per') + '*' + R('ncp'));
    calc('totp', T('Total paid (principal at maturity + profit)', 'جمع پرداخت (اصل در سررسید + سود)'), '=' + R('rec') + '+' + R('toti'));
    calc('fca', T('Finance cost after the issue', 'هزینهٔ مالی پس از انتشار'), '=' + R('fc') + '+' + R('ann'));
    calc('ica', T('Interest cover after the issue', 'پوشش بهره پس از انتشار'), '=IF(' + R('fca') + '>0,' + R('ebit') + '/' + R('fca') + ',0)', 'x2');
    calc('la1', T('Liabilities / assets after the issue', 'نسبت بدهی به دارایی پس از انتشار'), '=(' + R('tl') + '+' + R('rec') + ')/(' + R('ta') + '+' + R('rec') + ')', 'pct2');
    calc('room', T('Room to the cap after the issue (points)', 'فاصله تا سقف پس از انتشار (واحد درصد)'), '=' + R('c') + '-' + R('la1'), 'pct2');
    calc('de1', T('Liabilities / equity after the issue', 'بدهی به حقوق صاحبان سهام پس از انتشار'), '=IF(' + R('eq') + '<>0,(' + R('tl') + '+' + R('rec') + ')/' + R('eq') + ',0)', 'x2');
    r++; W.sec(r++, T('5. Quick answer: largest issue whose profit the company’s profit covers', '۵. پاسخ سریع: سود شرکت بهرهٔ چه مبلغ اوراقی را پوشش می‌دهد'), 3);
    var pc = S.pc || {};
    inp('pcP', T('Profit before tax (after current finance cost)', 'سود قبل از مالیات (پس از هزینهٔ مالی فعلی)'), num(pc.profit) || 0); inp('pcR', T('Rate', 'نرخ'), num(pc.rate) || num(m.rate), 'pct2'); inp('pcK', T('Cover multiple', 'ضریب پوشش'), num(pc.k) || 1, 'x2');
    calc('pcX', T('Largest issue = profit ÷ (cover × rate)', 'حداکثر اوراق = سود ÷ (پوشش × نرخ)'), '=IF(' + R('pcR') + '>0,' + R('pcP') + '/(' + R('pcK') + '*' + R('pcR') + '),0)', 'money', null, 'total');
    W.put(1, r + 1, T('This is only the interest test: principal at maturity, the capital ceiling and liabilities / assets are in section 3.', 'این فقط آزمون پوشش بهره است؛ اصل در سررسید، سقف سرمایه و نسبت بدهی به دارایی در بخش ۳ سنجیده می‌شوند.'), 'sub');
    // payment schedule sheet
    var P = b.sheet(T('Coupon schedule', 'جدول پرداخت کوپن'), [2, 12, 16, 20, 20, 20], F ? { rightToLeft: true } : undefined), M = "'" + W.name + "'!";
    P.title(T('Payment schedule at the recommended capacity', 'جدول پرداخت در مبلغ ظرفیت پیشنهادی'), T('Principal in one sum with the last coupon (maturity). Linked to the method sheet.', 'اصل یکجا همراه آخرین کوپن (سررسید). به برگهٔ روش محاسبه پیوند دارد.'));
    [T('Payment', 'پرداخت'), T('Month', 'ماه'), T('Profit', 'سود'), T('Principal', 'اصل'), T('Total', 'جمع')].forEach(function (t, i) { P.put(1 + i, 4, t, 'hdr'); });
    var nMax = 72;
    for (var k = 1; k <= nMax; k++) { var rr = 4 + k, on = 'B' + rr + '<=' + M + R('ncp');
      P.put(1, rr, { f: '=IF(' + k + '<=' + M + R('ncp') + ',' + k + ',"")' }, 'calc', '0');
      P.put(2, rr, { f: '=IF(' + on + ',ROUND(' + k + '*12/' + M + R('freq') + ',0),"")' }, 'calc', '0');
      P.put(3, rr, { f: '=IF(' + on + ',' + M + R('per') + ',"")' }, 'calc', 'money');
      P.put(4, rr, { f: '=IF(' + on + ',IF(B' + rr + '=' + M + R('ncp') + ',' + M + R('rec') + ',0),"")' }, 'calc', 'money');
      P.put(5, rr, { f: '=IF(' + on + ',D' + rr + '+E' + rr + ',"")' }, 'calc', 'money'); }
    P.put(1, 5 + nMax, T('Total', 'جمع'), 'total'); ['D', 'E', 'F'].forEach(function (c, i) { P.put(3 + i, 5 + nMax, { f: '=SUM(' + c + '5:' + c + (4 + nMax) + ')' }, 'total', 'money'); });
    // the full-model method (statements loaded): repayment from profit
    if (A && !A.empty && A.C && !A.noBS) {
      var C = A.C, Z = b.sheet(T('Method (statements)', 'روش محاسبه (صورت‌ها)'), [2, 62, 20, 60], F ? { rightToLeft: true } : undefined), z = 4, zr = {};
      Z.title(T('Recommended capacity from the imported statements', 'ظرفیت پیشنهادی بر پایهٔ صورت‌های واردشده'), T('Same rules as the Eligibility and capacity tab; inputs from the statements and your limits.', 'همان قواعد زبانهٔ «امکان و ظرفیت انتشار»؛ ورودی‌ها از صورت‌ها و حدهای شما.'));
      var zi = function (key, label, v, fmt) { Z.put(1, z, label); Z.put(2, z, v, 'in', fmt || 'money'); zr[key] = 'C' + z; z++; };
      var zc = function (key, label, f, fmt, kind) { Z.put(1, z, label, kind === 'total' ? 'total' : null); Z.put(2, z, { f: f }, kind || 'calc', fmt || 'money'); zr[key] = 'C' + z; z++; };
      var Q = function (k) { return zr[k]; };
      Z.sec(z++, T('Inputs', 'ورودی‌ها'), 3);
      zi('pbt', T('Profit before tax' + (C.pbt !== C.pbt0 ? ' (operating only)' : ''), 'سود قبل از مالیات' + (C.pbt !== C.pbt0 ? ' (فقط عملیاتی)' : '')), C.pbt); zi('ni', T('Net income', 'سود خالص'), C.ni); zi('pbt0', T('Profit before tax as reported', 'سود قبل از مالیات گزارش‌شده'), C.pbt0);
      zi('ebit', T('Operating profit (EBIT)', 'سود عملیاتی'), C.ebit); zi('fc', T('Finance cost', 'هزینهٔ مالی'), C.fc);
      zi('cur', T('Facilities due within a year', 'تسهیلات سررسید زیر یک سال'), C.curDebt); zi('roll', T('Share renewed', 'نرخ تمدید'), C.roll, 'pct');
      zi('rate', T('Rate', 'نرخ'), C.rate, 'pct2'); zi('T', T('Tenor (years)', 'مدت (سال)'), C.T, 'dec'); zi('pay', T('Dividend payout', 'تقسیم سود'), C.payout, 'pct');
      zi('kP', T('Minimum cover of the coupon by PBT', 'حداقل پوشش سود اوراق با سود قبل از مالیات'), C.kP, 'x2'); zi('kE', T('Minimum EBIT cover after the issue', 'حداقل پوشش بهره با سود عملیاتی'), C.kE, 'x2');
      zi('cap', T('Capital ceiling (capital × multiple − outstanding)', 'سقف سرمایه (سرمایه × ضریب − اوراق در جریان)'), isFinite(C.capCeil) ? C.capCeil : 1e30); zi('route', T('Instrument asset base / credit route', 'پایهٔ دارایی ابزار / مسیر اعتباری'), isFinite(C.routeMax) ? C.routeMax : 1e30);
      Z.sec(z++, T('Calculation', 'محاسبه'), 3);
      zc('t', T('Effective tax = 1 − NI ÷ PBT', 'مالیات مؤثر = ۱ − سود خالص ÷ سود قبل از مالیات'), '=IF(AND(' + Q('pbt0') + '>0,' + Q('ni') + '>0,' + Q('ni') + '<=' + Q('pbt0') + '),1-' + Q('ni') + '/' + Q('pbt0') + ',0.25)', 'pct2');
      zc('k', T('q = (1 − t)(1 − d), share of profit retained', 'q = (۱ − t)(۱ − d)، سهم سود ماندگار'), '=(1-' + Q('t') + ')*(1-' + Q('pay') + ')', 'dec4');
      zc('E', T('E = facilities not renewed per year', 'E = تسهیلات تمدیدنشده در سال'), '=' + Q('cur') + '*(1-' + Q('roll') + ')');
      zc('x1', T('Repayment from profit = (PBT × q − E) ÷ (rate × q + 1 ÷ T)', 'بازپرداخت از محل سود = (سود قبل از مالیات × q − E) ÷ (نرخ × q + ۱ ÷ T)'), '=MAX(0,(' + Q('pbt') + '*' + Q('k') + '-' + Q('E') + ')/(' + Q('rate') + '*' + Q('k') + '+1/' + Q('T') + '))');
      zc('x2', T('Coupon from PBT = PBT ÷ (cover × rate)', 'پرداخت سود اوراق = سود قبل از مالیات ÷ (پوشش × نرخ)'), '=MAX(0,' + Q('pbt') + '/(' + Q('kP') + '*' + Q('rate') + '))');
      zc('x3', T('Interest cover = (EBIT ÷ k − finance cost) ÷ rate', 'پوشش بهره = (سود عملیاتی ÷ k − هزینهٔ مالی) ÷ نرخ'), '=IF(' + Q('kE') + '>0,MAX(0,(' + Q('ebit') + '/' + Q('kE') + '-' + Q('fc') + ')/' + Q('rate') + '),1E+30)');
      zc('rec', T('RECOMMENDED CAPACITY = lowest', 'ظرفیت پیشنهادی = کمترین'), '=MIN(' + [Q('x1'), Q('x2'), Q('x3'), Q('cap'), Q('route')].join(',') + ')', 'money', 'total');
      zc('ann', T('Annual sukuk profit = capacity × rate', 'سود سالانهٔ اوراق = ظرفیت × نرخ'), '=' + Q('rec') + '*' + Q('rate'), 'money', 'total');
      Z.put(1, z + 1, T('Cash flow is a limit only if operating cash flow over two years is not positive (SEO originator test); otherwise a warning.', 'جریان نقد فقط وقتی سقف است که جمع جریان نقد عملیاتی دو سال مثبت نباشد (شرط بانی سازمان)؛ در غیر این صورت هشدار است.'), 'sub');
    }
  }
  function build(ExcelJS, S, A) {
    var X = Hub.xl, b = X.book(ExcelJS, 'Sukuk capacity'), x = S.x, D = A.D;
    if (A.empty) { calcSheets(b, S, A); return b.wb; }
    calcSheets(b, S, A);
    var C = b.sheet('Capacity', [2, 52, 18, 18, 60]);
    C.title('Sukuk issuance capacity', (A.rec ? A.rec.file : '') + ' · ' + A.year + ' · unit: ' + A.unit + ' · SEO rules as encoded (verify on cmr.seo.ir)');
    var r = 4;
    C.put(1, r, 'Total assets (last audited year)'); C.put(2, r, A.TA, 'in', 'money'); var rTA = r++;
    C.put(1, r, 'Total liabilities'); C.put(2, r, A.TL, 'in', 'money'); var rTL = r++;
    C.put(1, r, 'Debt securities issued / approved since those statements'); C.put(2, r, num(x.outstanding), 'in', 'money'); var rO = r++;
    C.put(1, r, 'Liabilities / assets now'); C.put(2, r, { f: '=C' + rTL + '/C' + rTA }, 'calc', 'pct'); r++;
    C.put(1, r, 'Cap on liabilities / assets for rating ' + (x.rating || 'none') + ' ([CR] art. 2)'); C.put(2, r, isFinite(R.debtRatioCap(x.rating)) ? R.debtRatioCap(x.rating) : 0, 'in', 'pct'); var rC = r++;
    C.put(1, r, 'Rating route: max principal, proceeds added to assets'); C.put(2, r, { f: '=MAX(0,(C' + rC + '*C' + rTA + '-C' + rTL + '-C' + rO + ')/(1-C' + rC + '))' }, 'calc', 'money'); r++;
    C.put(1, r, 'Rating route: max principal, liabilities only (conservative)'); C.put(2, r, { f: '=MAX(0,C' + rC + '*C' + rTA + '-C' + rTL + '-C' + rO + ')' }, 'calc', 'money'); r += 2;
    C.put(1, r, 'Coupon (for the profit covered by collateral)'); C.put(2, r, num(S.coupon), 'in', 'pct'); var rK = r++;
    C.put(1, r, 'Tenor (years)'); C.put(2, r, num(x.tenorMonths) / 12, 'in', 'dec'); var rT = r++;
    ['Pledged security', 'Value', 'Coefficient', 'Covers (value ÷ coefficient)'].forEach(function (t, i) { C.put(1 + i, r, t, 'hdr'); }); r++;
    var c0 = r; (x.coll || []).forEach(function (c) { var k = R.collCoef(c.type, R.RATINGS.indexOf(x.rating) >= 0 ? x.rating : null); C.put(1, r, (R.COLL[c.type] || {}).en || c.type); C.put(2, r, num(c.value), 'in', 'money'); C.put(3, r, k, 'in', 'dec'); C.put(4, r, { f: '=C' + r + '/D' + r }, 'calc', 'money'); r++; });
    C.put(1, r, 'Collateral route: max principal = Σ cover ÷ (1 + coupon × tenor)', 'total'); C.put(2, r, (x.coll || []).length ? { f: '=SUM(E' + c0 + ':E' + (r - 1) + ')/(1+C' + rK + '*C' + rT + ')' } : 0, 'total', 'money'); r += 2;
    ['Instrument', 'Status', 'Max amount', 'Asset base', 'Notes'].forEach(function (t, i) { C.put(1 + i, r, t, 'hdr'); }); r++;
    A.inst.forEach(function (i) { C.put(1, r, tx(i.name)); C.put(2, r, stTxt(i.status)); C.put(3, r, isFinite(i.max) ? i.max : '', 'calc', 'money'); C.put(4, r, isFinite(i.assetCap) ? i.assetCap : '', 'calc', 'money'); C.put(5, r, i.points.map(tx).join(' '), 'wrap'); r++; });
    if (A.Y && A.Y.sc) {
      var BI = Hub.tools.bondIssue, Jj = Hub.jalali, Sk = b.sheet('Sukuk cost (ytm)', [2, 30, 14, 18, 18, 18]);
      Sk.title('Sukuk cost · ytm method', 'Amount ' + Math.round(A.Y.amount) + ', coupon ' + (A.Y.coupon * 100).toFixed(2) + '%, ' + A.Y.years + ' years. Dated issuer cash flows; XIRR formulas are live (act/365).');
      var fl = { all: BI.flows(A.Y.sc, 'all'), seo: BI.flows(A.Y.sc, 'seo'), bare: BI.flows(A.Y.sc, 'bare') }, dts = fl.all.map(function (x) { return x.date; });
      ['Shamsi date', 'Date', 'All fees (true cost)', 'Fees in SEO rate', 'Coupons only'].forEach(function (t, i) { Sk.put(1 + i, 4, t, 'hdr'); });
      var pick = function (arr, d) { var m = arr.filter(function (x) { return x.date === d; })[0]; return m ? m.cf : 0; };
      dts.forEach(function (d, i) { var r = 5 + i; Sk.put(1, r, Jj.jstr(d)); Sk.put(2, r, { date: Jj.toDate(d) }, null, 'date'); Sk.put(3, r, pick(fl.all, d), 'calc', 'money'); Sk.put(4, r, pick(fl.seo, d), 'calc', 'money'); Sk.put(5, r, pick(fl.bare, d), 'calc', 'money'); });
      var e = 4 + dts.length, kr = e + 2;
      ['True issuer cost', 'Rate presented to SEO', 'Coupons only'].forEach(function (t, i) { var col = ['D', 'E', 'F'][i]; Sk.put(1, kr + i, t, 'total'); Sk.put(3, kr + i, { f: '=XIRR(' + col + '5:' + col + e + ',C5:C' + e + ')' }, 'total', 'pct2'); });
      Sk.put(1, kr + 3, 'Rate approved by SEO'); Sk.put(3, kr + 3, A.Y.cap, 'in', 'pct2');
    }
    if (A.limits && !A.noBS) {
      var RS = b.sheet('Recommended', [2, 70, 18, 12, 70]), q = 4, q0;
      RS.title('Recommended issue capacity', 'Lowest applied limit. Debt service from CFO limits only if CFO over two years is not positive (SEO test); otherwise a warning.');
      ['Limit', 'Amount', 'Applied', 'Note'].forEach(function (t, i) { RS.put(1 + i, q, t, 'hdr'); }); q++; q0 = q;
      A.limits.forEach(function (x) { RS.put(1, q, x.label.en); RS.put(2, q, isFinite(x.v) ? Math.max(0, x.v) : 1e30, 'in', 'money'); RS.put(3, q, x.applied ? 1 : 0, 'in', 'dec'); RS.put(4, q, x.note ? x.note.en : '', 'wrap'); q++; });
      RS.put(1, q, 'Recommended = lowest applied amount', 'total');
      var refs = []; for (var k = q0; k < q; k++) refs.push('IF(D' + k + '=1,C' + k + ',1E+30)');
      RS.put(2, q, { f: '=MIN(' + refs.join(',') + ')' }, 'total', 'money'); q += 2;
      RS.put(1, q, 'Strict amount (cash-flow tests also as limits)'); RS.put(2, q, isFinite(A.recStrict) ? A.recStrict : 0, 'calc', 'money');
    }
    if (A.F) {
      var FS = b.sheet('Financial capacity', [2, 56, 18, 60]), F = A.F, f = S.fin, rr = 4, ref = {};
      FS.title('Issue capacity at your rate', 'Not a rule of the instructions: prudence tests with your limits; X = new principal; annual cost = rate × X');
      [['ebit', 'EBIT', F.ebit], ['ebitda', 'EBITDA', F.ebitda], ['ie', 'Finance cost', F.ie], ['pbt', 'Profit before tax' + (f.coreOnly ? ' (operating: less non-operating income)' : ''), f.coreOnly ? F.pbtCore : F.pbt], ['ni', 'Net income' + (f.coreOnly ? ' (operating)' : ''), f.coreOnly ? F.niCore : F.ni], ['eq', 'Equity', F.eq], ['debt', 'Interest-bearing debt', F.debt], ['nd', 'Net debt', F.nd],
        ['cfo', 'Operating cash flow (average of last two years)', F.cfoAvg], ['cap', 'Registered capital', isFinite(F.cap) ? F.cap : 0], ['so', 'Sukuk outstanding', Math.max(num(f.sukukOut), F.B.sukuk)], ['rate', 'Rate used', A.rate], ['T', 'Tenor (years)', num(S.x.tenorMonths) / 12], ['pp', 'Principal per year share (1/T if instalments, else 0)', S.amort === 'equal' ? 12 / num(S.x.tenorMonths) : 0], ['tax', 'Tax rate', num(f.taxRate)],
        ['m1', 'Limit: EBIT / finance cost ≥', num(f.minEbitCover)], ['m2', 'Limit: EBITDA / finance cost ≥', num(f.minEbitdaCover)], ['m3', 'Limit: net debt / EBITDA ≤', num(f.maxNdEbitda)], ['m4', 'Limit: share of PBT kept', num(f.pbtKeep)], ['m5', 'Limit: net income kept', num(f.niKeep)], ['m6', 'Limit: debt / equity ≤', num(f.maxDE)], ['m7', 'Limit: CFO / debt service ≥', num(f.minDscr)], ['m8', 'Limit: issue ≤ × capital', num(f.capMult)], ['reg', 'Regulatory maximum (Capacity sheet)', A.regMax]].forEach(function (x) {
        FS.put(1, rr, x[1]); FS.put(2, rr, isFinite(x[2]) ? x[2] : 0, 'in', /rate|tax|m4/.test(x[0]) ? 'pct' : /^m[1-3]|m6|m7|m8|T|pp/.test(x[0]) ? 'dec' : 'money'); ref[x[0]] = 'C' + rr; rr++; });
      rr++; ['Test', 'Max new issue', 'Formula'].forEach(function (t, i) { FS.put(1 + i, rr, t, 'hdr'); }); rr++;
      var R0 = rr, g = function (k) { return ref[k]; }, T = [
        ['EBIT / finance cost', 'IF(' + g('m1') + '>0,MAX(0,(' + g('ebit') + '/' + g('m1') + '-' + g('ie') + ')/' + g('rate') + '),1E+30)'],
        ['EBITDA / finance cost', 'IF(' + g('m2') + '>0,MAX(0,(' + g('ebitda') + '/' + g('m2') + '-' + g('ie') + ')/' + g('rate') + '),1E+30)'],
        ['Net debt / EBITDA', 'IF(' + g('m3') + '>0,IF(' + g('ebitda') + '>0,MAX(0,' + g('m3') + '*' + g('ebitda') + '-' + g('nd') + '),0),1E+30)'],
        ['Profit before tax kept' + (f.coreOnly ? ' (operating)' : ''), 'IF(' + g('pbt') + '>0,MAX(0,' + g('pbt') + '*(1-' + g('m4') + ')/' + g('rate') + '),0)'],
        ['Net income kept' + (f.coreOnly ? ' (operating)' : ''), 'IF(' + g('ni') + '>' + g('m5') + ',MAX(0,(' + g('ni') + '-' + g('m5') + ')/(' + g('rate') + '*(1-' + g('tax') + '))),0)'],
        ['Debt / equity', 'IF(' + g('m6') + '>0,IF(' + g('eq') + '>0,MAX(0,' + g('m6') + '*' + g('eq') + '-' + g('debt') + '),0),1E+30)'],
        ['All sukuk ≤ multiple × capital', 'IF(AND(' + g('m8') + '>0,' + g('cap') + '>0),MAX(0,' + g('m8') + '*' + g('cap') + '-' + g('so') + '),1E+30)']];
      T.forEach(function (t) { FS.put(1, rr, t[0]); FS.put(2, rr, { f: '=' + t[1] }, 'calc', 'money'); FS.put(3, rr, '=' + t[1], 'wrap'); rr++; });
      F.tests.filter(function (x) { return x.key === 'dscr' || x.key === 'service' || x.key === 'nonOp' || x.key === 'niAvg' || x.key === 'art141'; }).forEach(function (x) { FS.put(1, rr, x.label.en + (x.on ? '' : ' (off)')); FS.put(2, rr, x.on ? (isFinite(x.max) ? x.max : 1e30) : 1e30, 'calc', 'money'); FS.put(3, rr, 'from the yearly schedule below (engine value)', 'wrap'); rr++; });
      FS.put(1, rr, 'Financial capacity (lowest test)' + (F.art141 ? ' — art. 141 applies: 0' : ''), 'total'); FS.put(2, rr, F.art141 ? 0 : { f: '=MIN(C' + R0 + ':C' + (rr - 1) + ')' }, 'total', 'money'); var rf = rr++;
      FS.put(1, rr, 'Issue capacity = lower of rules and finances', 'total'); FS.put(2, rr, { f: '=MIN(C' + rf + ',' + g('reg') + ')' }, 'total', 'money'); rr += 2;
      var SC = b.sheet('Debt service schedule', [2, 8, 18, 18, 18, 18, 18, 18, 18, 14]); SC.title('Debt service over the tenor at the capacity', 'Existing facilities at ' + (F.iR * 100).toFixed(1) + '%; roll-over ' + (F.roll * 100).toFixed(0) + '%; coupons at ' + (A.rate * 100).toFixed(2) + '%');
      ['Year', 'Operating cash flow', 'Interest, existing', 'Repayments not rolled', 'Sukuk coupons', 'Sukuk principal', 'Net', 'Cumulative', 'Cover'].forEach(function (t, i) { SC.put(1 + i, 4, t, 'hdr'); });
      F.sched.forEach(function (r0, i) { var rw = 5 + i; SC.put(1, rw, r0.y); [r0.cfo, -r0.intE, -r0.payE, -r0.coup, -r0.prinS].forEach(function (v, k) { SC.put(2 + k, rw, v, 'in', 'money'); });
        SC.put(7, rw, { f: '=SUM(C' + rw + ':G' + rw + ')' }, 'calc', 'money'); SC.put(8, rw, { f: i ? '=I' + (rw - 1) + '+H' + rw : '=H' + rw + '+' + Math.round(F.cashStart || 0) }, 'calc', 'money'); SC.put(9, rw, { f: '=IF((-D' + rw + '-F' + rw + ')>0,C' + rw + '/(-D' + rw + '-F' + rw + '),0)' }, 'calc', 'dec'); });
    }
    var K = b.sheet('Checks', [2, 50, 10, 70, 30, 50]); K.title('Originator conditions');
    ['Condition', 'Result', 'Evidence', 'Basis', 'Waived by'].forEach(function (t, i) { K.put(1 + i, 4, t, 'hdr'); });
    A.conds.forEach(function (c, i) { K.put(1, 5 + i, tx(c.label), 'wrap'); K.put(2, 5 + i, c.ok ? 'PASS' : 'FAIL'); K.put(3, 5 + i, tx(c.detail), 'wrap'); K.put(4, 5 + i, c.cite); K.put(5, 5 + i, c.waivedBy ? tx(c.waivedBy) : '', 'wrap'); });
    var P = b.sheet('Process and documents', [2, 90, 40, 20]); P.title('Process (murabaha procedure) and documents');
    R.PROCESS.forEach(function (p, i) { P.put(1, 4 + i, tx(p.step), 'wrap'); P.put(2, 4 + i, tx(p.time)); P.put(3, 4 + i, p.cite); });
    R.DOCS.forEach(function (d, i) { P.put(1, 6 + R.PROCESS.length + i, '• ' + tx(d), 'wrap'); });
    R.SOURCES.forEach(function (s, i) { P.put(1, 8 + R.PROCESS.length + R.DOCS.length + i, s[0] + ' ' + (fa() ? s[2] : s[1]), 'wrap'); });
    return b.wb;
  }

  /* ---------- sukuk cost, ytm method (same as the user's ytm calculator: Shamsi calendar, business-day
     adjustment, fees by unit / basis / timing / delay, SEO rate without the side letter vs true issuer cost) ---------- */
  var YT_FEES = function () { return [
    { name: 'بازارگردان', pct: 11.67, unit: '%', basis: 'y', timing: 's', delay: 0, seo: true },
    { name: 'ضامن', pct: 1, unit: '%', basis: 'y', timing: 's', delay: 0, seo: true },
    { name: 'متعهد پذیره‌نویسی', pct: 2, unit: '%', basis: 'o', timing: '0', delay: 3, seo: true },
    { name: 'مشاور عرضه و سایر', pct: 1.5, unit: '%', basis: 'o', timing: '0', delay: 3, seo: true },
    { name: 'مازاد الحاقیه', pct: 6.6, unit: '%', basis: 'o', timing: '0', delay: 3, seo: false }]; };
  function todayJ() { try { var J = Hub.jalali, d = new Date(), g = J.g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()), j = J.d2j(g); return j.jy + '/' + ('0' + j.jm).slice(-2) + '/' + ('0' + j.jd).slice(-2); } catch (e) { return '1405/09/01'; } }
  function ytDefault() { return { amountMode: 'rec', amount: 10000, couponMode: 'rate', coupon: 0.23, years: 0, freq: 4, issueDate: todayJ(), payDay: 'auto', principal: 'bullet', cal: { conv: 'next', weekend: 2, lunar: true, extra: '' }, fees: YT_FEES(), cap: 0.445, mode: 'rate', lever: 'cpn', target: 0.30, tbase: 'seo', unk: 'cpn' }; }
  // state for Hub.tools.bondIssue.schedule
  function ytState(Y, amount, coupon, years) {
    return { bond: { amount: amount, coupon: coupon, years: years, freq: Y.freq, issueDate: Y.issueDate, payDay: Y.payDay }, cal: Y.cal, settings: { couponConv: 'equal', principal: Y.principal || 'bullet' },
      fees: Y.fees.map(function (f) { return { name: f.name, pct: f.unit === 'A' ? num(f.pct) : num(f.pct) / 100, unit: f.unit, basis: f.basis, timing: f.basis === 'y' && f.timing === '0' ? 'all' : f.timing, delay: f.delay, seo: !!f.seo }; }) };
  }
  function ytRates(st) { var BI = Hub.tools.bondIssue, sc = BI.schedule(st); return { sc: sc, seo: BI.xirr(BI.flows(sc, 'seo')), all: BI.xirr(BI.flows(sc, 'all')), bare: BI.xirr(BI.flows(sc, 'bare')) }; }
  // cost of the issue at amount A: coupon from the tab (or the capacity rate), tenor from the tab (or the capacity tenor)
  function ytCost(S, A, rate) {
    if (!Hub.tools || !Hub.tools.bondIssue) return null;
    if (!S.yt) S.yt = ytDefault(); var Y = S.yt;
    var cpn = Y.couponMode === 'rate' && isFinite(rate) ? rate : num(Y.coupon), yrs = num(Y.years) > 0 ? Math.round(num(Y.years)) : Math.max(1, Math.round(num(S.x && S.x.tenorMonths) / 12 || 4));
    var amt = Y.amountMode === 'manual' ? num(Y.amount) : A;
    try { var st = ytState(Y, amt, cpn, yrs), R = ytRates(st), up = R.sc.fees.filter(function (e) { return e.date === R.sc.d0; }).reduce(function (s, e) { return s + e.amount; }, 0);
      return { st: st, sc: R.sc, seo: R.seo, all: R.all, bare: R.bare, net: amt - up, amount: amt, coupon: cpn, years: yrs, cap: num(Y.cap) };
    } catch (e) { return { error: e.message }; }
  }

  function ytSolveRate(K, lever) {
    var cap = K.cap, st0 = K.st, f = lever === 'cpn' ? function (x) { var y = JSON.parse(JSON.stringify(st0)); y.bond.coupon = x; return ytRates(y).seo; }
      : function (x) { var y = JSON.parse(JSON.stringify(st0)); y.fees.forEach(function (fe) { if (fe.seo) fe.pct = num(fe.pct) * x; }); return ytRates(y).seo; };
    var lo = 0, hi = lever === 'cpn' ? 2 : 3, v0 = f(lo);
    if (!isFinite(v0)) return { err: 'calc' }; if (v0 > cap) return { err: 'unreachable' };
    for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (f(m) <= cap) lo = m; else hi = m; }
    return { x: lo, got: f(lo) };
  }
  // ladder + bisection as in the ytm calculator: unknown = 'cpn' | 'amt' | 'f<i>'; base 'seo' | 'all'
  function ytSolveUnknown(K, unk, target, base) {
    var st0 = K.st, which = base === 'all' ? 'all' : 'seo', BI = Hub.tools.bondIssue;
    var rate = function (y) { try { return BI.xirr(BI.flows(BI.schedule(y), which)); } catch (e) { return NaN; } };
    var f, lo, hiMax, fi = /^f\d+$/.test(unk) ? +unk.slice(1) : -1;
    if (unk === 'cpn') { f = function (x) { var y = JSON.parse(JSON.stringify(st0)); y.bond.coupon = x; return rate(y); }; lo = 0; hiMax = 3; }
    else if (unk === 'amt') {
      if (!st0.fees.some(function (fe) { return fe.unit === 'A' && (which === 'all' || fe.seo); })) return { err: 'amtPct' };
      f = function (x) { var y = JSON.parse(JSON.stringify(st0)); y.bond.amount = x; return rate(y); }; lo = Math.max(1, st0.bond.amount / 50); hiMax = st0.bond.amount * 50;
    } else if (fi >= 0 && st0.fees[fi]) {
      if (which === 'seo' && !st0.fees[fi].seo) return { err: 'notInSeo', name: st0.fees[fi].name };
      var isA = st0.fees[fi].unit === 'A'; f = function (x) { var y = JSON.parse(JSON.stringify(st0)); y.fees[fi].pct = isA ? x : x / 100; return rate(y); }; lo = 0; hiMax = isA ? st0.bond.amount * 2 : 200;
    } else return { err: 'pick' };
    var pts = [], xi = lo, step = Math.max((hiMax - lo) / 4096, 1e-9);
    for (var g = 0; g < 200; g++) { var v = f(xi); if (!isFinite(v)) break; pts.push({ x: xi, v: v }); if (xi >= hiMax) break; xi = Math.min(hiMax, xi + step); step *= 2; }
    if (pts.length < 2) return { err: 'none' };
    var lowV = Math.min.apply(null, pts.map(function (p) { return p.v; })), highV = Math.max.apply(null, pts.map(function (p) { return p.v; }));
    if (highV - lowV < 1e-9) return { err: 'flat' };
    var pair = null; for (var i = 0; i < pts.length - 1; i++) { var A0 = pts[i], B0 = pts[i + 1]; if ((A0.v <= target && target <= B0.v) || (B0.v <= target && target <= A0.v)) { pair = [A0, B0]; break; } }
    if (!pair) return { err: 'range', lowV: lowV, highV: highV };
    var up = pair[1].v > pair[0].v, L = pair[0].x, H = pair[1].x;
    for (var k = 0; k < 120; k++) { var mm = (L + H) / 2; if ((f(mm) <= target) === up) L = mm; else H = mm; }
    var x = up ? L : H, y = JSON.parse(JSON.stringify(st0));
    if (unk === 'cpn') y.bond.coupon = x; else if (unk === 'amt') y.bond.amount = x; else y.fees[fi].pct = st0.fees[fi].unit === 'A' ? x : x / 100;
    var R = ytRates(y); return { x: x, seo: R.seo, all: R.all, isFeeA: fi >= 0 && st0.fees[fi].unit === 'A', fi: fi };
  }
  function ytYearly(sc) {
    var by = {}, fees = {}, add = function (d, v, isFee) { var y = Math.floor((d - sc.d0) / 365.2425); by[y] = (by[y] || 0) + v; if (isFee) fees[y] = (fees[y] || 0) + v; };
    sc.per.forEach(function (p) { add(p.end, p.coupon + p.principal, false); }); sc.fees.forEach(function (x) { add(x.date, x.amount, true); });
    return Object.keys(by).map(Number).sort(function (a, b) { return a - b; }).map(function (y) { return { y: y + 1, total: by[y], fees: fees[y] || 0 }; });
  }

  /* ---------- issue capacity core: one engine for the full model and the quick tab ----------
     Inputs (one unit): sales, ebit, ebitda, finCost (existing, already inside PBT), nonOp, pbt, ni, debt (interest-bearing),
     curDebt (due within a year), roll (share of maturing facilities renewed), cash, equity, ta, capCeil (capital × multiple −
     sukuk outstanding), cfo (basis), cfo2 (sum of two years), rate r, tenor T, payout d, kProfit, kEbit, coreOnly, assetBase, routeMax.
     Limits that SET the capacity (the lowest applies):
       1 repayment from profit:  retained profit after the coupon and dividends repays the sukuk over T years and the
         facilities that are not renewed:   X ≤ (PBT·q − E) / (r·q + 1/T),   q = (1 − t)(1 − d),  t = 1 − NI/PBT,  E = curDebt·(1 − roll)
       2 coupon paid from profit:  PBT ≥ kProfit × X·r
       3 interest cover on operating profit after the issue:  EBIT ≥ kEbit × (finance cost + X·r)
       4 capital ceiling (SEO practice)            5 instrument asset base / credit route
       6 operating cash flow — only when CFO over two years is not positive (SEO originator test)
     Shown for information, before and after the issue: debt, net debt / EBITDA, debt / equity, debt / sales,
     liabilities / assets (SEO 90%), EBITDA cover, cash-flow cover. */
  function capCore(I) {
    var n = function (k) { return num(I[k]); }, r = n('rate'), T = Math.max(0.25, n('T') || 1), d = Math.max(0, Math.min(0.95, n('payout')));
    var pbt0 = n('pbt'), ni0 = n('ni'), nonOp = n('nonOp'), pbt = I.coreOnly && nonOp > 0 ? pbt0 - nonOp : pbt0;
    var t = pbt0 > 0 && ni0 > 0 && ni0 <= pbt0 ? 1 - ni0 / pbt0 : n('taxIn') || 0.25, keep = (1 - t) * (1 - d);
    var E = Math.max(0, n('curDebt') * (1 - Math.max(0, Math.min(1, n('roll'))))), fc = Math.abs(n('finCost')), ebit = n('ebit'), ebitda = n('ebitda') || ebit;
    var kP = n('kProfit') > 0 ? n('kProfit') : 1, kE = n('kEbit');
    var cap = function (v) { return isFinite(v) ? Math.max(0, v) : v; };
    var xRepay = r > 0 && pbt > 0 ? cap((pbt * keep - E) / (r * keep + 1 / T)) : 0, xRenew = r > 0 && pbt > 0 ? cap(pbt * keep / (r * keep + 1 / T)) : 0;
    var xCoupon = r > 0 && pbt > 0 ? cap(pbt / (kP * r)) : 0;
    var xEbit = kE > 0 ? (r > 0 && ebit > 0 ? cap((ebit / kE - fc) / r) : 0) : NaN;
    var cfo = I.cfo == null ? NaN : n('cfo'), hasCF = isFinite(cfo), cfoPos = hasCF ? n('cfo2') > 0 : true;
    var xCash = hasCF ? cap((cfo - fc - E - Math.max(0, ni0) * d) / (r + 1 / T)) : NaN;
    var L = function (key, en, fa, v, applied, note) { return { key: key, label: { en: en, fa: fa }, v: v, applied: applied, note: note || null }; };
    var pctS = function (x) { return U.fmtPct(x, 1); };
    var lim = [
      L('profit', 'Repayment from profit: coupon and principal from retained profit over ' + (+T.toFixed(2)) + ' years, after non-renewed facilities', 'بازپرداخت از محل سود: سود و اصل اوراق از سود انباشته‌شده طی ' + (+T.toFixed(2)) + ' سال، پس از اقساط تمدیدنشدهٔ تسهیلات', xRepay, true,
        { en: 'PBT' + (I.coreOnly && nonOp > 0 ? ' (operating only)' : '') + ' ' + U.fmtNum(pbt) + ', tax ' + pctS(t) + ', payout ' + pctS(d) + ', facilities not renewed ' + U.fmtNum(E) + ' a year', fa: 'سود قبل از مالیات' + (I.coreOnly && nonOp > 0 ? ' (فقط عملیاتی)' : '') + ' ' + U.fmtNum(pbt) + '، مالیات ' + pctS(t) + '، تقسیم سود ' + pctS(d) + '، تسهیلات تمدیدنشده ' + U.fmtNum(E) + ' در سال' }),
      L('coupon', 'Coupon paid from profit before tax (≥ ' + kP + '×)', 'پرداخت سود اوراق از سود قبل از مالیات (≥ ' + kP + ' برابر)', xCoupon, true, null),
      L('ebit', 'Interest cover after the issue: operating profit ≥ ' + kE + '× (finance cost + coupon)', 'پوشش بهره پس از انتشار: سود عملیاتی ≥ ' + kE + ' برابر (هزینهٔ مالی فعلی + سود اوراق)', xEbit, kE > 0 && isFinite(xEbit), kE > 0 ? { en: 'EBIT ' + U.fmtNum(ebit) + ', finance cost ' + U.fmtNum(fc), fa: 'سود عملیاتی ' + U.fmtNum(ebit) + '، هزینهٔ مالی ' + U.fmtNum(fc) } : { en: 'off', fa: 'خاموش' }),
      L('capital', 'Capital ceiling: registered capital × multiple − sukuk outstanding (SEO practice)', 'سقف سرمایه: سرمایهٔ ثبتی × ضریب − اوراق در جریان (رویهٔ اجرایی سازمان بورس)', I.capCeil, isFinite(I.capCeil), isFinite(I.capCeil) ? null : { en: 'capital not found: enter it', fa: 'سرمایه پیدا نشد: وارد کنید' }),
      L('route', 'Instrument asset base / credit route', 'پایهٔ دارایی ابزار / مسیر اعتباری', I.routeMax, isFinite(I.routeMax), I.routeNote || (isFinite(I.routeMax) ? null : { en: 'not entered: not applied', fa: 'وارد نشده: اعمال نشد' })),
      L('cash', 'Repayment from operating cash flow (after finance cost, non-renewed facilities and dividends)', 'بازپرداخت از محل جریان نقد عملیاتی (پس از هزینهٔ مالی، اقساط تمدیدنشده و سود تقسیمی)', hasCF ? (cfoPos ? xCash : 0) : NaN, hasCF && !cfoPos,
        !hasCF ? { en: 'no operating cash flow given', fa: 'جریان نقد عملیاتی وارد نشده' } : cfoPos ? { en: 'warning only: CFO over two years is positive (SEO test met)', fa: 'فقط هشدار: جمع جریان نقد عملیاتی دو سال مثبت است (شرط سازمان برقرار)' } : { en: 'applied: CFO over two years is not positive — originator test fails without a bank guarantee', fa: 'اعمال شد: جمع جریان نقد عملیاتی دو سال مثبت نیست — بدون ضمانت بانکی شرط بانی برقرار نیست' })];
    var app = lim.filter(function (x) { return x.applied; });
    var rec = app.length ? Math.max(0, Math.min.apply(null, app.map(function (x) { return isFinite(x.v) ? x.v : Infinity; }))) : NaN; if (!isFinite(rec)) rec = NaN;
    var bind = app.filter(function (x) { return x.v === rec; })[0] || null;
    // before / after the issue at the recommended amount (proceeds assumed spent on assets, not held as cash)
    var X = isFinite(rec) ? rec : 0, debt = n('debt'), cash = n('cash'), eq = n('equity'), ta = n('ta'), sales = n('sales');
    var cpn = X * r, pbtA = pbt0 - cpn, niA = pbtA * (1 - t), pbtC = pbt - cpn, niC = pbtC * (1 - t);
    var row = function (en, fa, b, a, lim0, fmt, good) { return { label: { en: en, fa: fa }, before: b, after: a, limit: lim0, fmt: fmt, ok: good == null ? null : good }; };
    var ratio = function (a, b) { return b ? a / b : NaN; };
    var ndE0 = ratio(debt - cash, ebitda), ndE1 = ratio(debt + X - cash, ebitda), de0 = ratio(debt, eq), de1 = ratio(debt + X, eq), ds0 = ratio(debt, sales), ds1 = ratio(debt + X, sales);
    var la0 = ta ? (ta - eq) / ta : NaN, la1 = ta ? (ta - eq + X) / (ta + X) : NaN, ec0 = ratio(ebitda, fc), ec1 = ratio(ebitda, fc + cpn), ic0 = ratio(ebit, fc), ic1 = ratio(ebit, fc + cpn);
    var cc1 = hasCF ? ratio(cfo, fc + cpn + E + X / T) : NaN;
    var after = [
      row('Interest-bearing debt', 'بدهی بهره‌دار', debt, debt + X, '', 'num'), row('Sukuk / sales', 'اوراق / فروش', 0, ratio(X, sales), '', 'pct'),
      row('Debt / sales', 'بدهی بهره‌دار / فروش', ds0, ds1, '', 'pct'),
      row('Net debt / EBITDA', 'بدهی خالص / EBITDA', ndE0, ndE1, '≤ ' + n('maxNd') + 'x', 'x', !(n('maxNd') > 0) || ndE1 <= n('maxNd')),
      row('Debt / equity', 'بدهی / حقوق مالکانه', de0, de1, '≤ ' + n('maxDE') + 'x', 'x', !(n('maxDE') > 0) || de1 <= n('maxDE')),
      row('Liabilities / assets (SEO originator test)', 'بدهی‌ها / دارایی‌ها (شرط بانی سازمان)', la0, la1, '≤ 90%', 'pct', !isFinite(la1) || la1 <= 0.9),
      row('EBIT / finance cost', 'سود عملیاتی / هزینهٔ مالی', ic0, ic1, kE > 0 ? '≥ ' + kE + 'x' : '', 'x', kE > 0 ? ic1 >= kE - 1e-9 : null),
      row('EBITDA / finance cost', 'EBITDA / هزینهٔ مالی', ec0, ec1, n('minEbitda') > 0 ? '≥ ' + n('minEbitda') + 'x' : '', 'x', n('minEbitda') > 0 ? ec1 >= n('minEbitda') : null),
      row('Profit before tax', 'سود قبل از مالیات', pbt0, pbtA, '> 0', 'num', pbtA > 0), row('Net income', 'سود خالص', ni0, niA, '> 0', 'num', niA > 0),
      row('Operating cash flow / debt service', 'جریان نقد عملیاتی / خدمت بدهی', hasCF ? ratio(cfo, fc + E) : NaN, cc1, n('minDscr') > 0 ? '≥ ' + n('minDscr') + 'x' : '', 'x', hasCF && n('minDscr') > 0 ? cc1 >= n('minDscr') : null)];
    var yr = { X: X, coupon: cpn, pbtAfter: pbtC, tax: pbtC * t, niAfter: niC, dividends: niC * d, retained: niC * (1 - d), principal: X / T, facilities: E, surplus: niC * (1 - d) - X / T - E };
    return { limits: lim, rec: rec, bind: bind, after: after, yr: yr, xRenew: xRenew, ebit: ebit, fc: fc, cfo: cfo, cfo2: n('cfo2'), capCeil: I.capCeil, routeMax: I.routeMax, coreOnly: !!I.coreOnly, nonOp: nonOp, roll: Math.max(0, Math.min(1, n('roll'))), rollKnown: I.rollKnown !== false, curDebt: n('curDebt'), t: t, keep: keep, E: E, pbt: pbt, pbt0: pbt0, ni: ni0, rate: r, T: T, payout: d, kP: kP, kE: kE, xRepay: xRepay, xCoupon: xCoupon, xEbit: xEbit, xCash: xCash, hasCF: hasCF, cfoPos: cfoPos, strict: Math.min(isFinite(rec) ? rec : Infinity, hasCF ? xCash : Infinity) };
  }
  function limitTable(C, h, fa, tx) {
    return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['Limit', 'Amount', 'Used', 'Note'].map(thMap([2, 3])))]),
      h('tbody', null, C.limits.map(function (x) { var b = C.bind && C.bind.key === x.key; return h('tr', { class: b ? 'fit-rec' : x.applied ? '' : 'fit-no' }, [h('td', { 'data-notr': '1' }, [b ? h('strong', { text: tx(x.label) }) : document.createTextNode(tx(x.label))]),
        h('td', { class: 'num', text: isFinite(x.v) ? U.fmtNum(Math.max(0, x.v)) : '–' }), h('td', { text: x.applied ? (b ? (fa() ? 'محدودکننده' : 'binding') : (fa() ? 'بله' : 'yes')) : (fa() ? 'خیر' : 'no') }),
        h('td', { 'data-notr': '1', class: 'small', text: x.note ? tx(x.note) : '' })]); }).concat([h('tr', { class: 'flag' }, [h('td', null, [h('strong', { text: fa() ? 'ظرفیت پیشنهادی = کمترین مبلغ اعمال‌شده' : 'Recommended = the lowest applied amount' })]), h('td', { class: 'num' }, [h('strong', { text: isFinite(C.rec) ? U.fmtNum(C.rec) : '–' })]), h('td', null, []), h('td', null, [])])]))]),
      C.E > 0 ? h('p', { class: 'f-help', 'data-notr': '1', text: fa() ? 'تسهیلات فعلی: ' + U.fmtNum(C.curDebt) + ' سررسید زیر یک سال، با فرض تمدید ' + U.fmtPct(C.roll, 0) + (C.rollKnown ? '' : ' (سابقهٔ تمدید در صورت جریان نقد پیدا نشد؛ نرخ تمدید را در «حدود» وارد کنید)') + ' ⇒ ' + U.fmtNum(C.E) + ' در سال از سود کم می‌شود. اگر تسهیلات کامل تمدید شوند، ظرفیت بازپرداخت از محل سود ' + U.fmtNum(C.xRenew) + ' است.' : 'Existing facilities: ' + U.fmtNum(C.curDebt) + ' due within a year, ' + U.fmtPct(C.roll, 0) + ' assumed renewed' + (C.rollKnown ? '' : ' (no renewal history in the cash flow statement; set the renewal share in Limits)') + ' ⇒ ' + U.fmtNum(C.E) + ' a year is taken from profit. If facilities are renewed in full, repayment capacity from profit is ' + U.fmtNum(C.xRenew) + '.' }) : null]);
  }
  function afterTable(C, h, fa, tx) {
    var f = function (v, k) { return !isFinite(v) ? '–' : k === 'num' ? U.fmtNum(v) : k === 'pct' ? U.fmtPct(v, 1) : v.toFixed(2) + 'x'; };
    return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['Item', 'Now', 'After the issue', 'Your limit', 'Status'].map(thMap([4])))]),
      h('tbody', null, C.after.map(function (r) { return h('tr', null, [h('td', { 'data-notr': '1', text: tx(r.label) }), h('td', { class: 'num', text: f(r.before, r.fmt) }), h('td', { class: 'num', text: f(r.after, r.fmt) }), h('td', { class: 'num', text: r.limit }),
        h('td', { text: r.ok == null ? '' : r.ok ? (fa() ? 'برقرار' : 'met') : (fa() ? 'برقرار نیست' : 'not met'), class: r.ok === false ? 'neg' : '' })]); }))])]);
  }
  function yearView(C, h, fa) {
    var y = C.yr, f = U.fmtNum;
    var rows = [[fa() ? 'سود قبل از مالیات (پیش از سود اوراق)' + (C.pbt !== C.pbt0 ? ' — فقط عملیاتی' : '') : 'PBT before the coupon' + (C.pbt !== C.pbt0 ? ' — operating only' : ''), f(C.pbt)], [fa() ? 'سود سالانهٔ اوراق' : 'Annual coupon', f(y.coupon)], [fa() ? 'سود قبل از مالیات پس از اوراق' : 'PBT after the coupon', f(y.pbtAfter)],
      [fa() ? 'مالیات (نرخ مؤثر ' + U.fmtPct(C.t, 1) + ')' : 'Tax (effective ' + U.fmtPct(C.t, 1) + ')', f(y.tax)], [fa() ? 'سود خالص پس از اوراق' : 'Net income after the coupon', f(y.niAfter)], [fa() ? 'سود تقسیمی' : 'Dividends', f(y.dividends)],
      [fa() ? 'سود انباشته‌شدهٔ سالانه' : 'Retained each year', f(y.retained)], [fa() ? 'اندوختن سالانه برای اصل اوراق (مبلغ ÷ مدت؛ اصل در سررسید پرداخت می‌شود)' : 'Set aside each year for the principal (amount ÷ tenor; paid at maturity)', f(y.principal)], [fa() ? 'اقساط تمدیدنشدهٔ تسهیلات فعلی' : 'Existing facilities not renewed', f(y.facilities)], [fa() ? 'مازاد سالانه' : 'Annual surplus', f(y.surplus)]];
    return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('tbody', null, rows.map(function (r, i) { return h('tr', { class: i === rows.length - 1 ? 'flag' : '' }, [h('td', { 'data-notr': '1', text: r[0] }), h('td', { class: 'num', text: r[1] })]); }))]),
      h('p', { class: 'f-help', 'data-notr': '1', text: fa() ? 'در مبلغ ظرفیت پیشنهادی (' + f(y.X) + '). فرمول بازپرداخت: X = (PBT × q − E) ÷ (r × q + 1/T)، q = (۱ − مالیات) × (۱ − تقسیم سود)، E = تسهیلات سررسید زیر یک سال × (۱ − نرخ تمدید).' : 'At the recommended amount (' + f(y.X) + '). Repayment formula: X = (PBT × q − E) ÷ (r × q + 1/T), q = (1 − tax)(1 − payout), E = facilities due within a year × (1 − renewal share).' })]);
  }

  /* ---------- manual capacity: the essential figures only ----------
     Required conditions (SEO): liabilities / assets ≤ 90% (95% banks and leasing) on the last audited statements;
     operating cash flow over the last two years > 0 (both are originator tests; without them only a CBI-approved bank guarantee helps);
     small and short-term issue: ≤ 2,000 bn rials and ≤ 18 months.
     Limits (the lowest applies): capital ceiling (capital × multiple − outstanding), liabilities / assets after the issue ≤ cap
     ((TL + X) ÷ (TA + X) ≤ c  →  X ≤ (c·TA − TL) ÷ (1 − c)), interest cover after the issue (EBIT ÷ (finance cost + X·r) ≥ k),
     repayment from profit over the tenor (B·q ≥ X·r·q + X ÷ T, B = PBT if entered else EBIT − finance cost, q = (1 − tax)(1 − payout)),
     the small-issue cap. */
  // symbols used in the capacity formulas (shown in the quick tab and the Excel method sheet)
  var SYMS = [
    ['X', 'Sukuk amount to be issued (the unknown being solved for)', 'مبلغ اوراق قابل انتشار (مجهولی که حل می‌شود)'],
    ['r', 'Annual sukuk profit rate', 'نرخ سود سالانهٔ اوراق'],
    ['X × r', 'Annual sukuk profit (interest) to pay', 'سود (بهرهٔ) سالانهٔ اوراق'],
    ['T', 'Tenor in years = months ÷ 12', 'مدت اوراق به سال = ماه ÷ ۱۲'],
    ['k', 'Minimum interest cover you require after the issue: EBIT ÷ (current finance cost + X × r) ≥ k. Your policy input, not a legal number (1.5 = operating profit 1.5 times all interest)', 'حداقل پوشش بهره پس از انتشار که خودتان تعیین می‌کنید: سود عملیاتی ÷ (هزینهٔ مالی فعلی + X × r) ≥ k. ورودی سیاستی است، نه عدد قانونی (۱٫۵ یعنی سود عملیاتی ۱٫۵ برابر کل بهره)'],
    ['c', 'Liabilities / assets cap: 90% ordinary companies, 95% banks and leasing (SEO originator condition)', 'سقف نسبت بدهی به دارایی: ۹۰٪ شرکت‌های عادی، ۹۵٪ بانک و لیزینگ (شرط ناشر نزد سازمان بورس)'],
    ['q', 'Share of profit that stays in the company = (1 − tax) × (1 − payout)', 'سهم سود ماندگار در شرکت = (۱ − نرخ مالیات) × (۱ − نسبت تقسیم سود)'],
    ['B', 'Repayment base: profit before tax if entered, otherwise EBIT − current finance cost', 'مبنای بازپرداخت: سود قبل از مالیات اگر وارد شده، وگرنه سود عملیاتی − هزینهٔ مالی فعلی'],
    ['EBIT', 'Operating profit (before finance cost)', 'سود عملیاتی (پیش از هزینهٔ مالی)'],
    ['FC', 'Finance cost of the last reported year (existing interest)', 'هزینهٔ مالی آخرین سال (بهرهٔ بدهی‌های فعلی)'],
    ['TA, TL', 'Total assets, total liabilities', 'جمع دارایی‌ها، جمع بدهی‌ها'],
    ['multiple', 'Capital ceiling multiple: sukuk outstanding + X ≤ multiple × registered capital', 'ضریب سقف سرمایه: اوراق در جریان + X ≤ ضریب × سرمایهٔ ثبتی'],
    ['t, d, E (statements model)', 't = effective tax = 1 − NI ÷ PBT; d = dividend payout; E = facilities due within a year × (1 − share renewed)', 't = مالیات مؤثر = ۱ − سود خالص ÷ سود قبل از مالیات؛ d = نسبت تقسیم سود؛ E = تسهیلات سررسید زیر یک سال × (۱ − سهم تمدید)'],
    ['kP, kE (statements model)', 'kP = minimum cover of the sukuk profit by PBT; kE = minimum EBIT cover of all interest after the issue', 'kP = حداقل پوشش سود اوراق با سود قبل از مالیات؛ kE = حداقل پوشش کل بهره با سود عملیاتی پس از انتشار']];
  function symTable(h) { var F = fa(); return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, [h('th', { class: 'lbl', text: F ? 'نماد' : 'Symbol' }), h('th', { class: 'lbl', text: F ? 'تعریف' : 'Definition' })])]), h('tbody', null, SYMS.map(function (x) { return h('tr', null, [h('td', { 'data-notr': '1', text: x[0] }), h('td', { 'data-notr': '1', class: 'small', style: 'white-space:normal', text: F ? x[2] : x[1] })]); }))])]); }
  function mDefault() { return { unit: 'million', ctype: 'normal', ta: 0, tl: 0, eq: 0, cap: 0, cfo1: 0, cfo2: 0, ebit: 0, fc: 0, pbt: null, rate: 0.23, months: 48, type: 'normal', cover: 1.5, out: 0, capMult: 1, tax: 0.25, payout: 0 }; }
  var UNIT_PER_BN = { thousand: 1e6, million: 1e3, billion: 1 };
  function simpleCap(m) {
    var n = function (k) { var v = num(m[k]); return k === 'fc' || k === 'ta' || k === 'tl' || k === 'cap' || k === 'out' ? Math.abs(v) : v; }, ta = n('ta'), tl = n('tl'), eq = n('eq') || (ta - tl), cap = n('cap'), r = n('rate'), T = Math.max(1, n('months')) / 12;
    var c = m.ctype === 'bank' ? 0.95 : 0.9, k = n('cover') > 0 ? n('cover') : 1, mult = n('capMult') > 0 ? n('capMult') : 1, keep = (1 - Math.min(0.9, n('tax'))) * (1 - Math.min(0.95, n('payout')));
    var L = function (key, en, fa, v, applied, note) { return { key: key, label: { en: en, fa: fa }, v: v, applied: applied, note: note || null }; };
    var cfoSum = n('cfo1') + n('cfo2'), la0 = ta ? tl / ta : NaN, smallCap = 2000 * (UNIT_PER_BN[m.unit] || 1e3);
    var blocked = [];
    if (isFinite(la0) && la0 > c) blocked.push({ en: 'liabilities / assets ' + U.fmtPct(la0, 1) + ' > ' + U.fmtPct(c, 0) + ' (needs a CBI-approved bank guarantee)', fa: 'نسبت بدهی به دارایی ' + U.fmtPct(la0, 1) + ' > ' + U.fmtPct(c, 0) + ' (فقط با ضمانت بانکی مورد تأیید بانک مرکزی)' });
    if ((n('cfo1') || n('cfo2')) && !(cfoSum > 0)) blocked.push({ en: 'operating cash flow over two years not positive (' + U.fmtNum(cfoSum) + ')', fa: 'جمع جریان نقد عملیاتی دو سال مثبت نیست (' + U.fmtNum(cfoSum) + ')' });
    if (m.type === 'small' && n('months') > 18) blocked.push({ en: 'small and short-term sukuk: tenor ' + n('months') + ' months > 18', fa: 'اوراق کوچک و کوتاه‌مدت: مدت ' + n('months') + ' ماه بیش از ۱۸ ماه است' });
    var xLA = ta > 0 ? Math.max(0, (c * ta - tl) / (1 - c)) : NaN;
    var xCov = r > 0 && n('ebit') > 0 ? Math.max(0, (n('ebit') / k - n('fc')) / r) : (n('ebit') > 0 ? Infinity : 0);
    // repayment base: profit before tax if given (includes recurring non-operating income), else EBIT − finance cost
    var pbtGiven = m.pbt !== null && m.pbt !== undefined && m.pbt !== '' && isFinite(num(m.pbt)), prof = pbtGiven ? num(m.pbt) : n('ebit') - n('fc'), xRep = r > 0 && prof > 0 ? Math.max(0, prof * keep / (r * keep + 1 / T)) : 0;
    var xCap = cap > 0 ? Math.max(0, mult * cap - n('out')) : NaN;
    var lim = [
      L('capital', 'Capital ceiling: registered capital × ' + mult + ' − sukuk outstanding (SEO practice)', 'سقف سرمایه: سرمایهٔ ثبتی × ' + mult + ' − اوراق در جریان (رویهٔ اجرایی سازمان)', xCap, cap > 0, cap > 0 ? null : { en: 'enter the registered capital', fa: 'سرمایهٔ ثبتی را وارد کنید' }),
      L('la', 'Liabilities / assets after the issue ≤ ' + Math.round(c * 100) + '%', 'نسبت بدهی به دارایی پس از انتشار ≤ ' + Math.round(c * 100) + '٪', xLA, ta > 0, { en: '(' + c + ' × assets − liabilities) ÷ (1 − ' + c + ')', fa: '(' + c + ' × دارایی‌ها − بدهی‌ها) ÷ (۱ − ' + c + ')' }),
      L('cover', 'Interest cover after the issue ≥ ' + k + 'x at ' + U.fmtPct(r, 1), 'پوشش بهره پس از انتشار ≥ ' + k + ' برابر با نرخ ' + U.fmtPct(r, 1), xCov, n('ebit') !== 0 || n('fc') !== 0, { en: '(EBIT ÷ ' + k + ' − finance cost) ÷ rate', fa: '(سود عملیاتی ÷ ' + k + ' − هزینهٔ مالی) ÷ نرخ' }),
      L('repay', 'Repayment from ' + (pbtGiven ? 'profit before tax' : 'operating profit') + ' over ' + n('months') + ' months (coupon + principal)', 'بازپرداخت از محل ' + (pbtGiven ? 'سود قبل از مالیات' : 'سود عملیاتی') + ' طی ' + n('months') + ' ماه (سود و اصل اوراق)', xRep, n('ebit') !== 0 || pbtGiven, pbtGiven ? { en: 'PBT × q ÷ (rate × q + 1 ÷ years), q = (1 − tax)(1 − payout)', fa: 'سود قبل از مالیات × q ÷ (نرخ × q + ۱ ÷ سال)، q = (۱ − مالیات) × (۱ − تقسیم سود)' } : { en: '(EBIT − finance cost) × q ÷ (rate × q + 1 ÷ years), q = (1 − tax)(1 − payout)', fa: '(سود عملیاتی − هزینهٔ مالی) × q ÷ (نرخ × q + ۱ ÷ سال)، q = (۱ − مالیات) × (۱ − تقسیم سود)' }),
      L('small', 'Small and short-term cap: 2,000 bn rials (200 bn tomans)', 'سقف اوراق کوچک و کوتاه‌مدت: ۲٬۰۰۰ میلیارد ریال (۲۰۰ میلیارد تومان)', smallCap, m.type === 'small', m.type === 'small' ? { en: 'murabaha instruction, part 9; tenor ≤ 18 months', fa: 'دستورالعمل مرابحه، بخش ۹؛ سررسید ≤ ۱۸ ماه' } : { en: 'only for small and short-term issues', fa: 'فقط برای اوراق کوچک و کوتاه‌مدت' })];
    var app = lim.filter(function (x) { return x.applied; });
    var rec = app.length ? Math.max(0, Math.min.apply(null, app.map(function (x) { return isFinite(x.v) ? x.v : Infinity; }))) : NaN; if (!isFinite(rec)) rec = NaN;
    var bind = app.filter(function (x) { return x.v === rec; })[0] || null;
    if (blocked.length) rec = 0;
    var X = isFinite(rec) ? rec : 0, cpn = X * r;
    return { inp: { ta: ta, tl: tl, cap: cap, mult: mult, out: n('out'), ebit: n('ebit'), fc: n('fc'), r: r, T: T, months: n('months'), k: k, tax: Math.min(0.9, n('tax')), payout: Math.min(0.95, n('payout')), keep: keep, pbtGiven: pbtGiven, prof: prof, small: m.type === 'small', smallCap: smallCap, cfo1: n('cfo1'), cfo2: n('cfo2') },
      xs: { capital: xCap, la: xLA, cover: xCov, repay: xRep }, rec: rec, bind: blocked.length ? null : bind, blocked: blocked, limits: lim, X: X, coupon: cpn, laCap: c, eq: eq, cfoSum: cfoSum, laRoom: isFinite(xLA) ? Math.max(0, xLA - X) : NaN,
      unitFa: ({ thousand: fa() ? 'هزار ریال' : 'thousand rials', million: fa() ? 'میلیون ریال' : 'million rials', billion: fa() ? 'میلیارد ریال' : 'billion rials' })[m.unit],
      r: { la0: la0, la1: ta ? (tl + X) / (ta + X) : NaN, de0: eq ? tl / eq : NaN, de1: eq ? (tl + X) / eq : NaN, ic0: n('fc') ? n('ebit') / n('fc') : NaN, ic1: n('fc') + cpn ? n('ebit') / (n('fc') + cpn) : NaN } };
  }

  /* ---------- annual profit (interest) the company pays on the recommended issue ----------
     coupon per year = outstanding × rate; bullet: the same every year, principal at maturity;
     equal instalments: principal ÷ years each year and the coupon falls with the balance. */
  function interestPlan(X, r, years, freq, amort, fcNow, trueRate, issueDate) {
    // one row per coupon payment: profit = amount × rate ÷ payments a year; principal in one sum with the last payment (maturity)
    var f = Math.max(1, freq || 4), months = Math.max(1, Math.round(years * 12)), step = 12 / f, n = Math.max(1, Math.round(months / step)), pays = [], J = Hub.jalali, d0 = NaN;
    try { d0 = issueDate ? J.parse(issueDate) : NaN; } catch (e) { d0 = NaN; }
    var dj = isFinite(d0) ? J.d2j(d0) : null;
    for (var k = 1; k <= n; k++) {
      var mo = Math.min(months, Math.round(k * step)), prevMo = Math.round((k - 1) * step), cpn = X * r * (mo - prevMo) / 12, prin = k === n ? X : 0;
      var date = dj ? (function () { var x = J.jAdd(dj.jy, dj.jm, dj.jd, mo); return J.jstr(J.j2d(x[0], x[1], x[2])); })() : '';
      pays.push({ k: k, month: mo, date: date, interest: cpn, principal: prin, total: cpn + prin, year: Math.ceil(mo / 12) });
    }
    var byY = {}; pays.forEach(function (p) { var y = byY[p.year] = byY[p.year] || { y: p.year, interest: 0, principal: 0, total: 0 }; y.interest += p.interest; y.principal += p.principal; y.total += p.total; });
    var rows = Object.keys(byY).map(Number).sort(function (a, b) { return a - b; }).map(function (y) { return byY[y]; });
    var totI = pays.reduce(function (a, p) { return a + p.interest; }, 0);
    return { X: X, r: r, years: months / 12, months: months, f: f, annual: X * r, perPay: X * r / f, totalInterest: totI, totalPaid: totI + X, pays: pays, rows: rows, fcNow: fcNow, fcAfter: fcNow + X * r, trueRate: trueRate, trueAnnual: isFinite(trueRate) ? X * trueRate : NaN };
  }
  function interestView(P, h) {
    var N = U.fmtNum, F = fa(), pc = function (v) { return isFinite(v) ? U.fmtPct(v, 2) : '–'; };
    var per = { 1: F ? 'سالانه' : 'annual', 2: F ? 'شش‌ماهه' : 'semi-annual', 4: F ? 'سه‌ماهه' : 'quarterly', 12: F ? 'ماهانه' : 'monthly' }[P.f] || P.f;
    var sum = [
      [F ? 'مبلغ انتشار (ظرفیت پیشنهادی)' : 'Issue amount (recommended capacity)', N(P.X)], [F ? 'نرخ سود اوراق' : 'Sukuk profit rate', pc(P.r)],
      [F ? 'سود (بهره) سالانهٔ اوراق = مبلغ × نرخ' : 'Annual sukuk profit (interest) = amount × rate', N(P.annual)],
      [(F ? 'هر پرداخت ' : 'Each ') + per + (F ? ' (سود سالانه ÷ ' + P.f + ')' : ' payment (annual ÷ ' + P.f + ')'), N(P.perPay)],
      [F ? 'جمع سود طی ' + P.months + ' ماه (' + P.pays.length + ' کوپن)' : 'Total profit over ' + P.months + ' months (' + P.pays.length + ' coupons)', N(P.totalInterest)], [F ? 'جمع پرداخت (اصل + سود)' : 'Total paid (principal + profit)', N(P.totalPaid)],
      [F ? 'هزینهٔ مالی فعلی شرکت' : 'Company finance cost now', N(P.fcNow)], [F ? 'هزینهٔ مالی سالانه پس از انتشار' : 'Annual finance cost after the issue', N(P.fcAfter)]];
    if (isFinite(P.trueAnnual)) sum.push([F ? 'معادل هزینهٔ سالانه با کارمزد ارکان (مبلغ × هزینهٔ واقعی بانی ' + pc(P.trueRate) + '، روش ytm)' : 'Annual-equivalent cost including fees (amount × true issuer cost ' + pc(P.trueRate) + ', ytm method)', N(P.trueAnnual)]);
    return h('div', { 'data-notr': '1' }, [
      h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('tbody', null, sum.map(function (r, i) { return h('tr', { class: i === 2 ? 'flag' : '' }, [h('td', { text: r[0] }), h('td', { class: 'num' }, [i === 2 ? h('strong', { text: r[1] }) : document.createTextNode(r[1])])]); }))])]),
      h('h3', { text: F ? 'جدول پرداخت‌ها (هر کوپن)' : 'Payment schedule (each coupon)' }),
      h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, (F ? ['پرداخت', 'ماه از انتشار', 'تاریخ (تقریبی)', 'سود (بهره)', 'اصل', 'جمع پرداخت'] : ['Payment', 'Month from issue', 'Date (approx.)', 'Profit (interest)', 'Principal', 'Total paid']).map(thMap([])))]),
        h('tbody', null, P.pays.map(function (p) { return h('tr', { class: p.principal ? 'flag' : '' }, [h('td', { text: String(p.k) }), h('td', { class: 'num', text: String(p.month) }), h('td', { class: 'num', text: p.date || '–' }), h('td', { class: 'num', text: N(p.interest) }), h('td', { class: 'num', text: N(p.principal) }), h('td', { class: 'num', text: N(p.total) })]); })
          .concat([h('tr', { class: 'flag' }, [h('td', { text: F ? 'جمع' : 'Total' }), h('td', null, []), h('td', null, []), h('td', { class: 'num', text: N(P.totalInterest) }), h('td', { class: 'num', text: N(P.X) }), h('td', { class: 'num', text: N(P.totalPaid) })])]))])]),
      h('h3', { text: F ? 'جمع پرداخت در هر سال (از تاریخ انتشار)' : 'Paid in each year (from the issue date)' }),
      h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, (F ? ['سال', 'سود (بهره)', 'اصل', 'جمع پرداخت'] : ['Year', 'Profit (interest)', 'Principal', 'Total paid']).map(thMap([])))]),
        h('tbody', null, P.rows.map(function (r) { return h('tr', null, [h('td', { text: String(r.y) + (r.y * 12 > P.months ? (F ? ' (' + (P.months - (r.y - 1) * 12) + ' ماه)' : ' (' + (P.months - (r.y - 1) * 12) + ' months)') : '') }), h('td', { class: 'num', text: N(r.interest) }), h('td', { class: 'num', text: N(r.principal) }), h('td', { class: 'num', text: N(r.total) })]); }))])]),
      h('p', { class: 'f-help', text: F ? 'اصل اوراق یکجا در پایان دوره (سررسید)، همراه آخرین کوپن، پرداخت می‌شود؛ تا آن زمان هر کوپن = مبلغ × نرخ ÷ تعداد پرداخت در سال. تاریخ‌ها بدون تعدیل روز کاری‌اند. سود با نرخ اسمی حساب شده؛ تاریخ دقیق هر پرداخت و اثر کارمزدها در زبانهٔ «هزینهٔ اوراق (ytm)».' : 'Sukuk principal is repaid in one sum at the end of the term (maturity), with the last coupon; until then each coupon = amount × rate ÷ payments a year. Dates are not business-day adjusted. Profit at the nominal rate; exact payment dates and the effect of fees on the Sukuk cost (ytm) tab.' })]);
  }

  /* ---------- "how the capacity was calculated": every step with your numbers ---------- */
  function stepsView(steps, rec, bind, blocked, h) {
    var N = U.fmtNum;
    var items = steps.map(function (st, i) {
      return h('li', { class: st.applied ? (bind && bind === st.key ? 'step-bind' : '') : 'muted' }, [
        h('strong', { text: st.title }), h('div', { class: 'small', text: st.formula }), st.subst ? h('div', { class: 'small', style: 'direction:ltr;text-align:left', text: st.subst }) : null,
        st.key === 'cond' ? h('div', null, [h('strong', { text: st.why, class: /نیست|not/.test(st.why) ? 'neg' : 'pos' })]) : h('div', null, [document.createTextNode((fa() ? 'نتیجه: ' : 'Result: ')), h('strong', { text: st.applied ? (isFinite(st.v) ? N(Math.max(0, st.v)) : '∞') : (fa() ? 'اعمال نشد' : 'not applied') }), st.why ? document.createTextNode(' — ' + st.why) : null])]); });
    var concl = blocked && blocked.length ? (fa() ? 'شرط لازم برقرار نیست (' + blocked.map(tx).join('؛ ') + ') ⇒ ظرفیت = ۰.' : 'A required condition fails (' + blocked.map(tx).join('; ') + ') ⇒ capacity = 0.')
      : (fa() ? 'ظرفیت پیشنهادی = کمترین نتیجهٔ مراحل اعمال‌شده = ' : 'Recommended capacity = the lowest result among the applied steps = ') + (isFinite(rec) ? N(rec) : '–') + (bind ? (fa() ? ' (محدودکننده: مرحلهٔ «' : ' (binding: “') + (steps.filter(function (x) { return x.key === bind; })[0] || {}).title + (fa() ? '»)' : '”)') : '');
    return h('div', { 'data-notr': '1' }, [h('ol', { class: 'steps' }, items), h('p', { class: 'flag-p' }, [h('strong', { text: concl })])]);
  }
  function simpleSteps(M) {
    var I = M.inp, x = M.xs, N = U.fmtNum, P = function (v) { return (v * 100).toFixed(2) + '%'; }, F = fa();
    var cPct = M.laCap;
    return [
      { key: 'cond', applied: true, v: NaN, title: F ? 'شرط‌های لازم (سازمان بورس)' : 'Required conditions (SEO)', formula: F ? 'بدهی‌ها ÷ دارایی‌ها ≤ ' + Math.round(cPct * 100) + '٪؛ جمع جریان نقد عملیاتی دو سال > ۰' + (I.small ? '؛ مدت ≤ ۱۸ ماه' : '') : 'liabilities ÷ assets ≤ ' + Math.round(cPct * 100) + '%; two-year operating cash flow > 0' + (I.small ? '; tenor ≤ 18 months' : ''),
        subst: N(I.tl) + ' ÷ ' + N(I.ta) + ' = ' + P(I.tl / I.ta) + ' ; ' + N(I.cfo1) + ' + ' + N(I.cfo2) + ' = ' + N(I.cfo1 + I.cfo2) + (I.small ? ' ; ' + I.months + ' ≤ 18' : ''), why: M.blocked.length ? (F ? 'برقرار نیست' : 'not met') : (F ? 'برقرار است' : 'met'), applied2: true },
      { key: 'capital', applied: I.cap > 0, v: x.capital, title: F ? 'سقف سرمایه' : 'Capital ceiling', formula: F ? 'سرمایهٔ ثبتی × ضریب − اوراق در جریان' : 'registered capital × multiple − sukuk outstanding', subst: N(I.cap) + ' × ' + I.mult + ' − ' + N(I.out) + ' = ' + N(x.capital) },
      { key: 'la', applied: I.ta > 0, v: x.la, title: F ? 'سقف نسبت بدهی به دارایی پس از انتشار' : 'Liabilities / assets after the issue', formula: F ? '(بدهی‌ها + X) ÷ (دارایی‌ها + X) ≤ c  ⇒  X ≤ (c × دارایی‌ها − بدهی‌ها) ÷ (۱ − c)' : '(liabilities + X) ÷ (assets + X) ≤ c  ⇒  X ≤ (c × assets − liabilities) ÷ (1 − c)',
        subst: '(' + cPct + ' × ' + N(I.ta) + ' − ' + N(I.tl) + ') ÷ (1 − ' + cPct + ') = ' + N(x.la) },
      { key: 'cover', applied: I.ebit !== 0 || I.fc !== 0, v: x.cover, title: F ? 'پوشش بهره پس از انتشار' : 'Interest cover after the issue', formula: F ? 'سود عملیاتی ÷ (هزینهٔ مالی + X × نرخ) ≥ k  ⇒  X ≤ (سود عملیاتی ÷ k − هزینهٔ مالی) ÷ نرخ' : 'EBIT ÷ (finance cost + X × rate) ≥ k  ⇒  X ≤ (EBIT ÷ k − finance cost) ÷ rate',
        subst: '(' + N(I.ebit) + ' ÷ ' + I.k + ' − ' + N(I.fc) + ') ÷ ' + P(I.r) + ' = ' + (isFinite(x.cover) ? N(x.cover) : '∞') },
      { key: 'repay', applied: I.ebit !== 0 || I.pbtGiven, v: x.repay, title: F ? 'بازپرداخت از محل ' + (I.pbtGiven ? 'سود قبل از مالیات' : 'سود عملیاتی') + ' طی مدت اوراق' : 'Repayment from ' + (I.pbtGiven ? 'profit before tax' : 'operating profit') + ' over the tenor',
        formula: (F ? 'سود باقی‌مانده پس از سود اوراق، مالیات و تقسیم سود باید اصل را طی T سال بپردازد: X ≤ B × q ÷ (نرخ × q + ۱ ÷ T)؛ q = (۱ − مالیات) × (۱ − تقسیم سود)؛ B = ' : 'profit left after the coupon, tax and dividends repays the principal over T years: X ≤ B × q ÷ (rate × q + 1 ÷ T); q = (1 − tax)(1 − payout); B = ') + (I.pbtGiven ? (F ? 'سود قبل از مالیات واردشده' : 'the profit before tax you entered') : (F ? 'سود عملیاتی − هزینهٔ مالی (سود قبل از مالیات وارد نشده)' : 'EBIT − finance cost (no profit before tax entered)')),
        subst: (I.pbtGiven ? N(I.prof) : '(' + N(I.ebit) + ' − ' + N(I.fc) + ')') + ' × ' + I.keep.toFixed(4) + ' ÷ (' + P(I.r) + ' × ' + I.keep.toFixed(4) + ' + 1 ÷ ' + (+I.T.toFixed(3)) + ') = ' + N(x.repay) + '   [q = (1 − ' + P(I.tax) + ') × (1 − ' + P(I.payout) + '), T = ' + I.months + ' ÷ 12]' },
      { key: 'small', applied: I.small, v: I.smallCap, title: F ? 'سقف اوراق کوچک و کوتاه‌مدت' : 'Small and short-term cap', formula: F ? '۲٬۰۰۰ میلیارد ریال (۲۰۰ میلیارد تومان)، به واحد شما' : '2,000 bn rials (200 bn tomans), in your unit', subst: N(I.smallCap) }];
  }
  function coreSteps(C) {
    var N = U.fmtNum, P = function (v) { return (v * 100).toFixed(2) + '%'; }, F = fa(), byKey = {}; C.limits.forEach(function (l) { byKey[l.key] = l; });
    var ap = function (k) { return !!(byKey[k] && byKey[k].applied); };
    return [
      { key: 'profit', applied: ap('profit'), v: C.xRepay, title: F ? 'بازپرداخت از محل سود' : 'Repayment from profit',
        formula: F ? 'X ≤ (سود قبل از مالیات × q − E) ÷ (نرخ × q + ۱ ÷ T)؛ q = (۱ − مالیات مؤثر) × (۱ − تقسیم سود)؛ مالیات مؤثر = ۱ − سود خالص ÷ سود قبل از مالیات؛ E = تسهیلات سررسید زیر یک سال × (۱ − نرخ تمدید)' : 'X ≤ (PBT × q − E) ÷ (rate × q + 1 ÷ T); q = (1 − effective tax)(1 − payout); effective tax = 1 − NI ÷ PBT; E = facilities due within a year × (1 − renewal share)',
        subst: '(' + N(C.pbt) + ' × ' + C.keep.toFixed(4) + ' − ' + N(C.E) + ') ÷ (' + P(C.rate) + ' × ' + C.keep.toFixed(4) + ' + 1 ÷ ' + (+C.T.toFixed(3)) + ') = ' + N(C.xRepay) + '   [t = ' + P(C.t) + ', d = ' + P(C.payout) + ', E = ' + N(C.curDebt) + ' × (1 − ' + P(C.roll) + ')' + (C.coreOnly && C.nonOp > 0 ? (F ? '، سود قبل از مالیات بدون غیرعملیاتی ' : ', PBT excl. non-operating ') + N(C.nonOp) : '') + ']' },
      { key: 'coupon', applied: ap('coupon'), v: C.xCoupon, title: F ? 'پرداخت سود اوراق از سود قبل از مالیات' : 'Coupon from profit before tax', formula: F ? 'X ≤ سود قبل از مالیات ÷ (حداقل پوشش × نرخ)' : 'X ≤ PBT ÷ (minimum cover × rate)', subst: N(C.pbt) + ' ÷ (' + C.kP + ' × ' + P(C.rate) + ') = ' + N(C.xCoupon) },
      { key: 'ebit', applied: ap('ebit'), v: C.xEbit, title: F ? 'پوشش بهره پس از انتشار' : 'Interest cover after the issue', formula: F ? 'X ≤ (سود عملیاتی ÷ k − هزینهٔ مالی) ÷ نرخ' : 'X ≤ (EBIT ÷ k − finance cost) ÷ rate', subst: '(' + N(C.ebit) + ' ÷ ' + C.kE + ' − ' + N(C.fc) + ') ÷ ' + P(C.rate) + ' = ' + (isFinite(C.xEbit) ? N(C.xEbit) : '–') },
      { key: 'capital', applied: ap('capital'), v: C.capCeil, title: F ? 'سقف سرمایه' : 'Capital ceiling', formula: F ? 'سرمایهٔ ثبتی × ضریب − اوراق در جریان' : 'registered capital × multiple − sukuk outstanding', subst: isFinite(C.capCeil) ? N(C.capCeil) : (F ? 'سرمایه پیدا نشد' : 'capital not found') },
      { key: 'route', applied: ap('route'), v: C.routeMax, title: F ? 'پایهٔ دارایی ابزار / مسیر اعتباری' : 'Instrument asset base / credit route', formula: F ? 'سقف بهترین ابزار واجد شرایط (زبانهٔ دارایی‌ها و وثایق)' : 'limit of the best eligible instrument (Assets tab)', subst: isFinite(C.routeMax) ? N(C.routeMax) : '–' },
      { key: 'cash', applied: ap('cash'), v: C.xCash, title: F ? 'بازپرداخت از محل جریان نقد عملیاتی' : 'Repayment from operating cash flow', formula: F ? 'X ≤ (جریان نقد عملیاتی − هزینهٔ مالی − E − سود تقسیمی) ÷ (نرخ + ۱ ÷ T) — فقط اگر جمع جریان نقد دو سال مثبت نباشد سقف است' : 'X ≤ (CFO − finance cost − E − dividends) ÷ (rate + 1 ÷ T) — a limit only if two-year CFO is not positive',
        subst: C.hasCF ? '(' + N(C.cfo) + ' − ' + N(C.fc) + ' − ' + N(C.E) + ' − ' + N(Math.max(0, C.ni) * C.payout) + ') ÷ (' + P(C.rate) + ' + 1 ÷ ' + (+C.T.toFixed(3)) + ') = ' + N(C.xCash) : '–', why: C.hasCF ? (C.cfoPos ? (F ? 'جمع جریان نقد دو سال مثبت است ⇒ فقط هشدار' : 'two-year CFO positive ⇒ warning only') : '') : '' }];
  }

  /* ---------- quick capacity: a few key figures in, a recommended amount out ---------- */
  function qDefault() { return { year: 1404, unit: 'million', revenue: 0, revenuePrev: 0, cogs: 0, ebit: 0, da: 0, finCost: 0, nonOp: 0, pbt: 0, pbtPrev: 0, ni: 0, niPrev: 0, payout: 0,
    cash: 0, ar: 0, inv: 0, ca: 0, ppe: 0, ta: 0, debtST: 0, debtLT: 0, sukukOut: 0, cl: 0, tl: 0, capital: 0, retained: 0, equity: 0, cfo: 0, cfoPrev: 0,
    iRate: 0, roll: 0.8, rate: 0.23, tenor: 4, amort: 'bullet', assetBase: 0, tax: 0.25, curShare: 0.6, debt: 0 }; }
  function qMigrate(q) {
    var d = qDefault(); Object.keys(d).forEach(function (k) { if (q[k] == null) q[k] = d[k]; });
    if (num(q.debt) > 0 && !num(q.debtST) && !num(q.debtLT)) { q.debtST = num(q.debt) * num(q.curShare); q.debtLT = num(q.debt) - q.debtST; q.debt = 0; }
    return q;
  }
  // total interest-bearing debt and the share due within a year, from the explicit lines
  function qDebt(q) { var st = num(q.debtST), lt = num(q.debtLT), sk = num(q.sukukOut); return { total: st + lt + sk, st: st, share: st + lt + sk > 0 ? st / (st + lt + sk) : 0 }; }
  /* the key figures as two-year statements (standard Codal labels), so the full model, the gates and the routes run on them */
  function quickBlocks(q) {
    var n = function (k) { return num(q[k]); }, y = Math.round(n('year')) || 1404, ys = [String(y - 1), String(y)];
    var pr = function (cur, prev) { return [prev || cur, cur]; }, g = n('revenuePrev') > 0 && n('revenue') > 0 ? n('revenuePrev') / n('revenue') : 1;
    // the hub's statement reader takes EBIT = revenue − cost of sales − expenses and EBITDA = EBIT + the depreciation line, so expenses include depreciation
    var rev = n('revenue'), cogs = n('cogs') || Math.max(0, rev - n('ebit') - n('da')), opex = rev - cogs - n('ebit');
    var pbt = n('pbt'), fin = n('finCost'), nonOp = pbt - n('ebit') + fin, tax = pbt - n('ni');
    var pbtP = n('pbtPrev') || pbt * g, niP = n('niPrev') || n('ni') * g, nonOpP = pbtP - n('ebit') * g + fin * g;
    var IS = [['درآمدهای عملیاتی', rev, n('revenuePrev') || rev], ['بهای تمام شده درآمدهای عملیاتی', -cogs, -cogs * g], ['هزینه های فروش، اداری و عمومی', -opex, -opex * g], ['هزینه استهلاک', -n('da'), -n('da') * g],
      ['هزینه های مالی', -fin, -fin * g], ['سایر درآمدها و هزینه های غیرعملیاتی', nonOp, nonOpP], ['هزینه مالیات بر درآمد', -tax, -(pbtP - niP)]];
    var Dq = qDebt(q), eq = n('equity') || (n('ta') - n('tl')), tl = n('tl') || (n('ta') - eq), cl = n('cl') || (Dq.st + Math.max(0, tl - Dq.total) * 0.7);
    var ca = n('ca') || (n('cash') + n('ar') + n('inv')), otherCA = Math.max(0, ca - n('cash') - n('ar') - n('inv')), otherNCA = Math.max(0, n('ta') - ca - n('ppe'));
    var otherCL = Math.max(0, cl - Dq.st), otherNCL = Math.max(0, tl - cl - n('debtLT') - n('sukukOut')), otherEq = eq - n('capital') - n('retained');
    var BS = [['موجودی نقد', n('cash'), 'دارایی های جاری'], ['دریافتنی های تجاری و سایر دریافتنی ها', n('ar'), 'دارایی های جاری'], ['موجودی مواد و کالا', n('inv'), 'دارایی های جاری'], ['سایر دارایی های جاری', otherCA, 'دارایی های جاری'],
      ['دارایی های ثابت مشهود', n('ppe'), 'دارایی های غیرجاری'], ['سایر دارایی های غیرجاری', otherNCA, 'دارایی های غیرجاری'], ['جمع دارایی ها', n('ta'), ''],
      ['تسهیلات مالی', Dq.st, 'بدهی های جاری'], ['پرداختنی های تجاری و سایر بدهی های جاری', otherCL, 'بدهی های جاری'], ['جمع بدهی های جاری', cl, ''],
      ['تسهیلات مالی بلندمدت', n('debtLT'), 'بدهی های غیرجاری'], ['اوراق منتشرشده', n('sukukOut'), 'بدهی های غیرجاری'], ['پرداختنی های بلندمدت', otherNCL, 'بدهی های غیرجاری'], ['جمع بدهی ها', tl, ''],
      ['سرمایه', n('capital'), 'حقوق مالکانه'], ['سود انباشته', n('retained'), 'حقوق مالکانه'], ['اندوخته ها و سایر اقلام حقوق مالکانه', otherEq, 'حقوق مالکانه'], ['جمع حقوق مالکانه', eq, ''], ['جمع حقوق مالکانه و بدهی ها', n('ta'), '']];
    var CF = [['نقد حاصل از عملیات', n('cfo'), n('cfoPrev') || n('cfo')]];
    var mk = function (type, title, rows) { return { type: type, title: title, titled: true, rows: rows.filter(function (r) { return r[1] || r[2]; }).map(function (r) { var v = type === 'BS' ? [r[1], r[1]] : [r[2], r[1]]; return { label: r[0], grp: type === 'BS' ? r[2] : '', vals: v, all: v }; }), years: ys, allYears: ys, end: 1 }; };
    var out = [mk('IS', 'صورت سود و زیان (ورود دستی)', IS), mk('BS', 'صورت وضعیت مالی (ورود دستی)', BS)]; if (n('cfo') || n('cfoPrev')) out.push(mk('CF', 'صورت جریان‌های نقدی (ورود دستی)', CF));
    return out;
  }
  // checks on the figures before building
  function quickChecks(q) {
    var n = function (k) { return num(q[k]); }, out = [], Dq = qDebt(q);
    if (n('ta') > 0 && n('tl') > 0 && n('equity') > 0 && Math.abs(n('ta') - n('tl') - n('equity')) > 0.01 * n('ta')) out.push({ en: 'Total assets ≠ liabilities + equity (difference ' + U.fmtNum(n('ta') - n('tl') - n('equity')) + ').', fa: 'جمع دارایی‌ها با بدهی‌ها + حقوق مالکانه برابر نیست (اختلاف ' + U.fmtNum(n('ta') - n('tl') - n('equity')) + ').' });
    if (n('pbt') && n('ni') > n('pbt')) out.push({ en: 'Net income is above profit before tax: check.', fa: 'سود خالص از سود قبل از مالیات بیشتر است: بررسی کنید.' });
    var nonOp = n('pbt') - n('ebit') + n('finCost'); if (n('nonOp') && Math.abs(nonOp - n('nonOp')) > Math.max(1, 0.02 * Math.abs(n('pbt')))) out.push({ en: 'EBIT − finance cost + non-operating ≠ PBT; the model uses PBT and treats the difference as non-operating (' + U.fmtNum(nonOp) + ').', fa: 'سود عملیاتی − هزینهٔ مالی + غیرعملیاتی با سود قبل از مالیات برابر نیست؛ مدل سود قبل از مالیات را مبنا می‌گیرد و اختلاف را غیرعملیاتی حساب می‌کند (' + U.fmtNum(nonOp) + ').' });
    var gq = n('revenuePrev') > 0 && n('revenue') > 0 ? n('revenuePrev') / n('revenue') : 1, pbtP = n('pbtPrev') || n('pbt') * gq;
    if (n('niPrev') > 0 && n('niPrev') > pbtP) out.push({ en: 'Prior-year net income is above prior-year profit before tax' + (n('pbtPrev') ? '' : ' (estimated from revenue growth: enter it)') + '.', fa: 'سود خالص سال قبل از سود قبل از مالیات سال قبل بیشتر است' + (n('pbtPrev') ? '' : ' (سود قبل از مالیات سال قبل از رشد فروش برآورد شده؛ آن را وارد کنید)') + '.' });
    if (n('tl') > 0 && Dq.total > n('tl')) out.push({ en: 'Interest-bearing debt is above total liabilities.', fa: 'بدهی بهره‌دار از جمع بدهی‌ها بیشتر است.' });
    if (n('capital') > 0 && n('retained') < 0 && -n('retained') >= 0.5 * n('capital')) out.push({ en: 'Accumulated losses ≥ half of capital: Commercial Code art. 141.', fa: 'زیان انباشته ≥ نصف سرمایه: مشمول مادهٔ ۱۴۱ اصلاحیهٔ قانون تجارت.' });
    return out;
  }
  function quickCap(q, fin) {
    qMigrate(q); var DQ = qDebt(q); q.debt = DQ.total; q.curShare = DQ.share;
    var n = function (k) { return num(q[k]); }, two = function (a, b) { return [b, a]; };
    var ebitda = n('ebit') + n('da'), hasCF = n('cfo') !== 0 || n('cfoPrev') !== 0;
    var D = { n: 2, years: ['Y-1', 'Y'], unit: 'million', ebit: two(n('ebit'), n('ebit')), ebitda: two(ebitda, ebitda), ie: two(-n('finCost'), -n('finCost')), ebt: two(n('pbt'), n('pbt')),
      ni: two(n('ni'), n('niPrev') || n('ni')), equity: two(n('equity'), n('equity')), debt: two(n('debt'), n('debt')), debtLike: [0, 0], cash: two(n('cash'), n('cash')), nonOp: two(n('nonOp'), n('nonOp')),
      ta: two(n('ta'), n('ta')), taFile: two(n('ta'), n('ta')), capital: two(n('capital'), n('capital')), retained: [NaN, NaN], revenue: two(n('revenue'), n('revenue')),
      cfo: hasCF ? two(n('cfo'), n('cfoPrev') || n('cfo')) : null,
      lines: { BS: [{ label: 'تسهیلات مالی', grp: 'بدهی‌های جاری', vals: [0, n('debt') * n('curShare')] }, { label: 'تسهیلات مالی بلندمدت', grp: 'بدهی‌های غیرجاری', vals: [0, n('debt') * (1 - n('curShare'))] }], CF: [] } };
    var F = Object.assign({}, fin || R.finDefaults(), { capital: n('capital'), sukukOut: n('sukukOut'), rollover: Math.max(0, Math.min(1, n('roll'))), iRate: n('iRate'), taxRate: n('tax'), capMult: num(fin && fin.capMult) || 1 });
    var rate = n('rate'), T = Math.max(1, n('tenor'));
    var Fa = R.finCapacity(D, F, rate, T, q.amort), Fe = R.finCapacity(D, Object.assign({}, F, { minDscr: 0, fullService: false }), rate, T, q.amort);
    var cfoB = !hasCF ? null : (fin && fin.cfoBasis === 'last') ? n('cfo') : (fin && fin.cfoBasis === 'min2') ? Math.min(n('cfo'), n('cfoPrev') || n('cfo')) : (n('cfo') + (n('cfoPrev') || n('cfo'))) / 2;
    var C = capCore({ sales: n('revenue'), ebit: n('ebit'), ebitda: ebitda, finCost: n('finCost'), nonOp: n('nonOp'), pbt: n('pbt'), ni: n('ni'), debt: n('debt'), curDebt: DQ.st, roll: n('roll'),
      cash: n('cash'), equity: n('equity'), ta: n('ta'), capCeil: n('capital') > 0 ? n('capital') * (num(fin && fin.capMult) || 1) - n('sukukOut') : NaN, routeMax: n('assetBase') > 0 ? n('assetBase') : NaN,
      cfo: cfoB, cfo2: n('cfo') + (n('cfoPrev') || n('cfo')), rate: rate, T: T, payout: n('payout'), kProfit: num(fin && fin.minProfitCover) || 1, kEbit: fin ? fin.minEbitCover : 1.5, minEbitda: fin ? fin.minEbitdaCover : 2,
      maxNd: fin ? fin.maxNdEbitda : 3.5, maxDE: fin ? fin.maxDE : 1.5, minDscr: fin ? fin.minDscr : 1.2, coreOnly: !!(fin && fin.coreOnly), taxIn: n('tax') });
    var liab = n('ta') > 0 ? n('ta') - n('equity') : NaN, lr = n('ta') > 0 ? liab / n('ta') : NaN;
    return { D: D, F: F, Fa: Fa, C: C, limits: C.limits, rec: C.rec, bind: C.bind, strict: C.strict, cfoPos: C.cfoPos, hasCF: hasCF, ebitda: ebitda, lr: lr, rate: rate,
      ratios: { margin: n('revenue') ? ebitda / n('revenue') : NaN, cover: n('finCost') ? ebitda / n('finCost') : NaN, nd: ebitda ? (n('debt') - n('cash')) / ebitda : NaN, de: n('equity') ? n('debt') / n('equity') : NaN, nonOp: n('pbt') ? n('nonOp') / n('pbt') : NaN } };
  }
  function quickFromCompany(q) {
    var rec = Hub.companyData && Hub.companyData.get(), D = rec && Hub.companyData.series(rec); if (!D) return false;
    var l = D.n - 1, B = R.borrowings ? R.borrowings(D) : null, p = l > 0 ? l - 1 : l, v = function (a, i) { return a && isFinite(a[i]) ? a[i] : 0; };
    q.year = Number(String(D.years[l]).replace(/\D/g, '').slice(0, 4)) || q.year;
    q.revenue = v(D.revenue, l); q.revenuePrev = v(D.revenue, p); q.cogs = Math.abs(v(D.cogs, l)); q.ebit = v(D.ebit, l); q.da = v(D.ebitda, l) - v(D.ebit, l); q.finCost = Math.abs(v(D.ie, l)); q.nonOp = v(D.nonOp, l);
    q.pbt = v(D.ebt, l); q.pbtPrev = v(D.ebt, p); q.ni = v(D.ni, l); q.niPrev = v(D.ni, p); q.cash = v(D.cash, l); q.ar = v(D.ar, l); q.inv = v(D.inv, l); q.ca = v(D.ca, l); q.ppe = v(D.ppe, l);
    q.ta = v(D.taFile, l) || v(D.ta, l); q.equity = v(D.equity, l); q.tl = q.ta - q.equity; q.cl = v(D.cl, l); q.capital = v(D.capital, l); q.retained = v(D.retained, l);
    q.cfo = v(D.cfo, l); q.cfoPrev = v(D.cfo, p);
    if (B && B.total > 0) { q.debtST = B.current; q.sukukOut = B.sukuk || 0; q.debtLT = Math.max(0, B.total - B.current - (B.sukuk || 0)); } else { q.debtST = v(D.debt, l); q.debtLT = 0; }
    q.unit = D.unit || q.unit; return true;
  }

  var YN = [['yes', 'Yes'], ['no', 'No']];
  TK.define({
    id: 'sukuk-capacity', title: 'Sukuk Issuance Capacity (SEO rules)', sections: ['bonds', 'financing'], priority: -5, version: 1, storeKey: 'hub.sukukcap.v1',
    summary: 'Upload the statements: originator tests of the ijara and murabaha instructions, credit routes (guarantor, rating without guarantor, pledged securities), small short-term murabaha, and the maximum issue per instrument, each with its article.',
    sample: sample, run: run, scenarios: false,
    fromCompany: function (S, M) { return fa() ? 'صورت‌های مالی برای امکان‌سنجی انتشار اوراق بارگذاری شد.' : 'Statements loaded for the sukuk capacity test.'; },
    eyebrow: function () { return 'Bond issuance · Sukuk capacity'; }, heading: function () { var r = Hub.companyData && Hub.companyData.get(); return r ? r.file : 'No statements loaded'; },
    filename: function () { return 'Sukuk_capacity'; },
    xlsx: function (S, A) { return build(root.ExcelJS, S, A); },
    kpis: function (ctx) { var A = function () { return ctx.R; }; return [
      ['Recommended issue capacity', function () { return A().empty ? '–' : A().noBS ? (fa() ? 'ترازنامه لازم است' : 'Balance sheet needed') : U.fmtNum(A().recMax); }, function () { if (A().empty) return ''; if (A().noBS) return fa() ? 'ترازنامه وارد نشده؛ آزمون‌های اهرم و سرمایه ممکن نیست' : 'no balance sheet imported'; var b = A().recBind; return (A().IP ? (fa() ? 'سود سالانه ' : 'annual profit ') + U.fmtNum(A().IP.annual) + ' · ' : '') + (isFinite(A().rate) ? U.fmtPct(A().rate, 1) + ' · ' : '') + (fa() ? 'محدودکننده: ' : 'binding: ') + (b ? tx(b.label).split(':')[0].split('(')[0].trim() : '–') + ' · ' + A().unit; }],
      ['Regulatory maximum', function () { return A().empty || !A().best ? '–' : U.fmtNum(A().regMax); }, function () { return A().empty || !A().best ? 'no eligible route yet' : A().capMissing ? (fa() ? 'سرمایه نامعلوم: سقف سرمایه اعمال نشده' : 'capital unknown: capital cap not applied') : tx(A().best.name).split('(')[0] + (isFinite(A().capPractice) && A().best.maxRaw ? (fa() ? '· سقف سرمایه' : '· capital cap') : ''); }],
      ['Originator tests', function () { return A().empty ? '–' : (A().conds.length - A().hard.length - A().softFail.length) + '/' + A().conds.length; }, function () { return 'passed'; }],
      ['Best credit route', function () { var b = !A().empty && A().best; return b && b.opts && b.opts[0] ? tx(b.opts[0].route.name) : '–'; }, function () { return 'by amount'; }]]; },
    tabs: [{ group: 'Sukuk', items: [['result', 'Eligibility and capacity', function (ctx) {
      var A = ctx.R, S0 = ctx.S;
      // start over: remove the imported statements and reset the answers, keeping your rate and limits
      // two-step confirmation inside the page (browser confirm dialogs are blocked in some embeds)
      var armed = false, clrBtn = h('button', { class: 'btn', type: 'button', text: 'Clear and enter a new company', onclick: function () {
        if (!armed) { armed = true; clrBtn.textContent = fa() ? 'برای تأیید پاک شدن صورت‌ها و پاسخ‌ها دوباره بزنید (نرخ و حدها می‌ماند)' : 'Click again to confirm: statements and answers are removed (rate and limits stay)'; clrBtn.classList.add('danger'); setTimeout(function () { armed = false; if (clrBtn.isConnected) { clrBtn.textContent = fa() ? 'پاک کردن و ورود شرکت جدید' : 'Clear and enter a new company'; clrBtn.classList.remove('danger'); } }, 6000); return; }
        Hub.companyData.clear(); S0.x = R.sample(); S0.x.company = ''; S0.fin.capital = 0; S0.fin.sukukOut = 0; S0.m = mDefault();
        U.toast(fa() ? 'پاک شد. صورت‌های جدید را از نوار «داده‌های شرکت» وارد کنید یا در زبانهٔ «ورود دستی ارقام مالی» بنویسید.' : 'Cleared. Import new statements from the Company data bar, or type them on the “Enter key figures” tab.', 'good');
        ctx.recompute ? ctx.recompute() : ctx.rerender();
      } }), clr = h('div', { class: 'row-actions' }, [clrBtn]);
      if (A.empty) return ctx.group([ctx.panel('Start', [clr, h('p', { class: 'muted', text: 'Use the Company data bar above: import the Excel or PDF statements (or paste the rows). Then answer the questions in the next tab: audit opinions, rating, guarantor, collateral and the assets you would use.' })])]);
      var main = A.inst.filter(function (i) { return i.status !== 'info'; }), other = A.inst.filter(function (i) { return i.status === 'info'; });
      var it = h('table', { class: 'grid aud sk' }, [h('thead', null, [h('tr', null, ['Instrument', 'Status', 'Maximum', 'Best credit route', 'Rules applied', 'Basis'].map(function (t) { return h('th', { class: 'lbl', text: t }); }))]),
        h('tbody', null, main.map(function (i) { return h('tr', null, [h('td', { 'data-notr': '1' }, [h('strong', { text: tx(i.name) })]), h('td', null, [h('span', { class: 'sev ' + ST[i.status][2], 'data-notr': '1', text: stTxt(i.status) })]),
          h('td', { class: 'num', text: isFinite(i.max) && i.max > 0 ? U.fmtNum(i.max) : '–' }), h('td', { 'data-notr': '1', text: i.opts && i.opts[0] ? tx(i.opts[0].route.name) : '–' }),
          h('td', { 'data-notr': '1', class: 'rules' }, [h('ul', { class: 'studio-l' }, i.points.map(function (p) { return h('li', { text: tx(p) }); }))]), h('td', { class: 'small muted', text: i.cite })]); }))]);
      var oth = h('ul', { class: 'studio-l', 'data-notr': '1' }, other.map(function (i) { return h('li', null, [h('strong', { text: tx(i.name) + ': ' }), document.createTextNode(tx(i.points[0]))]); }));
      var rt = h('table', { class: 'grid aud sk sk5' }, [h('thead', null, [h('tr', null, ['Credit route', 'Available', 'Cap from this route', 'Why', 'Basis'].map(function (t) { return h('th', { class: 'lbl', text: t }); }))]),
        h('tbody', null, A.routes.map(function (r) { return h('tr', null, [h('td', { 'data-notr': '1' }, [h('strong', { text: tx(r.name) })]), h('td', null, [h('span', { class: 'sev ' + (r.ok ? 'fit-rec' : 'fit-no'), text: r.ok ? 'Yes' : 'No' })]),
          h('td', { class: 'num', text: !r.ok ? '–' : isFinite(r.cap) ? U.fmtNum(r.cap) : 'guarantor’s limit' }), h('td', { 'data-notr': '1', class: 'rules' }, [h('ul', { class: 'studio-l' }, r.why.map(function (w) { return h('li', { text: tx(w) }); }))]), h('td', { class: 'small muted', text: r.cite })]); }))]);
      var ck = h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['Originator condition', 'Result', 'Evidence', 'Basis', 'Can be waived by'].map(function (t) { return h('th', { class: 'lbl', text: t }); }))]),
        h('tbody', null, A.conds.map(function (c) { return h('tr', null, [h('td', { 'data-notr': '1', text: tx(c.label) }), h('td', null, [h('span', { class: 'sev ' + (c.ok ? 'fit-rec' : c.waivedBy ? 'fit-cond' : 'fit-no'), text: c.ok ? 'Pass' : 'Fail' })]),
          h('td', { 'data-notr': '1', class: 'small', text: tx(c.detail) }), h('td', { class: 'small muted', text: c.cite }), h('td', { 'data-notr': '1', class: 'small', text: c.waivedBy ? tx(c.waivedBy) : '–' })]); }))]);
      var b = A.best, head = h('p', { class: 'f-help', 'data-notr': '1', text: b ? (fa() ? 'بیشترین مبلغ قابل انتشار با شرایط فعلی: ' + U.fmtNum(b.max) + ' ' + A.unit + ' (' + tx(b.name) + (b.opts && b.opts[0] ? '، ' + tx(b.opts[0].route.name) : '') + '). ارقام از آخرین سال واردشده (' + A.year + ') است؛ مرجع، آخرین صورت‌های حسابرسی‌شده است.' : 'Largest amount under the current answers: ' + U.fmtNum(b.max) + ' ' + A.unit + ' (' + tx(b.name) + (b.opts && b.opts[0] ? ', ' + tx(b.opts[0].route.name) : '') + '). Figures are from the last imported year (' + A.year + '); the rules refer to the last audited statements.')
        + (isFinite(b.coverAfter) ? (fa() ? ' هشدار اقتصادی (غیرمقرراتی): با این مبلغ و نرخ ' + U.fmtPct(A.coupon, 1) + '، سود سالانه ' + U.fmtNum(b.annualProfit) + ' و پوشش EBITDA به هزینهٔ مالی ' + b.coverAfter.toFixed(2) + ' برابر می‌شود' + (b.coverAfter < 1.5 ? ' — توان بازپرداخت کافی نیست؛ مبلغ عملی کمتر است (ابزار راه‌حل‌های تأمین مالی: ظرفیت بدهی).' : '.') : ' Economic check (not a rule): at ' + U.fmtPct(A.coupon, 1) + ' this amount costs ' + U.fmtNum(b.annualProfit) + ' a year and EBITDA / finance cost becomes ' + b.coverAfter.toFixed(2) + 'x' + (b.coverAfter < 1.5 ? ' — not serviceable; the practical amount is lower (Financing Solutions: debt capacity).' : '.')) : '')
        : (fa() ? 'با پاسخ‌های فعلی، هیچ ترکیب ابزار و مسیر اعتباری واجد شرایط نیست؛ شروط ناموفق و مسیرها را ببینید.' : 'With the current answers no instrument and credit route qualifies; see the failed conditions and the routes.') });
      var S = ctx.S, F = A.F;
      var rf = G.form({ id: 'sk-rate', onChange: ctx.rerender, fields: [
        { key: 'rm', label: 'Rate used to size the issue', options: [['manual', 'My rate'], ['coupon', 'Coupon (Company, gates and credit tab)'], ['ytm', 'True issuer cost, ytm method (Financing Solutions terms)']], get: function () { return S.rateMode; }, set: function (v) { S.rateMode = v; } },
        ctx.field('rr', 'My rate (annual)', 'rateManual', 'pct2', { unit: '%' }),
        { key: 'am', label: 'Principal', options: [['bullet', 'Bullet at maturity'], ['equal', 'Equal annual instalments']], get: function () { return S.amort; }, set: function (v) { S.amort = v; } },
        { type: 'head', label: 'Repayment from profit (sets the capacity)' },
        ctx.field('pp', 'Share of net income paid as dividends', 'fin.payout', 'pct', { unit: '%' }), ctx.field('pk', 'Profit before tax must cover the coupon at least', 'fin.minProfitCover', 'dec', { unit: 'x' }),
        { type: 'head', label: 'Other limits (0 = off)' },
        ctx.field('l1', 'Minimum EBIT / finance cost', 'fin.minEbitCover', 'dec', { unit: 'x' }), ctx.field('l2', 'Minimum EBITDA / finance cost', 'fin.minEbitdaCover', 'dec', { unit: 'x' }),
        ctx.field('l3', 'Maximum net debt / EBITDA', 'fin.maxNdEbitda', 'dec', { unit: 'x' }), ctx.field('l4', 'Share of today’s profit before tax to keep', 'fin.pbtKeep', 'pct', { unit: '%' }),
        ctx.field('l5', 'Net income to keep (e.g. planned dividends)', 'fin.niKeep', 'num'), ctx.field('l6', 'Maximum debt / equity', 'fin.maxDE', 'dec', { unit: 'x' }),
        ctx.field('l7', 'Minimum operating cash flow / debt service', 'fin.minDscr', 'dec', { unit: 'x' }), ctx.field('l8', 'Maximum issue as a multiple of registered capital', 'fin.capMult', 'dec', { unit: 'x' }),
        ctx.field('l9', 'Tax rate', 'fin.taxRate', 'pct', { unit: '%' }),
        { type: 'head', label: 'Earnings quality and capital' },
        { key: 'co', label: 'Profit tests on operating profit only (exclude non-operating income)', options: [['1', 'Yes'], ['0', 'No']], get: function () { return S.fin.coreOnly ? '1' : '0'; }, set: function (v) { S.fin.coreOnly = v === '1'; } },
        ctx.field('no', 'Maximum non-operating income / profit before tax', 'fin.maxNonOp', 'pct', { unit: '%' }),
        ctx.field('cr', 'Registered capital (0 = from the statements; enter it if a capital increase is registered since)', 'fin.capital', 'num'),
        ctx.field('so2', 'Sukuk / bonds outstanding now (0 = from the balance sheet)', 'fin.sukukOut', 'num'),
        ctx.field('na', 'Benchmark: issue ≤ share of average net income (repealed SEO rule: 60% of 2 years; 0 = off)', 'fin.niAvgMult', 'pct', { unit: '%' }),
        ctx.field('ny2', 'Years for the average net income', 'fin.niAvgYears', 'int'),
        { type: 'head', label: 'Existing facilities and cash' },
        { key: 'cb', label: 'Operating cash flow basis', options: [['avg2', 'Average of the last two years'], ['last', 'Last year'], ['min2', 'Lower of the last two years']], get: function () { return S.fin.cfoBasis; }, set: function (v) { S.fin.cfoBasis = v; } },
        ctx.field('gr', 'Growth of operating cash flow per year', 'fin.growth', 'pct', { unit: '%' }),
        ctx.field('ir', 'Rate on existing facilities (0 = implied: finance cost ÷ average debt)', 'fin.iRate', 'pct', { unit: '%' }),
        ctx.field('ro', 'Share of facility repayments rolled over (−1 = last year’s habit)', 'fin.rollover', 'dec'),
        ctx.field('ny', 'Non-current facilities fall due over (years)', 'fin.ncYears', 'int'),
        ctx.field('cu', 'Share of today’s cash usable for debt service', 'fin.cashUse', 'pct', { unit: '%' }),
        { key: 'sp', label: 'Sukuk principal at maturity', options: [['repay', 'Repaid from cash'], ['reissue', 'Refinanced by a new issue']], get: function () { return S.fin.sukukPrin; }, set: function (v) { S.fin.sukukPrin = v; } },
        { key: 'fs', label: 'Test: cash never runs out over the tenor', options: [['1', 'On'], ['0', 'Off']], get: function () { return S.fin.fullService ? '1' : '0'; }, set: function (v) { S.fin.fullService = v === '1'; } }] });
      var ft = !F ? h('p', { class: 'muted', text: 'Enter a rate.' }) : h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['Test', 'Now (' + F.year + ')', 'Your limit', 'Max new issue', 'Rule'].map(thMap([4])))]),
        h('tbody', null, F.tests.map(function (x) { var bind = F.binding && F.binding.key === x.key; return h('tr', { class: bind ? 'fit-rec' : x.on ? '' : 'fit-no' }, [h('td', { 'data-notr': '1' }, [bind ? h('strong', { text: tx(x.label) }) : document.createTextNode(tx(x.label))]),
          h('td', { class: 'num', text: !isFinite(x.now) ? '–' : x.money ? U.fmtNum(x.now) : x.pct ? U.fmtPct(x.now, 1) : x.now.toFixed(2) + 'x' }), h('td', { class: 'num', text: x.on ? x.limit : x.need ? (fa() ? 'داده نیست' : 'no data') : 'off' }),
          h('td', { class: 'num', text: !x.on ? '–' : x.gate ? (x.max === 0 ? (fa() ? 'رد: ۰' : 'fails: 0') : (fa() ? 'قبول' : 'passes')) : U.fmtNum(x.max) }), h('td', { class: 'small muted', 'data-notr': '1', dir: 'ltr', text: x.f })]); }))]);
      var sv = h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['Rate', 'Financial capacity (all tests)', 'Recommended capacity', 'Strict: cash flow also a limit', 'Binding test (all tests)'].map(function (t) { return h('th', { class: 'num', text: t }); }))]),
        h('tbody', null, A.sens.map(function (z) { var me = Math.abs(z.rate - A.rate) < 1e-9; return h('tr', { class: me ? 'flag' : '' }, [h('td', { class: 'num', text: U.fmtPct(z.rate, 1) + (me ? ' ◂' : '') }), h('td', { class: 'num', text: U.fmtNum(z.fin) }), h('td', { class: 'num', text: U.fmtNum(z.rec) }), h('td', { class: 'num', text: U.fmtNum(z.recE) }), h('td', { 'data-notr': '1', class: 'small', text: z.binding ? tx(z.binding.label) : '–' })]); }))]);
      var capTxt = h('p', { class: 'f-help', 'data-notr': '1', text: !F ? '' : A.noBS ? (fa() ? 'ترازنامه در داده‌های واردشده نیست، پس ظرفیت اعلام نمی‌شود: آزمون‌های بدهی/حقوق مالکانه، بدهی خالص/EBITDA، سقف سرمایه و نسبت بدهی به دارایی بدون ترازنامه ممکن نیست. صورت وضعیت مالی' + (A.noCF ? ' و صورت جریان‌های نقدی' : '') + ' را هم وارد کنید. فقط بر پایهٔ سود و زیان، با نرخ ' + U.fmtPct(A.rate, 2) + ' سقف آزمون‌های پوشش و سود ' + U.fmtNum(F.max) + ' است.' : 'No balance sheet in the imported data, so no capacity is stated: debt/equity, net debt/EBITDA, the capital cap and liabilities/assets cannot be tested. Import the statement of financial position' + (A.noCF ? ' and the cash flow statement' : '') + '. On the income statement alone, at ' + U.fmtPct(A.rate, 2) + ' the coverage and profit tests allow ' + U.fmtNum(F.max) + '.') : fa()
        ? 'با نرخ ' + U.fmtPct(A.rate, 2) + '، ظرفیت مالی ' + U.fmtNum(F.max) + ' و سقف مقرراتی ' + U.fmtNum(A.regMax) + ' است؛ کمترِ این دو (روش سخت‌گیرانه، همهٔ آزمون‌ها سقف) = ' + U.fmtNum(A.recStrict) + ' ' + ({ thousand: 'هزار', million: 'میلیون', billion: 'میلیارد' }[A.unit] || A.unit) + ' ریال. محدودکننده: ' + (F.binding ? tx(F.binding.label) : '–') + '. این آزمون‌ها در دستورالعمل‌ها نیست؛ معیار ضامن، مؤسسهٔ رتبه‌بندی و احتیاط مالی است و سقف‌ها را خودتان تعیین می‌کنید.'
        : 'At ' + U.fmtPct(A.rate, 2) + ' the financial capacity is ' + U.fmtNum(F.max) + ' and the regulatory maximum ' + U.fmtNum(A.regMax) + '; the lower (strict: every test a limit) = ' + U.fmtNum(A.recStrict) + ' ' + A.unit + '. Binding: ' + (F.binding ? tx(F.binding.label) : '–') + '. These tests are not in the instructions; they are what guarantors, rating agencies and prudence look at, with limits you set.' });
      var cfWhy = null;
      if (F && A.cfBind && F.sched0 && F.sched0.length) {
        var y1 = F.sched0[0], need = num(S.fin.minDscr) * y1.intE, gap = y1.cfo - y1.intE - y1.payE;
        cfWhy = h('div', { class: 'f-help', 'data-notr': '1' }, [h('p', { text: fa()
          ? (A.cfoPos ? 'هشدار جریان نقد (در ظرفیت پیشنهادی سقف نیست، ولی ضامن و رتبه‌بندی به آن نگاه می‌کنند): ' : F.max > 0 ? 'چرا جریان نقد محدودکننده است: ' : 'چرا صفر: حتی پیش از انتشار، ') + 'جریان نقد عملیاتی مبنا (' + U.fmtNum(F.cfo0) + '، ' + ({ avg2: 'میانگین دو سال', last: 'سال آخر', min2: 'کمترِ دو سال' }[S.fin.cfoBasis] || S.fin.cfoBasis) + ') ' + (F.max > 0 ? 'جای کمی برای سود اوراق دارد' : 'از عهدهٔ تعهدات فعلی برنمی‌آید') + ': بهرهٔ سال اول تسهیلات موجود ' + U.fmtNum(y1.intE) + ' (پوشش ' + (y1.intE ? (y1.cfo / y1.intE).toFixed(2) : '–') + 'x در برابر حد ' + num(S.fin.minDscr) + 'x؛ برای عبور، جریان نقد عملیاتی دست‌کم ' + U.fmtNum(need) + ' لازم است) و بازپرداخت اصل تمدیدنشده ' + U.fmtNum(y1.payE) + ' (فرض تمدید ' + U.fmtPct(F.roll, 0) + '). مازاد (کسری) نقد سال اول بدون اوراق: ' + U.fmtNum(gap) + '.'
          : (A.cfoPos ? 'Cash-flow warning (not a limit in the recommendation, but guarantors and raters look at it): the base operating cash flow (' : F.max > 0 ? 'Why cash flow binds: the base operating cash flow (' : 'Why zero: even before any issue, the base operating cash flow (') + '' + U.fmtNum(F.cfo0) + ', ' + S.fin.cfoBasis + ') ' + (F.max > 0 ? 'leaves little room for coupons' : 'does not meet existing obligations') + ': year-1 interest on current facilities ' + U.fmtNum(y1.intE) + ' (cover ' + (y1.intE ? (y1.cfo / y1.intE).toFixed(2) : '–') + 'x vs your ' + num(S.fin.minDscr) + 'x; passing needs CFO ≥ ' + U.fmtNum(need) + ') and the non-rolled principal ' + U.fmtNum(y1.payE) + ' (roll-over assumed ' + U.fmtPct(F.roll, 0) + '). Year-1 cash surplus (gap) with no sukuk: ' + U.fmtNum(gap) + '.' }),
          A.cfoPos ? null : h('p', { text: fa()
            ? 'روش دوم (بدون آزمون‌های جریان نقد؛ فقط سود، اهرم و سقف سرمایه): ' + U.fmtNum(A.recEarn) + '. این عدد فقط وقتی قابل دفاع است که بتوانید نشان دهید جریان نقد عملیاتی گذشته موقتی پایین بوده (مثلاً جذب سرمایه در گردش) یا تسهیلات بیش از فرض بالا تمدید می‌شود. فرض‌های قابل تغییر در «حدود»: مبنای جریان نقد، نرخ تمدید تسهیلات، حداقل پوشش و آزمون کمبود نقد.'
            : 'Second method (no cash-flow tests; earnings, leverage and the capital cap only): ' + U.fmtNum(A.recEarn) + '. Defensible only if you can show past operating cash flow was temporarily low (e.g. working capital build) or facilities roll over more than assumed. Assumptions you can change in Limits: CFO basis, facility roll-over, minimum cover and the cash-shortfall test.' })]);
      }
      var unitFa = ({ thousand: 'هزار', million: 'میلیون', billion: 'میلیارد' }[A.unit] || A.unit) + ' ریال';
      var trueLine = A.Ctrue && !A.noBS ? h('p', { class: 'f-help', 'data-notr': '1', text: fa() ? 'با هزینهٔ واقعی بانی (روش ytm، با کارمزد ارکان و الحاقیه: ' + U.fmtPct(A.Y.all, 2) + ' به‌جای ' + U.fmtPct(A.rate, 2) + ')، ظرفیت ' + U.fmtNum(A.Ctrue.rec) + ' است. کارمزدها و تاریخ‌ها در زبانهٔ «هزینهٔ اوراق (ytm)».' : 'At the true issuer cost (ytm method, fees and side letter: ' + U.fmtPct(A.Y.all, 2) + ' instead of ' + U.fmtPct(A.rate, 2) + '), capacity is ' + U.fmtNum(A.Ctrue.rec) + '. Fees and dates on the Sukuk cost (ytm) tab.' }) : null;
      var recHead = A.noBS ? null : h('div', { class: 'f-help', 'data-notr': '1' }, [h('p', null, [h('strong', { text: fa()
          ? 'ظرفیت پیشنهادی انتشار: ' + U.fmtNum(A.recMax) + ' ' + unitFa + (A.recBind ? ' — محدودکننده: ' + tx(A.recBind.label).split(':')[0] : '') + '.'
          : 'Recommended issue capacity: ' + U.fmtNum(A.recMax) + ' ' + A.unit + (A.recBind ? ' — binding: ' + tx(A.recBind.label).split(':')[0] : '') + '.' })]),
        A.IP ? h('p', null, [h('strong', { text: (fa() ? 'سود (بهره) سالانهٔ اوراق در این مبلغ: ' : 'Annual sukuk profit (interest) at this amount: ') + U.fmtNum(A.IP.annual) + ' = ' + U.fmtNum(A.IP.X) + ' × ' + U.fmtPct(A.IP.r, 2) })]) : null,
        h('p', { text: fa()
          ? 'روش: ظرفیت = کمترینِ (۱) مبلغی که شرکت با سود قبل از مالیات و سود خالص فعلی، با نرخ شما، می‌تواند سود و اصل آن را طی مدت اوراق بپردازد، (۲) سقف سرمایه (سرمایهٔ ثبتی منهای اوراق در جریان) و (۳) سقف ابزار و مسیر اعتباری. آزمون‌های اهرم و پوشش EBITDA برای اطلاع نمایش داده می‌شوند. جریان نقد فقط وقتی سقف است که جمع جریان نقد عملیاتی دو سال مثبت نباشد (شرط سازمان). مبلغ سخت‌گیرانه (جریان نقد هم سقف): ' + U.fmtNum(A.recStrict) + '.'
          : 'Method: capacity = the lowest of (1) the amount whose coupon and principal the company can pay from its current profit before tax and net income at your rate over the tenor, (2) the capital ceiling (registered capital less sukuk outstanding) and (3) the instrument and credit-route limit. Leverage and EBITDA cover tests are shown for information. Cash flow limits it only if CFO over two years is not positive (SEO test). Strict amount (cash flow also a limit): ' + U.fmtNum(A.recStrict) + '.' })]);
      var recT = A.noBS || !A.limits ? null : h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['Limit', 'Amount', 'Used', 'Note'].map(thMap([2, 3])))]),
        h('tbody', null, A.limits.map(function (x) { var b = A.recBind && A.recBind.key === x.key; return h('tr', { class: b ? 'fit-rec' : x.applied ? '' : 'fit-no' }, [h('td', { 'data-notr': '1' }, [b ? h('strong', { text: tx(x.label) }) : document.createTextNode(tx(x.label))]),
          h('td', { class: 'num', text: isFinite(x.v) ? U.fmtNum(Math.max(0, x.v)) : '–' }), h('td', { text: x.applied ? (b ? (fa() ? 'محدودکننده' : 'binding') : (fa() ? 'بله' : 'yes')) : (fa() ? 'خیر' : 'no') }),
          h('td', { 'data-notr': '1', class: 'small', text: x.note ? tx(x.note) : '' })]); }).concat([h('tr', { class: 'flag' }, [h('td', null, [h('strong', { text: fa() ? 'ظرفیت پیشنهادی = کمترین مبلغ اعمال‌شده' : 'Recommended = the lowest applied amount' })]), h('td', { class: 'num' }, [h('strong', { text: U.fmtNum(A.recMax) })]), h('td', null, []), h('td', null, [])])]))]);
      var facts = !F ? null : h('ul', { class: 'studio-l', 'data-notr': '1' }, (fa() ? [
          'تسهیلات بهره‌دار: جاری ' + U.fmtNum(F.B.current) + '، غیرجاری ' + U.fmtNum(F.B.nonCurrent) + (F.B.fromLines ? '' : ' (تفکیک در صورت‌ها پیدا نشد؛ همه جاری فرض شد)') + (F.B.sukuk ? '؛ اوراق در جریان ' + U.fmtNum(F.B.sukuk) : '') + '.',
          'نرخ ضمنی تسهیلات: ' + U.fmtPct(F.iR, 1) + ' (هزینهٔ مالی ' + U.fmtNum(F.ie) + ' ÷ میانگین بدهی).',
          'رفتار تمدید سال گذشته: دریافت تسهیلات ' + U.fmtNum(F.got) + ' در برابر بازپرداخت ' + U.fmtNum(F.paid) + (isFinite(F.rollHist) ? ' (' + U.fmtPct(F.rollHist, 0) + ')' : '') + '؛ فرض تمدید: ' + U.fmtPct(F.roll, 0) + '.',
          'جریان نقد عملیاتی مبنا: ' + U.fmtNum(F.cfo0) + ' (قبل از سود پرداختی تسهیلات، که در صورت‌های ایرانی در فعالیت‌های تأمین مالی است).',
          'درآمد غیرعملیاتی: ' + U.fmtNum(F.nonOp) + ' = ' + U.fmtPct(F.nonOpShare, 1) + ' سود قبل از مالیات' + (isFinite(F.nonOpShare3) ? ' (سه‌ساله ' + U.fmtPct(F.nonOpShare3, 1) + ')' : '') + '؛ سود قبل از مالیات عملیاتی ' + U.fmtNum(F.pbtCore) + '.']
        : ['Interest-bearing facilities: current ' + U.fmtNum(F.B.current) + ', non-current ' + U.fmtNum(F.B.nonCurrent) + (F.B.fromLines ? '' : ' (split not found; all treated as current)') + (F.B.sukuk ? '; sukuk outstanding ' + U.fmtNum(F.B.sukuk) : '') + '.',
          'Implied rate on facilities: ' + U.fmtPct(F.iR, 1) + ' (finance cost ' + U.fmtNum(F.ie) + ' ÷ average debt).',
          'Roll-over habit last year: new facilities ' + U.fmtNum(F.got) + ' vs repayments ' + U.fmtNum(F.paid) + (isFinite(F.rollHist) ? ' (' + U.fmtPct(F.rollHist, 0) + ')' : '') + '; assumed roll-over ' + U.fmtPct(F.roll, 0) + '.',
          'Operating cash flow used: ' + U.fmtNum(F.cfo0) + ' (before interest paid, which Iranian statements show under financing).',
          'Non-operating income: ' + U.fmtNum(F.nonOp) + ' = ' + U.fmtPct(F.nonOpShare, 1) + ' of profit before tax' + (isFinite(F.nonOpShare3) ? ' (3 years ' + U.fmtPct(F.nonOpShare3, 1) + ')' : '') + '; operating profit before tax ' + U.fmtNum(F.pbtCore) + '.']).map(function (t) { return h('li', { text: t }); }));
      var sch = !F ? null : h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['Year', 'Operating cash flow', 'Interest, existing facilities', 'Facility repayments not rolled', 'Sukuk coupons', 'Sukuk principal', 'Net', 'Cumulative', 'CFO / (interest + coupons)'].map(function (t) { return h('th', { class: 'num', text: t }); }))]),
        h('tbody', null, F.sched.map(function (r) { return h('tr', { class: r.cum < 0 || r.cover < num(S.fin.minDscr) ? 'flag' : '' }, [r.y, r.cfo, -r.intE, -r.payE, -r.coup, -r.prinS, r.net, r.cum].map(function (v, i) { return h('td', { class: 'num', text: i ? U.fmtNum(v) : String(v) }); }).concat([h('td', { class: 'num', text: isFinite(r.cover) ? r.cover.toFixed(2) + 'x' : '–' })])); }))]);
      return ctx.group([ctx.panel('Recommended issue capacity', [clr, recHead, A.C && !A.noBS ? limitTable(A.C, h, fa, tx) : null, trueLine, A.noBS ? capTxt : null]), A.IP && !A.noBS ? ctx.panel('Annual profit (interest) to pay on the sukuk', [interestView(A.IP, h)]) : null, A.C && !A.noBS ? ctx.panel('How the recommended capacity was calculated', [stepsView(coreSteps(A.C), A.recMax, A.recBind && A.recBind.key, A.hard && A.hard.length && !(A.recMax > 0) ? [{ en: A.hard.length + ' originator condition(s) not met', fa: A.hard.length + ' شرط بانی برقرار نیست' }] : [], h)]) : null, A.C && !A.noBS ? ctx.panel('Repayment from profit at your rate', [yearView(A.C, h, fa)]) : null, A.C && !A.noBS ? ctx.panel('Before and after the issue', [afterTable(A.C, h, fa, tx)]) : null, cfWhy ? ctx.panel('Cash-flow check', [cfWhy]) : null, ctx.panel('All financial tests at your rate', [A.noBS ? null : capTxt, h('div', { class: 'grid-wrap' }, [ft])]),
        ctx.two(ctx.panel('What the statements show', [facts]), ctx.panel('Debt service over the tenor, at the capacity', [h('div', { class: 'grid-wrap' }, [sch]), h('p', { class: 'f-help', text: 'Rows in colour: cash runs out or cover below your limit. Coupons at the rate used, paid through the year; existing facilities at their implied rate on the outstanding balance.' })])),
        ctx.two(ctx.panel('Rate and limits', [rf]), ctx.panel('Capacity by rate', [h('div', { class: 'grid-wrap' }, [sv])])),
        ctx.panel('Instruments', [head, h('div', { class: 'grid-wrap' }, [it])]),
        ctx.panel('Other sukuk (CAMC handbook)', [oth, h('p', { class: 'f-help', text: 'Their issuance instructions are not among the texts supplied; the originator tests above usually apply. Check each instruction on cmr.seo.ir.' })]), ctx.panel('Credit routes (guarantee, rating, collateral)', [h('div', { class: 'grid-wrap' }, [rt])]),
        ctx.panel('Originator conditions', [h('div', { class: 'grid-wrap' }, [ck]), h('p', { class: 'f-help', text: 'Screening against the texts listed under Process and sources. Thresholds and articles change: confirm the current version on cmr.seo.ir. Detailed cost of the issue: Bond Issue vs No-issue (ytm method).' })])]);
    }], ['quick', 'Enter key figures (no Excel)', function (ctx) {
      var S = ctx.S; if (!S.m) S.m = mDefault(); var m = S.m;
      /* quick answer: profit P at rate r covers the sukuk profit when X × r × k ≤ P  ⇒  X = P ÷ (k × r) */
      if (!S.pc) S.pc = { unit: 'bnToman', profit: 0, basis: 'pbt', rate: num(m.rate) || 0.23, k: 1, fc: 0, tax: 0.25 }; var pcS = S.pc;
      var pcForm = G.form({ id: 'sk-pc', onChange: ctx.rerender, fields: [
        { key: 'pcu', label: 'Unit', options: [['bnToman', 'Billion tomans'], ['bnRial', 'Billion rials'], ['mnRial', 'Million rials']], get: function () { return pcS.unit; }, set: function (v) { pcS.unit = v; } },
        { key: 'pcb', label: 'Which profit', options: [['pbt', 'Profit before tax (after the current finance cost)'], ['ebit', 'Operating profit (before finance cost)'], ['ni', 'Net income (after tax)']], get: function () { return pcS.basis; }, set: function (v) { pcS.basis = v; } },
        ctx.field('pcp', 'Profit', 'pc.profit', 'num'), ctx.field('pcf', 'Current annual finance cost (only for operating profit)', 'pc.fc', 'num'),
        ctx.field('pcr', 'Sukuk profit rate', 'pc.rate', 'pct2', { unit: '%' }), ctx.field('pck', 'Profit must cover the sukuk profit at least', 'pc.k', 'dec', { unit: 'x' })] });
      var pcCalc = function (r) { var P = num(pcS.profit), k = num(pcS.k) > 0 ? num(pcS.k) : 1, fc = Math.abs(num(pcS.fc));
        if (!(r > 0)) return NaN; return pcS.basis === 'ebit' ? Math.max(0, (P / k - fc) / r) : Math.max(0, P / (k * r)); };
      var pcX = pcCalc(num(pcS.rate)), pcU = { bnToman: fa() ? 'میلیارد تومان' : 'bn tomans', bnRial: fa() ? 'میلیارد ریال' : 'bn rials', mnRial: fa() ? 'میلیون ریال' : 'mn rials' }[pcS.unit];
      var pcFormula = pcS.basis === 'ebit' ? (fa() ? 'X = (سود عملیاتی ÷ k − هزینهٔ مالی فعلی) ÷ نرخ = (' : 'X = (operating profit ÷ k − current finance cost) ÷ rate = (') + U.fmtNum(num(pcS.profit)) + ' ÷ ' + (num(pcS.k) || 1) + ' − ' + U.fmtNum(Math.abs(num(pcS.fc))) + ') ÷ ' + U.fmtPct(num(pcS.rate), 2)
        : (fa() ? 'X = سود ÷ (k × نرخ) = ' : 'X = profit ÷ (k × rate) = ') + U.fmtNum(num(pcS.profit)) + ' ÷ (' + (num(pcS.k) || 1) + ' × ' + U.fmtPct(num(pcS.rate), 2) + ')';
      var pcOut = !(num(pcS.profit) > 0) ? h('p', { class: 'f-help', text: fa() ? 'سود شرکت و نرخ را وارد کنید.' : 'Enter the profit and the rate.' }) : h('div', { 'data-notr': '1' }, [
        h('p', null, [h('strong', { style: 'font-size:1.25em', text: (fa() ? 'حداکثر اوراقی که سود، بهرهٔ آن را پوشش می‌دهد: ' : 'Largest issue whose profit the company’s profit covers: ') + U.fmtNum(pcX) + ' ' + pcU })]),
        h('p', { class: 'f-help', text: pcFormula + ' = ' + U.fmtNum(pcX) }),
        h('p', { class: 'f-help', text: (fa() ? 'سود سالانهٔ اوراق در این مبلغ: ' : 'Annual sukuk profit at this amount: ') + U.fmtNum(pcX * num(pcS.rate)) + ' ' + pcU + (pcS.basis === 'ni' ? (fa() ? '. مبنای سود خالص محافظه‌کارانه است، چون سود اوراق هزینهٔ قابل‌کسر مالیاتی است و در عمل از سود قبل از مالیات پرداخت می‌شود.' : '. The net-income basis is conservative: the sukuk profit is tax-deductible and is paid out of pre-tax profit.') : pcS.basis === 'pbt' ? (fa() ? '. سود قبل از مالیات، هزینهٔ مالی فعلی را از قبل کسر کرده؛ پس این مبلغ فقط بهرهٔ اوراق جدید را پوشش می‌دهد.' : '. Profit before tax is already after the current finance cost, so this covers the new sukuk profit only.') : '') }),
        h('p', { class: 'f-help', text: fa() ? 'این فقط آزمون پوشش بهره است؛ بازپرداخت اصل در سررسید، سقف سرمایه و نسبت بدهی به دارایی در بخش‌های پایین سنجیده می‌شوند.' : 'This is only the interest-cover test; repaying the principal at maturity, the capital ceiling and liabilities / assets are tested below.' }),
        h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, [fa() ? 'نرخ' : 'Rate', fa() ? 'حداکثر اوراق' : 'Largest issue', fa() ? 'سود سالانهٔ اوراق' : 'Annual sukuk profit'].map(thMap([])))]),
          h('tbody', null, [0.15, 0.18, 0.2, 0.23, 0.25, 0.28, 0.3, 0.35, 0.4, 0.45, 0.5].concat([num(pcS.rate)]).filter(function (v, i, a) { return v > 0 && a.indexOf(v) === i; }).sort(function (a, b) { return a - b; }).map(function (r) { var x = pcCalc(r); return h('tr', { class: r === num(pcS.rate) ? 'flag' : '' }, [h('td', { text: U.fmtPct(r, 1) }), h('td', { class: 'num', text: U.fmtNum(x) }), h('td', { class: 'num', text: U.fmtNum(x * r) })]); }))])])]);
      var pcPanel = ctx.panel('Quick answer: how much sukuk can the profit cover?', [ctx.two(h('div', null, [pcForm.el || pcForm]), pcOut)]);
      var f = function (k, label, fmt, unit) { return ctx.field('m' + k, label, 'm.' + k, fmt, unit ? { unit: unit } : undefined); };
      var form = G.form({ id: 'sk-man', onChange: ctx.rerender, fields: [
        { type: 'head', label: 'Company figures (last audited year)' },
        { type: 'note', label: 'Signs: enter amounts as they are, without minus signs. Costs (finance cost) are entered as positive numbers — a minus sign is ignored. Only an operating loss (EBIT) or a negative operating cash flow takes a minus sign.' },
        { key: 'mun', label: 'Unit of all amounts', options: [['million', 'Million rials'], ['billion', 'Billion rials'], ['thousand', 'Thousand rials']], get: function () { return m.unit; }, set: function (v) { m.unit = v; } },
        { key: 'mct', label: 'Company type (liabilities / assets cap)', options: [['normal', 'Ordinary company — 90%'], ['bank', 'Bank or leasing company — 95%']], get: function () { return m.ctype; }, set: function (v) { m.ctype = v; } },
        f('ta', 'Total assets', 'num'), f('tl', 'Total liabilities', 'num'), f('eq', 'Shareholders’ equity (0 = assets − liabilities)', 'num'), f('cap', 'Registered capital', 'num'),
        f('cfo1', 'Operating cash flow — last year', 'num'), f('cfo2', 'Operating cash flow — the year before', 'num'),
        f('ebit', 'Operating profit (EBIT) — negative if an operating loss', 'num'), f('fc', 'Finance cost of the last reported year (financial year ending at the balance-sheet date)', 'num'),
        ctx.field('mpbt', 'Profit before tax (optional — used for the repayment test; blank = EBIT − finance cost)', 'm.pbt', 'num', { optional: true }),
        { type: 'head', label: 'The issue you are considering' },
        f('rate', 'Your profit rate (annual)', 'pct2', '%'), f('months', 'Tenor (months)', 'int'),
        { key: 'mty', label: 'Type of issue', options: [['normal', 'Ordinary sukuk'], ['small', 'Small and short-term (≤ 2,000 bn rials, ≤ 18 months)']], get: function () { return m.type; }, set: function (v) { m.type = v; } },
        f('cover', 'Minimum interest cover after the issue (EBIT ÷ total finance cost)', 'dec', 'x'),
        { type: 'head', label: 'Optional (improves the result)' },
        f('out', 'Sukuk already outstanding or approved', 'num'), f('capMult', 'Capital ceiling as a multiple of capital', 'dec', 'x'),
        f('tax', 'Tax rate on profit', 'pct', '%'), f('payout', 'Share of profit paid as dividends', 'pct', '%')] });
      var clrM = h('div', { class: 'row-actions' }, [h('button', { class: 'btn', type: 'button', text: 'Clear the figures', onclick: function () { var u = m.unit; S.m = mDefault(); S.m.unit = u; ctx.rerender(); } })]);
      var M = simpleCap(m), fx = function (v) { return isFinite(v) ? v.toFixed(2) + 'x' : '–'; }, pc = function (v, d) { return isFinite(v) ? U.fmtPct(v, d == null ? 1 : d) : '–'; }, N = U.fmtNum;
      var ready = num(m.ta) > 0 && num(m.tl) > 0;
      var ok = function (b) { return b == null ? '' : b ? (fa() ? 'برقرار' : 'met') : (fa() ? 'برقرار نیست' : 'not met'); };
      var head = !ready ? h('p', { class: 'f-help', text: fa() ? 'جمع دارایی‌ها و جمع بدهی‌ها را وارد کنید؛ بقیهٔ نسبت‌ها را مدل حساب می‌کند.' : 'Enter total assets and total liabilities; the model computes the ratios.' }) : h('div', { 'data-notr': '1' }, [
        h('p', null, [h('strong', { style: 'font-size:1.3em', text: (fa() ? 'ظرفیت پیشنهادی انتشار: ' : 'Recommended issue capacity: ') + (isFinite(M.rec) ? N(M.rec) : '–') + ' ' + M.unitFa })]),
        h('p', { class: 'f-help', text: (fa() ? 'سود (بهره) سالانهٔ اوراق: ' : 'Annual sukuk profit (interest): ') + U.fmtNum(M.coupon) + ' = ' + U.fmtNum(M.X) + ' × ' + U.fmtPct(num(m.rate), 2) }), h('p', { class: M.blocked.length ? 'neg' : 'f-help', text: M.blocked.length ? (fa() ? 'شرط لازم برقرار نیست: ' : 'A required condition fails: ') + M.blocked.map(tx).join('؛ ') : (fa() ? 'محدودکننده: ' : 'Binding: ') + (M.bind ? tx(M.bind.label) : '–') })]);
      var lt = !ready ? null : h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['Limit', 'Maximum issue', 'Note'].map(thMap([2])))]),
        h('tbody', null, M.limits.map(function (x) { var b = M.bind && M.bind.key === x.key; return h('tr', { class: b ? 'fit-rec' : x.applied ? '' : 'fit-no' }, [h('td', { 'data-notr': '1' }, [b ? h('strong', { text: tx(x.label) }) : document.createTextNode(tx(x.label))]), h('td', { class: 'num', text: !x.applied ? (fa() ? 'اعمال نشد' : 'not applied') : isFinite(x.v) ? N(Math.max(0, x.v)) : '–' }), h('td', { 'data-notr': '1', class: 'small', text: x.note ? tx(x.note) : '' })]); })
          .concat([h('tr', { class: 'flag' }, [h('td', null, [h('strong', { text: fa() ? 'ظرفیت پیشنهادی = کمترین مبلغ' : 'Recommended = the lowest amount' })]), h('td', { class: 'num' }, [h('strong', { text: isFinite(M.rec) ? N(M.rec) : '–' })]), h('td', null, [])])]))])]);
      var R2 = M.r, rows = !ready ? [] : [
        [fa() ? 'نسبت بدهی‌ها به دارایی‌ها' : 'Liabilities / assets', pc(R2.la0), pc(R2.la1), '≤ ' + pc(M.laCap, 0), ok(R2.la0 <= M.laCap)],
        [fa() ? 'فاصله تا سقف بدهی به دارایی' : 'Room to the liabilities / assets cap', pc(M.laCap - R2.la0) + (fa() ? ' واحد' : ' pts'), pc(M.laCap - R2.la1) + (fa() ? ' واحد' : ' pts'), '', ''],
        [fa() ? 'بدهی اضافی مجاز تا سقف (پس از انتشار)' : 'Extra debt allowed up to the cap (after the issue)', N(M.laRoom), '', '', ''],
        [fa() ? 'بدهی به حقوق صاحبان سهام' : 'Liabilities / equity', fx(R2.de0), fx(R2.de1), '', ''],
        [fa() ? 'جمع جریان نقد عملیاتی دو سال' : 'Operating cash flow, two years', N(M.cfoSum), '', '> 0', ok(M.cfoSum > 0)],
        [fa() ? 'پوشش بهره (سود عملیاتی ÷ هزینهٔ مالی)' : 'Interest cover (EBIT ÷ finance cost)', fx(R2.ic0), fx(R2.ic1), '≥ ' + num(m.cover) + 'x', ok(isFinite(R2.ic1) ? R2.ic1 >= num(m.cover) - 1e-9 : null)],
        [fa() ? 'هزینهٔ مالی سالانه' : 'Annual finance cost', N(num(m.fc)), N(num(m.fc) + M.coupon), '', ''],
        [fa() ? 'سود سالانهٔ اوراق' : 'Annual sukuk profit', '', N(M.coupon), '', ''],
        [fa() ? 'اوراق ÷ سرمایهٔ ثبتی' : 'Sukuk ÷ registered capital', pc(num(m.cap) ? num(m.out) / num(m.cap) : NaN), pc(num(m.cap) ? (num(m.out) + M.X) / num(m.cap) : NaN), '≤ ' + (num(m.capMult) || 1) + '×', ok(num(m.cap) ? num(m.out) + M.X <= (num(m.capMult) || 1) * num(m.cap) + 1e-6 : null)],
        [fa() ? 'حقوق صاحبان سهام' : 'Shareholders’ equity', N(M.eq), '', '', ''],
        [fa() ? 'مدت اوراق' : 'Tenor', num(m.months) + (fa() ? ' ماه' : ' months'), '', m.type === 'small' ? '≤ 18' : '', m.type === 'small' ? ok(num(m.months) <= 18) : '']];
      var rt = !ready ? null : h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['Ratio', 'Now', 'After the issue', 'Limit', 'Status'].map(thMap([4])))]),
        h('tbody', null, rows.map(function (r) { return h('tr', null, [h('td', { 'data-notr': '1', text: r[0] }), h('td', { class: 'num', text: r[1] }), h('td', { class: 'num', text: r[2] }), h('td', { class: 'num', text: r[3] }), h('td', { text: r[4], class: r[4] === ok(false) ? 'neg' : '' })]); }))]),
        h('p', { class: 'f-help', 'data-notr': '1', text: fa() ? '«پس از انتشار» در مبلغ ظرفیت پیشنهادی (' + N(M.X) + ') و با فرض اینکه وجوه اوراق به دارایی تبدیل می‌شود. سازمان شرط ۹۰٪ (۹۵٪) را روی آخرین صورت‌های مالی حسابرسی‌شده می‌سنجد؛ ستون «پس از انتشار» برای سنجش فاصلهٔ شما تا سقف است.' : '“After the issue” is at the recommended amount (' + N(M.X) + '), assuming the proceeds become assets. The SEO tests the 90% (95%) rule on the last audited statements; the after-issue column shows how much room is left.' })]);
      var sens = !ready ? null : h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['Rate', 'Recommended capacity', 'Interest cover limit', 'Binding'].map(thMap([3])))]),
        h('tbody', null, [0.18, 0.2, 0.23, 0.25, 0.28, 0.3, 0.35, 0.4].concat([num(m.rate)]).filter(function (v, k, a) { return v > 0 && a.indexOf(v) === k; }).sort(function (a, b) { return a - b; }).map(function (r) {
          var Z = simpleCap(Object.assign({}, m, { rate: r })), icl = Z.limits.filter(function (x) { return x.key === 'cover'; })[0];
          return h('tr', { class: r === num(m.rate) ? 'flag' : '' }, [h('td', { text: pc(r, 1) }), h('td', { class: 'num', text: isFinite(Z.rec) ? N(Z.rec) : '–' }), h('td', { class: 'num', text: icl && isFinite(icl.v) ? N(icl.v) : '–' }), h('td', { 'data-notr': '1', class: 'small', text: Z.blocked.length ? (fa() ? 'شرط برقرار نیست' : 'condition fails') : Z.bind ? tx(Z.bind.label).split('(')[0] : '–' })]); }))])]);
      return ctx.group([pcPanel, ctx.two(ctx.panel('Your figures', [clrM, form]), ctx.panel('Recommended issue capacity', [head, ready ? h('p', { class: 'f-help', 'data-notr': '1', text: (fa() ? 'نسبت بدهی به دارایی: ' : 'Liabilities / assets: ') + pc(M.r.la0) + ' / ' + pc(M.laCap, 0) + ' · ' + (fa() ? 'جریان نقد دو سال: ' : 'CFO two years: ') + N(M.cfoSum) + ' · ' + (fa() ? 'پوشش بهره پس از انتشار: ' : 'interest cover after: ') + fx(M.r.ic1) }) : null])), ready && isFinite(M.rec) ? ctx.panel('Annual profit (interest) to pay on the sukuk', [interestView(interestPlan(M.X, num(m.rate), Math.max(1, num(m.months)) / 12, 4, 'bullet', Math.abs(num(m.fc)), NaN, todayJ()), h)]) : null, ready ? ctx.panel('How the recommended capacity was calculated', [stepsView(simpleSteps(M), M.rec, M.bind && M.bind.key, M.blocked, h)]) : null, ready ? ctx.panel('Limits on the issue', [lt]) : null, ready ? ctx.panel('Ratios computed by the model', [rt]) : null, ready ? ctx.panel('Capacity at other rates (higher rate → lower capacity)', [sens]) : null, ctx.panel('Symbols used in the formulas', [symTable(h)])]);
    }], ['ytm', 'Sukuk cost (ytm)', function (ctx) {
      var S = ctx.S, A = ctx.R; if (!S.yt) S.yt = ytDefault(); var Y = S.yt, J = Hub.jalali;
      var recA = A && isFinite(A.recMax) && A.recMax > 0 ? A.recMax : (S.q && S.q.capital ? num(S.q.capital) : 10000), rate = A && isFinite(A.rate) ? A.rate : num(Y.coupon);
      var K = ytCost(S, recA, rate);
      var form = G.form({ id: 'sk-yt', onChange: ctx.rerender, fields: [
        { type: 'head', label: 'The sukuk' },
        { key: 'yam', label: 'Issue amount', options: [['rec', (fa() ? 'ظرفیت پیشنهادی (' : 'Recommended capacity (') + U.fmtNum(recA) + ')'], ['manual', 'My amount']], get: function () { return Y.amountMode; }, set: function (v) { Y.amountMode = v; } },
        ctx.field('yamt', 'My amount', 'yt.amount', 'num'),
        { key: 'ycm', label: 'Coupon', options: [['rate', (fa() ? 'نرخ تعیین‌شده برای ظرفیت (' : 'Rate set for the capacity (') + U.fmtPct(rate, 2) + ')'], ['manual', 'My coupon']], get: function () { return Y.couponMode; }, set: function (v) { Y.couponMode = v; } },
        ctx.field('ycp', 'My coupon (annual)', 'yt.coupon', 'pct2', { unit: '%' }),
        ctx.field('yyr', 'Tenor in years (0 = from the issue terms)', 'yt.years', 'int'),
        { key: 'yfr', label: 'Coupons per year', options: [['4', 'Quarterly (4)'], ['2', 'Semi-annual (2)'], ['12', 'Monthly (12)'], ['1', 'Annual (1)']], get: function () { return String(Y.freq); }, set: function (v) { Y.freq = +v; } },
        { key: 'yd0', label: 'Subscription date (Shamsi)', text: true, unit: '1405/09/15', get: function () { return Y.issueDate; }, set: function (v) { if (isFinite(J.parse(v))) Y.issueDate = v.trim(); else U.toast('Date not recognised: 1405/09/15', 'warn'); } },
        { key: 'ypd', label: 'Payment day of the month', options: [['auto', 'Automatic (same day as subscription)']].concat(Array.from({ length: 31 }, function (_, i) { return [String(i + 1), String(i + 1)]; })), get: function () { return String(Y.payDay); }, set: function (v) { Y.payDay = v; } },
        { key: 'ypr', label: 'Principal', options: [['bullet', 'Bullet at maturity'], ['equal', 'Equal instalments with each coupon']], get: function () { return Y.principal || 'bullet'; }, set: function (v) { Y.principal = v; } },
        { type: 'head', label: 'Business days and holidays' },
        { key: 'ycv', label: 'Payment date adjustment', options: [['next', 'Next business day'], ['modfollow', 'Next business day, same month'], ['prev', 'Previous business day'], ['none', 'No adjustment']], get: function () { return Y.cal.conv; }, set: function (v) { Y.cal.conv = v; } },
        { key: 'ywk', label: 'Weekend', options: [['2', 'Thursday and Friday'], ['1', 'Friday only']], get: function () { return String(Y.cal.weekend); }, set: function (v) { Y.cal.weekend = +v; } },
        { key: 'yex', label: 'Extra or corrected holidays (comma-separated Shamsi dates)', text: true, unit: '1405/12/29, 1406/01/05', get: function () { return Y.cal.extra; }, set: function (v) { Y.cal.extra = v; } },
        { key: 'ylu', label: 'Apply lunar holidays', options: [['1', 'Yes'], ['0', 'No']], get: function () { return Y.cal.lunar ? '1' : '0'; }, set: function (v) { Y.cal.lunar = v === '1'; } },
        { type: 'head', label: 'Solver' },
        ctx.field('ycap', 'Rate approved by the SEO', 'yt.cap', 'pct2', { unit: '%' }),
        { key: 'ymo', label: 'Mode', options: [['rate', '1 · Give me the rate'], ['solve', '2 · Solve an unknown']], get: function () { return Y.mode; }, set: function (v) { Y.mode = v; } },
        { key: 'ylv', label: 'Lever (mode 1): what to adjust to stay within the approved rate', options: [['cpn', 'Coupon'], ['fee', 'Fees inside the SEO rate']], get: function () { return Y.lever; }, set: function (v) { Y.lever = v; } },
        ctx.field('ytg', 'Target rate (mode 2)', 'yt.target', 'pct2', { unit: '%' }),
        { key: 'ytb', label: 'Target based on (mode 2)', options: [['seo', 'SEO rate (without the side letter)'], ['all', 'True issuer cost (with the side letter)']], get: function () { return Y.tbase; }, set: function (v) { Y.tbase = v; } },
        { key: 'yuk', label: 'Unknown to solve (mode 2)', options: [['cpn', 'Coupon'], ['amt', 'Issue amount']].concat(Y.fees.map(function (f, i) { return ['f' + i, f.name]; })), get: function () { return Y.unk; }, set: function (v) { Y.unk = v; } }] });
      var fees = ctx.list({ id: 'sk-yt-fees', path: 'yt.fees', newRow: function () { return { name: 'رکن جدید', pct: 0, unit: '%', basis: 'o', timing: '0', delay: 0, seo: true }; }, cols: [
        { key: 'name', label: 'Party', kind: 'text' }, { key: 'pct', label: 'Percent (or amount)', fmt: 'num4' },
        { key: 'unit', label: 'Unit', kind: 'select', options: function () { return [['%', 'Percent of the issue'], ['A', 'Fixed amount']]; } },
        { key: 'basis', label: 'Basis', kind: 'select', options: function () { return [['o', 'One-off'], ['y', 'Annual']]; }, onSet: function (row) { row.timing = row.basis === 'y' ? 's' : '0'; }, repaint: true },
        { key: 'timing', label: 'Timing', kind: 'select', options: function (row) { return row.basis === 'y' ? [['s', 'Start of each year'], ['m', 'Middle of each year'], ['e', 'End of each year'], ['0', 'Whole term at once, subscription day']] : [['0', 'Subscription day'], ['M', 'Maturity']]; } },
        { key: 'delay', label: 'Delay (days)' }, { key: 'seo', label: 'In SEO rate', kind: 'bool' }] });
      var out = [];
      if (!K || K.error) out.push(h('p', { class: 'neg', text: (fa() ? 'محاسبه ممکن نشد: ' : 'Could not compute: ') + (K && K.error || '') }));
      else {
        var pc = function (x) { return isFinite(x) ? U.fmtPct(x, 2) : '–'; }, over = K.seo > K.cap;
        out.push(h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('tbody', null, [
          [fa() ? 'نرخ سازمان — بدون الحاقیه' : 'SEO rate — without the side letter', pc(K.seo)], [fa() ? 'هزینهٔ واقعی بانی (با الحاقیه)' : 'True issuer cost (with the side letter)', pc(K.all)], [fa() ? 'فقط اصل و کوپن' : 'Principal and coupons only', pc(K.bare)],
          [fa() ? 'خالص واریزی روز اول' : 'Net received on day one', U.fmtNum(K.net)], [fa() ? 'مبلغ، کوپن، مدت' : 'Amount, coupon, tenor', U.fmtNum(K.amount) + ' · ' + pc(K.coupon) + ' · ' + K.years + (fa() ? ' سال' : ' y')]
        ].map(function (r) { return h('tr', null, [h('td', { text: r[0] }), h('td', { class: 'num', text: r[1] })]); }))])]));
        out.push(h('p', { class: over ? 'neg' : 'pos', text: over ? (fa() ? 'نرخ سازمان ' + ((K.seo - K.cap) * 100).toFixed(2) + ' واحد بالاتر از سقف است.' : 'SEO rate ' + ((K.seo - K.cap) * 100).toFixed(2) + ' points above the cap.') : (fa() ? 'زیر سقف — فاصله ' + ((K.cap - K.seo) * 100).toFixed(2) + ' واحد.' : 'Within the cap — ' + ((K.cap - K.seo) * 100).toFixed(2) + ' points of room.') }));
        var sv;
        if (Y.mode === 'rate') { sv = ytSolveRate(K, Y.lever);
          out.push(h('p', null, [h('strong', { text: sv.err === 'unreachable' ? (fa() ? 'حتی با صفر کردن این اهرم هم به سقف نمی‌رسید.' : 'Even at zero this lever cannot reach the cap.') : sv.err ? (fa() ? 'محاسبه ممکن نشد.' : 'Could not compute.')
            : Y.lever === 'cpn' ? (fa() ? 'حداکثر نرخ کوپن: ' : 'Maximum coupon: ') + pc(sv.x) + (fa() ? ' (نرخ سازمان حاصل ' : ' (SEO rate ') + pc(sv.got) + ')' : (fa() ? 'ضریب مجاز کارمزدها: ' : 'Allowed fee multiple: ') + sv.x.toFixed(3) + '× (' + (fa() ? 'نرخ حاصل ' : 'rate ') + pc(sv.got) + ')' })]));
        } else { sv = ytSolveUnknown(K, Y.unk, num(Y.target), Y.tbase);
          var nm = Y.unk === 'cpn' ? (fa() ? 'نرخ کوپن' : 'Coupon') : Y.unk === 'amt' ? (fa() ? 'مبلغ انتشار' : 'Issue amount') : (Y.fees[+Y.unk.slice(1)] || {}).name;
          var msg = { amtPct: fa() ? 'وقتی همهٔ کارمزدها درصدی‌اند، نرخ مؤثر به مبلغ انتشار بستگی ندارد؛ دست‌کم یک رکن را روی «مبلغ ثابت» بگذارید.' : 'With only percentage fees the rate does not depend on the amount; set at least one fee to a fixed amount.',
            notInSeo: fa() ? 'تیک «در نرخ سازمان» این رکن برداشته شده؛ هدف را روی «هزینهٔ واقعی بانی» بگذارید یا تیک را بزنید.' : 'This fee is not in the SEO rate; tick it or base the target on the true cost.',
            none: fa() ? 'با این ورودی‌ها نرخی محاسبه نمی‌شود (مبلغ صفر یا کارمزد بیش از مبلغ).' : 'No rate can be computed with these inputs.', flat: fa() ? 'تغییر این متغیر روی نرخ اثری ندارد.' : 'This variable does not move the rate.', pick: fa() ? 'متغیر مجهول را انتخاب کنید.' : 'Pick the unknown.' };
          if (sv.err === 'range') out.push(h('p', { class: 'neg', text: (fa() ? 'با تغییر ' + nm + ' به‌تنهایی به ' + pc(num(Y.target)) + ' نمی‌رسید؛ نرخ فقط بین ' + pc(sv.lowV) + ' و ' + pc(sv.highV) + ' جابه‌جا می‌شود.' : nm + ' alone cannot reach ' + pc(num(Y.target)) + '; the rate only moves between ' + pc(sv.lowV) + ' and ' + pc(sv.highV) + '.') }));
          else if (sv.err) out.push(h('p', { class: 'neg', text: msg[sv.err] || sv.err }));
          else { var val = Y.unk === 'cpn' ? pc(sv.x) : Y.unk === 'amt' || sv.isFeeA ? U.fmtNum(sv.x) : sv.x.toFixed(4) + '%';
            out.push(h('p', null, [h('strong', { text: nm + ': ' + val }), document.createTextNode(' · ' + (fa() ? 'نرخ سازمان ' : 'SEO rate ') + pc(sv.seo) + ' · ' + (fa() ? 'هزینهٔ واقعی ' : 'true cost ') + pc(sv.all))]));
            out.push(h('button', { class: 'btn', type: 'button', text: fa() ? 'اعمال' : 'Apply', onclick: function () { if (Y.unk === 'cpn') { Y.couponMode = 'manual'; Y.coupon = sv.x; } else if (Y.unk === 'amt') { Y.amountMode = 'manual'; Y.amount = Math.round(sv.x); } else Y.fees[sv.fi].pct = +sv.x.toFixed(4); ctx.rerender(); } }));
          }
        }
        var yr = ytYearly(K.sc);
        out.push(h('h3', { text: fa() ? 'صورت پرداخت (سال از تاریخ پذیره‌نویسی)' : 'Payments by year from subscription' }));
        out.push(h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, [fa() ? 'سال' : 'Year', fa() ? 'کل پرداخت' : 'Total paid', fa() ? 'سهم کارمزد' : 'Of which fees'].map(thMap([])))]),
          h('tbody', null, yr.map(function (r) { return h('tr', null, [h('td', { text: String(r.y) }), h('td', { class: 'num', text: U.fmtNum(r.total) }), h('td', { class: 'num', text: U.fmtNum(r.fees) })]); }).concat([h('tr', { class: 'flag' }, [h('td', { text: fa() ? 'جمع' : 'Total' }), h('td', { class: 'num', text: U.fmtNum(yr.reduce(function (s2, r) { return s2 + r.total; }, 0)) }), h('td', { class: 'num', text: U.fmtNum(yr.reduce(function (s2, r) { return s2 + r.fees; }, 0)) })])]))])]));
        var sh = K.sc.shifts;
        out.push(h('h3', { text: fa() ? 'تاریخ‌های جابه‌جاشده' : 'Moved payment dates' }));
        if (Y.cal.conv === 'none') out.push(h('p', { class: 'f-help', text: fa() ? 'تعدیل خاموش است.' : 'Adjustment is off.' }));
        else if (!sh.length) out.push(h('p', { class: 'f-help', text: fa() ? 'هیچ تاریخ پرداختی روی تعطیلی نیفتاده است.' : 'No payment date falls on a holiday.' }));
        else { var y0 = JSON.parse(JSON.stringify(K.st)); y0.cal.conv = 'none'; var Rn = ytRates(y0);
          out.push(h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, [fa() ? 'پرداخت' : 'Payment', fa() ? 'از' : 'From', fa() ? 'به' : 'To', fa() ? 'دلیل' : 'Why'].map(thMap([3])))]),
            h('tbody', null, sh.slice(0, 30).map(function (x) { return h('tr', null, [h('td', { 'data-notr': '1', text: fa() ? String(x.label).replace(/^Coupon \+ principal/, 'اصل و کوپن').replace(/^Coupon/, 'کوپن') : x.label }), h('td', { class: 'num', text: J.jstr(x.raw) }), h('td', { class: 'num', text: J.jstr(x.adj) }), h('td', { 'data-notr': '1', class: 'small', text: fa() ? String(x.why || '').replace('Friday', 'جمعه').replace('Thursday', 'پنجشنبه') : x.why || '' })]); }))])]));
          out.push(h('p', { class: 'f-help', text: (fa() ? 'اثر تعدیل: نرخ سازمان ' : 'Effect of the adjustment: SEO rate ') + pc(Rn.seo) + ' → ' + pc(K.seo) + (fa() ? '؛ هزینهٔ بانی ' : '; issuer cost ') + pc(Rn.all) + ' → ' + pc(K.all) + ' (' + sh.length + (fa() ? ' تاریخ جابه‌جا شد)' : ' dates moved)') }));
        }
        out.push(h('p', { class: 'f-help', text: fa() ? 'روش: XIRR روی تاریخ‌های واقعی با مبنای ۳۶۵ روز؛ جابه‌جایی تاریخ مبلغ کوپن را عوض نمی‌کند، فقط زمان پرداخت را. تعطیلات قمری با تقویم جدولی تقریبی است و ممکن است یک تا دو روز با اعلام رسمی فرق کند.' : 'Method: XIRR on actual dates, 365-day basis; moving a date changes when the coupon is paid, not its amount. Lunar holidays use the tabular calendar and may differ by a day or two from the official announcement.' }));
      }
      return ctx.group([ctx.two(ctx.panel('Inputs', [form]), ctx.panel('Effective rate', out)), ctx.panel('Fees of the parties', [fees, h('p', { class: 'f-help', text: 'Percent fees are entered as percent (11.67 = 11.67% of the issue). Do not tick “In SEO rate” for the side letter.' })])]);
    }], ['inputs', 'Company, gates and credit', function (ctx) {
      var x = ctx.S.x, sel = function (k, label, opts) { return { key: k, label: label, options: opts, get: function () { return String(x[k]); }, set: function (v) { x[k] = v; } }; };
      var OP = [['unqualified', 'Unqualified'], ['qualified', 'Qualified'], ['adverse', 'Adverse'], ['disclaimer', 'Disclaimer'], ['none', 'Not audited']];
      var RT = [['none', 'No rating']].concat(R.RATINGS.map(function (r) { return [r, r]; })).concat([['below', 'Below BBB-']]);
      var f1 = G.form({ id: 'sk-co', onChange: ctx.recompute, fields: [
        sel('entity', 'Originator type', [['company', 'Company / cooperative / fund / non-government public body'], ['bank', 'Bank, credit institution or leasing (CBI)'], ['gov', 'Government body, state company or municipality']]),
        sel('form', 'Legal form', [['joint', 'Joint-stock (عام or خاص)'], ['coop', 'Cooperative'], ['fund', 'Investment fund'], ['public', 'Non-government public body'], ['other', 'Other (e.g. limited liability)']]),
        sel('iran', 'Registered and mainly active in Iran', YN), sel('listed', 'Listing', [['no', 'Not listed'], ['tse1', 'TSE main board'], ['tse2', 'TSE secondary board'], ['ifb1', 'IFB first market'], ['ifb2', 'IFB second market'], ['ifb3', 'IFB base market']]),
        sel('op1', 'Auditor’s opinion, year before last', OP), sel('op0', 'Auditor’s opinion, last year', OP), sel('insp', 'Inspector’s opinion (last two years)', [['ok', 'Not adverse / not disclaimer'], ['bad', 'Adverse or disclaimer']]),
        sel('trusted', 'Auditor on the SEO-trusted list', YN), sel('defaulted', 'Late payment on any securities in the last 2 years', [['no', 'No'], ['yes', 'Yes']]),
        sel('interimCfoPositive', 'Audited interim CFO makes the two-year sum positive', [['no', 'No / not applicable'], ['yes', 'Yes']]),
        sel('knowledge', 'Knowledge-based company (دانش‌بنیان)', [['no', 'No'], ['yes', 'Yes']]),
        ctx.field('tm', 'Tenor (months)', 'x.tenorMonths', 'int'), ctx.field('cp', 'Coupon / profit rate', 'coupon', 'pct2', { unit: '%' }),
        ctx.field('os', 'Debt securities issued or approved since the last audited statements', 'x.outstanding', 'num'),
        ctx.field('so', 'Outstanding small short-term murabaha (unit of the statements)', 'x.smallOutstanding', 'num'),
        sel('draft1405', 'Apply the draft 1405 amendment of small murabaha (5,000 bn rials with a qualifying guarantor; not yet in force)', [['no', 'No'], ['yes', 'Yes']])] });
      var f2 = G.form({ id: 'sk-cr', onChange: ctx.recompute, fields: [
        sel('rating', 'Originator’s credit rating', RT), sel('issueRating', 'Issue rating', [['same', 'Same as originator']].concat(R.RATINGS.map(function (r) { return [r, r]; }))),
        sel('guarantor', 'Guarantor', Object.keys(R.GUARANTORS).map(function (k) { return [k, tx(R.GUARANTORS[k])]; })),
        sel('guarantorControlled', 'Guarantor controlled by the originator', [['no', 'No'], ['yes', 'Yes']]),
        sel('bankGuaranteeCbi', 'Bank guarantee with prior CBI approval', YN),
        ctx.field('gl', 'Guarantor’s limit (0 = not known)', 'x.guarantorLimit', 'num')] });
      return ctx.group([ctx.two(ctx.panel('Originator', [f1]), ctx.panel('Credit enhancement', [f2, h('p', { class: 'muted', text: 'A guarantor must be a bank or credit institution, insurer, investment bank, investment company, public body or state company, and not controlled by the originator. Without a guarantor: rating ≥ BBB- and listing (debt-ratio cap), or pledged securities.' })]))]);
    }], ['assets', 'Assets and collateral', function (ctx) {
      var x = ctx.S.x, D = ctx.R.D;
      var ij = ctx.list({ id: 'sk-ij', path: 'x.ijAssets', newRow: function () { return { kind: 'machinery', value: 0, life: 10, insured: 'yes', lien: 'no' }; }, cols: [
        { key: 'kind', label: 'Asset', kind: 'select', options: function () { return Object.keys(R.IJ_ASSETS).map(function (k) { return [k, tx(R.IJ_ASSETS[k])]; }); } },
        { key: 'value', label: 'Expert value' }, { key: 'life', label: 'Remaining life (years)' },
        { key: 'insured', label: 'Insured', kind: 'select', options: function () { return YN; } }, { key: 'lien', label: 'Pledged / restricted', kind: 'select', options: function () { return [['no', 'No'], ['yes', 'Yes']]; } }] });
      var mu = ctx.list({ id: 'sk-mu', path: 'x.muAssets', newRow: function () { return { kind: 'materials', value: 0, related: 'no' }; }, cols: [
        { key: 'kind', label: 'Goods / asset', kind: 'select', options: function () { return Object.keys(R.MU_ASSETS).map(function (k) { return [k, tx(R.MU_ASSETS[k])]; }); } },
        { key: 'value', label: 'Value (pro-forma)' }, { key: 'related', label: 'Seller related to originator', kind: 'select', options: function () { return [['no', 'No'], ['yes', 'Yes']]; } }] });
      var co = ctx.list({ id: 'sk-co2', path: 'x.coll', newRow: function () { return { type: 'tse1', value: 0 }; }, cols: [
        { key: 'type', label: 'Security', kind: 'select', options: function () { return Object.keys(R.COLL).map(function (k) { return [k, tx(R.COLL[k])]; }); } },
        { key: 'value', label: 'Value (6-month average price)' },
        { key: 'cf', label: 'Coefficient', kind: 'calc', fmt: 'dec', calc: function (row) { return R.collCoef(row.type, R.RATINGS.indexOf(x.rating) >= 0 ? x.rating : null); } }] });
      var defs = G.form({ id: 'sk-def', onChange: ctx.recompute, fields: [
        { key: 'bp', label: 'No ijara asset entered: use book value of fixed assets as a placeholder', options: [['1', 'Yes'], ['0', 'No']], get: function () { return x.useBookPpe ? '1' : '0'; }, set: function (v) { x.useBookPpe = v === '1'; } },
        { key: 'bm', label: 'No murabaha goods entered: estimate from cost of sales', options: [['1', 'Yes'], ['0', 'No']], get: function () { return x.useCogsMaterials ? '1' : '0'; }, set: function (v) { x.useCogsMaterials = v === '1'; } },
        ctx.field('mt', 'Materials share of cost of sales', 'x.materials', 'pct', { unit: '%' }), ctx.field('mo', 'Months of purchases to finance', 'x.months', 'int')] });
      return ctx.group([ctx.two(ctx.panel('Ijara: assets to sell and lease back, or to buy', [ij, h('p', { class: 'muted', text: 'Land, buildings, machinery, vehicles or listed shares; official expert value; tenor ≤ remaining economic life; insured; free of liens. Minimum 50 bn rials.' })]),
        ctx.panel('Murabaha: goods or assets to buy', [mu, h('p', { class: 'muted', text: 'Seller must not share ownership with the originator. Minimum 10 bn rials.' })])),
        ctx.two(ctx.panel('Securities you could pledge instead of a guarantor', [co, h('p', { class: 'muted', text: 'Coefficients follow the rating entered (table 2 of the rating instruction); without a rating, the base table of the instructions applies.' })]), ctx.panel('Defaults when lists are empty', [defs, h('p', { class: 'muted', 'data-notr': '1', text: D ? (fa() ? 'دارایی ثابت دفتری: ' + U.fmtNum(D.ppe[D.n - 1]) + ' · بهای تمام‌شده: ' + U.fmtNum(D.cogs[D.n - 1]) : 'Fixed assets (book): ' + U.fmtNum(D.ppe[D.n - 1]) + ' · cost of sales: ' + U.fmtNum(D.cogs[D.n - 1])) : '' })]))]);
    }], ['process', 'Process, documents, sources', function (ctx) {
      var p = h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['Step', 'Timing', 'Basis'].map(function (t) { return h('th', { class: 'lbl', text: t }); }))]),
        h('tbody', null, R.PROCESS.map(function (s, i) { return h('tr', null, [h('td', { 'data-notr': '1', text: (i + 1) + '. ' + tx(s.step) }), h('td', { 'data-notr': '1', text: tx(s.time) }), h('td', { class: 'small muted', text: s.cite })]); }))]);
      var d = h('ul', { class: 'studio-l', 'data-notr': '1' }, R.DOCS.map(function (x) { return h('li', { text: tx(x) }); }));
      var s = h('ul', { class: 'studio-l', 'data-notr': '1' }, R.SOURCES.map(function (x) { return h('li', { text: x[0] + ' ' + (fa() ? x[2] : x[1]) }); }));
      return ctx.group([ctx.panel('Process (public murabaha; ijara is similar)', [h('div', { class: 'grid-wrap' }, [p]), h('p', { class: 'f-help', text: 'Durations other than the regulatory deadlines are indicative.' })]),
        ctx.two(ctx.panel('Documents', [d]), ctx.panel('Sources encoded', [s]))]);
    }]] }]
  });
  Hub.tools = Hub.tools || {}; Hub.tools.sukukCap = { capCore: capCore, ytCost: ytCost, ytSolveRate: ytSolveRate, ytSolveUnknown: ytSolveUnknown, ytYearly: ytYearly, ytDefault: ytDefault, interestPlan: interestPlan };
})(typeof window !== 'undefined' ? window : globalThis);
