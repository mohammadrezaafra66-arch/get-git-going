from __future__ import annotations

from typing import Any

MAX_SUMMARY_FIELDS = 20
MAX_ERROR_ITEMS = 5
MAX_ERROR_LENGTH = 300
MAX_ID_LENGTH = 120


def validate_phase3_resource_boundary(*, summary: dict[str, Any], errors: list[str] | None = None) -> dict[str, Any]:
    if not isinstance(summary, dict):
        raise TypeError("summary must be a dict")
    if len(summary) > MAX_SUMMARY_FIELDS:
        raise ValueError("summary has too many fields")
    if summary.get("phase_label") != "PHASE-3":
        raise ValueError("phase_label must be PHASE-3")
    if summary.get("target_table") != "automation_driver_outputs":
        raise ValueError("target_table must be automation_driver_outputs")
    _validate_id(summary.get("job_id"), "job_id")
    _validate_id(summary.get("run_id"), "run_id")
    _validate_errors(errors or [])
    return dict(summary)


def _validate_id(value: Any, name: str) -> None:
    if value is None:
        return
    if not isinstance(value, str):
        raise TypeError(f"{name} must be a string or None")
    if len(value) > MAX_ID_LENGTH:
        raise ValueError(f"{name} is too long")


def _validate_errors(errors: list[str]) -> None:
    if not isinstance(errors, list):
        raise TypeError("errors must be a list")
    if len(errors) > MAX_ERROR_ITEMS:
        raise ValueError("too many errors")
    for item in errors:
        if not isinstance(item, str):
            raise TypeError("errors must be strings")
        if len(item) > MAX_ERROR_LENGTH:
            raise ValueError("error text is too long")
