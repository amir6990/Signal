# -*- coding: utf-8 -*-
"""
دریافت قیمت طلا و ارز و نوشتن در فایل‌های اکسل.

    python scripts/fetch_gold_fx.py --probe        # کدام منابع از ماشین شما کار می‌کنند؟
    python scripts/fetch_gold_fx.py --show         # دریافت و نمایش، بدون نوشتن
    python scripts/fetch_gold_fx.py --write        # نوشتن در Gold_Analysis و FX_Analysis
    python scripts/fetch_gold_fx.py --write --append-history   # افزودن ردیف امروز به تاریخچه
    python scripts/fetch_gold_fx.py --manual my.json --write   # از فایل دستی

⚠️ **اول --probe را اجرا کنید.** برخلاف بورس که یک API مرجع دارد، برای دلار
آزاد و طلای داخلی ایران هیچ API عمومی، مستند و پایداری وجود ندارد. منابع این
اسکریپت (به‌جز Nobitex و فایل دستی) ساختار تأییدنشده دارند و ممکن است هر وقت
تغییر کنند. probe به شما می‌گوید کدام‌ها امروز از ماشین شما کار می‌کنند.

اصل حاکم: هیچ عددی بدون منشأ نوشته نمی‌شود، و عددی که از آزمون سلامت رد شود
اصلاً نوشته نمی‌شود — جایش خالی می‌ماند تا خودتان پرش کنید.
"""
import argparse
import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "src"))

from market_data.base import QUANTITIES, cross_check       # noqa: E402
from market_data.providers import build_registry           # noqa: E402

# نگاشت کمیت → (فایل، نام تعریف‌شده در اکسل)
TARGETS = {
    "gold_oz_usd":     [("gold", "GOLD_OZ"), ("fx", "FX_GOLD_OZ")],
    "silver_oz_usd":   [("gold", "SILVER_OZ")],
    "usd_irr_free":    [("gold", "USD_FREE"), ("fx", "FX_FREE")],
    "usd_irr_nima":    [("gold", "USD_NIMA"), ("fx", "FX_NIMA")],
    "usdt_irr":        [("fx", "FX_USDT")],
    "eur_irr":         [("fx", "FX_EUR")],
    "aed_irr":         [("fx", "FX_AED")],
    "usdt_usd_global": [("fx", "USDT_GLOBAL")],
    "dxy":             [("fx", "DXY")],
    "coin_full_irr":   [("gold", "COIN_FULL"), ("fx", "FX_COIN")],
    "coin_half_irr":   [("gold", "COIN_HALF")],
    "coin_quarter_irr": [("gold", "COIN_QTR")],
    "gram18k_irr":     [("gold", "GRAM_18K")],
}

FILES = {"gold": "Gold_Analysis.xlsx", "fx": "FX_Analysis.xlsx"}


def load_config(args):
    cfg = {"timeout": args.timeout}
    if args.config and os.path.exists(args.config):
        with open(args.config, encoding="utf-8") as fh:
            cfg.update(json.load(fh))
    if args.manual:
        cfg["manual_file"] = args.manual
    if args.brsapi_key:
        cfg["brsapi_key"] = args.brsapi_key
    return cfg


# ------------------------------------------------------------------ probe
def cmd_probe(reg, cfg):
    print("آزمون منابع — هر کدام واقعاً صدا زده می‌شود.\n")
    print("%-10s %-38s %-9s %s" % ("کلید", "منبع", "وضعیت", "نتیجه"))
    print("─" * 96)
    working = []
    for p, vals, err in reg.probe(cfg):
        if vals:
            working.append(p.key)
            sample = "، ".join("%s=%s" % (QUANTITIES[k][0], format(v, ",.4g"))
                               for k, v in list(vals.items())[:2] if k in QUANTITIES)
            print("%-10s %-38s %-9s %d کمیت  %s"
                  % (p.key, p.title, "✔ کار کرد", len(vals), sample[:52]))
        else:
            print("%-10s %-38s %-9s %s" % (p.key, p.title, "✘", err[:48]))
    print("─" * 96)
    print("\nپوشش هر کمیت با منابع کارکرده:")
    for q, (label, unit) in QUANTITIES.items():
        srcs = [p.key for p in reg.for_quantity(q) if p.key in working]
        mark = "✔" if srcs else "✘"
        print("  %s %-28s %s" % (mark, label, "، ".join(srcs) or "هیچ منبعی"))
    if not working:
        print("\n⚠ هیچ منبعی کار نکرد. یا شبکه بسته است، یا همه ساختارها تغییر کرده‌اند.")
        print("  راه مطمئن: یک فایل JSON دستی بسازید و با --manual بدهید.")
    return 0


