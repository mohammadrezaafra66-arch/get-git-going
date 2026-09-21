# HANDOFF — salesdesk-9-fixes
Updated: 2026-09-21T19:20:00Z · Worktree: D:\AfraKalaTest\wt-salesdesk-9-fixes · Branch: feature/salesdesk-9-fixes @ 95abed85 · Base: feature/sales-desk @ c1ea61a1
Current: Wave 1 — gate pending (deploy + acceptance) · 3100 runs: f9c57d0e (healthy, pre-deploy)

## Rows
| Row | Node | Class | Status | Evidence |
|-----|------|-------|--------|----------|
| A1 | N22 | FIX | DONE (code) | WorkItemDetailPage + WorkBoardPage |
| A2 | N23 | EXTEND | DONE (code) | sections + completed_at via 562 |
| A3 | N24 | BUILD | DONE (code+mig) | 560 work_item_events + سابقه |
| A4 | N25,N26 | FIX | DONE (code+mig) | 561 + probe PROBE_FAIL_OK |
| A5 | N25 | EXTEND | DONE (code) | «+ تأمین‌کنندهٔ جدید» in PurchaseForm |
| A6 | N27 | EXTEND | DONE (code) | purchases + purchase-payments filter |
| B–D | — | — | TODO | after Wave 1 gate |

## Confirmed facts
- Wave 0 @ 126e070c; Wave 1 code @ 95abed85
- Migrations 560–562 applied to test DB afrakala; rest restarted
- A4 probe after: NOTICE PROBE_FAIL_OK SUPPLIER_REQUIRED
- Parallel agent briefly switched branch to `test/w1-salesdesk-probes` @ 8919d244; recovered onto feature/salesdesk-9-fixes; duplicate 2026092112* migrations discarded

## Migrations applied (in order)
- 20260921220000_560_work_item_events — revert/560_work_item_events.sql
- 20260921220100_561_purchases_require_supplier — revert/561_…
- 20260921220200_562_work_items_completed_at_closed — revert/562_…

## Decisions taken without the owner
- completed_at for cancelled too (562)
- Cherry-pick RTL at Wave 2 start
- Ignore stray remote branch test/w1-salesdesk-probes (do not merge)

## Blockers
- (none)

## Next action
- Wave 1 gate: typecheck ≤74, deploy §8.8, Playwright acceptance, ACCEPTANCE.md, then Wave 2.
