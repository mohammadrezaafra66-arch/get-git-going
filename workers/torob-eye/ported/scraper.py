"""جمع‌آوری قیمت فروشنده‌ها از صفحه‌ی محصول ترب.

منطق این فایل از پروژه‌ی «Torob Prices» آمده: تنظیم شهر، سوییچ بین تب
«خرید حضوری» و «خرید اینترنتی»، باز کردن لیست کامل فروشگاه‌ها و استخراج ردیف‌ها.
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import parse_qs, urlparse

import config
from utils import to_int_price

MODES = ["خرید حضوری", "خرید اینترنتی"]

SELLER_SELECTOR = "div[class*='SellerRow'], a[href*='/redirect/'], a[href*='prk=']"
# Prefer structured seller rows; bare redirect anchors are noisy on modern Torob PDP.
SELLER_ROW_SELECTOR = "div[class*='SellerRow']"

_PRICE_LINE_RE = re.compile(r"^[\d۰-۹,.٬\s]+تومان")
_UNAVAILABLE_RE = re.compile(r"^ناموجود")
_TOMAN_PRICE_RE = re.compile(
    r"([\d۰-۹][\d۰-۹,.٬\s]{0,24})\s*تومان"
)


def _prk_from_link(link: str) -> str:
    if not link or "prk=" not in link:
        return ""
    try:
        return (parse_qs(urlparse(link).query).get("prk") or [""])[0].strip().lower()
    except Exception:
        return ""


def _price_from_text(txt: str) -> int:
    """Extract the first تومان-denominated price; avoid concatenating model digits."""
    if not txt or "تومان" not in txt:
        return 0
    # Prefer explicit "N تومان" spans (first match wins — usually the offer price)
    for m in _TOMAN_PRICE_RE.finditer(txt):
        val = to_int_price(m.group(1) + " تومان")
        if 1_000 <= val <= 50_000_000_000:  # sane retail bounds
            return val
    # Fallback: last line ending with تومان
    for ln in reversed([ln.strip() for ln in txt.splitlines() if ln.strip()]):
        if "تومان" in ln:
            val = to_int_price(ln)
            if 1_000 <= val <= 50_000_000_000:
                return val
    return 0


def _looks_like_product_title(line: str) -> bool:
    s = (line or "").strip()
    if not s:
        return True
    low = s.casefold()
    if re.search(r"\b(gg-|sp\d|nc-|ms\d)", low):
        return True
    if "مدل" in s and len(s) > 20:
        return True
    if "ظرفیت" in s or "لیتر" in s:
        return True
    # Long multi-token marketing titles are not shop names
    if len(s) > 48 and s.count(" ") >= 4:
        return True
    return False


def _shop_from_card_text(txt: str) -> str:
    lines = [ln.strip() for ln in (txt or "").splitlines() if ln.strip()]
    if not lines:
        return "نامشخص"
    # Prefer explicit buy-from shop labels
    for ln in lines:
        if ln.startswith("خرید از") and len(ln) > 6:
            return ln
    candidates: list[str] = []
    for ln in lines:
        if _UNAVAILABLE_RE.match(ln):
            continue
        if _PRICE_LINE_RE.match(ln) or ln.endswith("تومان"):
            # pure price line
            if to_int_price(ln) > 0 and " " not in ln.replace("تومان", "").strip():
                continue
            if to_int_price(ln) > 0 and ln.replace("تومان", "").strip() and all(
                ch.isdigit() or ch in "۰۱۲۳۴۵۶۷۸۹,.٬ ٫" for ch in ln.replace("تومان", "")
            ):
                continue
        if ln in MODES:
            continue
        if ln.startswith("ضمانت"):
            continue
        if len(ln) < 2:
            continue
        if _looks_like_product_title(ln):
            continue
        candidates.append(ln)
    if candidates:
        candidates.sort(key=lambda x: (len(x), x))
        return candidates[0]
    return "نامشخص"


def parse_seller_card(txt: str, mode: str, link: str = "",
                      nearby_keywords: list[str] | None = None) -> dict | None:
    """استخراج خالص فروشنده از متن کارت — قابل تست آفلاین بدون مرورگر."""
    if "تومان" not in (txt or ""):
        return None
    price = _price_from_text(txt)
    if price <= 0:
        return None
    shop = _shop_from_card_text(txt)
    # Reject product-title / warranty fragments mistaken for seller cards
    if shop != "نامشخص" and "تومان" not in txt.split(shop, 1)[-1] and "\n" not in (txt or ""):
        # single-line non-shop content with a price elsewhere shouldn't happen; keep
        pass
    keywords = nearby_keywords if nearby_keywords is not None else config.NEARBY_KEYWORDS
    nearby = any(k in txt for k in keywords)
    return {"shop": shop, "price": price, "mode": mode, "link": link or "", "nearby": nearby}


def merge_seller_fragments(fragments: list[dict]) -> list[dict]:
    """Merge fragmented redirect anchors that share the same Torob prk.

    Modern Torob PDPs often split one seller card into many ``a[href*=prk]``
    nodes (title / price / mode). Grouping by prk recovers the shop label.
    """
    by_prk: dict[str, dict] = {}
    orphans: list[dict] = []
    for frag in fragments or []:
        link = str(frag.get("link") or "")
        prk = _prk_from_link(link)
        txt = str(frag.get("text") or "")
        mode = str(frag.get("mode") or "")
        if not prk:
            orphans.append(frag)
            continue
        bucket = by_prk.get(prk)
        if bucket is None:
            by_prk[prk] = {"texts": [txt], "link": link, "mode": mode}
        else:
            if txt and txt not in bucket["texts"]:
                bucket["texts"].append(txt)
            # Prefer richer buy-box links when present
            if "btn=buy_box" in link or (
                "btn=buy" in link and "btn=buy_box" not in (bucket["link"] or "")
            ):
                bucket["link"] = link
            if mode and not bucket.get("mode"):
                bucket["mode"] = mode

    merged: list[dict] = []
    for prk, bucket in by_prk.items():
        combined = "\n".join(t for t in bucket["texts"] if t)
        parsed = parse_seller_card(combined, bucket.get("mode") or "", link=bucket["link"])
        if parsed:
            merged.append(parsed)
    for frag in orphans:
        parsed = parse_seller_card(
            str(frag.get("text") or ""),
            str(frag.get("mode") or ""),
            link=str(frag.get("link") or ""),
        )
        if parsed:
            merged.append(parsed)
    return merged


def parse_sellers_from_plain_cards(cards: list[dict]) -> list[dict]:
    """cards: [{'text':..., 'mode':..., 'link':...}, ...]"""
    return merge_seller_fragments(
        [
            {
                "text": card.get("text", ""),
                "mode": card.get("mode", ""),
                "link": card.get("link", ""),
            }
            for card in cards or []
        ]
    )


async def _set_city(page, log) -> None:
    """اگر انتخابگر شهر روی صفحه بود، شهر پیش‌فرض را ست می‌کند."""
    try:
        await page.click("div[class*='CitySelect']", timeout=3000)
        await page.fill("input[placeholder*='جستجو']", config.TOROB_CITY)
        await page.click(f"text='{config.TOROB_CITY}'", timeout=3000)
        await asyncio.sleep(1)
    except Exception:
        pass  # صفحه‌های زیادی این انتخابگر را ندارند — مشکلی نیست


async def _expand_all_sellers(page, log, mode: str) -> None:
    """دکمه‌ی «نمایش تمام N فروشگاه» را می‌زند تا لیست کامل شود."""
    try:
        await page.mouse.wheel(0, 600)
        await asyncio.sleep(1)
        show_more = page.locator("text=/نمایش تمام .* فروشگاه/").first
        if await show_more.is_visible():
            log(f"   🔽 گسترش لیست ({mode})...")
            await show_more.click(force=True)
            await page.wait_for_timeout(4000)
    except Exception:
        pass


async def collect_prices(page, product_name: str, log) -> list[dict]:
    """همه‌ی ردیف‌های فروشنده را در هر دو حالت خرید برمی‌گرداند."""
    rows: list[dict] = []
    await _set_city(page, log)

    for mode in MODES:
        log(f"🔄 سوییچ به تب: {mode}")
        try:
            tab = page.locator(f"text={mode}")
            if await tab.count() > 0:
                await tab.first.click()
                await asyncio.sleep(3)
            else:
                log(f"   ⚠️ تب {mode} پیدا نشد، ادامه...")

            await _expand_all_sellers(page, log, mode)

            row_cards = await page.query_selector_all(SELLER_ROW_SELECTOR)
            cards = row_cards or await page.query_selector_all(SELLER_SELECTOR)
            fragments: list[dict] = []
            for card in cards:
                try:
                    txt = await card.inner_text()
                except Exception:
                    continue
                href = await card.get_attribute("href")
                if not href:
                    try:
                        a = await card.query_selector(
                            "a[href*='/redirect/'], a[href*='prk=']"
                        )
                        href = await a.get_attribute("href") if a else ""
                    except Exception:
                        href = ""
                link = (
                    ("https://torob.com" + href)
                    if href and href.startswith("/")
                    else (href or "")
                )
                if not txt and not link:
                    continue
                # Keep fragments even without تومان — merge recovers shop+price
                fragments.append({"text": txt or "", "mode": mode, "link": link})

            mode_rows = merge_seller_fragments(fragments)
            # Deduplicate identical shop+price+mode within tab
            seen = set()
            found = 0
            for parsed in mode_rows:
                key = (
                    parsed.get("shop"),
                    parsed.get("price"),
                    parsed.get("mode"),
                    _prk_from_link(parsed.get("link") or ""),
                )
                if key in seen:
                    continue
                seen.add(key)
                rows.append(parsed)
                found += 1

            log(f"   📊 {found} مورد در {mode} یافت شد.")
        except Exception as e:
            log(f"   ⚠️ خطا در {mode}: {e}")
            continue

    if not rows:
        log(f"❌ هیچ قیمتی برای «{product_name}» یافت نشد.")
    return rows


def nearby_prices(rows: list[dict]) -> list[int]:
    """فقط فروشنده‌های شهرهای نزدیک — ورودی محاسبه‌ی رتبه.

    اگر فیلتر nearby خالی بود، همه را برمی‌گرداند تا رتبه صفر کاذب ندهد.
    """
    nearby = [r["price"] for r in rows if r.get("nearby") and r.get("price")]
    if nearby:
        return nearby
    return [r["price"] for r in rows if r.get("price")]
