from __future__ import annotations

import pytest

from phase3_controlled_evidence_insert import build_phase3_local_evidence_row
from phase3_single_row_evidence_step import build_single_row_evidence_step, validate_single_row_evidence_step


def test_single_row_step_accepts_safe_row() -> None:
    step = build_single_row_evidence_step(row=_row(), manual_invocation=True).as_dict()

    assert step["step_id"] == "TPC-3-009"
    assert step["step_mode"] == "manual_single_row_evidence_step"
    assert step["ready_for_review"] is True
    assert step["plan"]["single_row_only"] is True
    assert step["plan"]["execution_allowed"] is False
    assert step["plan"]["row"]["phase_label"] == "PHASE-3"


def test_single_row_step_rejects_bulk_input() -> None:
    with pytest.raises(TypeError, match="single dict"):
        build_single_row_evidence_step(row=[_row()], manual_invocation=True)  # type: ignore[arg-type]


def test_single_row_step_rejects_non_manual_call() -> None:
    with pytest.raises(ValueError, match="manual_invocation"):
        build_single_row_evidence_step(row=_row(), manual_invocation=False)


def test_single_row_step_rejects_mutated_step_state() -> None:
    step = build_single_row_evidence_step(row=_row(), manual_invocation=True).as_dict()
    step["ready_for_review"] = False

    with pytest.raises(ValueError, match="ready_for_review"):
        validate_single_row_evidence_step(step)


def _row() -> dict[str, object]:
    return build_phase3_local_evidence_row(
        job_id="phase3-single-row-job-1",
        run_id="phase3-single-row-run-1",
        status="COMPLETED",
        output={
            "job_id": "phase3-single-row-job-1",
            "run_id": "phase3-single-row-run-1",
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
                    "test_product_id": "phase3-single-row-item-1",
                    "product_name": "Example local evidence item",
                    "product_url": "local-evidence-item",
                    "availability_status": "deterministic_local",
                    "status": "ok",
                    "error_code": None,
                }
            ],
        },
        checkpoint={"progress": 100, "network_calls": 0},
        errors=[],
    )
