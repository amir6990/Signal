# -*- coding: utf-8 -*-
"""
قرارداد منابع داده و ثبت منشأ.

اصل حاکم: هیچ عددی بدون منشأ وارد فایل نمی‌شود. هر مقدار می‌داند از کدام
منبع، در چه ساعتی و با چه سطح اطمینانی آمده است. اگر منبعی کار نکند، مقدار
خالی می‌ماند — جای آن عدد ساختگی گذاشته نمی‌شود.
"""
import datetime
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

# کمیت‌های استاندارد؛ کلیدها بین منابع و فایل‌های اکسل مشترک‌اند
QUANTITIES = {
    "gold_oz_usd":     ("اونس طلا (دلار)", "USD/oz"),
    "silver_oz_usd":   ("اونس نقره (دلار)", "USD/oz"),
    "usd_irr_free":    ("دلار آزاد (ریال)", "IRR"),
    "usd_irr_nima":    ("دلار نیمایی (ریال)", "IRR"),
    "usdt_irr":        ("تتر (ریال)", "IRR"),
    "eur_irr":         ("یورو (ریال)", "IRR"),
    "aed_irr":         ("درهم (ریال)", "IRR"),
    "usdt_usd_global": ("USDT/USD جهانی", "ratio"),
    "dxy":             ("شاخص دلار", "index"),
    "coin_full_irr":   ("سکه تمام (ریال)", "IRR"),
    "coin_half_irr":   ("نیم سکه (ریال)", "IRR"),
    "coin_quarter_irr": ("ربع سکه (ریال)", "IRR"),
    "gram18k_irr":     ("گرم طلای ۱۸ عیار (ریال)", "IRR"),
}

# بازه‌های سلامت — عدد خارج از این بازه مشکوک است و علامت می‌خورد.
# هدف گرفتن خطای فاحش است (ریال/تومان، اسکیل غلط، مقدار کهنه)، نه قضاوت بازار.
SANITY = {
    "gold_oz_usd":     (500.0, 20_000.0),
    "silver_oz_usd":   (5.0, 500.0),
    "usd_irr_free":    (100_000.0, 100_000_000.0),
    "usd_irr_nima":    (50_000.0, 100_000_000.0),
    "usdt_irr":        (100_000.0, 100_000_000.0),
    "eur_irr":         (100_000.0, 150_000_000.0),
    "aed_irr":         (20_000.0, 30_000_000.0),
    "usdt_usd_global": (0.90, 1.10),
    "dxy":             (50.0, 200.0),
    "coin_full_irr":   (10_000_000.0, 100_000_000_000.0),
    "coin_half_irr":   (5_000_000.0, 60_000_000_000.0),
    "coin_quarter_irr": (2_000_000.0, 40_000_000_000.0),
    "gram18k_irr":     (1_000_000.0, 10_000_000_000.0),
}


@dataclass
class Quote:
    quantity: str
    value: Optional[float]
    source: str
    fetched_at: str = ""
    note: str = ""
    ok: bool = True

    def __post_init__(self):
        if not self.fetched_at:
            self.fetched_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        lo, hi = SANITY.get(self.quantity, (None, None))
        if self.value is None:
            self.ok = False
            self.note = self.note or "مقدار دریافت نشد"
        elif lo is not None and not (lo <= self.value <= hi):
            self.ok = False
            self.note = ("خارج از بازه سلامت (%s تا %s) — احتمال خطای واحد "
                         "(ریال/تومان) یا تغییر ساختار پاسخ منبع"
                         % (format(lo, ",.0f"), format(hi, ",.0f")))

    @property
    def label(self):
        return QUANTITIES.get(self.quantity, (self.quantity, ""))[0]


@dataclass
class Provider:
    key: str
    title: str
    url_hint: str
    supplies: List[str]
    fn: Callable[[dict], Dict[str, Optional[float]]]
    needs_key: bool = False
    verified: bool = False          # آیا ساختار پاسخ تأیید شده است؟
    note: str = ""


class Registry:
    def __init__(self):
        self.providers: List[Provider] = []

    def add(self, p: Provider):
        self.providers.append(p)

    def for_quantity(self, q: str) -> List[Provider]:
        return [p for p in self.providers if q in p.supplies]

    def probe(self, config: dict, only=None):
        """هر منبع را واقعاً صدا می‌زند و نتیجه را گزارش می‌دهد."""
        out = []
        for p in self.providers:
            if only and p.key not in only:
                continue
            if p.needs_key and not config.get(p.key + "_key"):
                out.append((p, None, "کلید API تنظیم نشده"))
                continue
            try:
                got = p.fn(config) or {}
                vals = {k: v for k, v in got.items() if v is not None}
                out.append((p, vals, "" if vals else "پاسخ گرفت ولی مقداری استخراج نشد"))
            except Exception as exc:                   # noqa: BLE001
                out.append((p, None, str(exc)[:160]))
        return out

    def resolve(self, config: dict, order=None) -> Dict[str, Quote]:
        """هر کمیت را از اولین منبعی که جواب سالم بدهد می‌گیرد."""
        cache: Dict[str, dict] = {}
        result: Dict[str, Quote] = {}
        providers = self.providers
        if order:
            rank = {k: i for i, k in enumerate(order)}
            providers = sorted(providers, key=lambda p: rank.get(p.key, 999))
        for p in providers:
            if p.needs_key and not config.get(p.key + "_key"):
                continue
            if p.key not in cache:
                try:
                    cache[p.key] = p.fn(config) or {}
                except Exception as exc:               # noqa: BLE001
                    cache[p.key] = {"__error__": str(exc)[:160]}
            got = cache[p.key]
            if "__error__" in got:
                continue
            for q in p.supplies:
                if q in result and result[q].ok:
                    continue
                v = got.get(q)
                if v is None:
                    continue
                quote = Quote(q, float(v), p.title)
                if quote.ok or q not in result:
                    result[q] = quote
        return result


