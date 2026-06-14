from __future__ import annotations

import pytest

from config import RuntimeConfig
from phase3_readonly_chain import run_phase3_readonly_chain
from supabase_client import MockSupabaseClient, SupabaseClientWrapper


def test_phase3_chain_returns_safe_summary() -> None:
    mock_client = MockSupabaseClient()
    store = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock"), mock_client=mock_client)

    result = run_phase3_readonly_chain(store=store, worker_id="worker-1", job=_job())

    assert result["status"] == "COMPLETED"
    assert result["persisted_output"]["phase_label"] == "PHASE-2"
    assert result["bridged_output"]["bridge_mode"] == "controlled_mock_verified"
    assert result["evidence_dry_run_output"]["bridge_mode"] == "controlled_evidence_dry_run"
    assert result["evidence_dry_run_output"]["dry_run"] is True
    assert result["evidence_dry_run_output"]["target_table"] == "automation_driver_outputs"
    assert result["evidence_dry_run_output"]["network_calls"] == 0
    assert len(mock_client.torob_readonly_outputs) == 1
    assert len(mock_client.readonly_bridge_outputs) == 1
    assert len(mock_client.evidence_dry_run_outputs) == 1


def test_phase3_chain_rejects_live_flag() -> None:
    mock_client = MockSupabaseClient()
    store = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock"), mock_client=mock_client)
    job = _job()
    job["live_execution_requested"] = True

    with pytest.raises(ValueError, match="non-live"):
        run_phase3_readonly_chain(store=store, worker_id="worker-1", job=job)

    assert not hasattr(mock_client, "evidence_dry_run_outputs")


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
