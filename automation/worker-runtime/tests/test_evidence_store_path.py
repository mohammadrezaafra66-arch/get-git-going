from __future__ import annotations

import pytest

from config import RuntimeConfig
from evidence_store_path import dry_run_evidence_store_insert
from supabase_client import MockSupabaseClient, SupabaseClientWrapper
from torob_readonly_output_persistence import build_torob_readonly_output_row


def test_store_path_records_safe_dry_run_summary() -> None:
    mock_client = MockSupabaseClient()
    store = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock"), mock_client=mock_client)

    summary = dry_run_evidence_store_insert(store=store, row=_row(network_calls=0))

    assert summary["bridge_mode"] == "controlled_evidence_dry_run"
    assert summary["dry_run"] is True
    assert summary["target_table"] == "automation_driver_outputs"
    assert summary["phase_label"] == "PHASE-2"
    assert summary["network_calls"] == 0
    assert mock_client.evidence_dry_run_outputs == [summary]


def test_store_path_rejects_invalid_row_without_recording() -> None:
    mock_client = MockSupabaseClient()
    store = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock"), mock_client=mock_client)

    with pytest.raises(ValueError, match="zero-network"):
        dry_run_evidence_store_insert(store=store, row=_row(network_calls=1))

    assert not hasattr(mock_client, "evidence_dry_run_outputs")


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
