# -*- coding: utf-8 -*-
"""
منابع کتاب‌شناختی لایه زمانی و سطح اعتبار هر چارچوب.

چرا این فایل وجود دارد: هر ادعای این پکیج باید بتواند بگوید از کجا آمده. اگر
عددی منبع ندارد، باید «تخمین» یا «ورودی کاربر» علامت بخورد. بدون این تفکیک،
یک چارچوب روایی و یک نتیجه آماری در خروجی کنار هم می‌نشینند و کاربر نمی‌تواند
تشخیص دهد به کدام چقدر اتکا کند.
"""
from dataclasses import dataclass
from enum import Enum


class Dating(Enum):
    """اطمینان به تاریخ‌ها."""
    SOURCED = "صریح در منبع"
    STANDARD = "دیتینگ استاندارد ادبیات موضوع (بین نویسندگان متفاوت است)"
    ESTIMATED = "تخمین — در منبع صریح نیامده"
    USER = "ورودی کاربر"


class Status(Enum):
    """جایگاه علمی خود چارچوب — مستقل از دقت تاریخ‌ها."""
    EMPIRICAL = "دارای پشتوانه تجربی متعارف"
    DEBATED = "در ادبیات تخصصی مطرح ولی مورد مناقشه"
    HETERODOX = "خارج از جریان اصلی؛ اجماع علمی ندارد"
    NARRATIVE = "چارچوب روایی/دوره‌بندی تاریخی، نه مدل آماری آزموده"


@dataclass(frozen=True)
class Source:
    key: str
    author: str
    title: str
    year: int
    domain: str
    status: Status
    note: str = ""


