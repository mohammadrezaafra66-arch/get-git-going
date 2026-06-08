"""Graceful stop helpers for the minimal worker runtime."""

from __future__ import annotations

from threading import Event


_stop_requested = Event()


def request_stop() -> None:
    """Mark the worker for a graceful stop."""
    _stop_requested.set()


def should_stop() -> bool:
    """Return whether a graceful stop was requested."""
    return _stop_requested.is_set()


def reset_stop_for_tests() -> None:
    """Reset stop state for isolated tests."""
    _stop_requested.clear()
