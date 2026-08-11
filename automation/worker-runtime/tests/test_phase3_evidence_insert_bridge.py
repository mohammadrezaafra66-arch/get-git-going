from __future__ import annotations

import pytest

from config import RuntimeConfig
from phase3_evidence_insert_bridge import controlled_phase3_evidence_insert, validate_phase3_evidence_insert_row
from supabase_client import MockSupabaseClient, SupabaseClientWrapper


def test_controlled_phase3_insert_records_summary() -> None:
    store = SupabaseClientWrapper(config=RuntimeConfig(mode="mock"), mock_client=MockSupabaseClient())

    summary = controlled_phase3_evidence_insert(store=store, row=_row())

    assert summary["bridge_mode"] == "controlled_phase3_evidence_insert"
    assert summary["target_table"] == "automation_driver_outputs"
    assert summary["dry_run"] is False
    assert summary["phase_label"] == "PHASE-3"
    assert len(store.client.phase3_evidence_inserts) == 1


def test_phase3_insert_rejects_phase2_label() -> None:
    row = _row()
    row["phase_label"] = "PHASE-2"

    with pytest.raises(ValueError, match="PHASE-3"):
        validate_phase3_evidence_insert_row(row)


def test_phase3_insert_rejects_network_calls() -> None:
    row = _row()
    row["output"]["network_calls"] = 1

    with pytest.raises(ValueError, match="zero-network"):
        validate_phase3_evidence_insert_row(row)


def _row() -> dict[str, object]:
    return {
        "job_id": "job-1",
        "run_id": "run-1",
        "driver_name": "torob_limited_readonly",
        "job_type": "TOROB_LIMITED_READONLY",
        "status": "COMPLETED",
        "output": {
            "items_requested": 1,
            "items_completed": 1,
            "read_only_confirmed": True,
            "live_execution": False,
            "browser_automation": False,
            "network_calls": 0,
        },
        "checkpoint": {"network_calls": 0},
        "errors": [],
        "source_kind": "external_read_only",
        "phase_label": "PHASE-3",
        "created_at": "2026-06-15T00:00:00+00:00",
    }
