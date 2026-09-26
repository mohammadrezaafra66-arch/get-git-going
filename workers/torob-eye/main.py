"""afrakala-lan-torob-eye — ported Torob read core + AfraKala writes."""

from __future__ import annotations

import asyncio
import os
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "ported"))

import antidetect  # noqa: E402
import scraper  # noqa: E402
import config  # noqa: E402

TEHRAN = ZoneInfo("Asia/Tehran")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BOT_KEY = os.environ.get("TOROB_EYE_BOT_KEY", "").strip()
APP_URL = os.environ.get("APP_INTERNAL_URL", "http://web:3000").rstrip("/")
STUB_BLOCK = os.environ.get("TOROB_EYE_STUB_BLOCK", "0") == "1"
OBS_TABLE_ID = os.environ.get(
    "TOROB_OBS_TABLE_ID", "da8639ad-d5d3-4166-94df-cdad9dc21d5f"
)


def headers() -> dict[str, str]:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def rest(path: str) -> str:
    return f"{SUPABASE_URL}/rest/v1/{path}"


def rpc(name: str) -> str:
    return f"{SUPABASE_URL}/rest/v1/rpc/{name}"


async def sb_get(client: httpx.AsyncClient, path: str, params: dict | None = None):
    r = await client.get(rest(path), headers=headers(), params=params, timeout=60)
    r.raise_for_status()
    return r.json()


async def sb_post(client: httpx.AsyncClient, path: str, body, prefer: str = "return=representation"):
    h = {**headers(), "Prefer": prefer}
    r = await client.post(rest(path), headers=h, json=body, timeout=60)
    r.raise_for_status()
    if r.content:
        return r.json()
    return None


async def sb_patch(client: httpx.AsyncClient, path: str, body, params: dict):
    r = await client.patch(rest(path), headers=headers(), params=params, json=body, timeout=60)
    r.raise_for_status()
    return r.json() if r.content else None


async def load_settings(client: httpx.AsyncClient) -> dict:
    rows = await sb_get(client, "torob_ops_settings", {"id": "eq.1", "select": "*"})
    return rows[0] if rows else {}


async def load_watch_products(client: httpx.AsyncClient) -> list[dict]:
    r = await client.post(
        rpc("query_dynamic_table_rows_v2"),
        headers=headers(),
        json={
            "p_table_id": OBS_TABLE_ID,
            "p_limit": 2000,
            "p_offset": 0,
            "p_show_inactive": False,
        },
        timeout=120,
    )
    if r.status_code >= 400:
        return []
    out = []
    for row in r.json() or []:
        values = row.get("out_values") or {}
        if values.get("is_watch_active") is not True:
            continue
        pid = values.get("afrakala_product_id")
        if not pid:
            continue
        prows = await sb_get(
            client,
            "products",
            {
                "id": f"eq.{pid}",
                "is_active": "eq.true",
                "select": "id,name,torob_url",
            },
        )
        if not prows:
            continue
        out.append(prows[0])
    return out


async def ensure_match(client: httpx.AsyncClient, product: dict) -> None:
    url = (product.get("torob_url") or "").strip()
    if not url:
        return
    existing = await sb_get(
        client,
        "market_product_matches",
        {
            "source_name": "eq.torob",
            "afrakala_product_id": f"eq.{product['id']}",
            "select": "id,match_status",
            "limit": "1",
        },
    )
    if existing:
        if existing[0].get("match_status") != "approved":
            await sb_patch(
                client,
                "market_product_matches",
                {"match_status": "approved", "matched_by": "bot"},
                {"id": f"eq.{existing[0]['id']}"},
            )
        return
    await sb_post(
        client,
        "market_product_matches",
        {
            "source_name": "torob",
            "source_title": product.get("name") or url,
            "source_product_url": url,
            "afrakala_product_id": product["id"],
            "match_status": "approved",
            "matched_by": "bot",
        },
    )


