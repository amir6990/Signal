# -*- coding: utf-8 -*-
"""
ساخت فایل‌های اکسل مجموعه.

    python src/build_all.py                # همه فایل‌ها
    python src/build_all.py --only stocks  # فقط یکی
    python src/build_all.py --out ./out    # در پوشه دیگر
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from workbooks import BUILDERS, build   # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description="سازنده فایل‌های اکسل")
    ap.add_argument("--only", choices=list(BUILDERS), default=None)
    ap.add_argument("--out", default=".")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args(argv)

    if args.list:
        print("%-10s %-26s %s" % ("کلید", "فایل", "شرح"))
        print("─" * 74)
        for k, v in BUILDERS.items():
            print("%-10s %-26s %s" % (k, v["file"], v["title"]))
        return 0

    os.makedirs(args.out, exist_ok=True)
    keys = [args.only] if args.only else list(BUILDERS)
    for k in keys:
        build(k, args.out)
    print("\nپل‌های داده‌ای بین فایل‌ها:")
    print("  python -m timeframe export --workbook Time_Analysis.xlsx --data Stocks_Signals.xlsx")
    print("  python scripts/link_workbooks.py --stocks Stocks_Signals.xlsx --options Options_Signals.xlsx")
    return 0


if __name__ == "__main__":
    sys.exit(main())
