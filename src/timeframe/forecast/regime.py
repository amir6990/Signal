# -*- coding: utf-8 -*-
"""
مدل مارکوف رژیم‌سوئیچینگ — پاسخ کمّی به «آیا بازار وارد رکود می‌شود؟»

منبع: James D. Hamilton (1989), "A New Approach to the Economic Analysis of
Nonstationary Time Series and the Business Cycle", Econometrica 57(2).

مدل: بازده روزانه از یکی از دو توزیع نرمال می‌آید — رژیم آرام با میانگین
بالاتر و نوسان کمتر، و رژیم پرتنش با میانگین پایین‌تر و نوسان بیشتر. گذار بین
دو رژیم یک زنجیره مارکوف است. پارامترها با الگوریتم EM (باوم-ولش) برآورد
می‌شوند.

سه محدودیت که باید بدانید:
  ۱. مدل رژیم را با **تأخیر** تشخیص می‌دهد. احتمال هموارشده امروز از داده
     امروز می‌آید؛ در لحظه‌ی چرخش، مدل هنوز نمی‌داند چرخش رخ داده.
  ۲. ماتریس گذار **ثابت** فرض می‌شود. در بازاری که ساختارش عوض می‌شود — مثل
     بازار ایران پس از یک شوک سیاستی — این فرض می‌شکند.
  ۳. خروجی یک **احتمال** است، نه پیش‌بینی. «۳۵٪ احتمال رژیم پرتنش در سه ماه»
     یعنی اگر صد بار در چنین وضعیتی باشیم، حدود ۳۵ بار رخ می‌دهد — نه اینکه
     رخ می‌دهد یا نمی‌دهد.
"""
import math
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

SQRT2PI = math.sqrt(2.0 * math.pi)


def _npdf(x, mu, sigma):
    if sigma <= 0:
        return 1e-300
    z = (x - mu) / sigma
    return max(1e-300, math.exp(-0.5 * z * z) / (sigma * SQRT2PI))


@dataclass
class RegimeModel:
    mu: List[float] = field(default_factory=list)        # میانگین بازده هر رژیم
    sigma: List[float] = field(default_factory=list)     # انحراف معیار هر رژیم
    P: List[List[float]] = field(default_factory=list)   # ماتریس گذار
    filtered: List[List[float]] = field(default_factory=list)
    smoothed: List[List[float]] = field(default_factory=list)
    loglik: float = 0.0
    iterations: int = 0
    converged: bool = False
    n_obs: int = 0
    periods_per_year: int = 245
    warnings: List[str] = field(default_factory=list)

    # ---- رژیم پرتنش = پایین‌ترین میانگین ----
    @property
    def stress_state(self) -> int:
        return 0 if self.mu[0] < self.mu[1] else 1

    @property
    def calm_state(self) -> int:
        return 1 - self.stress_state

    @property
    def p_stress_now(self) -> float:
        return self.smoothed[-1][self.stress_state] if self.smoothed else 0.0

    def expected_duration(self, state: int) -> float:
        """میانگین ماندگاری در یک رژیم (کندل). = ۱ ÷ (۱ − احتمال ماندن)."""
        p = self.P[state][state]
        return (1.0 / (1.0 - p)) if p < 1.0 else float("inf")

    def annualized(self, state: int):
        return (self.mu[state] * self.periods_per_year,
                self.sigma[state] * math.sqrt(self.periods_per_year))

    # ---- پیش‌بینی ----
    def state_prob_ahead(self, horizon: int) -> List[float]:
        """توزیع احتمال رژیم پس از h کندل: ξ_T × P^h."""
        v = list(self.smoothed[-1])
        for _ in range(horizon):
            v = [sum(v[i] * self.P[i][j] for i in range(2)) for j in range(2)]
        return v

    def prob_enter_stress(self, horizon: int) -> float:
        """احتمال اینکه دست‌کم یک بار در h کندل آینده وارد رژیم پرتنش شویم.

        اگر همین حالا در رژیم پرتنش باشیم، این عدد ۱ است. در غیر این صورت:
        ۱ − احتمالِ ماندن پیوسته در رژیم آرام برای تمام h گام.
        """
        s, c = self.stress_state, self.calm_state
        p_now_stress = self.smoothed[-1][s]
        stay = self.P[c][c] ** horizon
        return p_now_stress + (1.0 - p_now_stress) * (1.0 - stay)

    def summary(self) -> str:
        s, c = self.stress_state, self.calm_state
        mc, vc = self.annualized(c)
        ms, vs = self.annualized(s)
        L = ["مدل دو رژیمی مارکوف (همیلتون ۱۹۸۹) — %d مشاهده، %d تکرار EM%s"
             % (self.n_obs, self.iterations, "، همگرا" if self.converged else "، همگرا نشد"),
             "   رژیم آرام:   بازده سالانه %+7.1f%% | نوسان %5.1f%% | ماندگاری میانگین %5.0f کندل"
             % (mc * 100, vc * 100, self.expected_duration(c)),
             "   رژیم پرتنش:  بازده سالانه %+7.1f%% | نوسان %5.1f%% | ماندگاری میانگین %5.0f کندل"
             % (ms * 100, vs * 100, self.expected_duration(s)),
             "   احتمال رژیم پرتنش هم‌اکنون: %.1f%%" % (self.p_stress_now * 100)]
        for w in self.warnings:
            L.append("   ⚠ " + w)
        return "\n".join(L)