# ------------------------------------------------------------------
# آزمون سازگاری متقابل
# ------------------------------------------------------------------
OUNCE_GRAMS = 31.1034768
COIN_PURE_GRAMS = 8.133 * 0.900          # سکه تمام بهار آزادی


def cross_check(quotes: Dict[str, Quote]) -> List[str]:
    """ناسازگاری بین کمیت‌ها را پیدا می‌کند.

    چرا لازم است: بازه مطلق سلامت در اقتصاد تورمی کهنه می‌شود و خطای ۱۰ برابری
    را نمی‌گیرد. اما نسبت‌ها پایدارند — ارزش ذاتی سکه از اونس و نرخ ارز
    محاسبه‌شدنی است و قیمت بازار باید در فاصله معقولی از آن باشد، هر قدر هم
    که سطح قیمت‌ها بالا رفته باشد.
    """
    def v(k):
        q = quotes.get(k)
        return q.value if (q and q.value) else None

    warn = []
    gold, usd = v("gold_oz_usd"), v("usd_irr_free")
    coin, usdt = v("coin_full_irr"), v("usdt_irr")

    if gold and usd and coin:
        intrinsic = COIN_PURE_GRAMS * (gold / OUNCE_GRAMS) * usd
        ratio = coin / intrinsic
        if not (0.80 <= ratio <= 2.50):
            warn.append(
                "قیمت سکه (%s) نسبت به ارزش ذاتی (%s) ضریب %.2f دارد — خارج از "
                "بازه معقول ۰٫۸ تا ۲٫۵. احتمال خطای واحد (تومان به‌جای ریال) در "
                "سکه یا دلار." % (format(coin, ",.0f"), format(intrinsic, ",.0f"), ratio))

    if gold and usd and v("gram18k_irr"):
        intr_g = 0.750 * (gold / OUNCE_GRAMS) * usd
        r = v("gram18k_irr") / intr_g
        if not (0.85 <= r <= 1.60):
            warn.append("گرم ۱۸ عیار نسبت به ارزش خام فلز ضریب %.2f دارد — "
                        "خارج از بازه ۰٫۸۵ تا ۱٫۶۰." % r)

    if usd and usdt:
        prem = usdt / usd - 1.0
        if not (-0.05 <= prem <= 0.25):
            warn.append("پریمیوم تتر %.1f%% است — خارج از بازه ‎−۵٪ تا ‎+۲۵٪. "
                        "تتر و دلار آزاد هر دو دلارند و نباید این‌قدر فاصله بگیرند."
                        % (prem * 100))

    # مسکوکات کوچک‌تر در بازار ایران ساختاراً حباب بیشتری دارند: نیم سکه معمولاً
    # بیش از نصف سکه تمام و ربع سکه بیش از یک‌چهارم آن معامله می‌شود. باند باید
    # این را بپذیرد وگرنه روی داده سالم هم هشدار کاذب می‌دهد.
    for k, div, lo, hi, lbl in (("coin_half_irr", 2.0, 0.90, 1.30, "نیم سکه"),
                                ("coin_quarter_irr", 4.0, 0.90, 1.70, "ربع سکه")):
        if coin and v(k):
            r = v(k) / (coin / div)
            if not (lo <= r <= hi):
                warn.append("%s نسبت به یک %s سکه تمام ضریب %.2f دارد — خارج از "
                            "بازه %.2f تا %.2f. (حباب بیشتر مسکوک کوچک طبیعی است، "
                            "ولی این مقدار از آن هم فراتر است.)"
                            % (lbl, "دوم" if div == 2 else "چهارم", r, lo, hi))

    if usd and v("eur_irr"):
        r = v("eur_irr") / usd
        if not (0.90 <= r <= 1.40):
            warn.append("نسبت یورو به دلار %.3f است — خارج از بازه ۰٫۹۰ تا ۱٫۴۰." % r)
    if usd and v("aed_irr"):
        r = v("aed_irr") / usd
        if not (0.22 <= r <= 0.33):
            warn.append("نسبت درهم به دلار %.4f است — نرخ ثابت رسمی حدود ۰٫۲۷۲۳ است." % r)
    if usd and v("usd_irr_nima"):
        r = usd / v("usd_irr_nima")
        if r < 0.95:
            warn.append("دلار آزاد از نیمایی کمتر است (نسبت %.2f) — معمولاً برعکس است. "
                        "احتمال جابه‌جایی دو مقدار." % r)
    return warn
