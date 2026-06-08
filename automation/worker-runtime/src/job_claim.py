"""Job claim boundary for the minimal worker runtime."""

from __future__ import annotations

from typing import Any, Protocol


class JobStore(Protocol):
    def claim_job(self, worker_id: str) -> dict[str, Any] | None: ...


def claim_next_job(store: JobStore, worker_id: str) -> dict[str, Any] | None:
    """Claim one pending job for a worker.

    Real database locking is intentionally outside TPC-I-001 scope.
    """
    return store.claim_job(worker_id)
