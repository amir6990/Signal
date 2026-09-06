# -*- coding: utf-8 -*-
"""
اجرای سنجش وزن‌ها روی سری‌های واقعی.

    python scripts/fetch_reference_series.py          # اول داده
    python scripts/backtest_weights.py                # بعد سنجش
    python scripts/backtest_weights.py --step 0.10 --asset brazil
"""
import argparse
import csv
import datetime
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "src"))

from timeframe.backtest import asset_score as A          # noqa: E402
from timeframe.backtest import weight_search as W        # noqa: E402
from timeframe.backtest.engine import Costs              # noqa: E402
from timeframe.series import Bar, TimeSeries             # noqa: E402

# پروفایل‌های هزینه. هزینه، متغیرِ تعیین‌کننده این مدل است: با آستانه ±۲ و
# سیگنالی که هر چند هفته می‌چرخد، اختلاف ۰٫۲٪ و ۱٫۵٪ رفت‌وبرگشت، تفاوت سود
# و زیان است. پس نتیجه باید در هر سه پروفایل دیده شود، نه فقط یکی.
COST_PROFILES = {
    # پیش‌فرض بورس: کارمزد خرید ۰٫۳۷٪ + فروش ۰٫۸۸٪ (با مالیات) + لغزش
    "tse":    Costs(),
    # صرافی رمزارز (تتر): کارمزد پایین و نقدشوندگی بالا
    "usdt":   Costs(buy_bps=10.0, sell_bps=10.0, slippage_bps=5.0),
    # طلای فیزیکی و سکه: اسپرد خرید و فروش پهن
    "coin":   Costs(buy_bps=100.0, sell_bps=100.0, slippage_bps=50.0),
    # بدون هزینه — فقط برای اینکه ببینیم چقدر از نتیجه، هزینه است و چقدر سیگنال
    "zero":   Costs(buy_bps=0.0, sell_bps=0.0, slippage_bps=0.0),
}


