"""Mock-only driver used to validate the worker driver contract."""

from __future__ import annotations

from typing import Any

from drivers.base import DriverContext, DriverResult


class MockDriver:
    """Deterministic driver with no network, browser, secret, or source integration."""

    name = "mock"

    def validate_input(self, job: dict[str, Any]) -> None:
        if not isinstance(job, dict):
            raise TypeError("job must be a dict")
        if job.get("type") != "MOCK_DRIVER_RUN":
            raise ValueError("mock driver only accepts MOCK_DRIVER_RUN jobs")

    def prepare(self, job: dict[str, Any]) -> None:
        return None

    def run(self, job: dict[str, Any], context: DriverContext) -> DriverResult:
        job_id = str(job.get("id", "mock-driver-job"))
        checkpoint = {
            "driver": self.name,
            "step": "mock_driver_completed",
            "progress": 100,
        }
        output = {
            "job_id": job_id,
            "driver": self.name,
            "message": "mock driver completed without external calls",
        }
        result = DriverResult(status="COMPLETED", output=output, checkpoint=checkpoint, errors=[])
        result.validate()
        return result

    def cleanup(self, job: dict[str, Any]) -> None:
        return None
