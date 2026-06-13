"""Worker-side adapter for Torob read-only output persistence.

This module does not call external websites and does not write to a real
database. It accepts an already-produced driver result, builds the validated
Phase 2 output row, and delegates to the configured worker store boundary.
"""

from __future__ import annotations

from typing import Any

from drivers.base import DriverResult
from supabase_client import SupabaseClientWrapper
from torob_readonly_output_persistence import build_torob_readonly_output_row

TOROB_DRIVER_NAME = "torob_limited_readonly"
TOROB_JOB_TYPE = "TOROB_LIMITED_READONLY"


def persist_torob_driver_result(
    *,
    store: SupabaseClientWrapper,
    job_id: str,
    run_id: str | None,
    driver_result: DriverResult,
) -> dict[str, Any]:
    """Persist a validated deterministic/read-only Torob driver result.

    The function refuses result payloads that indicate network-backed execution.
    A later packet may add an explicitly approved live persistence path, but this
    adapter is intentionally limited to deterministic/zero-network evidence.
    """

    driver_result.validate()
    _validate_zero_network_payload(driver_result.output)
    row = build_torob_readonly_output_row(
        job_id=job_id,
        run_id=run_id,
        status=driver_result.status,
        output=driver_result.output,
        checkpoint=driver_result.checkpoint,
        errors=driver_result.errors,
    )
    return store.persist_torob_readonly_output(row)


def _validate_zero_network_payload(output: dict[str, Any]) -> None:
    if output.get("driver_id") != TOROB_DRIVER_NAME:
        raise ValueError("driver_result.output.driver_id must be torob_limited_readonly")
    if output.get("live_execution") is not False:
        raise ValueError("worker output adapter accepts only non-live Torob evidence")
    if output.get("network_calls") != 0:
        raise ValueError("worker output adapter accepts only zero-network Torob evidence")
