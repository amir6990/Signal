# -*- coding: utf-8 -*-
"""
نرخ برابری جهانی ارزها و شاخص دلار — برای زمینه، نه قیمت ریالی.

open.er-api.com بدون کلید نرخ برابری USD را می‌دهد. از آن USDT/USD جهانی
استخراج نمی‌شود (تتر ارز رمزی است)، ولی برای کنترل سازگاری یورو و درهم
نسبت به دلار مفید است.
"""
from ..http import get_json, to_number

URL = "https://open.er-api.com/v6/latest/USD"


def fetch(config):
    out = {}
    d = get_json(URL, timeout=config.get("timeout", 15))
    rates = (d or {}).get("rates") or {}
    if not rates:
        raise ValueError("پاسخ گرفته شد ولی کلید rates خالی بود")
    # این‌ها نرخ برابری‌اند نه ریالی؛ فقط برای کنترل سازگاری در گزارش استفاده می‌شوند
    for code, key in (("AED", "__aed_per_usd"), ("EUR", "__eur_per_usd")):
        v = to_number(rates.get(code))
        if v:
            out[key] = v
    return out


META = dict(key="forex", title="open.er-api.com (نرخ برابری جهانی)",
            url_hint=URL, supplies=[], needs_key=False, verified=False,
            note="فقط برای کنترل سازگاری یورو و درهم — قیمت ریالی نمی‌دهد.")
