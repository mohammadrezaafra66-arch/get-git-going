"""Torob limited read-only driver (Phase 2 — TPC-2-004).

Default behavior remains deterministic and non-live.

A guarded manual live-readiness path exists only when explicitly requested with
TPC-2-004 acknowledgements, strict limits, Torob public URLs, and no browser,
login, scheduler, bulk crawl, credentials, or write behavior.
"""

from __future__ import annotations

from dataclasses import dataclass
from time import sleep
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from drivers.base import DriverContext, DriverResult

DRIVER_NAME = "torob_limited_readonly"
JOB_TYPE = "TOROB_LIMITED_READONLY"
MODULE_KEY = "torob_limited_readonly"
SOURCE = "torob"
MODE = "read-only"

MIN_ITEMS = 1
MAX_ITEMS = 5
MAX_LIVE_ITEMS = 3
MIN_DELAY_MS = 2000
MIN_LIVE_DELAY_MS = 3000
MAX_CONCURRENCY = 1
MAX_SELLERS_PER_PRODUCT = 3
MAX_TOTAL_REQUESTS = 10
MAX_TOTAL_RUN_SECONDS = 300
FETCH_TIMEOUT_SECONDS = 20

LIVE_EXECUTION_PACKET = "TPC-2-004"
LIVE_EXECUTION_ACK = "TPC-2-004_MANUAL_TOROB_READONLY_ACK"
ALLOWED_LIVE_HOSTS = frozenset({"torob.com", "www.torob.com"})
DETERMINISTIC_EXTRACTED_AT = "1970-01-01T00:00:00Z"

FORBIDDEN_FLAGS = frozenset(
    {
        "login",
        "credentials",
        "secrets",
        "scheduler",
        "bulk_crawl",
        "browser_automation",
        "messaging",
        "ranking_manipulation",
    }
)

REQUIRED_LIVE_CONFIRMATIONS = frozenset(
    {
        "no_secrets",
        "no_login_session_cookie",
        "no_browser_automation",
        "manual_not_scheduled",
        "read_only",
        "non_production_impacting",
    }
)


@dataclass(frozen=True)
class PublicFetchResponse:
    """Small fetch envelope used by the guarded manual read-only path."""

    status_code: int
    final_url: str
    body_preview: str


def _job_type(job: dict[str, Any]) -> str | None:
    value = job.get("job_type", job.get("type"))
    if value is None:
        return None
    return str(value)


def _limits(job: dict[str, Any]) -> dict[str, Any]:
    raw = job.get("limits")
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValueError("limits must be a dict when provided")
    return raw


def _items(job: dict[str, Any]) -> list[dict[str, Any]]:
    raw = job.get("items")
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("items must be a list")
    return raw


