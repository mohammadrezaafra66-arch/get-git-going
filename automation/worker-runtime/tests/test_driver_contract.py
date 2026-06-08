from __future__ import annotations

import pytest

from driver_registry import build_default_registry
from drivers.base import DriverContext, DriverResult
from drivers.mock_driver import MockDriver
from job_runner import JobRunner
from logger import get_logger
from supabase_client import MockSupabaseClient, SupabaseClientWrapper
from config import RuntimeConfig


def build_store() -> SupabaseClientWrapper:
    return SupabaseClientWrapper(config=RuntimeConfig(worker_id="test-worker"), mock_client=MockSupabaseClient())


def test_driver_result_validates_status():
    DriverResult(status="COMPLETED").validate()

    with pytest.raises(ValueError):
        DriverResult(status="UNKNOWN").validate()


def test_mock_driver_validates_input():
    driver = MockDriver()

    driver.validate_input({"id": "job-1", "type": "MOCK_DRIVER_RUN"})

    with pytest.raises(ValueError):
        driver.validate_input({"id": "job-1", "type": "REAL_TOROB_RUN"})


def test_mock_driver_returns_deterministic_result():
    driver = MockDriver()
    store = build_store()
    context = DriverContext(worker_id="test-worker", store=store, logger=get_logger("mock-driver-test"))

    result = driver.run({"id": "job-1", "type": "MOCK_DRIVER_RUN"}, context)

    assert result.status == "COMPLETED"
    assert result.output["driver"] == "mock"
    assert result.checkpoint is not None
    assert result.checkpoint["step"] == "mock_driver_completed"
    assert result.errors == []


def test_driver_registry_resolves_mock_driver():
    registry = build_default_registry()

    assert registry.names() == ["mock"]
    assert isinstance(registry.get("mock"), MockDriver)

    with pytest.raises(KeyError):
        registry.get("missing")


def test_job_runner_can_run_mock_driver_job():
    store = build_store()
    runner = JobRunner(worker_id="test-worker", store=store, logger=get_logger("mock-driver-runner-test"))

    result = runner.run({"id": "job-2", "type": "MOCK_DRIVER_RUN", "driver": "mock"})

    assert result["status"] == "COMPLETED"
    assert result["output"]["driver"] == "mock"
    assert store.load_checkpoint("job-2") is not None
    assert any(row["event"] == "DRIVER_RUN_STARTED" for row in store.client.logs)
    assert any(row["event"] == "DRIVER_RUN_COMPLETED" for row in store.client.logs)
