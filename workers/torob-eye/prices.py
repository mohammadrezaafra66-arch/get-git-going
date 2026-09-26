"""Torob prices are تومان. Flag outliers so aggregates never see them."""

from __future__ import annotations

from typing import Any

# Repeated digits / dummy / the old parser ceiling that overflowed integer.
PLACEHOLDER_PRICES = {
    1,
    11,
    111,
    1111,
    11111,
    111111,
    1111111,
    11111111,
    111111111,
    1111111111,
    123456789,
    1234567890,
    999999999,
    9999999999,
    50_000_000_000,
}

LOW_MULT = 0.3
HIGH_MULT = 3.0


def median_int(values: list[int]) -> int | None:
    nums = sorted(int(v) for v in values if isinstance(v, int))
    if not nums:
        return None
    mid = len(nums) // 2
    if len(nums) % 2:
        return nums[mid]
    return (nums[mid - 1] + nums[mid]) // 2


def classify_price(
    price: int | None,
    median_price: int | None,
    *,
    low: float = LOW_MULT,
    high: float = HIGH_MULT,
) -> tuple[bool, str | None]:
    if price is None or isinstance(price, bool) or not isinstance(price, int) or price <= 0:
        return True, "non_positive"
    if price in PLACEHOLDER_PRICES:
        return True, "placeholder"
    if median_price and median_price > 0:
        if price < median_price * low:
            return True, "below_median_band"
        if price > median_price * high:
            return True, "above_median_band"
    return False, None


def _seed_prices(rows: list[dict[str, Any]]) -> list[int]:
    seeds: list[int] = []
    for row in rows:
        price = row.get("price_toman")
        if not isinstance(price, int) or isinstance(price, bool) or price <= 0:
            continue
        if price in PLACEHOLDER_PRICES:
            continue
        seeds.append(price)
    return seeds


def annotate_snapshots(
    rows: list[dict[str, Any]],
    *,
    low: float = LOW_MULT,
    high: float = HIGH_MULT,
) -> list[dict[str, Any]]:
    median = median_int(_seed_prices(rows))
    out: list[dict[str, Any]] = []
    for row in rows:
        copy = dict(row)
        excluded, reason = classify_price(copy.get("price_toman"), median, low=low, high=high)
        copy["excluded"] = excluded
        copy["exclude_reason"] = reason
        out.append(copy)
    return out


def observatory_stats(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    prices = [
        int(r["price_toman"])
        for r in rows
        if not r.get("excluded")
        and isinstance(r.get("price_toman"), int)
        and not isinstance(r.get("price_toman"), bool)
        and r["price_toman"] > 0
    ]
    if not prices:
        return None
    return {
        "torob_min_price_toman": min(prices),
        "torob_max_price_toman": max(prices),
        "torob_avg_price_toman": int(sum(prices) / len(prices)),
        "torob_seller_count": len(prices),
    }
