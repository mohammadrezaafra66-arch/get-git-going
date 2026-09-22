# Collab E2E Progress — RUNID 20260921-2352

## HANDOFF STATE
- STATUS: COMPLETED (PARTIAL go/no-go — see report)
- COMPLETED: Phases 0–6 (suite written, dual non-slow runs, SLA evidence, report, cleanup SQL)
- NEXT STEP: Product fix mission for A6/P0, viewer A3, SLA cron wiring, C11/C6 — not this mission
- DATA CREATED WITH PREFIX: `E2E-COLLAB-20260921-2352` (groups/messages/inquiries; not deleted)

---

## GROUND TRUTH (Phase 0) — summary
- HEAD `c1ea61a1` vs deployed `f9c57d0e` (mismatch — tested deployed)
- No `purchase_specialist` account
- `deactivate_messenger_group` = system admin only (help true, QA false)
- `tick_inquiries` exists; `cron.job` absent
- embeddings typmod 1536
- MSG-N07 mitigated on deployed: `inquiry_price_cache_select` + `viewer_restricted`

## Phase 1 — Questions
Defaults applied; no wait. See earlier GROUND TRUTH section in git history / report.

## Phase 3 — Prove-can-fail
- E1–E5: member twin ≥1 rows then outsider 0; bypass PATCH/INSERT count unchanged
- C2: 4000 accepted (would fail denial); 4001 rejected
- D3/D4: purchaser/member twin succeeds; outsider rejected with count stable

## Phase 4 — Runs
- run2: 49 pass / 1 fail (A6) exit 1 — `test-results/collab-e2e/run2.txt`
- run3: 49 pass / 1 fail (A6) exit 1 — `test-results/collab-e2e/run3.txt`
- SLA: timeline pending→warning_5min→danger_8min→transfer_available with manual tick; 1 penalty row; test then crashed on `employee_score_events.user_id` (fixed). Log: `run-sla.txt`
- HTML: `test-results/collab-e2e-html/`

## Report
`docs/qa/collab-e2e-report-20260921-2352.md` — **NO-GO**, STATUS PARTIAL
