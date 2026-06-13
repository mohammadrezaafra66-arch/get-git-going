from __future__ import annotations

import pytest

from config import RuntimeConfig
from drivers.base import DriverResult
from supabase_client import MockSupabaseClient, SupabaseClientWrapper
from torob_worker_output_path import persist_torob_driver_result


def test_adapter_persists_valid_zero_network_result() -> None:
    mock_client = MockSupabaseClient()
    store = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock"), mock_client=mock_client)

    persisted = persist_torob_driver_result(
        store=store,
        job_id="job-1",
        run_id="run-1",
        driver_result=_result(0),
    )

    assert persisted["driver_name"] == "torob_limited_readonly"
    assert persisted["job_type"] == "TOROB_LIMITED_READONLY"
    assert persisted["source_kind"] == "external_read_only"
    assert persisted["phase_label"] == "PHASE-2"
    assert persisted["output"]["network_calls"] == 0
    assert len(mock_client.torob_readonly_outputs) == 1


def test_adapter_rejects_nonzero_network_count() -> None:
    store = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock"), mock_client=MockSupabaseClient())

    with pytest.raises(ValueError, match="zero-network"):
        persist_torob_driver_result(
            store=store,
            job_id="job-1",
            run_id="run-1",
            driver_result=_result(1),
        )


def _result(network_calls: int) -> DriverResult:
    return DriverResult(
        status="COMPLETED",
        output={
            "job_id": "job-1",
            "run_id": "run-1",
            "driver_id": "torob_limited_readonly",
            "source": "torob",
            "mode": "read-only",
            "items_requested": 1,
            "items_completed": 1,
            "read_only_confirmed": True,
            "live_execution": False,
            "browser_automation": False,
            "network_calls": network_calls,
            "max_total_requests": 10,
            "abort_reason": None,
            "normalized_items": [
                {
                    "test_product_id": "item-1",
                    "product_name": "Example product",
                    "product_url": "local-test-product",
                    "seller_name": None,
                    "price": None,
                    "availability_status": "deterministic_local",
                    "http_status": None,
                    "final_url": "local-test-product",
                    "body_preview_length": 0,
                    "status": "ok",
                    "error_code": None,
                }
            ],
        },
        checkpoint={"progress": 100, "network_calls": network_calls},
        errors=[],
    )
