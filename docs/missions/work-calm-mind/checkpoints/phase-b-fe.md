# Phase B FE — CreateWorkWizard

**Agent:** dev-frontend-engineer  
**Branch:** `feature/work-calm-mind`  
**Worktree:** `d:\AfraKalaTest\wt-work-calm`  
**HEAD_start:** `17ff53dd90c83cadf30e35751fe0122d2d0a8f34`  
**deadline_at:** 2026-09-16T04:30:00+05:00  
**status:** COMPLETE  
**commit:** _(pending — filled after commit)_

## Heartbeat
- 03:11 — verified HEAD @ 17ff53dd; CreateWorkDialog still used from WorkBoardPage L417; baseline typecheck EXIT=2 (pre-existing; no owned-file hits yet)
- 03:12 — implementing CreateWorkWizard + board wiring
- 03:15 — Dialog → thin re-export; WorkBoardPage → CreateWorkWizard
- 03:18 — typecheck after: TSC_EXIT=2, OWNED_HITS=0 under `CreateWork|components/work/`
- 03:19 — lib unit 7/7 pass; intake-gate probe GATE_OK

## How to open UI
1. Sign in as staff.
2. Go to `/operations/work` (تابلو کار Calm Mind).
3. Click «ثبت کار» / Plus — opens wizard (`data-testid="create-work-wizard"`).
4. Steps: شرح → (پرسش‌نامه اگر نیاز) → تأیید و ثبت (`data-testid="create-work-submit"`).

## Files changed

| File | Role |
| --- | --- |
| `src/components/work/CreateWorkWizard.tsx` | NEW — 3-step wizard: classify preview, conditional intake, confirm/edit + create |
| `src/components/work/CreateWorkDialog.tsx` | Thin re-export of wizard (deprecated alias) |
| `src/components/work/WorkBoardPage.tsx` | Import/render `CreateWorkWizard` instead of dialog |
| `docs/missions/work-calm-mind/checkpoints/phase-b-fe.md` | This checkpoint |

**Not changed (out of scope / already OK):**
- `CreateWorkFromMessageButton.tsx` — own chat intake dialog; does not open CreateWorkDialog
- classify/intake/API routes — Phase B BE (read-only consumers)
- WorkItemDetailPage, migrations, `public.tasks`

## Pattern followed
- Dialog shell + labels from former `CreateWorkDialog.tsx` (Select/Label/toast/createWorkItem + listMergeSuggestions).
- Auth assignee gate: `roles.includes("admin") || roles.includes("manager")` (`AuthProvider` / ProductPriceCard pattern).
- Staff Select: `profiles` active list via `useQuery` (CustomerForm-style).
- Classify: client `classifyWorkItem` from `@/lib/work` with 300ms debounce.
- Intake summary: local `summarizeIntake` + optional POST `/api/work/intake-summary` with Bearer session (graceful fallback).

## Intake gate rule (in code)
`needsIntakeStep`: show intake when `kind !== "note"` **OR** trimmed text length `< 40` **OR** `confidence < 0.6`.

## Evidence

### Baseline (before)
- HEAD `17ff53dd` — `WorkBoardPage` imported/rendered `CreateWorkDialog`.
- `npm run typecheck` → EXIT=2, pre-existing errors outside work create UI (`_phase-b-fe-typecheck-before.txt`).

### After wiring (E4)
- `WorkBoardPage.tsx` L33 / L417: `CreateWorkWizard`.
- `CreateWorkDialog.tsx`: re-exports wizard.
- Grep `CreateWork` in work components: board → wizard; dialog → re-export only.

### Build / typecheck (E3)
- After: `tsc --noEmit` EXIT=2 (same class of pre-existing errors; **0** matches for `CreateWork|components/work/` in `_phase-b-fe-typecheck-after-full.txt`).

### Lib + gate probe (E3)
```
npx tsx --test src/lib/work/classify.test.ts src/lib/work/intake.test.ts
# tests 7, pass 7, fail 0, EXIT=0
```
Intake gate probe → `GATE_OK` (`_phase-b-fe-intake-gate.txt`):
- bug text → needs intake true
- short «سلام» → needs true
- long high-confidence note → skip false

### data-testid hooks
- `create-work-wizard`, `create-work-steps`, `create-work-step-*`, `classify-preview`, `create-work-submit`

## Unverified
- Live browser e2e / visual RTL pass
- Live POST `/api/work/intake-summary` against running server (fallback path coded)
- Assignee Select against real profiles RLS in browser

## Out-of-scope recommendations
- Phase E: morning cards / FAB polish on board
- Phase C: WorkItemDetailPage
- Consider extracting `needsIntakeStep` to a tiny `.ts` helper for node:test without React import
