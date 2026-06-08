"""Job runner skeleton for the minimal worker runtime."""

from __future__ import annotations

import logging
from typing import Any

from checkpoint import save_checkpoint
from logger import log_event
from supabase_client import SupabaseClientWrapper


class JobRunner:
    """Runs mock jobs through the worker contract.

    Real driver dispatch is intentionally outside TPC-I-001 scope.
    """

    def __init__(self, *, worker_id: str, store: SupabaseClientWrapper, logger: logging.Logger) -> None:
        self.worker_id = worker_id
        self.store = store
        self.logger = logger

    def run(self, job: dict[str, Any]) -> dict[str, Any]:
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
