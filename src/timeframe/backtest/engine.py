# -*- coding: utf-8 -*-
"""
موتور بک‌تست — با محدودیت‌های واقعی بازار ایران.

سه اصل که اگر رعایت نشوند، بک‌تست فقط خودفریبی است:

۱. **بدون نگاه به آینده.** سیگنال با داده تا پایان روز t ساخته می‌شود و
   اجرا در روز t+1 انجام می‌شود. هیچ محاسبه‌ای اجازه ندارد از قیمت روزی
   استفاده کند که هنوز نیامده.
۲. **هزینه واقعی.** کارمزد و مالیات بازار ایران، به‌علاوه لغزش. استراتژی
   پرگردش بدون هزینه همیشه سودآور به‌نظر می‌رسد.
۳. **صف خرید و فروش.** در بازار ایران وقتی نماد در صف قفل است، معامله
   انجام نمی‌شود. نادیده‌گرفتن این محدودیت، بازده را به‌شدت بیش‌برآورد می‌کند
   چون دقیقاً در بهترین روزها امکان ورود وجود نداشته.
"""
import datetime
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Sequence

from ..series import TimeSeries


@dataclass
class Costs:
    """هزینه معاملات بازار سرمایه ایران.

    ⚠️ نرخ‌ها تقریبی و قابل تغییرند؛ نرخ روز را از کارگزاری خود تأیید کنید.
    مقادیر پیش‌فرض: خرید حدود ۰٫۳۷٪ و فروش حدود ۰٫۸۸٪ (شامل مالیات فروش).
    """
    buy_bps: float = 37.0          # صدم‌درصد
    sell_bps: float = 88.0
    slippage_bps: float = 15.0     # لغزش هر طرف
    verified: bool = False

    @property
    def buy_cost(self) -> float:
        return (self.buy_bps + self.slippage_bps) / 10000.0

    @property
    def sell_cost(self) -> float:
        return (self.sell_bps + self.slippage_bps) / 10000.0

    @property
    def round_trip(self) -> float:
        return self.buy_cost + self.sell_cost


@dataclass
class Trade:
    entry_date: datetime.date
    entry_price: float
    exit_date: Optional[datetime.date] = None
    exit_price: Optional[float] = None
    bars_held: int = 0
    gross_return: float = 0.0
    net_return: float = 0.0
    exit_reason: str = ""


@dataclass
class BacktestResult:
    name: str
    dates: List[datetime.date] = field(default_factory=list)
    equity: List[float] = field(default_factory=list)
    returns: List[float] = field(default_factory=list)
    positions: List[float] = field(default_factory=list)
    trades: List[Trade] = field(default_factory=list)
    blocked_days: int = 0            # روزهایی که صف مانع اجرا شد
    turnover: float = 0.0
    n_trials: int = 1
    warnings: List[str] = field(default_factory=list)

    @property
    def trade_pnls(self) -> List[float]:
        """بازده خالص همه معاملات، شامل موقعیت بازِ انتهای دوره.

        موقعیت باز در انتهای بک‌تست در عمل همان‌جا بسته می‌شود (دوره تمام شده)،
        پس کنارگذاشتنش تعداد معاملات را کم‌شمار و نرخ برد را تحریف می‌کند —
        به‌ویژه در walk-forward که هر پنجره یک انتها دارد.
        """
        return [t.net_return for t in self.trades]

    @property
    def n_closed(self) -> int:
        return sum(1 for t in self.trades if t.exit_date is not None)

    @property
    def n_open_at_end(self) -> int:
        return sum(1 for t in self.trades if t.exit_date is None)


