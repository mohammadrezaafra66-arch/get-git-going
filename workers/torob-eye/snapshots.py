"""Snapshot writes must surface REST errors and fail the run."""

from __future__ import annotations

from typing import Any


PG_INT_MAX = 2_147_483_647


class SnapshotWriteError(RuntimeError):
    pass


def raise_if_bad_response(status: int, body: str, path: str) -> None:
    if status >= 400:
        raise SnapshotWriteError(f"{path} {status}: {(body or '')[:400]}")


def finalize_run_status(
    *,
    insert_failed: bool,
    block_events: list,
    succeeded: int,
) -> str:
    if insert_failed:
        return "failed"
    if block_events and succeeded == 0:
        return "blocked"
    return "completed"


def sanitize_snapshot_row(row: dict[str, Any]) -> dict[str, Any]:
    price = row.get("price_toman")
    if isinstance(price, bool) or not isinstance(price, int):
        price = None
    out = {
        "run_id": row.get("run_id"),
        "product_id": row.get("product_id"),
        "torob_url": row.get("torob_url"),
        "seller_name": None if row.get("seller_name") is None else str(row.get("seller_name"))[:500],
        "seller_shop_id": None if row.get("seller_shop_id") is None else str(row.get("seller_shop_id"))[:200],
        "seller_shop_url": None if row.get("seller_shop_url") is None else str(row.get("seller_shop_url"))[:2000],
        "price_toman": price,
        "availability": None if row.get("availability") is None else str(row.get("availability"))[:80],
        "is_own_shop": bool(row.get("is_own_shop")),
        "excluded": bool(row.get("excluded")),
        "exclude_reason": None
        if row.get("exclude_reason") is None
        else str(row.get("exclude_reason"))[:80],
    }
    return out
