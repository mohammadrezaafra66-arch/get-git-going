from __future__ import annotations

from torob_live_abort_evidence import build_abort_evidence
from torob_live_retry_policy import REPEATED_HTTP_ERROR_COOLDOWN_SECONDS


def test_build_abort_evidence_for_repeated_http_490_safe_abort() -> None:
    evidence = build_abort_evidence(
        driver_status="SKIPPED",
        output={
            "items_requested": 3,
            "items_completed": 0,
            "network_calls": 1,
            "live_execution": True,
            "browser_automation": False,
            "read_only_confirmed": True,
            "abort_reason": "http_error_490",
        },
        errors=["http_error_490"],
        consecutive_same_reason_count=2,
    )

    payload = evidence.as_dict()

    assert payload["accepted_as_safe_abort"] is True
    assert payload["driver_status"] == "SKIPPED"
    assert payload["abort_reason"] == "http_error_490"
    assert payload["items_requested"] == 3
    assert payload["items_completed"] == 0
    assert payload["network_calls"] == 1
    assert payload["live_execution"] is True
    assert payload["browser_automation"] is False
    assert payload["read_only_confirmed"] is True
    assert payload["errors"] == ["http_error_490"]
    retry = payload["retry_decision"]
    assert isinstance(retry, dict)
    assert retry["retry_allowed_now"] is False
    assert retry["reason"] == "http_error_490"
    assert retry["cooldown_seconds"] == REPEATED_HTTP_ERROR_COOLDOWN_SECONDS
    assert retry["next_action"] == "pause_live_retries"
    assert retry["no_bypass"] is True
    assert retry["no_login"] is True
    assert retry["no_cookie"] is True
    assert retry["no_browser_automation"] is True
    assert retry["no_scheduler"] is True
    assert retry["no_bulk_retry"] is True


def test_build_abort_evidence_does_not_accept_completed_run_as_safe_abort() -> None:
    evidence = build_abort_evidence(
        driver_status="COMPLETED",
        output={
            "items_requested": 1,
            "items_completed": 1,
            "network_calls": 1,
            "live_execution": True,
            "browser_automation": False,
            "read_only_confirmed": True,
            "abort_reason": None,
        },
        errors=[],
    )

    payload = evidence.as_dict()

    assert payload["accepted_as_safe_abort"] is False
    assert payload["abort_reason"] is None
    retry = payload["retry_decision"]
    assert isinstance(retry, dict)
    assert retry["next_action"] == "no_retry_needed"


def test_build_abort_evidence_preserves_guardrail_flags() -> None:
    evidence = build_abort_evidence(
        driver_status="SKIPPED",
        output={"abort_reason": "captcha_or_antibot_detected"},
        errors=["captcha_or_antibot_detected"],
    )

    payload = evidence.as_dict()

    assert payload["no_login_session_cookie"] is True
    assert payload["no_browser_automation"] is True
    assert payload["no_scheduler"] is True
    assert payload["no_bulk_crawl"] is True
    assert payload["no_business_writeback"] is True
    retry = payload["retry_decision"]
    assert isinstance(retry, dict)
    assert retry["next_action"] == "pause_and_request_human_review"
