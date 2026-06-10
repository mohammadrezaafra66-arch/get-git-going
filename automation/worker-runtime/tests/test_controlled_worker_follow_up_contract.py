from __future__ import annotations

import pytest

from config import RuntimeConfig
from supabase_client import MockSupabaseClient, SupabaseClientWrapper, build_controlled_driver_output_row


def valid_row():
    return build_controlled_driver_output_row(
        job_id="job-t014-1",
        run_id="run-t014-1",
        driver_name="mock",
        job_type="MOCK_DRIVER_RUN",
        status="COMPLETED",
        output={"driver": "mock", "step": "follow-up"},
        checkpoint={"step": "t014"},
        errors=[],
        source_kind="mock",
    )


def test_follow_up_accepts_valid_phase_1_mock_row():
    client = MockSupabaseClient()
    result = client.run_controlled_worker_follow_up(valid_row())

    assert result["driver_name"] == "mock"
    assert result["job_type"] == "MOCK_DRIVER_RUN"
    assert result["source_kind"] == "mock"
    assert result["phase_label"] == "PHASE-1"
    assert result["follow_up_boundary"] == "controlled_mock_only"
    assert len(client.worker_follow_up_outputs) == 1


def test_wrapper_follow_up_accepts_valid_phase_1_mock_row():
    wrapper = SupabaseClientWrapper(config=RuntimeConfig(worker_mode="mock", worker_id="test-worker"), mock_client=MockSupabaseClient())
    result = wrapper.run_controlled_worker_follow_up(valid_row())

    assert result["follow_up_boundary"] == "controlled_mock_only"
    assert len(wrapper.client.worker_follow_up_outputs) == 1


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
def test_follow_up_rejects_invalid_values(field, bad_value):
    row = valid_row()
    row[field] = bad_value

    client = MockSupabaseClient()
    with pytest.raises(ValueError):
        client.run_controlled_worker_follow_up(row)


def test_follow_up_rejects_missing_job_id():
    row = valid_row()
    row.pop("job_id")

    client = MockSupabaseClient()
    with pytest.raises(ValueError):
        client.run_controlled_worker_follow_up(row)


def test_follow_up_rejects_bad_output_shape():
    row = valid_row()
    row["output"] = []

    client = MockSupabaseClient()
    with pytest.raises(TypeError):
        client.run_controlled_worker_follow_up(row)


def test_follow_up_rejects_bad_errors_shape():
    row = valid_row()
    row["errors"] = "not-a-list"

    client = MockSupabaseClient()
    with pytest.raises(TypeError):
        client.run_controlled_worker_follow_up(row)
