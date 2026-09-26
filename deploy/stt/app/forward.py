from __future__ import annotations

import os
import time
from typing import Any

import httpx

TARGETS = [
    t.strip()
    for t in os.environ.get(
        "STT_TARGETS",
        "http://192.168.170.8:3100/api/public/hooks/call-transcript",
    ).split(",")
    if t.strip()
]


def worker_token() -> str:
    return os.environ.get("CALL_TRANSCRIPT_WORKER_TOKEN", "")


async def post_segment(payload: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    token = worker_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        for url in TARGETS:
            t0 = time.perf_counter()
            try:
                r = await client.post(url, json=payload, headers=headers)
                results.append(
                    {
                        "url": url,
                        "status": r.status_code,
                        "ms": int((time.perf_counter() - t0) * 1000),
                        "ok": r.is_success,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                results.append(
                    {
                        "url": url,
                        "status": 0,
                        "ms": int((time.perf_counter() - t0) * 1000),
                        "ok": False,
                        "error": type(exc).__name__,
                    }
                )
    return results
