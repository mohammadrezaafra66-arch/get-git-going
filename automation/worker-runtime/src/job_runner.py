"""Job runner skeleton for the minimal worker runtime."""

from __future__ import annotations

import logging
from typing import Any

from checkpoint import save_checkpoint
from driver_registry import DriverRegistry, build_default_registry
from drivers.base import DriverContext
from logger import log_event
from readonly_worker_pipeline import run_readonly_pipeline
from supabase_client import SupabaseClientWrapper

READONLY_JOB_TYPE = "TOROB_LIMITED_READONLY"


class JobRunner:
    """Runs mock jobs and approved mock-only drivers through the worker contract."""

    def __init__(
        self,
        *,
        worker_id: str,
        store: SupabaseClientWrapper,
        logger: logging.Logger,
        registry: DriverRegistry | None = None,
    ) -> None:
        self.worker_id = worker_id
        self.store = store
        self.logger = logger
        self.registry = registry or build_default_registry()

    def run(self, job: dict[str, Any]) -> dict[str, Any]:
        job_type = str(job.get("type", job.get("job_type", "MOCK_RUN")))

        if job_type == "MOCK_DRIVER_RUN":
            return self._run_mock_driver_job(job)

        if job_type == READONLY_JOB_TYPE:
            return run_readonly_pipeline(store=self.store, worker_id=self.worker_id, job=job)

        return self._run_legacy_mock_job(job)

    def _run_legacy_mock_job(self, job: dict[str, Any]) -> dict[str, Any]:
        job_id = str(job.get("id", "mock-job"))

        log_event(self.logger, "INFO", "RUN_STARTED", worker_id=self.worker_id, job_id=job_id)
        self.store.write_log(worker_id=self.worker_id, job_id=job_id, event="RUN_STARTED", level="INFO")

        checkpoint = {"step": "mock_handler_completed", "progress": 100}
        save_checkpoint(self.store, job_id, checkpoint)
        self.store.write_log(worker_id=self.worker_id, job_id=job_id, event="CHECKPOINT_SAVED", level="INFO")

        result = {"job_id": job_id, "status": "COMPLETED", "checkpoint": checkpoint}

        log_event(self.logger, "INFO", "RUN_COMPLETED", worker_id=self.worker_id, job_id=job_id, result_status="COMPLETED")
        self.store.write_log(worker_id=self.worker_id, job_id=job_id, event="RUN_COMPLETED", level="INFO")

        return result

    def _run_mock_driver_job(self, job: dict[str, Any]) -> dict[str, Any]:
        job_id = str(job.get("id", "mock-driver-job"))
        run_id = _optional_string(job.get("run_id"))
        job_type = str(job.get("type", "MOCK_DRIVER_RUN"))
        driver_name = str(job.get("driver", "mock"))
        driver = self.registry.get(driver_name)

        log_event(self.logger, "INFO", "DRIVER_RUN_STARTED", worker_id=self.worker_id, job_id=job_id, driver=driver_name)
        self.store.write_log(worker_id=self.worker_id, job_id=job_id, event="DRIVER_RUN_STARTED", level="INFO")

        driver.validate_input(job)
        driver.prepare(job)

        context = DriverContext(worker_id=self.worker_id, store=self.store, logger=self.logger)
        try:
            driver_result = driver.run(job, context)
            driver_result.validate()
        finally:
            driver.cleanup(job)

        if driver_result.checkpoint is not None:
            save_checkpoint(self.store, job_id, driver_result.checkpoint)
            self.store.write_log(worker_id=self.worker_id, job_id=job_id, event="CHECKPOINT_SAVED", level="INFO")

        saved_output = self.store.save_driver_output(
            job_id=job_id,
            run_id=run_id,
            driver_name=driver_name,
            job_type=job_type,
            status=driver_result.status,
            output=driver_result.output,
            checkpoint=driver_result.checkpoint,
            errors=driver_result.errors,
            source_kind="mock",
        )
        self.store.write_log(worker_id=self.worker_id, job_id=job_id, event="DRIVER_OUTPUT_SAVED", level="INFO")

        result = {
            "job_id": job_id,
            "status": driver_result.status,
            "output": driver_result.output,
            "checkpoint": driver_result.checkpoint,
            "errors": driver_result.errors,
            "persisted_output": saved_output,
        }

        log_event(
            self.logger,
            "INFO",
            "DRIVER_RUN_COMPLETED",
            worker_id=self.worker_id,
            job_id=job_id,
            driver=driver_name,
            result_status=driver_result.status,
        )
        self.store.write_log(worker_id=self.worker_id, job_id=job_id, event="DRIVER_RUN_COMPLETED", level="INFO")

        return result


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
