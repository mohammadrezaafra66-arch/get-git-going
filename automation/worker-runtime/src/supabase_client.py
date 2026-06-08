"""Data client wrapper shape for the worker skeleton.

Real source integrations are intentionally not implemented here. The mock client lets tests validate the runtime contract without credentials or network access.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from config import RuntimeConfig


ALLOWED_OUTPUT_STATUSES = {"COMPLETED", "FAILED", "SKIPPED"}
ALLOWED_OUTPUT_SOURCE_KINDS = {"mock"}
ALLOWED_OUTPUT_DRIVER_NAMES = {"mock"}
ALLOWED_OUTPUT_JOB_TYPES = {"MOCK_DRIVER_RUN"}


@dataclass
class MockSupabaseClient:
    """In-memory mock for worker contract tests."""

    jobs: list[dict[str, Any]] = field(default_factory=list)
    logs: list[dict[str, Any]] = field(default_factory=list)
    heartbeats: list[dict[str, Any]] = field(default_factory=list)
    checkpoints: dict[str, dict[str, Any]] = field(default_factory=dict)
    driver_outputs: list[dict[str, Any]] = field(default_factory=list)

    def claim_job(self, worker_id: str) -> dict[str, Any] | None:
        for job in self.jobs:
            if job.get("status") in {"PENDING", "QUEUED"}:
                job["status"] = "CLAIMED"
                job["worker_id"] = worker_id
                job["claimed_at"] = _now()
                return job
        return None

    def write_heartbeat(self, worker_id: str, status: str = "ONLINE") -> dict[str, Any]:
        row = {"worker_id": worker_id, "status": status, "recorded_at": _now()}
        self.heartbeats.append(row)
        return row

    def write_log(self, *, worker_id: str, event: str, job_id: str | None = None, level: str = "INFO") -> dict[str, Any]:
        row = {
            "worker_id": worker_id,
            "job_id": job_id,
            "event": event,
            "level": level,
            "created_at": _now(),
        }
        self.logs.append(row)
        return row

    def save_checkpoint(self, job_id: str, checkpoint: dict[str, Any]) -> dict[str, Any]:
        row = {"job_id": job_id, "checkpoint": checkpoint, "updated_at": _now()}
        self.checkpoints[job_id] = row
        return row

    def load_checkpoint(self, job_id: str) -> dict[str, Any] | None:
        row = self.checkpoints.get(job_id)
        if row is None:
            return None
        return dict(row)

    def save_driver_output(
        self,
        *,
        job_id: str,
        run_id: str | None,
        driver_name: str,
        job_type: str,
        status: str,
        output: dict[str, Any],
        checkpoint: dict[str, Any] | None,
        errors: list[str],
        source_kind: str = "mock",
    ) -> dict[str, Any]:
        row = build_controlled_driver_output_row(
            job_id=job_id,
            run_id=run_id,
            driver_name=driver_name,
            job_type=job_type,
            status=status,
            output=output,
            checkpoint=checkpoint,
            errors=errors,
            source_kind=source_kind,
        )
        self.driver_outputs.append(row)
        return row


class SupabaseClientWrapper:
    """Thin wrapper boundary for future real data implementation."""

    def __init__(self, config: RuntimeConfig, mock_client: MockSupabaseClient | None = None) -> None:
        self.config = config
        self._mock_client = mock_client or MockSupabaseClient()

        if not config.is_mock:
            raise NotImplementedError("Real data client is outside TPC-I-005 implementation scope")

    @property
    def client(self) -> MockSupabaseClient:
        return self._mock_client

    def claim_job(self, worker_id: str) -> dict[str, Any] | None:
        return self._mock_client.claim_job(worker_id)

    def write_heartbeat(self, worker_id: str, status: str = "ONLINE") -> dict[str, Any]:
        return self._mock_client.write_heartbeat(worker_id, status)

    def write_log(self, *, worker_id: str, event: str, job_id: str | None = None, level: str = "INFO") -> dict[str, Any]:
        return self._mock_client.write_log(worker_id=worker_id, event=event, job_id=job_id, level=level)

    def save_checkpoint(self, job_id: str, checkpoint: dict[str, Any]) -> dict[str, Any]:
        return self._mock_client.save_checkpoint(job_id, checkpoint)

    def load_checkpoint(self, job_id: str) -> dict[str, Any] | None:
        return self._mock_client.load_checkpoint(job_id)

    def save_driver_output(
        self,
        *,
        job_id: str,
        run_id: str | None,
        driver_name: str,
        job_type: str,
        status: str,
        output: dict[str, Any],
        checkpoint: dict[str, Any] | None,
        errors: list[str],
        source_kind: str = "mock",
    ) -> dict[str, Any]:
        return self._mock_client.save_driver_output(
            job_id=job_id,
            run_id=run_id,
            driver_name=driver_name,
            job_type=job_type,
            status=status,
            output=output,
            checkpoint=checkpoint,
            errors=errors,
            source_kind=source_kind,
        )


def build_controlled_driver_output_row(
    *,
    job_id: str,
    run_id: str | None,
    driver_name: str,
    job_type: str,
    status: str,
    output: dict[str, Any],
    checkpoint: dict[str, Any] | None,
    errors: list[str],
    source_kind: str = "mock",
) -> dict[str, Any]:
    """Build a row matching the verified automation_driver_outputs table contract.

    TPC-I-005 intentionally allows only mock driver output.
    """
    _validate_controlled_driver_output(
        job_id=job_id,
        run_id=run_id,
        driver_name=driver_name,
        job_type=job_type,
        status=status,
        output=output,
        checkpoint=checkpoint,
        errors=errors,
        source_kind=source_kind,
    )
    return {
        "job_id": job_id,
        "run_id": run_id,
        "driver_name": driver_name,
        "job_type": job_type,
        "status": status,
        "output": output,
        "checkpoint": checkpoint,
        "errors": errors,
        "source_kind": source_kind,
        "phase_label": "PHASE-1",
        "created_at": _now(),
    }


def _validate_controlled_driver_output(
    *,
    job_id: str,
    run_id: str | None,
    driver_name: str,
    job_type: str,
    status: str,
    output: dict[str, Any],
    checkpoint: dict[str, Any] | None,
    errors: list[str],
    source_kind: str,
) -> None:
    if not isinstance(job_id, str) or not job_id.strip():
        raise ValueError("job_id is required")
    if run_id is not None and (not isinstance(run_id, str) or not run_id.strip()):
        raise ValueError("run_id must be a non-empty string or None")
    if driver_name not in ALLOWED_OUTPUT_DRIVER_NAMES:
        raise ValueError("Only mock driver output is allowed in TPC-I-005")
    if job_type not in ALLOWED_OUTPUT_JOB_TYPES:
        raise ValueError("Only MOCK_DRIVER_RUN output is allowed in TPC-I-005")
    if status not in ALLOWED_OUTPUT_STATUSES:
        raise ValueError("Invalid output status")
    if source_kind not in ALLOWED_OUTPUT_SOURCE_KINDS:
        raise ValueError("Only mock source_kind is allowed in TPC-I-005")
    if not isinstance(output, dict):
        raise TypeError("output must be a dict")
    if checkpoint is not None and not isinstance(checkpoint, dict):
        raise TypeError("checkpoint must be a dict or None")
    if not isinstance(errors, list) or not all(isinstance(item, str) for item in errors):
        raise TypeError("errors must be a list of strings")


def build_supabase_wrapper(config: RuntimeConfig, mock_client: MockSupabaseClient | None = None) -> SupabaseClientWrapper:
    return SupabaseClientWrapper(config=config, mock_client=mock_client)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
