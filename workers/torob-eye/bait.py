"""Playwright bait heuristics (same signals as bait.server.ts)."""

from __future__ import annotations

import re
from typing import Any

STRONG = {
    "no_checkout",
    "phone_only",
    "whatsapp_only",
    "china_delivery",
    "call_for_price",
}

PATTERNS = [
    ("whatsapp_only", re.compile(r"whatsapp|واتس\s*اپ|واتساپ", re.I)),
    ("phone_only", re.compile(r"تماس\s*بگیرید|فقط\s*تلفن|call\s*us|tel:", re.I)),
    ("china_delivery", re.compile(r"تحویل\s*چین|ارسال\s*از\s*چین|china\s*warehouse|فوب\s*چین", re.I)),
    ("call_for_price", re.compile(r"قیمت\s*نهایی|هماهنگی\s*تلفنی|call\s*for\s*price", re.I)),
]
CHECKOUT = re.compile(
    r"add[\s_-]?to[\s_-]?cart|سبد\s*خرید|افزودن\s*به\s*سبد|درگاه\s*پرداخت|زرین[\s_-]?پال|checkout|پرداخت\s*آنلاین",
    re.I,
)
PHONE = re.compile(r"(?:\+98|0098|0)?9\d{9}")


def classify_html(html: str) -> dict[str, Any]:
    signals: list[str] = []
    for name, cre in PATTERNS:
        if cre.search(html or ""):
            signals.append(name)
    if html and not CHECKOUT.search(html):
        signals.append("no_checkout")
    phones = list(dict.fromkeys(PHONE.findall(html or "")))[:8]
    if phones:
        signals.append("phone_extracted")
    strong = any(s in STRONG for s in signals)
    return {"signals": signals, "strong": strong, "phones": phones}


async def check_page(page, url: str) -> dict[str, Any]:
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        html = await page.content()
        result = classify_html(html)
        result["enriched"] = True
        result["httpStatus"] = 200
        return result
    except Exception as exc:
        return {
            "signals": ["fetch_failed"],
            "strong": False,
            "phones": [],
            "enriched": False,
            "httpStatus": None,
            "error": str(exc)[:180],
        }
