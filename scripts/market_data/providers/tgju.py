# -*- coding: utf-8 -*-
"""
tgju.org — دلار، طلا، مسکوکات و حباب.

ساختار از روی کد کارکرده در پروژه‌های عمومی استخراج شده (نه از حدس):

۱) قیمت لحظه‌ای — `call{1..5}.tgju.org/ajax.json`
       {"current": {"<نماد>": {"p": قیمت, "h": بیشترین, "l": کمترین, "t": زمان}}}
   پنج میرور دارد؛ اگر یکی در دسترس نبود بعدی امتحان می‌شود.

۲) تاریخچه — `api.tgju.org/v1/market/indicator/summary-table-data/{نماد}`
       {"data": [[باز, کمترین, بیشترین, بسته, تغییر, درصد, تاریخ‌شمسی, تاریخ‌میلادی], ...]}
   میرور: `api.accessban.com` با همان مسیر.
   ⚠️ دو ستون تغییر داخلشان HTML دارند و باید پاک شوند.

⚠️ هیچ‌کدام مستند رسمی نیستند. با --probe از کارکردنشان مطمئن شوید.
مقادیر به **ریال**‌اند.
"""
import re

from ..http import get_json, to_number

LIVE_MIRRORS = ["https://call%d.tgju.org/ajax.json" % i for i in range(1, 6)]
HIST_MIRRORS = [
    "https://api.tgju.org/v1/market/indicator/summary-table-data/%s",
    "https://api.accessban.com/v1/market/indicator/summary-table-data/%s",
]

# نماد tgju → کمیت استاندارد این پکیج
SYMBOLS = {
    "price_dollar_rl":  "usd_irr_free",
    "nima_sell_usd":    "usd_irr_nima",
    "price_eur":        "eur_irr",
    "price_aed":        "aed_irr",
    "ons":              "gold_oz_usd",
    "silver_999":       "silver_oz_usd",
    "geram18":          "gram18k_irr",
    "sekee":            "coin_full_irr",
    "nim":              "coin_half_irr",
    "rob":              "coin_quarter_irr",
}

# نمادهای حباب که tgju مستقیم منتشر می‌کند — برای مقایسه با محاسبه خودمان
BUBBLE_SYMBOLS = {"coin_blubber": "سکه تمام", "nim_blubber": "نیم سکه",
                  "rob_blubber": "ربع سکه", "gerami_blubber": "سکه گرمی"}

# نمادهای تاریخچه‌دار برای ساخت سری زمانی و سیگنال
HISTORY_SYMBOLS = {
    "price_dollar_rl": "دلار آزاد",
    "sekee":           "سکه تمام بهار آزادی",
    "geram18":         "طلای ۱۸ عیار",
    "ons":             "اونس طلای جهانی",
    "nima_sell_usd":   "دلار نیمایی",
}

_TAG = re.compile(r"<[^>]+>")


def _price(node):
    """قیمت از یک گره. ترتیب p سپس h چون در برخی پیاده‌سازی‌ها h استفاده شده."""
    if isinstance(node, dict):
        for f in ("p", "h", "price", "value", "c"):
            v = to_number(node.get(f))
            if v:
                return v
        return None
    return to_number(node)


def fetch_live(config):
    """قیمت لحظه‌ای از اولین میروری که پاسخ بدهد."""
    errs = []
    for url in LIVE_MIRRORS:
        try:
            data = get_json(url, timeout=config.get("timeout", 20),
                            referer="https://www.tgju.org/")
        except Exception as exc:                        # noqa: BLE001
            errs.append("%s: %s" % (url.split("//")[1][:14], str(exc)[:50]))
            continue
        current = data.get("current") if isinstance(data, dict) else None
        if not isinstance(current, dict):
            errs.append("%s: کلید current نبود" % url.split("//")[1][:14])
            continue
        out = {}
        for sym, q in SYMBOLS.items():
            v = _price(current.get(sym))
            if v is not None:
                out[q] = v
        for sym in BUBBLE_SYMBOLS:
            v = _price(current.get(sym))
            if v is not None:
                out["__bubble_" + sym] = v
        if out:
            out["__mirror"] = url
            return out
        errs.append("%s: هیچ نماد شناخته‌شده‌ای نبود" % url.split("//")[1][:14])
    raise ValueError("همه ۵ میرور شکست خوردند — " + "؛ ".join(errs[:3]))


def fetch_history(symbol, timeout=25, limit=None):
    """تاریخچه روزانه یک نماد. خروجی: list[(date, open, low, high, close)].

    تاریخ ستون ۷ (میلادی) استفاده می‌شود، نه ستون ۶ (شمسی).
    """
    import datetime
    errs = []
    for tmpl in HIST_MIRRORS:
        url = tmpl % symbol
        try:
            data = get_json(url, timeout=timeout, referer="https://www.tgju.org/")
        except Exception as exc:                        # noqa: BLE001
            errs.append("%s: %s" % (url.split("//")[1][:18], str(exc)[:50]))
            continue
        rows = (data or {}).get("data")
        if not isinstance(rows, list) or not rows:
            errs.append("%s: کلید data خالی بود" % url.split("//")[1][:18])
            continue
        out = []
        for r in rows:
            if not isinstance(r, list) or len(r) < 8:
                continue
            o, lo, hi, cl = (to_number(_TAG.sub("", str(r[i]))) for i in range(4))
            raw = _TAG.sub("", str(r[7])).strip()
            d = None
            for fmt in ("%Y/%m/%d", "%Y-%m-%d"):
                try:
                    d = datetime.datetime.strptime(raw, fmt).date()
                    break
                except ValueError:
                    continue
            if d is None or cl is None:
                continue
            out.append((d, o or cl, lo or cl, hi or cl, cl))
        if out:
            out.sort(key=lambda t: t[0])
            return out[-limit:] if limit else out
        errs.append("%s: هیچ ردیف قابل تجزیه‌ای نبود" % url.split("//")[1][:18])
    raise ValueError("تاریخچه %s گرفته نشد — %s" % (symbol, "؛ ".join(errs[:2])))


def fetch(config):
    return fetch_live(config)


META = dict(key="tgju", title="tgju.org (۵ میرور)",
            url_hint=LIVE_MIRRORS[0],
            supplies=list(SYMBOLS.values()), needs_key=False, verified=False,
            note="ساختار از کد عمومی کارکرده استخراج شده، ولی مستند رسمی نیست. "
                 "تاریخچه هم می‌دهد: fetch_history(symbol).")
