# ASAN M1.1 step 3 — build the repair SQL and the scan/classification document.
import json, os, sys, collections, re

sys.stdout.reconfigure(encoding="utf-8")
ROOT = r"D:\AfraKalaTest\app"


def mask_simple(s):
    return "".join(ch if len(ch.encode("utf-8")) == 1 else "?" * len(ch.encode("utf-8")) for ch in s)


d = json.load(open(os.path.join(ROOT, "docs/verification/asan/recover2.json"), encoding="utf-8"))

# Manual resolutions for rows the automatic pass could not separate.
# price_change_reasons: the 2026-07-11 re-run inserted a *third* corrupted copy of the
# original six seed rows, in seed order. Positions 1,2,4,5 are unambiguous and match the
# seed order exactly, which fixes positions 3 and 6.
SUF = " [auto-disabled: no profit/cost data]" * 3
MANUAL = {
    ("price_change_reasons", "title", "21e1fb0b-3882-4c6a-8bb2-b1060cd3f5a7"): "تغییر هزینه حمل",
    ("price_change_reasons", "title", "c5a2e5d5-cb45-4509-aa21-46cff3527bde"): "تغییر سیاست سود",
    # description corrupted first, then the KPI engine appended an ASCII suffix three times.
    # Only the Persian prefix is repaired; the suffix is carried over byte for byte.
    ("gamification_kpis", "description", "28882d4b-ed73-47d9-8289-45041c9de6b4"):
        "جمع سود فاکتورهای فروش در ماه جاری" + SUF,
    ("gamification_kpis", "description", "ecafb341-4d4f-4372-b41a-2c5c789bb8ec"):
        "نسبت سود به دقایق مکالمه" + SUF,
}

resolved, unresolved = [], []
for o in d:
    k = (o["table"], o["column"], o["pk"])
    if k in MANUAL:
        txt = MANUAL[k]
        assert mask_simple(txt) == o["corrupt"], k
        o["chosen"] = txt
        o["evidence"] = "manual: seed order of migration 20260424162922"
        resolved.append(o)
    elif o["pass"] in (1, 2) and len(o["top"]) == 1:
        o["chosen"] = o["top"][0]["text"]
        o["evidence"] = o["top"][0]["file"]
        assert mask_simple(o["chosen"]) == o["corrupt"], k
        assert "?" not in o["chosen"], k
        resolved.append(o)
    else:
        unresolved.append(o)

print(f"resolved={len(resolved)} unresolved={len(unresolved)}", file=sys.stderr)

# consistency check: sibling columns of one row must co-occur on one source line
byrow = collections.defaultdict(dict)
for o in resolved:
    byrow[(o["table"], o["pk"])][o["column"]] = o["chosen"]

sources = {}
for sub, exts in [("supabase/migrations", (".sql",)), ("src", (".ts", ".tsx")), ("docs", (".md", ".sql"))]:
    for dp, _, fns in os.walk(os.path.join(ROOT, sub)):
        if "node_modules" in dp:
            continue
        for fn in fns:
            if fn.endswith(exts):
                p = os.path.join(dp, fn)
                try:
                    sources[p] = open(p, encoding="utf-8").read()
                except Exception:
                    pass

bad = []
for (tbl, pk), cols in byrow.items():
    if len(cols) < 2:
        continue
    vals = list(cols.values())
    ok = False
    for txt in sources.values():
        base = vals[0]
        start = 0
        while True:
            p = txt.find(base, start)
            if p < 0:
                break
            start = p + 1
            win = txt[max(0, p - 1500): p + len(base) + 1500]
            if all(v in win for v in vals):
                ok = True
                break
        if ok:
            break
    if not ok:
        bad.append((tbl, pk, cols))
print(f"multi-column rows checked={sum(1 for c in byrow.values() if len(c)>1)} inconsistent={len(bad)}", file=sys.stderr)
for b in bad[:10]:
    print("  INCONSISTENT", b[0], b[1], list(b[2].keys()), file=sys.stderr)

json.dump({"resolved": resolved, "unresolved": unresolved},
          open(os.path.join(ROOT, "docs/verification/asan/repair-plan.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
