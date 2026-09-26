"""After an eye cycle: scan snapshots vs our price, notify, optional bait + queue."""

from __future__ import annotations

from typing import Any

import submit


def cheapest_non_own(snaps: list[dict[str, Any]]) -> dict[str, Any] | None:
    priced = [
        s
        for s in snaps
        if not s.get("is_own_shop")
        and isinstance(s.get("price_toman"), int)
        and s["price_toman"] > 0
    ]
    if not priced:
        return None
    return min(priced, key=lambda s: s["price_toman"])


def classify(our_price: int, their_price: int, bait_strong: bool, bait_failed: bool) -> str:
    undercut = ((our_price - their_price) / our_price) * 100
    if bait_strong:
        return "suspected_bait"
    if bait_failed or undercut >= 25:
        return "manual_review"
    return "cheaper_competitor"


def notify_dedupe_key(product_id: str, seller: str | None, price: int) -> str:
    return f"torob_eye_cheaper:{product_id}:{seller or '-'}:{price}"


def queue_guard(
    settings: dict, own_shop_count: int, reports_last_hour: int, recent_same: bool
) -> str | None:
    return submit.evaluate_guards(
        auto_report_enabled=bool(settings.get("auto_report_enabled")),
        kill_switch=bool(settings.get("kill_switch")),
        own_shop_count=own_shop_count,
        reports_last_hour=reports_last_hour,
        hourly_cap=int(settings.get("max_reports_per_hour") or 10),
        recent_same_report=recent_same,
    )


async def run_after_cycle(
    client,
    sb_get,
    sb_post,
    sb_patch,
    settings: dict,
    run_id: str | None,
) -> dict[str, Any]:
    snaps = await sb_get(
        client,
        "torob_offer_snapshots",
        {
            "select": "product_id,seller_name,seller_shop_url,seller_shop_id,price_toman,is_own_shop,torob_url,fetched_at,run_id",
            "order": "fetched_at.desc",
            "limit": "2000",
        },
    )
    by_product: dict[str, list[dict[str, Any]]] = {}
    for row in snaps or []:
        pid = row.get("product_id")
        if not pid:
            continue
        if run_id and row.get("run_id") != run_id:
            continue
        by_product.setdefault(pid, []).append(row)

    skip_reasons: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    product_ids = list(by_product.keys())

    our_map: dict[str, int] = {}
    if product_ids:
        prices = await sb_get(
            client,
            "product_computed_prices_public",
            {
                "select": "product_id,rounded_sale_price,computed_at",
                "product_id": f"in.({','.join(product_ids)})",
                "order": "computed_at.desc",
                "limit": "2000",
            },
        )
        for row in prices or []:
            pid = row.get("product_id")
            if pid and pid not in our_map:
                try:
                    our_map[pid] = int(row["rounded_sale_price"])
                except (TypeError, ValueError, KeyError):
                    continue

    products: dict[str, dict[str, Any]] = {}
    if product_ids:
        prows = await sb_get(
            client,
            "products",
            {"id": f"in.({','.join(product_ids)})", "select": "id,name,torob_url"},
        )
        for p in prows or []:
            products[p["id"]] = p

    run = await sb_post(
        client,
        "torob_ops_scan_runs",
        {"status": "running", "notes": "eye-cycle", "label_ids": []},
    )
    scan_id = run[0]["id"] if isinstance(run, list) else run["id"]

    for pid, rows in by_product.items():
        our = our_map.get(pid)
        if our is None or our <= 0:
            skip_reasons.append({"product_id": pid, "reason": "no_our_price"})
            continue
        cheap = cheapest_non_own(rows)
        if not cheap:
            skip_reasons.append({"product_id": pid, "reason": "no_non_own_snapshot"})
            continue
        their = cheap["price_toman"]
        if their >= our:
            skip_reasons.append(
                {"product_id": pid, "reason": "not_cheaper", "their": their, "our": our}
            )
            continue
        product = products.get(pid) or {}
        findings.append(
            {
                "scan_run_id": scan_id,
                "product_id": pid,
                "product_name_snapshot": product.get("name"),
                "torob_url": cheap.get("torob_url") or product.get("torob_url"),
                "seller_name": cheap.get("seller_name"),
                "seller_domain": None,
                "seller_offer_url": cheap.get("seller_shop_url"),
                "our_price_toman": our,
                "their_price_toman": their,
                "price_source": "extracted",
                "status": classify(our, their, False, False),
                "evidence": {
                    "source": "torob_offer_snapshots",
                    "eye_run_id": run_id,
                    "seller_shop_id": cheap.get("seller_shop_id"),
                },
            }
        )

    inserted = findings
    if findings:
        posted = await sb_post(client, "torob_ops_findings", findings)
        if posted:
            inserted = posted

    from datetime import datetime, timezone

    await sb_patch(
        client,
        "torob_ops_scan_runs",
        {
            "status": "completed",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "products_total": len(product_ids),
            "findings_total": len(findings),
            "skip_reasons": skip_reasons,
        },
        {"id": f"eq.{scan_id}"},
    )

    return {
        "scan_id": scan_id,
        "findings": inserted,
        "skip_reasons": skip_reasons,
        "products_total": len(product_ids),
    }
