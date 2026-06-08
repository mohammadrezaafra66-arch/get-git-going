"""Runtime configuration for the AfraKala worker skeleton.

This module intentionally reads only environment variables and never logs secrets.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


TRUTHY = {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class RuntimeConfig:
    """Worker runtime configuration.

    `WORKER_MODE=mock` is the default and must not require real secrets.
    """

    worker_mode: str = "mock"
    worker_id: str = "local-worker-001"
    log_level: str = "INFO"
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    @property
    def is_mock(self) -> bool:
        return self.worker_mode.lower() == "mock"

    @classmethod
    def from_env(cls) -> "RuntimeConfig":
        return cls(
            worker_mode=os.getenv("WORKER_MODE", "mock").strip() or "mock",
            worker_id=os.getenv("WORKER_ID", "local-worker-001").strip() or "local-worker-001",
            log_level=os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO",
            supabase_url=_empty_to_none(os.getenv("SUPABASE_URL")),
            supabase_service_role_key=_empty_to_none(os.getenv("SUPABASE_SERVICE_ROLE_KEY")),
        )

    def validate(self) -> None:
        """Validate configuration.

        Mock mode is intentionally permissive. Non-mock mode requires Supabase placeholders to be set by the operator.
        """
        if self.is_mock:
            return

        missing: list[str] = []
        if not self.supabase_url:
            missing.append("SUPABASE_URL")
        if not self.supabase_service_role_key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")

        if missing:
            joined = ", ".join(missing)
            raise ValueError(f"Missing required environment variables for non-mock mode: {joined}")

    def safe_summary(self) -> dict[str, str | bool | None]:
        """Return a log-safe summary with secrets redacted."""
        return {
            "worker_mode": self.worker_mode,
            "worker_id": self.worker_id,
            "log_level": self.log_level,
            "supabase_url_set": bool(self.supabase_url),
            "supabase_service_role_key_set": bool(self.supabase_service_role_key),
        }


def _empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in TRUTHY
