from __future__ import annotations

import pytest

from phase3_controlled_evidence_insert import build_phase3_local_evidence_row
from phase3_guarded_db_evidence_contract import (
    build_guarded_evidence_insert_plan,
    validate_guarded_evidence_insert_plan,
)


def test_guarded_plan_accepts_safe_phase3_evidence_row() -> None:
    plan = build_guarded_evidence_insert_plan(row=_row(), manual_invocation=True)
    plan_dict = plan.as_dict()

    assert plan_dict["contract_id"] == "TPC-3-007"
    assert plan_dict["plan_mode"] == "guarded_db_evidence_insert_plan"
    assert plan_dict["target_table"] == "automation_driver_outputs"
    assert plan_dict["manual_invocation_required"] is True
    assert plan_dict["single_row_only"] is True
    assert plan_dict["execution_allowed"] is False
    assert plan_dict["row"]["phase_label"] == "PHASE-3"


def test_guarded_plan_rejects_execution_flag() -> None:
    with pytest.raises(ValueError, match="does not allow database execution"):
        build_guarded_evidence_insert_plan(row=_row(), manual_invocation=True, allow_execution=True)


def test_guarded_plan_rejects_missing_manual_invocation() -> None:
    with pytest.raises(ValueError, match="manual_invocation"):
        build_guarded_evidence_insert_plan(row=_row(), manual_invocation=False)


def test_guarded_plan_rejects_bad_phase_label() -> None:
    row = _row()
    row["phase_label"] = "PHASE-2"

    with pytest.raises(ValueError, match="PHASE-3"):
        build_guarded_evidence_insert_plan(row=row, manual_invocation=True)


def test_guarded_plan_rejects_commercial_table_reference() -> None:
    row = _row()
    row["output"]["normalized_items"][0]["product_name"] = "customer table should not be here"

    with pytest.raises(ValueError, match="outside PHASE-3 evidence scope"):
        build_guarded_evidence_insert_plan(row=row, manual_invocation=True)


def test_validate_plan_rejects_execution_allowed_true() -> None:
    plan = build_guarded_evidence_insert_plan(row=_row(), manual_invocation=True).as_dict()
    plan["execution_allowed"] = True

    with pytest.raises(ValueError, match="execution_allowed"):
        validate_guarded_evidence_insert_plan(plan)


def _row() -> dict[str, object]:
    return build_phase3_local_evidence_row(
        job_id="phase3-contract-job-1",
        run_id="phase3-contract-run-1",
        status="COMPLETED",
        output={
            "job_id": "phase3-contract-job-1",
            "run_id": "phase3-contract-run-1",
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
                    "test_product_id": "phase3-contract-item-1",
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
