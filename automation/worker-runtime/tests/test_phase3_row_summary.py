from __future__ import annotations

import pytest

from phase3_row_summary import validate_phase3_row_summary


def test_row_summary_accepts_safe_summary() -> None:
    summary = _summary()

    assert validate_phase3_row_summary(summary) == summary


def test_row_summary_rejects_bad_phase_label() -> None:
    summary = _summary()
    summary["phase_label"] = "PHASE-2"

    with pytest.raises(ValueError, match="PHASE-3"):
        validate_phase3_row_summary(summary)


def test_row_summary_rejects_bad_target_table() -> None:
    summary = _summary()
    summary["target_table"] = "bad_table"

    with pytest.raises(ValueError, match="target_table"):
        validate_phase3_row_summary(summary)


def _summary() -> dict[str, object]:
    return {
        "summary_id": "TPC-3-011",
        "summary_mode": "phase3_row_summary",
        "step_id": "TPC-3-009",
        "target_table": "automation_driver_outputs",
        "phase_label": "PHASE-3",
        "source_kind": "internal_local_evidence",
        "job_id": "phase3-summary-job-1",
        "run_id": "phase3-summary-run-1",
        "status": "COMPLETED",
        "items_requested": 1,
        "items_completed": 1,
        "safe_summary": True,
    }
