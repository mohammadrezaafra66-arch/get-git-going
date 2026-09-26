# REPORT — Torob Eye build-01

Status: **PARTIAL**

Live submission to Torob is **unverified until production**. On 3100, `TOROB_OPS_SIMULATE_SUBMIT` skips only the final click; earlier steps run against a stub page.

## Decisions

Q2–Q9 defaults. Bindings A/B/C recorded in `DECISIONS.md`.

## Stage 0

Research complete. Evidence `evidence/R1`–`R9`. Action table in `RESEARCH.md` §R10.

## Stage 1 — expected vs actual

| Exit | Expected | Actual | Evidence |
|---|---|---|---|
| FIX A | service role sees our-prices | View 0 → 2057 rows; 321 cash_price products; math unchanged | `evidence/S1/S1-view-before.out.txt`, `S1-view-after.out.txt` |
| Binding B | 15 Q6 from post-A view | 15 ids, all priced | `evidence/S1/Q6-products.md` |
| Container | `afrakala-lan-torob-eye` up | Up after Playwright 1.49.1 pin | docker ps |
| First cycle | Q6 attempted | Cycle `9136f7cf` completed in 133 ms, **0 products** (watch loader used RPC page, missed cells) | `evidence/S1/S1-eye-run.sql` |
| ≥80% snapshots | seller name+price | **0 snapshots**. 14/15 Q6 have empty `torob_url`; first cycle loaded 0 watch rows | snaps=0 |
| Observatory columns | bot upsert | Key `torob-eye` created (prefix only `bk_725e427`). Cycle had no products so **0 upserts** | `S1-bot-key.sql` |
| Forced block | stub 490 + notify | **Not run** (needs recreate with new image + `TOROB_EYE_STUB_BLOCK`) | — |
| Notify probe | owner queue row | `notify_torob_eye` inserted; owner system count 24h = 1 | `S1-notify.sql` |
| Sales PATCH/DELETE | fail | PATCH findings 403; DELETE sessions 403; DELETE report_logs 403 | `evidence/S1/S1-probes.out.txt` |
| Web SHA | match merge | `77e25dfb` after PR #483 | deploy |

## Stages 2–4 — code vs proven on 3100

Code is on `feature/torob-eye` (this drop): snapshot scan + skip reasons, history link, worker findings/bait/link-discovery/submit. **Not yet merged/deployed** at the time this file was written, so Stage 2–4 exits are **indeterminate on 3100**.

| Binding C unit test | Fail before `submit.py`, pass after | `evidence/S4/S4-test-before.txt`, `S4-test-after.txt` |

## Stage 5

| Artefact | Path |
|---|---|
| OWNER-CHECK-CHROME | `OWNER-CHECK-CHROME.md` |
| VERIFY-PROMPT | `VERIFY-PROMPT.md` |
| PRODUCTION-NOTES | `PRODUCTION-NOTES.md` |
| Unlocked e2e | `e2e/torob-ops/torob-ops-unlocked.spec.ts` (needs `TOROB_OPS_E2E_PASSWORD`) |

Typecheck / full e2e against the new SHA: **not re-run in this drop**.

## §4 action table — final status

| # | Action | Status |
|---|---|---|
| 1 | BUILD eye worker | **done in repo**; first live cycle empty |
| 2 | EXTEND settings | done (596 + settings UI) |
| 3 | BUILD run/snapshot tables | done (596) |
| 4 | CONNECT observatory | key created; **0 writes** |
| 5 | EXTEND matches | worker `ensure_match` |
| 6/18 | FIX our-price view | **done**, proven |
| 7 | EXTEND scan snapshots | **code**; not proven on 3100 |
| 8 | EXTEND runs skip reasons | **code** |
| 9 | EXTEND bait in worker | **code** |
| 10 | CONSOLIDATE web bait | **not done** (callers remain until worker proven) |
| 11 | BUILD alerts | RPC + probe row; cheaper-seller loop **unproven** |
| 12 | BUILD history | page + query param |
| 13 | BUILD link discovery | **code**; colour reject unit-tested |
| 14 | CONNECT/EXTEND auto-report | worker submit; own-shop trigger in 596; **live Torob unverified** |
| 15 | FIX findings/DELETE | **proven** 403 |
| 16 | EXTEND menu/titles | history in nav (PR #483) |
| 17 | CONSOLIDATE Phase-2 | deprecated doc |
| 19 | Q6 from view | **done** |
| 20 | BUILD real submit | **code + unit test**; stub page; live unverified |

## Deviations

- Watch products are loaded from `dynamic_table_cells`, not a single RPC page (first cycle missed all 15).
- Path A adapter stays simulate/fail; real steps live in `workers/torob-eye/submit.py`.
- Web bait path not deleted yet (CONSOLIDATE waits on a proven worker cycle).

## Unresolved / not verified

- Snapshots for ≥80% of Q6 (needs deployed watch-loader + Stage 3 links or more `torob_url`s).
- Observatory five columns after a real scrape.
- Forced-block 3-hour alert (shortened test setting not executed).
- Live Torob HTTP submit.
- Unlocked e2e past the gate on 3100.
- Colour-mismatch assignment row in the live DB.

A clean PARTIAL outranks a padded COMPLETE.
