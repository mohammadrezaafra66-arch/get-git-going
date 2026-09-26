# VERIFY-PROMPT — read-only re-derivation (do not trust REPORT.md)

Workspace: `D:\AfraKalaTest`. Run folder: `research/torob-ops/build-01/`. Worktree: `D:\AfraKalaTest\wt-torob-eye`. Never edit `D:\AfraKalaTest\app`. Never touch production (`192.168.170.10`, `192.168.1.43`, `C:\afrakala`).

Re-derive checks from `BUILD-PROMPT.md` §1.1 and §5, and from `DECISIONS.md` bindings A/B/C. Re-run probes. Verdict each exit condition: **confirmed / refuted / indeterminate**.

## How to probe

- SQL: ASCII `.sql` via `docker cp` + `docker exec -e PGPASSWORD=... afrakala-lan-db psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -f`. Never `psql -c` multi-line. Never write secrets.
- Counts, not secret rows. No bot keys, JWTs, cookies, or password hashes in evidence.

## Binding A

`product_computed_prices_public` as service role must return rows for active `cash_price` products. Compare to 321 cash-price products. Confirm 596 is applied. Confirm no pricing-math change (diff the view: invoker bypass only).

## Binding B

The 15 Q6 ids in `evidence/S1/Q6-products.md` must all have a non-empty `rounded_sale_price` from that same view.

## Binding C

`workers/torob-eye/submit.py` + `test_submit.py`: simulate skips only `final_submit`. Path A `submitTorobReportAdapter` must still not POST to Torob. `REPORT.md` must say live Torob submit is unverified until production.

## Stage exits

1. Container `afrakala-lan-torob-eye` running; `torob_eye_runs` has a completed cycle over the Q6 set; snapshots ≥80% with seller name+price or listed skip reasons.
2. Observatory five Torob columns filled for those products (before/after counts).
3. Forced-block path and owner notification (`notify_torob_eye` / `notification_queue`).
4. `test.sales` PATCH findings and DELETE sessions/report_logs fail.
5. After-cycle scan writes findings with seller name; own-shop snapshots excluded; 0-finding run shows skip reasons on `/torob-ops/runs`.
6. One cheaper-seller alert, none on repeat within 24h (dedupe key).
7. History chart reads `torob_offer_snapshots`.
8. Link discovery writes empty `torob_url` only; colour mismatch rejected in `torob_link_assignments`; pre-existing URLs unchanged.
9. Auto-report refused with own shops empty (transactional); enabled after one shop; queue → worker → simulate last click → `torob_ops_report_logs` → `reported`; kill switch and caps.
10. E2E past the lock screen (not `gate.or(heading)`); typecheck no worse than R1.

Write `evidence/VERIFY/` and a verdict table. Do not change code to make a check pass.
