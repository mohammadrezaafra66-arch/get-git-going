from __future__ import annotations

import pytest

from config import RuntimeConfig
from supabase_client import MockSupabaseClient, SupabaseClientWrapper
from torob_readonly_output_persistence import build_torob_readonly_output_row


def test_mock_client_persists_validated_torob_readonly_row() -> None:
    client = MockSupabaseClient()
    row = _row()

    persisted = client.persist_torob_readonly_output(row)

    assert persisted["driver_name"] == "torob_limited_readonly"
    assert persisted["job_type"] == "TOROB_LIMITED_READONLY"
    assert persisted["source_kind"] == "external_read_only"
    assert persisted["phase_label"] == "PHASE-2"
    assert persisted["worker_boundary"] == "controlled_torob_readonly_mock"
    assert persisted["output"]["live_execution"] is False
    assert persisted["output"]["network_calls"] == 0
    assert client.torob_readonly_outputs == [persisted]


def test_wrapper_delegates_torob_readonly_persistence() -> None:
    mock_client = MockSupabaseClient()
    wrapper = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock"), mock_client=mock_client)

    persisted = wrapper.persist_torob_readonly_output(_row())

    assert persisted["worker_boundary"] == "controlled_torob_readonly_mock"
    assert len(mock_client.torob_readonly_outputs) == 1


def test_invalid_torob_row_is_rejected_and_not_stored() -> None:
    client = MockSupabaseClient()
    row = _row()
    row["driver_name"] = "mock"

    with pytest.raises(ValueError, match="driver_name"):
        client.persist_torob_readonly_output(row)

    assert client.torob_readonly_outputs == []


def _row() -> dict[str, object]:
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
            "network_calls": 0,
            "max_total_requests": 10,
            "abort_reason": None,
            "normalized_items": [
                {
                    "test_product_id": "item-1",
                    "product_name": "Example product",
                    "product_url": "https://example.test/product",
                    "seller_name": None,
                    "price": None,
                    "availability_status": "deterministic_local",
                    "http_status": None,
                    "final_url": "https://example.test/product",
                    "body_preview_length": 0,
                    "status": "ok",
                    "error_code": None,
                }
            ],
        },
        checkpoint={
            "driver": "torob_limited_readonly",
            "step": "deterministic_local_completed",
            "progress": 100,
            "live_execution": False,
            "network_calls": 0,
        },
        errors=[],
    )
