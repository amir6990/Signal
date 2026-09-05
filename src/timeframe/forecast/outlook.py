# -*- coding: utf-8 -*-
"""
چشم‌انداز احتمالاتی افق کوتاه — ترکیب رژیم، نرخ پایه و توزیع افت.

این ماژول به پرسش «آیا بازار در سه ماه آینده وارد رکود می‌شود؟» پاسخ می‌دهد،
ولی نه با بله/خیر. خروجی یک مجموعه احتمال است که هرکدام منبع و اندازه نمونه
مؤثر خودش را دارد.

سه لایه که عمداً جدا گزارش می‌شوند تا کاربر بداند هرکدام از کجا آمده:
  ۱. مدل رژیم (همیلتون) — برآورد پارامتریک از داده همین سری
  ۲. نرخ پایه تجربی — شمارش تاریخی، بدون مدل
  ۳. نرخ پایه شرطی — همان شمارش، محدود به شرایط شبیه امروز
اگر این سه با هم اختلاف زیاد داشته باشند، خودِ اختلاف اطلاعات است: یعنی
نتیجه به فرض‌های مدل حساس است.
"""
import datetime
from dataclasses import dataclass, field
from typing import List, Optional

from ..series import TimeSeries
from . import base_rates as BR
from . import drawdown as DD
from .regime import RegimeModel, fit as fit_regime, simulate as simulate_regime


@dataclass
class Outlook:
    symbol: str = ""
    as_of: Optional[datetime.date] = None
    horizon: int = 63
    horizon_label: str = "سه ماه"
    regime: Optional[RegimeModel] = None
    p_stress_now: Optional[float] = None
    p_stress_at_horizon: Optional[float] = None
    p_enter_stress: Optional[float] = None
    sim: Optional[dict] = None            # مونت‌کارلو از مدل رژیم
    base: Optional[BR.Distribution] = None
    conditional: Optional[BR.Distribution] = None
    condition_label: str = ""
    dd: Optional[DD.DrawdownForecast] = None
    dd_conditional: Optional[DD.DrawdownForecast] = None
    warnings: List[str] = field(default_factory=list)

    def report(self) -> str:
        L = ["─" * 74,
             "چشم‌انداز احتمالاتی %s — افق %s (%d کندل)، تا %s"
             % (self.symbol, self.horizon_label, self.horizon, self.as_of),
             "─" * 74,
             "\nاین اعداد احتمال‌اند، نه پیش‌بینی. «۳۰٪» یعنی اگر صد بار در چنین",
             "وضعیتی باشیم، حدود سی بار رخ می‌دهد — نه اینکه رخ می‌دهد یا نمی‌دهد."]

        L.append("\n[۱] مدل رژیم مارکوف (همیلتون ۱۹۸۹) — برآورد پارامتریک")
        if self.regime and self.regime.mu:
            L.append("   " + self.regime.summary().replace("\n", "\n   "))
            L.append("   احتمال بودن در رژیم پرتنش در پایان افق: %.0f%%"
                     % ((self.p_stress_at_horizon or 0) * 100))
            L.append("   احتمال ورود به رژیم پرتنش دست‌کم یک‌بار در افق: %.0f%%"
                     % ((self.p_enter_stress or 0) * 100))
            L.append("   (توجه: «ورود به رژیم پرتنش» با «افت شدید» یکی نیست — "
                     "رژیم پرتنش کوتاه و پرتکرار است.)")
        if self.sim:
            L.append("\n   شبیه‌سازی %d مسیر از همین مدل، برای مقایسه هم‌جنس:"
                     % self.sim["n_paths"])
            L.append("      بازده میانه %+.1f%% | صدک ۵٪ %+.1f%% | صدک ۹۵٪ %+.1f%%"
                     % (self.sim["median_return"] * 100, self.sim["q05"] * 100,
                        self.sim["q95"] * 100))
            L.append("      احتمال بازده منفی: %.0f%% | افت بازده بیش از ۱۰٪: %.0f%%"
                     % (self.sim["p_negative"] * 100, self.sim["p_below_10"] * 100))
            L.append("      احتمال بیشینه‌افت بیش از ۱۰٪: %.0f%% | بیش از ۲۰٪: %.0f%%"
                     % (self.sim["p_dd_10"] * 100, self.sim["p_dd_20"] * 100))
        else:
            L.append("   برآورد نشد (داده کافی نیست).")

        L.append("\n[۲] نرخ پایه تجربی — شمارش تاریخی، بدون مدل")
        if self.base:
            L.append(self.base.table())

        if self.conditional:
            L.append("\n[۳] نرخ پایه شرطی — محدود به شرایطی شبیه امروز")
            L.append("   شرط جاری: %s" % self.condition_label)
            L.append(self.conditional.table())

        L.append("\n[۴] توزیع بیشینه افت در افق")
        if self.dd:
            L.append(self.dd.table())
        if self.dd_conditional:
            L.append("\n   به‌شرط وضعیت جاری (%s):" % self.condition_label)
            L.append(self.dd_conditional.table())

        L.append("\n[۵] جمع‌بندی")
        L.extend("   " + x for x in self._synthesis())
        for w in self.warnings:
            L.append("\n   ⚠ " + w)
        return "\n".join(L)

    def _compare(self, event: str, getter) -> List[str]:
        """یک رویداد مشخص، برآوردشده با سه روش مستقل."""
        rows = []
        if self.sim:
            rows.append(("مدل رژیم (مونت‌کارلو)", getter("sim")))
        if self.base:
            rows.append(("نرخ پایه تجربی", getter("base")))
        if self.conditional:
            rows.append(("نرخ پایه شرطی%s" % ("" if self.conditional.reliable
                                              else " (نمونه کم)"), getter("cond")))
        rows = [(l, v) for l, v in rows if v is not None]
        if not rows:
            return []
        out = ["", event]
        for lbl, v in rows:
            out.append("   %-34s %3.0f%%" % (lbl, v * 100))
        vals = [v for _l, v in rows]
        spread = max(vals) - min(vals)
        if spread > 0.15:
            out.append("   ← اختلاف %.0f واحد درصد: نتیجه به روش حساس است."
                       % (spread * 100))
        return out

    def _synthesis(self) -> List[str]:
        out = ["یک رویداد، سه برآورد مستقل. هم‌جنس بودن رویداد شرط مقایسه است."]
        out += self._compare(
            "احتمال بازده منفی در افق:",
            lambda k: (self.sim["p_negative"] if k == "sim" else
                       self.base.p_negative if k == "base" else
                       self.conditional.p_negative if self.conditional else None))
        out += self._compare(
            "احتمال افت بازده بیش از ۱۰٪:",
            lambda k: (self.sim["p_below_10"] if k == "sim" else
                       self.base.p_below_10 if k == "base" else
                       self.conditional.p_below_10 if self.conditional else None))
        out += self._compare(
            "احتمال بیشینه‌افت بیش از ۲۰٪ داخل افق:",
            lambda k: (self.sim["p_dd_20"] if k == "sim" else
                       (self.dd.p_exceed.get(0.20) if self.dd else None) if k == "base" else
                       (self.dd_conditional.p_exceed.get(0.20)
                        if self.dd_conditional else None)))
        if self.p_enter_stress is not None:
            out.append("")
            out.append("جدا از موارد بالا — احتمال ورود به رژیم پرتنش: %.0f%%"
                       % (self.p_enter_stress * 100))
            out.append("این رویداد متفاوتی است و با احتمال افت شدید قابل مقایسه نیست.")
        return out


