from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from torob_readonly_output_persistence import validate_torob_readonly_output_row

TARGET_TABLE = "automation_driver_outputs"
BRIDGE_MODE = "controlled_mock_verified"


@dataclass
class ReadonlyOutputBridge:
    records: list[dict[str, Any]] = field(default_factory=list)

    def write(self, row: dict[str, Any]) -> dict[str, Any]:
        safe_row = validate_bridge_row(row)
        record = {
            "bridge_mode": BRIDGE_MODE,
            "target_table": TARGET_TABLE,
            "driver_name": safe_row["driver_name"],
            "job_type": safe_row["job_type"],
            "status": safe_row["status"],
            "source_kind": safe_row["source_kind"],
            "phase_label": safe_row["phase_label"],
            "live_execution": safe_row["output"].get("live_execution"),
            "network_calls": safe_row["output"].get("network_calls"),
            "row": safe_row,
        }
        self.records.append(record)
        return record


def validate_bridge_row(row: dict[str, Any]) -> dict[str, Any]:
    safe_row = validate_torob_readonly_output_row(row)
    output = safe_row["output"]
    if output.get("live_execution") is not False:
        raise ValueError("bridge accepts non-live rows only")
    if output.get("network_calls") != 0:
        raise ValueError("bridge accepts zero-network rows only")
    if output.get("browser_automation") is not False:
        raise ValueError("browser_automation must be false")
    if output.get("read_only_confirmed") is not True:
        raise ValueError("read_only_confirmed must be true")
    return safe_row
