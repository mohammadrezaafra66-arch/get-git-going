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
import search  # noqa: E402
import bait  # noqa: E402
import findings  # noqa: E402
import link_discovery  # noqa: E402
import submit  # noqa: E402

TEHRAN = ZoneInfo("Asia/Tehran")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BOT_KEY = os.environ.get("TOROB_EYE_BOT_KEY", "").strip()
APP_URL = os.environ.get("APP_INTERNAL_URL", "http://web:3000").rstrip("/")
STUB_BLOCK = os.environ.get("TOROB_EYE_STUB_BLOCK", "0") == "1"
SIMULATE_SUBMIT = os.environ.get("TOROB_OPS_SIMULATE_SUBMIT", "1") == "1"
REPORT_STUB_URL = os.environ.get(
    "TOROB_EYE_REPORT_STUB_URL", f"{APP_URL}/torob-eye/stub-report.html"
)
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


def _watch_on(value) -> bool:
    return value is True or value == 1 or str(value).lower() in {"true", "t", "1"}


async def load_watch_products(client: httpx.AsyncClient) -> list[dict]:
    tables = await sb_get(
        client,
        "dynamic_tables",
        {"slug": "eq.afrakala-product-price-observatory", "select": "id", "limit": "1"},
    )
    table_id = (tables[0]["id"] if tables else OBS_TABLE_ID)
    cols = await sb_get(
        client,
        "dynamic_table_columns",
        {
            "table_id": f"eq.{table_id}",
            "column_key": "in.(is_watch_active,afrakala_product_id)",
            "select": "id,column_key",
        },
    )
    watch_col = next((c["id"] for c in cols if c.get("column_key") == "is_watch_active"), None)
    pid_col = next((c["id"] for c in cols if c.get("column_key") == "afrakala_product_id"), None)
    pids: list[str] = []
    if watch_col and pid_col:
        watch_cells = await sb_get(
            client,
            "dynamic_table_cells",
            {
                "column_id": f"eq.{watch_col}",
                "value_boolean": "eq.true",
                "select": "row_id",
                "limit": "2000",
            },
        )
        row_ids = [c["row_id"] for c in watch_cells or [] if c.get("row_id")]
        if row_ids:
            quoted = ",".join(f'"{x}"' for x in row_ids)
            try:
                pid_cells = await sb_get(
                    client,
                    "dynamic_table_cells",
                    {
                        "column_id": f"eq.{pid_col}",
                        "row_id": f"in.({quoted})",
                        "select": "row_id,value_text",
                        "limit": "2000",
                    },
                )
            except Exception as exc:
                print(f"watch pid cells failed: {exc}", flush=True)
                pid_cells = []
            for cell in pid_cells or []:
                pid = cell.get("value_text")
                if pid:
                    pids.append(str(pid).strip())
    if not pids:
        r = await client.post(
            rpc("query_dynamic_table_rows_v2"),
            headers=headers(),
            json={
                "p_table_id": table_id,
                "p_limit": 2000,
                "p_offset": 0,
                "p_show_inactive": False,
            },
            timeout=120,
        )
        if r.status_code >= 400:
            print(f"watch rpc {r.status_code}: {r.text[:300]}", flush=True)
        else:
            for row in r.json() or []:
                values = row.get("out_values") or {}
                if not _watch_on(values.get("is_watch_active")):
                    continue
                pid = values.get("afrakala_product_id")
                if pid:
                    pids.append(str(pid).strip())
    out = []
    seen = set()
    for pid in pids:
        if pid in seen:
            continue
        seen.add(pid)
        prows = await sb_get(
            client,
            "products",
            {"id": f"eq.{pid}", "is_active": "eq.true", "select": "id,name,torob_url"},
        )
        if prows:
            out.append(prows[0])
    print(f"watch products loaded={len(out)}", flush=True)
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
    print(f"eye cycle start {run_id}", flush=True)
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
                continue  # no Torob request → no crawl delay
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
        if settings.get("eye_link_discovery_enabled", True):
            await discover_links(page, client, products, settings)
        scan = None
        try:
            scan = await findings.run_after_cycle(
                client, sb_get, sb_post, sb_patch, settings, run_id
            )
            print(
                f"eye scan {scan['scan_id']} findings={len(scan['findings'])} skips={len(scan['skip_reasons'])}",
                flush=True,
            )
            owner = settings.get("eye_owner_user_id")
            for finding in scan["findings"]:
                await notify(
                    client,
                    owner,
                    "رقیب ارزان‌تر از ما",
                    f"{finding.get('product_name_snapshot')}: {finding.get('seller_name')} {finding.get('their_price_toman')}",
                    findings.notify_dedupe_key(
                        finding["product_id"],
                        finding.get("seller_name"),
                        int(finding["their_price_toman"]),
                    ),
                )
            cap = int(settings.get("eye_bait_page_cap") or 2)
            used = 0
            for finding in scan["findings"]:
                if used >= cap:
                    break
                bait_url = finding.get("seller_offer_url") or finding.get("torob_url")
                if not bait_url:
                    continue
                bait_result = await bait.check_page(page, bait_url)
                used += 1
                finding["evidence"] = {**(finding.get("evidence") or {}), "bait": bait_result}
                if finding.get("id"):
                    await sb_patch(
                        client,
                        "torob_ops_findings",
                        {
                            "evidence": finding["evidence"],
                            "status": findings.classify(
                                int(finding["our_price_toman"]),
                                int(finding["their_price_toman"]),
                                bool(bait_result.get("strong")),
                                "fetch_failed" in (bait_result.get("signals") or []),
                            ),
                        },
                        {"id": f"eq.{finding['id']}"},
                    )
        except Exception as exc:
            print(f"after-cycle scan failed: {exc}", flush=True)
        await process_report_queue(page, context, client, settings)
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
    print(
        f"eye cycle done {run_id} attempted={attempted} ok={succeeded} skip={skipped} fail={failed}",
        flush=True,
    )


