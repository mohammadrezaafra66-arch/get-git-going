from __future__ import annotations

import pytest

from drivers import torob_limited_readonly as torob
from drivers.torob_limited_readonly import LIVE_EXECUTION_ACK, TorobLimitedReadOnlyDriver
from test_torob_limited_readonly_contract import build_context, valid_job


def live_job(*, item_count: int = 1) -> dict:
    job = valid_job(item_count=item_count)
    for index, item in enumerate(job["items"], start=1):
        item["product_url"] = f"https://torob.com/p/test-product-{index}/"
    job["live_execution_requested"] = True
    job["execution_packet"] = "TPC-2-004"
    job["manual_execution_ack"] = LIVE_EXECUTION_ACK
    job["operator"] = "test-operator"
    job["environment"] = "local-test"
    job["branch"] = "feat/tpc-2-004-torob-guarded-live-readiness"
    job["commit_hash"] = "test-commit"
    job["limits"]["min_delay_ms_between_requests"] = 3000
    job["limits"]["max_total_requests"] = 10
    job["operator_confirmations"] = {
        "no_secrets": True,
        "no_login_session_cookie": True,
        "no_browser_automation": True,
        "manual_not_scheduled": True,
        "read_only": True,
        "non_production_impacting": True,
    }
    return job


def test_live_execution_requires_explicit_acknowledgement():
    driver = TorobLimitedReadOnlyDriver()
    job = live_job()
    job["manual_execution_ack"] = "wrong"

    with pytest.raises(ValueError, match="manual acknowledgement"):
        driver.validate_input(job)


def test_live_execution_rejects_more_than_three_items():
    driver = TorobLimitedReadOnlyDriver()
    job = live_job(item_count=4)

    with pytest.raises(ValueError, match="live execution items count must be <= 3"):
        driver.validate_input(job)


def test_live_execution_rejects_non_torob_url():
    driver = TorobLimitedReadOnlyDriver()
    job = live_job()
    job["items"][0]["product_url"] = "https://example.test/not-torob"

    with pytest.raises(ValueError, match="public https Torob URL"):
        driver.validate_input(job)


def test_live_execution_rejects_delay_under_three_seconds():
    driver = TorobLimitedReadOnlyDriver()
    job = live_job()
    job["limits"]["min_delay_ms_between_requests"] = 2999

    with pytest.raises(ValueError, match="live min_delay_ms_between_requests must be >= 3000"):
        driver.validate_input(job)


def test_guarded_live_run_uses_patchable_fetch_and_records_network_count(monkeypatch):
    driver = TorobLimitedReadOnlyDriver()
    job = live_job(item_count=1)

    def fake_fetch(url: str) -> torob.PublicFetchResponse:
        return torob.PublicFetchResponse(status_code=200, final_url=url, body_preview="<html>ok</html>")

    monkeypatch.setattr(torob, "_fetch_public_url", fake_fetch)

    result = driver.run(job, build_context())
    output = result.output

    assert result.status == "COMPLETED"
    assert output["live_execution"] is True
    assert output["read_only_confirmed"] is True
    assert output["browser_automation"] is False
    assert output["network_calls"] == 1
    assert output["abort_reason"] is None
    assert output["items_completed"] == 1
    assert output["normalized_items"][0]["price"] is None
    assert output["normalized_items"][0]["availability_status"] == "fetched_read_only"


def test_guarded_live_run_aborts_on_403_without_bypass(monkeypatch):
    driver = TorobLimitedReadOnlyDriver()
    job = live_job(item_count=1)

    def fake_fetch(url: str) -> torob.PublicFetchResponse:
        return torob.PublicFetchResponse(status_code=403, final_url=url, body_preview="forbidden")

    monkeypatch.setattr(torob, "_fetch_public_url", fake_fetch)

    result = driver.run(job, build_context())
    output = result.output

    assert result.status == "SKIPPED"
    assert result.errors == ["blocked_http_403"]
    assert output["network_calls"] == 1
    assert output["abort_reason"] == "blocked_http_403"
    assert output["normalized_items"] == []


def test_live_execution_missing_confirmation_rejected_before_fetch(monkeypatch):
    driver = TorobLimitedReadOnlyDriver()
    job = live_job()
    job["operator_confirmations"]["no_browser_automation"] = False

    def forbidden_fetch(url: str) -> torob.PublicFetchResponse:
        raise AssertionError(f"fetch must not be called for invalid preflight: {url}")

    monkeypatch.setattr(torob, "_fetch_public_url", forbidden_fetch)

    with pytest.raises(ValueError, match="missing required live confirmations"):
        driver.run(job, build_context())
