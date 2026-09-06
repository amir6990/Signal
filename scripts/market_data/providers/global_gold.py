# -*- coding: utf-8 -*-
"""
اونس جهانی طلا و نقره — دو منبع بین‌المللی بدون کلید.

۱. gold-api.com  — JSON ساده، بدون کلید
۲. Stooq         — CSV، بدون کلید، پوشش گسترده‌تر

⚠️ هیچ‌کدام تأیید نشده‌اند؛ با --probe بررسی کنید.
"""
import csv
import io

from ..http import get, get_json, to_number

GOLD_API = "https://api.gold-api.com/price/%s"
STOOQ = "https://stooq.com/q/l/?s=%s&f=sd2t2ohlcv&h&e=csv"


def _gold_api(symbol, timeout):
    d = get_json(GOLD_API % symbol, timeout=timeout)
    if isinstance(d, dict):
        return to_number(d.get("price"))
    return None


def fetch_goldapi(config):
    t = config.get("timeout", 15)
    out, errs = {}, []
    for sym, q in (("XAU", "gold_oz_usd"), ("XAG", "silver_oz_usd")):
        try:
            v = _gold_api(sym, t)
            if v:
                out[q] = v
            else:
                errs.append("%s: کلید price در پاسخ نبود" % sym)
        except Exception as exc:                        # noqa: BLE001
            errs.append("%s: %s" % (sym, str(exc)[:80]))
    if not out:
        raise ValueError("؛ ".join(errs) or "هیچ نمادی پاسخ نداد")
    return out


def _stooq(sym, timeout):
    txt = get(STOOQ % sym, timeout=timeout)
    rdr = csv.DictReader(io.StringIO(txt))
    for row in rdr:
        v = to_number(row.get("Close"))
        if v:
            return v
    return None


def fetch_stooq(config):
    t = config.get("timeout", 15)
    out, errs = {}, []
    for sym, q in (("xauusd", "gold_oz_usd"), ("xagusd", "silver_oz_usd")):
        try:
            v = _stooq(sym, t)
            if v:
                out[q] = v
            else:
                errs.append("%s: ستون Close خالی بود" % sym)
        except Exception as exc:                        # noqa: BLE001
            errs.append("%s: %s" % (sym, str(exc)[:80]))
    if not out:
        raise ValueError("؛ ".join(errs) or "هیچ نمادی پاسخ نداد")
    return out


META_GOLDAPI = dict(key="goldapi", title="gold-api.com",
                    url_hint=GOLD_API % "XAU",
                    supplies=["gold_oz_usd", "silver_oz_usd"],
                    needs_key=False, verified=False,
                    note="بدون کلید. ساختار تأیید نشده.")

META_STOOQ = dict(key="stooq", title="Stooq (CSV)",
                  url_hint=STOOQ % "xauusd",
                  supplies=["gold_oz_usd", "silver_oz_usd"],
                  needs_key=False, verified=False,
                  note="بدون کلید. خروجی CSV.")
