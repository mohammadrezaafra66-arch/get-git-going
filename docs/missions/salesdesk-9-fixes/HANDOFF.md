# HANDOFF — salesdesk-9-fixes
Updated: 2026-09-21T18:45:00Z · Worktree: D:\AfraKalaTest\wt-salesdesk-9-fixes · Branch: feature/salesdesk-9-fixes @ c1ea61a1 · Base: feature/sales-desk @ c1ea61a1
Current: Wave 0 — step 0.9 — done · 3100 runs: f9c57d0e (healthy)

## Rows
| Row | Node | Class | Status | Evidence |
|-----|------|-------|--------|----------|
| A1–A6 | N22–N27 | — | TODO | Wave 1 next |
| B1–B5 | N1–N6 | — | TODO | Wave 2 — cherry-pick RTL aa63de1c first |
| C1–C9 | N7–N15 | — | TODO | Wave 3 |
| D1–D7 | N16–N21 | — | TODO | Wave 4 |

## Confirmed facts
- Base SHA `c1ea61a1` — worktree 0.1
- Typecheck baseline **74** — evidence/W0/typecheck-count.txt
- Schema baseline 51415 lines — evidence/W0/schema-baseline.txt
- Persian SQL Node Buffer method PASS — evidence/W0/persian-roundtrip.txt
- Next migration **560** — evidence/W0/migrations.txt
- `completed_at` = closed-at equivalent — evidence/W0/work_items-columns.json
- YES_BACKFILL salesperson_id NULL→author_id — evidence/W0/backfill-condition-0.6.md
- Visual baselines 6 pages — evidence/W0/visual/*.png
- AFRAKALA_LAN_ENV points at app .env.lan (env var only); PLAYWRIGHT_BROWSERS_PATH = ms-playwright

## Migrations applied (in order)
- (none yet)

## Decisions taken without the owner
- Map «تاریخ بسته شدن» → `completed_at` (no new closed_at column).
- Cherry-pick `aa63de1c` at Wave 2 start instead of SKIPPING B/C rows.
- Typecheck gate = 74 measured.

## Blockers
- (none)

## Next action
- Start Wave 1: A1–A6 (tickets + purchases).
