"""Structured logging helpers for the AfraKala worker skeleton."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


class JsonFormatter(logging.Formatter):
    """Small JSON formatter for deterministic worker logs."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        extras = getattr(record, "context", None)
        if isinstance(extras, dict):
            payload.update(extras)
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def get_logger(name: str = "afrakala.worker", level: str = "INFO") -> logging.Logger:
    """Create or reuse a JSON logger."""
    logger = logging.getLogger(name)
    logger.setLevel(_coerce_level(level))
    logger.propagate = False

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)

    return logger


def log_event(
    logger: logging.Logger,
    level: str,
    event: str,
    *,
    worker_id: str,
    job_id: str | None = None,
    **context: Any,
) -> None:
    """Log a structured event without exposing secrets."""
    safe_context = {
        "event": event,
        "worker_id": worker_id,
        "job_id": job_id,
        **_redact_sensitive(context),
    }
    logger.log(_coerce_level(level), event, extra={"context": safe_context})


def _coerce_level(level: str) -> int:
    return getattr(logging, level.upper(), logging.INFO)


def _redact_sensitive(context: dict[str, Any]) -> dict[str, Any]:
    redacted: dict[str, Any] = {}
    sensitive_markers = ("secret", "token", "key", "password", "cookie")

    for key, value in context.items():
        lowered = key.lower()
        if any(marker in lowered for marker in sensitive_markers):
            redacted[key] = "***REDACTED***"
        else:
            redacted[key] = value
    return redacted