class Backtester:
    """بک‌تستر طولانی-فقط (long-only) — چون فروش استقراضی در بورس ایران نیست."""

    def __init__(self, costs: Optional[Costs] = None,
                 execution_lag: int = 1,
                 allow_locked_queue: bool = False,
                 stop_atr_mult: Optional[float] = None,
                 max_hold_bars: Optional[int] = None,
                 periods_per_year: int = 245):
        self.costs = costs or Costs()
        self.execution_lag = max(1, execution_lag)
        self.allow_locked_queue = allow_locked_queue
        self.stop_atr_mult = stop_atr_mult
        self.max_hold_bars = max_hold_bars
        self.periods_per_year = periods_per_year

    # ------------------------------------------------------------------
    @staticmethod
    def _locked_at(highs, lows, i: int) -> bool:
        """آیا نماد در صف قفل است؟ تقریب: های و لو یکی و برابر قیمت پایانی."""
        return abs(highs[i] - lows[i]) < 1e-9

    def run(self, ts: TimeSeries, signal: Sequence[float], name: str = "",
            threshold_in: float = 0.5, threshold_out: float = -0.5,
            atr: Optional[Sequence[Optional[float]]] = None,
            n_trials: int = 1) -> BacktestResult:
        """signal[i] با داده تا و شامل کندل i ساخته شده باشد.

        ورود وقتی signal >= threshold_in و خروج وقتی signal <= threshold_out
        (هیسترزیس، تا نوسان حول یک آستانه معامله بی‌جهت نسازد).
        """
        res = BacktestResult(name=name or ts.name, n_trials=n_trials)
        n = len(ts)
        if n < 10 or len(signal) != n:
            res.warnings.append("طول سیگنال با سری برابر نیست یا داده کم است.")
            return res

        equity = 1.0
        pos = 0.0
        entry_i = None
        entry_px = 0.0
        stop_px = None
        turnover = 0.0

        # ⚠️ closes/highs/lows در TimeSeries **property** هستند و هر بار
        # فهرست را از نو می‌سازند. خواندنشان داخل حلقه، بک‌تست را O(n²)
        # می‌کرد: روی ۸٬۰۰۰ کندل حدود ۱٫۹ ثانیه به‌جای ۱۵ میلی‌ثانیه. یک بار
        # بیرون حلقه گرفته می‌شوند.
        closes = ts.closes
        highs = ts.highs
        lows = ts.lows
        bars = ts.bars

        for i in range(n):
            px = closes[i]
            prev_px = closes[i - 1] if i > 0 else px
            # بازده روز جاری با موقعیتی که از دیروز داشتیم
            r = (px / prev_px - 1.0) * pos if i > 0 else 0.0

            # ---- تصمیم بر مبنای سیگنالِ execution_lag روز قبل ----
            j = i - self.execution_lag
            desired = pos
            if j >= 0:
                s = signal[j]
                if pos == 0.0 and s >= threshold_in:
                    desired = 1.0
                elif pos > 0.0 and s <= threshold_out:
                    desired = 0.0
            # حد ضرر و حداکثر مدت نگهداری
            if pos > 0.0 and entry_i is not None:
                if stop_px is not None and lows[i] <= stop_px:
                    desired = 0.0
                if self.max_hold_bars and (i - entry_i) >= self.max_hold_bars:
                    desired = 0.0

            if desired != pos:
                if not self.allow_locked_queue and self._locked_at(highs, lows, i):
                    res.blocked_days += 1          # صف قفل — اجرا ممکن نیست
                else:
                    if desired > pos:              # ورود
                        cost = self.costs.buy_cost
                        r -= cost
                        turnover += 1.0
                        entry_i, entry_px = i, px
                        stop_px = (px - self.stop_atr_mult * atr[i]
                                   if (self.stop_atr_mult and atr and atr[i]) else None)
                    else:                          # خروج
                        cost = self.costs.sell_cost
                        r -= cost
                        turnover += 1.0
                        if entry_i is not None:
                            gross = px / entry_px - 1.0
                            res.trades.append(Trade(
                                bars[entry_i].date, entry_px, bars[i].date, px,
                                i - entry_i, gross,
                                gross - self.costs.round_trip,
                                "حد ضرر" if (stop_px and lows[i] <= stop_px) else "سیگنال"))
                        entry_i, stop_px = None, None
                    pos = desired

            equity *= (1.0 + r)
            res.dates.append(bars[i].date)
            res.returns.append(r)
            res.equity.append(equity)
            res.positions.append(pos)

        if pos > 0.0 and entry_i is not None:       # موقعیت باز در انتها
            gross = closes[-1] / entry_px - 1.0
            res.trades.append(Trade(bars[entry_i].date, entry_px, None, None,
                                    n - 1 - entry_i, gross,
                                    gross - self.costs.round_trip, "باز در پایان دوره"))
        res.turnover = turnover
        if res.blocked_days:
            res.warnings.append(
                "%d روز به‌دلیل قفل‌بودن صف، اجرا ممکن نبود. اگر این عدد بزرگ است، "
                "استراتژی در عمل قابل اجرا نیست." % res.blocked_days)
        if not self.costs.verified:
            res.warnings.append(
                "نرخ کارمزد و مالیات تأیید نشده است (خرید %.2f٪، فروش %.2f٪ + لغزش %.2f٪). "
                "نرخ روز را از کارگزاری بگیرید."
                % (self.costs.buy_bps / 100, self.costs.sell_bps / 100,
                   self.costs.slippage_bps / 100))
        return res

    # ------------------------------------------------------------------
    def buy_and_hold(self, ts: TimeSeries) -> BacktestResult:
        res = BacktestResult("خرید و نگهداری")
        closes, bars = ts.closes, ts.bars      # همان دلیل بالا: property است
        eq = 1.0 - self.costs.buy_cost
        for i in range(len(ts)):
            r = (closes[i] / closes[i - 1] - 1.0) if i > 0 else -self.costs.buy_cost
            eq = eq * (1 + r) if i > 0 else eq
            res.dates.append(bars[i].date)
            res.returns.append(r)
            res.equity.append(eq)
            res.positions.append(1.0)
        g = closes[-1] / closes[0] - 1.0
        res.trades.append(Trade(bars[0].date, closes[0], bars[-1].date,
                                closes[-1], len(ts) - 1, g,
                                g - self.costs.round_trip, "پایان دوره"))
        return res
