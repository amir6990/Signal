# -*- coding: utf-8 -*-
"""لایه HTTP مشترک — با هدر مرورگری، تلاش مجدد و مهلت زمانی."""
import json
import time
import urllib.error
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


class FetchError(Exception):
    pass

# --- route: direct first, then the system proxy ---------------------------------------------
# Many PCs in Iran run a VPN as the Windows system proxy. Iranian sources (TSETMC, TGJU) refuse
# foreign exits, while some foreign sources need the VPN. So each host is tried direct first and
# then through the system proxy; the route that worked is remembered for that host.
import urllib.parse as _up
_ROUTE = {}
_OPENERS = {"direct": urllib.request.build_opener(urllib.request.ProxyHandler({}))}
if urllib.request.getproxies():
    _OPENERS["system"] = urllib.request.build_opener()


def urlopen_routed(req, timeout):
    host = _up.urlparse(req.full_url).hostname or ""
    order = list(_OPENERS)
    if _ROUTE.get(host) in order:
        order.remove(_ROUTE[host]); order.insert(0, _ROUTE[host])
    last = None
    for name in order:
        try:
            resp = _OPENERS[name].open(req, timeout=timeout)
            _ROUTE[host] = name
            return resp
        except urllib.error.HTTPError:
            _ROUTE[host] = name          # the server answered: this route reaches it
            raise
        except Exception as exc:         # noqa: BLE001  DNS, refused, TLS, timeout -> next route
            last = exc
    raise last


def get(url, timeout=15, retries=3, headers=None, referer=None):
    """GET خام. متن پاسخ را برمی‌گرداند."""
    last = None
    h = {"User-Agent": UA, "Accept": "application/json, text/plain, */*"}
    if referer:
        h["Referer"] = referer
    if headers:
        h.update(headers)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=h)
            with urlopen_routed(req, timeout) as resp:
                return resp.read().decode("utf-8", "replace")
        except Exception as exc:                       # noqa: BLE001
            last = exc
            if attempt < retries - 1:
                time.sleep(1.5 ** attempt)
    raise FetchError("%s [%s] ← %s"
                     % (last, type(last).__name__, url))


def get_json(url, **kw):
    txt = get(url, **kw)
    try:
        return json.loads(txt)
    except ValueError as exc:
        raise FetchError("پاسخ JSON معتبر نبود (%s) ← %s" % (exc, url))


def post_json(url, payload, timeout=15, retries=3, headers=None):
    last = None
    h = {"User-Agent": UA, "Content-Type": "application/json",
         "Accept": "application/json"}
    if headers:
        h.update(headers)
    data = json.dumps(payload).encode("utf-8")
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=h, method="POST")
            with urlopen_routed(req, timeout) as resp:
                return json.loads(resp.read().decode("utf-8", "replace"))
        except Exception as exc:                       # noqa: BLE001
            last = exc
            if attempt < retries - 1:
                time.sleep(1.5 ** attempt)
    raise FetchError("%s [%s] ← %s"
                     % (last, type(last).__name__, url))


def to_number(v):
    """تبدیل مقادیر متنی با کاما یا ارقام فارسی به عدد."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "").replace("٬", "")
    trans = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    s = s.translate(trans)
    s = "".join(ch for ch in s if ch.isdigit() or ch in ".-")
    try:
        return float(s) if s not in ("", "-", ".") else None
    except ValueError:
        return None