def simulate(model: "RegimeModel", horizon: int, n_paths: int = 5000,
             seed: int = 23):
    """مونت‌کارلو از مدل برازش‌شده: توزیع بازده و بیشینه افت در افق.

    چرا لازم است: مدل رژیم مستقیماً «احتمال افت بیش از ۱۰٪» نمی‌دهد؛ آنچه
    می‌دهد پارامترهای دو توزیع و ماتریس گذار است. برای مقایسه با نرخ پایه
    تجربی — که همان افت را می‌شمارد — باید از مدل مسیر تولید کرد. بدون این
    کار، دو عدد ناهم‌جنس کنار هم گزارش می‌شوند و مقایسه‌شان بی‌معناست.
    """
    import random as _random
    if not model or not model.mu or not model.smoothed:
        return None
    rng = _random.Random(seed)
    start = model.smoothed[-1]
    rets, dds = [], []
    for _ in range(n_paths):
        st = 0 if rng.random() < start[0] else 1
        eq, peak, worst = 1.0, 1.0, 0.0
        for _t in range(horizon):
            st = 0 if rng.random() < model.P[st][0] else 1
            eq *= (1.0 + rng.gauss(model.mu[st], model.sigma[st]))
            peak = max(peak, eq)
            worst = min(worst, eq / peak - 1.0)
        rets.append(eq - 1.0)
        dds.append(worst)
    rets.sort()
    dds.sort()

    def q(xs, p):
        import math as _m
        pos = p * (len(xs) - 1)
        lo = int(_m.floor(pos))
        hi = min(lo + 1, len(xs) - 1)
        fr = pos - lo
        return xs[lo] * (1 - fr) + xs[hi] * fr

    n = len(rets)
    return {
        "n_paths": n,
        "mean_return": sum(rets) / n,
        "median_return": q(rets, 0.5),
        "q05": q(rets, 0.05), "q95": q(rets, 0.95),
        "p_negative": sum(1 for r in rets if r < 0) / n,
        "p_below_10": sum(1 for r in rets if r <= -0.10) / n,
        "p_below_20": sum(1 for r in rets if r <= -0.20) / n,
        "median_dd": q(dds, 0.5),
        "p_dd_10": sum(1 for d in dds if d <= -0.10) / n,
        "p_dd_20": sum(1 for d in dds if d <= -0.20) / n,
        "p_dd_30": sum(1 for d in dds if d <= -0.30) / n,
    }


