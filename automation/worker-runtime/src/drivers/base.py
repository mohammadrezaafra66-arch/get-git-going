"""Base driver contract for the AfraKala worker runtime."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Protocol


ALLOWED_DRIVER_STATUSES = {"COMPLETED", "FAILED", "SKIPPED"}


@dataclass(frozen=True)
class DriverContext:
    """Context passed to a worker driver.

    The store is intentionally typed as Any because the current runtime only exposes a mock-safe wrapper.
    """

    worker_id: str
    store: Any
    logger: logging.Logger


@dataclass(frozen=True)
class DriverResult:
    """Standard result returned by every driver."""

    status: str
    output: dict[str, Any] = field(default_factory=dict)
    checkpoint: dict[str, Any] | None = None
    errors: list[str] = field(default_factory=list)

    def validate(self) -> None:
        if self.status not in ALLOWED_DRIVER_STATUSES:
            allowed = ", ".join(sorted(ALLOWED_DRIVER_STATUSES))
            raise ValueError(f"Invalid driver status '{self.status}'. Allowed values: {allowed}")


class WorkerDriver(Protocol):
    """Minimum driver lifecycle contract."""

    name: str

    def validate_input(self, job: dict[str, Any]) -> None: ...

    def prepare(self, job: dict[str, Any]) -> None: ...

    def run(self, job: dict[str, Any], context: DriverContext) -> DriverResult: ...

    def cleanup(self, job: dict[str, Any]) -> None: ...
