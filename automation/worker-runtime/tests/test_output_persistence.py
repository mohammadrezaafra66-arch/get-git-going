from __future__ import annotations

from config import RuntimeConfig
from job_runner import JobRunner
from logger import get_logger
from supabase_client import MockSupabaseClient, SupabaseClientWrapper


def build_store() -> SupabaseClientWrapper:
    return SupabaseClientWrapper(config=RuntimeConfig(worker_id="test-worker"), mock_client=MockSupabaseClient())


def test_mock_driver_output_is_persisted_in_mock_store():
    store = build_store()
    runner = JobRunner(worker_id="test-worker", store=store, logger=get_logger("output-persistence-test"))

    result = runner.run(
        {
            "id": "job-output-1",
            "run_id": "run-output-1",
            "type": "MOCK_DRIVER_RUN",
            "driver": "mock",
        }
    )

    assert result["status"] == "COMPLETED"
    assert result["persisted_output"]["job_id"] == "job-output-1"
    assert result["persisted_output"]["run_id"] == "run-output-1"
    assert result["persisted_output"]["driver_name"] == "mock"
    assert result["persisted_output"]["job_type"] == "MOCK_DRIVER_RUN"
    assert result["persisted_output"]["status"] == "COMPLETED"
    assert result["persisted_output"]["source_kind"] == "mock"

    assert len(store.client.driver_outputs) == 1
    persisted = store.client.driver_outputs[0]
    assert persisted["output"]["driver"] == "mock"
    assert persisted["checkpoint"]["step"] == "mock_driver_completed"
    assert persisted["errors"] == []


def test_job_runner_writes_driver_output_saved_event():
    store = build_store()
    runner = JobRunner(worker_id="test-worker", store=store, logger=get_logger("output-event-test"))

    runner.run({"id": "job-output-2", "type": "MOCK_DRIVER_RUN", "driver": "mock"})

    assert any(row["event"] == "DRIVER_OUTPUT_SAVED" for row in store.client.logs)


def test_mock_driver_output_persistence_does_not_require_real_credentials():
    config = RuntimeConfig(worker_mode="mock", worker_id="test-worker")
    config.validate()
    store = SupabaseClientWrapper(config=config, mock_client=MockSupabaseClient())
    runner = JobRunner(worker_id="test-worker", store=store, logger=get_logger("output-no-secret-test"))

    result = runner.run({"id": "job-output-3", "type": "MOCK_DRIVER_RUN", "driver": "mock"})

    assert result["persisted_output"]["source_kind"] == "mock"
