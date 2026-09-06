# -*- coding: utf-8 -*-
"""
تحلیل زمانی متغیرهای کلان — نه چرخه یک سهم.

موضوع این ماژول شاخص کل، دلار، طلا و تتر است؛ و رابطه‌شان با هم و با
رویدادهای ژئوپلیتیک. چهار ابزار، هرکدام برای یک پرسش مشخص:

    real_series()     شاخص بورس به دلار — آیا رشد ریالی، رشد واقعی بود؟
    prewhitened_ccf() آیا دلار جلوتر از بورس حرکت می‌کند؟ با چند روز تأخیر؟
    engle_granger()   آیا بورس چیزی جز نماینده دلار است؟
    event_study()     بازار حول یک رویداد ژئوپلیتیک چه کرد؟

⚠️ **چرا «پیش‌سفیدسازی» در همبستگی متقاطع اجباری است.** سری‌های مالی
خودهمبسته‌اند. همبستگی متقاطع خام روی دو سری خودهمبسته، حتی وقتی هیچ
رابطه‌ای نیست، قله‌های بزرگ و «معنادار» تولید می‌کند و باند ۱٫۹۶/√n به‌شدت
تنگ است. روش استاندارد باکس-جنکینز این است که اول یک مدل AR به سری پیشرو
برازش شود، همان فیلتر روی هر دو سری اعمال شود، و همبستگی روی باقی‌مانده‌ها
حساب شود. آن‌وقت باند ساده معتبر است. بدون این گام، «دلار ۱۲ روز جلوتر از
بورس است» یک عدد بی‌معناست.
"""
import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple


# ------------------------------------------------------------ کمکی‌ها
def _norm_ppf(q: float) -> float:
    """چندک نرمال استاندارد — تقریب Acklam. برای آستانه تصحیح‌شده لازم است."""
    if q <= 0.0 or q >= 1.0:
        return 0.0
    a = (-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00)
    b = (-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01)
    c = (-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00)
    d = (7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00)
    pl, ph = 0.02425, 1 - 0.02425
    if q < pl:
        t = math.sqrt(-2 * math.log(q))
        return (((((c[0]*t+c[1])*t+c[2])*t+c[3])*t+c[4])*t+c[5]) / \
               ((((d[0]*t+d[1])*t+d[2])*t+d[3])*t+1)
    if q > ph:
        t = math.sqrt(-2 * math.log(1 - q))
        return -(((((c[0]*t+c[1])*t+c[2])*t+c[3])*t+c[4])*t+c[5]) / \
                ((((d[0]*t+d[1])*t+d[2])*t+d[3])*t+1)
    t = q - 0.5
    r = t * t
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*t / \
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)


def _mean(x):
    return sum(x) / len(x) if x else 0.0


def _std(x, ddof=1):
    n = len(x)
    if n <= ddof:
        return 0.0
    m = _mean(x)
    return math.sqrt(sum((v - m) ** 2 for v in x) / (n - ddof))


def log_returns(y: Sequence[float]) -> List[float]:
    out = []
    for i in range(1, len(y)):
        if y[i - 1] > 0 and y[i] > 0:
            out.append(math.log(y[i] / y[i - 1]))
        else:
            out.append(0.0)
    return out


def align(a_dates, a_vals, b_dates, b_vals):
    """دو سری را روی تاریخ‌های مشترک هم‌تراز می‌کند.

    بازار داخلی و جهانی در روزهای یکسانی تعطیل نیستند؛ بدون این گام،
    «تأخیر ۳ روزه» می‌تواند فقط اثر تعطیلی باشد نه رابطه اقتصادی.
    """
    mb = dict(zip(b_dates, b_vals))
    d, x, y = [], [], []
    for dt, v in zip(a_dates, a_vals):
        w = mb.get(dt)
        if w is not None and v is not None:
            d.append(dt)
            x.append(float(v))
            y.append(float(w))
    return d, x, y


def real_series(nominal: Sequence[float], fx: Sequence[float]) -> List[float]:
    """سری اسمی تقسیم بر نرخ ارز — «شاخص به دلار».

    مهم‌ترین تعدیل در بازار ایران و پرنادیده‌ترین. شاخصی که ۴۰٪ رشد کند در
    حالی که دلار ۵۰٪ رفته، به قدرت خرید **زیان** داده است.
    """
    out = []
    for a, b in zip(nominal, fx):
        out.append(a / b if (b and b > 0) else None)
    return out


