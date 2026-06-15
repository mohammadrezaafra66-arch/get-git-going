from __future__ import annotations

import pytest

from config import RuntimeConfig
from phase3_controlled_evidence_insert import (
    build_phase3_local_evidence_row,
    insert_phase3_local_evidence,
    validate_phase3_local_evidence_row,
)
from supabase_client import MockSupabaseClient, SupabaseClientWrapper


def test_phase3_local_evidence_insert_records_safe_row() -> None:
    mock_client = MockSupabaseClient()
    store = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock"), mock_client=mock_client)

    row = _row()
    inserted = insert_phase3_local_evidence(store=store, row=row)

    assert inserted["bridge_mode"] == "controlled_local_evidence_insert"
    assert inserted["local_only"] is True
    assert inserted["target_table"] == "automation_driver_outputs"
    assert inserted["phase_label"] == "PHASE-3"
    assert inserted["source_kind"] == "internal_local_evidence"
    assert inserted["output"]["live_execution"] is False
    assert inserted["output"]["network_calls"] == 0
    assert inserted["output"]["browser_automation"] is False
    assert mock_client.phase3_local_evidence_inserts == [inserted]


def test_phase3_local_evidence_insert_rejects_network_calls_without_recording() -> None:
    mock_client = MockSupabaseClient()
    store = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock"), mock_client=mock_client)
    row = _row()
    row["output"]["network_calls"] = 1

    with pytest.raises(ValueError, match="zero-network"):
        insert_phase3_local_evidence(store=store, row=row)

    assert not hasattr(mock_client, "phase3_local_evidence_inserts")


def test_phase3_local_evidence_insert_rejects_live_execution() -> None:
    row = _row()
    row["output"]["live_execution"] = True

    with pytest.raises(ValueError, match="non-live"):
        validate_phase3_local_evidence_row(row)


def test_phase3_local_evidence_insert_rejects_business_writeback_key() -> None:
    row = _row()
    row["output"]["price_update"] = {"product_id": "p1", "price": 1}

    with pytest.raises(ValueError, match="Unexpected PHASE-3 output payload keys"):
        validate_phase3_local_evidence_row(row)


def test_phase3_local_evidence_insert_rejects_secret_like_nested_key() -> None:
    row = _row()
    row["checkpoint"] = {"safe_progress": 100, "token": "redacted-test-token"}

    with pytest.raises(ValueError, match="forbidden key"):
        validate_phase3_local_evidence_row(row)


def _row() -> dict[str, object]:
    return build_phase3_local_evidence_row(
        job_id="phase3-job-1",
        run_id="phase3-run-1",
        status="COMPLETED",
        output={
            "job_id": "phase3-job-1",
            "run_id": "phase3-run-1",
            "source": "local",
            "mode": "controlled-local-evidence",
            "target_table": "automation_driver_outputs",
            "items_requested": 1,
            "items_completed": 1,
            "read_only_confirmed": True,
            "live_execution": False,
            "browser_automation": False,
            "network_calls": 0,
            "local_insert_only": True,
            "abort_reason": None,
            "normalized_items": [
                {
                    "test_product_id": "phase3-item-1",
                    "product_name": "Example local evidence product",
                    "product_url": "local-evidence-product",
                    "availability_status": "deterministic_local",
                    "status": "ok",
                    "error_code": None,
                }
            ],
        },
        checkpoint={"progress": 100, "network_calls": 0},
        errors=[],
    )