async def upsert_observatory(client: httpx.AsyncClient, product: dict, stats: dict) -> None:
    if not BOT_KEY:
        return
    await ensure_match(client, product)
    payload = {
        "unique_by": ["afrakala_product_id"],
        "source_match": {
            "source_name": "torob",
            "source_product_url": product.get("torob_url"),
            "source_product_id": product["id"],
        },
        "values": {
            "afrakala_product_id": product["id"],
            **stats,
        },
    }
    r = await client.post(
        f"{APP_URL}/api/public/bot/dynamic-tables/{OBS_TABLE_ID}/rows/upsert",
        headers={"Authorization": f"Bearer {BOT_KEY}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    if r.status_code >= 400:
        print(f"observatory upsert {r.status_code}: {r.text[:400]}", flush=True)


async def notify(client: httpx.AsyncClient, user_id: str | None, title: str, body: str, dedupe: str) -> None:
    if not user_id:
        return
    await client.post(
        rpc("notify_torob_eye"),
        headers=headers(),
        json={
            "p_user_id": user_id,
            "p_title": title,
            "p_body": body,
            "p_dedupe_key": dedupe,
        },
        timeout=30,
    )


def in_window(settings: dict, now: datetime) -> bool:
    start = int(settings.get("eye_window_start_hour") or 8)
    end = int(settings.get("eye_window_end_hour") or 22)
    return start <= now.hour < end


async def one_cycle(browser, client: httpx.AsyncClient, settings: dict) -> None:
    run = await sb_post(
        client,
        "torob_eye_runs",
        {"status": "running"},
    )
    run_id = run[0]["id"] if isinstance(run, list) else run["id"]
    products = await load_watch_products(client)
    attempted = succeeded = failed = skipped = 0
    skip_reasons = []
    block_events = []
    blocked_since = None

    context = await browser.new_context(
        user_agent=antidetect.pick_user_agent(),
        locale="fa-IR",
        timezone_id="Asia/Tehran",
        viewport={"width": 1366, "height": 850},
    )
    await context.add_init_script(antidetect.STEALTH_SCRIPT)
    page = await context.new_page()

    try:
        for product in products:
            attempted += 1
            url = (product.get("torob_url") or "").strip()
            if not url:
                skipped += 1
                skip_reasons.append({"product_id": product["id"], "reason": "empty_torob_url"})
                continue
            try:
                if STUB_BLOCK:
                    raise RuntimeError("forced_block_490")
                await page.goto(url, wait_until="domcontentloaded", timeout=config.PAGE_TIMEOUT_MS)
                await antidetect.warm_up(page)
                if await antidetect.looks_blocked(page):
                    raise RuntimeError("blocked_or_captcha")
                rows = await scraper.collect_prices(page, product.get("name") or "", print)
                if not rows:
                    failed += 1
                    skip_reasons.append({"product_id": product["id"], "reason": "no_sellers"})
                    continue
                own = await sb_get(client, "torob_ops_own_shops", {"is_active": "eq.true", "select": "shop_name,domain"})
                snapshots = []
                prices = []
                for row in rows:
                    price = row.get("price") or row.get("price_toman")
                    name = row.get("shop") or row.get("name") or row.get("seller")
                    if price is not None and not isinstance(price, int):
                        try:
                            price = int(price)
                        except (TypeError, ValueError):
                            price = None
                    is_own = False
                    for shop in own or []:
                        on = (shop.get("shop_name") or "").strip().lower()
                        if on and name and on in str(name).lower():
                            is_own = True
                    if isinstance(price, int) and price > 0:
                        prices.append(price)
                    snapshots.append(
                        {
                            "run_id": run_id,
                            "product_id": product["id"],
                            "torob_url": url,
                            "seller_name": name,
                            "seller_shop_id": row.get("prk") or row.get("id"),
                            "seller_shop_url": row.get("link") or row.get("url"),
                            "price_toman": price if isinstance(price, int) else None,
                            "availability": row.get("availability") or row.get("status"),
                            "is_own_shop": is_own,
                        }
                    )
                if snapshots:
                    await sb_post(client, "torob_offer_snapshots", snapshots)
                if prices:
                    await upsert_observatory(
                        client,
                        product,
                        {
                            "torob_min_price_toman": min(prices),
                            "torob_max_price_toman": max(prices),
                            "torob_avg_price_toman": int(sum(prices) / len(prices)),
                            "torob_seller_count": len(prices),
                            "torob_last_seen_at": datetime.now(timezone.utc).isoformat(),
                        },
                    )
                succeeded += 1
                blocked_since = None
            except Exception as exc:
                msg = str(exc)
                if "block" in msg.lower() or "490" in msg or "captcha" in msg.lower():
                    block_events.append({"at": datetime.now(timezone.utc).isoformat(), "detail": msg[:200]})
                    if blocked_since is None:
                        blocked_since = time.time()
                    hours = float(settings.get("eye_block_alert_hours") or 3)
                    if time.time() - blocked_since >= hours * 3600:
                        await notify(
                            client,
                            settings.get("eye_owner_user_id"),
                            "ترب بلاک شده است",
                            "خواندن ترب چند ساعت است مسدود مانده.",
                            "torob_eye_block",
                        )
                    wait = float(settings.get("eye_backoff_min_seconds") or 900)
                    await asyncio.sleep(min(wait, float(settings.get("eye_backoff_max_seconds") or 7200)))
                failed += 1
                skip_reasons.append({"product_id": product["id"], "reason": msg[:180]})
            delay_min = float(settings.get("eye_delay_min_seconds") or 30)
            delay_max = float(settings.get("eye_delay_max_seconds") or 60)
            await asyncio.sleep(random.uniform(delay_min, delay_max))
    finally:
        await context.close()

    status = "blocked" if block_events and succeeded == 0 else "completed"
    await sb_patch(
        client,
        "torob_eye_runs",
        {
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "products_attempted": attempted,
            "products_succeeded": succeeded,
            "products_failed": failed,
            "products_skipped": skipped,
            "skip_reasons": skip_reasons,
            "block_events": block_events,
        },
        {"id": f"eq.{run_id}"},
    )


async def scheduler() -> None:
    async with httpx.AsyncClient() as client, async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
        last_cycle = 0.0
        try:
            while True:
                settings = await load_settings(client)
                if not settings.get("eye_enabled", True):
                    await asyncio.sleep(30)
                    continue
                now = datetime.now(TEHRAN)
                if not in_window(settings, now):
                    await asyncio.sleep(60)
                    continue
                cycle_s = float(settings.get("eye_cycle_hours") or 4) * 3600
                if last_cycle and time.time() - last_cycle < cycle_s:
                    await asyncio.sleep(30)
                    continue
                await one_cycle(browser, client, settings)
                last_cycle = time.time()
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(scheduler())
