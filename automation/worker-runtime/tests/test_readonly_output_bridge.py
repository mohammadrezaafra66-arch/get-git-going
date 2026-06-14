from __future__ import annotations

import pytest

from readonly_output_bridge import ReadonlyOutputBridge, validate_bridge_row
from torob_readonly_output_persistence import build_torob_readonly_output_row


def test_bridge_accepts_valid_zero_network_row() -> None:
    bridge = ReadonlyOutputBridge()

    record = bridge.write(_row(network_calls=0))

    assert record["bridge_mode"] == "controlled_mock_verified"
    assert record["target_table"] == "automation_driver_outputs"
    assert record["driver_name"] == "torob_limited_readonly"
    assert record["job_type"] == "TOROB_LIMITED_READONLY"
    assert record["source_kind"] == "external_read_only"
    assert record["phase_label"] == "PHASE-2"
    assert record["live_execution"] is False
    assert record["network_calls"] == 0
    assert len(bridge.records) == 1


def test_bridge_rejects_nonzero_network_count() -> None:
    with pytest.raises(ValueError, match="zero-network"):
        validate_bridge_row(_row(network_calls=1))


def test_bridge_rejects_wrong_source_kind() -> None:
    row = _row(network_calls=0)
    row["source_kind"] = "mock"

    with pytest.raises(ValueError, match="source_kind"):
        validate_bridge_row(row)


def _row(*, network_calls: int) -> dict[str, object]:
    return build_torob_readonly_output_row(
        job_id="job-1",
        run_id="run-1",
        status="COMPLETED",
        output={
            "job_id": "job-1",
            "run_id": "run-1",
            "driver_id": "torob_limited_readonly",
            "source": "torob",
            "mode": "read-only",
            "items_requested": 1,
            "items_completed": 1,
            "read_only_confirmed": True,
            "live_execution": False,
            "browser_automation": False,
            "network_calls": network_calls,
            "max_total_requests": 10,
            "abort_reason": None,
            "normalized_items": [
                {
                    "test_product_id": "item-1",
                    "product_name": "Example product",
                    "product_url": "local-test-product",
                    "seller_name": None,
                    "price": None,
                    "availability_status": "deterministic_local",
                    "http_status": None,
                    "final_url": "local-test-product",
                    "body_preview_length": 0,
                    "status": "ok",
                    "error_code": None,
                }
            ],
        },
        checkpoint={"progress": 100, "network_calls": network_calls},
        errors=[],
    )
