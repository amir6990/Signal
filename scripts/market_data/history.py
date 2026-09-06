# -*- coding: utf-8 -*-
"""
پر کردن شیت‌های تاریخچه طلا و ارز از داده واقعی.

دو کار انجام می‌شود که هیچ‌کدام در اکسل شدنی نیست:

۱) **دریافت سری روزانه** از tgju (طلا، سکه، دلار، نیمایی) و Nobitex (تتر).
۲) **ساخت سنجه ارزش‌گذاری** — که نیازمند هم‌تراز کردن چند سری با تاریخ‌های
   ناهمسان است. حباب سکه بدون قیمت هم‌روزِ اونس و دلار معنا ندارد، و این
   سه سری در روزهای یکسانی داده ندارند (تعطیلی بازار داخلی با تعطیلی بازار
   جهانی یکی نیست). در پایتون این یک join ساده است؛ در اکسل شکننده می‌شود.

سنجه‌ها:
    حباب سکه      = قیمت سکه ÷ ارزش ذاتی طلای داخلش − ۱
    پریمیوم گرم   = طلای ۱۸ عیار ÷ برابری جهانی − ۱
    شکاف نیمایی   = دلار آزاد ÷ دلار نیمایی − ۱
    پریمیوم تتر   = تتر ÷ دلار آزاد − ۱

اصل حاکم همان اصل بقیه پکیج است: سنجه‌ای که نهاده‌هایش برای آن روز موجود
نیست، **نوشته نمی‌شود** — سلول خالی می‌ماند. صدک تاریخی در اکسل خودش آن روز
را نادیده می‌گیرد.
"""
import datetime

from .base import COIN_PURE_GRAMS, OUNCE_GRAMS
from .providers import nobitex, tgju

GOLD_18K_PURITY = 0.750

# کلید سری → (منبع، نماد، برچسب)
SERIES = {
    "coin_full": ("tgju", "sekee", "سکه تمام بهار آزادی"),
    "gram18":    ("tgju", "geram18", "طلای ۱۸ عیار"),
    "ons":       ("tgju", "ons", "اونس طلای جهانی"),
    "usd_free":  ("tgju", "price_dollar_rl", "دلار آزاد"),
    "usd_nima":  ("tgju", "nima_sell_usd", "دلار نیمایی"),
    "usdt":      ("nobitex", "USDTIRT", "تتر USDT"),
}

# (فایل، شیت) → (کلید سری، کلید سنجه ارزش‌گذاری یا None)
SHEETS = {
    ("gold", "Gold_History"): ("coin_full", "coin_bubble"),
    ("gold", "Hist_Gram18"):  ("gram18", "gram_premium"),
    ("gold", "Hist_Ons"):     ("ons", None),
    ("fx", "FX_History"):     ("usd_free", "nima_gap"),
    ("fx", "Hist_USDT"):      ("usdt", "usdt_premium"),
    ("fx", "Hist_Nima"):      ("usd_nima", None),
}

# کلید سنجه → (نهاده‌های لازم، تابع)
VALUATIONS = {
    "coin_bubble": (
        ("coin_full", "ons", "usd_free"),
        lambda s, d: s["coin_full"][d] /
        (COIN_PURE_GRAMS * (s["ons"][d] / OUNCE_GRAMS) * s["usd_free"][d]) - 1.0),
    "gram_premium": (
        ("gram18", "ons", "usd_free"),
        lambda s, d: s["gram18"][d] /
        (GOLD_18K_PURITY * (s["ons"][d] / OUNCE_GRAMS) * s["usd_free"][d]) - 1.0),
    "nima_gap": (
        ("usd_free", "usd_nima"),
        lambda s, d: s["usd_free"][d] / s["usd_nima"][d] - 1.0),
    "usdt_premium": (
        ("usdt", "usd_free"),
        lambda s, d: s["usdt"][d] / s["usd_free"][d] - 1.0),
}

