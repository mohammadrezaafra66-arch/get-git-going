"""Minimal worker runtime entrypoint."""

from __future__ import annotations

from config import RuntimeConfig
from logger import get_logger, log_event


def main() -> int:
    config = RuntimeConfig.from_env()
    config.validate()
    runtime_logger = get_logger(level=config.log_level)
    log_event(runtime_logger, "INFO", "WORKER_BOOT", worker_id=config.worker_id, config=config.safe_summary())
    return 0
