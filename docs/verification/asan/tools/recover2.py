# ASAN M1.1 pass 2 — disambiguate using row-level anchors:
#   * sibling columns of the same row already resolved in pass 1
#   * ASCII scalars of the same row (code, title_en, sort_order, ...)
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


SOURCE_GLOBS = [("supabase/migrations", (".sql",)), ("src", (".ts", ".tsx")),
                ("docs", (".md", ".sql")), ("e2e", (".ts",)),
                ("scripts", (".ts", ".js", ".sql", ".py"))]


def load_sources():
    files = []
    for sub, exts in SOURCE_GLOBS:
        for dirpath, _, filenames in os.walk(os.path.join(ROOT, sub)):
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


def load_rowdump():
    out = {}
    path = os.path.join(ROOT, "docs/verification/asan/rowdump.txt")
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if "|" not in line or not line.strip().endswith("}"):
            continue
        t, js = line.split("|", 1)
        try:
            row = json.loads(js)
        except Exception:
            continue
        pk = row.get("id")
        if pk:
            out[(t, str(pk))] = row
    return out


def anchors_for(row, key, resolved_siblings):
    a = []
    if key:
        a.append(key)
    a.extend(resolved_siblings)
    if row:
        for k, v in row.items():
            if k in ("id", "created_at", "updated_at"):
                continue
            if isinstance(v, bool) or v is None:
                continue
            s = str(v)
            if re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-.*", s):
                continue
            if s.isascii() and 2 <= len(s) <= 60 and not s.startswith("?"):
                a.append(s)
    # unique, longest first
    seen, res = set(), []
    for x in sorted(set(a), key=lambda z: -len(z)):
        if x not in seen:
            seen.add(x); res.append(x)
    return res[:12]


def score_hits(corrupt, files, anchors, table):
    cands = {}
    for relpath, txt, m, idx in files:
        start = 0
        while True:
            p = m.find(corrupt, start)
            if p < 0:
                break
            start = p + 1
            s_i, s_j = idx[p], idx[p + len(corrupt) - 1] + 1
            cand = txt[s_i:s_j]
            if mask_simple(cand) != corrupt:
                continue
            if "??" in cand:          # the "candidate" is itself corrupted text
                continue
            ls = txt.rfind("\n", 0, s_i) + 1
            le = txt.find("\n", s_j)
            line = txt[ls: le if le > 0 else len(txt)]
            near = txt[max(0, s_i - 300): s_j + 300]
            wide = txt[max(0, s_i - 2500): s_j + 2500]
            sc = 0
            for a in anchors:
                if a in line:
                    sc += 16
                elif a in near:
                    sc += 6
                elif a in wide:
                    sc += 2
            # a whole quoted literal beats an arbitrary substring of a longer one
            before = txt[s_i - 1] if s_i > 0 else ""
            after = txt[s_j] if s_j < len(txt) else ""
            if before in "'\"`" and after in "'\"`":
                sc += 12
            if table in wide:
                sc += 3
            if relpath.startswith("supabase/migrations"):
                sc += 1
            prev = cands.get(cand)
            if prev is None or sc > prev[0]:
                cands[cand] = (sc, relpath)
    return cands


def main():
    files = load_sources()
    rowdump = load_rowdump()
    prev = json.load(open(os.path.join(ROOT, "docs/verification/asan/recover.json"), encoding="utf-8"))
    print(f"sources={len(files)} rows={len(rowdump)}", file=sys.stderr)

    resolved = {}
    for o in prev:
        if len(o["top"]) == 1 and o["n_total"] >= 1:
            resolved.setdefault((o["table"], o["pk"]), {})[o["column"]] = o["top"][0]["text"]

    out = []
    for o in prev:
        if o["n_total"] == 0:
            o["pass"] = 0
            out.append(o); continue
        sib = [v for c, v in resolved.get((o["table"], o["pk"]), {}).items() if c != o["column"]]
        row = rowdump.get((o["table"], o["pk"]))
        anc = anchors_for(row, o["key"], sib)
        cands = score_hits(o["corrupt"], files, anc, o["table"])
        best = max((v[0] for v in cands.values()), default=None)
        top = {c: v for c, v in cands.items() if v[0] == best}
        o["anchors"] = anc
        o["n_total"] = len(cands)
        o["best_score"] = best
        o["top"] = [{"text": c, "score": v[0], "file": v[1]} for c, v in list(top.items())[:8]]
        o["pass"] = 2 if len(o["top"]) == 1 else -1
        out.append(o)

    json.dump(out, open(os.path.join(ROOT, "docs/verification/asan/recover2.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    import collections
    c = collections.Counter(o["pass"] for o in out)
    print(dict(c), file=sys.stderr)


main()
