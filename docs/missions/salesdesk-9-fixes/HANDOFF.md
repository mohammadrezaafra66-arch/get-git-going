# HANDOFF — salesdesk-9-fixes
Updated: 2026-09-21T20:15:00Z · Worktree: D:\AfraKalaTest\wt-salesdesk-9-fixes · Branch: feature/salesdesk-9-fixes @ d8f1c791 · Base: feature/sales-desk @ c1ea61a1
Current: Wave 2 — start B1–B5 · 3100 runs: ccc40c44 (healthy; redeploy after W2)

## Rows
| Row | Status | Notes |
|-----|--------|-------|
| A1–A6 | DONE | Wave 1 |
| B1–B5 | TODO | next |
| C–D | TODO | |

## Decisions taken without the owner
- Cherry-pick aa63de1c: on conflict keep HEAD (ours) — RTL hunks would regress PersianFollowUpFields / card popup; non-conflict RTL files from that commit applied where clean.
- history.ts: map field assignee_id to مسئول (migration 560 writes assignee_id).

## Next action
- Implement Wave 2 B1 (card group by linkedid) onward.