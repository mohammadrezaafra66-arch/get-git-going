"""جستجوی کلیدواژه‌ای در ترب و کشف خودکار محصول.

پروژه تا امروز فقط لینک آماده می‌گرفت. اینجا با نام/برند/مدل جستجو می‌کنیم و
خود ربات صفحه‌های محصول را پیدا می‌کند.

نکته‌ی مهم: روش «بدون مرورگر» (خواندن __NEXT_DATA__ با HTTP ساده) روی ترب امروز
جواب نمی‌دهد — آن اسکریپت دیگر در صفحه نیست و درخواست دوم هم HTTP 490 می‌گیرد.
برای همین اینجا از همان مرورگر Playwright استفاده می‌کنیم که بقیه‌ی پروژه دارد.
"""

import re
from urllib.parse import quote_plus, unquote, urljoin

import antidetect
import config
import utils

BASE_URL = "https://torob.com"
PRODUCT_HREF_RE = re.compile(r"^/p/[A-Za-z0-9\-_]+/?")


def build_search_url(query: str) -> str:
    return f"{BASE_URL}/search/?query={quote_plus(query.strip())}"


# متن کارت محصول با تعداد آگهی شروع و با قیمت تمام می‌شود؛ هیچ‌کدام جزو نام نیستند.
_LEADING_COUNT_RE = re.compile(r"^\s*(?:آگهی\s*)?[۰-۹0-9]+\s*(?:آگهی\s*)?")
# جداکننده‌ی هزارگان در ترب کاراکتر ٫ (U+066B) است، نه ویرگول لاتین.
# قیمت باید بعد از فاصله بیاید و یا سه‌رقم‌سه‌رقم جدا شده باشد یا حداقل ۴ رقم —
# وگرنه عدد داخل نام مدل (مثل «Key N500») هم به‌عنوان قیمت حذف می‌شود.
_TRAILING_PRICE_RE = re.compile(
    r"\s(?:از\s+)?(?:[۰-۹0-9]{1,3}(?:[٫٬،.,][۰-۹0-9]{3})+|[۰-۹0-9]{4,})\s*تومان.*$")


def clean_title(raw: str) -> str:
    """از متن خام کارت، فقط نام محصول را بیرون می‌کشد."""
    first_line = str(raw or "").split("\n")[0]
    title = utils.normalize_text(first_line)
    title = _TRAILING_PRICE_RE.sub("", title)
    title = _LEADING_COUNT_RE.sub("", title)
    return title.strip(" -–—،").strip()[:120]


def title_from_url(url: str) -> str:
    """اگر متن کارت خالی/ناقص بود، نام محصول را از slug فارسی URL بساز."""
    parts = [p for p in (url or "").split("/") if p]
    if len(parts) < 2:
        return ""
    slug = parts[-1]
    if re.fullmatch(r"[A-Za-z0-9\-_]{12,}", slug):
        return ""
    title = unquote(slug).replace("-", " ")
    return utils.normalize_text(title).strip()[:120]


def product_key(url: str) -> str:
    """شناسه‌ی یکتای محصول از روی مسیر /p/<key>/ — برای حذف تکراری."""
    m = re.search(r"/p/([A-Za-z0-9\-_]+)", url or "")
    return m.group(1) if m else (url or "")


async def search_products(page, query: str, log=print, limit: int | None = None) -> list[dict]:
    """صفحه‌ی نتایج را باز می‌کند و لیست محصول‌ها را برمی‌گرداند.

    خروجی: [{"query", "url", "key", "name"}, ...]
    """
    limit = limit or config.SEARCH_MAX_PRODUCTS
    url = build_search_url(query)
    log(f"🔎 جستجو: «{query}»")

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=config.PAGE_TIMEOUT_MS)
    except Exception as e:
        log(f"   ❌ صفحه‌ی جستجو باز نشد: {e}")
        return []

    await antidetect.warm_up(page)

    if await antidetect.looks_blocked(page):
        log("   🚫 صفحه‌ی جستجو بلاک/کپچا شد.")
        return []

    try:
        anchors = await page.eval_on_selector_all(
            "a[href]",
            """els => els.map(e => ({
                 href: e.getAttribute('href') || '',
                 text: (e.innerText || '').trim().slice(0, 120)
               }))""",
        )
    except Exception as e:
        log(f"   ❌ خواندن لینک‌ها ناموفق: {e}")
        return []

    out, seen = [], set()
    for a in anchors:
        href = a.get("href") or ""
        if not PRODUCT_HREF_RE.match(href):
            continue
        full = urljoin(BASE_URL, href)
        key = product_key(full)
        if not key or key in seen:
            continue
        seen.add(key)
        name = clean_title(a.get("text") or "")
        if not name or name == "آگهی":
            name = title_from_url(full)
        out.append({"query": query, "url": full, "key": key, "name": name})
        if len(out) >= limit:
            break

    log(f"   📦 {len(out)} محصول یافت شد.")
    return out


async def search_many(page, queries: list[str], log=print) -> list[dict]:
    """چند کلیدواژه را پشت سر هم جستجو می‌کند، با مکث بین آن‌ها."""
    results, seen = [], set()
    for i, query in enumerate(queries):
        found = await search_products(page, query, log)
        for item in found:
            if item["key"] not in seen:
                seen.add(item["key"])
                results.append(item)
        if i < len(queries) - 1:
            await antidetect.random_delay(config.SEARCH_DELAY_MIN, config.SEARCH_DELAY_MAX)
    return results
