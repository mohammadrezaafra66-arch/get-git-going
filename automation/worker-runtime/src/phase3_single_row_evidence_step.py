from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from phase3_guarded_db_evidence_contract import build_guarded_evidence_insert_plan, validate_guarded_evidence_insert_plan

STEP_ID = "TPC-3-009"
STEP_MODE = "manual_single_row_evidence_step"


@dataclass(frozen=True)
class SingleRowEvidenceStep:
    step_id: str
    step_mode: str
    plan: dict[str, Any]
    ready_for_review: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "step_id": self.step_id,
            "step_mode": self.step_mode,
            "plan": self.plan,
            "ready_for_review": self.ready_for_review,
        }


def build_single_row_evidence_step(*, row: dict[str, Any], manual_invocation: bool) -> SingleRowEvidenceStep:
    if not isinstance(row, dict):
        raise TypeError("row must be a single dict")
    if manual_invocation is not True:
        raise ValueError("manual_invocation must be true")

    plan = build_guarded_evidence_insert_plan(row=row, manual_invocation=True).as_dict()
    validated_plan = validate_guarded_evidence_insert_plan(plan)

    return SingleRowEvidenceStep(
        step_id=STEP_ID,
        step_mode=STEP_MODE,
        plan=validated_plan,
        ready_for_review=True,
    )


def validate_single_row_evidence_step(step: SingleRowEvidenceStep | dict[str, Any]) -> dict[str, Any]:
    step_dict = step.as_dict() if isinstance(step, SingleRowEvidenceStep) else dict(step)

    if step_dict.get("step_id") != STEP_ID:
        raise ValueError("step_id must be TPC-3-009")
    if step_dict.get("step_mode") != STEP_MODE:
        raise ValueError("step_mode must be manual_single_row_evidence_step")
    if step_dict.get("ready_for_review") is not True:
        raise ValueError("ready_for_review must be true")

    plan = validate_guarded_evidence_insert_plan(step_dict.get("plan"))
    return {**step_dict, "plan": plan}
