# -*- coding: utf-8 -*-
"""
BrsApi.ir — ارز، طلا و سکه ایران. نیازمند کلید رایگان.

کلید را از brsapi.ir بگیرید و در فایل پیکربندی بگذارید:
    {"brsapi_key": "..."}

⚠️ ساختار پاسخ تأیید نشده است. این منبع در مستندات ریپوی tse-market-data
به‌عنوان منبع مکمل نام برده شده، ولی شکل دقیق پاسخش را نمی‌دانم.
"""
from ..http import get_json, to_number

URL = "https://BrsApi.ir/Api/Market/Gold_Currency.php?key=%s"

NAME_MAP = {
    "دلار": "usd_irr_free", "دلار آمریکا": "usd_irr_free",
    "یورو": "eur_irr", "درهم امارات": "aed_irr",
    "طلای 18 عیار": "gram18k_irr", "طلای 18 عیار / 750": "gram18k_irr",
    "انس طلا": "gold_oz_usd", "انس نقره": "silver_oz_usd",
    "سکه امامی": "coin_full_irr", "سکه بهار آزادی": "coin_full_irr",
    "نیم سکه": "coin_half_irr", "ربع سکه": "coin_quarter_irr",
}


def fetch(config):
    key = config.get("brsapi_key")
    if not key:
        raise ValueError("کلید API تنظیم نشده")
    out = {}
    data = get_json(URL % key, timeout=config.get("timeout", 20))
    rows = []
    if isinstance(data, dict):
        for k in ("gold", "currency", "cryptocurrency", "data", "items"):
            v = data.get(k)
            if isinstance(v, list):
                rows.extend(v)
    elif isinstance(data, list):
        rows = data
    if not rows:
        raise ValueError("پاسخ گرفته شد ولی هیچ آرایه داده‌ای نبود — "
                         "ساختار پاسخ را بررسی و NAME_MAP را تطبیق دهید")
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or row.get("title") or "").strip()
        q = NAME_MAP.get(name)
        if not q:
            continue
        v = to_number(row.get("price") or row.get("value") or row.get("p"))
        if v is not None:
            out[q] = v
    return out


META = dict(key="brsapi", title="BrsApi.ir (نیازمند کلید)",
            url_hint="https://BrsApi.ir/Api/Market/Gold_Currency.php?key=…",
            supplies=list(set(NAME_MAP.values())), needs_key=True, verified=False,
            note="ساختار پاسخ تأیید نشده. کلید رایگان از brsapi.ir بگیرید.")
