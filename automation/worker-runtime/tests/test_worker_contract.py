from __future__ import annotations

from config import RuntimeConfig
from checkpoint import load_checkpoint, save_checkpoint
from heartbeat import record_heartbeat
from job_claim import claim_next_job
from job_runner import JobRunner
from logger import get_logger
from shutdown import request_stop, reset_stop_for_tests, should_stop
from supabase_client import MockSupabaseClient, build_supabase_wrapper


def test_config_loads_in_mock_mode(monkeypatch):
    monkeypatch.setenv("WORKER_MODE", "mock")
    monkeypatch.setenv("WORKER_ID", "test-worker")

    config = RuntimeConfig.from_env()
    config.validate()

    assert config.is_mock is True
    assert config.worker_id == "test-worker"
    assert config.safe_summary()["supabase_service_role_key_set"] is False


def test_mock_job_claim_heartbeat_and_checkpoint():
    config = RuntimeConfig(worker_id="test-worker")
    client = MockSupabaseClient(jobs=[{"id": "job-1", "status": "PENDING"}])
    store = build_supabase_wrapper(config, mock_client=client)

    heartbeat = record_heartbeat(store, "test-worker")
    assert heartbeat["status"] == "ONLINE"

    job = claim_next_job(store, "test-worker")
    assert job is not None
    assert job["status"] == "CLAIMED"

    saved = save_checkpoint(store, "job-1", {"step": "claimed"})
    assert saved["checkpoint"]["step"] == "claimed"

    loaded = load_checkpoint(store, "job-1")
    assert loaded is not None
    assert loaded["checkpoint"]["step"] == "claimed"


def test_job_runner_can_run_mock_job():
    config = RuntimeConfig(worker_id="test-worker")
    client = MockSupabaseClient()
    store = build_supabase_wrapper(config, mock_client=client)
    runtime_logger = get_logger("test-worker-runtime", level="INFO")

    runner = JobRunner(worker_id="test-worker", store=store, logger=runtime_logger)
    result = runner.run({"id": "job-2", "type": "MOCK_RUN", "status": "CLAIMED"})

    assert result["status"] == "COMPLETED"
    assert store.load_checkpoint("job-2") is not None
    assert any(row["event"] == "RUN_STARTED" for row in client.logs)
    assert any(row["event"] == "RUN_COMPLETED" for row in client.logs)


def test_stop_flag_helpers():
    reset_stop_for_tests()
    assert should_stop() is False
    request_stop()
    assert should_stop() is True
