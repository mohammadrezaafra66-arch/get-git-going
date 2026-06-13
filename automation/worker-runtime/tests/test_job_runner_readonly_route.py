from __future__ import annotations

import pytest

from config import RuntimeConfig
from job_runner import JobRunner
from logger import get_logger
from supabase_client import MockSupabaseClient, build_supabase_wrapper


def test_runner_routes_readonly_job_to_pipeline() -> None:
    config = RuntimeConfig(worker_id="test-worker")
    client = MockSupabaseClient()
    store = build_supabase_wrapper(config, mock_client=client)
    runner = JobRunner(worker_id="test-worker", store=store, logger=get_logger("test-runner", level="INFO"))

    result = runner.run(_job())

    assert result["status"] == "COMPLETED"
    assert result["output"]["live_execution"] is False
    assert result["output"]["network_calls"] == 0
    assert result["persisted_output"]["source_kind"] == "external_read_only"
    assert result["persisted_output"]["phase_label"] == "PHASE-2"
    assert len(client.torob_readonly_outputs) == 1


def test_runner_rejects_readonly_job_with_live_flag() -> None:
    config = RuntimeConfig(worker_id="test-worker")
    client = MockSupabaseClient()
    store = build_supabase_wrapper(config, mock_client=client)
    runner = JobRunner(worker_id="test-worker", store=store, logger=get_logger("test-runner", level="INFO"))
    job = _job()
    job["live_execution_requested"] = True

    with pytest.raises(ValueError, match="non-live"):
        runner.run(job)

    assert client.torob_readonly_outputs == []


def _job() -> dict[str, object]:
    return {
        "id": "job-1",
        "run_id": "run-1",
        "type": "TOROB_LIMITED_READONLY",
        "job_type": "TOROB_LIMITED_READONLY",
        "driver": "torob_limited_readonly",
        "module": "torob_limited_readonly",
        "source": "torob",
        "mode": "read-only",
        "items": [
            {
                "test_product_id": "item-1",
                "product_name": "Example product",
                "product_url": "local-test-product",
            }
        ],
        "limits": {
            "max_concurrency": 1,
            "min_delay_ms_between_requests": 3000,
            "max_sellers_per_product": 3,
            "max_total_run_seconds": 300,
            "max_total_requests": 10,
        },
    }
