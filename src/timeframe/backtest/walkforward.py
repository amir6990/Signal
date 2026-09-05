# -*- coding: utf-8 -*-
"""
اعتبارسنجی پیش‌رونده (walk-forward).

مسئله‌ای که حل می‌کند: اگر پارامترها را روی کل داده تنظیم کنید و بعد روی همان
داده بک‌تست بگیرید، نتیجه بی‌معناست — شما پاسخ را از قبل دیده‌اید.

روش: پنجره داخل‌نمونه برای انتخاب پارامتر، پنجره خارج‌نمونهٔ بلافاصله بعدی
برای ارزیابی، سپس هر دو پنجره به جلو می‌لغزند. فقط بازده‌های خارج‌نمونه
به هم چسبانده می‌شوند.

نکته‌ای که اغلب فراموش می‌شود: تعداد ترکیب‌های پارامتری آزموده‌شده باید ثبت
شود و به شارپ تعدیل‌شده داده شود. بدون آن، انتخاب بهترین پارامتر در هر پنجره
خودش یک منبع بیش‌برازش است.
"""
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from ..series import Bar, TimeSeries
from .engine import Backtester, BacktestResult, Trade


@dataclass
class Fold:
    index: int
    is_start: int
    is_end: int
    oos_start: int
    oos_end: int
    best_params: dict = field(default_factory=dict)
    is_metric: float = 0.0
    oos_return: float = 0.0

    @property
    def is_bars(self) -> int:
        return self.is_end - self.is_start

    @property
    def oos_bars(self) -> int:
        return self.oos_end - self.oos_start

    @property
    def is_per_bar(self) -> float:
        """بازده هندسی به‌ازای هر کندل — تنها مبنای مقایسه‌پذیر بین دو پنجره
        با طول متفاوت."""
        n = self.is_bars
        return ((1 + self.is_metric) ** (1.0 / n) - 1.0) if n > 0 and self.is_metric > -1 else 0.0

    @property
    def oos_per_bar(self) -> float:
        n = self.oos_bars
        return ((1 + self.oos_return) ** (1.0 / n) - 1.0) if n > 0 and self.oos_return > -1 else 0.0


@dataclass
class WalkForwardResult:
    folds: List[Fold] = field(default_factory=list)
    stitched: Optional[BacktestResult] = None
    n_trials: int = 1
    param_stability: float = 0.0     # نسبت پایداری انتخاب پارامتر بین پنجره‌ها
    warnings: List[str] = field(default_factory=list)

    @property
    def oos_efficiency(self) -> Optional[float]:
        """نسبت بازده **به‌ازای هر کندل** در خارج‌نمونه به داخل‌نمونه.

        مقایسه جمع خام بازده‌ها غلط است: پنجره داخل‌نمونه معمولاً چند برابر
        خارج‌نمونه طول دارد، پس نسبت خام همیشه کوچک درمی‌آید حتی وقتی هیچ
        بیش‌برازشی وجود ندارد. نرمال‌سازی بر تعداد کندل این تحریف را حذف می‌کند.
        """
        if not self.folds:
            return None
        ins = sum(f.is_per_bar for f in self.folds)
        oos = sum(f.oos_per_bar for f in self.folds)
        return (oos / ins) if ins else None


def run(ts: TimeSeries,
        signal_fn: Callable[[TimeSeries, dict], Sequence[float]],
        param_grid: List[dict],
        is_bars: int = 500, oos_bars: int = 125,
        bt: Optional[Backtester] = None,
        threshold_in: float = 0.5, threshold_out: float = -0.5,
        objective: str = "total_return") -> WalkForwardResult:
    """
    signal_fn(ts_slice, params) باید سیگنالی هم‌طول ts_slice برگرداند که
    هر عنصرش فقط از داده تا همان کندل ساخته شده باشد.
    """
    bt = bt or Backtester()
    out = WalkForwardResult(n_trials=len(param_grid))
    n = len(ts)
    if n < is_bars + oos_bars:
        out.warnings.append(
            "داده (%d کندل) برای پنجره داخل‌نمونه %d + خارج‌نمونه %d کافی نیست."
            % (n, is_bars, oos_bars))
        return out

    all_dates, all_rets, all_eq, all_pos = [], [], [], []
    all_trades: List[Trade] = []
    equity = 1.0
    prev_best = None
    stable = 0
    folds = 0
    start = 0
    while start + is_bars + oos_bars <= n:
        is_s, is_e = start, start + is_bars
        oos_s, oos_e = is_e, min(n, is_e + oos_bars)
        f = Fold(folds, is_s, is_e, oos_s, oos_e)

        # --- انتخاب پارامتر فقط روی داخل‌نمونه ---
        best, best_val = None, -1e18
        is_slice = TimeSeries(ts.name, list(ts.bars[is_s:is_e]))
        for params in param_grid:
            sig = signal_fn(is_slice, params)
            r = bt.run(is_slice, sig, threshold_in=threshold_in,
                       threshold_out=threshold_out)
            val = (r.equity[-1] / r.equity[0] - 1.0) if r.equity else -1e18
            if val > best_val:
                best, best_val = params, val
        f.best_params, f.is_metric = dict(best or {}), best_val
        if prev_best is not None and best == prev_best:
            stable += 1
        prev_best = best

        # --- ارزیابی خارج‌نمونه ---
        # سیگنال روی داده از ابتدای داخل‌نمونه تا انتهای خارج‌نمونه ساخته
        # می‌شود تا اندیکاتورها گرم باشند، ولی فقط بخش خارج‌نمونه معامله می‌شود.
        full = TimeSeries(ts.name, list(ts.bars[is_s:oos_e]))
        sig_full = signal_fn(full, best or {})
        sig_oos = list(sig_full[is_bars:])
        oos_slice = TimeSeries(ts.name, list(ts.bars[oos_s:oos_e]))
        r = bt.run(oos_slice, sig_oos, threshold_in=threshold_in,
                   threshold_out=threshold_out)
        f.oos_return = (r.equity[-1] / r.equity[0] - 1.0) if r.equity else 0.0

        for k in range(len(r.dates)):
            all_dates.append(r.dates[k])
            all_rets.append(r.returns[k])
            all_pos.append(r.positions[k])
            equity *= (1.0 + r.returns[k])
            all_eq.append(equity)
        all_trades.extend(r.trades)

        out.folds.append(f)
        folds += 1
        start += oos_bars

    if folds > 1:
        out.param_stability = stable / (folds - 1)
    st = BacktestResult("خارج‌نمونه چسبانده‌شده", all_dates, all_eq, all_rets,
                        all_pos, all_trades, n_trials=len(param_grid))
    out.stitched = st
    eff = out.oos_efficiency
    if eff is not None and eff < 0.5:
        out.warnings.append(
            "کارایی خارج‌نمونه %.2f است (زیر ۰٫۵). یعنی عملکرد داخل‌نمونه عمدتاً "
            "از برازش پارامتر می‌آید، نه از لبه واقعی." % eff)
    if out.param_stability < 0.4 and folds > 2:
        out.warnings.append(
            "پارامتر بهینه فقط در %.0f٪ پنجره‌ها ثابت مانده. ناپایداری پارامتر "
            "نشانه این است که آنچه بهینه می‌شود نویز است." % (out.param_stability * 100))
    return out
