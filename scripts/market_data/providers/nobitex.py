# -*- coding: utf-8 -*-
"""
Nobitex — تتر و ارزهای دیجیتال به ریال.

    GET/POST https://api.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls
    پاسخ: {"status":"ok","stats":{"usdt-rls":{"latest":..,"bestBuy":..,
                                              "bestSell":..,"dayChange":..,
                                              "dayLow":..,"dayHigh":..}}}

نکات تأییدشده از پیاده‌سازی‌های عمومی:
  • هم GET با query param کار می‌کند هم POST با بدنه JSON.
  • میرور: apiv2.nobitex.ir با همان مسیر.
  • srcCurrency لیست جداشده با کاما می‌پذیرد — یک درخواست برای چند ارز.
  • ⚠️ **تله واحد:** dstCurrency=rls یعنی ریال ولی dstCurrency=irt یعنی
    **تومان**. این پکیج همیشه rls می‌خواهد؛ اگر روزی irt گرفتید، ×۱۰ کنید.
"""
import datetime

from ..http import get_json, post_json, to_number

HOSTS = ["https://api.nobitex.ir", "https://apiv2.nobitex.ir"]
PATH = "/market/stats"
ORDERBOOK = "%s/v3/orderbook/%s"
HISTORY = "%s/market/udf/history"

PAIRS = {"usdt": "usdt_irr"}

# نمادهای تاریخچه. کلید = نماد UDF، مقدار = (برچسب، ضریب تبدیل به ریال).
# ⚠️ نمادهای IRT در endpoint تاریخچه به **تومان** هستند — برخلاف /market/stats
# که با dstCurrency=rls ریال می‌دهد. نمونه رسمی مستندات نوبیتکس این را تأیید
# می‌کند: BTCIRT در تیر ۱۳۹۸ حدود ۱۴۶٬۲۷۲٬۵۰۰ است که تومان است نه ریال.
# پس ضریب ۱۰ لازم است تا با بقیه پکیج (که همه‌جا ریال است) هم‌واحد شود.
HISTORY_SYMBOLS = {"USDTIRT": ("تتر USDT", 10.0)}


def _pick(d):
    for f in ("latest", "bestSell", "bestBuy"):
        v = to_number((d or {}).get(f))
        if v:
            return v
    return None


def fetch(config):
    src = ",".join(PAIRS)
    errs = []
    for host in HOSTS:
        url = "%s%s?srcCurrency=%s&dstCurrency=rls" % (host, PATH, src)
        for attempt in ("get", "post"):
            try:
                if attempt == "get":
                    r = get_json(url, timeout=config.get("timeout", 15))
                else:
                    r = post_json(host + PATH,
                                  {"srcCurrency": src, "dstCurrency": "rls"},
                                  timeout=config.get("timeout", 15))
            except Exception as exc:                    # noqa: BLE001
                errs.append("%s/%s: %s" % (host.split("//")[1], attempt, str(exc)[:40]))
                continue
            stats = (r or {}).get("stats") or {}
            out = {}
            for cur, q in PAIRS.items():
                v = _pick(stats.get("%s-rls" % cur))
                if v is not None:
                    out[q] = v
            if out:
                out["__mirror"] = host
                return out
            errs.append("%s/%s: کلید stats['usdt-rls'] خالی بود"
                        % (host.split("//")[1], attempt))
    raise ValueError("؛ ".join(errs[:3]) or "پاسخی گرفته نشد")


def fetch_orderbook(symbol="USDTIRT", timeout=15):
    """عمق بازار — برای سنجش نقدشوندگی. توجه: IRT یعنی تومان."""
    for host in HOSTS:
        try:
            return get_json(ORDERBOOK % (host, symbol), timeout=timeout)
        except Exception:                               # noqa: BLE001
            continue
    return None


def fetch_history(symbol="USDTIRT", days=760, timeout=25, resolution="D"):
    """OHLC روزانه از endpoint سازگار با TradingView UDF.

        GET /market/udf/history?symbol=USDTIRT&resolution=D&from=<epoch>&to=<epoch>

    پاسخ: {"s":"ok","t":[epoch...],"o":[],"h":[],"l":[],"c":[],"v":[]}
    زمان‌ها ثانیه‌اند. اگر داده‌ای نباشد s برابر "no_data" است.

    خروجی: فهرست دیکشنری‌های {date, open, high, low, close, volume} با قیمت
    **ریالی** (ضریب تبدیل از جدول HISTORY_SYMBOLS اعمال می‌شود)، مرتب صعودی.
    """
    scale = HISTORY_SYMBOLS.get(symbol, (symbol, 10.0))[1]
    to_ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    from_ts = to_ts - int(days) * 86400
    errs = []
    for host in HOSTS:
        url = ("%s?symbol=%s&resolution=%s&from=%d&to=%d"
               % (HISTORY % host, symbol, resolution, from_ts, to_ts))
        try:
            r = get_json(url, timeout=timeout)
        except Exception as exc:                        # noqa: BLE001
            errs.append("%s: %s" % (host.split("//")[1], str(exc)[:50]))
            continue
        r = r or {}
        status = r.get("s")
        if status != "ok":
            errs.append("%s: s=%s" % (host.split("//")[1], status))
            continue
        ts = r.get("t") or []
        rows = []
        for i, t in enumerate(ts):
            def col(k, i=i):
                seq = r.get(k) or []
                return to_number(seq[i]) if i < len(seq) else None
            close = col("c")
            if close is None:
                continue
            day = datetime.datetime.fromtimestamp(
                int(t), datetime.timezone.utc).date()
            rows.append({
                "date": day,
                "open": (col("o") or close) * scale,
                "high": (col("h") or close) * scale,
                "low": (col("l") or close) * scale,
                "close": close * scale,
                "volume": col("v"),
            })
        if rows:
            rows.sort(key=lambda d: d["date"])
            return rows
        errs.append("%s: پاسخ ok بود ولی هیچ کندلی نداشت" % host.split("//")[1])
    raise ValueError("؛ ".join(errs[:3]) or "پاسخی گرفته نشد")


META = dict(key="nobitex", title="Nobitex (۲ میرور)",
            url_hint=HOSTS[0] + PATH,
            supplies=list(PAIRS.values()), needs_key=False, verified=True,
            note="ساختار تأییدشده. rls=ریال و irt=تومان — این پکیج همیشه rls می‌خواهد.")
