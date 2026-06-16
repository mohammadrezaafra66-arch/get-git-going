from __future__ import annotations

from typing import Any

from phase3_single_row_evidence_step import validate_single_row_evidence_step

SUMMARY_ID = "TPC-3-011"
SUMMARY_MODE = "phase3_row_summary"


def build_phase3_row_summary(step: dict[str, Any]) -> dict[str, Any]:
    safe_step = validate_single_row_evidence_step(step)
    plan = safe_step["plan"]
    row = plan["row"]
    output = row["output"]
    return validate_phase3_row_summary(
        {
            "summary_id": SUMMARY_ID,
            "summary_mode": SUMMARY_MODE,
            "step_id": safe_step["step_id"],
            "target_table": plan["target_table"],
            "phase_label": row["phase_label"],
            "source_kind": row["source_kind"],
            "job_id": row["job_id"],
            "run_id": row["run_id"],
            "status": row["status"],
            "items_requested": output.get("items_requested"),
            "items_completed": output.get("items_completed"),
            "safe_summary": True,
        }
    )


def validate_phase3_row_summary(summary: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(summary, dict):
        raise TypeError("summary must be a dict")
    if summary.get("summary_id") != SUMMARY_ID:
        raise ValueError("summary_id must be TPC-3-011")
    if summary.get("summary_mode") != SUMMARY_MODE:
        raise ValueError("summary_mode must be phase3_row_summary")
    if summary.get("target_table") != "automation_driver_outputs":
        raise ValueError("target_table must be automation_driver_outputs")
    if summary.get("phase_label") != "PHASE-3":
        raise ValueError("phase_label must be PHASE-3")
    if summary.get("safe_summary") is not True:
        raise ValueError("safe_summary must be true")
    return dict(summary)
