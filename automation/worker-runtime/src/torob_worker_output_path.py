from __future__ import annotations

from typing import Any

from drivers.base import DriverResult
from supabase_client import SupabaseClientWrapper
from torob_readonly_output_persistence import build_torob_readonly_output_row

TOROB_DRIVER_NAME = "torob_limited_readonly"
ITEM_KEYS_FOR_ROW = {
    "test_product_id",
    "product_name",
    "product_url",
    "seller_name",
    "price",
    "availability_status",
    "http_status",
    "final_url",
    "body_preview_length",
    "status",
    "error_code",
}


def persist_torob_driver_result(
    *,
    store: SupabaseClientWrapper,
    job_id: str,
    run_id: str | None,
    driver_result: DriverResult,
) -> dict[str, Any]:
    driver_result.validate()
    _validate_zero_network_payload(driver_result.output)
    output = _row_safe_output(driver_result.output)
    row = build_torob_readonly_output_row(
        job_id=job_id,
        run_id=run_id,
        status=driver_result.status,
        output=output,
        checkpoint=driver_result.checkpoint,
        errors=driver_result.errors,
    )
    return store.persist_torob_readonly_output(row)


def _row_safe_output(output: dict[str, Any]) -> dict[str, Any]:
    safe_output = dict(output)
    items = safe_output.get("normalized_items", [])
    if isinstance(items, list):
        safe_output["normalized_items"] = [
            {key: value for key, value in item.items() if key in ITEM_KEYS_FOR_ROW}
            if isinstance(item, dict)
            else item
            for item in items
        ]
    return safe_output


def _validate_zero_network_payload(output: dict[str, Any]) -> None:
    if output.get("driver_id") != TOROB_DRIVER_NAME:
        raise ValueError("driver_result.output.driver_id must be torob_limited_readonly")
    if output.get("live_execution") is not False:
        raise ValueError("worker output adapter accepts only non-live Torob evidence")
    if output.get("network_calls") != 0:
        raise ValueError("worker output adapter accepts only zero-network Torob evidence")
