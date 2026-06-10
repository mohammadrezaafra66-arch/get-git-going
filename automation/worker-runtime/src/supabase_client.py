from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from config import RuntimeConfig


ALLOWED_OUTPUT_STATUSES = {"COMPLETED", "FAILED", "SKIPPED"}
ALLOWED_OUTPUT_SOURCE_KINDS = {"mock"}
ALLOWED_OUTPUT_DRIVER_NAMES = {"mock"}
ALLOWED_OUTPUT_JOB_TYPES = {"MOCK_DRIVER_RUN"}
REQUIRED_OUTPUT_ROW_KEYS = {
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


@dataclass
class MockSupabaseClient:
    jobs: list[dict[str, Any]] = field(default_factory=list)
    logs: list[dict[str, Any]] = field(default_factory=list)
    heartbeats: list[dict[str, Any]] = field(default_factory=list)
    checkpoints: dict[str, dict[str, Any]] = field(default_factory=dict)
    driver_outputs: list[dict[str, Any]] = field(default_factory=list)
    inserted_driver_outputs: list[dict[str, Any]] = field(default_factory=list)
    live_inserted_driver_outputs: list[dict[str, Any]] = field(default_factory=list)
    credentialed_driver_outputs: list[dict[str, Any]] = field(default_factory=list)
    worker_integrated_outputs: list[dict[str, Any]] = field(default_factory=list)
    worker_next_step_outputs: list[dict[str, Any]] = field(default_factory=list)
    worker_follow_up_outputs: list[dict[str, Any]] = field(default_factory=list)

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
        row = {"worker_id": worker_id, "job_id": job_id, "event": event, "level": level, "created_at": _now()}
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

    def insert_controlled_driver_output(self, row: dict[str, Any]) -> dict[str, Any]:
        safe_row = validate_controlled_driver_output_row(row)
        inserted = {**safe_row, "inserted_at": _now()}
        self.inserted_driver_outputs.append(inserted)
        return inserted

    def insert_live_controlled_driver_output(self, row: dict[str, Any]) -> dict[str, Any]:
        safe_row = validate_controlled_driver_output_row(row)
        inserted = {**safe_row, "live_inserted_at": _now(), "bridge_mode": "mock_verified"}
        self.live_inserted_driver_outputs.append(inserted)
        return inserted

    def insert_credentialed_driver_output(self, row: dict[str, Any]) -> dict[str, Any]:
        safe_row = validate_controlled_driver_output_row(row)
        inserted = {**safe_row, "credentialed_inserted_at": _now(), "credential_boundary": "worker_runtime_mock_only"}
        self.credentialed_driver_outputs.append(inserted)
        return inserted

    def integrate_controlled_worker_output(self, row: dict[str, Any]) -> dict[str, Any]:
        safe_row = validate_controlled_driver_output_row(row)
        integrated = {**safe_row, "worker_integrated_at": _now(), "worker_boundary": "controlled_mock_only"}
        self.worker_integrated_outputs.append(integrated)
        return integrated

    def run_controlled_worker_next_step(self, row: dict[str, Any]) -> dict[str, Any]:
        safe_row = validate_controlled_driver_output_row(row)
        next_step = {**safe_row, "worker_next_step_at": _now(), "next_step_boundary": "controlled_mock_only"}
        self.worker_next_step_outputs.append(next_step)
        return next_step

    def run_controlled_worker_follow_up(self, row: dict[str, Any]) -> dict[str, Any]:
        safe_row = validate_controlled_driver_output_row(row)
        follow_up = {**safe_row, "worker_follow_up_at": _now(), "follow_up_boundary": "controlled_mock_only"}
        self.worker_follow_up_outputs.append(follow_up)
        return follow_up


class SupabaseClientWrapper:
    def __init__(self, config: RuntimeConfig, mock_client: MockSupabaseClient | None = None) -> None:
        self.config = config
        self._mock_client = mock_client or MockSupabaseClient()
        if not config.is_mock:
            raise NotImplementedError("non-mock mode is outside TPC-I-014 implementation scope")

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

    def insert_controlled_driver_output(self, row: dict[str, Any]) -> dict[str, Any]:
        return self._mock_client.insert_controlled_driver_output(row)

    def insert_live_controlled_driver_output(self, row: dict[str, Any]) -> dict[str, Any]:
        return self._mock_client.insert_live_controlled_driver_output(row)

    def insert_credentialed_driver_output(self, row: dict[str, Any]) -> dict[str, Any]:
        return self._mock_client.insert_credentialed_driver_output(row)

    def integrate_controlled_worker_output(self, row: dict[str, Any]) -> dict[str, Any]:
        return self._mock_client.integrate_controlled_worker_output(row)

    def run_controlled_worker_next_step(self, row: dict[str, Any]) -> dict[str, Any]:
        return self._mock_client.run_controlled_worker_next_step(row)

    def run_controlled_worker_follow_up(self, row: dict[str, Any]) -> dict[str, Any]:
        return self._mock_client.run_controlled_worker_follow_up(row)


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


def validate_controlled_driver_output_row(row: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(row, dict):
        raise TypeError("row must be a dict")
    missing = sorted(REQUIRED_OUTPUT_ROW_KEYS - set(row))
    if missing:
        raise ValueError(f"Missing required output row keys: {', '.join(missing)}")
    if row["phase_label"] != "PHASE-1":
        raise ValueError("Only PHASE-1 output rows are allowed")
    if not isinstance(row["created_at"], str) or not row["created_at"].strip():
        raise ValueError("created_at is required")
    _validate_controlled_driver_output(
        job_id=row["job_id"],
        run_id=row["run_id"],
        driver_name=row["driver_name"],
        job_type=row["job_type"],
        status=row["status"],
        output=row["output"],
        checkpoint=row["checkpoint"],
        errors=row["errors"],
        source_kind=row["source_kind"],
    )
    return dict(row)


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
        raise ValueError("Only mock driver output is allowed in TPC-I-014")
    if job_type not in ALLOWED_OUTPUT_JOB_TYPES:
        raise ValueError("Only MOCK_DRIVER_RUN output is allowed in TPC-I-014")
    if status not in ALLOWED_OUTPUT_STATUSES:
        raise ValueError("Invalid output status")
    if source_kind not in ALLOWED_OUTPUT_SOURCE_KINDS:
        raise ValueError("Only mock source_kind is allowed in TPC-I-014")
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
