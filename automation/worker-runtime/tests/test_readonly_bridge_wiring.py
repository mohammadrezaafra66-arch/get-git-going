from __future__ import annotations

import pytest

from config import RuntimeConfig
from supabase_client import MockSupabaseClient, SupabaseClientWrapper
from torob_readonly_output_persistence import build_torob_readonly_output_row


def test_mock_client_bridges_valid_readonly_row() -> None:
    client = MockSupabaseClient()
    record = client.bridge_readonly_output(_row(network_calls=0))

    assert record["bridge_mode"] == "controlled_mock_verified"
    assert record["target_table"] == "automation_driver_outputs"
    assert record["phase_label"] == "PHASE-2"
    assert record["source_kind"] == "external_read_only"
    assert record["live_execution"] is False
    assert record["network_calls"] == 0
    assert record["worker_boundary"] == "controlled_readonly_bridge_mock"
    assert client.readonly_bridge_outputs == [record]


def test_wrapper_bridges_valid_readonly_row() -> None:
    client = MockSupabaseClient()
    wrapper = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock"), mock_client=client)

    record = wrapper.bridge_readonly_output(_row(network_calls=0))

    assert record["bridge_mode"] == "controlled_mock_verified"
    assert len(client.readonly_bridge_outputs) == 1


def test_bridge_rejects_network_backed_row_and_does_not_store() -> None:
    client = MockSupabaseClient()

    with pytest.raises(ValueError, match="zero-network"):
        client.bridge_readonly_output(_row(network_calls=1))

    assert client.readonly_bridge_outputs == []


def _row(*, network_calls: int) -> dict[str, object]:
    return build_torob_readonly_output_row(
        job_id="job-1",
        run_id="run-1",
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
