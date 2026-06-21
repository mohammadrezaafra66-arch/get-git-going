from __future__ import annotations

import pytest

from phase3_resource_boundary import validate_phase3_resource_boundary


def test_resource_boundary_accepts_safe_summary() -> None:
    summary = _summary()

    assert validate_phase3_resource_boundary(summary=summary, errors=[]) == summary


def test_resource_boundary_rejects_too_many_fields() -> None:
    summary = _summary()
    for index in range(30):
        summary[f"extra_{index}"] = index

    with pytest.raises(ValueError, match="too many fields"):
        validate_phase3_resource_boundary(summary=summary)


def test_resource_boundary_rejects_bad_target() -> None:
    summary = _summary()
    summary["target_table"] = "bad_table"

    with pytest.raises(ValueError, match="target_table"):
        validate_phase3_resource_boundary(summary=summary)


def test_resource_boundary_rejects_bad_phase_label() -> None:
    summary = _summary()
    summary["phase_label"] = "PHASE-2"

    with pytest.raises(ValueError, match="PHASE-3"):
        validate_phase3_resource_boundary(summary=summary)


def test_resource_boundary_rejects_too_many_errors() -> None:
    with pytest.raises(ValueError, match="too many errors"):
        validate_phase3_resource_boundary(summary=_summary(), errors=["e"] * 6)


def test_resource_boundary_rejects_long_error_text() -> None:
    with pytest.raises(ValueError, match="too long"):
        validate_phase3_resource_boundary(summary=_summary(), errors=["x" * 301])


def _summary() -> dict[str, object]:
    return {
        "summary_id": "TPC-3-011",
        "summary_mode": "phase3_row_summary",
        "step_id": "TPC-3-009",
        "target_table": "automation_driver_outputs",
        "phase_label": "PHASE-3",
        "source_kind": "internal_local_evidence",
        "job_id": "job-1",
        "run_id": "run-1",
        "status": "COMPLETED",
        "items_requested": 1,
        "items_completed": 1,
        "safe_summary": True,
    }
