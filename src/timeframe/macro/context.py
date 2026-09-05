# -*- coding: utf-8 -*-
"""جمع‌بندی زمینه کلان برای هر طبقه دارایی."""
import datetime
from typing import Dict, List, Optional

from . import gold as gold_mod
from . import iran as iran_mod
from . import long_waves as lw

ASSET_CLASSES = {
    "iran_equity": "بازار سرمایه ایران",
    "gold": "طلا",
    "fx": "ارز",
    "commodity": "کالاهای پایه",
    "global_macro": "اقتصاد جهانی",
    "geopolitics": "ژئوپلیتیک",
}

# کدام چرخه بلند برای کدام طبقه دارایی مربوط است
RELEVANCE: Dict[str, List[str]] = {
    "iran_equity": ["kondratieff", "perez"],
    "gold": ["kondratieff", "dalio_big", "dalio_debt"],
    "fx": ["dalio_big", "dalio_debt"],
    "commodity": ["kondratieff", "perez"],
    "global_macro": ["kondratieff", "juglar", "kitchin", "schumpeter", "perez", "dalio_debt"],
    "geopolitics": ["dalio_big", "dalio_internal", "howe", "goldstein", "kennedy"],
}


def build(asset_class: str = "iran_equity", today: Optional[datetime.date] = None) -> dict:
    """زمینه کلان یک طبقه دارایی: چرخه‌های مربوط + لایه محلی."""
    today = today or datetime.date.today()
    keys = RELEVANCE.get(asset_class, [])
    waves = []
    for k in keys:
        w = lw.REGISTRY.get(k)
        if not w:
            continue
        p = w.current_phase(today)
        waves.append({
            "title": w.title, "typical": w.typical_years,
            "phase": p.name if p else "بدون فاز تاریخ‌دار — نیازمند لنگر کاربر",
            "span": p.span if p else "—",
            "progress": w.progress(today),
            "dating": w.dating.value, "status": w.status.value,
            "source": "%s (%d)" % (w.source.author, w.source.year),
            "caveat": w.caveat, "phase_note": p.note if p else "",
        })
    out = {
        "asset_class": ASSET_CLASSES.get(asset_class, asset_class),
        "date": today.isoformat(),
        "long_waves": waves,
        "is_signal": False,
        "why_not_signal": (
            "این زمینه است، نه سیگنال. چرخه‌های بلند در بهترین حالت افق چندساله "
            "دارند و نمی‌توانند تصمیم خرید و فروش میان‌مدت را جابه‌جا کنند. "
            "وزن پیش‌فرض این لایه در امتیاز نهایی صفر است."),
    }
    if asset_class == "iran_equity":
        out["iran_calendar"] = iran_mod.calendar_context(today)
    if asset_class == "gold":
        out["gold_notes"] = gold_mod.CYCLE_CONTEXT
    return out


def all_classes(today: Optional[datetime.date] = None) -> Dict[str, dict]:
    return {k: build(k, today) for k in ASSET_CLASSES}
