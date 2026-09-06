# -*- coding: utf-8 -*-
"""
tgju.org — دلار آزاد، طلا و مسکوکات داخلی.

⚠️ endpoint غیررسمی و مستندنشده. ساختار پاسخ ممکن است بدون اطلاع تغییر کند.
با --probe از کارکردنش مطمئن شوید و اگر شکست، کلیدها را در همین فایل اصلاح کنید.

قیمت‌ها معمولاً به **ریال** هستند. آزمون سلامت پکیج، خطای واحد را می‌گیرد.
"""
from ..http import get_json, to_number

URL = "https://call1.tgju.org/ajax.json"

# نگاشت کمیت → کلیدهای محتمل در پاسخ. چند نام جایگزین امتحان می‌شود چون
# نام‌گذاری این منبع در گذشته تغییر کرده است.
KEYS = {
    "usd_irr_free":     ["price_dollar_rl", "price_dollar", "dollar"],
    "eur_irr":          ["price_eur", "eur"],
    "aed_irr":          ["price_aed", "aed", "price_dirham"],
    "gold_oz_usd":      ["ons", "price_ons", "gold_ons"],
    "silver_oz_usd":    ["silver", "price_silver", "ons_silver"],
    "coin_full_irr":    ["sekee", "sekee_bahar", "coin_emami"],
    "coin_half_irr":    ["nim", "nim_sekee"],
    "coin_quarter_irr": ["rob", "rob_sekee"],
    "gram18k_irr":      ["geram18", "gold_18", "price_gram_18"],
}


def _extract(current, names):
    for n in names:
        node = current.get(n)
        if node is None:
            continue
        if isinstance(node, dict):
            for f in ("p", "price", "value", "c"):
                v = to_number(node.get(f))
                if v:
                    return v
        else:
            v = to_number(node)
            if v:
                return v
    return None


def fetch(config):
    data = get_json(URL, timeout=config.get("timeout", 20),
                    referer="https://www.tgju.org/")
    current = data.get("current") if isinstance(data, dict) else None
    if not isinstance(current, dict):
        raise ValueError("پاسخ گرفته شد ولی کلید current نبود — ساختار تغییر کرده")
    out = {}
    for q, names in KEYS.items():
        v = _extract(current, names)
        if v is not None:
            out[q] = v
    if not out:
        raise ValueError("پاسخ گرفته شد ولی هیچ کلید شناخته‌شده‌ای نبود — "
                         "نگاشت KEYS در tgju.py را با ساختار جدید تطبیق دهید")
    return out


META = dict(key="tgju", title="tgju.org (غیررسمی)",
            url_hint=URL,
            supplies=list(KEYS), needs_key=False, verified=False,
            note="مستندنشده — ساختار پاسخ ممکن است تغییر کند. با --probe بررسی کنید.")
