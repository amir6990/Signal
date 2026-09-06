# -*- coding: utf-8 -*-
"""
دریافت سری‌های واقعی عمومی برای **اعتبارسنجی وزن‌ها**.

چرا این فایل وجود دارد: وزن‌های شیت `Asset_Signals` قضاوت‌اند، نه نتیجه
آزمون. سنجیدنشان به سری واقعی نیاز دارد — و تاریخچه واقعی طلا و ارز ایران
از این محیط در دسترس نیست (tgju و نوبیتکس هر دو ۴۰۳ می‌دهند).

پس به‌جای وانمود کردن، از **نزدیک‌ترین آنالوگ واقعیِ در دسترس** استفاده
می‌شود: ارزهای کشورهایی با تورم مزمن و کاهش ارزش پیوسته. سؤال آنجا دقیقاً
همان سؤال اینجاست — «دلار را در برابر پول محلی نگه دارم یا نه؟» — و همان
شکل داده را دارد (واحد پول محلی به ازای هر دلار، صعودی و پرروند).

منابع (همه مخزن عمومی `datasets` روی گیت‌هاب، قابل بازتولید):
    نرخ ارز روزانه   datasets/exchange-rates      از ۱۹۷۱، روزانه
    تورم سالانه      datasets/cpi                 بانک جهانی
    نفت برنت روزانه  datasets/oil-prices          از ۱۹۸۷، روزانه

سنجه ارزش‌گذاری چطور ساخته می‌شود: **نرخ ارز حقیقی**. نرخ اسمی تعدیل‌شده
با اختلاف تورم دو کشور. اگر تورم محلی بیشتر باشد، نرخ اسمی باید بالا برود
تا نرخ حقیقی ثابت بماند؛ انحراف نرخ حقیقی از میانگین بلندمدتش یعنی «دلار
نسبت به تاریخ خودش گران یا ارزان است». این دقیقاً هم‌ساختارِ حباب سکه است:
قیمت بازار نسبت به یک لنگر بیرونی، نه نسبت به روند خودش.

⚠️ تورم سال y با تأخیر منتشر می‌شود. برای پرهیز از نگاه به آینده، شاخص هر
روز از **آخرین سال کاملاً منتشرشده** گرفته می‌شود (سال قبل)، نه سال جاری.
"""
import argparse
import csv
import datetime
import io
import os
import sys
import urllib.request

BASE = "https://raw.githubusercontent.com/datasets"
SOURCES = {
    "fx":    BASE + "/exchange-rates/main/data/daily.csv",
    "cpi":   BASE + "/cpi/main/data/cpi.csv",
    "brent": BASE + "/oil-prices/main/data/brent-daily.csv",
}

# دارایی‌های آزمون. برای هر کدام: (کشور در فایل نرخ ارز، کشور در فایل تورم)
# انتخاب بر اساس شباهت ساختاری به ریال: تورم مزمن، کاهش ارزش پیوسته،
# شکست‌های رژیمی. نه بر اساس اینکه کدام نتیجه بهتری می‌دهد.
FX_ASSETS = {
    "brazil":  ("Brazil", "Brazil"),
    "mexico":  ("Mexico", "Mexico"),
    "safrica": ("South Africa", "South Africa"),
    "india":   ("India", "India"),
}
US_CPI_NAME = "United States"


