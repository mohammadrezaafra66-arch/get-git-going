from __future__ import annotations

import pytest

from torob_readonly_output_persistence import build_torob_readonly_output_row, validate_torob_readonly_output_row


def test_build_completed_readonly_output_row() -> None:
    row = build_torob_readonly_output_row(
        job_id="job-1",
        run_id="run-1",
        status="COMPLETED",
        output=_completed_output(),
        checkpoint={"step": "done"},
        errors=[],
    )

    assert row["driver_name"] == "torob_limited_readonly"
    assert row["job_type"] == "TOROB_LIMITED_READONLY"
    assert row["status"] == "COMPLETED"
    assert row["source_kind"] == "external_read_only"
    assert row["phase_label"] == "PHASE-2"
    assert row["persistence_gate"] == "TPC-2-005"
    assert row["table_migration_required"] is True
    assert row["output"]["normalized_items"][0]["http_status"] == 200


def test_build_safe_abort_row_preserves_retry_decision() -> None:
    output = _completed_output()
    output["items_completed"] = 0
    output["abort_reason"] = "http_error_490"
    output["normalized_items"] = []
    output["retry_decision"] = {
        "retry_allowed_now": False,
        "reason": "http_error_490",
        "cooldown_seconds": 21600,
        "next_action": "pause_live_retries",
        "no_bypass": True,
    }
    output["abort_evidence"] = {
        "accepted_as_safe_abort": True,
        "abort_reason": "http_error_490",
        "retry_decision": output["retry_decision"],
    }

    row = build_torob_readonly_output_row(
        job_id="job-2",
        run_id="run-2",
        status="SKIPPED",
        output=output,
        checkpoint={"retry_decision": output["retry_decision"]},
        errors=["http_error_490"],
    )

    assert row["status"] == "SKIPPED"
    assert row["output"]["abort_reason"] == "http_error_490"
    assert row["output"]["retry_decision"]["retry_allowed_now"] is False
    assert row["output"]["retry_decision"]["next_action"] == "pause_live_retries"


def test_rejects_forbidden_secret_like_keys() -> None:
    output = _completed_output()
    output["normalized_items"][0]["cookie_value"] = "not allowed"

    with pytest.raises(ValueError, match="Unexpected normalized item keys"):
        build_torob_readonly_output_row(
            job_id="job-3",
            run_id="run-3",
            status="COMPLETED",
            output=output,
            checkpoint=None,
            errors=[],
        )


def test_rejects_business_writeback_fields() -> None:
    output = _completed_output()
    output["internal_product_id"] = "product-1"

    with pytest.raises(ValueError, match="Unexpected output payload keys"):
        build_torob_readonly_output_row(
            job_id="job-4",
            run_id="run-4",
            status="COMPLETED",
            output=output,
            checkpoint=None,
            errors=[],
        )


def test_rejects_phase_or_source_kind_mutation() -> None:
    row = build_torob_readonly_output_row(
        job_id="job-5",
        run_id="run-5",
        status="COMPLETED",
        output=_completed_output(),
        checkpoint=None,
        errors=[],
    )

    row["source_kind"] = "mock"
    with pytest.raises(ValueError, match="source_kind"):
        validate_torob_readonly_output_row(row)


def _completed_output() -> dict[str, object]:
    return {
        "job_id": "job-1",
        "run_id": "run-1",
        "driver_id": "torob_limited_readonly",
        "source": "torob",
        "mode": "read-only",
        "items_requested": 1,
        "items_completed": 1,
        "read_only_confirmed": True,
        "live_execution": True,
        "browser_automation": False,
        "network_calls": 1,
        "max_total_requests": 10,
        "abort_reason": None,
        "normalized_items": [
            {
                "test_product_id": "item-1",
                "product_name": "Example product",
                "product_url": "https://example.test/product",
                "seller_name": None,
                "price": None,
                "availability_status": "fetched_read_only",
                "http_status": 200,
                "final_url": "https://example.test/product",
                "body_preview_length": 1000,
                "status": "ok",
                "error_code": None,
            }
        ],
    }
