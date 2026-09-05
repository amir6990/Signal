# -*- coding: utf-8 -*-
"""
معیارهای عملکرد — با تأکید بر آن‌هایی که سخت‌گیرند، نه آن‌هایی که خوشحال‌کننده‌اند.

منابع:
  • Bailey & López de Prado (2014) — The Deflated Sharpe Ratio
  • Bailey, Borwein, López de Prado & Zhu (2014) — Pseudo-Mathematics and
    Financial Charlatanism
  • Welch & Goyal (2008) — چرا تقریباً همه پیش‌بین‌ها خارج از نمونه شکست می‌خورند

نکته مرکزی: نسبت شارپ خام در حضور چند تلاش بی‌معناست. اگر ۱۰۰ ترکیب پارامتر
امتحان کنید، بهترینشان حتی روی داده تصادفی شارپ چشمگیری نشان می‌دهد. عددی که
باید گزارش شود «شارپ تعدیل‌شده» است، نه شارپ.
"""
import math
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

SQRT2 = math.sqrt(2.0)


def _mean(x):
    return sum(x) / len(x) if x else 0.0


def _std(x, ddof=1):
    n = len(x)
    if n <= ddof:
        return 0.0
    m = _mean(x)
    return math.sqrt(sum((v - m) ** 2 for v in x) / (n - ddof))


def _skew(x):
    n, sd = len(x), _std(x)
    if n < 3 or sd == 0:
        return 0.0
    m = _mean(x)
    return sum((v - m) ** 3 for v in x) / n / sd ** 3


def _kurt(x):
    """کشیدگی خام (نرمال = ۳)."""
    n, sd = len(x), _std(x)
    if n < 4 or sd == 0:
        return 3.0
    m = _mean(x)
    return sum((v - m) ** 4 for v in x) / n / sd ** 4


def norm_cdf(z):
    return 0.5 * (1.0 + math.erf(z / SQRT2))


def norm_ppf(p):
    """معکوس تابع توزیع نرمال — تقریب Acklam."""
    if p <= 0.0:
        return -8.0
    if p >= 1.0:
        return 8.0
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    pl, ph = 0.02425, 1 - 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > ph:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)


@dataclass
class Performance:
    n_periods: int = 0
    total_return: float = 0.0
    cagr: float = 0.0
    volatility: float = 0.0
    sharpe: float = 0.0
    deflated_sharpe: Optional[float] = None
    psr: Optional[float] = None            # Probabilistic Sharpe Ratio
    sortino: float = 0.0
    max_drawdown: float = 0.0
    calmar: float = 0.0
    hit_rate: float = 0.0
    profit_factor: float = 0.0
    exposure: float = 0.0
    n_trades: int = 0
    avg_trade: float = 0.0
    skew: float = 0.0
    kurtosis: float = 3.0
    turnover: float = 0.0
    notes: List[str] = field(default_factory=list)

    def table(self) -> str:
        rows = [
            ("بازده کل", "%.2f%%" % (self.total_return * 100)),
            ("بازده مرکب سالانه", "%.2f%%" % (self.cagr * 100)),
            ("نوسان سالانه", "%.2f%%" % (self.volatility * 100)),
            ("نسبت شارپ (خام)", "%.3f" % self.sharpe),
            ("نسبت شارپ تعدیل‌شده", "%.3f" % self.deflated_sharpe
             if self.deflated_sharpe is not None else "—"),
            ("احتمال شارپ مثبت (PSR)", "%.1f%%" % (self.psr * 100)
             if self.psr is not None else "—"),
            ("نسبت سورتینو", "%.3f" % self.sortino),
            ("بیشینه افت سرمایه", "%.2f%%" % (self.max_drawdown * 100)),
            ("نسبت کالمار", "%.3f" % self.calmar),
            ("نرخ برد", "%.1f%%" % (self.hit_rate * 100)),
            ("ضریب سود", "%.2f" % self.profit_factor),
            ("درصد زمان در بازار", "%.1f%%" % (self.exposure * 100)),
            ("تعداد معامله", "%d" % self.n_trades),
            ("میانگین هر معامله", "%.2f%%" % (self.avg_trade * 100)),
            ("چولگی بازده", "%.2f" % self.skew),
            ("کشیدگی بازده", "%.2f" % self.kurtosis),
        ]
        return "\n".join("   %-26s %s" % (k, v) for k, v in rows)


def max_drawdown(equity: Sequence[float]):
    peak, mdd = equity[0] if equity else 1.0, 0.0
    for v in equity:
        peak = max(peak, v)
        if peak > 0:
            mdd = min(mdd, v / peak - 1.0)
    return mdd


