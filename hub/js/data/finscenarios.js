/* The six test scenarios of the master brief (§17), as ready inputs for the engine. Figures are illustrative test data (billion rials), not a real company. */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var A = function (type, name, mv, o) { return Object.assign({ type: type, name: name, mv: mv, bv: null, inc: null, util: null, idle: null, title: 'clean', transfer: 'yes', pledge: 'yes', use: 'other', strategic: 'med', develop: 'unk', listed: 'unk', stake: null, sub: 'no', profitable: 'unk', longterm: 'unk', counter: 'unk', ime: 'unk' }, o || {}); };
  Hub.finScenarios = [
    { id: 1, fa: 'شرکت دارای املاک و مستغلات گسترده (۲۰ همت املاک، ۳۰٪ درآمدزا، بدون فروش مستقیم)',
      expect: 'تفکیک دارایی‌ها، صندوق املاک، شرکت تابعه، اوراق اجاره، مشارکت در توسعه و ساختار ترکیبی', expectIds: ['A01', 'A03', 'A07', 'D03', 'C02'], expectNot: ['A09'],
      E: { mode: 'auto', co: { name: 'سناریو ۱ — املاک', industry: 'سرمایه‌گذاری و املاک', listing: 'ifb', form: 'pjs', purpose: 'unknown', unit: 'billion', canEquity: 'unk', investorOk: 'yes', assetSaleOk: 'no', controlPriority: 'med', parentSubs: 'no' },
        assets: [A('realestate', 'مجتمع تجاری اجاره‌داده‌شده', 40000, { bv: 6000, inc: 3600, use: 'commercial', idle: 0 }), A('realestate', 'ساختمان اداری اجاره‌ای', 20000, { bv: 3000, inc: 1400, use: 'office', idle: 0.1 }),
          A('realestate', 'اراضی راکد شهری', 90000, { bv: 4000, inc: 0, use: 'land', idle: 1, develop: 'yes', strategic: 'low' }), A('realestate', 'انبارها و املاک کم‌بازده', 50000, { bv: 5000, inc: 600, use: 'industrial', idle: 0.6, strategic: 'low' })],
        fin: { rev: 8000, ebitda: 7000, ebit: 6000, fc: 1800, pbt: 4500, ni: 3700, ni1: 3200, cfo1: 4000, cfo2: 3000, ta: 260000, tl: 75000, eq: 185000, cap: 30000, cash: 2000, debt: 15000, debtST: 6000, ca: 15000, cl: 20000, ar: 3000, opinion: 'unqualified', guarantor: 'unk', rating: 'none', defaulted: 'no', priorIssues: 'no' },
        cons: { noSale: 'yes', noOwn: 'unk', control: 'yes', noDebt: 'no', noPledge: 'no', noTransfer: 'no', canSub: 'yes', canFund: 'yes', partnerOk: 'yes' } } },
    { id: 2, fa: 'تولیدکنندهٔ نیازمند سرمایه در گردش (کالای بورس کالا)', expect: 'مقایسهٔ مرابحه، سلف موازی، خرید دین، تسهیلات و تأمین مالی زنجیرهٔ تأمین', expectIds: ['D01', 'D05', 'D11', 'D17'], expectNot: [],
      E: { mode: 'auto', co: { name: 'سناریو ۲ — فولاد', industry: 'فولاد', listing: 'tse', form: 'pjs', purpose: 'wc', need: 5000, needBy: 4, unit: 'billion', ime: 'yes', canEquity: 'no', investorOk: 'no', assetSaleOk: 'no', controlPriority: 'high', debtAppetite: 'med' },
        assets: [A('inventory', 'موجودی شمش و محصول', 9000, { ime: 'yes' }), A('receivable', 'مطالبات تجاری', 7000, { longterm: 'no', counter: 'private' })],
        fin: { rev: 40000, cogs: 30000, ebitda: 7500, ebit: 6000, fc: 1200, pbt: 5500, ni: 4400, ni1: 3800, cfo1: 3500, cfo2: 2800, ta: 35000, tl: 18000, eq: 17000, cap: 8000, cash: 800, debt: 9000, debtST: 6000, ca: 20000, cl: 15000, ar: 7000, inv: 9000, ap: 6000,
          opinion: 'unqualified', guarantor: 'yes', rating: 'none', defaulted: 'no', priorIssues: 'yes' },
        cons: { noSale: 'yes', noOwn: 'yes', control: 'yes', noDebt: 'no', noPledge: 'no', noTransfer: 'no', canSub: 'unk', canFund: 'unk', partnerOk: 'no' } } },
    { id: 3, fa: 'شرکت دارای مطالبات بلندمدت', expect: 'خرید دین، فاکتورینگ، توثیق مطالبات و سایر روش‌های قابل اجرا', expectIds: ['D07', 'D19'], expectNot: [],
      E: { mode: 'auto', co: { name: 'سناریو ۳ — پیمانکار', industry: 'پیمانکاری', listing: 'none', form: 'prjs', purpose: 'wc', need: 3000, unit: 'billion', canEquity: 'unk', assetSaleOk: 'unk' },
        assets: [A('receivable', 'مطالبات از کارفرمای دولتی', 6000, { longterm: 'yes', counter: 'gov' }), A('receivable', 'اسناد دریافتنی مشتریان خصوصی', 2500, { longterm: 'no', counter: 'private' }), A('contract', 'قرارداد سه‌سالهٔ نگهداری', 4000)],
        fin: { rev: 12000, ebitda: 2200, ebit: 1900, fc: 500, pbt: 1500, ni: 1200, ni1: 900, cfo1: -500, cfo2: 800, ta: 18000, tl: 11000, eq: 7000, cap: 2000, cash: 300, debt: 3500, debtST: 2500, ca: 13000, cl: 9000, ar: 9000, opinion: 'qualified', guarantor: 'unk', rating: 'none' },
        cons: { noSale: 'unk', noOwn: 'unk', control: 'unk', noDebt: 'no', noPledge: 'no', noTransfer: 'unk', canSub: 'unk', canFund: 'unk', partnerOk: 'unk' } } },
    { id: 4, fa: 'شرکت دارای زمین و طرح توسعه', expect: 'شرکت پروژه، صندوق پروژه، شرکت سهامی عام پروژه، مشارکت در ساخت، ورود شریک و تأمین مالی پروژه‌ای', expectIds: ['D20', 'E07', 'E08', 'A07', 'C04'], expectNot: [],
      E: { mode: 'auto', co: { name: 'سناریو ۴ — زمین و طرح', industry: 'گردشگری و تجاری', listing: 'none', form: 'prjs', purpose: 'project', need: 30000, projectCost: 30000, unit: 'billion', investorOk: 'yes', assetSaleOk: 'no', controlPriority: 'med' },
        assets: [A('realestate', 'زمین طرح (کاربری تجاری)', 15000, { bv: 1500, inc: 0, use: 'land', idle: 1, develop: 'yes', strategic: 'high' })],
        fin: { rev: 3000, ebitda: 900, ebit: 800, fc: 200, pbt: 600, ni: 500, ni1: 400, cfo1: 700, cfo2: 500, ta: 20000, tl: 5000, eq: 15000, cap: 5000, cash: 500, debt: 1500, debtST: 500, opinion: 'unqualified', guarantor: 'unk', rating: 'none' },
        cons: { noSale: 'yes', noOwn: 'no', control: 'no', noDebt: 'no', noPledge: 'no', noTransfer: 'no', canSub: 'yes', canFund: 'yes', partnerOk: 'yes' } } },
    { id: 5, fa: 'هلدینگ دارای شرکت‌های تابعهٔ متعدد', expect: 'عرضهٔ شرکت‌های تابعه، تجمیع دارایی‌ها، تفکیک ساختار مالکیت، ایجاد شرکت تخصصی و تأمین مالی در سطح گروه', expectIds: ['E11', 'E12', 'A14', 'C06', 'C11'], expectNot: [],
      E: { mode: 'auto', co: { name: 'سناریو ۵ — هلدینگ', industry: 'هلدینگ چندرشته‌ای', listing: 'tse', form: 'pjs', parentSubs: 'yes', purpose: 'expand', need: 10000, unit: 'billion', canEquity: 'unk', investorOk: 'unk', assetSaleOk: 'yes', controlPriority: 'high' },
        assets: [A('financial', 'تابعهٔ غذایی (۸۰٪)', 12000, { stake: 80, sub: 'yes', profitable: 'yes', listed: 'no', strategic: 'high' }), A('financial', 'تابعهٔ لجستیک (۶۵٪)', 6000, { stake: 65, sub: 'yes', profitable: 'yes', listed: 'no', strategic: 'med' }),
          A('financial', 'تابعهٔ ساختمانی (۵۱٪)', 4000, { stake: 51, sub: 'yes', profitable: 'no', listed: 'no', strategic: 'low' }), A('financial', 'تابعهٔ دارویی بورسی (۵۵٪)', 9000, { stake: 55, sub: 'yes', profitable: 'yes', listed: 'yes', strategic: 'high' }),
          A('financial', 'پرتفوی سهام بورسی غیرراهبردی', 5000, { stake: 3, listed: 'yes', strategic: 'low' })],
        fin: { rev: 30000, ebitda: 6000, ebit: 5000, fc: 1500, pbt: 4000, ni: 3500, ni1: 3000, cfo1: 3000, cfo2: 2500, ta: 60000, tl: 25000, eq: 35000, cap: 15000, cash: 1500, debt: 12000, debtST: 6000, opinion: 'unqualified', guarantor: 'yes', rating: 'A' },
        cons: { noSale: 'no', noOwn: 'no', control: 'yes', noDebt: 'no', noPledge: 'no', noTransfer: 'no', canSub: 'yes', canFund: 'unk', partnerOk: 'unk' } } },
    { id: 6, fa: 'شرکت دارای بدهی بالا و ظرفیت محدود بازپرداخت', expect: 'عدم پیشنهاد بدهی جدید بدون بررسی؛ اولویت افزایش سرمایه، فروش دارایی‌های غیرمولد، مشارکت سرمایه‌گذار و اصلاح ساختار مالی', expectIds: ['E01', 'A09', 'C10'], expectNot: [],
      E: { mode: 'auto', co: { name: 'سناریو ۶ — پراهرم', industry: 'خودروسازی قطعه', listing: 'ifb', form: 'pjs', purpose: 'restructure', unit: 'billion', canEquity: 'yes', investorOk: 'yes', assetSaleOk: 'yes', controlPriority: 'med' },
        assets: [A('realestate', 'زمین و انبار مازاد', 12000, { bv: 2000, inc: 0, use: 'industrial', idle: 0.9, strategic: 'low' }), A('financial', 'سهام بورسی غیرراهبردی', 5000, { listed: 'yes', strategic: 'low', stake: 4 }),
          A('machinery', 'خطوط تولید', 20000, { bv: 9000, util: 0.55, strategic: 'high', pledge: 'no' })],
        fin: { rev: 25000, ebitda: 6000, ebit: 4000, fc: 9000, pbt: -4000, ni: -3000, ni1: -1000, cfo1: -1000, cfo2: 500, ta: 80000, tl: 76000, eq: 4000, cap: 10000, retained: -7000, cash: 1000, debt: 50000, debtST: 30000, ca: 30000, cl: 45000, opinion: 'qualified', guarantor: 'no', rating: 'none', defaulted: 'yes' },
        cons: { noSale: 'no', noOwn: 'no', control: 'no', noDebt: 'unk', noPledge: 'unk', noTransfer: 'no', canSub: 'unk', canFund: 'unk', partnerOk: 'yes' } } }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
