from __future__ import annotations

from typing import Any

from evidence_db_bridge import EvidenceDbBridge
from supabase_client import SupabaseClientWrapper

STORE_ATTR = "evidence_dry_run_outputs"


def dry_run_evidence_store_insert(*, store: SupabaseClientWrapper, row: dict[str, Any]) -> dict[str, Any]:
    bridge = EvidenceDbBridge()
    summary = bridge.dry_run_insert(row)
    client = store.client
    records = getattr(client, STORE_ATTR, None)
    if records is None:
        records = []
        setattr(client, STORE_ATTR, records)
    records.append(summary)
    return summary
