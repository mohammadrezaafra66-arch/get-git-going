from __future__ import annotations

from torob_live_retry_policy import (
    ANTIBOT_COOLDOWN_SECONDS,
    DEFAULT_HTTP_ERROR_COOLDOWN_SECONDS,
    REPEATED_HTTP_ERROR_COOLDOWN_SECONDS,
    as_evidence_payload,
    decide_retry_after_abort,
)


def test_no_abort_means_no_retry_needed() -> None:
    decision = decide_retry_after_abort(None)

    assert decision.retry_allowed_now is False
    assert decision.reason == "no_abort"
    assert decision.cooldown_seconds == 0
    assert decision.next_action == "no_retry_needed"


def test_single_http_error_requires_default_cooldown() -> None:
    decision = decide_retry_after_abort("http_error_490", consecutive_same_reason_count=1)

    assert decision.retry_allowed_now is False
    assert decision.reason == "http_error_490"
    assert decision.cooldown_seconds == DEFAULT_HTTP_ERROR_COOLDOWN_SECONDS
    assert decision.next_action == "cooldown_before_retry"


def test_repeated_http_error_requires_longer_pause() -> None:
    decision = decide_retry_after_abort("http_error_490", consecutive_same_reason_count=2)

    assert decision.retry_allowed_now is False
    assert decision.reason == "http_error_490"
    assert decision.cooldown_seconds == REPEATED_HTTP_ERROR_COOLDOWN_SECONDS
    assert decision.next_action == "pause_live_retries"
    assert "Do not continue rapid live retries" in decision.operator_note


def test_antibot_or_login_signal_requires_human_review() -> None:
    for reason in ("captcha_or_antibot_detected", "login_redirect_detected", "login_text_detected"):
        decision = decide_retry_after_abort(reason)
        assert decision.retry_allowed_now is False
        assert decision.cooldown_seconds == ANTIBOT_COOLDOWN_SECONDS
        assert decision.next_action == "pause_and_request_human_review"
        assert "Do not bypass" in decision.operator_note


def test_blocked_http_requires_human_review() -> None:
    decision = decide_retry_after_abort("blocked_http_403")

    assert decision.retry_allowed_now is False
    assert decision.cooldown_seconds == ANTIBOT_COOLDOWN_SECONDS
    assert decision.next_action == "pause_and_request_human_review"


def test_request_limit_abort_requires_scope_reduction() -> None:
    decision = decide_retry_after_abort("max_total_requests_would_be_exceeded")

    assert decision.retry_allowed_now is False
    assert decision.cooldown_seconds == 0
    assert decision.next_action == "reduce_scope_before_retry"


def test_evidence_payload_preserves_no_bypass_guardrails() -> None:
    decision = decide_retry_after_abort("http_error_490", consecutive_same_reason_count=2)
    payload = as_evidence_payload(decision)

    assert payload["retry_allowed_now"] is False
    assert payload["reason"] == "http_error_490"
    assert payload["no_bypass"] is True
    assert payload["no_login"] is True
    assert payload["no_cookie"] is True
    assert payload["no_browser_automation"] is True
    assert payload["no_scheduler"] is True
    assert payload["no_bulk_retry"] is True
