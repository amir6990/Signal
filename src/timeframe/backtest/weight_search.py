# -*- coding: utf-8 -*-
"""
سنجش وزن‌های شیت `Asset_Signals` روی سری واقعی.

سؤال اصلی این ماژول این **نیست** که «بهترین وزن‌ها کدام‌اند». هر جست‌وجوی
شبکه‌ای روی هر سری‌ای یک ترکیب برنده پیدا می‌کند، حتی روی نویز محض. سؤال
درست این است:

    آیا بهترین ترکیب، بعد از تعدیل بابت **تعداد ترکیب‌های امتحان‌شده**،
    هنوز چیزی بیشتر از شانس است؟

پس هر نتیجه سه فیلتر را باید رد کند:

۱. **شارپ تعدیل‌شده (DSR)** با n_trials برابر اندازه شبکه. ۱۷۷۱ ترکیب یعنی
   بالاترین شارپ باید خیلی بالاتر از صفر باشد تا معنادار بماند.
۲. **walk-forward**: وزن روی پنجره گذشته انتخاب، روی پنجره بعدی آزموده.
   اگر وزن‌های برنده هر پنجره با هم فرق داشته باشند، «بهترین وزن» وجود ندارد.
۳. **آزمون جایگشت**: همان تعداد و مدت معامله با زمان‌بندی تصادفی. اگر
   تصادفی هم همین‌قدر خوب باشد، سیگنال کاری نکرده.

مقایسه همیشه با سه معیار پایه: وزن‌های پیش‌فرض فایل، وزن‌های مساوی، و
خرید-و-نگهداری.
"""
import itertools
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from ..series import TimeSeries
from . import asset_score as A
from .benchmark import random_timing_null
from .engine import Backtester, BacktestResult, Costs
from .metrics import Performance, summarize


@dataclass
class WeightResult:
    weights: A.ScoreWeights
    sharpe: float = 0.0
    total_return: float = 0.0
    n_trades: int = 0
    exposure: float = 0.0
    perf: Optional[Performance] = None


@dataclass
class SearchReport:
    asset: str
    n_bars: int = 0
    grid_size: int = 0
    best: Optional[WeightResult] = None
    default: Optional[WeightResult] = None
    equal: Optional[WeightResult] = None
    trend_only: Optional[WeightResult] = None
    buy_hold: Optional[Performance] = None
    null_p: Optional[float] = None
    wf_oos_efficiency: Optional[float] = None
    wf_stability: Optional[float] = None
    wf_fold_weights: List[A.ScoreWeights] = field(default_factory=list)
    wf_oos: Optional[Performance] = None
    has_valuation: bool = False
    warnings: List[str] = field(default_factory=list)


def simplex_grid(step: float = 0.05, allow_zero_valuation: bool = True
                 ) -> List[A.ScoreWeights]:
    """همه ترکیب‌های وزنی که جمعشان دقیقاً ۱ است، با گام مشخص.

    وزن صفر مجاز است — «این زیرنمره اصلاً وارد نشود» یک فرضیه معتبر است و
    باید همان‌قدر شانس داشته باشد که هر ترکیب دیگر.
    """
    k = int(round(1.0 / step))
    out = []
    for a in range(k + 1):
        for b in range(k + 1 - a):
            for c in range(k + 1 - a - b):
                d = k - a - b - c
                if not allow_zero_valuation and d == 0:
                    continue
                if a + b + c == 0:      # فقط ارزش‌گذاری، بدون هیچ سیگنال قیمتی
                    continue
                out.append(A.ScoreWeights(a * step, b * step, c * step, d * step))
    return out


def _run_one(ts: TimeSeries, rows: Sequence[A.ScoreRow], w: A.ScoreWeights,
             bt: Backtester, th_in: float, th_out: float,
             n_trials: int = 1) -> BacktestResult:
    sig = A.totals(rows, w)
    return bt.run(ts, sig, name=ts.name, threshold_in=th_in,
                  threshold_out=th_out, n_trials=n_trials)


def _perf(r: BacktestResult, bt: Backtester, n_trials: int = 1) -> Performance:
    return summarize(r.returns, r.equity, r.positions, r.trade_pnls,
                     periods_per_year=bt.periods_per_year, n_trials=n_trials,
                     turnover=r.turnover)


def _wr(ts, rows, w, bt, th_in, th_out, n_trials=1) -> WeightResult:
    r = _run_one(ts, rows, w, bt, th_in, th_out, n_trials)
    p = _perf(r, bt, n_trials)
    return WeightResult(weights=w, sharpe=p.sharpe, total_return=p.total_return,
                        n_trades=p.n_trades, exposure=p.exposure, perf=p)


