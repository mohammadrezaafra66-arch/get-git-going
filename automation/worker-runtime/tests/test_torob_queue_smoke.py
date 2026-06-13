from __future__ import annotations

from typing import Any

import pytest

from torob_queue_smoke import build_non_live_driver_job, process_one_pending_torob_job, run_non_live_smoke


class FakePostgrestClient:
    def __init__(self) -> None:
        self.jobs = [
            {
                "id": "03114ffd-ebc1-4829-bf97-d2ca66269cd5",
                "job_type": "TOROB_LIMITED_READONLY",
                "status": "PENDING",
                "phase_label": "PHASE-2",
                "priority": 40,
                "created_at": "2026-06-13T00:00:00Z",
                "payload": _payload(live_requested=True),
            }
        ]
        self.runs: list[dict[str, Any]] = []
        self.logs: list[dict[str, Any]] = []

    def get(self, path: str, params: dict[str, str]) -> Any:
        assert path == "/rest/v1/automation_jobs"
        assert params["job_type"] == "eq.TOROB_LIMITED_READONLY"
        assert params["status"] == "eq.PENDING"
        return [job for job in self.jobs if job["status"] == "PENDING"][:1]

    def patch(self, path: str, params: dict[str, str], body: dict[str, Any], *, prefer: str = "return=representation") -> Any:
        del prefer
        if path == "/rest/v1/automation_jobs":
            job_id = params["id"].replace("eq.", "")
            for job in self.jobs:
                if job["id"] == job_id and job["status"] == "PENDING":
                    job.update(body)
                    return [dict(job)]
            return []
        if path == "/rest/v1/automation_job_runs":
            run_id = params["id"].replace("eq.", "")
            for run in self.runs:
                if run["id"] == run_id:
                    run.update(body)
                    return [dict(run)]
            return []
        raise AssertionError(f"unexpected patch path: {path}")

    def post(self, path: str, body: dict[str, Any], *, prefer: str = "return=representation") -> Any:
        if path.startswith("/rest/v1/automation_job_runs"):
            run = {"id": "run-001", **body}
            self.runs.append(run)
            return [dict(run)]
        if path == "/rest/v1/automation_log_events":
            self.logs.append({**body, "prefer": prefer})
            return None
        raise AssertionError(f"unexpected post path: {path}")


def test_build_non_live_driver_job_strips_live_request_from_queue_payload() -> None:
    queue_job = {
        "id": "job-001",
        "payload": _payload(live_requested=True),
    }

    driver_job = build_non_live_driver_job(queue_job, run_id="run-001")

    assert driver_job["type"] == "TOROB_LIMITED_READONLY"
    assert driver_job["job_type"] == "TOROB_LIMITED_READONLY"
    assert driver_job["module"] == "torob_limited_readonly"
    assert driver_job["source"] == "torob"
    assert driver_job["mode"] == "read-only"
    assert driver_job["live_execution_requested"] is False
    assert driver_job["queue_live_execution_requested"] is True
    assert driver_job["smoke_only"] is True


def test_run_non_live_smoke_does_not_make_external_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    import drivers.torob_limited_readonly as torob_driver

    def fail_fetch(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("non-live queue smoke must not fetch Torob")

    monkeypatch.setattr(torob_driver, "_fetch_public_url", fail_fetch)
    queue_job = {
        "id": "job-001",
        "payload": _payload(live_requested=True),
    }

    result = run_non_live_smoke(queue_job, run_id="run-001")

    assert result.status == "COMPLETED"
    assert result.network_calls == 0
    assert result.live_execution is False
    assert result.output["smoke_only"] is True
    assert result.output["live_execution"] is False
    assert result.output["network_calls"] == 0
    assert result.output["external_requests_disabled"] is True
    assert result.output["queue_live_execution_requested"] is True


def test_process_one_pending_torob_job_creates_run_and_logs_without_live_request(monkeypatch: pytest.MonkeyPatch) -> None:
    import drivers.torob_limited_readonly as torob_driver

    def fail_fetch(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("queue smoke must not fetch Torob")

    monkeypatch.setattr(torob_driver, "_fetch_public_url", fail_fetch)
    client = FakePostgrestClient()

    result = process_one_pending_torob_job(client)  # type: ignore[arg-type]

    assert result is not None
    assert result.status == "COMPLETED"
    assert client.jobs[0]["status"] == "CLAIMED"
    assert client.runs[0]["status"] == "COMPLETED"
    assert client.runs[0]["result"]["live_execution"] is False
    assert client.runs[0]["result"]["network_calls"] == 0
    assert [event["event_type"] for event in client.logs] == ["RUN_STARTED", "RUN_COMPLETED"]


def test_process_one_pending_torob_job_returns_none_when_queue_empty() -> None:
    client = FakePostgrestClient()
    client.jobs[0]["status"] = "CLAIMED"

    assert process_one_pending_torob_job(client) is None  # type: ignore[arg-type]


def _payload(*, live_requested: bool) -> dict[str, Any]:
    return {
        "module": "torob_limited_readonly",
        "job_type": "TOROB_LIMITED_READONLY",
        "source_kind": "torob",
        "mode": "read-only",
        "execution_packet": "TPC-2-004",
        "live_execution_requested": live_requested,
        "items": [
            {
                "test_product_id": "torob-ui-001",
                "product_name": "queued torob readonly product",
                "product_url": "https://torob.com/p/test-product/manual-check",
            }
        ],
        "limits": {
            "max_products": 3,
            "max_concurrency": 1,
            "min_delay_ms_between_requests": 3000,
            "max_sellers_per_product": 3,
            "max_total_run_seconds": 300,
            "max_total_requests": 10,
        },
        "operator_confirmations": {
            "no_secrets": True,
            "no_login_session_cookie": True,
            "no_browser_automation": True,
            "manual_not_scheduled": True,
            "read_only": True,
            "non_production_impacting": True,
        },
    }