async def discover_links(page, client: httpx.AsyncClient, products: list[dict], settings: dict) -> None:
    empty = [p for p in products if not (p.get("torob_url") or "").strip()]
    if not empty:
        return
    delay_min = float(settings.get("eye_delay_min_seconds") or 30)
    delay_max = float(settings.get("eye_delay_max_seconds") or 60)
    for product in empty:
        try:
            hits = await search.search_products(page, product.get("name") or "", print, limit=8)
        except Exception as exc:
            await sb_post(
                client,
                "torob_link_assignments",
                {
                    "product_id": product["id"],
                    "url": None,
                    "score": 0,
                    "reasons": ["search_failed", str(exc)[:120]],
                    "assigned": False,
                },
            )
            continue
        result = link_discovery.pick_assignment(product, hits)
        rows = list(result["rejected"])
        if result["chosen"]:
            rows.append(result["chosen"])
        for row in rows:
            await sb_post(
                client,
                "torob_link_assignments",
                {
                    "product_id": product["id"],
                    "url": row.get("url"),
                    "score": row.get("score"),
                    "reasons": row.get("reasons") or [],
                    "assigned": bool(row.get("assigned")),
                },
            )
        chosen = result["chosen"]
        if chosen and chosen.get("assigned") and chosen.get("url"):
            current = await sb_get(
                client,
                "products",
                {"id": f"eq.{product['id']}", "select": "id,torob_url"},
            )
            if current and not (current[0].get("torob_url") or "").strip():
                await sb_patch(
                    client,
                    "products",
                    {"torob_url": chosen["url"]},
                    {"id": f"eq.{product['id']}"},
                )
                product["torob_url"] = chosen["url"]
        await asyncio.sleep(random.uniform(delay_min, delay_max))


async def process_report_queue(page, context, client: httpx.AsyncClient, settings: dict) -> None:
    own = await sb_get(client, "torob_ops_own_shops", {"is_active": "eq.true", "select": "id"})
    queued = await sb_get(
        client,
        "torob_ops_findings",
        {
            "status": "eq.queued_for_report",
            "select": "id,product_id,seller_name,seller_domain,torob_url,product_name_snapshot,our_price_toman,their_price_toman,evidence",
            "order": "created_at.asc",
            "limit": str(min(10, int(settings.get("max_reports_per_hour") or 10))),
        },
    )
    logs = await sb_get(
        client,
        "torob_ops_report_logs",
        {"select": "id,created_at", "created_at": "gte." + _hour_ago(), "limit": "50"},
    )
    templates = await sb_get(
        client,
        "torob_ops_report_templates",
        {"is_active": "eq.true", "is_default": "eq.true", "select": "body", "limit": "1"},
    )
    body = (templates[0]["body"] if templates else "") or "{{product_name}} {{torob_url}}"
    for finding in queued or []:
        recent_same = False
        if finding.get("product_id") and finding.get("seller_domain"):
            since_h = int(settings.get("dedupe_window_hours") or 72)
            dupes = await sb_get(
                client,
                "torob_ops_findings",
                {
                    "product_id": f"eq.{finding['product_id']}",
                    "seller_domain": f"eq.{finding['seller_domain']}",
                    "status": "in.(queued_for_report,reporting,reported)",
                    "id": f"neq.{finding['id']}",
                    "select": "id",
                    "limit": "1",
                },
            )
            recent_same = bool(dupes)
        blocked = findings.queue_guard(settings, len(own or []), len(logs or []), recent_same)
        if blocked:
            print(f"report skip {finding['id']}: {blocked}", flush=True)
            if blocked == "kill_switch":
                break
            continue
        await sb_patch(
            client,
            "torob_ops_findings",
            {"status": "reporting"},
            {"id": f"eq.{finding['id']}"},
        )
        text = submit.apply_template(
            body,
            {
                "product_name": finding.get("product_name_snapshot"),
                "torob_url": finding.get("torob_url"),
                "our_price": finding.get("our_price_toman"),
                "their_price": finding.get("their_price_toman"),
                "seller_domain": finding.get("seller_domain"),
            },
        )
        stub = REPORT_STUB_URL if SIMULATE_SUBMIT else (finding.get("torob_url") or REPORT_STUB_URL)
        try:
            result = await submit.run_report_flow(
                page, report_url=stub, report_text=text, simulate=SIMULATE_SUBMIT
            )
            ok = True
            detail = f"steps={result['steps']}; skipped={result['skipped']}; submitted={result['submitted']}"
        except Exception as exc:
            ok = False
            detail = str(exc)[:240]
        await sb_post(
            client,
            "torob_ops_report_logs",
            {
                "finding_id": finding["id"],
                "report_text": text,
                "result": "submitted" if ok else "failed",
                "notes": detail,
                "mode": "auto",
            },
        )
        await sb_patch(
            client,
            "torob_ops_findings",
            {"status": "reported" if ok else "report_failed"},
            {"id": f"eq.{finding['id']}"},
        )


def _hour_ago() -> str:
    from datetime import timedelta

    return (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()


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
                try:
                    await one_cycle(browser, client, settings)
                except Exception as exc:
                    print(f"eye cycle crashed: {exc}", flush=True)
                last_cycle = time.time()
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(scheduler())
