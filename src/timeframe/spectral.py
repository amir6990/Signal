# -*- coding: utf-8 -*-
"""
تحلیل طیفی برای کشف چرخه غالب — روش von Thienen (Decoding the Hidden Market
Rhythm) با الگوریتم Goertzel و آزمون معناداری فاز.

چرا Goertzel و نه FFT؟ چون FFT فقط فرکانس‌های شبکه‌ای N/k را می‌دهد و دوره‌های
میانی (مثلاً ۳۷ روز در سری ۱۰۰۰ تایی) بین دو بین گم می‌شوند. Goertzel هر دوره
دلخواه را مستقیم محاسبه می‌کند و برای همین در تحلیل چرخه بازار مناسب‌تر است.

هشدار روش‌شناختی: هر سری زمانی — حتی نویز خالص — یک «چرخه غالب» تولید می‌کند.
تفاوت چرخه واقعی با آرتیفکت در پایداری فاز بین تکرارهاست، نه در بلندی قله طیف.
به همین دلیل هیچ چرخه‌ای بدون آزمون معناداری فاز گزارش نمی‌شود.
"""
import math
from dataclasses import dataclass
from typing import List, Optional, Sequence

from .config import SpectralConfig
from .filters import linear_detrend


@dataclass
class CycleFinding:
    period: float            # دوره بر حسب کندل
    amplitude: float         # دامنه در واحد سری
    phase: float             # فاز (رادیان) در انتهای سری
    power_share: float       # سهم از توان کل طیف
    p_value: float           # معناداری خام پایداری فاز
    p_adjusted: float        # همان p پس از تصحیح چندگانگی آزمون (Šidák)
    amp_ratio: float         # دامنه ÷ دامنه میانه طیف (نسبت سیگنال به زمینه)
    segments: int            # تعداد تکرار کامل چرخه در سری
    n_tests: int             # تعداد فرکانس مستقل آزمون‌شده
    significant: bool
    surrogate_p: Optional[float] = None   # فقط در حالت strict پر می‌شود

    @property
    def label(self) -> str:
        return "%.1f کندل" % self.period


def goertzel(y: Sequence[float], period: float):
    """دامنه و فاز مؤلفه با دوره داده‌شده. خروجی: (amp, phase, real, imag)."""
    n = len(y)
    if n < 2 or period < 2:
        return 0.0, 0.0, 0.0, 0.0
    w = 2.0 * math.pi / period
    cw, sw = math.cos(w), math.sin(w)
    coeff = 2.0 * cw
    s1 = s2 = 0.0
    for v in y:
        s0 = v + coeff * s1 - s2
        s2, s1 = s1, s0
    real = s1 - s2 * cw
    imag = s2 * sw
    amp = 2.0 * math.sqrt(real * real + imag * imag) / n
    return amp, math.atan2(imag, real), real, imag


def _rayleigh_p(vectors) -> float:
    """آزمون رایلی روی فاز قطعات متوالی — تقریبی عملی از آزمون بارتلز.

    اگر یک چرخه واقعی باشد، فاز آن در تکرارهای متوالی تقریباً ثابت می‌ماند و
    بردارهای واحد هم‌جهت جمع می‌شوند. اگر آرتیفکت نویز باشد، فازها تصادفی‌اند و
    برآیند کوچک می‌شود.
    """
    units = []
    for re, im in vectors:
        m = math.hypot(re, im)
        if m > 0:
            units.append((re / m, im / m))
    k = len(units)
    if k < 2:
        return 1.0
    rx = sum(u[0] for u in units)
    ry = sum(u[1] for u in units)
    rbar = math.hypot(rx, ry) / k
    z = k * rbar * rbar
    # تقریب مرتبه‌بالای رایلی (Zar, Biostatistical Analysis)
    p = math.exp(-z) * (1 + (2 * z - z * z) / (4 * k)
                        - (24 * z - 132 * z ** 2 + 76 * z ** 3 - 9 * z ** 4) / (288 * k * k))
    return min(1.0, max(0.0, p))


def phase_stability(y: Sequence[float], period: float, min_segments: int = 3) -> tuple:
    """p-value پایداری فاز و تعداد قطعات کامل."""
    n = len(y)
    seg_len = int(round(period))
    k = n // seg_len if seg_len >= 2 else 0
    if k < min_segments:
        return 1.0, k
    vectors = []
    for j in range(k):
        seg = y[n - (j + 1) * seg_len: n - j * seg_len]
        _a, _p, re, im = goertzel(seg, period)
        vectors.append((re, im))
    return _rayleigh_p(vectors), k


