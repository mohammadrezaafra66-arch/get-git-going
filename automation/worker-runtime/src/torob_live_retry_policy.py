"""Retry/backoff policy for Phase 2 Torob live-readonly attempts.

The policy is intentionally conservative. It does not perform network calls and
must not bypass HTTP errors, anti-bot signals, login requirements, or rate
limits. It only converts observed abort reasons into an operator decision.
"""

from __future__ import annotations

from dataclasses import dataclass


DEFAULT_HTTP_ERROR_COOLDOWN_SECONDS = 60 * 60
REPEATED_HTTP_ERROR_COOLDOWN_SECONDS = 6 * 60 * 60
ANTIBOT_COOLDOWN_SECONDS = 24 * 60 * 60
MAX_SAME_ABORT_REASON_BEFORE_PAUSE = 2


@dataclass(frozen=True)
class RetryDecision:
    """Human/operator-facing decision after a guarded live-readonly abort."""

    retry_allowed_now: bool
    reason: str
    cooldown_seconds: int
    next_action: str
    operator_note: str


def decide_retry_after_abort(
    abort_reason: str | None,
    *,
    consecutive_same_reason_count: int = 1,
) -> RetryDecision:
    """Return the safest next action after a guarded live-readonly abort.

    Rules:
    - No abort means no retry is needed.
    - HTTP 490 and repeated HTTP errors require a pause before another live run.
    - Login/captcha/anti-bot signals require a long pause and human review.
    - The policy never recommends bypass, stealth, CAPTCHA solving, login,
      cookie/session use, browser automation, scheduler, or bulk retry.
    """

    reason = (abort_reason or "").strip()
    repeated = consecutive_same_reason_count >= MAX_SAME_ABORT_REASON_BEFORE_PAUSE

    if not reason:
        return RetryDecision(
            retry_allowed_now=False,
            reason="no_abort",
            cooldown_seconds=0,
            next_action="no_retry_needed",
            operator_note="Run completed without an abort; do not retry unless a new operator-scoped evidence run is required.",
        )

    if reason in {"captcha_or_antibot_detected", "login_redirect_detected", "login_text_detected"}:
        return RetryDecision(
            retry_allowed_now=False,
            reason=reason,
            cooldown_seconds=ANTIBOT_COOLDOWN_SECONDS,
            next_action="pause_and_request_human_review",
            operator_note="Stop live attempts. Do not bypass, solve CAPTCHA, login, use cookies, or switch to browser automation.",
        )

    if reason.startswith("blocked_http_"):
        return RetryDecision(
            retry_allowed_now=False,
            reason=reason,
            cooldown_seconds=ANTIBOT_COOLDOWN_SECONDS,
            next_action="pause_and_request_human_review",
            operator_note="Blocked HTTP status observed. Stop live attempts and review guardrails before any future run.",
        )

    if reason.startswith("http_error_"):
        cooldown = REPEATED_HTTP_ERROR_COOLDOWN_SECONDS if repeated else DEFAULT_HTTP_ERROR_COOLDOWN_SECONDS
        next_action = "pause_live_retries" if repeated else "cooldown_before_retry"
        note = (
            "Repeated HTTP errors observed. Do not continue rapid live retries in this session."
            if repeated
            else "Single HTTP error observed. Cool down before any new operator-approved live-readonly run."
        )
        return RetryDecision(
            retry_allowed_now=False,
            reason=reason,
            cooldown_seconds=cooldown,
            next_action=next_action,
            operator_note=note,
        )

    if reason == "max_total_requests_would_be_exceeded":
        return RetryDecision(
            retry_allowed_now=False,
            reason=reason,
            cooldown_seconds=0,
            next_action="reduce_scope_before_retry",
            operator_note="The configured request limit would be exceeded. Reduce product count before a new approved run.",
        )

    return RetryDecision(
        retry_allowed_now=False,
        reason=reason,
        cooldown_seconds=DEFAULT_HTTP_ERROR_COOLDOWN_SECONDS,
        next_action="pause_and_review_unknown_abort",
        operator_note="Unknown abort reason. Pause live retries and review evidence before another run.",
    )


def as_evidence_payload(decision: RetryDecision) -> dict[str, object]:
    """Return a JSON-safe evidence payload for docs/run records."""

    return {
        "retry_allowed_now": decision.retry_allowed_now,
        "reason": decision.reason,
        "cooldown_seconds": decision.cooldown_seconds,
        "next_action": decision.next_action,
        "operator_note": decision.operator_note,
        "no_bypass": True,
        "no_login": True,
        "no_cookie": True,
        "no_browser_automation": True,
        "no_scheduler": True,
        "no_bulk_retry": True,
    }
