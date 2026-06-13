"""Guarded Phase 2 Torob queue smoke runner.

This module processes exactly one queued TOROB_LIMITED_READONLY job in a
controlled non-live smoke path. It does not make external Torob requests,
does not use browser automation, and does not change AfraKala business data.

Purpose:
- prove the database-backed queue -> worker -> run result path,
- keep live execution disabled until a separate approved evidence run,
- leave source-driver live reads behind explicit TPC-2-004 acknowledgement.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from drivers.torob_limited_readonly import TorobLimitedReadOnlyDriver
from drivers.base import DriverContext

JOB_TYPE = "TOROB_LIMITED_READONLY"
MODULE_KEY = "torob_limited_readonly"
PHASE_LABEL = "PHASE-2"
DRIVER_NAME = "torob_limited_readonly"
SOURCE = "torob"
MODE = "read-only"


@dataclass(frozen=True)
class SmokeRunResult:
    job_id: str
    run_id: str
    status: str
    network_calls: int
    live_execution: bool
    output: dict[str, Any]


class PostgrestClient:
    """Tiny PostgREST client for local/manual service-role smoke runs."""

    def __init__(self, *, url: str, service_role_key: str) -> None:
        self.url = url.rstrip("/")
        self.service_role_key = service_role_key

    @classmethod
    def from_env(cls) -> "PostgrestClient":
        url = _require_env("SUPABASE_URL")
        key = _require_env("SUPABASE_SERVICE_ROLE_KEY")
        return cls(url=url, service_role_key=key)

    def get(self, path: str, params: dict[str, str]) -> Any:
        query = urlencode(params, safe=",.()")
        return self._request("GET", f"{path}?{query}")

    def post(self, path: str, body: dict[str, Any], *, prefer: str = "return=representation") -> Any:
        return self._request("POST", path, body=body, prefer=prefer)

    def patch(self, path: str, params: dict[str, str], body: dict[str, Any], *, prefer: str = "return=representation") -> Any:
        query = urlencode(params, safe=",.()")
        return self._request("PATCH", f"{path}?{query}", body=body, prefer=prefer)

    def _request(self, method: str, path: str, *, body: dict[str, Any] | None = None, prefer: str | None = None) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        request = Request(f"{self.url}{path}", data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=30) as response:  # nosec B310 - local Supabase/PostgREST control plane
                raw = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"PostgREST {method} {path} failed: HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError(f"PostgREST {method} {path} failed: {exc.reason}") from exc
        return json.loads(raw) if raw else None


def claim_next_torob_job(client: PostgrestClient) -> dict[str, Any] | None:
    rows = client.get(
        "/rest/v1/automation_jobs",
        {
            "select": "id,job_type,status,phase_label,payload,priority,created_at",
            "job_type": f"eq.{JOB_TYPE}",
            "status": "eq.PENDING",
            "order": "priority.desc,created_at.asc",
            "limit": "1",
        },
    )
    if not rows:
        return None
    job = rows[0]
    updated = client.patch(
        "/rest/v1/automation_jobs",
        {"id": f"eq.{job['id']}", "status": "eq.PENDING"},
        {"status": "CLAIMED", "claimed_at": _now()},
    )
    if not updated:
        return None
    return updated[0]


def create_run(client: PostgrestClient, *, job_id: str) -> dict[str, Any]:
    rows = client.post(
        "/rest/v1/automation_job_runs?select=id,job_id,status,phase_label,started_at",
        {
            "job_id": job_id,
            "status": "RUNNING",
            "phase_label": PHASE_LABEL,
            "started_at": _now(),
            "result": {"driver_name": DRIVER_NAME, "smoke_only": True, "live_execution": False},
        },
    )
    return rows[0]


def complete_run(client: PostgrestClient, *, run_id: str, status: str, result: dict[str, Any], error_message: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {
        "status": status,
        "result": result,
        "completed_at": _now(),
    }
    if error_message:
        body["error_message"] = error_message
    rows = client.patch("/rest/v1/automation_job_runs", {"id": f"eq.{run_id}"}, body)
    return rows[0]


def write_log_event(
    client: PostgrestClient,
    *,
    run_id: str,
    job_id: str,
    event_type: str,
    message: str,
    payload: dict[str, Any],
) -> None:
    client.post(
        "/rest/v1/automation_log_events",
        {
            "run_id": run_id,
            "job_id": job_id,
            "event_type": event_type,
            "message": message,
            "payload": payload,
            "occurred_at": _now(),
            "phase_label": PHASE_LABEL,
        },
        prefer="return=minimal",
    )


def build_non_live_driver_job(queue_job: dict[str, Any], *, run_id: str) -> dict[str, Any]:
    payload = queue_job.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("automation job payload must be an object")
    items = payload.get("items")
    limits = payload.get("limits")
    return {
        "id": str(queue_job["id"]),
        "run_id": run_id,
        "type": JOB_TYPE,
        "job_type": JOB_TYPE,
        "module": MODULE_KEY,
        "source": SOURCE,
        "mode": MODE,
        "items": items,
        "limits": limits,
        "live_execution_requested": False,
        "queue_live_execution_requested": bool(payload.get("live_execution_requested")),
        "smoke_only": True,
    }


def run_non_live_smoke(queue_job: dict[str, Any], *, run_id: str) -> SmokeRunResult:
    driver_job = build_non_live_driver_job(queue_job, run_id=run_id)
    driver = TorobLimitedReadOnlyDriver()
    result = driver.run(driver_job, DriverContext(worker_id="phase2-local-smoke", store=None, logger=None))
    output = dict(result.output)
    output.update(
        {
            "queue_job_id": str(queue_job["id"]),
            "smoke_only": True,
            "live_execution": False,
            "network_calls": 0,
            "external_requests_disabled": True,
            "queue_live_execution_requested": driver_job["queue_live_execution_requested"],
        }
    )
    return SmokeRunResult(
        job_id=str(queue_job["id"]),
        run_id=run_id,
        status=result.status,
        network_calls=0,
        live_execution=False,
        output=output,
    )


def process_one_pending_torob_job(client: PostgrestClient) -> SmokeRunResult | None:
    job = claim_next_torob_job(client)
    if job is None:
        return None
    run = create_run(client, job_id=str(job["id"]))
    run_id = str(run["id"])
    write_log_event(
        client,
        run_id=run_id,
        job_id=str(job["id"]),
        event_type="RUN_STARTED",
        message="Phase 2 Torob queue smoke run started; live requests disabled.",
        payload={"job_type": JOB_TYPE, "smoke_only": True, "live_execution": False},
    )
    try:
        smoke = run_non_live_smoke(job, run_id=run_id)
        complete_run(client, run_id=run_id, status="COMPLETED", result=smoke.output)
        write_log_event(
            client,
            run_id=run_id,
            job_id=smoke.job_id,
            event_type="RUN_COMPLETED",
            message="Phase 2 Torob queue smoke run completed without external requests.",
            payload={"network_calls": 0, "live_execution": False, "status": smoke.status},
        )
        return smoke
    except Exception as exc:  # noqa: BLE001 - convert worker exception to run failure
        complete_run(
            client,
            run_id=run_id,
            status="FAILED",
            result={"smoke_only": True, "live_execution": False, "error": str(exc)},
            error_message=str(exc),
        )
        write_log_event(
            client,
            run_id=run_id,
            job_id=str(job["id"]),
            event_type="RUN_FAILED",
            message="Phase 2 Torob queue smoke run failed before any external request.",
            payload={"network_calls": 0, "live_execution": False, "error": str(exc)},
        )
        raise


def main() -> int:
    client = PostgrestClient.from_env()
    result = process_one_pending_torob_job(client)
    if result is None:
        print(json.dumps({"processed": False, "reason": "no_pending_torob_job"}, ensure_ascii=False))
        return 0
    print(
        json.dumps(
            {
                "processed": True,
                "job_id": result.job_id,
                "run_id": result.run_id,
                "status": result.status,
                "network_calls": result.network_calls,
                "live_execution": result.live_execution,
            },
            ensure_ascii=False,
        )
    )
    return 0


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    raise SystemExit(main())
