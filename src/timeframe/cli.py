# -*- coding: utf-8 -*-
"""
رابط خط فرمان موتور زمانی.

    python -m timeframe symbol   --workbook Iran_Stock_Signals.xlsx --name فولاد
    python -m timeframe all      --workbook Iran_Stock_Signals.xlsx
    python -m timeframe macro    --asset iran_equity
    python -m timeframe gold     --ounce 3400 --usd-irr 950000 --market 900000000
    python -m timeframe sources
    python -m timeframe export   --workbook Iran_Stock_Signals.xlsx
"""
import argparse
import datetime
import sys

from . import analysis, report, series
from .config import TimeframeConfig
from .macro import context as macro_context
from .macro import gold as gold_mod


def _load(args):
    if args.csv:
        return series.from_csv(args.csv, args.name or "CSV")
    return series.from_workbook(args.workbook, args.name)


def cmd_symbol(args):
    ts = _load(args)
    if not len(ts):
        print("داده‌ای برای «%s» یافت نشد." % args.name)
        return 1
    a = analysis.analyze(ts, TimeframeConfig(),
                         elliott_label=args.wave or "",
                         elliott_confidence=args.confidence,
                         strict_spectral=args.strict)
    print(report.symbol_report(a))
    return 0


def cmd_all(args):
    names = series.workbook_symbols(args.workbook)
    print("نمادهای موجود: %s\n" % "، ".join(names))
    rows = []
    for nm in names:
        ts = series.from_workbook(args.workbook, nm)
        if len(ts) < 60:
            continue
        a = analysis.analyze(ts, TimeframeConfig(), strict_spectral=args.strict)
        rows.append((nm, a))
    print("%-10s %-9s %-10s %-24s %-8s %s" %
          ("نماد", "دوره", "معنادار", "فاز", "امتیاز", "اتکا"))
    print("─" * 78)
    n_valid = sum(1 for _nm, a in rows if a.dominant is not None)
    for nm, a in rows:
        d = a.dominant
        st = a.dominant_state
        print("%-10s %-9s %-10s %-24s %+7.2f %s" % (
            nm,
            ("%.0f" % d.period) if d else "—",
            "بله" if d else "خیر",
            st.phase_label if st else "—",
            a.score.total if a.score else 0.0,
            a.score.reliability if a.score else "—"))
    print("─" * 78)
    print("%d نماد از %d چرخه معنادار دارند." % (n_valid, len(rows)))
    if n_valid == 0:
        print("هیچ نمادی چرخه معناداری ندارد. امتیازهای بالا روی دوره‌های اسمی "
              "هرست بنا شده‌اند، نه روی چرخه‌ای که در داده این نمادها اثبات شده "
              "باشد — پس فرضیه‌اند، نه یافته.")
    return 0


def cmd_macro(args):
    today = datetime.date.fromisoformat(args.date) if args.date else None
    if args.asset == "all":
        for k in macro_context.ASSET_CLASSES:
            print(report.macro_report(k, today))
            print()
    else:
        print(report.macro_report(args.asset, today))
    return 0


def cmd_gold(args):
    b = gold_mod.breakdown(args.ounce, args.usd_irr, args.market, args.instrument)
    print("مسکوک: %s | طلای خالص %.4f گرم" % (b.instrument, b.pure_grams))
    print("ارزش ذاتی:  {:>18,.0f} ریال".format(b.intrinsic_rial))
    if b.market_rial:
        print("قیمت بازار: {:>18,.0f} ریال".format(b.market_rial))
        print("حباب:       {:>18,.0f} ریال  ({:+.1%})".format(b.bubble_rial, b.bubble_pct))
    print("گرم ۱۸ عیار (ارزش خام فلز، بدون اجرت و مالیات): {:,.0f} ریال"
          .format(gold_mod.gram_18k_rial(args.ounce, args.usd_irr)))
    print()
    print(report.macro_report("gold"))
    return 0


def cmd_sources(_args):
    print(report.sources_report())
    return 0


def cmd_export(args):
    from .excel_export import export
    return export(args.workbook, strict=args.strict)


def build_parser():
    p = argparse.ArgumentParser(prog="timeframe", description="موتور تحلیل ابعاد زمانی")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("--workbook", default="Iran_Stock_Signals.xlsx")
        sp.add_argument("--csv", default=None, help="به‌جای اکسل از CSV بخوان")
        sp.add_argument("--strict", action="store_true",
                        help="آزمون جانشین AR(1) — کندتر ولی سختگیرانه‌تر")

    s = sub.add_parser("symbol", help="تحلیل زمانی یک نماد")
    common(s)
    s.add_argument("--name", required=True)
    s.add_argument("--wave", default="", help="برچسب موج الیوت: 1..5 یا A/B/C")
    s.add_argument("--confidence", type=int, default=None, help="اطمینان ۱ تا ۵")
    s.set_defaults(func=cmd_symbol)

    s = sub.add_parser("all", help="خلاصه همه نمادهای فایل")
    common(s)
    s.set_defaults(func=cmd_all)

    s = sub.add_parser("macro", help="زمینه چرخه‌های بلند")
    s.add_argument("--asset", default="iran_equity",
                   choices=list(macro_context.ASSET_CLASSES) + ["all"])
    s.add_argument("--date", default=None, help="YYYY-MM-DD")
    s.set_defaults(func=cmd_macro)

    s = sub.add_parser("gold", help="تجزیه قیمت طلا و سکه")
    s.add_argument("--ounce", type=float, required=True, help="اونس جهانی (دلار)")
    s.add_argument("--usd-irr", type=float, required=True, dest="usd_irr")
    s.add_argument("--market", type=float, default=None, help="قیمت بازار (ریال)")
    s.add_argument("--instrument", default="سکه تمام بهار آزادی",
                   choices=list(gold_mod.COIN_SPECS))
    s.set_defaults(func=cmd_gold)

    s = sub.add_parser("sources", help="فهرست منابع و جایگاه علمی هر چارچوب")
    s.set_defaults(func=cmd_sources)

    s = sub.add_parser("export", help="نوشتن نتایج در فایل اکسل")
    common(s)
    s.set_defaults(func=cmd_export)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
