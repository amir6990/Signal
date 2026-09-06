# -*- coding: utf-8 -*-
"""
به‌روزرسانی کامل مجموعه، با ترتیب درست.

    python scripts/refresh_all.py                 # بدون فراخوانی API
    python scripts/refresh_all.py --fetch          # با گرفتن داده از tsetmc

ترتیب اهمیت دارد و اگر رعایت نشود زنجیره می‌شکند:

  ۰. گرفتن قیمت طلا و ارز        → Gold_Analysis.xlsx + FX_Analysis.xlsx
  ۱. گرفتن داده از API           → Stocks_Signals.xlsx  (اختیاری)
  ۲. بازمحاسبه فایل سهام
  ۳. تحلیل زمانی                 → Time_Analysis.xlsx + Time_Link در فایل سهام
  ۴. بازمحاسبه دوباره فایل سهام  ← چون گام ۳ فایل را با openpyxl بازنویسی کرده
                                    و مقادیر کش‌شده را پاک کرده است
  ۵. پل آپشن                     → Options_Signals.xlsx
  ۶. بازمحاسبه فایل آپشن و زمانی

گام ۴ همان جایی است که دستی انجام‌دادن زنجیره معمولاً اشتباه می‌شود: اسکریپت
پل، مقدار کش‌شده فرمول‌ها را می‌خواند و اگر فایل بین‌شان بازنویسی شده باشد،
چیزی برای خواندن نیست.
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, HERE)

import recalc as RC          # noqa: E402


def run(cmd, cwd=None):
    print("\n$ %s" % " ".join(cmd))
    r = subprocess.run(cmd, cwd=cwd or ROOT)
    return r.returncode


def main(argv=None):
    ap = argparse.ArgumentParser(description="به‌روزرسانی کامل مجموعه")
    ap.add_argument("--dir", default=ROOT)
    ap.add_argument("--fetch", action="store_true", help="گرفتن داده از tsetmc")
    ap.add_argument("--fetch-gold-fx", action="store_true", dest="fetch_gfx",
                    help="گرفتن قیمت طلا و ارز")
    ap.add_argument("--manual", default=None,
                    help="فایل JSON دستی برای طلا و ارز")
    ap.add_argument("--gold-fx-history", action="store_true", dest="gfx_hist",
                    help="پر کردن کل تاریخچه طلا و ارز از منبع، پیش از قیمت لحظه‌ای")
    ap.add_argument("--history", type=int, default=300)
    ap.add_argument("--skip-recalc", action="store_true",
                    help="بدون LibreOffice — فایل‌ها را خودتان در اکسل باز و ذخیره کنید")
    args = ap.parse_args(argv)

    d = os.path.abspath(args.dir)
    stocks = os.path.join(d, "Stocks_Signals.xlsx")
    options = os.path.join(d, "Options_Signals.xlsx")
    timef = os.path.join(d, "Time_Analysis.xlsx")
    for p in (stocks, options, timef):
        if not os.path.exists(p):
            print("! فایل یافت نشد: %s\n  اول اجرا کنید: python src/build_all.py" % p)
            return 1

    def do_recalc(*paths):
        # اگر بازمحاسبه شکست بخورد، ادامه دادن بی‌معناست: گام‌های بعدی مقدار
        # کش‌شده می‌خوانند و چیزی پیدا نمی‌کنند.
        if args.skip_recalc:
            print("ⓘ بازمحاسبه رد شد — فایل‌ها را در اکسل باز و ذخیره کنید: %s"
                  % "، ".join(os.path.basename(p) for p in paths))
            return 0
        rc = 0
        for p in paths:
            rc |= RC.recalc(p)
        return rc

    gold = os.path.join(d, "Gold_Analysis.xlsx")
    fx = os.path.join(d, "FX_Analysis.xlsx")

    print("═" * 70)
    print("گام ۰ — دریافت قیمت طلا و ارز")
    if args.fetch_gfx or args.manual or args.gfx_hist:
        ok = True
        if args.gfx_hist:
            # اول کل سری، بعد قیمت امروز روی آن. برعکسش، --history ردیف
            # امروز را پاک می‌کرد.
            ok = run([sys.executable, os.path.join(HERE, "fetch_gold_fx.py"),
                      "--history", "--dir", d]) == 0
        if ok and (args.fetch_gfx or args.manual):
            cmd = [sys.executable, os.path.join(HERE, "fetch_gold_fx.py"),
                   "--write", "--append-history", "--dir", d]
            if args.manual:
                cmd += ["--manual", args.manual]
            ok = run(cmd) == 0
        if ok:
            do_recalc(gold, fx)
    else:
        print("  رد شد (برای فعال‌سازی: --fetch-gold-fx یا --manual FILE.json"
              " یا --gold-fx-history)")

    print("═" * 70)
    print("گام ۱ — دریافت داده از API")
    if args.fetch:
        run([sys.executable, os.path.join(HERE, "tse_updater.py"),
             "--workbook", stocks, "--options", options,
             "--history", str(args.history)])
    else:
        print("  رد شد (برای فعال‌سازی: --fetch)")

    print("═" * 70)
    print("گام ۲ — بازمحاسبه فایل سهام")
    do_recalc(stocks)

    print("═" * 70)
    print("گام ۳ — تحلیل زمانی")
    run([sys.executable, "-m", "timeframe", "export",
         "--workbook", timef, "--data", stocks], cwd=os.path.join(ROOT, "src"))

    print("═" * 70)
    print("گام ۴ — بازمحاسبه دوباره فایل سهام")
    print("  (گام ۳ فایل را بازنویسی کرده و مقادیر کش‌شده پاک شده‌اند)")
    if do_recalc(stocks) and not args.skip_recalc:
        print("! بازمحاسبه شکست خورد. گام‌های بعدی مقدار معتبری نخواهند خواند.")
        print("  فایل سهام را در اکسل باز و ذخیره کنید، سپس دوباره اجرا کنید.")
        return 1

    print("═" * 70)
    print("گام ۵ — پل دارایی پایه به فایل آپشن")
    run([sys.executable, os.path.join(HERE, "link_workbooks.py"),
         "--stocks", stocks, "--options", options])

    print("═" * 70)
    print("گام ۶ — بازمحاسبه فایل آپشن و زمانی")
    do_recalc(options, timef)

    print("═" * 70)
    print("✓ مجموعه به‌روز شد.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
