"""Controlled PHASE-3 local evidence insert bridge.

This module is intentionally local/mock-only. It validates a PHASE-3
`automation_driver_outputs` evidence row and appends it to the mock Supabase
client for deterministic tests. It does not connect to Supabase, does not run a
scheduler, does not call external sources, and does not write business tables.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

TARGET_TABLE = "automation_driver_outputs"
BRIDGE_MODE = "controlled_local_evidence_insert"
DRIVER_NAME = "phase3_controlled_local_evidence"
JOB_TYPE = "PHASE3_CONTROLLED_LOCAL_EVIDENCE_INSERT"
SOURCE_KIND = "internal_local_evidence"
PHASE_LABEL = "PHASE-3"
EVIDENCE_GATE = "TPC-3-005"

ALLOWED_STATUSES = {"COMPLETED", "FAILED", "SKIPPED"}

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
    "evidence_gate",
    "db_migration_applied",
}

ALLOWED_OUTPUT_KEYS = {
    "job_id",
    "run_id",
    "source",
    "mode",
    "target_table",
    "items_requested",
    "items_completed",
    "read_only_confirmed",
    "live_execution",
    "browser_automation",
    "network_calls",
    "local_insert_only",
    "abort_reason",
    "normalized_items",
}

ALLOWED_ITEM_KEYS = {
    "test_product_id",
    "product_name",
    "product_url",
    "availability_status",
    "status",
    "error_code",
}

FORBIDDEN_KEY_FRAGMENTS = {
    "api_key",
    "authorization",
    "connection_string",
    "cookie",
    "credential",
    "customer",
    "html_body",
    "internal_product_id",
    "password",
    "price_update",
    "product_update",
    "sales_list_update",
    "secret",
    "service_role",
    "session",
    "supplier_update",
    "token",
    "writeback",
}


def build_phase3_local_evidence_row(
    *,
    job_id: str,
    run_id: str | None,
    status: str,
    output: dict[str, Any],
    checkpoint: dict[str, Any] | None,
    errors: list[str],
) -> dict[str, Any]:
    """Build a validated PHASE-3 evidence row without DB side effects."""

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
        "evidence_gate": EVIDENCE_GATE,
        "db_migration_applied": True,
    }
    return validate_phase3_local_evidence_row(row)


def insert_phase3_local_evidence(*, store: Any, row: dict[str, Any]) -> dict[str, Any]:
    """Append a safe PHASE-3 evidence row to a mock/local store only."""

    config = getattr(store, "config", None)
    if config is None or not getattr(config, "is_mock", False):
        raise ValueError("PHASE-3 evidence insert is local/mock-only")

    safe_row = validate_phase3_local_evidence_row(row)
    client = store.client
    records = getattr(client, "phase3_local_evidence_inserts", None)
    if records is None:
        records = []
        setattr(client, "phase3_local_evidence_inserts", records)

    inserted = {
        **safe_row,
        "bridge_mode": BRIDGE_MODE,
        "local_only": True,
        "target_table": TARGET_TABLE,
        "inserted_at": _now(),
    }
    records.append(inserted)
    return inserted


def validate_phase3_local_evidence_row(row: dict[str, Any]) -> dict[str, Any]:
    """Validate a PHASE-3 local evidence row and return a shallow copy."""

    if not isinstance(row, dict):
        raise TypeError("row must be a dict")

    missing = sorted(REQUIRED_ROW_KEYS - set(row))
    if missing:
        raise ValueError(f"Missing required PHASE-3 evidence row keys: {', '.join(missing)}")

    _validate_ids(job_id=row["job_id"], run_id=row["run_id"])
    _validate_status(row["status"])
    _validate_output_payload(row["output"])
    _validate_checkpoint(row["checkpoint"])
    _validate_errors(row["errors"])

    if row["driver_name"] != DRIVER_NAME:
        raise ValueError("driver_name must be phase3_controlled_local_evidence")
    if row["job_type"] != JOB_TYPE:
        raise ValueError("job_type must be PHASE3_CONTROLLED_LOCAL_EVIDENCE_INSERT")
    if row["source_kind"] != SOURCE_KIND:
        raise ValueError("source_kind must be internal_local_evidence")
    if row["phase_label"] != PHASE_LABEL:
        raise ValueError("phase_label must be PHASE-3")
    if row["evidence_gate"] != EVIDENCE_GATE:
        raise ValueError("evidence_gate must be TPC-3-005")
    if row["db_migration_applied"] is not True:
        raise ValueError("db_migration_applied must be true before PHASE-3 evidence insert")
    if not isinstance(row["created_at"], str) or not row["created_at"].strip():
        raise ValueError("created_at is required")

    _reject_forbidden_keys(row)
    return dict(row)


def _validate_ids(*, job_id: str, run_id: str | None) -> None:
    if not isinstance(job_id, str) or not job_id.strip():
        raise ValueError("job_id is required")
    if run_id is not None and (not isinstance(run_id, str) or not run_id.strip()):
        raise ValueError("run_id must be a non-empty string or None")


def _validate_status(status: str) -> None:
    if status not in ALLOWED_STATUSES:
        raise ValueError("Invalid PHASE-3 evidence status")


def _validate_checkpoint(checkpoint: dict[str, Any] | None) -> None:
    if checkpoint is not None and not isinstance(checkpoint, dict):
        raise TypeError("checkpoint must be a dict or None")


def _validate_errors(errors: list[str]) -> None:
    if not isinstance(errors, list) or not all(isinstance(item, str) for item in errors):
        raise TypeError("errors must be a list of strings")


def _validate_output_payload(output: dict[str, Any]) -> None:
    if not isinstance(output, dict):
        raise TypeError("output must be a dict")

    unknown = sorted(set(output) - ALLOWED_OUTPUT_KEYS)
    if unknown:
        raise ValueError(f"Unexpected PHASE-3 output payload keys: {', '.join(unknown)}")

    if output.get("source") != "local":
        raise ValueError("output.source must be local")
    if output.get("mode") != "controlled-local-evidence":
        raise ValueError("output.mode must be controlled-local-evidence")
    if output.get("target_table") != TARGET_TABLE:
        raise ValueError("output.target_table must be automation_driver_outputs")
    if output.get("read_only_confirmed") is not True:
        raise ValueError("read_only_confirmed must be true")
    if output.get("live_execution") is not False:
        raise ValueError("PHASE-3 evidence insert accepts non-live rows only")
    if output.get("browser_automation") is not False:
        raise ValueError("browser_automation must be false")
    if output.get("network_calls") != 0:
        raise ValueError("PHASE-3 evidence insert accepts zero-network rows only")
    if output.get("local_insert_only") is not True:
        raise ValueError("local_insert_only must be true")

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
        raise ValueError(f"Unexpected PHASE-3 normalized item keys: {', '.join(unknown)}")
    if not str(item.get("test_product_id", "")).strip():
        raise ValueError(f"normalized_items[{index}].test_product_id is required")
    if not str(item.get("product_name", "")).strip():
        raise ValueError(f"normalized_items[{index}].product_name is required")
    if not str(item.get("product_url", "")).strip():
        raise ValueError(f"normalized_items[{index}].product_url is required")


def _reject_forbidden_keys(value: Any, *, path: str = "row") -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            lowered = str(key).strip().lower()
            for fragment in FORBIDDEN_KEY_FRAGMENTS:
                if fragment in lowered:
                    raise ValueError(f"forbidden key in PHASE-3 evidence row: {path}.{key}")
            _reject_forbidden_keys(nested, path=f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _reject_forbidden_keys(item, path=f"{path}[{index}]")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
