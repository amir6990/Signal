# -*- coding: utf-8 -*-
"""
دفتر ثبت پیش‌بینی قضاوتی — روش تتلاک.

چرا این ماژول به‌جای «مدل پیش‌بینی رویداد سیاسی» ساخته شده:

تتلاک در «Expert Political Judgment» بیست سال، ۲۸ هزار پیش‌بینی از ۲۸۴
کارشناس را ردیابی کرد. نتیجه: دقت کارشناسان سیاسی به‌سختی از حدس تصادفی
بهتر بود، و کارشناسان مشهورتر بدتر عمل کردند. هیچ مدل کمّی‌ای هم این شکاف
را پر نکرد.

آنچه در تورنمنت IARPA واقعاً دقت را بالا برد، مدل نبود:
  ۱. تجزیه سؤال بزرگ به اجزای قابل سنجش
  ۲. شروع از نرخ پایه (چند بار در گذشته رخ داده؟)
  ۳. احتمال عددی صریح — نه «محتمل» و «بعید»
  ۴. به‌روزرسانی مکرر و کوچک با هر خبر جدید
  ۵. سنجش کالیبراسیون خود در گذر زمان

پس این ماژول پیش‌بینی نمی‌کند. زیرساخت ثبت و سنجش پیش‌بینی **شما** را
می‌سازد، تا پس از چند ماه بدانید واقعاً چقدر خوب پیش‌بینی می‌کنید.

قاعده سخت: سؤالی که معیار حل‌شدن روشن ندارد، پیش‌بینی نیست — یک نظر است.
«بازار بد می‌شود» قابل سنجش نیست. «شاخص کل تا ۱۴۰۵/۰۹/۳۰ افت بیش از ۱۵٪
از سقف خود دارد» قابل سنجش است.
"""
import datetime
import json
import os
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional

from .scoring import BrierResult, brier


@dataclass
class Forecast:
    date: str
    probability: float
    rationale: str = ""


@dataclass
class Question:
    qid: str
    text: str
    resolution_criteria: str
    category: str = "بازار"
    created: str = ""
    deadline: str = ""
    base_rate: Optional[float] = None
    base_rate_source: str = ""
    forecasts: List[Forecast] = field(default_factory=list)
    resolved: bool = False
    outcome: Optional[int] = None
    resolution_note: str = ""

    @property
    def current(self) -> Optional[float]:
        return self.forecasts[-1].probability if self.forecasts else None

    @property
    def first(self) -> Optional[float]:
        return self.forecasts[0].probability if self.forecasts else None

    @property
    def drift(self) -> Optional[float]:
        if len(self.forecasts) < 2:
            return None
        return self.forecasts[-1].probability - self.forecasts[0].probability

    def days_left(self, today: Optional[datetime.date] = None) -> Optional[int]:
        if not self.deadline:
            return None
        try:
            d = datetime.date.fromisoformat(self.deadline)
        except ValueError:
            return None
        return (d - (today or datetime.date.today())).days


class Register:
    """دفتر سؤال‌ها با ذخیره‌سازی JSON."""

    def __init__(self, path: str = "forecasts.json"):
        self.path = path
        self.questions: Dict[str, Question] = {}
        if os.path.exists(path):
            self.load()

    # ---------------- persistence ----------------
    def load(self):
        with open(self.path, encoding="utf-8") as fh:
            raw = json.load(fh)
        self.questions = {}
        for q in raw.get("questions", []):
            fc = [Forecast(**f) for f in q.pop("forecasts", [])]
            self.questions[q["qid"]] = Question(forecasts=fc, **q)

    def save(self):
        data = {"saved": datetime.date.today().isoformat(),
                "questions": [asdict(q) for q in self.questions.values()]}
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)

    # ---------------- operations ----------------
    def add(self, qid: str, text: str, resolution_criteria: str,
            deadline: str, category: str = "بازار",
            base_rate: Optional[float] = None, base_rate_source: str = "") -> Question:
        if not resolution_criteria.strip():
            raise ValueError("سؤال بدون معیار حل‌شدن ثبت نمی‌شود — این یک نظر است، نه پیش‌بینی.")
        q = Question(qid=qid, text=text, resolution_criteria=resolution_criteria,
                     category=category, created=datetime.date.today().isoformat(),
                     deadline=deadline, base_rate=base_rate,
                     base_rate_source=base_rate_source)
        self.questions[qid] = q
        return q

    def forecast(self, qid: str, probability: float, rationale: str = "",
                 date: Optional[str] = None) -> Question:
        q = self.questions[qid]
        if q.resolved:
            raise ValueError("سؤال حل‌شده دیگر پیش‌بینی نمی‌پذیرد.")
        p = max(0.0, min(1.0, probability))
        if p in (0.0, 1.0):
            p = 0.005 if p == 0.0 else 0.995   # قطعیت مطلق در پیش‌بینی مجاز نیست
        q.forecasts.append(Forecast(date or datetime.date.today().isoformat(), p, rationale))
        return q

    def resolve(self, qid: str, outcome: int, note: str = "") -> Question:
        q = self.questions[qid]
        q.resolved = True
        q.outcome = 1 if outcome else 0
        q.resolution_note = note
        return q

    # ---------------- analysis ----------------
    def score(self, use: str = "last") -> BrierResult:
        """امتیاز بریر روی سؤال‌های حل‌شده. use: last | first."""
        fs, os_ = [], []
        for q in self.questions.values():
            if not q.resolved or not q.forecasts:
                continue
            fs.append(q.current if use == "last" else q.first)
            os_.append(q.outcome)
        return brier(fs, os_)

    def open_questions(self, today: Optional[datetime.date] = None) -> List[Question]:
        qs = [q for q in self.questions.values() if not q.resolved]
        qs.sort(key=lambda q: q.days_left(today) if q.days_left(today) is not None else 9999)
        return qs

    def due(self, today: Optional[datetime.date] = None) -> List[Question]:
        return [q for q in self.open_questions(today)
                if (q.days_left(today) or 9999) <= 0]

    def report(self, today: Optional[datetime.date] = None) -> str:
        today = today or datetime.date.today()
        L = ["دفتر پیش‌بینی — %s" % today.isoformat(), "─" * 74]
        openq = self.open_questions(today)
        L.append("\nسؤال‌های باز (%d):" % len(openq))
        for q in openq:
            dl = q.days_left(today)
            L.append("  [%s] %s" % (q.qid, q.text))
            L.append("      معیار حل: %s" % q.resolution_criteria)
            L.append("      مهلت: %s (%s) | نرخ پایه: %s | پیش‌بینی جاری: %s%s"
                     % (q.deadline,
                        ("%d روز مانده" % dl) if dl is not None and dl >= 0
                        else ("سررسید گذشته" if dl is not None else "—"),
                        ("%.0f%%" % (q.base_rate * 100)) if q.base_rate is not None else "ثبت نشده",
                        ("%.0f%%" % (q.current * 100)) if q.current is not None else "ثبت نشده",
                        ("  (تغییر %+.0f واحد درصد از اولین برآورد)" % (q.drift * 100))
                        if q.drift else ""))
            if q.base_rate is None:
                L.append("      ⚠ نرخ پایه ثبت نشده — طبق روش تتلاک، پیش‌بینی بدون "
                         "نرخ پایه در معرض لنگرانداختن روی روایت است.")
        resolved = [q for q in self.questions.values() if q.resolved]
        L.append("\nسؤال‌های حل‌شده: %d" % len(resolved))
        if resolved:
            L.append("\nکالیبراسیون شما (بر مبنای آخرین پیش‌بینی هر سؤال):")
            L.append(self.score("last").table())
            first = self.score("first")
            L.append("\n   برای مقایسه — امتیاز بریر اولین پیش‌بینی‌ها: %.4f" % first.brier)
            L.append("   %s" % ("به‌روزرسانی‌ها دقت را بهتر کرده‌اند."
                                if self.score("last").brier < first.brier
                                else "به‌روزرسانی‌ها دقت را بهتر نکرده‌اند — "
                                     "احتمالاً به اخبار بیش از حد واکنش نشان می‌دهید."))
        return "\n".join(L)


