from __future__ import annotations

import pytest

from config import RuntimeConfig
from supabase_client import MockSupabaseClient, SupabaseClientWrapper, build_controlled_driver_output_row


def valid_row():
    return build_controlled_driver_output_row(
        job_id="job-live-1",
        run_id="run-live-1",
        driver_name="mock",
        job_type="MOCK_DRIVER_RUN",
        status="COMPLETED",
        output={"driver": "mock"},
        checkpoint={"step": "live-bridge-ready"},
        errors=[],
        source_kind="mock",
    )


def test_live_bridge_accepts_valid_mock_row():
    client = MockSupabaseClient()
    inserted = client.insert_live_controlled_driver_output(valid_row())

    assert inserted["job_id"] == "job-live-1"
    assert inserted["run_id"] == "run-live-1"
    assert inserted["driver_name"] == "mock"
    assert inserted["job_type"] == "MOCK_DRIVER_RUN"
    assert inserted["status"] == "COMPLETED"
    assert inserted["source_kind"] == "mock"
    assert inserted["phase_label"] == "PHASE-1"
    assert inserted["bridge_mode"] == "mock_verified"
    assert "live_inserted_at" in inserted
    assert len(client.live_inserted_driver_outputs) == 1


def test_wrapper_live_bridge_accepts_valid_mock_row():
    wrapper = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock", worker_id="test-worker"), mock_client=MockSupabaseClient())
    inserted = wrapper.insert_live_controlled_driver_output(valid_row())

    assert inserted["driver_name"] == "mock"
    assert len(wrapper.client.live_inserted_driver_outputs) == 1


@pytest.mark.parametrize(
    ("field", "bad_value"),
    [
        ("driver_name", "not_mock"),
        ("source_kind", "not_mock"),
        ("job_type", "OTHER_JOB"),
        ("status", "RUNNING"),
        ("phase_label", "FUTURE"),
    ],
)
def test_live_bridge_rejects_non_mock_or_invalid_values(field, bad_value):
    row = valid_row()
    row[field] = bad_value

    client = MockSupabaseClient()
    with pytest.raises(ValueError):
        client.insert_live_controlled_driver_output(row)


def test_live_bridge_rejects_missing_job_id():
    row = valid_row()
    row.pop("job_id")

    client = MockSupabaseClient()
    with pytest.raises(ValueError):
        client.insert_live_controlled_driver_output(row)


def test_live_bridge_rejects_non_object_output():
    row = valid_row()
    row["output"] = []

    client = MockSupabaseClient()
    with pytest.raises(TypeError):
        client.insert_live_controlled_driver_output(row)


def test_live_bridge_rejects_non_array_errors():
    row = valid_row()
    row["errors"] = "not-a-list"

    client = MockSupabaseClient()
    with pytest.raises(TypeError):
        client.insert_live_controlled_driver_output(row)


def test_live_bridge_unit_tests_do_not_need_non_mock_mode():
    wrapper = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock", worker_id="test-worker"))
    inserted = wrapper.insert_live_controlled_driver_output(valid_row())

    assert inserted["source_kind"] == "mock"
    assert inserted["bridge_mode"] == "mock_verified"