def probabilistic_sharpe(sr, n, skew, kurt, sr_benchmark=0.0):
    """احتمال اینکه شارپ واقعی از معیار بیشتر باشد (Bailey & López de Prado).

    چولگی منفی و کشیدگی بالا — هر دو مشخصه بازار ایران — شارپ را کم‌اعتبارتر
    می‌کنند و این فرمول آن را لحاظ می‌کند.
    """
    if n < 3:
        return None
    denom = 1.0 - skew * sr + (kurt - 1.0) / 4.0 * sr * sr
    if denom <= 0:
        return None
    z = (sr - sr_benchmark) * math.sqrt(n - 1) / math.sqrt(denom)
    return norm_cdf(z)


def deflated_sharpe(sr, n, skew, kurt, n_trials, sr_variance=None):
    """شارپ تعدیل‌شده بابت تعداد تلاش (Bailey & López de Prado 2014).

    منطق: با N تلاش مستقل، بیشینه شارپِ مورد انتظار حتی از داده بی‌اثر هم
    مثبت است. معیار مقایسه باید همان بیشینه مورد انتظار باشد، نه صفر.
    """
    if n_trials < 1 or n < 3:
        return None
    v = sr_variance if sr_variance is not None else 1.0 / max(1, n - 1)
    sd = math.sqrt(v)
    e = 0.5772156649015329          # ثابت اویلر-ماسکرونی
    if n_trials == 1:
        sr0 = 0.0
    else:
        sr0 = sd * ((1 - e) * norm_ppf(1 - 1.0 / n_trials)
                    + e * norm_ppf(1 - 1.0 / (n_trials * math.e)))
    return probabilistic_sharpe(sr, n, skew, kurt, sr0)


def summarize(returns: Sequence[float], equity: Sequence[float],
              positions: Sequence[float], trade_pnls: Sequence[float],
              periods_per_year: int = 245, n_trials: int = 1,
              turnover: float = 0.0) -> Performance:
    p = Performance(n_periods=len(returns))
    if not returns:
        p.notes.append("هیچ بازده‌ای تولید نشد.")
        return p
    p.total_return = equity[-1] / equity[0] - 1.0 if equity and equity[0] else 0.0
    yrs = len(returns) / periods_per_year
    p.cagr = ((1 + p.total_return) ** (1 / yrs) - 1) if yrs > 0 and p.total_return > -1 else 0.0
    sd = _std(returns)
    p.volatility = sd * math.sqrt(periods_per_year)
    mu = _mean(returns)
    p.sharpe = (mu / sd * math.sqrt(periods_per_year)) if sd > 0 else 0.0
    downside = [r for r in returns if r < 0]
    dsd = _std(downside) if len(downside) > 1 else 0.0
    p.sortino = (mu / dsd * math.sqrt(periods_per_year)) if dsd > 0 else 0.0
    p.max_drawdown = max_drawdown(equity)
    p.calmar = (p.cagr / abs(p.max_drawdown)) if p.max_drawdown < 0 else 0.0
    p.skew, p.kurtosis = _skew(returns), _kurt(returns)
    p.exposure = _mean([1.0 if abs(x) > 1e-12 else 0.0 for x in positions])
    p.turnover = turnover
    p.n_trades = len(trade_pnls)
    if trade_pnls:
        wins = [t for t in trade_pnls if t > 0]
        losses = [t for t in trade_pnls if t < 0]
        p.hit_rate = len(wins) / len(trade_pnls)
        p.profit_factor = (sum(wins) / abs(sum(losses))) if losses and sum(losses) else float("inf")
        p.avg_trade = _mean(trade_pnls)
    sr_per_period = mu / sd if sd > 0 else 0.0
    p.psr = probabilistic_sharpe(sr_per_period, len(returns), p.skew, p.kurtosis)
    p.deflated_sharpe = deflated_sharpe(sr_per_period, len(returns), p.skew,
                                        p.kurtosis, n_trials)
    if n_trials > 1:
        p.notes.append("شارپ تعدیل‌شده بابت %d تلاش پارامتری محاسبه شده است." % n_trials)
    if p.n_trades < 30:
        p.notes.append("تعداد معامله (%d) برای استنتاج آماری کم است؛ "
                       "زیر ۳۰ معامله هر نتیجه‌ای می‌تواند تصادفی باشد." % p.n_trades)
    if p.kurtosis > 6:
        p.notes.append("کشیدگی %.1f — توزیع بازده دم‌ضخیم است و معیارهای مبتنی "
                       "بر واریانس ریسک را کم‌برآورد می‌کنند." % p.kurtosis)
    return p