def fit(returns: Sequence[float], max_iter: int = 300, tol: float = 1e-7,
        periods_per_year: int = 245, seed_split: float = 0.5) -> Optional[RegimeModel]:
    """برآورد مدل دو رژیمی با EM (باوم-ولش) و مقیاس‌بندی برای پایداری عددی."""
    r = [x for x in returns if x is not None and math.isfinite(x)]
    n = len(r)
    if n < 100:
        m = RegimeModel(n_obs=n)
        m.warnings.append("کمتر از ۱۰۰ مشاهده — برآورد رژیم بی‌معناست.")
        return m if n else None

    mean = sum(r) / n
    var = sum((x - mean) ** 2 for x in r) / (n - 1)
    sd = math.sqrt(var) or 1e-8
    # مقداردهی اولیه: یک رژیم با نوسان کم و یک رژیم با نوسان زیاد
    mu = [mean + 0.5 * sd, mean - 0.5 * sd]
    sig = [sd * 0.7, sd * 1.6]
    P = [[0.95, 0.05], [0.10, 0.90]]

    m = RegimeModel(n_obs=n, periods_per_year=periods_per_year)
    prev_ll = -1e18
    for it in range(max_iter):
        # ---------- forward (با مقیاس‌بندی) ----------
        alpha = [[0.0, 0.0] for _ in range(n)]
        scale = [0.0] * n
        pi = [0.5, 0.5]
        for j in range(2):
            alpha[0][j] = pi[j] * _npdf(r[0], mu[j], sig[j])
        scale[0] = sum(alpha[0]) or 1e-300
        alpha[0] = [a / scale[0] for a in alpha[0]]
        for t in range(1, n):
            for j in range(2):
                alpha[t][j] = sum(alpha[t - 1][i] * P[i][j] for i in range(2)) \
                    * _npdf(r[t], mu[j], sig[j])
            scale[t] = sum(alpha[t]) or 1e-300
            alpha[t] = [a / scale[t] for a in alpha[t]]
        ll = sum(math.log(s) for s in scale)

        # ---------- backward ----------
        beta = [[0.0, 0.0] for _ in range(n)]
        beta[-1] = [1.0, 1.0]
        for t in range(n - 2, -1, -1):
            for i in range(2):
                beta[t][i] = sum(P[i][j] * _npdf(r[t + 1], mu[j], sig[j]) * beta[t + 1][j]
                                 for j in range(2)) / scale[t + 1]

        # ---------- gamma و xi ----------
        gamma = []
        for t in range(n):
            g = [alpha[t][j] * beta[t][j] for j in range(2)]
            tot = sum(g) or 1e-300
            gamma.append([x / tot for x in g])

        xi_sum = [[0.0, 0.0], [0.0, 0.0]]
        for t in range(n - 1):
            denom = 0.0
            tmp = [[0.0, 0.0], [0.0, 0.0]]
            for i in range(2):
                for j in range(2):
                    tmp[i][j] = alpha[t][i] * P[i][j] * \
                        _npdf(r[t + 1], mu[j], sig[j]) * beta[t + 1][j]
                    denom += tmp[i][j]
            denom = denom or 1e-300
            for i in range(2):
                for j in range(2):
                    xi_sum[i][j] += tmp[i][j] / denom

        # ---------- M-step ----------
        for i in range(2):
            row = sum(xi_sum[i]) or 1e-300
            P[i] = [xi_sum[i][j] / row for j in range(2)]
        for j in range(2):
            w = sum(gamma[t][j] for t in range(n)) or 1e-300
            mu[j] = sum(gamma[t][j] * r[t] for t in range(n)) / w
            v = sum(gamma[t][j] * (r[t] - mu[j]) ** 2 for t in range(n)) / w
            sig[j] = max(math.sqrt(max(v, 1e-18)), sd * 1e-3)

        m.iterations = it + 1
        if abs(ll - prev_ll) < tol * max(1.0, abs(prev_ll)):
            m.converged = True
            prev_ll = ll
            m.filtered = alpha
            m.smoothed = gamma
            break
        prev_ll = ll
        m.filtered = alpha
        m.smoothed = gamma

    m.mu, m.sigma, m.P, m.loglik = mu, sig, P, prev_ll
    if not m.converged:
        m.warnings.append("EM در %d تکرار همگرا نشد؛ برآورد را با احتیاط بخوانید."
                          % max_iter)
    if abs(mu[0] - mu[1]) < 0.1 * sd:
        m.warnings.append("میانگین دو رژیم بسیار نزدیک است — تفکیک رژیم ضعیف "
                          "و تفسیر «رکود» کم‌اعتبار است.")
    d0, d1 = m.expected_duration(0), m.expected_duration(1)
    if min(d0, d1) < 3:
        m.warnings.append("یکی از رژیم‌ها ماندگاری بسیار کوتاه دارد؛ مدل احتمالاً "
                          "به‌جای رژیم، نویز را تفکیک کرده است.")
    return m