def download(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": "signal-research/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def load_fx(text):
    """خروجی: dict[country] = list[(date, rate)] مرتب صعودی."""
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        try:
            d = datetime.datetime.strptime(row["Date"].strip(), "%Y-%m-%d").date()
            v = float(row["Exchange rate"])
        except (ValueError, KeyError, TypeError):
            continue
        if v <= 0:
            continue
        out.setdefault(row["Country"].strip(), []).append((d, v))
    for k in out:
        out[k].sort()
    return out


def load_cpi(text):
    """خروجی: dict[country] = dict[year] = نرخ تورم درصدی."""
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        try:
            y, v = int(row["Year"]), float(row["CPI"])
        except (ValueError, KeyError, TypeError):
            continue
        out.setdefault(row["Country"].strip().strip('"'), {})[y] = v
    return out


def price_index(infl_by_year):
    """تبدیل نرخ تورم سالانه به شاخص سطح قیمت (پایه ۱۰۰ در اولین سال)."""
    if not infl_by_year:
        return {}
    years = sorted(infl_by_year)
    idx, cur = {}, 100.0
    for y in years:
        cur *= (1.0 + infl_by_year[y] / 100.0)
        idx[y] = cur
    return idx


def real_rate_series(fx_rows, local_idx, us_idx):
    """نرخ ارز حقیقی. شاخص هر روز از **سال قبل** خوانده می‌شود (بدون نگاه به آینده)."""
    out = []
    for d, nominal in fx_rows:
        y = d.year - 1
        li, ui = local_idx.get(y), us_idx.get(y)
        out.append(nominal * (ui / li) if (li and ui and li > 0) else None)
    return out


def write_panel(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["date", "close", "valuation"])
        for d, c, v in rows:
            w.writerow([d.isoformat(), "%.10g" % c,
                        "" if v is None else "%.10g" % v])


def main(argv=None):
    ap = argparse.ArgumentParser(description="دریافت سری‌های واقعی برای اعتبارسنجی")
    ap.add_argument("--out", default="data/reference")
    ap.add_argument("--cache", default=None,
                    help="پوشه فایل‌های خام دانلودشده (برای اجرای بدون شبکه)")
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    raw = {}
    for key, url in SOURCES.items():
        cached = os.path.join(args.cache, key + ".csv") if args.cache else None
        if cached and os.path.exists(cached):
            raw[key] = open(cached, encoding="utf-8").read()
            print("  از حافظه محلی: %s" % key)
            continue
        print("  دریافت %s ..." % key)
        raw[key] = download(url)
        if args.cache:
            os.makedirs(args.cache, exist_ok=True)
            open(cached, "w", encoding="utf-8").write(raw[key])

    fx = load_fx(raw["fx"])
    cpi = load_cpi(raw["cpi"])
    us_idx = price_index(cpi.get(US_CPI_NAME, {}))
    if not us_idx:
        print("! تورم آمریکا پیدا نشد — سنجه ارزش‌گذاری ساخته نمی‌شود.")

    made = []
    for key, (fx_name, cpi_name) in FX_ASSETS.items():
        rows = fx.get(fx_name)
        if not rows:
            print("  ✘ %-9s در فایل نرخ ارز نبود" % key)
            continue
        local_idx = price_index(cpi.get(cpi_name, {}))
        vals = (real_rate_series(rows, local_idx, us_idx)
                if (local_idx and us_idx) else [None] * len(rows))
        panel = [(d, c, v) for (d, c), v in zip(rows, vals)]
        path = os.path.join(args.out, key + ".csv")
        write_panel(path, panel)
        nv = sum(1 for _d, _c, v in panel if v is not None)
        made.append(key)
        print("  ✔ %-9s %5d روز  (%s تا %s)  %d روز سنجه"
              % (key, len(panel), panel[0][0], panel[-1][0], nv))

    brent = []
    for row in csv.DictReader(io.StringIO(raw["brent"])):
        try:
            d = datetime.datetime.strptime(row["Date"].strip(), "%Y-%m-%d").date()
            brent.append((d, float(row["Price"]), None))
        except (ValueError, KeyError, TypeError):
            continue
    if brent:
        brent.sort()
        write_panel(os.path.join(args.out, "brent.csv"), brent)
        made.append("brent")
        print("  ✔ %-9s %5d روز  (%s تا %s)  بدون سنجه"
              % ("brent", len(brent), brent[0][0], brent[-1][0]))

    print("\n%d سری در %s" % (len(made), args.out))
    return 0 if made else 1


if __name__ == "__main__":
    sys.exit(main())
