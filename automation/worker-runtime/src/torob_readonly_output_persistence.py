"""Persistence-row builder for Phase 2 Torob read-only evidence outputs.

This module does not insert into a database and does not perform network calls.
It builds and validates rows that are safe to persist later into
`automation_driver_outputs` after the Phase 2 table compatibility migration is
approved and applied.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

DRIVER_NAME = "torob_limited_readonly"
JOB_TYPE = "TOROB_LIMITED_READONLY"
SOURCE_KIND = "external_read_only"
PHASE_LABEL = "PHASE-2"
ALLOWED_STATUSES = {"COMPLETED", "FAILED", "SKIPPED"}

ALLOWED_OUTPUT_KEYS = {
    "job_id",
    "run_id",
    "driver_id",
    "source",
    "mode",
    "items_requested",
    "items_completed",
    "read_only_confirmed",
    "live_execution",
    "browser_automation",
    "network_calls",
    "max_total_requests",
    "abort_reason",
    "retry_decision",
    "abort_evidence",
    "normalized_items",
}

ALLOWED_ITEM_KEYS = {
    "test_product_id",
    "product_name",
    "product_url",
    "seller_name",
    "price",
    "availability_status",
    "http_status",
    "final_url",
    "body_preview_length",
    "status",
    "error_code",
}

FORBIDDEN_KEY_FRAGMENTS = {
    "credential",
    "cookie",
    "session",
    "authorization",
    "token",
    "secret",
    "html_body",
    "full_html",
    "response_body",
    "full_response",
    "customer",
    "supplier_mutation",
    "writeback",
    "internal_product_id",
    "browser_fingerprint",
    "bypass",
}

SAFE_GUARDRAIL_KEYS = {
    "no_bypass",
    "no_login",
    "no_cookie",
    "no_browser_automation",
    "no_scheduler",
    "no_bulk_retry",
}

REQUIRED_ROW_KEYS = {
    "job_id",
    "run_id",
    "driver_name",
    "job_type",
    "status",
    "output",
    "checkpoint",
    "errors",
    "source_kind",
    "phase_label",
    "created_at",
    "persistence_gate",
    "table_migration_required",
}


def build_torob_readonly_output_row(
    *,
    job_id: str,
    run_id: str | None,
    status: str,
    output: dict[str, Any],
    checkpoint: dict[str, Any] | None,
    errors: list[str],
) -> dict[str, Any]:
    """Build a validated Phase 2 Torob evidence row without DB side effects."""

    _validate_ids(job_id=job_id, run_id=run_id)
    _validate_status(status)
    _validate_output_payload(output)
    _validate_checkpoint(checkpoint)
    _validate_errors(errors)

    row = {
        "job_id": job_id,
        "run_id": run_id,
        "driver_name": DRIVER_NAME,
        "job_type": JOB_TYPE,
        "status": status,
        "output": output,
        "checkpoint": checkpoint,
        "errors": errors,
        "source_kind": SOURCE_KIND,
        "phase_label": PHASE_LABEL,
        "created_at": _now(),
        "persistence_gate": "TPC-2-005",
        "table_migration_required": True,
    }
    return validate_torob_readonly_output_row(row)


def validate_torob_readonly_output_row(row: dict[str, Any]) -> dict[str, Any]:
    """Validate a built Torob evidence row and return a shallow copy."""

    if not isinstance(row, dict):
        raise TypeError("row must be a dict")
    missing = sorted(REQUIRED_ROW_KEYS - set(row))
    if missing:
        raise ValueError(f"Missing required row keys: {', '.join(missing)}")
    _validate_ids(job_id=row["job_id"], run_id=row["run_id"])
    if row["driver_name"] != DRIVER_NAME:
        raise ValueError("driver_name must be torob_limited_readonly")
    if row["job_type"] != JOB_TYPE:
        raise ValueError("job_type must be TOROB_LIMITED_READONLY")
    _validate_status(row["status"])
    _validate_output_payload(row["output"])
    _validate_checkpoint(row["checkpoint"])
    _validate_errors(row["errors"])
    if row["source_kind"] != SOURCE_KIND:
        raise ValueError("source_kind must be external_read_only")
    if row["phase_label"] != PHASE_LABEL:
        raise ValueError("phase_label must be PHASE-2")
    if row["persistence_gate"] != "TPC-2-005":
        raise ValueError("persistence_gate must be TPC-2-005")
    if row["table_migration_required"] is not True:
        raise ValueError("table_migration_required must remain true until the table allows PHASE-2")
    if not isinstance(row["created_at"], str) or not row["created_at"].strip():
        raise ValueError("created_at is required")
    return dict(row)


def _validate_ids(*, job_id: str, run_id: str | None) -> None:
    if not isinstance(job_id, str) or not job_id.strip():
        raise ValueError("job_id is required")
    if run_id is not None and (not isinstance(run_id, str) or not run_id.strip()):
        raise ValueError("run_id must be a non-empty string or None")


def _validate_status(status: str) -> None:
    if status not in ALLOWED_STATUSES:
        raise ValueError("Invalid output status")


def _validate_checkpoint(checkpoint: dict[str, Any] | None) -> None:
    if checkpoint is not None and not isinstance(checkpoint, dict):
        raise TypeError("checkpoint must be a dict or None")
    if checkpoint is not None:
        _reject_forbidden_keys(checkpoint)


def _validate_errors(errors: list[str]) -> None:
    if not isinstance(errors, list) or not all(isinstance(item, str) for item in errors):
        raise TypeError("errors must be a list of strings")


def _validate_output_payload(output: dict[str, Any]) -> None:
    if not isinstance(output, dict):
        raise TypeError("output must be a dict")
    unknown = sorted(set(output) - ALLOWED_OUTPUT_KEYS)
    if unknown:
        raise ValueError(f"Unexpected output payload keys: {', '.join(unknown)}")
    _reject_forbidden_keys(output)

    if output.get("driver_id") != DRIVER_NAME:
        raise ValueError("output.driver_id must be torob_limited_readonly")
    if output.get("source") != "torob":
        raise ValueError("output.source must be torob")
    if output.get("mode") != "read-only":
        raise ValueError("output.mode must be read-only")
    if output.get("read_only_confirmed") is not True:
        raise ValueError("read_only_confirmed must be true")
    if output.get("browser_automation") is not False:
        raise ValueError("browser_automation must be false")

    normalized_items = output.get("normalized_items", [])
    if not isinstance(normalized_items, list):
        raise TypeError("normalized_items must be a list")
    for index, item in enumerate(normalized_items):
        _validate_normalized_item(item, index)


def _validate_normalized_item(item: Any, index: int) -> None:
    if not isinstance(item, dict):
        raise TypeError(f"normalized_items[{index}] must be a dict")
    unknown = sorted(set(item) - ALLOWED_ITEM_KEYS)
    if unknown:
        raise ValueError(f"Unexpected normalized item keys: {', '.join(unknown)}")
    _reject_forbidden_keys(item)
    if not str(item.get("test_product_id", "")).strip():
        raise ValueError(f"normalized_items[{index}].test_product_id is required")
    if not str(item.get("product_name", "")).strip():
        raise ValueError(f"normalized_items[{index}].product_name is required")
    if not str(item.get("product_url", "")).strip():
        raise ValueError(f"normalized_items[{index}].product_url is required")


def _reject_forbidden_keys(value: Any) -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            lowered = str(key).lower()
            if lowered not in SAFE_GUARDRAIL_KEYS:
                for fragment in FORBIDDEN_KEY_FRAGMENTS:
                    if fragment in lowered:
                        raise ValueError(f"Forbidden payload key: {key}")
            _reject_forbidden_keys(nested)
    elif isinstance(value, list):
        for item in value:
            _reject_forbidden_keys(item)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
