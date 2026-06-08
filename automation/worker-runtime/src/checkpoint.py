"""Checkpoint boundary for the minimal worker runtime."""

from __future__ import annotations

from typing import Any, Protocol


class CheckpointStore(Protocol):
    def save_checkpoint(self, job_id: str, checkpoint: dict[str, Any]) -> dict[str, Any]: ...
    def load_checkpoint(self, job_id: str) -> dict[str, Any] | None: ...


def save_checkpoint(store: CheckpointStore, job_id: str, checkpoint: dict[str, Any]) -> dict[str, Any]:
    """Persist a checkpoint through the provided store."""
    return store.save_checkpoint(job_id=job_id, checkpoint=checkpoint)


def load_checkpoint(store: CheckpointStore, job_id: str) -> dict[str, Any] | None:
    """Load a checkpoint through the provided store."""
    return store.load_checkpoint(job_id=job_id)
