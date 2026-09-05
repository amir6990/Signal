# -*- coding: utf-8 -*-
"""تحلیل زمانی سرتاسری یک نماد: کشف چرخه → فازبندی → پنجره‌ها → امتیاز."""
import datetime
from dataclasses import dataclass, field
from typing import List, Optional

from . import fib_time, gann, hurst, scoring, spectral
from .config import TimeframeConfig
from .filters import linreg_slope
from .hurst import CycleState, FLDSignal
from .series import TimeSeries
from .spectral import CycleFinding


@dataclass
class SymbolTimeAnalysis:
    symbol: str
    as_of: datetime.date
    n_bars: int
    cycles_found: List[CycleFinding] = field(default_factory=list)
    dominant: Optional[CycleFinding] = None
    dominant_state: Optional[CycleState] = None
    nominal_states: List[CycleState] = field(default_factory=list)
    fld: Optional[FLDSignal] = None
    vtl_above: Optional[bool] = None
    gann_windows: List[gann.TimeWindow] = field(default_factory=list)
    gann_active: List[gann.TimeWindow] = field(default_factory=list)
    fib_windows: List[gann.TimeWindow] = field(default_factory=list)
    fib_active: List[gann.TimeWindow] = field(default_factory=list)
    swing_high: Optional[datetime.date] = None
    swing_low: Optional[datetime.date] = None
    trend_hint: float = 0.0
    score: Optional[scoring.TimeScore] = None
    notes: List[str] = field(default_factory=list)


def _recent_swing(ts: TimeSeries, lookback: int = 250):
    """آخرین سقف و کف مهم در پنجره اخیر — لنگر شمارش‌های گن و فیبوناچی."""
    n = len(ts)
    seg = range(max(0, n - lookback), n)
    hi_i = max(seg, key=lambda i: ts.highs[i])
    lo_i = min(seg, key=lambda i: ts.lows[i])
    return ts.bars[hi_i].date, ts.bars[lo_i].date


def analyze(ts: TimeSeries, cfg: Optional[TimeframeConfig] = None,
            elliott_label: str = "", elliott_confidence: Optional[int] = None,
            strict_spectral: bool = False,
            today: Optional[datetime.date] = None) -> SymbolTimeAnalysis:
    cfg = cfg or TimeframeConfig()
    today = today or ts.last_date
    res = SymbolTimeAnalysis(ts.name, today, len(ts))

    if len(ts) < 60:
        res.notes.append("سری کمتر از ۶۰ کندل دارد — تحلیل چرخه‌ای معنا ندارد.")
        res.score = scoring.compute(cfg=cfg)
        return res

    # ۱) کشف چرخه
    res.cycles_found = spectral.find_cycles(ts.closes, cfg.spectral, strict=strict_spectral)
    res.dominant = next((c for c in res.cycles_found if c.significant), None)
    if res.dominant is None:
        res.notes.append(
            "هیچ چرخه‌ای از آزمون معناداری عبور نکرد. این یعنی داده شواهد کافی "
            "برای وجود چرخه نمی‌دهد — نه اینکه چرخه‌ای هست و ما پیدایش نکردیم. "
            "به‌جای آن، مدل اسمی هرست به‌عنوان چارچوب پیش‌فرض به کار می‌رود.")

    # ۲) فازبندی
    period = res.dominant.period if res.dominant else None
    res.nominal_states = hurst.phasing(ts, cfg.hurst,
                                       extra_periods=[period] if period else None)
    if period:
        res.dominant_state = hurst.analyze_cycle(ts, period, "چرخه کشف‌شده", cfg.hurst)
    elif res.nominal_states:
        # بلندترین چرخه اسمی که داده کافی دارد
        res.dominant_state = max(res.nominal_states, key=lambda s: s.period_bars)
        period = res.dominant_state.period_bars

    # ۳) FLD و VTL
    if period:
        res.fld = hurst.fld_signal(ts, period)
        bigger = [s for s in res.nominal_states if s.period_bars > period * 1.5]
        if bigger:
            v = hurst.vtl(ts, min(bigger, key=lambda s: s.period_bars))
            res.vtl_above = v.price_above if v.valid else None

    # ۴) لنگرها و پنجره‌های زمانی
    res.swing_high, res.swing_low = _recent_swing(ts)
    anchors = [(res.swing_low, "کف اخیر"), (res.swing_high, "سقف اخیر")]
    res.gann_windows = gann.upcoming(anchors, today, cfg.gann)
    res.gann_active = [w for w in res.gann_windows
                       if abs(w.days_from_today) <= cfg.gann.tolerance_days]
    sw = [fib_time.Swing(min(res.swing_low, res.swing_high),
                         max(res.swing_low, res.swing_high), "سوئینگ اخیر")]
    res.fib_windows = fib_time.upcoming(sw, today, cfg.fib)
    res.fib_active = [w for w in res.fib_windows
                      if abs(w.days_from_today) <= cfg.fib.tolerance_days]

    # ۵) جهت روند (برای جهت‌دادن به پنجره‌های بی‌جهت)
    tail = ts.closes[-40:]
    sl = linreg_slope(tail)
    avg = sum(tail) / len(tail)
    res.trend_hint = max(-1.0, min(1.0, (sl / avg * 100) if avg else 0.0))

    # ۶) امتیاز
    res.score = scoring.compute(
        cycle=res.dominant_state, fld=res.fld,
        gann_active=len(res.gann_active), fib_active=len(res.fib_active),
        elliott_label=elliott_label, elliott_confidence=elliott_confidence,
        cfg=cfg, direction_hint=res.trend_hint,
        cycle_validated=res.dominant is not None)
    return res
