# HANDOFF — salesdesk-9-fixes
Updated: 2026-09-21T19:45:00Z · Worktree: D:\AfraKalaTest\wt-salesdesk-9-fixes · Branch: feature/salesdesk-9-fixes @ ccc40c44 · Base: feature/sales-desk @ c1ea61a1
Current: Wave 2 — cherry-pick aa63de1c conflicts resolving · 3100 runs: ccc40c44 (healthy) · HEAD: 9630af5a (cherry-pick in progress)

## Rows
| Row | Node | Class | Status | Evidence |
|-----|------|-------|--------|----------|
| A1 | N22 | FIX | DONE | detail+board columns |
| A2 | N23 | EXTEND | DONE | sections + 562 completed_at |
| A3 | N24 | BUILD | DONE | 560 + سابقه |
| A4 | N25,N26 | FIX | DONE | 561 + PROBE_FAIL_OK |
| A5 | N25 | EXTEND | DONE | quick-create label |
| A6 | N27 | EXTEND | DONE | filter on purchases + payments |
| B1–B5 | — | — | TODO | Wave 2 — cherry-pick aa63de1c first |
| C–D | — | — | TODO | |

## Migrations applied (in order)
- 560_work_item_events — ccc40c44 line
- 561_purchases_require_supplier
- 562_work_items_completed_at_closed

## Decisions taken without the owner
- completed_at also for cancelled
- Stray branch test/w1-salesdesk-probes ignored
- Typecheck gate 74

## Next action
- Wave 2: cherry-pick aa63de1c from feature/sales-desk-rtl, then B1–B5.
