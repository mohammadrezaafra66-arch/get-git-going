"""Re-score existing product.torob_url values with the hard matcher."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from link_discovery import THRESHOLD, evaluate_candidate, title_from_url  # noqa: E402


def rescore_row(row: dict) -> dict:
    url = row.get("torob_url") or ""
    ev = evaluate_candidate(row, title_from_url(url), url)
    hard = {
        "brand": "fail" if "brand_mismatch" in ev["hard_fails"] else "pass",
        "model": (
            "n/a"
            if not ev.get("model_required")
            else ("fail" if "model_mismatch" in ev["hard_fails"] else "pass")
        ),
        "capacity": (
            "n/a"
            if not ev.get("capacity_required")
            else ("fail" if "capacity_mismatch" in ev["hard_fails"] else "pass")
        ),
        "colour": (
            "fail"
            if "color_mismatch" in ev["hard_fails"]
            else ("unverified" if "colour_unverified" in ev["reasons"] else "pass")
        ),
    }
    survives = ev["eligible"] and ev["score"] >= THRESHOLD
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "url": url,
        "score": ev["score"],
        "eligible": ev["eligible"],
        "survives": survives,
        "hard": hard,
        "hard_fails": ev["hard_fails"],
        "reasons": ev["reasons"],
    }


if __name__ == "__main__":
    rows = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = [rescore_row(r) for r in rows]
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
