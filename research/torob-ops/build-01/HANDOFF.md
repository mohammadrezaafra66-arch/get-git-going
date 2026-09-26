# HANDOFF — Torob Eye build-01

Updated: 2026-09-26 20:40 +0330

## Status
**PARTIAL. Stage 1 still open.** Cycle `27ffbd97` finished: 15 attempted, 14 empty-url skips, 1 scrape, **0 snapshots**. Insert 400 was swallowed; run marked `completed`. Cause: `price_toman integer` vs scraper prices up to 50e9 (`22003`). Fix (597 bigint + fail the run + test) is in the worktree, not merged yet.

## Decisions
`DECISIONS.md` — defaults + A/B/C.

## Done
- FIX A, Q6, PR #483/#485/#486, web `APP_GIT_SHA=5f59879a`
- Notify + sales 403 probes
- Cycle `27ffbd97` logged; snapshot-zero RCA: `evidence/S1/S1-snapshot-zero.md`
- First 3 link assignments: `evidence/S3/S3-first3.md` — old URLs empty; original URL product unchanged (1 → 14 active URLs = 1 kept + 13 writes)

## Next
1. Commit 597 + snapshot fail-loud on `feature/torob-eye` → PR → merge
2. Apply 597 on test DB; restart rest; rebuild eye
3. Restart eye so a cycle scrapes the 14 URLs now present
4. Count snapshots for that run; Stage 1 80% still depends on those writes
5. Forced-block probe; e2e; REPORT remainder

## Blockers
None for the insert fix. Live Torob submit still unverified.

## Resume point
Worktree `D:\AfraKalaTest\wt-torob-eye`. Do not edit `app`. Do not re-apply 596. Apply **597** only after it is committed.
