"""Build structured evidence payloads for guarded Torob live-readonly aborts.

This module does not perform network calls. It takes the driver output already
produced by a guarded live-readonly run and attaches the conservative retry
policy decision so operators can decide what to do next without rapid retrying.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from torob_live_retry_policy import as_evidence_payload, decide_retry_after_abort


@dataclass(frozen=True)
class AbortEvidence:
    """Structured evidence for a guarded live-readonly abort."""

    accepted_as_safe_abort: bool
    driver_status: str
    abort_reason: str | None
    items_requested: int
    items_completed: int
    network_calls: int
    live_execution: bool
    browser_automation: bool
    read_only_confirmed: bool
    errors: list[str]
    retry_decision: dict[str, object]

    def as_dict(self) -> dict[str, object]:
        return {
            "accepted_as_safe_abort": self.accepted_as_safe_abort,
            "driver_status": self.driver_status,
            "abort_reason": self.abort_reason,
            "items_requested": self.items_requested,
            "items_completed": self.items_completed,
            "network_calls": self.network_calls,
            "live_execution": self.live_execution,
            "browser_automation": self.browser_automation,
            "read_only_confirmed": self.read_only_confirmed,
            "errors": list(self.errors),
            "retry_decision": dict(self.retry_decision),
            "no_login_session_cookie": True,
            "no_browser_automation": True,
            "no_scheduler": True,
            "no_bulk_crawl": True,
            "no_business_writeback": True,
        }


def build_abort_evidence(
    *,
    driver_status: str,
    output: dict[str, Any],
    errors: list[str],
    consecutive_same_reason_count: int = 1,
) -> AbortEvidence:
    """Convert guarded live-readonly output into an operator evidence payload."""

    abort_reason = _optional_string(output.get("abort_reason"))
    retry_decision = decide_retry_after_abort(
        abort_reason,
        consecutive_same_reason_count=consecutive_same_reason_count,
    )
    accepted_as_safe_abort = driver_status == "SKIPPED" and bool(abort_reason)

    return AbortEvidence(
        accepted_as_safe_abort=accepted_as_safe_abort,
        driver_status=driver_status,
        abort_reason=abort_reason,
        items_requested=_int_value(output.get("items_requested")),
        items_completed=_int_value(output.get("items_completed")),
        network_calls=_int_value(output.get("network_calls")),
        live_execution=bool(output.get("live_execution")),
        browser_automation=bool(output.get("browser_automation")),
        read_only_confirmed=bool(output.get("read_only_confirmed")),
        errors=list(errors),
        retry_decision=as_evidence_payload(retry_decision),
    )


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _int_value(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return 0
