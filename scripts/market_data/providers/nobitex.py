# -*- coding: utf-8 -*-
"""
Nobitex — تتر و ارزهای دیجیتال به ریال.

⚠️ تنها منبعی در این پکیج که ساختار پاسخش تأیید شده است.
Endpoint عمومی، بدون کلید:

    POST https://api.nobitex.ir/market/stats
    body: {"srcCurrency":"usdt","dstCurrency":"rls"}

پاسخ: {"status":"ok","stats":{"usdt-rls":{"latest":"...","bestBuy":"...", ...}}}

توجه مهم: نوبیتکس قیمت را به **ریال** می‌دهد. اگر جایی تومان دیدید، عدد را
در ۱۰ ضرب کنید — این رایج‌ترین خطای ۱۰ برابری در این حوزه است.
"""
from ..http import post_json, to_number

URL = "https://api.nobitex.ir/market/stats"


def _pair(stats, src, dst):
    key = "%s-%s" % (src, dst)
    d = (stats or {}).get(key) or {}
    for f in ("latest", "bestSell", "bestBuy"):
        v = to_number(d.get(f))
        if v:
            return v
    return None


def fetch(config):
    """استثنا را نمی‌بلعد: probe باید بتواند «شبکه بسته» را از «ساختار عوض شده»
    تفکیک کند، چون درمان این دو فرق دارد."""
    r = post_json(URL, {"srcCurrency": "usdt", "dstCurrency": "rls"},
                  timeout=config.get("timeout", 15))
    v = _pair(r.get("stats"), "usdt", "rls")
    if v is None:
        raise ValueError("پاسخ گرفته شد ولی کلید stats['usdt-rls'] خالی بود — "
                         "احتمال تغییر ساختار پاسخ")
    return {"usdt_irr": v}


META = dict(key="nobitex", title="Nobitex (api.nobitex.ir)",
            url_hint=URL, supplies=["usdt_irr"], needs_key=False, verified=True,
            note="ساختار پاسخ تأیید شده. قیمت به ریال است، نه تومان.")
