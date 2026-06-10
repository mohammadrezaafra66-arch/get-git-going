from __future__ import annotations

import pytest

from supabase_client import MockSupabaseClient, build_controlled_driver_output_row


def valid_payload():
    return {
        "job_id": "job-1",
        "run_id": "run-1",
        "driver_name": "mock",
        "job_type": "MOCK_DRIVER_RUN",
        "status": "COMPLETED",
        "output": {"driver": "mock"},
        "checkpoint": {"step": "done"},
        "errors": [],
        "source_kind": "mock",
    }


def test_controlled_output_contract_accepts_mock_only_payload():
    row = build_controlled_driver_output_row(**valid_payload())

    assert row["job_id"] == "job-1"
    assert row["run_id"] == "run-1"
    assert row["driver_name"] == "mock"
    assert row["job_type"] == "MOCK_DRIVER_RUN"
    assert row["status"] == "COMPLETED"
    assert row["source_kind"] == "mock"
    assert row["phase_label"] == "PHASE-1"
    assert row["output"]["driver"] == "mock"
    assert row["checkpoint"]["step"] == "done"
    assert row["errors"] == []


@pytest.mark.parametrize(
    ("field", "bad_value"),
    [
        ("driver_name", "torob"),
        ("job_type", "REAL_SOURCE_RUN"),
        ("source_kind", "external_read_only"),
        ("status", "RUNNING"),
    ],
)
def test_controlled_output_contract_rejects_non_mock_or_invalid_values(field, bad_value):
    payload = valid_payload()
    payload[field] = bad_value

    with pytest.raises(ValueError):
        build_controlled_driver_output_row(**payload)


def test_controlled_output_contract_rejects_non_object_output():
    payload = valid_payload()
    payload["output"] = []

    with pytest.raises(TypeError):
        build_controlled_driver_output_row(**payload)


def test_controlled_output_contract_rejects_non_array_errors():
    payload = valid_payload()
    payload["errors"] = "not-an-array"

    with pytest.raises(TypeError):
        build_controlled_driver_output_row(**payload)


def test_mock_client_uses_controlled_output_contract():
    client = MockSupabaseClient()
    row = client.save_driver_output(**valid_payload())

    assert len(client.driver_outputs) == 1
    assert client.driver_outputs[0] == row
    assert row["phase_label"] == "PHASE-1"


def test_mock_client_rejects_non_mock_driver_name():
    client = MockSupabaseClient()
    payload = valid_payload()
    payload["driver_name"] = "not_mock"

    with pytest.raises(ValueError):
        client.save_driver_output(**payload)