def load_panel(path):
    dates, closes, vals = [], [], []
    with open(path, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            try:
                d = datetime.datetime.strptime(row["date"], "%Y-%m-%d").date()
                c = float(row["close"])
            except (ValueError, KeyError):
                continue
            dates.append(d)
            closes.append(c)
            v = row.get("valuation") or ""
            vals.append(float(v) if v.strip() else None)
    bars = [Bar(date=d, close=c, high=c, low=c) for d, c in zip(dates, closes)]
    return TimeSeries(os.path.basename(path).split(".")[0], bars), vals


def fmt_w(w, has_valuation=True):
    """وزن‌های **مؤثر**.

    وقتی سری سنجه ارزش‌گذاری ندارد، وزن چهارم از مخرج حذف می‌شود؛ پس نمایش
    عدد خامش گمراه‌کننده است (به‌نظر می‌رسد ۲۵٪ تصمیم را ساخته، در حالی که
    هیچ نقشی نداشته). در آن حالت سه وزن باقی‌مانده نرمال می‌شوند.
    """
    t, m, v, val = w.as_tuple()
    if not has_valuation:
        den = t + m + v
        if den:
            return ("روند %.2f | مومنتوم %.2f | نوسان %.2f | ارزش — (بی‌اثر)"
                    % (t / den, m / den, v / den))
    return "روند %.2f | مومنتوم %.2f | نوسان %.2f | ارزش %.2f" % (t, m, v, val)


def line(rep):
    print("\n" + "═" * 78)
    print("%s — %d کندل، شبکه %d ترکیب%s"
          % (rep.asset, rep.n_bars, rep.grid_size,
             "، با سنجه ارزش‌گذاری" if rep.has_valuation else "، بدون سنجه"))
    print("═" * 78)
    # ⚠️ ستون DSR بین سطر اول و بقیه **قابل مقایسه نیست**. «بهترین شبکه» بابت
    # همه ترکیب‌های امتحان‌شده جریمه شده؛ سه سطر بعدی وزن‌های ثابتِ از پیش
    # تعیین‌شده‌اند و جریمه‌ای ندارند (n_trials=۱). عدد بزرگ‌ترِ سطر دوم به
    # معنای بهتر بودنش نیست — دو مقیاس متفاوت‌اند.
    print("%-26s %8s %9s %8s %8s %8s"
          % ("ترکیب", "شارپ", "بازده", "DSR", "معامله", "حضور"))
    print("─" * 78)

    def row(lbl, wr):
        if wr is None or wr.perf is None:
            print("%-26s %8s" % (lbl, "—"))
            return
        p = wr.perf
        print("%-26s %8.2f %8.1f%% %8.3f %8d %7.0f%%"
              % (lbl, p.sharpe, p.total_return * 100, p.deflated_sharpe,
                 p.n_trades, p.exposure * 100))

    row("بهترین شبکه (جریمه‌شده)", rep.best)
    row("پیش‌فرض فایل (۳۵/۲۵/۱۵/۲۵)", rep.default)
    row("وزن مساوی", rep.equal)
    row("فقط روند", rep.trend_only)
    if rep.buy_hold:
        print("%-26s %8.2f %8.1f%% %8s %8s %7.0f%%"
              % ("خرید و نگهداری", rep.buy_hold.sharpe,
                 rep.buy_hold.total_return * 100, "—", "—", 100.0))
    print("─" * 78)
    print("(DSR سطر اول بابت %d ترکیب تعدیل شده؛ سطرهای ثابت جریمه ندارند "
          "— مستقیم مقایسه نکنید.)" % rep.grid_size)
    if rep.best:
        print("وزن‌های برنده: %s" % fmt_w(rep.best.weights, rep.has_valuation))
    if rep.null_p is not None:
        verdict = "قابل تفکیک از شانس" if rep.null_p < 0.05 else "از شانس جدا نیست"
        print("آزمون زمان‌بندی تصادفی: p = %.3f  → %s" % (rep.null_p, verdict))
    if rep.wf_oos_efficiency is not None:
        print("walk-forward: کارایی خارج‌نمونه %.2f | پایداری وزن %.0f%% | %d پنجره"
              % (rep.wf_oos_efficiency, rep.wf_stability * 100,
                 len(rep.wf_fold_weights)))
        if rep.wf_oos:
            print("   خارج‌نمونه ترکیبی: شارپ %.2f، بازده %.1f%%، DSR %.3f"
                  % (rep.wf_oos.sharpe, rep.wf_oos.total_return * 100,
                     rep.wf_oos.deflated_sharpe))
        uniq = {(w.as_tuple() if rep.has_valuation else w.as_tuple()[:3])
                for w in rep.wf_fold_weights}
        print("   وزن‌های انتخابی در پنجره‌ها: %d ترکیب متفاوت از %d پنجره"
              % (len(uniq), len(rep.wf_fold_weights)))
    for w in rep.warnings:
        print("⚠ %s" % w)


def main(argv=None):
    ap = argparse.ArgumentParser(description="سنجش وزن‌های Asset_Signals")
    ap.add_argument("--dir", default="data/reference")
    ap.add_argument("--asset", default=None, help="فقط یک سری")
    ap.add_argument("--step", type=float, default=0.05)
    ap.add_argument("--th-in", type=float, default=2.0, dest="th_in")
    ap.add_argument("--th-out", type=float, default=-2.0, dest="th_out")
    ap.add_argument("--is-bars", type=int, default=1000, dest="is_bars")
    ap.add_argument("--oos-bars", type=int, default=250, dest="oos_bars")
    ap.add_argument("--null-samples", type=int, default=400, dest="null_samples")
    ap.add_argument("--costs", default="tse", choices=sorted(COST_PROFILES),
                    help="پروفایل هزینه معامله")
    args = ap.parse_args(argv)

    files = sorted(f for f in os.listdir(args.dir) if f.endswith(".csv"))
    if args.asset:
        files = [f for f in files if f.startswith(args.asset)]
    if not files:
        print("سری‌ای پیدا نشد. اول: python scripts/fetch_reference_series.py")
        return 1

    reps = []
    for f in files:
        ts, vals = load_panel(os.path.join(args.dir, f))
        if len(ts) < 400:
            print("رد شد (کوتاه): %s" % f)
            continue
        rep = W.analyze(ts.name, ts, vals, step=args.step,
                        th_in=args.th_in, th_out=args.th_out,
                        costs=COST_PROFILES[args.costs],
                        is_bars=args.is_bars, oos_bars=args.oos_bars,
                        null_samples=args.null_samples)
        reps.append(rep)
        line(rep)

    print("\n" + "═" * 78)
    print("جمع‌بندی (پروفایل هزینه: %s) — آیا «بهترین وزن» از سه فیلتر رد می‌شود؟"
          % args.costs)
    print("═" * 78)
    print("%-10s %8s %8s %9s %10s" % ("سری", "DSR", "p تصادفی", "کارایی OOS", "پایداری"))
    print("─" * 78)
    for r in reps:
        print("%-10s %8.3f %8s %9s %9s"
              % (r.asset,
                 r.best.perf.deflated_sharpe if r.best and r.best.perf else 0.0,
                 "%.3f" % r.null_p if r.null_p is not None else "—",
                 "%.2f" % r.wf_oos_efficiency if r.wf_oos_efficiency is not None else "—",
                 "%.0f%%" % (r.wf_stability * 100) if r.wf_stability is not None else "—"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
