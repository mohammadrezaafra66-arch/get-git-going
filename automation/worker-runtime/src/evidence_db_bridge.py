from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from readonly_output_bridge import validate_bridge_row

TARGET_TABLE = "automation_driver_outputs"
BRIDGE_MODE = "controlled_evidence_dry_run"
FORBIDDEN_OUTPUT_KEYS = {
    "api_key",
    "authorization",
    "connection_string",
    "customer_id",
    "customer_update",
    "password",
    "price_update",
    "product_update",
    "sales_list_update",
    "secret",
    "service_role",
    "supplier_update",
    "token",
}


@dataclass
class EvidenceDbBridge:
    dry_run_records: list[dict[str, Any]] = field(default_factory=list)

    def dry_run_insert(self, row: dict[str, Any]) -> dict[str, Any]:
        safe_row = validate_evidence_db_row(row)
        summary = build_safe_insert_summary(safe_row)
        self.dry_run_records.append(summary)
        return summary


def validate_evidence_db_row(row: dict[str, Any]) -> dict[str, Any]:
    _reject_forbidden_keys(row)
    return validate_bridge_row(row)


def build_safe_insert_summary(row: dict[str, Any]) -> dict[str, Any]:
    safe_row = validate_evidence_db_row(row)
    output = safe_row["output"]
    return {
        "bridge_mode": BRIDGE_MODE,
        "dry_run": True,
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


def _reject_forbidden_keys(value: Any, *, path: str = "row") -> None:
    if isinstance(value, dict):
        for key, nested_value in value.items():
            key_text = str(key).strip().lower()
            if key_text in FORBIDDEN_OUTPUT_KEYS:
                raise ValueError(f"forbidden key in evidence row: {path}.{key}")
            _reject_forbidden_keys(nested_value, path=f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _reject_forbidden_keys(item, path=f"{path}[{index}]")
