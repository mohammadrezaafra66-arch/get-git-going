from __future__ import annotations

from typing import Any

from drivers.base import DriverContext
from drivers.torob_limited_readonly import TorobLimitedReadOnlyDriver
from supabase_client import SupabaseClientWrapper
from torob_worker_output_path import persist_torob_driver_result

JOB_TYPE = "TOROB_LIMITED_READONLY"
DRIVER_NAME = "torob_limited_readonly"


def run_readonly_pipeline(*, store: SupabaseClientWrapper, worker_id: str, job: dict[str, Any]) -> dict[str, Any]:
    _validate_job(job)
    job_id = str(job.get("id", "readonly-job"))
    run_id = _optional_string(job.get("run_id"))

    driver = TorobLimitedReadOnlyDriver()
    driver.validate_input(job)
    driver.prepare(job)
    try:
        result = driver.run(job, DriverContext(worker_id=worker_id, store=store, logger=None))
        result.validate()
    finally:
        driver.cleanup(job)

    persisted = persist_torob_driver_result(store=store, job_id=job_id, run_id=run_id, driver_result=result)
    bridged = store.bridge_readonly_output(persisted)
    return {
        "job_id": job_id,
        "run_id": run_id,
        "status": result.status,
        "output": result.output,
        "checkpoint": result.checkpoint,
        "errors": result.errors,
        "persisted_output": persisted,
        "bridged_output": bridged,
    }


def _validate_job(job: dict[str, Any]) -> None:
    if not isinstance(job, dict):
        raise TypeError("job must be a dict")
    if str(job.get("job_type", job.get("type", ""))) != JOB_TYPE:
        raise ValueError("unsupported job type")
    if str(job.get("driver", DRIVER_NAME)) != DRIVER_NAME:
        raise ValueError("unsupported driver")
    if _truthy(job.get("live_execution_requested")) or _truthy(job.get("live_readonly_execution")):
        raise ValueError("pipeline accepts non-live jobs only")


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _truthy(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if isinstance(value, (list, dict, set, tuple)):
        return len(value) > 0
    return True
