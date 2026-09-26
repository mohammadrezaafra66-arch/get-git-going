"""Stripped TorobBot config — no mkdir, no SQLite, no reporter flags."""

from __future__ import annotations

import os

FIXED_USER_AGENT = os.environ.get("USER_AGENT", "").strip()
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
]
HUMAN_BEHAVIOR = os.environ.get("HUMAN_BEHAVIOR", "1") not in ("0", "false", "False")
PROXY_SERVER = os.environ.get("PROXY_SERVER", "").strip()
PROXY_USERNAME = os.environ.get("PROXY_USERNAME", "").strip()
PROXY_PASSWORD = os.environ.get("PROXY_PASSWORD", "").strip()
TOROB_CITY = os.environ.get("TOROB_CITY", "تهران")
NEARBY_KEYWORDS = ["تهران", "کرج", "اسلام‌شهر", "ارسال"]
PAGE_TIMEOUT_MS = int(os.environ.get("PAGE_TIMEOUT_MS", "60000"))
SEARCH_MAX_PRODUCTS = int(os.environ.get("SEARCH_MAX_PRODUCTS", "8"))
SEARCH_DELAY_MIN = float(os.environ.get("SEARCH_DELAY_MIN", "3"))
SEARCH_DELAY_MAX = float(os.environ.get("SEARCH_DELAY_MAX", "7"))
