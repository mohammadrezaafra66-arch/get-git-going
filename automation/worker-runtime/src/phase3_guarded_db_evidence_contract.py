"""PHASE-3 guarded evidence insert contract.

This module builds a safe insert plan for `automation_driver_outputs`.
It intentionally does not open a database connection and does not execute the
plan. Execution is reserved for a later explicitly reviewed step.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from phase3_controlled_evidence_insert import TARGET_TABLE, validate_phase3_local_evidence_row

CONTRACT_ID = "TPC-3-007"
PLAN_MODE = "guarded_db_evidence_insert_plan"

FORBIDDEN_TABLE_FRAGMENTS = {
    "accounting",
    "customer",
    "invoice",
    "price",
    "product",
    "quote",
    "sales",
    "supplier",
}


@dataclass(frozen=True)
class GuardedEvidenceInsertPlan:
    contract_id: str
    plan_mode: str
    target_table: str
    manual_invocation_required: bool
    single_row_only: bool
    execution_allowed: bool
    row: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "contract_id": self.contract_id,
            "plan_mode": self.plan_mode,
            "target_table": self.target_table,
            "manual_invocation_required": self.manual_invocation_required,
            "single_row_only": self.single_row_only,
            "execution_allowed": self.execution_allowed,
            "row": self.row,
        }


def build_guarded_evidence_insert_plan(
    *,
    row: dict[str, Any],
    manual_invocation: bool,
    allow_execution: bool = False,
) -> GuardedEvidenceInsertPlan:
    """Build a non-executing plan for a future guarded evidence insert."""

    if allow_execution is not False:
        raise ValueError("TPC-3-007 does not allow database execution")
    if manual_invocation is not True:
        raise ValueError("manual_invocation must be true")

    safe_row = validate_phase3_local_evidence_row(row)
    _reject_commercial_table_references(safe_row)

    return GuardedEvidenceInsertPlan(
        contract_id=CONTRACT_ID,
        plan_mode=PLAN_MODE,
        target_table=TARGET_TABLE,
        manual_invocation_required=True,
        single_row_only=True,
        execution_allowed=False,
        row=safe_row,
    )


def validate_guarded_evidence_insert_plan(plan: GuardedEvidenceInsertPlan | dict[str, Any]) -> dict[str, Any]:
    """Validate a plan object and return its dictionary form."""

    plan_dict = plan.as_dict() if isinstance(plan, GuardedEvidenceInsertPlan) else dict(plan)

    if plan_dict.get("contract_id") != CONTRACT_ID:
        raise ValueError("contract_id must be TPC-3-007")
    if plan_dict.get("plan_mode") != PLAN_MODE:
        raise ValueError("plan_mode must be guarded_db_evidence_insert_plan")
    if plan_dict.get("target_table") != TARGET_TABLE:
        raise ValueError("target_table must be automation_driver_outputs")
    if plan_dict.get("manual_invocation_required") is not True:
        raise ValueError("manual invocation is required")
    if plan_dict.get("single_row_only") is not True:
        raise ValueError("single_row_only must be true")
    if plan_dict.get("execution_allowed") is not False:
        raise ValueError("execution_allowed must be false in TPC-3-007")

    safe_row = validate_phase3_local_evidence_row(plan_dict.get("row"))
    _reject_commercial_table_references(safe_row)

    return {**plan_dict, "row": safe_row}


def _reject_commercial_table_references(value: Any, *, path: str = "row") -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            _reject_key_text(str(key), path=f"{path}.{key}")
            if isinstance(nested, str):
                _reject_key_text(nested, path=f"{path}.{key}")
            _reject_commercial_table_references(nested, path=f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _reject_commercial_table_references(item, path=f"{path}[{index}]")
    elif isinstance(value, str):
        _reject_key_text(value, path=path)


def _reject_key_text(text: str, *, path: str) -> None:
    lowered = text.strip().lower()
    for fragment in FORBIDDEN_TABLE_FRAGMENTS:
        if fragment in lowered:
            raise ValueError(f"commercial table reference is outside PHASE-3 evidence scope: {path}")