# ------------------------------------------------------------------ show
def cmd_show(reg, cfg, order):
    quotes = reg.resolve(cfg, order=order)
    print("%-28s %-18s %-30s %s" % ("کمیت", "مقدار", "منبع", "وضعیت"))
    print("─" * 96)
    missing = []
    for q, (label, unit) in QUANTITIES.items():
        qt = quotes.get(q)
        if qt is None:
            missing.append(label)
            print("%-28s %-18s %-30s %s" % (label, "—", "—", "دریافت نشد"))
            continue
        print("%-28s %-18s %-30s %s"
              % (label, format(qt.value, ",.4g"), qt.source,
                 "✔" if qt.ok else "⚠ " + qt.note[:40]))
    print("─" * 96)
    ok = sum(1 for q in quotes.values() if q.ok)
    print("%d کمیت سالم از %d" % (ok, len(QUANTITIES)))
    if missing:
        print("دریافت‌نشده: %s" % "، ".join(missing))
        print("این‌ها را دستی در Gold_Input و FX_Input وارد کنید.")
    xw = cross_check(quotes)
    if xw:
        print("\n⚠ ناسازگاری بین مقادیر (آزمون نسبت‌ها، مستقل از سطح تورم):")
        for w in xw:
            print("   - %s" % w)
        print("   این‌ها لزوماً خطا نیستند ولی باید بررسی شوند.")
    return quotes


# ------------------------------------------------------------------ write
def _defined_cell(wb, name):
    """سلول متناظر یک نام تعریف‌شده. خروجی: (sheet, coordinate) یا None."""
    dn = wb.defined_names.get(name)
    if dn is None:
        return None
    for sheet, coord in dn.destinations:
        return sheet, coord.replace("$", "")
    return None


def write_workbooks(quotes, out_dir, append_history=False, dry=False):
    from openpyxl import load_workbook
    from openpyxl.comments import Comment

    written = {"gold": 0, "fx": 0}
    skipped = []
    for which, fname in FILES.items():
        path = os.path.join(out_dir, fname)
        if not os.path.exists(path):
            print("! فایل یافت نشد: %s" % path)
            continue
        wb = load_workbook(path)
        for q, targets in TARGETS.items():
            qt = quotes.get(q)
            if qt is None:
                continue
            if not qt.ok:
                skipped.append("%s (%s)" % (qt.label, qt.note[:40]))
                continue
            for w, name in targets:
                if w != which:
                    continue
                loc = _defined_cell(wb, name)
                if loc is None:
                    continue
                sheet, coord = loc
                if sheet not in wb.sheetnames:
                    continue
                cell = wb[sheet][coord]
                cell.value = qt.value
                cell.comment = Comment(
                    "منبع: %s\nزمان: %s" % (qt.source, qt.fetched_at), "fetch_gold_fx")
                written[which] += 1
        if append_history:
            _append_history(wb, which, quotes)
        if not dry:
            wb.save(path)
        print("✓ %s — %d مقدار نوشته شد%s"
              % (fname, written[which], " (آزمایشی، ذخیره نشد)" if dry else ""))
    if skipped:
        print("\n⚠ این مقادیر به‌دلیل رد شدن از آزمون سلامت نوشته نشدند:")
        for s in dict.fromkeys(skipped):
            print("   - %s" % s)
        print("   عدد مشکوک نوشته نمی‌شود؛ آن را دستی بررسی و وارد کنید.")
    return written


