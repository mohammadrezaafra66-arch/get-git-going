"""Central request routing / resource blocking policy for Playwright."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit

from runtime_settings import RuntimeSettings, load_runtime_settings


# Lightweight, maintainable denylist — host suffixes / path fragments only.
DEFAULT_BLOCK_HOST_SUFFIXES = (
    "google-analytics.com",
    "googletagmanager.com",
    "doubleclick.net",
    "facebook.net",
    "hotjar.com",
    "scorecardresearch.com",
)

DEFAULT_BLOCK_PATH_FRAGMENTS = (
    "/ads/",
    "adservice",
    "analytics.js",
    "gtag/js",
)


@dataclass
class ResourcePolicy:
    settings: RuntimeSettings = field(default_factory=load_runtime_settings)
    blocked_count: int = 0
    allowed_count: int = 0
    by_type: dict[str, int] = field(default_factory=dict)

    def should_block(self, resource_type: str, url: str) -> bool:
        rtype = (resource_type or "").lower()
        if rtype == "image" and self.settings.browser_block_images:
            return True
        if rtype == "media" and self.settings.browser_block_media:
            return True
        if rtype == "font" and self.settings.browser_block_fonts:
            return True
        if rtype == "stylesheet" and self.settings.browser_block_stylesheets:
            return True
        host = ""
        path = ""
        try:
            parts = urlsplit(url)
            host = (parts.hostname or "").lower()
            path = (parts.path or "").lower()
        except Exception:
            return False
        if any(host.endswith(suffix) for suffix in DEFAULT_BLOCK_HOST_SUFFIXES):
            return True
        if any(frag in path or frag in url.lower() for frag in DEFAULT_BLOCK_PATH_FRAGMENTS):
            return True
        return False

    def decide(self, resource_type: str, url: str) -> str:
        if self.should_block(resource_type, url):
            self.blocked_count += 1
            self.by_type[resource_type or "unknown"] = (
                self.by_type.get(resource_type or "unknown", 0) + 1
            )
            return "block"
        self.allowed_count += 1
        return "allow"

    def stats(self) -> dict[str, Any]:
        return {
            "blocked_resource_count": self.blocked_count,
            "allowed_resource_count": self.allowed_count,
            "blocked_by_type": dict(self.by_type),
        }

    def reset_stats(self) -> None:
        self.blocked_count = 0
        self.allowed_count = 0
        self.by_type.clear()


async def attach_route_blocker(context, policy: ResourcePolicy) -> None:
    """Install Playwright route handler on a context."""

    async def _handler(route):
        request = route.request
        decision = policy.decide(request.resource_type, request.url)
        if decision == "block":
            await route.abort()
        else:
            await route.continue_()

    await context.route("**/*", _handler)