def independent_frequencies(n: int, p_min: float, p_max: float) -> int:
    """تعداد فرکانس‌های مستقل (بین‌های فوریه) در بازه دوره مورد بررسی.

    شبکه جست‌وجوی ما بسیار ریزتر از بین‌های فوریه است، ولی آزمون‌های مجاور
    همبسته‌اند؛ تعداد آزمون‌های واقعاً مستقل همان تعداد بین فوریه است. مبنای
    تصحیح چندگانگی همین عدد است، نه تعداد نقاط شبکه.
    """
    if p_min <= 0 or p_max <= p_min:
        return 1
    return max(1, int(round(n / (2.0 * p_min) - n / (2.0 * p_max))))


def ar1_surrogate_p(y: Sequence[float], observed_amp: float, cfg: "SpectralConfig",
                    n_surrogates: int = 100, seed: int = 11) -> float:
    """آزمون سختگیرانه با داده جانشین AR(1).

    فرض صفر: سری فقط یک فرایند خودهمبسته مرتبه یک است (نه چرخه‌ای). برای هر
    جانشین، بیشینه دامنه روی همان شبکه دوره محاسبه می‌شود؛ مقایسه با بیشینه
    مشاهده‌شده، چندگانگی آزمون را به‌طور خودکار لحاظ می‌کند.
    """
    import random
    n = len(y)
    if n < 20:
        return 1.0
    d = linear_detrend(y)
    m = sum(d) / n
    d = [v - m for v in d]
    num = sum(d[i] * d[i - 1] for i in range(1, n))
    den = sum(v * v for v in d) or 1.0
    phi = max(-0.99, min(0.99, num / den))
    resid = [d[i] - phi * d[i - 1] for i in range(1, n)]
    rm = sum(resid) / len(resid)
    sigma = math.sqrt(sum((r - rm) ** 2 for r in resid) / max(1, len(resid) - 1))

    max_p = min(cfg.max_period_cap, int(n * cfg.max_period_ratio))
    grid = []
    p = float(cfg.min_period)
    while p <= max_p:
        grid.append(p)
        p += max(1.0, p * 0.05)          # شبکه درشت‌تر: جانشین‌ها فقط برای مقیاس لازم‌اند
    rng = random.Random(seed)
    exceed = 0
    for _s in range(n_surrogates):
        x, prev = [], 0.0
        for _i in range(n):
            prev = phi * prev + rng.gauss(0, sigma)
            x.append(prev)
        best = 0.0
        for per in grid:
            a, _ph, _re, _im = goertzel(x, per)
            if a > best:
                best = a
        if best >= observed_amp:
            exceed += 1
    return (exceed + 1) / (n_surrogates + 1)


def spectrum(y: Sequence[float], cfg: Optional[SpectralConfig] = None):
    """طیف دامنه روی بازه دوره‌های مجاز. خروجی: list[(period, amplitude)]."""
    cfg = cfg or SpectralConfig()
    n = len(y)
    if cfg.detrend == "linear":
        y = linear_detrend(y)
    elif cfg.detrend == "diff":
        y = [y[i] - y[i - 1] for i in range(1, n)]
        n = len(y)
    max_p = min(cfg.max_period_cap, int(n * cfg.max_period_ratio))
    if max_p <= cfg.min_period:
        return []
    out = []
    p = float(cfg.min_period)
    while p <= max_p:
        amp, _ph, _re, _im = goertzel(y, p)
        out.append((p, amp))
        p += max(0.5, p * 0.01)      # شبکه لگاریتمی: دقت یکنواخت در همه مقیاس‌ها
    return out


