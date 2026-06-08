"""Heartbeat boundary for the minimal worker runtime."""

from __future__ import annotations

from typing import Any, Protocol


class HeartbeatStore(Protocol):
    def write_heartbeat(self, worker_id: str, status: str = "ONLINE") -> dict[str, Any]: ...


def record_heartbeat(store: HeartbeatStore, worker_id: str, status: str = "ONLINE") -> dict[str, Any]:
    """Record a worker heartbeat through the provided store."""
    return store.write_heartbeat(worker_id=worker_id, status=status)