SOURCES = {s.key: s for s in [
    # ---------------- چرخه‌های بازار ----------------
    Source("hurst", "J.M. Hurst", "The Profit Magic of Stock Transaction Timing", 1970,
           "چرخه بازار", Status.HETERODOX,
           "مدل چرخه‌های اسمی و اصول هشت‌گانه. مبنای ریاضی روشن دارد ولی "
           "اعتبارسنجی مستقل و منتشرشده‌ای که سودآوری آن را تأیید کند در دست نیست."),
    Source("grafton", "Christopher Grafton", "Mastering Hurst Cycle Analysis", 2011,
           "چرخه بازار", Status.HETERODOX,
           "تدوین عملیاتی روش هرست: FLD، VTL و فازبندی."),
    Source("thienen", "Lars von Thienen",
           "Decoding the Hidden Market Rhythm — Part 1: Dynamic Cycles", 2011,
           "چرخه بازار", Status.HETERODOX,
           "تحلیل طیفی و آزمون معناداری چرخه. روش آماری آن (آزمون بارتلز) "
           "معتبر است؛ آنچه مورد مناقشه است، پایداری چرخه‌های یافته‌شده در آینده است."),
    Source("gann_commodities", "W.D. Gann", "How to Make Profits Trading in Commodities",
           1941, "چرخه بازار", Status.HETERODOX,
           "شمارش‌های زمانی و سالگردها. هیچ توجیه علّی برای اعداد ارائه نمی‌شود."),
    Source("gann_tunnel", "W.D. Gann", "The Tunnel Thru the Air", 1927,
           "چرخه بازار", Status.HETERODOX,
           "رمان با لایه رمزی چرخه‌های زمانی. منبع اولیه ادعاهای چرخه طبیعی گن."),
    Source("hyerczyk", "James A. Hyerczyk", "Pattern, Price & Time: Using Gann Theory",
           1998, "چرخه بازار", Status.HETERODOX,
           "منظم‌ترین تدوین نظریه گن برای استفاده عملی."),
    Source("frost_prechter", "A.J. Frost & Robert Prechter",
           "Elliott Wave Principle: Key to Market Behavior", 1978,
           "چرخه بازار", Status.HETERODOX,
           "سه قاعده سخت قابل آزمون‌اند؛ اما برچسب‌گذاری چندگانه است و همین، "
           "ابطال‌پذیری چارچوب را تضعیف می‌کند."),
    Source("prechter_pictures", "Robert Prechter",
           "Beautiful Pictures from the Gallery of Phinance", 2003,
           "چرخه بازار", Status.HETERODOX,
           "نسبت‌های فیبوناچی در ساختار قیمت و زمان."),

    # ---------------- چرخه‌های اقتصادی ----------------
    Source("juglar", "Clément Juglar",
           "Des crises commerciales et de leur retour périodique", 1862,
           "چرخه اقتصادی", Status.EMPIRICAL,
           "نخستین مستندسازی چرخه تجاری ۷ تا ۱۱ ساله. وجود چرخه تجاری در اقتصاد "
           "جریان اصلی پذیرفته است؛ دوره ثابت آن نه."),
    Source("schumpeter", "Joseph Schumpeter", "Business Cycles", 1939,
           "چرخه اقتصادی", Status.DEBATED,
           "طرح سه‌چرخه‌ای کیچین/ژوگلار/کندراتیف و تخریب خلاق. مفهوم تخریب خلاق "
           "پذیرفته‌شده است؛ طرح سه‌چرخه‌ای منظم نه."),
    Source("perez", "Carlota Perez", "Technological Revolutions and Financial Capital",
           2002, "چرخه اقتصادی", Status.DEBATED,
           "پارادایم‌های فناورانه-اقتصادی. تاریخ‌های آغاز پنج موج صریحاً در کتاب آمده."),
    Source("grinin", "Leonid Grinin, Andrey Korotayev, Arno Tausch",
           "Economic Cycles, Crises, and the Global Periphery", 2016,
           "چرخه اقتصادی", Status.DEBATED,
           "دیتینگ استاندارد امواج کندراتیف و پیوند آن با بحران‌های پیرامون."),

    # ---------------- ژئوپلیتیک ----------------
    Source("dalio", "Ray Dalio",
           "Principles for Dealing with the Changing World Order", 2021,
           "ژئوپلیتیک", Status.NARRATIVE,
           "چرخه بزرگ امپراتوری‌ها و هشت سنجه قدرت. دوره‌بندی پس‌نگر است و "
           "پیش‌بینی‌های آن آزمون بیرونی نشده‌اند."),
    Source("kennedy", "Paul Kennedy", "The Rise and Fall of the Great Powers", 1987,
           "ژئوپلیتیک", Status.DEBATED,
           "تز «کشیدگی امپراتوری»: نسبت پایه اقتصادی به تعهدات نظامی. "
           "تاریخ‌نگاری جدی است ولی چرخه با دوره ثابت ارائه نمی‌دهد."),
    Source("goldstein", "Joshua S. Goldstein",
           "Long Cycles: Prosperity and War in the Modern Age", 1988,
           "ژئوپلیتیک", Status.DEBATED,
           "پیوند موج بلند با شدت جنگ قدرت‌های بزرگ؛ داده‌های کمی از ۱۴۹۵ به بعد."),
    Source("howe", "Neil Howe", "The Fourth Turning Is Here", 2023,
           "ژئوپلیتیک", Status.NARRATIVE,
           "ساکولوم ۸۰ تا ۱۰۰ ساله و چهار چرخش نسلی. نقدهای جدی روش‌شناختی "
           "به آن وارد شده؛ به‌عنوان چارچوب روایی بخوانید، نه تقویم."),

    # ---------------- روش‌شناسی پیش‌بینی و ارزیابی (افزوده — فراتر از منابع کاربر) ----------------
    Source("tetlock_epj", "Philip E. Tetlock", "Expert Political Judgment", 2005,
           "پیش‌بینی", Status.EMPIRICAL,
           "بیست سال ردیابی ۲۸ هزار پیش‌بینی از ۲۸۴ کارشناس: دقت کارشناسان سیاسی "
           "به‌سختی از حدس تصادفی بهتر بود و کارشناسان مشهورتر بدتر عمل کردند. "
           "این مطالعه، پایه‌ی تصمیمِ ما برای نساختن «مدل پیش‌بینی رویداد سیاسی» است."),
    Source("tetlock_super", "Philip E. Tetlock & Dan Gardner", "Superforecasting", 2015,
           "پیش‌بینی", Status.EMPIRICAL,
           "یافته تورنمنت IARPA: آنچه دقت را بالا می‌برد مدل نیست — تجزیه سؤال، "
           "شروع از نرخ پایه، احتمال عددی صریح، به‌روزرسانی مکرر و کوچک، و "
           "سنجش کالیبراسیون است. معماری ماژول judgment از همین‌جا می‌آید."),
    Source("brier", "Glenn W. Brier",
           "Verification of Forecasts Expressed in Terms of Probability", 1950,
           "پیش‌بینی", Status.EMPIRICAL,
           "امتیاز بریر: تنها راه صادقانه سنجش پیش‌بینی احتمالاتی. "
           "بدون آن، هر پیش‌بینی‌کننده‌ای می‌تواند خودش را موفق بداند."),
    Source("murphy", "Allan H. Murphy",
           "A New Vector Partition of the Probability Score", 1973,
           "پیش‌بینی", Status.EMPIRICAL,
           "تجزیه بریر به سه جزء: کالیبراسیون، تفکیک‌پذیری و عدم‌قطعیت ذاتی. "
           "نشان می‌دهد یک پیش‌بینی می‌تواند کالیبره ولی بی‌فایده باشد."),
    Source("hamilton", "James D. Hamilton",
           "A New Approach to the Economic Analysis of Nonstationary Time Series "
           "and the Business Cycle", 1989, "چرخه اقتصادی", Status.EMPIRICAL,
           "مدل مارکوف رژیم‌سوئیچینگ. روش استاندارد جریان اصلی برای تخمین "
           "احتمال قرارگرفتن اقتصاد/بازار در رژیم رکودی. مبنای ماژول regime."),
    Source("estrella_mishkin", "Arturo Estrella & Frederic S. Mishkin",
           "Predicting U.S. Recessions: Financial Variables as Leading Indicators",
           1998, "چرخه اقتصادی", Status.EMPIRICAL,
           "شیب منحنی بازده بهترین پیش‌بین منفرد رکود آمریکاست، با افق ۱۲ تا ۱۸ ماه "
           "— نه سه ماه. برای ایران معادل تقریبی آن ساختار زمانی بازدهی اخزاست."),
    Source("welch_goyal", "Ivo Welch & Amit Goyal",
           "A Comprehensive Look at the Empirical Performance of Equity Premium "
           "Prediction", 2008, "پیش‌بینی", Status.EMPIRICAL,
           "بررسی گسترده متغیرهای پیش‌بین بازده سهام: تقریباً همه در خارج از نمونه "
           "شکست می‌خورند و از میانگین ساده تاریخی بدتر عمل می‌کنند. "
           "این مقاله، دلیل اصلی وجود بخش «مقایسه با معیار بی‌اثر» در بک‌تستر ماست."),
    Source("lopez_de_prado", "David H. Bailey, Jonathan Borwein, "
           "Marcos López de Prado & Qiji Jim Zhu",
           "Pseudo-Mathematics and Financial Charlatanism: The Effects of Backtest "
           "Overfitting on Out-of-Sample Performance", 2014,
           "بک‌تست", Status.EMPIRICAL,
           "با کافی‌بودن تعداد تلاش، همیشه می‌توان یک استراتژی با شارپ بالا در "
           "نمونه ساخت که خارج از نمونه بی‌ارزش است. مبنای «نسبت شارپ تعدیل‌شده» "
           "و ثبت تعداد تلاش در بک‌تستر."),
    Source("dsr", "David H. Bailey & Marcos López de Prado",
           "The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest "
           "Overfitting and Non-Normality", 2014, "بک‌تست", Status.EMPIRICAL,
           "شارپ تعدیل‌شده بابت تعداد تلاش، چولگی و کشیدگی. عددی که در این "
           "پکیج به‌جای شارپ خام گزارش می‌شود."),
    Source("white_rc", "Halbert White", "A Reality Check for Data Snooping", 2000,
           "بک‌تست", Status.EMPIRICAL,
           "آزمون معناداری وقتی چندین استراتژی روی یک داده امتحان شده‌اند. "
           "معادل تصحیح چندگانگی، ولی برای بک‌تست."),
    Source("engle_arch", "Robert F. Engle", "Autoregressive Conditional "
           "Heteroscedasticity with Estimates of the Variance of United Kingdom "
           "Inflation", 1982, "نوسان", Status.EMPIRICAL,
           "خوشه‌ای‌بودن نوسان. یکی از مستحکم‌ترین یافته‌های مالی: نوسان "
           "پیش‌بینی‌پذیر است حتی وقتی جهت بازده نیست."),
    Source("bollerslev", "Tim Bollerslev", "Generalized Autoregressive Conditional "
           "Heteroskedasticity", 1986, "نوسان", Status.EMPIRICAL,
           "GARCH — تعمیم ARCH. مبنای برآورد احتمال افت شدید در افق کوتاه."),
    Source("campbell_shiller", "John Y. Campbell & Robert J. Shiller",
           "Stock Prices, Earnings, and Expected Dividends", 1988,
           "پیش‌بینی", Status.EMPIRICAL,
           "نسبت‌های ارزش‌گذاری بازده بلندمدت را پیش‌بینی می‌کنند، نه کوتاه‌مدت. "
           "افق مهم است: آنچه در ۱۰ سال کار می‌کند در ۳ ماه کار نمی‌کند."),
    Source("lo_amh", "Andrew W. Lo", "The Adaptive Markets Hypothesis", 2004,
           "پیش‌بینی", Status.DEBATED,
           "کارایی بازار مطلق نیست بلکه به شرایط و رقابت بستگی دارد؛ "
           "لبه‌ها وجود دارند ولی فرسوده می‌شوند. توضیح می‌دهد چرا یک استراتژی "
           "که در گذشته کار کرده ممکن است دیگر کار نکند."),
    Source("diebold_mariano", "Francis X. Diebold & Roberto S. Mariano",
           "Comparing Predictive Accuracy", 1995, "پیش‌بینی", Status.EMPIRICAL,
           "آزمون معناداری تفاوت دقت دو پیش‌بینی. بدون آن، «مدل من بهتر است» "
           "یک ادعای بدون پشتوانه آماری است."),
    Source("taleb", "Nassim Nicholas Taleb", "The Black Swan / Dynamic Hedging", 2007,
           "ریسک", Status.DEBATED,
           "دم‌های ضخیم و ناارگودیک‌بودن. برای بازار ایران به‌ویژه مهم: توزیع "
           "بازده به‌شدت غیرنرمال است و معیارهای مبتنی بر واریانس ریسک را کم‌برآورد می‌کنند."),
]}


def bibliography(domain: str = "") -> str:
    rows = [s for s in SOURCES.values() if not domain or s.domain == domain]
    rows.sort(key=lambda s: (s.domain, s.year))
    out = []
    for s in rows:
        out.append("• %s (%d) — %s\n    حوزه: %s | جایگاه: %s\n    %s"
                   % (s.author, s.year, s.title, s.domain, s.status.value, s.note))
    return "\n".join(out)
