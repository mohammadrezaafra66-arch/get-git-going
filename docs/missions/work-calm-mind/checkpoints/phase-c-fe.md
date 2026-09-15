# Phase C FE — Test delivery panel + client lib

**Agent:** dev-backend-engineer (lib) + dev-frontend-engineer (UI)  
**Branch:** `feature/work-calm-mind`  
**Worktree:** `d:\AfraKalaTest\wt-work-calm`  
**HEAD_start:** `c698d2cdcf4aef14193b9d98401e9b1e8bd2c93b`  
**deadline_at:** 2026-09-16T05:45:00+05:00  
**status:** COMPLETE  
**commit:** `def9eb3954b4039b8378919fe130d11d95fbbdcd` (feature)  
**docs follow-up:** `6658c102410ddac52f40d99ad0bc4aefe840a542`  
**pushed:** `c698d2cd..6658c102` → `origin/feature/work-calm-mind` (PUSH_EXIT=0)

## Heartbeat
- 03:26 — HEAD c698d2cd; read migration 550 + items cast + WorkItemDetailPage
- 03:27 — baseline `npm run typecheck` → TSC_EXIT=2, error_count=70 (pre-existing)
- 03:28 — added `src/lib/work/testReports.ts` + export from `index.ts`
- 03:29 — `TestReportPanel` + wired into `WorkItemDetailPage` when status/item.status === testing
- 03:31 — typecheck after → TSC_EXIT=2, OWNED_HITS=0

## How to open UI
1. Sign in as item creator or admin/manager.
2. Open `/operations/work/$itemId` for an item with status `testing` (or set status to «در حال تست» in the select — panel shows when draft status or saved status is testing).
3. Panel `data-testid="work-test-report-panel"`: approve / reject-existing / reject-new.

## Files changed

| File | Role |
| --- | --- |
| `src/lib/work/testReports.ts` | NEW — types + `submitTestReport` RPC + `listTestReports` select |
| `src/lib/work/index.ts` | Re-export test report API |
| `src/components/work/TestReportPanel.tsx` | NEW — Persian RTL test delivery UI + soft history |
| `src/components/work/WorkItemDetailPage.tsx` | Render panel when `status === 'testing' \|\| item.status === 'testing'` |
| `docs/missions/work-calm-mind/checkpoints/phase-c-fe.md` | This checkpoint |

**Not changed:** migration 550, app tree, `public.tasks`

## Pattern followed
- RPC cast: `(supabase as any).rpc` — same as `src/lib/work/items.ts`
- Auth gate: `roles.includes("admin"|"manager")` or `user.id === item.creator_id` — CreateWorkWizard / RPC product rule
- ETA gate on reject when `item.claimed_due_at` is null — mirrors RPC `p_claimed_due_at` requirement
- `reject_new_bug`: optional auto `createWorkItem({ kind: "bug" })` + linked id; else UUID field

## Evidence

### Baseline (before) E3
- HEAD `c698d2cd`
- `npm run typecheck` → EXIT=2, 70 errors (`_phase-c-fe-typecheck-before.txt`)
- `git show c698d2cd:src/lib/work/testReports.ts` → path not in commit (absent)
- `git show c698d2cd:src/components/work/TestReportPanel.tsx` → path not in commit (absent)
- Detail page had no `TestReport` import

### After (E3 + E4)
- `npm run typecheck` → EXIT=2, 70 errors, **OWNED_HITS=0** (`_phase-c-fe-typecheck-after.txt`)
- Panel + testids present in `TestReportPanel.tsx`
- Detail wires panel at status gate

### data-testid hooks
- `work-test-report-panel`, `work-test-approve`, `work-test-reject-existing`, `work-test-reject-new`

## Unverified
- Live browser e2e against real RPC / RLS
- End-to-end approve→done and reject→in_progress with ETA gate on live DB

## Out-of-scope recommendations
- Add Playwright coverage for test delivery panel
- Generated Database types for `work_test_reports` to drop `(supabase as any)` cast
