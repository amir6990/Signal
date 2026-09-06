# -*- coding: utf-8 -*-
"""
منبع دستی — فایل JSON محلی که خودتان نگه می‌دارید.

    {"usd_irr_free": 950000, "coin_full_irr": 900000000, "gold_oz_usd": 3400}

این منبع همیشه کار می‌کند و آخرین خط دفاع است: اگر هیچ منبع آنلاینی در
دسترس نبود، عدد را دستی بنویسید و بقیه زنجیره بدون تغییر کار می‌کند.
"""
import json
import os

from ..base import QUANTITIES
from ..http import to_number


def fetch(config):
    path = config.get("manual_file")
    if not path:
        raise ValueError("فایل دستی تنظیم نشده (با --manual مسیرش را بدهید)")
    if not os.path.exists(path):
        raise ValueError("فایل دستی یافت نشد: %s" % path)
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    out = {k: to_number(v) for k, v in data.items()
           if k in QUANTITIES and to_number(v) is not None}
    if not out:
        known = "، ".join(list(QUANTITIES)[:4])
        raise ValueError("فایل خوانده شد ولی هیچ کلید شناخته‌شده‌ای نداشت. "
                         "کلیدهای مجاز مثل: %s" % known)
    return out


META = dict(key="manual", title="فایل دستی (JSON محلی)",
            url_hint="مسیر فایل با --manual", supplies=list(QUANTITIES),
            needs_key=False, verified=True,
            note="همیشه کار می‌کند. آخرین خط دفاع وقتی منابع آنلاین در دسترس نیستند.")
