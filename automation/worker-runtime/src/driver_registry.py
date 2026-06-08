"""Driver registry for the minimal worker runtime."""

from __future__ import annotations

from typing import Any

from drivers.base import WorkerDriver
from drivers.mock_driver import MockDriver


class DriverRegistry:
    """Small in-memory registry for approved worker drivers."""

    def __init__(self) -> None:
        self._drivers: dict[str, WorkerDriver] = {}

    def register(self, driver: WorkerDriver) -> None:
        self._drivers[driver.name] = driver

    def get(self, name: str) -> WorkerDriver:
        try:
            return self._drivers[name]
        except KeyError as exc:
            known = ", ".join(sorted(self._drivers)) or "none"
            raise KeyError(f"Unknown driver '{name}'. Registered drivers: {known}") from exc

    def names(self) -> list[str]:
        return sorted(self._drivers)



def build_default_registry() -> DriverRegistry:
    registry = DriverRegistry()
    registry.register(MockDriver())
    return registry
