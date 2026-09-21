# W2-FE checkpoint — salesdesk-9-fixes B1–B5

| Field | Value |
|-------|-------|
| job_id | W2-FE |
| started_at | 2026-09-21T19:30:00Z |
| updated_at | 2026-09-21T19:45:00Z |
| worktree | `D:\AfraKalaTest\wt-salesdesk-9-fixes` |
| branch | `feature/salesdesk-9-fixes` |
| baseline_HEAD | `00e4a6c027caf3b840eb6b9e43139540242782d0` |
| final_HEAD | `d9734cb80a0ac16da6ff58b9a6c5e13e3f349c0e` |
| push | `7f7097e6..d9734cb8` origin/feature/salesdesk-9-fixes |
| killable | no |
| deadline_at | 2026-09-21T21:45:00Z |

## Progress

| Row | Status | Notes |
|-----|--------|-------|
| B1 | DONE | `call-card-key.ts` + group in popup; unit test two exts → one key |
| B2 | DONE | `caller-broadcast.ts` channel `afrakala-caller-id` |
| B3 | DONE | settings UI + filter + `display_seconds` TTL |
| B4 | DONE | `call-drafts.ts` + openCalls map + switcher |
| B5 | DONE | «افزودن معامله» → QuickRequestForm; `deal_id` on note save |

## Evidence

- Unit tests: `evidence/W2/fe-unit-tests.txt` (16 pass, exit 0)
- Typecheck: baseline 74 → after 74 (`fe-tsc-baseline.txt` / `fe-tsc-after.txt`)
- Report: `evidence/W2/fe-report.md`

## Blockers

- Migrations 563/564 owned by W2-M — FE uses soft-fallback if columns missing.
- Live AMI hook probe (two extensions same linkedid) not run in this job — unit test documents B1; real hook: POST `/api/public/hooks/issabel-ami-ring` twice with same `linkedid`, different `extension`.
