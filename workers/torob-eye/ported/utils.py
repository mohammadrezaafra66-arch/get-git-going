"""توابع کمکی مشترک: نرمال‌سازی متن فارسی، قیمت، شماره تلفن و دامنه."""

import re
from datetime import datetime
from urllib.parse import urlparse

_DIGIT_MAP = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

# کاراکترهای عربی که باید به معادل فارسی تبدیل شوند
_CHAR_MAP = str.maketrans({"ي": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "أ": "ا", "إ": "ا", "آ": "آ"})

_ZWNJ = "‌"

try:
    import jdatetime
except ImportError:  # اگر نصب نبود، از تاریخ میلادی استفاده می‌کنیم
    jdatetime = None


# ============================ متن ============================

def normalize_digits(text) -> str:
    """ارقام فارسی/عربی را به لاتین تبدیل می‌کند."""
    return str(text or "").translate(_DIGIT_MAP)


def normalize_text(text) -> str:
    """متن فارسی را یکدست می‌کند: حروف عربی، نیم‌فاصله و فاصله‌های اضافی.

    برای مقایسه و تشخیص تکراری لازم است — «كيبورد» و «کیبورد» باید یکی شوند.
    """
    s = str(text or "").translate(_CHAR_MAP)
    s = s.replace(_ZWNJ, " ")
    return re.sub(r"\s+", " ", s).strip()


def normalize_key(text) -> str:
    """کلید مقایسه: بدون فاصله، بدون علائم، حروف کوچک."""
    s = normalize_text(normalize_digits(text)).lower()
    return re.sub(r"[^\w؀-ۿ]+", "", s)


# ============================ قیمت ============================

_TOMAN_NEAR_RE = re.compile(
    r"([\d][\d,٬.٫ ]{0,24})\s*تومان"
)


def to_int_price(text) -> int:
    """First تومان-adjacent number only. Never concatenate distant digit runs."""
    cleaned = normalize_digits(text)
    m = _TOMAN_NEAR_RE.search(cleaned)
    blob = m.group(1) if m else cleaned
    # Drop thousand separators; keep spaces so "30 350000000" stays two groups.
    blob = blob.replace(",", "").replace("٬", "").replace(".", "").replace("٫", "")
    groups = re.findall(r"\d+", blob)
    if m and groups:
        return int(groups[-1])
    if len(groups) == 1:
        return int(groups[0])
    return 0


def format_price(value) -> str:
    """۱۲۳۴۰۰۰ ← 1.234.000"""
    try:
        return "{:,}".format(int(value or 0)).replace(",", ".")
    except (TypeError, ValueError):
        return "0"


def is_valid_number(text) -> bool:
    """آیا این متن اصلاً رقمی در خود دارد؟ (تشخیص «ناموجود» از قیمت واقعی)"""
    return bool(re.findall(r"\d+", normalize_digits(text)))


# ============================ تماس ============================

_MOBILE_RE = re.compile(r"(?:\+?98|0)?(9\d{9})")
_LANDLINE_RE = re.compile(r"0(\d{2,3})[\s\-]?(\d{7,8})")
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def normalize_mobile(text) -> str | None:
    """هر شکلی از موبایل ایرانی را به فرم ۰۹xxxxxxxxx برمی‌گرداند."""
    if not text:
        return None
    digits = re.sub(r"[^\d+]", "", normalize_digits(text))
    m = _MOBILE_RE.search(digits)
    return "0" + m.group(1) if m else None


def find_mobiles(text) -> list[str]:
    """همه‌ی موبایل‌های یکتا در یک متن."""
    if not text:
        return []
    body = re.sub(r"[\s\-()]", "", normalize_digits(text))
    seen, out = set(), []
    for m in _MOBILE_RE.finditer(body):
        num = "0" + m.group(1)
        if num not in seen:
            seen.add(num)
            out.append(num)
    return out


def find_landlines(text) -> list[str]:
    """تلفن ثابت — پیش‌شماره‌ی ۲ تا ۳ رقمی + شماره."""
    if not text:
        return []
    body = re.sub(r"[\s\-()]", "", normalize_digits(text))
    seen, out = set(), []
    for m in _LANDLINE_RE.finditer(body):
        code, number = m.group(1), m.group(2)
        if code.startswith("9"):          # این موبایل است نه ثابت
            continue
        num = f"0{code}{number}"
        if num not in seen:
            seen.add(num)
            out.append(num)
    return out


def find_emails(text) -> list[str]:
    if not text:
        return []
    seen, out = set(), []
    for m in _EMAIL_RE.finditer(text):
        e = m.group(0).lower()
        # فایل‌های تصویری که شبیه ایمیل دیده می‌شوند را رد کن
        if e.split(".")[-1] in ("png", "jpg", "jpeg", "gif", "webp", "svg"):
            continue
        if e not in seen:
            seen.add(e)
            out.append(e)
    return out


# ============================ آدرس اینترنتی ============================

def domain_of(url: str) -> str:
    """دامنه‌ی اصلی بدون www. برای دامنه‌های خود ترب، رشته‌ی خالی برمی‌گرداند."""
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    host = (urlparse(url).netloc or "").lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    if not host or "torob.com" in host:
        return ""
    return host


def is_external(url: str) -> bool:
    """آیا این لینک به بیرون از ترب می‌رود؟"""
    return bool(domain_of(url))


# ============================ زمان ============================

def now_date() -> str:
    if jdatetime:
        return jdatetime.datetime.now().strftime("%Y/%m/%d")
    return datetime.now().strftime("%Y/%m/%d")


def now_time() -> str:
    if jdatetime:
        return jdatetime.datetime.now().strftime("%H:%M:%S")
    return datetime.now().strftime("%H:%M:%S")


def now_stamp() -> str:
    return f"{now_date()} {now_time()}"