# ---------------------------------------------------- برازش AR و فیلتر
def fit_ar(x: Sequence[float], p: int) -> List[float]:
    """ضرایب AR(p) با حداقل مربعات (معادلات یول-واکر از طریق نرمال)."""
    n = len(x)
    if n <= p + 1 or p < 1:
        return []
    # ماتریس نرمال p×p با حل گاوسی — p کوچک است، نیازی به کتابخانه نیست
    A = [[0.0] * p for _ in range(p)]
    b = [0.0] * p
    for t in range(p, n):
        row = [x[t - 1 - j] for j in range(p)]
        for i in range(p):
            b[i] += row[i] * x[t]
            for j in range(p):
                A[i][j] += row[i] * row[j]
    return _solve(A, b)


def _solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c]))
        if abs(M[piv][c]) < 1e-14:
            return []
        M[c], M[piv] = M[piv], M[c]
        pv = M[c][c]
        for j in range(c, n + 1):
            M[c][j] /= pv
        for r in range(n):
            if r != c and M[r][c] != 0:
                f = M[r][c]
                for j in range(c, n + 1):
                    M[r][j] -= f * M[c][j]
    return [M[i][n] for i in range(n)]


def ar_filter(y: Sequence[float], coef: Sequence[float]) -> List[float]:
    """اعمال فیلتر AR برآوردشده: باقی‌مانده = y[t] − Σ φ_j y[t−1−j]."""
    p = len(coef)
    out = []
    for t in range(p, len(y)):
        pred = sum(coef[j] * y[t - 1 - j] for j in range(p))
        out.append(y[t] - pred)
    return out


