# نقشه کدها

۶۹ فایل پایتون، ۱۲٬۳۳۷ خط. فقط کتابخانه استاندارد پایتون + `openpyxl`.
هیچ وابستگی دیگری ندارد — نه numpy، نه pandas، نه scipy.

```bash
pip install openpyxl
python src/build_all.py --out .        # ساخت هر پنج فایل اکسل
python tests/test_timeframe.py         # ۱۶۶ تست
```

---

## ۱) ساخت فایل‌های اکسل — `src/`

| فایل | کار |
|---|---|
| `build_all.py` | نقطه ورود. `--only gold` یا `--out DIR` |
| `build_workbook.py` | کتابخانه شیت‌ها: Settings، Watchlist، Signals، Calculations، Options، Dashboard، API_Map، Documentation |
| `common.py` | رنگ، قلم، قالب عدد، حاشیه، تبدیل تاریخ |
| `sample_data.py` | داده نمایشی قطعی (`SEED=1404`). **واقعی نیست** و صریحاً برچسب خورده |
| `workbooks/registry.py` | ثبت پنج سازنده: stocks، options، time، gold، fx |
| `workbooks/stocks.py` | فایل سیگنال بورس و فرابورس |
| `workbooks/options.py` | فایل آپشن |
| `workbooks/time_analysis.py` | فایل تحلیل زمانی |
| `workbooks/gold.py` | فایل طلا و سکه |
| `workbooks/fx.py` | فایل دلار و تتر |
| `workbooks/assets_common.py` | شیت تاریخچه مشترک دارایی‌های تک‌سری |
| `workbooks/asset_signals.py` | شیت سیگنال طلا/سکه/دلار/تتر — چهار زیرنمره T/M/V/P |

## ۲) موتور تحلیل زمانی — `src/timeframe/`

| فایل | کار |
|---|---|
| `spectral.py` | آشکارساز چرخه (Goertzel) با **تصحیح Šidák** — روی نویز محض چرخه نمی‌بیند |
| `hurst.py` | چرخه‌های اسمی، FLD، VTL، **منطقه کور لبه** |
| `gann.py` / `fib_time.py` | شمارش‌های زمانی گان و فیبوناچی |
| `elliott.py` | **اعتبارسنج** سه قانون الیوت، نه برچسب‌زن |
| `jalali.py` | تبدیل دوطرفه شمسی-میلادی (روی ۴۰۰۰ روز صفر خطا) |
| `series.py` / `filters.py` | ظرف سری زمانی و فیلترها |
| `macro/` | چرخه‌های بلند اقتصادی، ژئوپلیتیک، طلا، ایران — ۳۲ منبع |
| `cli.py` | `python -m timeframe analyze / backtest / export` |

## ۳) بک‌تست — `src/timeframe/backtest/`

| فایل | کار |
|---|---|
| `engine.py` | بک‌تستر long-only با هزینه، تأخیر اجرا، تشخیص صف قفل |
| `metrics.py` | شارپ، **PSR**، **شارپ تعدیل‌شده (DSR)**، افت، کالمار |
| `benchmark.py` | آزمون جایگشت: همان معاملات با زمان‌بندی تصادفی |
| `walkforward.py` | انتخاب پارامتر داخل‌نمونه، آزمون خارج‌نمونه |
| `asset_score.py` | **بازتولید سطربه‌سطر فرمول‌های شیت Asset_Signals** |
| `weight_search.py` | جست‌وجوی شبکه‌ای وزن + سه فیلتر آماری |

## ۴) پیش‌بینی — `src/timeframe/forecast/`

| فایل | کار |
|---|---|
| `regime.py` | مدل رژیم همیلتون (۱۹۸۹) با EM + شبیه‌سازی مونت‌کارلو |
| `base_rates.py` | نرخ پایه با **تصحیح همپوشانی پنجره** (n مؤثر = n/افق) |
| `scoring.py` | امتیاز Brier + تجزیه مورفی |
| `judgment.py` | دفتر ثبت پیش‌بینی به سبک تتلاک |
| `outlook.py` | مقایسه هم‌جنس سه روش |

## ۵) داده — `scripts/`

| فایل | کار |
|---|---|
| `tse_updater.py` | داده بورس از tsetmc |
| `fetch_gold_fx.py` | طلا و ارز. `--probe` / `--show` / `--write` / `--history` |
| `market_data/providers/tgju.py` | ۵ میرور لحظه‌ای + ۲ میرور تاریخچه |
| `market_data/providers/nobitex.py` | `/market/stats` + `/market/udf/history` + اردربوک |
| `market_data/base.py` | آزمون سلامت + **سازگاری متقابل مستقل از تورم** |
| `market_data/history.py` | ساخت سنجه ارزش‌گذاری با هم‌ترازی چند سری |
| `recalc.py` | بازمحاسبه با LibreOffice |
| `refresh_all.py` | زنجیره کامل به‌روزرسانی با ترتیب درست |
| `link_workbooks.py` | پل داده بین فایل‌ها (بدون ارجاع بین‌فایلی اکسل) |
| `fetch_reference_series.py` | سری‌های واقعی عمومی برای اعتبارسنجی وزن |
| `backtest_weights.py` | اجرای سنجش وزن‌ها |

---

## نقاط ورود پرکاربرد

```bash
# ساخت
python src/build_all.py --out .
python src/build_all.py --only gold --out .

# داده
python scripts/fetch_gold_fx.py --probe          # اول این
python scripts/fetch_gold_fx.py --history
python scripts/recalc.py Gold_Analysis.xlsx FX_Analysis.xlsx

# تحلیل
python -m timeframe analyze --csv series.csv --name فولاد
python -m timeframe backtest --csv series.csv --name فولاد

# اعتبارسنجی وزن‌ها
python scripts/fetch_reference_series.py
python scripts/backtest_weights.py
python scripts/backtest_weights.py --costs usdt --asset brazil

# همه‌چیز با هم
python scripts/refresh_all.py --fetch --fetch-gold-fx
```
