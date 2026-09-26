"""Fetch/browser error taxonomy with retry metadata."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any
from urllib.parse import urlsplit, urlunsplit


class ErrorCategory(str, Enum):
    INVALID_URL = "invalid_url"
    TIMEOUT = "timeout"
    NETWORK = "network"
    RATE_LIMITED = "rate_limited"
    ACCESS_DENIED = "access_denied"
    CHALLENGE = "challenge"
    PARSER = "parser"
    BROWSER = "browser"
    RESOURCE_LIMIT = "resource_limit"
    HTTP = "http"
    UNKNOWN = "unknown"


@dataclass
class FetchError(Exception):
    message: str
    category: ErrorCategory = ErrorCategory.UNKNOWN
    retryable: bool = False
    retry_after: float | None = None
    severity: str = "error"
    status_code: int | None = None
    cause: BaseException | None = None

    def __post_init__(self) -> None:
        Exception.__init__(self, self.message)

    @property
    def safe_message(self) -> str:
        return self.message

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": type(self).__name__,
            "category": self.category.value,
            "retryable": self.retryable,
            "retry_after": self.retry_after,
            "severity": self.severity,
            "status_code": self.status_code,
            "message": self.safe_message,
        }


class InvalidUrlError(FetchError):
    def __init__(self, message: str = "invalid url", **kwargs: Any):
        super().__init__(
            message=message,
            category=ErrorCategory.INVALID_URL,
            retryable=False,
            severity="error",
            **kwargs,
        )


class HttpTimeoutError(FetchError):
    def __init__(self, message: str = "http timeout", **kwargs: Any):
        super().__init__(
            message=message,
            category=ErrorCategory.TIMEOUT,
            retryable=True,
            severity="warning",
            **kwargs,
        )


class BrowserTimeoutError(FetchError):
    def __init__(self, message: str = "browser timeout", **kwargs: Any):
        super().__init__(
            message=message,
            category=ErrorCategory.TIMEOUT,
            retryable=True,
            severity="warning",
            **kwargs,
        )


class NetworkError(FetchError):
    def __init__(self, message: str = "network error", **kwargs: Any):
        retryable = kwargs.pop("retryable", True)
        super().__init__(
            message=message,
            category=ErrorCategory.NETWORK,
            retryable=retryable,
            severity=kwargs.pop("severity", "warning"),
            **kwargs,
        )


class RateLimitedError(FetchError):
    def __init__(self, message: str = "rate limited", retry_after: float | None = None, **kwargs: Any):
        super().__init__(
            message=message,
            category=ErrorCategory.RATE_LIMITED,
            retryable=False,
            retry_after=retry_after,
            severity="warning",
            status_code=429,
            **kwargs,
        )


class AccessDeniedError(FetchError):
    def __init__(self, message: str = "access denied", status_code: int = 403, **kwargs: Any):
        super().__init__(
            message=message,
            category=ErrorCategory.ACCESS_DENIED,
            retryable=False,
            severity="error",
            status_code=status_code,
            **kwargs,
        )


class ChallengeDetectedError(FetchError):
    def __init__(self, message: str = "challenge detected", **kwargs: Any):
        super().__init__(
            message=message,
            category=ErrorCategory.CHALLENGE,
            retryable=False,
            severity="error",
            **kwargs,
        )


class ParserContractError(FetchError):
    def __init__(self, message: str = "parser contract failure", **kwargs: Any):
        super().__init__(
            message=message,
            category=ErrorCategory.PARSER,
            retryable=False,
            severity="error",
            **kwargs,
        )


class BrowserCrashedError(FetchError):
    def __init__(self, message: str = "browser crashed", **kwargs: Any):
        super().__init__(
            message=message,
            category=ErrorCategory.BROWSER,
            retryable=True,
            severity="error",
            **kwargs,
        )


class ResourceLimitError(FetchError):
    def __init__(self, message: str = "resource limit exceeded", **kwargs: Any):
        super().__init__(
            message=message,
            category=ErrorCategory.RESOURCE_LIMIT,
            retryable=False,
            severity="critical",
            **kwargs,
        )


def sanitize_url(url: str) -> str:
    """Strip query/fragment before logging."""
    try:
        parts = urlsplit(url)
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    except Exception:
        return "<invalid-url>"


def map_http_status(status: int, retry_after: float | None = None) -> FetchError:
    if status == 404:
        return AccessDeniedError("not found", status_code=404)
    if status == 401:
        return AccessDeniedError("unauthorized", status_code=401)
    if status == 403:
        return AccessDeniedError("forbidden", status_code=403)
    if status == 429:
        return RateLimitedError(retry_after=retry_after)
    if status in (500, 502, 503, 504):
        return NetworkError(f"server error {status}", status_code=status, retryable=True)
    return FetchError(
        message=f"http status {status}",
        category=ErrorCategory.HTTP,
        retryable=False,
        status_code=status,
    )


_CHALLENGE_MARKERS = (
    "captcha",
    "challenge",
    "access denied",
    "verify you are human",
    "cf-challenge",
    "attention required",
)


def detect_challenge(html: str | None, title: str | None = None) -> bool:
    blob = f"{title or ''}\n{html or ''}".lower()
    return any(marker in blob for marker in _CHALLENGE_MARKERS)


def compute_backoff(
    attempt: int,
    *,
    base: float,
    max_delay: float,
    rng=None,
) -> float:
    """delay = min(max, base * 2^attempt) + jitter."""
    import random

    exp = min(max_delay, base * (2 ** max(0, attempt)))
    jitter_src = rng if rng is not None else random
    jitter = jitter_src.uniform(0, max(0.0, base))
    return min(max_delay, exp + jitter)
