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


def cmd_outlook(args):
    from .forecast import outlook as OL
    ts = _load(args)
    if not len(ts):
        print("داده‌ای برای «%s» یافت نشد." % args.name)
        return 1
    print(OL.build(ts, args.horizon, args.label).report())
    return 0


def cmd_backtest(args):
    from .backtest import Backtester, Costs, summarize
    from .backtest import walkforward as WF
    from .backtest.benchmark import random_timing_null
    from .backtest.strategies import STRATEGIES

    ts = _load(args)
    if len(ts) < 300:
        print("داده کمتر از ۳۰۰ کندل — بک‌تست معنادار نیست (%d کندل)." % len(ts))
        return 1
    bt = Backtester(costs=Costs(slippage_bps=args.slippage),
                    execution_lag=args.lag)
    print("بک‌تست %s — %d کندل، %s تا %s"
          % (ts.name, len(ts), ts.bars[0].date, ts.last_date))
    print("هزینه: خرید %.2f٪ | فروش %.2f٪ | لغزش %.2f٪ هر طرف | تأخیر اجرا %d روز"
          % (bt.costs.buy_bps / 100, bt.costs.sell_bps / 100,
             bt.costs.slippage_bps / 100, bt.execution_lag))
    print("─" * 96)
    print("%-14s %-9s %-9s %-9s %-8s %-8s %-7s %s"
          % ("استراتژی", "بازده", "شارپ", "شارپ‌تعدیل", "افت", "معامله", "پایداری", "p تهی"))
    print("─" * 96)

    bh = bt.buy_and_hold(ts)
    pb = summarize(bh.returns, bh.equity, bh.positions, bh.trade_pnls)
    print("%-14s %+8.1f%% %+8.2f %9s %7.1f%% %7d %8s %s"
          % ("خرید‌ونگهداری", pb.total_return * 100, pb.sharpe, "—",
             pb.max_drawdown * 100, pb.n_trades, "—", "—"))

    rows = []
    for name, (fn, grid) in STRATEGIES.items():
        if name == "buy_and_hold":
            continue
        wf = WF.run(ts, fn, grid, is_bars=args.is_bars, oos_bars=args.oos_bars, bt=bt)
        if not wf.stitched or not wf.stitched.equity:
            print("%-14s داده برای walk-forward کافی نیست" % name)
            continue
        st = wf.stitched
        p = summarize(st.returns, st.equity, st.positions, st.trade_pnls,
                      n_trials=len(grid))
        nt = random_timing_null(ts, st, bt, n_samples=args.null_samples)
        print("%-14s %+8.1f%% %+8.2f %+9.3f %7.1f%% %7d %7.0f%% %s"
              % (name, p.total_return * 100, p.sharpe,
                 p.deflated_sharpe if p.deflated_sharpe is not None else 0.0,
                 p.max_drawdown * 100, p.n_trades,
                 wf.param_stability * 100,
                 ("%.3f" % nt.p_value) if nt else "—"))
        rows.append((name, wf, p, nt))

    print("─" * 96)
    print("\nتفسیر:")
    print("  • «شارپ تعدیل‌شده» احتمال واقعی‌بودن لبه است، پس از تصحیح بابت تعداد")
    print("    ترکیب پارامتری آزموده‌شده. زیر ۰٫۹ یعنی به‌احتمال زیاد نویز است.")
    print("  • «پایداری» درصد پنجره‌هایی که پارامتر بهینه ثابت مانده. زیر ۴۰٪ یعنی")
    print("    آنچه بهینه می‌شود نویز است، نه ساختار.")
    print("  • «p تهی» احتمال دیدن این بازده با همان تعداد و مدت معامله ولی")
    print("    زمان‌بندی تصادفی. بالای ۰٫۰۵ یعنی زمان‌بندی ارزشی اضافه نکرده.")
    for name, wf, p, nt in rows:
        eff = wf.oos_efficiency
        if eff is not None:
            print("\n  %s — کارایی خارج‌نمونه %.2f" % (name, eff))
        for w in wf.warnings:
            print("      ⚠ " + w)
        for w in p.notes:
            print("      ⓘ " + w)
    return 0


def cmd_judgment(args):
    from .forecast.judgment import Register, seed_templates
    reg = Register(args.file)
    if args.seed_deadline:
        added = seed_templates(reg, args.seed_deadline)
        reg.save()
        print("سؤال افزوده‌شده: %s" % ("، ".join(added) if added else "هیچ (از قبل بودند)"))
    if args.forecast:
        qid, prob = args.forecast[0], float(args.forecast[1])
        reg.forecast(qid, prob, args.rationale or "")
        reg.save()
        print("پیش‌بینی ثبت شد: %s = %.0f%%" % (qid, prob * 100))
    if args.resolve:
        qid, out = args.resolve[0], int(args.resolve[1])
        reg.resolve(qid, out, args.rationale or "")
        reg.save()
        print("سؤال %s با نتیجه %d حل شد." % (qid, out))
    print()
    print(reg.report())
    return 0


def cmd_sources(_args):
    print(report.sources_report())
    return 0


def cmd_export(args):
    from .excel_export import export
    return export(args.workbook, strict=args.strict, data_path=args.data)


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

    s = sub.add_parser("outlook", help="چشم‌انداز احتمالاتی افق کوتاه")
    common(s)
    s.add_argument("--name", required=True)
    s.add_argument("--horizon", type=int, default=63, help="افق به کندل (۶۳ ≈ سه ماه)")
    s.add_argument("--label", default="سه ماه")
    s.set_defaults(func=cmd_outlook)

    s = sub.add_parser("backtest", help="بک‌تست پیش‌رونده با آزمون تهی")
    common(s)
    s.add_argument("--name", required=True)
    s.add_argument("--is-bars", type=int, default=500, dest="is_bars")
    s.add_argument("--oos-bars", type=int, default=125, dest="oos_bars")
    s.add_argument("--slippage", type=float, default=15.0, help="لغزش (bps هر طرف)")
    s.add_argument("--lag", type=int, default=1, help="تأخیر اجرا (روز)")
    s.add_argument("--null-samples", type=int, default=300, dest="null_samples")
    s.set_defaults(func=cmd_backtest)

    s = sub.add_parser("judgment", help="دفتر ثبت پیش‌بینی و سنجش کالیبراسیون")
    s.add_argument("--file", default="forecasts.json")
    s.add_argument("--seed-deadline", default=None, dest="seed_deadline",
                   help="افزودن سؤال‌های نمونه با این مهلت (YYYY-MM-DD)")
    s.add_argument("--forecast", nargs=2, metavar=("QID", "PROB"), default=None)
    s.add_argument("--resolve", nargs=2, metavar=("QID", "OUTCOME"), default=None)
    s.add_argument("--rationale", default=None)
    s.set_defaults(func=cmd_judgment)

    s = sub.add_parser("sources", help="فهرست منابع و جایگاه علمی هر چارچوب")
    s.set_defaults(func=cmd_sources)

    s = sub.add_parser("export", help="نوشتن نتایج در فایل اکسل")
    common(s)
    s.add_argument("--data", default=None,
                   help="فایل منبع داده قیمت (پیش‌فرض: همان فایل مقصد). "
                        "برای مجموعه تفکیک‌شده: --workbook Time_Analysis.xlsx "
                        "--data Stocks_Signals.xlsx")
    s.set_defaults(func=cmd_export)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