def walk_forward(ts: TimeSeries, rows: Sequence[A.ScoreRow],
                 grid: Sequence[A.ScoreWeights], bt: Backtester,
                 th_in: float, th_out: float,
                 is_bars: int = 1000, oos_bars: int = 250
                 ) -> Tuple[Optional[float], Optional[float],
                            List[A.ScoreWeights], Optional[Performance]]:
    """وزن روی پنجره گذشته انتخاب می‌شود، روی پنجره بعدی آزموده.

    نکته کلیدی: زیرنمره‌ها **یک بار روی کل سری** حساب شده‌اند و هر ردیف فقط
    از گذشته خودش ساخته شده. پس برش زدنِ آرایه امتیاز، نه داده آینده وارد
    می‌کند و نه میانگین متحرک ۲۰۰ روزه را در ابتدای هر پنجره از نو صفر می‌کند.
    """
    n = len(ts)
    if n < is_bars + oos_bars:
        return None, None, [], None

    picked: List[A.ScoreWeights] = []
    is_per_bar_sum = 0.0
    oos_per_bar_sum = 0.0
    oos_rets: List[float] = []
    oos_pos: List[float] = []
    oos_trades: List[float] = []
    equity = 1.0
    oos_eq: List[float] = []
    start = 0
    while start + is_bars + oos_bars <= n:
        is_s, is_e = start, start + is_bars
        oos_e = min(n, is_e + oos_bars)
        is_ts = TimeSeries(ts.name, list(ts.bars[is_s:is_e]))
        is_rows = rows[is_s:is_e]
        best, best_val = None, -1e18
        for w in grid:
            r = _run_one(is_ts, is_rows, w, bt, th_in, th_out)
            val = (r.equity[-1] / r.equity[0] - 1.0) if r.equity else -1e18
            if val > best_val:
                best, best_val = w, val
        picked.append(best)
        # بازده به‌ازای هر کندل — مقایسه جمع خام دو پنجره با طول متفاوت غلط است
        is_per_bar_sum += math.log1p(max(best_val, -0.999)) / max(is_bars, 1)

        oos_ts = TimeSeries(ts.name, list(ts.bars[is_e:oos_e]))
        r = _run_one(oos_ts, rows[is_e:oos_e], best, bt, th_in, th_out)
        oos_val = (r.equity[-1] / r.equity[0] - 1.0) if r.equity else 0.0
        oos_per_bar_sum += math.log1p(max(oos_val, -0.999)) / max(oos_e - is_e, 1)
        oos_rets.extend(r.returns)
        oos_pos.extend(r.positions)
        oos_trades.extend(r.trade_pnls)
        for x in r.returns:
            equity *= (1.0 + x)
            oos_eq.append(equity)
        start += oos_bars

    eff = (oos_per_bar_sum / is_per_bar_sum) if is_per_bar_sum else None
    stability = 0.0
    if len(picked) > 1:
        same = sum(1 for i in range(1, len(picked))
                   if picked[i].as_tuple() == picked[i - 1].as_tuple())
        stability = same / (len(picked) - 1)
    perf = None
    if oos_rets:
        perf = summarize(oos_rets, oos_eq or [1.0], oos_pos, oos_trades,
                         periods_per_year=bt.periods_per_year,
                         n_trials=len(grid))
    return eff, stability, picked, perf


def analyze(name: str, ts: TimeSeries, valuation: Optional[Sequence],
            step: float = 0.05, th_in: float = 2.0, th_out: float = -2.0,
            costs: Optional[Costs] = None, params: Optional[A.ScoreParams] = None,
            is_bars: int = 1000, oos_bars: int = 250,
            null_samples: int = 400) -> SearchReport:
    bt = Backtester(costs=costs or Costs(), execution_lag=1,
                    allow_locked_queue=True, periods_per_year=252)
    rows = A.compute(ts.closes, valuation=valuation, params=params)
    rep = SearchReport(asset=name, n_bars=len(ts))
    rep.has_valuation = any(r.val_pct is not None for r in rows)

    grid = simplex_grid(step)
    rep.grid_size = len(grid)

    best = None
    for w in grid:
        r = _run_one(ts, rows, w, bt, th_in, th_out)
        if not r.equity:
            continue
        val = r.equity[-1] / r.equity[0] - 1.0
        if best is None or val > best[0]:
            best = (val, w, r)
    if best is not None:
        p = _perf(best[2], bt, n_trials=len(grid))
        rep.best = WeightResult(best[1], p.sharpe, p.total_return,
                                p.n_trades, p.exposure, p)
        rep.null_p = None
        nt = random_timing_null(ts, best[2], bt, n_samples=null_samples)
        if nt is not None:
            rep.null_p = nt.p_value

    rep.default = _wr(ts, rows, A.ScoreWeights(), bt, th_in, th_out)
    rep.equal = _wr(ts, rows, A.ScoreWeights(0.25, 0.25, 0.25, 0.25),
                    bt, th_in, th_out)
    rep.trend_only = _wr(ts, rows, A.ScoreWeights(1.0, 0.0, 0.0, 0.0),
                         bt, th_in, th_out)
    bh = bt.buy_and_hold(ts)
    rep.buy_hold = _perf(bh, bt)

    eff, stab, picked, wfp = walk_forward(ts, rows, grid, bt, th_in, th_out,
                                          is_bars=is_bars, oos_bars=oos_bars)
    rep.wf_oos_efficiency, rep.wf_stability = eff, stab
    rep.wf_fold_weights, rep.wf_oos = picked, wfp
    if not rep.has_valuation:
        rep.warnings.append(
            "این سری سنجه ارزش‌گذاری ندارد؛ وزن چهارم بی‌اثر است و از مخرج "
            "هم حذف می‌شود، پس شبکه عملاً سه‌بعدی است.")
    return rep
