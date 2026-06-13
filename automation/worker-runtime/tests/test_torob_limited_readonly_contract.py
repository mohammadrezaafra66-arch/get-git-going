from __future__ import annotations

import pytest

from drivers.base import DriverContext, DriverResult
from drivers.torob_limited_readonly import (
    DRIVER_NAME,
    JOB_TYPE,
    TorobLimitedReadOnlyDriver,
)
from logger import get_logger
from supabase_client import MockSupabaseClient, SupabaseClientWrapper
from config import RuntimeConfig


def build_store() -> SupabaseClientWrapper:
    return SupabaseClientWrapper(config=RuntimeConfig(worker_id="test-worker"), mock_client=MockSupabaseClient())


def build_context() -> DriverContext:
    return DriverContext(worker_id="test-worker", store=build_store(), logger=get_logger("torob-contract-test"))


def valid_job(*, item_count: int = 3) -> dict:
    items = [
        {
            "test_product_id": f"torob-test-{index:03d}",
            "product_name": f"Sample product {index}",
            "product_url": f"https://example.test/torob/product/{index}",
        }
        for index in range(1, item_count + 1)
    ]
    return {
        "id": "job-torob-001",
        "run_id": "run-torob-001",
        "type": JOB_TYPE,
        "module": DRIVER_NAME,
        "source": "torob",
        "mode": "read-only",
        "items": items,
        "limits": {
            "max_products": 5,
            "max_concurrency": 1,
            "min_delay_ms_between_requests": 2000,
            "max_sellers_per_product": 3,
            "max_total_run_seconds": 300,
        },
    }


def test_valid_input_passes():
    driver = TorobLimitedReadOnlyDriver()
    driver.validate_input(valid_job(item_count=1))
    driver.validate_input(valid_job(item_count=5))


def test_more_than_five_items_rejected():
    driver = TorobLimitedReadOnlyDriver()
    with pytest.raises(ValueError, match="items count must be between"):
        driver.validate_input(valid_job(item_count=6))


def test_zero_items_rejected():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job(item_count=1)
    job["items"] = []
    with pytest.raises(ValueError, match="items count must be between"):
        driver.validate_input(job)


def test_wrong_source_rejected():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job()
    job["source"] = "divar"
    with pytest.raises(ValueError, match="source must be torob"):
        driver.validate_input(job)


def test_wrong_mode_rejected():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job()
    job["mode"] = "write"
    with pytest.raises(ValueError, match="mode must be read-only"):
        driver.validate_input(job)


def test_concurrency_above_one_rejected():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job()
    job["limits"]["max_concurrency"] = 2
    with pytest.raises(ValueError, match="max_concurrency must be 1"):
        driver.validate_input(job)


def test_delay_under_2000_ms_rejected():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job()
    job["limits"]["min_delay_ms_between_requests"] = 1999
    with pytest.raises(ValueError, match="min_delay_ms_between_requests must be >= 2000"):
        driver.validate_input(job)


@pytest.mark.parametrize(
    "flag_name",
    [
        "login",
        "credentials",
        "secrets",
        "scheduler",
        "bulk_crawl",
        "browser_automation",
        "messaging",
        "ranking_manipulation",
    ],
)
def test_forbidden_flags_rejected(flag_name: str):
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job()
    job[flag_name] = True
    with pytest.raises(ValueError, match="forbidden flags present"):
        driver.validate_input(job)


def test_forbidden_flags_in_flags_dict_rejected():
    driver = TorobLimitedReadOnlyDriver()
    job = valid_job()
    job["flags"] = {"browser_automation": True}
    with pytest.raises(ValueError, match="forbidden flags present"):
        driver.validate_input(job)


def test_output_shape_is_deterministic():
    driver = TorobLimitedReadOnlyDriver()
    context = build_context()
    job = valid_job(item_count=3)

    first = driver.run(job, context)
    second = driver.run(job, context)

    assert first.output == second.output
    assert first.status == "COMPLETED"
    assert isinstance(first, DriverResult)


def test_no_live_execution_flags_in_output():
    driver = TorobLimitedReadOnlyDriver()
    result = driver.run(valid_job(item_count=2), build_context())
    output = result.output

    assert output["driver_id"] == DRIVER_NAME
    assert output["source"] == "torob"
    assert output["mode"] == "read-only"
    assert output["read_only_confirmed"] is True
    assert output["live_execution"] is False
    assert output["browser_automation"] is False
    assert output["network_calls"] == 0
    assert output["items_requested"] == 2
    assert len(output["normalized_items"]) == 2

    for item in output["normalized_items"]:
        assert item["status"] == "ok"
        assert item["extracted_at"] == "1970-01-01T00:00:00Z"
        assert item["source"] == "torob"
