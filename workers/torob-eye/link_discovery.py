"""Score Torob search hits. Hard brand / model / capacity first; tokens only rank."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import unquote

COLORS = (
    "سفید",
    "نقره‌ای",
    "نقره",
    "سیلور",
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

COLOR_GROUPS = (
    frozenset({"سفید", "white"}),
    frozenset({"مشکی", "سیاه", "black"}),
    frozenset({"نقره", "نقره‌ای", "سیلور", "silver"}),
    frozenset({"طلایی", "gold"}),
    frozenset({"طوسی", "خاکستری", "gray", "grey"}),
    frozenset({"آبی", "blue"}),
    frozenset({"قرمز", "red"}),
    frozenset({"سبز", "green"}),
    frozenset({"کرم"}),
)

# 0.57 Panasonic-style token overlap cannot assign even if hard checks pass.
THRESHOLD = 0.70

BRAND_ALIASES: dict[str, tuple[str, ...]] = {
    "پاناسونیک": ("پاناسونیک", "panasonic"),
    "panasonic": ("پاناسونیک", "panasonic"),
    "یونیوا": ("یونیوا", "uniwa", "uneva"),
    "جنرال": ("جنرال", "general"),
    "بوش": ("بوش", "bosch"),
    "بکو": ("بکو", "beko"),
    "جی بی ال": ("جی بی ال", "jbl"),
    "jbl": ("جی بی ال", "jbl"),
    "روبوراک": ("روبوراک", "roborock"),
    "نوتریکوک": ("نوتریکوک", "nutricook"),
    "کوخ": ("کوخ", "kuch"),
    "ایوولی": ("ایوولی", "evvoli"),
    "برفاب": ("برفاب", "barfab"),
    "مباشی": ("مباشی", "mobashi"),
    "پاکشوما": ("پاکشوما", "pakshoma"),
    "ال جی": ("ال جی", "الجی", "lg"),
    "الجی": ("ال جی", "الجی", "lg"),
    "سامسونگ": ("سامسونگ", "samsung"),
}

SERIES_ALIASES: dict[str, tuple[str, ...]] = {
    "مکس": ("مکس", "max"),
    "گلد": ("گلد", "gold"),
    "شکار": ("شکار",),
}

KNOWN_BRANDS = tuple(BRAND_ALIASES.keys())
PRODUCT_TYPE_SKIP = {
    "ماشین",
    "لباسشویی",
    "یخچال",
    "فریزر",
    "جاروبرقی",
    "جارو",
    "برقی",
    "کولر",
    "گازی",
    "اسپیکر",
    "مدل",
    "رنگ",
    "سرد",
    "گرم",
    "معمولی",
    "کیلویی",
}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _compact(text: str) -> str:
    return re.sub(r"[^a-z0-9\u0600-\u06FF]+", "", _norm(text))


def title_from_url(url: str) -> str:
    parts = [p for p in (url or "").split("/") if p]
    if not parts:
        return ""
    slug = parts[-1]
    if re.fullmatch(r"[A-Za-z0-9\-_]{12,}", slug):
        slug = parts[-2] if len(parts) >= 2 else slug
    return _norm(unquote(slug).replace("-", " "))


def colors_in(text: str) -> set[str]:
    n = _norm(text)
    found = set()
    for c in COLORS:
        if c in n:
            found.add(c)
    return found


def _color_groups(tokens: set[str]) -> set[frozenset[str]]:
    groups = set()
    for group in COLOR_GROUPS:
        if tokens & group:
            groups.add(group)
    return groups


def color_mismatch(product_name: str, candidate_name: str) -> bool:
    ours = _color_groups(colors_in(product_name))
    theirs = _color_groups(colors_in(candidate_name))
    if not ours or not theirs:
        return False
    return ours.isdisjoint(theirs)


def _is_model_code(raw: str) -> bool:
    s = (raw or "").strip()
    if len(s) < 3:
        return False
    if s.lower() in PRODUCT_TYPE_SKIP:
        return False
    return bool(re.search(r"[A-Za-z]", s)) and bool(re.search(r"\d", s))


def _model_keys(raw: str) -> set[str]:
    s = _norm(raw)
    keys = {s, s.replace("-", "").replace("_", "").replace(" ", "")}
    return {k for k in keys if k}


def extract_models(product: dict[str, Any]) -> list[str]:
    found: list[str] = []
    field = (product.get("model") or "").strip()
    if field and _is_model_code(field):
        found.append(field)
    name = product.get("name") or ""
    for m in re.finditer(r"مدل\s+([A-Za-z0-9][A-Za-z0-9\-_/\.]{1,24})", name, re.I):
        token = m.group(1)
        if _is_model_code(token):
            found.append(token)
    for m in re.finditer(r"\b([A-Za-z]{1,8}[-_]?[A-Za-z0-9]{2,16})\b", name):
        token = m.group(1)
        if _is_model_code(token):
            found.append(token)
    # de-dupe by compact key
    uniq: list[str] = []
    seen: set[str] = set()
    for item in found:
        key = _compact(item)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(item)
    return uniq


def extract_capacities(*texts: str | None) -> set[str]:
    out: set[str] = set()
    for raw in texts:
        if not raw:
            continue
        n = _norm(raw)
        n = re.sub(r"\d+\s*(?:وات|watt|w)\b", " ", n)
        for m in re.finditer(r"(\d+)\s*کیلو", n):
            out.add(f"{int(m.group(1))}kg")
        for m in re.finditer(r"(\d+)\s*فوت", n):
            out.add(f"{int(m.group(1))}ft")
        for m in re.finditer(r"(\d+)\s*هزار", n):
            out.add(str(int(m.group(1)) * 1000))
        for m in re.finditer(r"\b(\d{4,6})\b", n):
            out.add(str(int(m.group(1))))
    return out


def _alias_hit(token: str, hay: str, compact_hay: str) -> bool:
    aliases = BRAND_ALIASES.get(token, SERIES_ALIASES.get(token, (token,)))
    for alias in aliases:
        if alias in hay or _compact(alias) in compact_hay:
            return True
    return token in hay or _compact(token) in compact_hay


def extract_brand_tokens(product: dict[str, Any]) -> list[str]:
    tokens: list[str] = []
    brand = _norm(product.get("brand") or "")
    name = _norm(product.get("name") or "")
    blob = f"{brand} {name}"
    if brand:
        for part in re.split(r"\s+", brand):
            if part:
                tokens.append(part)
    for known in KNOWN_BRANDS:
        if known in blob and known not in tokens:
            tokens.append(known)
    for series in SERIES_ALIASES:
        if series in blob and series not in tokens:
            tokens.append(series)
    # de-dupe while keeping series even if brand already listed
    uniq: list[str] = []
    seen: set[str] = set()
    for tok in tokens:
        if tok in seen or tok in PRODUCT_TYPE_SKIP:
            continue
        seen.add(tok)
        uniq.append(tok)
    return uniq


def _haystack(candidate_name: str, candidate_url: str) -> str:
    return _norm(f"{candidate_name} {title_from_url(candidate_url)}")


def evaluate_candidate(
    product: dict[str, Any],
    candidate_name: str,
    candidate_url: str = "",
) -> dict[str, Any]:
    reasons: list[str] = []
    hard_fails: list[str] = []
    hay = _haystack(candidate_name, candidate_url)
    compact_hay = _compact(hay)
    our_name = product.get("name") or ""
    our_color_src = " ".join(x for x in [our_name, product.get("color") or ""] if x)

    for token in extract_brand_tokens(product):
        if not _alias_hit(token, hay, compact_hay):
            hard_fails.append("brand_mismatch")
            reasons.append(f"brand_mismatch:{token}")
            break

    models = extract_models(product)
    model_required = bool(models)
    if models:
        model_ok = False
        for model in models:
            if any(key and key in compact_hay for key in _model_keys(model) if len(key) >= 3):
                model_ok = True
                break
            if _norm(model) in hay:
                model_ok = True
                break
        if not model_ok:
            hard_fails.append("model_mismatch")
            reasons.append(f"model_mismatch:{models[0]}")

    ours_cap = extract_capacities(our_name, product.get("capacity"))
    for model in models:
        ours_cap -= {k for k in ours_cap if k.isdigit() and k in _compact(model)}
    capacity_required = bool(ours_cap)
    if ours_cap:
        theirs_cap = extract_capacities(hay, candidate_name, title_from_url(candidate_url))
        if not (ours_cap & theirs_cap):
            hard_fails.append("capacity_mismatch")
            reasons.append(f"capacity_mismatch:{','.join(sorted(ours_cap))}")

    ours_colors = colors_in(our_color_src)
    theirs_colors = colors_in(hay)
    if color_mismatch(our_color_src, hay):
        hard_fails.append("color_mismatch")
        reasons.append("color_mismatch")
    elif ours_colors and not theirs_colors:
        reasons.append("colour_unverified")

    score, token_reasons = score_candidate(our_name, f"{candidate_name} {title_from_url(candidate_url)}")
    if "color_mismatch" in token_reasons and "color_mismatch" not in hard_fails:
        hard_fails.append("color_mismatch")
    reasons.extend(token_reasons)
    eligible = not hard_fails
    return {
        "score": 0.0 if not eligible else score,
        "reasons": reasons,
        "hard_fails": hard_fails,
        "eligible": eligible,
        "model_required": model_required,
        "capacity_required": capacity_required,
    }


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
    eligible_rows: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for cand in candidates:
        ev = evaluate_candidate(product, cand.get("name") or "", cand.get("url") or "")
        row = {
            "url": cand.get("url"),
            "score": ev["score"],
            "reasons": ev["reasons"],
            "assigned": False,
            "source": "torob-eye",
            "hard_fails": ev["hard_fails"],
        }
        if not ev["eligible"]:
            rejected.append(row)
            continue
        eligible_rows.append(row)
    eligible_rows.sort(key=lambda r: float(r.get("score") or 0), reverse=True)
    if not eligible_rows:
        return {"chosen": None, "rejected": rejected}
    best = eligible_rows[0]
    rest = eligible_rows[1:]
    if float(best["score"]) >= THRESHOLD:
        best["assigned"] = True
        return {"chosen": best, "rejected": rejected + rest}
    best["assigned"] = False
    best["reasons"] = list(best["reasons"]) + ["below_threshold"]
    rejected.append(best)
    rejected.extend(rest)
    return {"chosen": None, "rejected": rejected}
