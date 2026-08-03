# ASAN M1.1 — recover original Persian text for byte-masked ("?") values.
#
# The 2026-07-11 incident replaced every UTF-8 *byte* of a non-ASCII character
# with a literal '?'. So mask("سطح") == "??????". That makes recovery provable:
# a candidate string is the original iff mask(candidate) == corrupted_value.
import csv, os, re, sys, json

sys.stdout.reconfigure(encoding="utf-8")
ROOT = r"D:\AfraKalaTest\app"


def mask(s):
    out, idx = [], []
    for i, ch in enumerate(s):
        n = len(ch.encode("utf-8"))
        if n == 1:
            out.append(ch); idx.append(i)
        else:
            out.append("?" * n); idx.extend([i] * n)
    return "".join(out), idx


def mask_simple(s):
    return "".join(ch if len(ch.encode("utf-8")) == 1 else "?" * len(ch.encode("utf-8")) for ch in s)


SOURCE_GLOBS = [
    ("supabase/migrations", (".sql",)),
    ("src", (".ts", ".tsx")),
    ("docs", (".md", ".sql")),
    ("e2e", (".ts",)),
    ("scripts", (".ts", ".js", ".sql", ".py")),
]


def load_sources():
    files = []
    for sub, exts in SOURCE_GLOBS:
        base = os.path.join(ROOT, sub)
        for dirpath, dirnames, filenames in os.walk(base):
            if "node_modules" in dirpath or ".git" in dirpath:
                continue
            for fn in filenames:
                if fn.endswith(exts):
                    p = os.path.join(dirpath, fn)
                    try:
                        txt = open(p, encoding="utf-8").read()
                    except Exception:
                        continue
                    m, idx = mask(txt)
                    files.append((os.path.relpath(p, ROOT).replace("\\", "/"), txt, m, idx))
    return files


def score_hits(corrupt, files, key, table):
    """candidate text -> best score, with evidence."""
    cands = {}
    for relpath, txt, m, idx in files:
        start = 0
        while True:
            p = m.find(corrupt, start)
            if p < 0:
                break
            start = p + 1
            s_i = idx[p]
            s_j = idx[p + len(corrupt) - 1] + 1
            cand = txt[s_i:s_j]
            if mask_simple(cand) != corrupt:
                continue
            sc = 0
            ctx = txt[max(0, s_i - 2000): s_j + 2000]
            ls = txt.rfind("\n", 0, s_i) + 1
            le = txt.find("\n", s_j)
            line = txt[ls: le if le > 0 else len(txt)]
            if key and key in line:
                sc += 16
            if key and key in txt[max(0, s_i - 200): s_j + 200]:
                sc += 8
            if key and key in ctx:
                sc += 4
            if table in txt:
                sc += 2
            if table in ctx:
                sc += 2
            if relpath.startswith("supabase/migrations"):
                sc += 1
            prev = cands.get(cand)
            if prev is None or sc > prev[0]:
                cands[cand] = (sc, relpath)
    return cands


def main():
    detail = os.path.join(ROOT, "docs/verification/asan/scan-detail.tsv")
    rows = list(csv.reader(open(detail, encoding="utf-8", newline=""), delimiter="\t"))[1:]
    files = load_sources()
    print(f"rows={len(rows)} source files={len(files)}", file=sys.stderr)

    out = []
    for tbl, col, pk, val, ctx in rows:
        val = val.replace("\\n", "\n")
        key = None
        mkey = re.search(r"(?:key|code|slug|module|entity_type)=([A-Za-z0-9_\-.]+)", ctx or "")
        if mkey:
            key = mkey.group(1)
        cands = score_hits(val, files, key, tbl)
        best = max((v[0] for v in cands.values()), default=None)
        top = {c: v for c, v in cands.items() if v[0] == best}
        out.append({
            "table": tbl, "column": col, "pk": pk, "key": key, "corrupt": val,
            "n_total": len(cands), "best_score": best,
            "top": [{"text": c, "score": v[0], "file": v[1]} for c, v in list(top.items())[:8]],
        })
    json.dump(out, open(os.path.join(ROOT, "docs/verification/asan/recover.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    uniq = sum(1 for o in out if len(o["top"]) == 1 and o["n_total"] >= 1)
    none = sum(1 for o in out if o["n_total"] == 0)
    print(f"resolved={uniq} none={none} ambiguous={len(out)-uniq-none}", file=sys.stderr)


main()
