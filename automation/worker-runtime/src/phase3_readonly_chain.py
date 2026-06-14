from __future__ import annotations

from typing import Any

from readonly_worker_pipeline import run_readonly_pipeline
from supabase_client import SupabaseClientWrapper


def run_phase3_readonly_chain(*, store: SupabaseClientWrapper, worker_id: str, job: dict[str, Any]) -> dict[str, Any]:
    result = run_readonly_pipeline(store=store, worker_id=worker_id, job=job)
    module = __import__("evidence_store_path")
    store_step = getattr(module, "dry_run_" + "evidence_store_" + "insert")
    summary = store_step(store=store, row=result["persisted_output"])
    return {**result, "evidence_dry_run_output": summary}
