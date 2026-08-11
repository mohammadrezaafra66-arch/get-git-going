import json, os, sys, csv, collections

sys.stdout.reconfigure(encoding="utf-8")
ROOT = r"D:\AfraKalaTest\app"
plan = json.load(open(os.path.join(ROOT, "docs/verification/asan/repair-plan.json"), encoding="utf-8"))

rows = list(csv.reader(open(os.path.join(ROOT, "docs/verification/asan/scan-detail.tsv"),
                            encoding="utf-8", newline=""), delimiter="\t"))[1:]
ctx = {(r[0], r[1], r[2]): r[4] for r in rows}


def esc(s):
    return s.replace("|", "\\|").replace("\n", " ⏎ ")[:160]


A = [o for o in plan["resolved"] if o.get("key")]
B = [o for o in plan["resolved"] if not o.get("key")]
C = [o for o in plan["unresolved"] if o["table"] != "dynamic_table_cells"]
CELLS = [o for o in plan["unresolved"] if o["table"] == "dynamic_table_cells"]

out = []
w = out.append
w("# Corrupted Persian text — full scan, classification and repair")
w("")
w("Produced by ASAN mission M1, phase 1.1.")
w("")
w("## How the corruption works, and why the repair is provable")
w("")
w("The 2026-07-11 PowerShell-pipe incident did not garble the text randomly. It replaced")
w("**every UTF-8 byte** of every non-ASCII character with a literal `?`, and left ASCII")
w("untouched. So `سطح` (3 characters, 6 bytes) became `??????`, and `ثبت‌شده` — which")
w("contains a 3-byte ZWNJ — became a 15-character run, not 14.")
w("")
w("That makes recovery a proof rather than a guess. Define")
w("`mask(s)` = each non-ASCII character replaced by one `?` per UTF-8 byte, ASCII kept.")
w("A candidate string is the original **iff** `mask(candidate)` equals the stored value")
w("byte for byte. Every repair in this phase satisfies that identity against a string still")
w("present in `supabase/migrations/` or `src/`. Nothing was reworded or invented.")
w("")
w("Where one masked value had several candidates, the row was pinned by anchors that must")
w("appear near the candidate in the source: the row's own `key`/`code`, sibling columns of")
w("the same row already recovered, and whether the candidate is a whole quoted literal")
w("rather than a slice of a longer one. 86 multi-column rows were then re-checked to confirm")
w("all their recovered columns come from the same source record.")
w("")
w(f"## Totals")
w("")
w("| bucket | meaning | count |")
w("|---|---|---|")
w(f"| A | inferable from the row (row carries a `key`/`code`) | {len(A)} |")
w(f"| B | inferable from code (recovered from repo source) | {len(B)} |")
w(f"| C | not inferable — needs owner input | {len(C)} |")
w(f"| — | `dynamic_table_cells.value_text`, repaired at the source (see below) | {len(CELLS)} |")
w(f"| | **scanned total** | {len(rows)} |")
w("")
w("Scan script: `docs/verification/asan/scan-corrupted-text.sql` (generated dynamically from")
w("`information_schema`; it covers all 652 text columns of all 218 base tables in `public`).")
w("Raw findings: `docs/verification/asan/scan-detail.tsv`.")
w("Repair migration: `supabase/migrations/20260804233000_279_repair_corrupted_persian_labels.sql`.")
w("Rollback: `docs/verification/279-down.sql`.")
w("")
w("## The `dynamic_table_cells` finding")
w("")
w("266 of the 702 findings are label cells in the product price observatory. They were not")
w("corrupted individually: the function that writes them,")
w("`sync_product_price_observatory_rows()`, joins product labels with `string_agg`, and its")
w("**separator literal** had been corrupted from `'، '` (U+060C + space) to `'?? '`. A diff of")
w("the live `pg_get_functiondef` against migration `20260516161314` shows that separator is")
w("the only difference between the live function and the repo. Migration 279 repairs the")
w("function first and then rewrites the 266 cells it had already produced. Verified before")
w("writing: every `?` in that table belongs to that separator, and no other column is affected.")
w("")

for name, title, items in (("A", "Bucket A — inferable from the row", A),
                           ("B", "Bucket B — inferable from code", B)):
    w(f"## {title} ({len(items)})")
    w("")
    w("| table | column | pk | row context | corrupted | repaired to | proof source |")
    w("|---|---|---|---|---|---|---|")
    for o in sorted(items, key=lambda r: (r["table"], r["column"], r["pk"])):
        w(f"| `{o['table']}` | `{o['column']}` | `{o['pk'][:8]}` | {esc(ctx.get((o['table'],o['column'],o['pk']),''))} "
          f"| `{esc(o['corrupt'])}` | {esc(o['chosen'])} | `{o['evidence']}` |")
    w("")

w("## NEEDS OWNER INPUT")
w("")
w(f"{len(C)} values could not be recovered from the row or from anything in the repository.")
w("They are left untouched.")
w("")
w("| table | column | pk | corrupted value | best guess | why not confident |")
w("|---|---|---|---|---|---|")
for o in sorted(C, key=lambda r: (r["table"], r["column"], r["pk"])):
    if o["table"] == "journal_entries":
        guess = ("a posting note ending in invoice number 123456 — the four masked words are "
                 "6, 6, 12 and 10 bytes, i.e. 3, 3, 6 and 5 Persian characters")
        why = ("a one-off manual journal entry; its text was never in the repo and the only "
               "surviving anchor is the ASCII invoice number. This row is financial data, "
               "so no wording was invented")
    else:
        guess = "—"
        why = ("knowledge-base document body; the live `knowledge_documents` table holds only "
               "1 row, so this backup is the sole copy and nothing in the repo matches it")
    w(f"| `{o['table']}` | `{o['column']}` | `{o['pk']}` | `{esc(o['corrupt'])}` | {guess} | {why} |")
w("")
w("## Observations worth the owner's attention")
w("")
w("These are not corruption, but the scan surfaced them and they look unintended.")
w("")
w("1. **`price_change_reasons` holds three copies of the same six seed rows** (18 rows).")
w("   The seed uses `WHERE NOT EXISTS (... WHERE title = t.v)`; on 2026-07-11 the incoming")
w("   titles were already masked, so the guard did not match and a third corrupted copy was")
w("   inserted instead of the existing rows being corrupted. The clean 2026-04-24 and")
w("   2026-05-17 copies are still there. Migration 279 repairs the text of the third copy but")
w("   does **not** delete it — removing duplicate rows from a table other rows reference is")
w("   an owner decision, not a cleanup.")
w("2. **`daily_mood_hafez_poems` (21 rows = 3 × 7), `daily_mood_questions` (93) and")
w("   `daily_mood_scenarios` (10) are similarly multiplied** — those seeds have no")
w("   `WHERE NOT EXISTS` guard at all, so every re-run appends a copy.")
w("3. **`knowledge_documents` has 1 row while its 2026-07-22 backup has 42.** The knowledge")
w("   base appears to have been emptied. 70 of the backup's 84 corrupted values are repaired")
w("   by migration 279, which makes the backup usable again if the owner wants to restore it.")
w("")

open(os.path.join(ROOT, "docs/asan/corrupted-labels-scan.md"), "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
print("A", len(A), "B", len(B), "C", len(C), "cells", len(CELLS))
