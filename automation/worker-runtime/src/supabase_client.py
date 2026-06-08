"""Supabase client wrapper shape for the worker skeleton.

Real database access is intentionally not implemented in this packet. The mock client lets tests validate the runtime contract without credentials or network access.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from config import RuntimeConfig


@dataclass
class MockSupabaseClient:
    """In-memory mock for worker contract tests."""

    jobs: list[dict[str, Any]] = field(default_factory=list)
    logs: list[dict[str, Any]] = field(default_factory=list)
    heartbeats: list[dict[str, Any]] = field(default_factory=list)
    checkpoints: dict[str, dict[str, Any]] = field(default_factory=dict)

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


class SupabaseClientWrapper:
    """Thin wrapper boundary for future Supabase implementation."""

    def __init__(self, config: RuntimeConfig, mock_client: MockSupabaseClient | None = None) -> None:
        self.config = config
        self._mock_client = mock_client or MockSupabaseClient()

        if not config.is_mock:
            # Future packet: initialize real Supabase client here.
            # This packet deliberately avoids adding an external dependency or network call.
            raise NotImplementedError("Real Supabase client is outside TPC-I-001 scope")

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


def build_supabase_wrapper(config: RuntimeConfig, mock_client: MockSupabaseClient | None = None) -> SupabaseClientWrapper:
    return SupabaseClientWrapper(config=config, mock_client=mock_client)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