def find_cycles(y: Sequence[float], cfg: Optional[SpectralConfig] = None,
                strict: bool = False, n_surrogates: int = 100
                ) -> List[CycleFinding]:
    """چرخه‌های غالب همراه با آزمون معناداری، مرتب بر اساس دامنه.

    دو گذرگاه معناداری:
      ۱. پایداری فاز (رایلی) با تصحیح Šidák بابت تعداد فرکانس مستقل.
      ۲. نسبت دامنه به زمینه طیف.
    با strict=True یک گذرگاه سوم اضافه می‌شود: آزمون جانشین AR(1) که پرهزینه‌تر
    ولی سختگیرانه‌تر است.

    بدون تصحیح چندگانگی، انتخابِ بلندترین قله از میان صدها کاندید و آزمون آن در
    سطح ۵٪، روی نویز خالص هم چرخه «معنادار» تولید می‌کند. این تصحیح اختیاری نیست.
    """
    cfg = cfg or SpectralConfig()
    raw = list(y)
    work = linear_detrend(raw) if cfg.detrend == "linear" else raw
    spec = spectrum(raw, cfg)
    if not spec:
        return []
    total_power = sum(a * a for _p, a in spec) or 1.0
    amps_sorted = sorted(a for _p, a in spec)
    median_amp = amps_sorted[len(amps_sorted) // 2] or 1e-12
    n_tests = independent_frequencies(len(work), cfg.min_period,
                                      min(cfg.max_period_cap, len(work) * cfg.max_period_ratio))
    alpha_adj = 1.0 - (1.0 - cfg.alpha) ** (1.0 / n_tests)

    # قله‌های محلی طیف
    peaks = []
    for i in range(1, len(spec) - 1):
        if spec[i][1] >= spec[i - 1][1] and spec[i][1] >= spec[i + 1][1]:
            peaks.append(spec[i])
    peaks.sort(key=lambda t: -t[1])

    chosen = []
    for period, amp in peaks:
        if any(abs(period - c[0]) / c[0] < cfg.peak_min_separation for c in chosen):
            continue
        chosen.append((period, amp))
        if len(chosen) >= cfg.top_n * 3:
            break

    findings = []
    for period, amp in chosen:
        pval, k = phase_stability(work, period, cfg.min_segments)
        _a, ph, _re, _im = goertzel(work, period)
        p_adj = 1.0 - (1.0 - pval) ** n_tests
        ratio = amp / median_amp
        ok = (pval <= alpha_adj and k >= cfg.min_segments
              and ratio >= cfg.min_amp_ratio)
        findings.append(CycleFinding(
            period=round(period, 2), amplitude=amp, phase=ph,
            power_share=amp * amp / total_power, p_value=pval,
            p_adjusted=min(1.0, p_adj), amp_ratio=ratio, segments=k,
            n_tests=n_tests, significant=ok))
    findings.sort(key=lambda f: (not f.significant, -f.amplitude))
    findings = findings[:cfg.top_n]

    if strict:
        for f in findings:
            if not f.significant:
                continue
            f.surrogate_p = ar1_surrogate_p(raw, f.amplitude, cfg, n_surrogates)
            if f.surrogate_p > cfg.alpha:
                f.significant = False
    return findings


def dominant_cycle(y: Sequence[float], cfg: Optional[SpectralConfig] = None,
                   strict: bool = False) -> Optional[CycleFinding]:
    """معنادارترین چرخه؛ اگر هیچ‌کدام معنادار نبود، None — نه «بهترینِ بد»."""
    for f in find_cycles(y, cfg, strict=strict):
        if f.significant:
            return f
    return None


def project(y: Sequence[float], cycles: List[CycleFinding], horizon: int) -> List[float]:
    """پروجکشن ترکیبی چرخه‌ها به آینده (فقط مؤلفه چرخه‌ای، بدون روند)."""
    n = len(y)
    out = []
    for h in range(1, horizon + 1):
        v = 0.0
        for c in cycles:
            # فاز در انتهای سری بازسازی و به جلو ادامه داده می‌شود
            v += c.amplitude * math.cos(2 * math.pi * (n - 1 + h) / c.period + c.phase)
        out.append(v)
    return out


def next_turn_indices(y: Sequence[float], cycle: CycleFinding, horizon: int):
    """اندیس‌های کف و سقف بعدیِ پروجکشن‌شده برای یک چرخه (نسبت به انتهای سری)."""
    n = len(y)
    troughs, peaks = [], []
    prev = None
    prev2 = None
    for h in range(0, horizon + 2):
        v = math.cos(2 * math.pi * (n - 1 + h) / cycle.period + cycle.phase)
        if prev is not None and prev2 is not None:
            if prev <= prev2 and prev <= v:
                troughs.append(h - 1)
            if prev >= prev2 and prev >= v:
                peaks.append(h - 1)
        prev2, prev = prev, v
    return [t for t in troughs if t > 0], [p for p in peaks if p > 0]
