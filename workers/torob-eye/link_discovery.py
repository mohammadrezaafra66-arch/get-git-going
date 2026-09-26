"""Score Torob search hits and write empty product links. Never overwrite."""

from __future__ import annotations

import re
from typing import Any

COLORS = (
    "سفید",
    "نقره",
    "سیلور",
    "نقره‌ای",
    "مشکی",
    "سیاه",
    "طلایی",
    "طوسی",
    "خاکستری",
    "آبی",
    "قرمز",
    "سبز",
    "کرم",
    "white",
    "silver",
    "black",
    "gold",
    "gray",
    "grey",
    "blue",
    "red",
)

THRESHOLD = 0.55


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def colors_in(text: str) -> set[str]:
    n = _norm(text)
    found = set()
    for c in COLORS:
        if c in n:
            found.add(c)
    return found


def color_mismatch(product_name: str, candidate_name: str) -> bool:
    ours = colors_in(product_name)
    theirs = colors_in(candidate_name)
    if not ours or not theirs:
        return False
    return ours.isdisjoint(theirs)


def score_candidate(product_name: str, candidate_name: str) -> tuple[float, list[str]]:
    reasons: list[str] = []
    if color_mismatch(product_name, candidate_name):
        return 0.0, ["color_mismatch"]
    tokens = [t for t in re.split(r"[^\w\u0600-\u06FF]+", _norm(product_name)) if len(t) >= 2]
    hay = _norm(candidate_name)
    if not tokens:
        return 0.0, ["empty_product_name"]
    hits = sum(1 for t in tokens if t in hay)
    score = hits / len(tokens)
    reasons.append(f"token_hits={hits}/{len(tokens)}")
    return score, reasons


def pick_assignment(product: dict[str, Any], candidates: list[dict[str, Any]]) -> dict[str, Any]:
    name = product.get("name") or ""
    best = None
    best_score = -1.0
    best_reasons: list[str] = []
    rejected: list[dict[str, Any]] = []
    for cand in candidates:
        score, reasons = score_candidate(name, cand.get("name") or "")
        row = {
            "url": cand.get("url"),
            "score": score,
            "reasons": reasons,
            "assigned": False,
            "source": "torob-eye",
        }
        if "color_mismatch" in reasons:
            rejected.append(row)
            continue
        if score > best_score:
            best = row
            best_score = score
            best_reasons = reasons
    if best and best_score >= THRESHOLD:
        best["assigned"] = True
        best["reasons"] = best_reasons
        return {"chosen": best, "rejected": rejected}
    if best:
        best["assigned"] = False
        best["reasons"] = best_reasons + ["below_threshold"]
        rejected.append(best)
    return {"chosen": None, "rejected": rejected}