# دامنه معقول هر سنجه. بیرون از این دامنه یعنی یکی از نهاده‌ها اشتباه است
# (اغلب تله ریال/تومان)، پس نوشته نمی‌شود.
VAL_SANITY = {
    "coin_bubble":  (-0.30, 1.50),
    "gram_premium": (-0.30, 1.00),
    "nima_gap":     (-0.20, 1.50),
    "usdt_premium": (-0.20, 0.40),
}


def fetch_series(keys, timeout=25, days=760, log=print):
    """سری‌های خواسته‌شده را می‌گیرد. خروجی: (bars, closes, errors).

    bars[key]   = list[(date, close, high, low, volume)]  آماده نوشتن در شیت
    closes[key] = dict[date] = close                      برای محاسبه سنجه
    """
    bars, closes, errors = {}, {}, {}
    for key in keys:
        src, symbol, label = SERIES[key]
        try:
            if src == "tgju":
                raw = tgju.fetch_history(symbol, timeout=timeout)
                rows = [(d, cl, hi, lo, None) for (d, _o, lo, hi, cl) in raw]
            else:
                raw = nobitex.fetch_history(symbol, days=days, timeout=timeout)
                rows = [(x["date"], x["close"], x["high"], x["low"], x["volume"])
                        for x in raw]
        except Exception as exc:                        # noqa: BLE001
            errors[key] = str(exc)[:120]
            log("  ✘ %-22s %s" % (label, errors[key]))
            continue
        rows = [r for r in rows if r[1]]
        rows.sort(key=lambda t: t[0])
        bars[key] = rows
        closes[key] = {r[0]: r[1] for r in rows}
        log("  ✔ %-22s %d روز  (%s تا %s)"
            % (label, len(rows), rows[0][0] if rows else "—",
               rows[-1][0] if rows else "—"))
    return bars, closes, errors


def build_valuation(kind, closes):
    """سنجه ارزش‌گذاری را روی تاریخ‌های مشترک می‌سازد. خروجی: dict[date]=value."""
    needs, fn = VALUATIONS[kind]
    if any(k not in closes for k in needs):
        return {}
    common = set(closes[needs[0]])
    for k in needs[1:]:
        common &= set(closes[k])
    lo, hi = VAL_SANITY[kind]
    out = {}
    for d in common:
        try:
            v = fn(closes, d)
        except ZeroDivisionError:
            continue
        if lo <= v <= hi:
            out[d] = v
    return out


def _last_data_row(ws, first=5):
    last = first - 1
    r = first
    while r <= ws.max_row:
        if isinstance(ws.cell(row=r, column=1).value,
                      (datetime.date, datetime.datetime)):
            last = r
        r += 1
    return last


def write_history(ws, rows, valuation=None, first=5, log=print):
    """ردیف‌های تاریخچه را در شیت می‌نویسد و ستون سنجه (P) را پر می‌کند.

    ردیف‌های قبلی پاک می‌شوند تا سری قدیمی و جدید قاطی نشود. فقط ستون‌های
    خام (A تا F) و ستون سنجه (P) نوشته می‌شوند؛ ستون‌های محاسباتی فرمول‌اند
    و دست نمی‌خورند.
    """
    from timeframe.jalali import jalali_str
    old_last = _last_data_row(ws, first)
    for r in range(first, max(old_last, first + len(rows) - 1) + 1):
        for c in (1, 2, 3, 4, 5, 6, 16):
            ws.cell(row=r, column=c).value = None
    n_val = 0
    for i, (d, close, high, low, vol) in enumerate(rows):
        r = first + i
        if isinstance(d, datetime.datetime):
            d = d.date()
        ws.cell(row=r, column=1, value=d)
        ws.cell(row=r, column=2, value=jalali_str(d))
        ws.cell(row=r, column=3, value=close)
        ws.cell(row=r, column=4, value=high if high else close)
        ws.cell(row=r, column=5, value=low if low else close)
        if vol is not None:
            ws.cell(row=r, column=6, value=vol)
        if valuation and d in valuation:
            ws.cell(row=r, column=16, value=valuation[d])
            n_val += 1
    log("    %d ردیف نوشته شد، %d ردیف سنجه ارزش‌گذاری" % (len(rows), n_val))
    return len(rows), n_val