def build(ts: TimeSeries, horizon: int = 63, horizon_label: str = "سه ماه",
          periods_per_year: int = 245) -> Outlook:
    o = Outlook(symbol=ts.name, as_of=ts.last_date if len(ts) else None,
                horizon=horizon, horizon_label=horizon_label)
    if len(ts) < 150:
        o.warnings.append("سری کمتر از ۱۵۰ کندل دارد — هیچ برآورد احتمالاتی معتبر نیست.")
        return o

    rets = [ts.closes[i] / ts.closes[i - 1] - 1.0 for i in range(1, len(ts))]
    o.regime = fit_regime(rets, periods_per_year=periods_per_year)
    if o.regime and o.regime.mu:
        s = o.regime.stress_state
        o.p_stress_now = o.regime.p_stress_now
        o.p_stress_at_horizon = o.regime.state_prob_ahead(horizon)[s]
        o.p_enter_stress = o.regime.prob_enter_stress(horizon)
        o.sim = simulate_regime(o.regime, horizon)

    o.base = BR.unconditional(ts, horizon)
    o.dd = DD.forward_max_drawdown(ts, horizon)

    # شرط جاری: نسبت به میانگین ۲۰۰
    i = len(ts) - 1
    if i >= 200:
        below = BR.below_ma(200)
        if below(ts, i):
            o.condition_label = "قیمت زیر میانگین متحرک ۲۰۰"
            cond = below
        else:
            o.condition_label = "قیمت بالای میانگین متحرک ۲۰۰"
            cond = BR.above_ma(200)
        o.conditional = BR.conditional(ts, horizon, cond, o.condition_label)
        o.dd_conditional = DD.forward_max_drawdown(ts, horizon, cond)
    else:
        o.warnings.append("کمتر از ۲۰۰ کندل — تحلیل شرطی انجام نشد.")

    if o.base and not o.base.reliable:
        o.warnings.append(
            "به‌دلیل همپوشانی پنجره‌های %d کندلی، تعداد مشاهده مستقل حدود %.0f است. "
            "همه احتمال‌های بالا عدم‌قطعیت زیادی دارند."
            % (horizon, o.base.n_effective))
    return o
