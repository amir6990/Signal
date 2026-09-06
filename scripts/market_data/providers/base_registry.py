# -*- coding: utf-8 -*-
"""ساخت رجیستری منابع با ترتیب پیش‌فرض."""
from ..base import Provider, Registry
from . import brsapi, forex, global_gold, manual, nobitex, tgju


def build_registry() -> Registry:
    r = Registry()
    # ترتیب مهم است: منبع تأییدشده و دستی اول، بعد بقیه
    r.add(Provider(fn=manual.fetch, **manual.META))
    r.add(Provider(fn=nobitex.fetch, **nobitex.META))
    r.add(Provider(fn=tgju.fetch, **tgju.META))
    r.add(Provider(fn=brsapi.fetch, **brsapi.META))
    r.add(Provider(fn=global_gold.fetch_goldapi, **global_gold.META_GOLDAPI))
    r.add(Provider(fn=global_gold.fetch_stooq, **global_gold.META_STOOQ))
    r.add(Provider(fn=forex.fetch, **forex.META))
    return r
