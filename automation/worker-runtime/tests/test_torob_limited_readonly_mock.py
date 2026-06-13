from __future__ import annotations

import pytest

from drivers.torob_limited_readonly import TorobLimitedReadOnlyDriver
from test_torob_limited_readonly_contract import build_context, valid_job


def test_run_does_not_mutate_job_payload():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job(item_count=3)
    snapshot = repr(job)

    driver.validate_input(job)
    driver.run(job, build_context())

    assert repr(job) == snapshot


def test_run_returns_completed_without_external_side_effects():
    driver = TorobLimitedReadOnlyDriver()
    context = build_context()
    store = context.store

    before_logs = len(store.client.logs)
    result = driver.run(valid_job(item_count=1), context)

    assert result.status == "COMPLETED"
    assert result.errors == []
    assert len(store.client.logs) == before_logs


def test_max_sellers_per_product_above_limit_rejected():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job()
    job["limits"]["max_sellers_per_product"] = 4
    with pytest.raises(ValueError, match="max_sellers_per_product must be <="):
        driver.validate_input(job)


def test_max_total_run_seconds_above_limit_rejected():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job()
    job["limits"]["max_total_run_seconds"] = 301
    with pytest.raises(ValueError, match="max_total_run_seconds must be <="):
        driver.validate_input(job)


def test_wrong_job_type_rejected():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job()
    job["type"] = "MOCK_DRIVER_RUN"
    with pytest.raises(ValueError, match="driver only accepts TOROB_LIMITED_READONLY"):
        driver.validate_input(job)


def test_normalized_items_match_requested_items():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job(item_count=4)
    output = driver.run(job, build_context()).output

    assert output["items_requested"] == 4
    ids = [row["test_product_id"] for row in output["normalized_items"]]
    assert ids == [item["test_product_id"] for item in job["items"]]
