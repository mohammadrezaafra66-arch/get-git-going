"""Torob limited read-only driver skeleton (Phase 2 — TPC-2-003).

No network calls, browser automation, login, or external integration.
"""

from __future__ import annotations

from typing import Any

from drivers.base import DriverContext, DriverResult

DRIVER_NAME = "torob_limited_readonly"
JOB_TYPE = "TOROB_LIMITED_READONLY"
MODULE_KEY = "torob_limited_readonly"
SOURCE = "torob"
MODE = "read-only"

MIN_ITEMS = 1
MAX_ITEMS = 5
MIN_DELAY_MS = 2000
MAX_CONCURRENCY = 1
MAX_SELLERS_PER_PRODUCT = 3
MAX_TOTAL_RUN_SECONDS = 300

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


def _validate_item(item: Any, index: int) -> None:
    if not isinstance(item, dict):
        raise ValueError(f"items[{index}] must be a dict")
    for field in ("test_product_id", "product_name", "product_url"):
        if not str(item.get(field, "")).strip():
            raise ValueError(f"items[{index}].{field} is required")


class TorobLimitedReadOnlyDriver:
    """Deterministic Torob read-only driver skeleton — no live execution."""

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

    def prepare(self, job: dict[str, Any]) -> None:
        return None

    def run(self, job: dict[str, Any], context: DriverContext) -> DriverResult:
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

    def cleanup(self, job: dict[str, Any]) -> None:
        return None