def _truthy(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if isinstance(value, (list, dict, set, tuple)):
        return len(value) > 0
    return True


def _find_forbidden_flags(job: dict[str, Any]) -> list[str]:
    found: list[str] = []
    for key, value in job.items():
        if key in FORBIDDEN_FLAGS and _truthy(value):
            found.append(key)
    flags = job.get("flags")
    if isinstance(flags, dict):
        for key, value in flags.items():
            if key in FORBIDDEN_FLAGS and _truthy(value):
                found.append(f"flags.{key}")
    return found


def _live_requested(job: dict[str, Any]) -> bool:
    return _truthy(job.get("live_execution_requested")) or _truthy(job.get("live_readonly_execution"))


def _validate_item(item: Any, index: int) -> None:
    if not isinstance(item, dict):
        raise ValueError(f"items[{index}] must be a dict")
    for field in ("test_product_id", "product_name", "product_url"):
        if not str(item.get(field, "")).strip():
            raise ValueError(f"items[{index}].{field} is required")


def _url_host(value: str) -> str:
    parsed = urlparse(value)
    return (parsed.hostname or "").lower()


def _is_torob_public_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and (parsed.hostname or "").lower() in ALLOWED_LIVE_HOSTS


def _looks_like_block_or_login(response: PublicFetchResponse) -> str | None:
    final_url_lower = response.final_url.lower()
    body_lower = response.body_preview.lower()
    if response.status_code in {401, 403}:
        return f"blocked_http_{response.status_code}"
    if response.status_code >= 400:
        return f"http_error_{response.status_code}"
    if "captcha" in body_lower or "recaptcha" in body_lower:
        return "captcha_or_antibot_detected"
    if "login" in final_url_lower or "signin" in final_url_lower or "account" in final_url_lower:
        return "login_redirect_detected"
    if "ورود" in body_lower:
        return "login_text_detected"
    if not _is_torob_public_url(response.final_url):
        return f"unexpected_redirect_host:{_url_host(response.final_url)}"
    return None


def _fetch_public_url(url: str, *, timeout_seconds: int = FETCH_TIMEOUT_SECONDS) -> PublicFetchResponse:
    """Fetch a public URL with a simple honest request.

    This function is intentionally tiny and patchable in tests. It does not use
    cookies, login, sessions, browser automation, or third-party dependencies.
    """

    request = Request(
        url,
        headers={
            "User-Agent": "AfraKalaWorker/phase2-readonly-contact:ops@afrakala.local",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:  # nosec B310 - guarded public read-only path
            body = response.read(4096).decode("utf-8", errors="replace")
            return PublicFetchResponse(
                status_code=int(getattr(response, "status", 200)),
                final_url=str(response.geturl()),
                body_preview=body[:1000],
            )
    except HTTPError as exc:
        body = exc.read(1024).decode("utf-8", errors="replace")
        return PublicFetchResponse(status_code=int(exc.code), final_url=str(exc.url), body_preview=body[:1000])
    except URLError as exc:
        raise RuntimeError(f"public fetch failed: {exc.reason}") from exc


class TorobLimitedReadOnlyDriver:
    """Torob read-only driver with deterministic default and guarded live-readiness."""

    name = DRIVER_NAME

    def validate_input(self, job: dict[str, Any]) -> None:
        if not isinstance(job, dict):
            raise TypeError("job must be a dict")

        if _job_type(job) != JOB_TYPE:
            raise ValueError(f"driver only accepts {JOB_TYPE} jobs")

        if str(job.get("module", "")).strip() != MODULE_KEY:
            raise ValueError(f"module must be {MODULE_KEY}")

        if str(job.get("source", "")).strip() != SOURCE:
            raise ValueError(f"source must be {SOURCE}")

        if str(job.get("mode", "")).strip() != MODE:
            raise ValueError(f"mode must be {MODE}")

        items = _items(job)
        if len(items) < MIN_ITEMS or len(items) > MAX_ITEMS:
            raise ValueError(f"items count must be between {MIN_ITEMS} and {MAX_ITEMS}")

        for index, item in enumerate(items):
            _validate_item(item, index)

        limits = _limits(job)
        concurrency = limits.get("max_concurrency", MAX_CONCURRENCY)
        if int(concurrency) != MAX_CONCURRENCY:
            raise ValueError(f"max_concurrency must be {MAX_CONCURRENCY}")

        delay_ms = limits.get("min_delay_ms_between_requests", MIN_DELAY_MS)
        if int(delay_ms) < MIN_DELAY_MS:
            raise ValueError(f"min_delay_ms_between_requests must be >= {MIN_DELAY_MS}")

        max_sellers = limits.get("max_sellers_per_product", MAX_SELLERS_PER_PRODUCT)
        if int(max_sellers) > MAX_SELLERS_PER_PRODUCT:
            raise ValueError(f"max_sellers_per_product must be <= {MAX_SELLERS_PER_PRODUCT}")

        max_total = limits.get("max_total_run_seconds", MAX_TOTAL_RUN_SECONDS)
        if int(max_total) > MAX_TOTAL_RUN_SECONDS:
            raise ValueError(f"max_total_run_seconds must be <= {MAX_TOTAL_RUN_SECONDS}")

        forbidden = _find_forbidden_flags(job)
        if forbidden:
            joined = ", ".join(sorted(forbidden))
            raise ValueError(f"forbidden flags present: {joined}")

        if _live_requested(job):
            self._validate_live_guardrails(job)

    def _validate_live_guardrails(self, job: dict[str, Any]) -> None:
        items = _items(job)
        limits = _limits(job)

        if str(job.get("execution_packet", "")).strip() != LIVE_EXECUTION_PACKET:
            raise ValueError(f"live execution requires execution_packet={LIVE_EXECUTION_PACKET}")

        if str(job.get("manual_execution_ack", "")).strip() != LIVE_EXECUTION_ACK:
            raise ValueError("live execution requires explicit TPC-2-004 manual acknowledgement")

        if len(items) > MAX_LIVE_ITEMS:
            raise ValueError(f"live execution items count must be <= {MAX_LIVE_ITEMS}")

        if int(limits.get("min_delay_ms_between_requests", MIN_LIVE_DELAY_MS)) < MIN_LIVE_DELAY_MS:
            raise ValueError(f"live min_delay_ms_between_requests must be >= {MIN_LIVE_DELAY_MS}")

        if int(limits.get("max_total_requests", MAX_TOTAL_REQUESTS)) > MAX_TOTAL_REQUESTS:
            raise ValueError(f"max_total_requests must be <= {MAX_TOTAL_REQUESTS}")

        confirmations = job.get("operator_confirmations")
        if not isinstance(confirmations, dict):
            raise ValueError("operator_confirmations must be provided for live execution")
        missing = sorted(key for key in REQUIRED_LIVE_CONFIRMATIONS if not _truthy(confirmations.get(key)))
        if missing:
            raise ValueError(f"missing required live confirmations: {', '.join(missing)}")

        for field in ("operator", "environment", "branch", "commit_hash"):
            if not str(job.get(field, "")).strip():
                raise ValueError(f"{field} is required for live execution preflight")

        for index, item in enumerate(items):
            product_url = str(item.get("product_url", "")).strip()
            if not _is_torob_public_url(product_url):
                raise ValueError(f"items[{index}].product_url must be a public https Torob URL")

    def prepare(self, job: dict[str, Any]) -> None:
        return None

    def run(self, job: dict[str, Any], context: DriverContext) -> DriverResult:
        self.validate_input(job)
        if _live_requested(job):
            return self._run_guarded_live_readonly(job, context)
        return self._run_deterministic_skeleton(job)

    def _run_deterministic_skeleton(self, job: dict[str, Any]) -> DriverResult:
        job_id = str(job.get("id", "torob-skeleton-job"))
        run_id = str(job.get("run_id", "torob-skeleton-run"))
        items = _items(job)

        normalized_items = [
            {
                "job_id": job_id,
                "run_id": run_id,
                "source": SOURCE,
                "test_product_id": str(item["test_product_id"]),
                "product_name": str(item["product_name"]),
                "product_url": str(item["product_url"]),
                "seller_name": None,
                "price": None,
                "availability_status": "skeleton",
                "extracted_at": DETERMINISTIC_EXTRACTED_AT,
                "status": "ok",
                "error_code": None,
            }
            for item in items
        ]

        output = {
            "job_id": job_id,
            "run_id": run_id,
            "driver_id": DRIVER_NAME,
            "source": SOURCE,
            "mode": MODE,
            "items_requested": len(items),
            "read_only_confirmed": True,
            "live_execution": False,
            "browser_automation": False,
            "network_calls": 0,
            "normalized_items": normalized_items,
        }

        checkpoint = {
            "driver": DRIVER_NAME,
            "step": "torob_limited_readonly_skeleton_completed",
            "progress": 100,
            "items_requested": len(items),
            "live_execution": False,
        }

        result = DriverResult(status="COMPLETED", output=output, checkpoint=checkpoint, errors=[])
        result.validate()
        return result

    def _run_guarded_live_readonly(self, job: dict[str, Any], context: DriverContext) -> DriverResult:
        del context  # The first guarded live-readiness path has no store side effects.

        job_id = str(job.get("id", "torob-live-readonly-job"))
        run_id = str(job.get("run_id", "torob-live-readonly-run"))
        items = _items(job)
        limits = _limits(job)
        min_delay_seconds = int(limits.get("min_delay_ms_between_requests", MIN_LIVE_DELAY_MS)) / 1000
        max_total_requests = int(limits.get("max_total_requests", MAX_TOTAL_REQUESTS))

        normalized_items: list[dict[str, Any]] = []
        request_count = 0
        abort_reason: str | None = None

        for index, item in enumerate(items):
            if request_count + 1 > max_total_requests:
                abort_reason = "max_total_requests_would_be_exceeded"
                break

            if index > 0:
                sleep(min_delay_seconds)

            response = _fetch_public_url(str(item["product_url"]))
            request_count += 1
            abort_reason = _looks_like_block_or_login(response)
            if abort_reason:
                break

            normalized_items.append(
                {
                    "job_id": job_id,
                    "run_id": run_id,
                    "source": SOURCE,
                    "test_product_id": str(item["test_product_id"]),
                    "product_name": str(item["product_name"]),
                    "product_url": str(item["product_url"]),
                    "seller_name": None,
                    "price": None,
                    "availability_status": "fetched_read_only",
                    "http_status": response.status_code,
                    "final_url": response.final_url,
                    "body_preview_length": len(response.body_preview),
                    "status": "ok",
                    "error_code": None,
                }
            )

        completed = abort_reason is None and len(normalized_items) == len(items)
        output = {
            "job_id": job_id,
            "run_id": run_id,
            "driver_id": DRIVER_NAME,
            "source": SOURCE,
            "mode": MODE,
            "items_requested": len(items),
            "items_completed": len(normalized_items),
            "read_only_confirmed": True,
            "live_execution": True,
            "browser_automation": False,
            "network_calls": request_count,
            "max_total_requests": max_total_requests,
            "abort_reason": abort_reason,
            "normalized_items": normalized_items,
        }
        checkpoint = {
            "driver": DRIVER_NAME,
            "step": "torob_limited_readonly_guarded_live_completed" if completed else "torob_limited_readonly_guarded_live_aborted",
            "progress": 100 if completed else 0,
            "items_requested": len(items),
            "items_completed": len(normalized_items),
            "live_execution": True,
            "network_calls": request_count,
            "abort_reason": abort_reason,
        }
        errors = [] if completed else [str(abort_reason)]
        result = DriverResult(status="COMPLETED" if completed else "SKIPPED", output=output, checkpoint=checkpoint, errors=errors)
        result.validate()
        return result

    def cleanup(self, job: dict[str, Any]) -> None:
        return None
