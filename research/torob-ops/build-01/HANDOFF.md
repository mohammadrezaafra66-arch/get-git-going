# HANDOFF — Torob Eye build-01

Updated: 2026-09-26 20:00 +0330

## Status
**PARTIAL.** PR #483 merged (`77e25dfb`). 596 applied. FIX A proven. Q6 selected from the scan view. Eye container is up. First cycle wrote 0 products (watch RPC miss). Bot key `torob-eye` created (env only). Sales 403 probes passed. Notify row inserted. Stage 2–4 **code is in the worktree, uncommitted/unmerged** at this note’s first write.

## Decisions
`DECISIONS.md` — defaults + A/B/C.

## Done
- Stage 0, decisions, worktree, PR #483, 596
- FIX A before/after
- Q6 15 watch cells
- Playwright pin 1.49.1 (local image)
- Bot key name `torob-eye` (prefix `bk_725e427` only)
- Notify + sales PATCH/DELETE probes
- Unit tests: submit (fail then pass), link colour, findings own-shop
- Worker: cells watch loader, findings after cycle, link discovery, bait, submit (simulate last click)
- UI: scan snapshots + skip reasons, history `?product=`
- Stub: `public/torob-eye/stub-report.html`

## Next
1. Commit + PR + merge `feature/torob-eye` → staging
2. Deploy worktree compose (web + torob-eye rebuild)
3. Confirm `APP_GIT_SHA` and a second eye cycle (`watch products loaded=15`)
4. Forced-block probe if still needed
5. Re-run typecheck + e2e; fill remainder in REPORT

## Blockers
14/15 Q6 lack `torob_url` until link discovery runs against live Torob (or owner adds URLs). Stage 1 80% snapshot remains blocked on that.

## Resume point
Worktree `D:\AfraKalaTest\wt-torob-eye`. Do not edit `app`. Do not re-apply 596. Do not print `TOROB_EYE_BOT_KEY`.
