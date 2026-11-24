/* Six test companies for the strategy engine (illustrative inputs, not real firms).
 * expect: archetype, architecture and moves the engine must reach; expectNot: moves that must not lead. */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  Hub.stratScenarios = [
    { id: 1, fa: 'لبنیات — قیمت دستوری و فشار حاشیه', expect: 'مسئلهٔ اصلی: فشار بر هسته؛ معماری دفاع و بازقیمت‌گذاری؛ قیمت و هزینه در صدر', arch: 'core', archt: 'A01', inPicks: ['S01', 'S02'], notMain: ['S16', 'S13', 'S18'],
      E: { co: { name: 'سناریو ۱ — لبنیات (فرضی)', industry: 'لبنیات و فرآورده‌های شیر', sector: 'consumer', stage: 'mature', owner: 'private', listed: 'ifb', goal: 'profit', target: 'بازگشت حاشیهٔ EBITDA به سطح صنعت', question: 'چگونه زیر قیمت‌گذاری دستوری حاشیه را ترمیم کنیم؟' },
        mkt: { growth: 'low', position: 'challenger', rivalry: 4, buyers: 3, suppliers: 4, entry: 2, subs: 2, priceCtl: 'yes', fxInputs: 'yes', inflPass: 'partial', exportOpen: 'yes', sanctions: 'unk', cyclical: 'no', stateRival: 'no', unmet: 'unk', disrupt: 'no' },
        cap: { rev: 40000, ebitdaM: 0.08, peerM: 0.12, gmTrend: 'down', util: 0.65, custConc: 0.2, digital: 3, innov: 'some', mgmt: 'adequate', exec: 'mixed', cash: 'adequate', align: 'partly', gov: 'ready', brand: 'strong', costPos: 'high', diff: 'some', recurring: 'no', subs: 'no' },
        res: [{ name: 'برند شناخته‌شده', type: 'brand', v: 'yes', r: 'yes', i: 'yes', o: 'yes', use: 'used' }, { name: 'شبکهٔ توزیع سرد', type: 'network', v: 'yes', r: 'yes', i: 'no', o: 'yes', use: 'used' }],
        cons: { control: 'yes', risk: 'low', partner: 'unk', divest: 'no', intl: 'yes', digitalAppetite: 'unk', capital: null, time: 18 } } },
    { id: 2, fa: 'فولاد صادراتی — فقط متن شرکت (ارزیابی جامع)', expect: 'استخراج تحریم، صادرات، نوسان جهانی و نهادهٔ ارزبر از متن؛ مسئلهٔ اصلی عدم‌قطعیت؛ معماری تاب‌آوری', arch: 'unc', archt: 'A07', inPicks: ['S28'], notMain: ['S13', 'S16'], mode: 'full',
      E: { co: { name: 'سناریو ۲ — فولاد صادراتی (فرضی)' },
        text: 'شرکت تولیدکنندهٔ شمش و مقاطع فولادی است و حدود ۶۰٪ فروش آن صادراتی است. تحریم‌ها انتقال وجه صادرات و خرید قطعات یدکی را دشوار کرده است. الکترود گرافیتی و بخشی از قطعات خط تولید وارداتی است و به تخصیص ارز وابسته است. قیمت محصول تابع قیمت جهانی است و نوسان شدید دارد. حذف ارز ترجیحی و تغییر مقررات صادرات در راه است. سهامداران هنوز هدف روشنی برای پنج سال آینده تعیین نکرده‌اند.',
        cons: { intl: 'yes' } } },
    { id: 3, fa: 'خرده‌فروشی زنجیره‌ای — تهدید دیجیتال', expect: 'مسئلهٔ اصلی: اختلال؛ معماری دوسوتوانی؛ واحد مستقل یا کانال دیجیتال', arch: 'disrupt', archt: 'A05', inPicks: ['S27', 'S12', 'S26'], anyPick: true, notMain: ['S16', 'S20'],
      E: { co: { name: 'سناریو ۳ — خرده‌فروشی زنجیره‌ای (فرضی)', industry: 'خرده‌فروشی کالای مصرفی', sector: 'retail', stage: 'mature', owner: 'private', listed: 'none', goal: 'digital', question: 'چگونه در برابر فروشگاه‌های آنلاین سهم را حفظ کنیم؟' },
        mkt: { growth: 'low', position: 'leader', rivalry: 4, buyers: 3, entry: 4, subs: 4, priceCtl: 'no', fxInputs: 'no', disrupt: 'yes', unmet: 'yes', exportOpen: 'no', conc: 'fragmented' },
        cap: { rev: 90000, ebitdaM: 0.06, peerM: 0.07, gmTrend: 'flat', util: 0.85, custConc: 0.02, digital: 1, innov: 'none', mgmt: 'adequate', exec: 'good', cash: 'strong', align: 'partly', brand: 'strong', costPos: 'avg', diff: 'some', recurring: 'no', subs: 'no' },
        res: [{ name: 'دادهٔ خرید باشگاه مشتریان (بلااستفاده)', type: 'data', v: 'yes', r: 'yes', i: 'yes', o: 'no', use: 'idle' }, { name: 'شبکهٔ فروشگاه‌ها در مکان‌های خوب', type: 'asset', v: 'yes', r: 'yes', i: 'yes', o: 'yes', use: 'used' }],
        cons: { control: 'yes', risk: 'med', partner: 'yes', divest: 'unk', intl: 'no', digitalAppetite: 'yes', capital: 2000 } } },
    { id: 4, fa: 'قطعه‌ساز خانوادگی — هدف عرضهٔ اولیه با حاکمیت ضعیف', expect: 'مسئلهٔ اصلی: آمادگی عرضه؛ آماده‌سازی عرضه مشروط (نه قطعی) تا اصلاح حاکمیت؛ کاهش تمرکز مشتری', arch: 'ipo', archt: 'A11', inPicks: ['S30'], notDefinitive: ['S30'], notMain: ['S16', 'S13'],
      E: { co: { name: 'سناریو ۴ — قطعه‌ساز خانوادگی (فرضی)', industry: 'قطعات خودرو', sector: 'manufacturing', stage: 'growth', owner: 'family', listed: 'none', goal: 'ipo', target: 'پذیرش در فرابورس ظرف ۱۸ ماه', question: 'برای عرضهٔ اولیه چه باید تغییر کند؟' },
        mkt: { growth: 'med', position: 'challenger', rivalry: 3, buyers: 5, suppliers: 3, priceCtl: 'no', fxInputs: 'yes', exportOpen: 'unk', disrupt: 'no' },
        cap: { rev: 25000, ebitdaM: 0.15, peerM: 0.13, gmTrend: 'flat', util: 0.8, custConc: 0.7, digital: 2, innov: 'some', mgmt: 'weak', exec: 'mixed', cash: 'adequate', align: 'no', gov: 'weak', brand: 'avg', costPos: 'low', diff: 'some', recurring: 'no', subs: 'no' },
        res: [{ name: 'دانش فنی قالب‌سازی', type: 'tech', v: 'yes', r: 'yes', i: 'yes', o: 'no', use: 'under' }],
        cons: { control: 'yes', risk: 'med', partner: 'no', divest: 'no', intl: 'unk', digitalAppetite: 'unk', time: 24 } } },
    { id: 5, fa: 'هلدینگ خصولتی با پرتفوی ناهمگن', expect: 'مسئلهٔ اصلی: پرتفوی؛ بازآرایی و واگذاری + بازطراحی نقش شرکت مادر', arch: 'port', archt: 'A09', inPicks: ['S20', 'S21'], notMain: ['S13', 'S10'],
      E: { co: { name: 'سناریو ۵ — هلدینگ خصولتی (فرضی)', industry: 'هلدینگ چندرشته‌ای', sector: 'holding', stage: 'mature', owner: 'semi', listed: 'tse', goal: 'holding', question: 'کدام شرکت‌ها بمانند، کدام واگذار شوند و نقش شرکت مادر چیست؟' },
        mkt: { growth: 'med' },
        cap: { mgmt: 'adequate', align: 'no', cash: 'adequate', subs: 'yes', gov: 'ready', digital: 2 },
        units: [{ name: 'سیمان', growth: 'low', pos: 'strong', fit: 'yes' }, { name: 'دارو', growth: 'high', pos: 'strong', fit: 'yes' }, { name: 'نساجی', growth: 'low', pos: 'weak', fit: 'no' }, { name: 'حمل‌ونقل', growth: 'low', pos: 'weak', fit: 'no' }, { name: 'فناوری اطلاعات', growth: 'high', pos: 'weak', fit: 'no' }, { name: 'املاک', growth: 'unk', pos: 'unk', fit: 'unk' }],
        cons: { control: 'yes', risk: 'med', partner: 'yes', divest: 'yes', intl: 'unk' } } },
    { id: 6, fa: 'استارتاپ فین‌تک در بازار پررشد — نقدینگی تنگ', expect: 'مسئلهٔ اصلی: رشد شتابان؛ نفوذ در بازار و شراکت؛ توسعهٔ ظرفیت سرمایه‌بر مسدود به‌دلیل نقدینگی', arch: 'scale', archt: 'A12', inPicks: ['S06'], blocked: ['S36'], notMain: ['S30', 'S20', 'S36'],
      E: { co: { name: 'سناریو ۶ — فین‌تک (فرضی)', industry: 'پرداخت و خدمات مالی دیجیتال', sector: 'tech', stage: 'startup', owner: 'private', listed: 'none', goal: 'growth', target: 'سه برابر کردن کاربران فعال', question: 'با نقدینگی محدود چگونه سریع‌تر از رقبا مقیاس بگیریم؟' },
        mkt: { growth: 'high', position: 'challenger', rivalry: 4, buyers: 2, entry: 4, conc: 'fragmented', priceCtl: 'no', fxInputs: 'no', disrupt: 'no', unmet: 'yes', regChange: 'yes' },
        cap: { rev: 1200, ebitdaM: -0.1, util: null, custConc: 0.05, digital: 5, innov: 'strong', mgmt: 'strong', exec: 'good', cash: 'tight', align: 'yes', brand: 'avg', costPos: 'avg', diff: 'high', recurring: 'yes', subs: 'no' },
        res: [{ name: 'تیم محصول و فناوری', type: 'people', v: 'yes', r: 'yes', i: 'no', o: 'yes', use: 'used' }, { name: 'مجوز پرداخت‌یاری', type: 'licence', v: 'yes', r: 'yes', i: 'yes', o: 'yes', use: 'used' }],
        cons: { control: 'yes', risk: 'high', partner: 'yes', divest: 'unk', intl: 'no', digitalAppetite: 'yes' } } }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