def select_ar_order(x: Sequence[float], max_p: int = 10) -> int:
    """انتخاب مرتبه با معیار AIC — نه یک عدد ثابت دلبخواهی."""
    n = len(x)
    best_p, best_aic = 1, float("inf")
    for p in range(1, min(max_p, max(1, n // 20)) + 1):
        coef = fit_ar(x, p)
        if not coef:
            continue
        res = ar_filter(x, coef)
        if len(res) < 5:
            continue
        s2 = sum(r * r for r in res) / len(res)
        if s2 <= 0:
            continue
        aic = len(res) * math.log(s2) + 2 * p
        if aic < best_aic:
            best_aic, best_p = aic, p
    return best_p


# ------------------------------------------- همبستگی متقاطع پیش‌سفیدشده
@dataclass
class LeadLag:
    lag: int                  # مثبت یعنی x جلوتر از y است
    corr: float
    n: int
    band: float               # باند تصحیح‌شده بابت تعداد وقفه‌های آزموده‌شده
    band_naive: float         # باند تک‌آزمونی ۱٫۹۶/√n — فقط برای مقایسه
    significant: bool
    ar_order: int = 0
    n_lags_tested: int = 0
    all_lags: List[Tuple[int, float]] = field(default_factory=list)
    note: str = ""


def prewhitened_ccf(x: Sequence[float], y: Sequence[float],
                    max_lag: int = 30) -> Optional[LeadLag]:
    """آیا x جلوتر از y حرکت می‌کند؟ روش باکس-جنکینز.

    lag مثبت یعنی x[t] با y[t+lag] همبسته است — یعنی **x پیشرو است**.
    """
    n0 = min(len(x), len(y))
    if n0 < 60:
        return None
    x = list(x[:n0])
    y = list(y[:n0])
    p = select_ar_order(x)
    coef = fit_ar(x, p)
    if not coef:
        return None
    ax = ar_filter(x, coef)
    ay = ar_filter(y, coef)          # همان فیلتر روی هر دو — الزام روش
    n = min(len(ax), len(ay))
    ax, ay = ax[:n], ay[:n]
    mx, my = _mean(ax), _mean(ay)
    sx, sy = _std(ax, 0), _std(ay, 0)
    if sx <= 0 or sy <= 0:
        return None

    lags = []
    for k in range(-max_lag, max_lag + 1):
        s, cnt = 0.0, 0
        for t in range(n):
            u = t + k
            if 0 <= u < n:
                s += (ax[t] - mx) * (ay[u] - my)
                cnt += 1
        if cnt > 0:
            lags.append((k, s / (cnt * sx * sy)))
    if not lags:
        return None

    # ⚠️ **تصحیح چندگانگی — بدون این، ابزار بی‌فایده است.**
    # بیشینه‌ی ۵۱ همبستگی را با آستانه‌ی تک‌آزمون سنجیدن یعنی تضمین مثبت
    # کاذب: در آزمون، روی ۳۰ جفت سریِ کاملاً مستقل، ۳۰ بار «تأخیر
    # معنادار» دیده شد. پس از پیش‌سفیدسازی، مقادیر وقفه‌های مختلف تقریباً
    # مستقل‌اند و تصحیح Šidák روی تعدادشان درست است — همان اصلی که در
    # آشکارساز چرخه هم به کار رفته.
    m = len(lags)
    alpha_adj = 1.0 - (1.0 - 0.05) ** (1.0 / m)
    band = _norm_ppf(1.0 - alpha_adj / 2.0) / math.sqrt(n)
    band_naive = 1.96 / math.sqrt(n)
    k, c = max(lags, key=lambda t: abs(t[1]))
    return LeadLag(lag=k, corr=c, n=n, band=band, band_naive=band_naive,
                   significant=abs(c) > band, ar_order=p,
                   n_lags_tested=m, all_lags=lags)


# ------------------------------------------------------------- ADF
# مقادیر بحرانی مک‌کینون. c = فقط عرض از مبدأ، eg = آزمون باقی‌مانده
# هم‌انباشتگی با یک متغیر توضیحی (مقادیر بحرانی‌اش متفاوت است و
# استفاده از جدول ADF معمولی برای آن، خطای رایج و جدی است).
_MK = {
    "c":  {0.01: (-3.43035, -6.5393, -16.786),
           0.05: (-2.86154, -2.8903, -4.234),
           0.10: (-2.56677, -1.5384, -2.809)},
    "eg": {0.01: (-3.89644, -10.9519, -22.527),
           0.05: (-3.33613, -6.1101, -6.823),
           0.10: (-3.04445, -4.2412, -2.720)},
}


def mackinnon_crit(n: int, level: float = 0.05, kind: str = "c") -> float:
    a, b, c = _MK[kind][level]
    return a + b / n + c / (n * n)


@dataclass
class ADFResult:
    stat: float
    lags: int
    n: int
    crit_5: float
    stationary: bool
    kind: str = "c"


def adf(y: Sequence[float], max_lag: Optional[int] = None,
        kind: str = "c") -> Optional[ADFResult]:
    """آزمون دیکی-فولر تعمیم‌یافته. فرض صفر: ریشه واحد (ناایستا).

    kind="c" برای سری معمولی، kind="eg" برای باقی‌مانده رگرسیون هم‌انباشتگی.
    """
    y = [float(v) for v in y]
    n0 = len(y)
    if n0 < 25:
        return None
    if max_lag is None:
        max_lag = int(12 * (n0 / 100.0) ** 0.25)
        max_lag = max(1, min(max_lag, n0 // 5))

    dy = [y[i] - y[i - 1] for i in range(1, n0)]
    best = None
    for L in range(max_lag, -1, -1):
        rows, target = [], []
        for t in range(L + 1, len(dy)):
            r = [1.0, y[t]]                      # عرض از مبدأ + سطح با وقفه
            for j in range(1, L + 1):
                r.append(dy[t - j])
            rows.append(r)
            target.append(dy[t])
        k = 2 + L
        if len(rows) < k + 10:
            continue
        beta, se = _ols(rows, target)
        if beta is None or se is None or se[1] <= 0:
            continue
        best = (beta[1] / se[1], L, len(rows))
        break
    if best is None:
        return None
    stat, L, n = best
    crit = mackinnon_crit(n, 0.05, kind)
    return ADFResult(stat=stat, lags=L, n=n, crit_5=crit,
                     stationary=stat < crit, kind=kind)


def _ols(rows, target):
    """حداقل مربعات با خطای استاندارد ضرایب."""
    k = len(rows[0])
    n = len(rows)
    A = [[0.0] * k for _ in range(k)]
    b = [0.0] * k
    for r, t in zip(rows, target):
        for i in range(k):
            b[i] += r[i] * t
            for j in range(k):
                A[i][j] += r[i] * r[j]
    beta = _solve([row[:] for row in A], b[:])
    if not beta:
        return None, None
    resid = [t - sum(beta[i] * r[i] for i in range(k)) for r, t in zip(rows, target)]
    if n - k <= 0:
        return beta, None
    s2 = sum(e * e for e in resid) / (n - k)
    inv = _inverse(A)
    if inv is None:
        return beta, None
    se = [math.sqrt(max(0.0, s2 * inv[i][i])) for i in range(k)]
    return beta, se


def _inverse(A):
    n = len(A)
    M = [A[i][:] + [1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c]))
        if abs(M[piv][c]) < 1e-14:
            return None
        M[c], M[piv] = M[piv], M[c]
        pv = M[c][c]
        for j in range(2 * n):
            M[c][j] /= pv
        for r in range(n):
            if r != c and M[r][c] != 0:
                f = M[r][c]
                for j in range(2 * n):
                    M[r][j] -= f * M[c][j]
    return [row[n:] for row in M]


# --------------------------------------------------- هم‌انباشتگی
@dataclass
class Cointegration:
    beta: float               # شیب رابطه بلندمدت
    alpha: float
    adf_stat: float
    crit_5: float
    cointegrated: bool
    n: int
    half_life: Optional[float] = None
    note: str = ""


def engle_granger(y: Sequence[float], x: Sequence[float]) -> Optional[Cointegration]:
    """آیا y و x یک رابطه تعادلی بلندمدت دارند؟

    برای بازار ایران این پرسش مرکزی است: اگر شاخص کل و دلار هم‌انباشته
    باشند، «رشد بورس» عمدتاً بازتاب نرخ ارز است، نه خبر مستقلی درباره
    شرکت‌ها. آن‌وقت سیگنال گرفتن از سطح شاخص، دوباره‌شماری است.

    ⚠️ **شکست ساختاری، β را به‌شدت اریب می‌کند.** در آزمون، همان جفتِ
    واقعاً هم‌انباشته با β حقیقی ۰٫۹۵، بدون شکست β=۱٫۰۲ برآورد شد و پس از
    نُه جهش سطحی دائمی، β=۰٫۴۳. آزمون همچنان «هم‌انباشته» می‌گفت ولی ضریبش
    بی‌معنا بود. اگر در دوره تحلیل جهش سیاستی بزرگ بوده (تغییر رژیم ارزی،
    تحریم)، دوره را بشکنید و جداگانه برآورد کنید.

    روی **لگاریتم** سری‌ها کار می‌کند: رابطه در اقتصاد تورمی ضربی است نه جمعی.
    """
    pairs = [(a, b) for a, b in zip(y, x) if a and b and a > 0 and b > 0]
    if len(pairs) < 60:
        return None
    ly = [math.log(a) for a, _ in pairs]
    lx = [math.log(b) for _, b in pairs]
    rows = [[1.0, v] for v in lx]
    beta, _se = _ols(rows, ly)
    if not beta:
        return None
    resid = [ly[i] - (beta[0] + beta[1] * lx[i]) for i in range(len(ly))]
    r = adf(resid, kind="eg")
    if r is None:
        return None

    # نیمه‌عمر بازگشت به تعادل از رگرسیون Δresid بر resid
    hl = None
    d = [resid[i] - resid[i - 1] for i in range(1, len(resid))]
    rr = [[1.0, resid[i - 1]] for i in range(1, len(resid))]
    bb, _ = _ols(rr, d)
    if bb and bb[1] < 0:
        lam = 1.0 + bb[1]
        if 0 < lam < 1:
            hl = -math.log(2) / math.log(lam)

    return Cointegration(beta=beta[1], alpha=beta[0], adf_stat=r.stat,
                         crit_5=r.crit_5, cointegrated=r.stationary,
                         n=r.n, half_life=hl)


# ------------------------------------------------------ مطالعه رویداد
@dataclass
class EventResult:
    label: str
    date: object
    car: float                # بازده تجمعی غیرعادی
    pre: float
    post: float
    ok: bool = True


@dataclass
class EventStudy:
    events: List[EventResult] = field(default_factory=list)
    mean_car: float = 0.0
    p_value: float = 1.0
    n_used: int = 0
    window: Tuple[int, int] = (-1, 3)
    note: str = ""


def event_study(dates: Sequence, closes: Sequence[float], events: Sequence,
                pre: int = 1, post: int = 3, n_perm: int = 2000,
                seed: int = 17) -> EventStudy:
    """بازده تجمعی حول تاریخ رویدادها، با آزمون جایگشت.

    ⚠️ **پنجره پیش‌فرض [−۱، +۳] است، نه [−۵، +۱۰].** این را با اندازه‌گیری
    انتخاب کردم نه با عرف: روی سری‌ای با شوک واقعی ۳٫۵٪− و ۹ رویداد،

        [−۵، +۱۰] → CAR ‎−۱٫۱٪  p=۰٫۴۹   (شوک واقعی را **گم می‌کند**)
        [−۳، +۵]  → CAR ‎−۳٫۱٪  p=۰٫۰۰۹
        [−۱، +۳]  → CAR ‎−۲٫۵٪  p=۰٫۰۰۴
        [ ۰، +۱]  → CAR ‎−۳٫۵٪  p=۰٫۰۰۰   (دقیقاً اندازه شوک)

    دلیلش ساده است: یک حرکت یک‌روزه ۳٫۵٪ در پنجره ۱۶ روزه‌ای که نوسان
    روزانه‌اش ۱٫۲٪ است، زیر نویز دفن می‌شود. پنجره پهن، «محتاطانه» نیست —
    فقط کور است.

    آزمون تهی: همان تعداد تاریخ، ولی تصادفی انتخاب‌شده. اگر CAR واقعی از
    توزیع تاریخ‌های تصادفی جدا نباشد، رویدادها اطلاعاتی نداشته‌اند.
    آزمون پارامتری اینجا نامناسب است: بازده‌ها دم‌سنگین‌اند و رویدادها کم.
    """
    out = EventStudy(window=(-pre, post))
    idx = {d: i for i, d in enumerate(dates)}
    rets = [0.0] + log_returns(closes)
    mu = _mean([r for r in rets if r])

    def car_at(i):
        lo, hi = i - pre, i + post
        if lo < 0 or hi >= len(rets):
            return None
        return sum(rets[t] - mu for t in range(lo, hi + 1))

    used = []
    for ev in events:
        label = ev[0] if isinstance(ev, (list, tuple)) else str(ev)
        edate = ev[1] if isinstance(ev, (list, tuple)) and len(ev) > 1 else ev
        i = idx.get(edate)
        if i is None:                       # نزدیک‌ترین روز معاملاتی بعد
            cand = [j for j, d in enumerate(dates) if d >= edate]
            i = cand[0] if cand else None
        c = car_at(i) if i is not None else None
        if c is None:
            out.events.append(EventResult(label, edate, 0.0, 0.0, 0.0, ok=False))
            continue
        pre_c = sum(rets[t] - mu for t in range(i - pre, i))
        post_c = sum(rets[t] - mu for t in range(i, i + post + 1))
        out.events.append(EventResult(label, edate, c, pre_c, post_c))
        used.append(c)

    out.n_used = len(used)
    if not used:
        out.note = "هیچ رویدادی در بازه داده نبود."
        return out
    out.mean_car = _mean(used)

    rng = random.Random(seed)
    lo_i, hi_i = pre, len(rets) - post - 1
    if hi_i <= lo_i:
        out.note = "داده برای آزمون جایگشت کافی نیست."
        return out
    hits = 0
    for _ in range(n_perm):
        vals = [car_at(rng.randint(lo_i, hi_i)) for _ in used]
        vals = [v for v in vals if v is not None]
        if not vals:
            continue
        if abs(_mean(vals)) >= abs(out.mean_car):
            hits += 1
    out.p_value = (hits + 1) / (n_perm + 1)
    return out