# ------------------------------------------------------------------
# الگوهای سؤال — با معیار حل‌شدن صریح، چون بدون آن قابل سنجش نیستند
TEMPLATES = [
    dict(qid="MKT-DRAWDOWN-3M",
         text="افت شاخص کل بیش از ۱۵٪ از سقف، طی سه ماه آینده",
         resolution_criteria="حل مثبت اگر شاخص کل بورس تهران در هر روز معاملاتی "
                             "تا تاریخ مهلت، بیش از ۱۵٪ پایین‌تر از بالاترین مقدار "
                             "ثبت‌شده‌اش در ۲۵۲ روز معاملاتی قبل بسته شود.",
         category="بازار"),
    dict(qid="MKT-REGIME-3M",
         text="ورود بازار به رژیم پرتنش طی سه ماه آینده",
         resolution_criteria="حل مثبت اگر احتمال هموارشده رژیم پرتنش در مدل دو "
                             "رژیمی همیلتون (روی بازده روزانه شاخص کل) در هر روزی "
                             "تا مهلت، بالای ۷۰٪ برود.",
         category="بازار"),
    dict(qid="FX-STEP-3M",
         text="جهش بیش از ۲۰٪ نرخ دلار آزاد طی سه ماه آینده",
         resolution_criteria="حل مثبت اگر میانگین هفتگی نرخ دلار آزاد در هر هفته "
                             "تا مهلت، بیش از ۲۰٪ بالاتر از میانگین هفته پایانِ "
                             "ثبت سؤال باشد. منبع مرجع را از قبل تعیین کنید.",
         category="ارز"),
    dict(qid="POL-EVENT-3M",
         text="رویداد سیاسی با اثر مستقیم بر بازار طی سه ماه آینده",
         resolution_criteria="⚠ این سؤال به همین شکل قابل سنجش نیست و باید تجزیه "
                             "شود. مثال قابل سنجش: «تا تاریخ X، دور جدیدی از مذاکرات "
                             "رسمی با اعلام عمومی طرفین برگزار می‌شود» یا «تا تاریخ X، "
                             "قطعنامه‌ای در شورای حکام تصویب می‌شود». هر سؤال باید "
                             "یک رویداد منفرد، قابل مشاهده و بدون ابهام باشد.",
         category="سیاسی"),
    dict(qid="ENERGY-CUT-WINTER",
         text="اعمال محدودیت گاز صنایع بزرگ در زمستان پیش‌رو",
         resolution_criteria="حل مثبت اگر دست‌کم سه شرکت بورسی از صنایع فولاد، "
                             "پتروشیمی یا سیمان، در گزارش‌های کدال خود تا مهلت، "
                             "به کاهش تولید ناشی از محدودیت گاز اشاره کنند.",
         category="ساختاری"),
]


def seed_templates(reg: Register, deadline: str) -> List[str]:
    """افزودن سؤال‌های نمونه با مهلت مشخص. نرخ پایه را خودتان باید پر کنید."""
    added = []
    for t in TEMPLATES:
        if t["qid"] in reg.questions:
            continue
        reg.add(deadline=deadline, **t)
        added.append(t["qid"])
    return added