def _append_history(wb, which, quotes):
    """افزودن ردیف امروز به شیت تاریخچه — اگر تاریخ امروز از قبل نباشد."""
    sheet = "Gold_History" if which == "gold" else "FX_History"
    qkey = "coin_full_irr" if which == "gold" else "usd_irr_free"
    if sheet not in wb.sheetnames:
        return
    qt = quotes.get(qkey)
    if qt is None or not qt.ok:
        print("   ⓘ تاریخچه %s به‌روز نشد: مقدار %s سالم نیست."
              % (sheet, QUANTITIES[qkey][0]))
        return
    from timeframe.jalali import jalali_str
    ws = wb[sheet]
    today = datetime.date.today()
    # آخرین ردیف دارای تاریخ
    last = 4
    r = 5
    while r <= ws.max_row:
        v = ws.cell(row=r, column=1).value
        if isinstance(v, (datetime.date, datetime.datetime)):
            last = r
        r += 1
    lastdate = ws.cell(row=last, column=1).value
    if isinstance(lastdate, datetime.datetime):
        lastdate = lastdate.date()
    target = last if lastdate == today else last + 1
    ws.cell(row=target, column=1, value=today).number_format = "yyyy-mm-dd"
    ws.cell(row=target, column=2, value=jalali_str(today))
    ws.cell(row=target, column=3, value=qt.value)
    ws.cell(row=target, column=4, value=qt.value)
    ws.cell(row=target, column=5, value=qt.value)
    print("   ✓ تاریخچه %s: ردیف %d برای %s%s"
          % (sheet, target, today, " (به‌روزرسانی)" if lastdate == today else ""))


def main(argv=None):
    ap = argparse.ArgumentParser(description="دریافت قیمت طلا و ارز")
    ap.add_argument("--probe", action="store_true", help="آزمون همه منابع")
    ap.add_argument("--show", action="store_true", help="دریافت و نمایش بدون نوشتن")
    ap.add_argument("--write", action="store_true", help="نوشتن در فایل‌های اکسل")
    ap.add_argument("--append-history", action="store_true", dest="append_history",
                    help="افزودن ردیف امروز به شیت تاریخچه")
    ap.add_argument("--dry-run", action="store_true", dest="dry")
    ap.add_argument("--force", action="store_true",
                    help="نوشتن حتی با وجود ناسازگاری بین مقادیر")
    ap.add_argument("--dir", default=os.path.dirname(HERE))
    ap.add_argument("--manual", default=None, help="فایل JSON دستی")
    ap.add_argument("--config", default=os.path.join(HERE, "market_sources.json"))
    ap.add_argument("--brsapi-key", default=None, dest="brsapi_key")
    ap.add_argument("--order", default=None,
                    help="ترتیب اولویت منابع، با کاما — مثلاً manual,nobitex,tgju")
    ap.add_argument("--timeout", type=int, default=15)
    args = ap.parse_args(argv)

    reg = build_registry()
    cfg = load_config(args)
    order = args.order.split(",") if args.order else None

    if args.probe:
        return cmd_probe(reg, cfg)
    if not (args.show or args.write):
        print("یکی از --probe / --show / --write را بدهید.")
        print("پیشنهاد: اول --probe تا ببینید کدام منابع از ماشین شما کار می‌کنند.")
        return 1

    quotes = cmd_show(reg, cfg, order)
    if args.write:
        xw = cross_check(quotes)
        if xw and not args.force:
            print("\n✘ نوشتن انجام نشد: %d ناسازگاری بالا حل نشده است." % len(xw))
            print("  یا مقادیر را اصلاح کنید، یا با --force بنویسید اگر مطمئنید درست‌اند.")
            return 1
        print()
        write_workbooks(quotes, args.dir, args.append_history, args.dry)
        print("\nگام بعد: python scripts/recalc.py Gold_Analysis.xlsx FX_Analysis.xlsx")
    return 0


if __name__ == "__main__":
    sys.exit(main())
