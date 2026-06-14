from __future__ import annotations

import pytest

from evidence_db_bridge import EvidenceDbBridge, build_safe_insert_summary, validate_evidence_db_row
from torob_readonly_output_persistence import build_torob_readonly_output_row


def test_dry_run_bridge_accepts_valid_row_and_returns_safe_summary() -> None:
    bridge = EvidenceDbBridge()

    summary = bridge.dry_run_insert(_row(network_calls=0))

    assert summary == {
        "bridge_mode": "controlled_evidence_dry_run",
        "dry_run": True,
        "target_table": "automation_driver_outputs",
        "job_id": "job-1",
        "run_id": "run-1",
        "driver_name": "torob_limited_readonly",
        "job_type": "TOROB_LIMITED_READONLY",
        "status": "COMPLETED",
        "source_kind": "external_read_only",
        "phase_label": "PHASE-2",
        "live_execution": False,
        "network_calls": 0,
        "browser_automation": False,
        "read_only_confirmed": True,
        "items_requested": 1,
        "items_completed": 1,
        "errors_count": 0,
    }
    assert bridge.dry_run_records == [summary]


def test_bridge_rejects_nonzero_network_row() -> None:
    with pytest.raises(ValueError, match="zero-network"):
        validate_evidence_db_row(_row(network_calls=1))


def test_bridge_rejects_live_row() -> None:
    row = _row(network_calls=0)
    row["output"]["live_execution"] = True

    with pytest.raises(ValueError, match="non-live"):
        validate_evidence_db_row(row)


def test_bridge_rejects_secret_like_key() -> None:
    row = _row(network_calls=0)
    row["output"]["token"] = "redacted-test-token"

    with pytest.raises(ValueError, match="forbidden key"):
        build_safe_insert_summary(row)


def test_bridge_rejects_business_writeback_like_key() -> None:
    row = _row(network_calls=0)
    row["output"]["price_update"] = {"product_id": "p1", "price": 1}

    with pytest.raises(ValueError, match="forbidden key"):
        build_safe_insert_summary(row)


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
