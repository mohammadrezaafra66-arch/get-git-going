from __future__ import annotations

from typing import Any

from evidence_db_bridge import TARGET_TABLE, _reject_forbidden_keys
from supabase_client import SupabaseClientWrapper

BRIDGE_MODE = "controlled_phase3_evidence_insert"
PHASE_LABEL = "PHASE-3"
DRIVER_NAME = "torob_limited_readonly"
JOB_TYPE = "TOROB_LIMITED_READONLY"
SOURCE_KIND = "external_read_only"
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
}


def controlled_phase3_evidence_insert(*, store: SupabaseClientWrapper, row: dict[str, Any]) -> dict[str, Any]:
    safe_row = validate_phase3_evidence_insert_row(row)
    summary = build_phase3_insert_summary(safe_row)
    records = _phase3_insert_records(store)
    records.append({"row": safe_row, "summary": summary})
    return summary


def validate_phase3_evidence_insert_row(row: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(row, dict):
        raise TypeError("row must be a dict")
    _reject_forbidden_keys(row)
    missing = sorted(REQUIRED_ROW_KEYS - set(row))
    if missing:
        raise ValueError(f"Missing required phase3 evidence row keys: {', '.join(missing)}")

    if row["driver_name"] != DRIVER_NAME:
        raise ValueError("driver_name must be torob_limited_readonly")
    if row["job_type"] != JOB_TYPE:
        raise ValueError("job_type must be TOROB_LIMITED_READONLY")
    if row["source_kind"] != SOURCE_KIND:
        raise ValueError("source_kind must be external_read_only")
    if row["phase_label"] != PHASE_LABEL:
        raise ValueError("phase_label must be PHASE-3")
    if row["status"] not in ALLOWED_STATUSES:
        raise ValueError("Invalid phase3 evidence status")
    if not isinstance(row["created_at"], str) or not row["created_at"].strip():
        raise ValueError("created_at is required")
    if row["run_id"] is not None and (not isinstance(row["run_id"], str) or not row["run_id"].strip()):
        raise ValueError("run_id must be a non-empty string or None")
    if not isinstance(row["job_id"], str) or not row["job_id"].strip():
        raise ValueError("job_id is required")
    if row["checkpoint"] is not None and not isinstance(row["checkpoint"], dict):
        raise TypeError("checkpoint must be a dict or None")
    if not isinstance(row["errors"], list) or not all(isinstance(item, str) for item in row["errors"]):
        raise TypeError("errors must be a list of strings")

    output = row["output"]
    if not isinstance(output, dict):
        raise TypeError("output must be a dict")
    if output.get("live_execution") is not False:
        raise ValueError("phase3 insert accepts non-live rows only")
    if output.get("network_calls") != 0:
        raise ValueError("phase3 insert accepts zero-network rows only")
    if output.get("browser_automation") is not False:
        raise ValueError("browser_automation must be false")
    if output.get("read_only_confirmed") is not True:
        raise ValueError("read_only_confirmed must be true")

    return dict(row)


def build_phase3_insert_summary(row: dict[str, Any]) -> dict[str, Any]:
    safe_row = validate_phase3_evidence_insert_row(row)
    output = safe_row["output"]
    return {
        "bridge_mode": BRIDGE_MODE,
        "dry_run": False,
        "target_table": TARGET_TABLE,
        "job_id": safe_row["job_id"],
        "run_id": safe_row["run_id"],
        "driver_name": safe_row["driver_name"],
        "job_type": safe_row["job_type"],
        "status": safe_row["status"],
        "source_kind": safe_row["source_kind"],
        "phase_label": safe_row["phase_label"],
        "live_execution": output.get("live_execution"),
        "network_calls": output.get("network_calls"),
        "browser_automation": output.get("browser_automation"),
        "read_only_confirmed": output.get("read_only_confirmed"),
        "items_requested": output.get("items_requested"),
        "items_completed": output.get("items_completed"),
        "errors_count": len(safe_row["errors"]),
    }


def _phase3_insert_records(store: SupabaseClientWrapper) -> list[dict[str, Any]]:
    client = store.client
    records = getattr(client, "phase3_evidence_inserts", None)
    if records is None:
        records = []
        setattr(client, "phase3_evidence_inserts", records)
    return records
