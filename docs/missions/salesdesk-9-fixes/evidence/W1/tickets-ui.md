# W1 tickets UI — A1 / A2 / A3 verification

**Worktree:** `D:\AfraKalaTest\wt-salesdesk-9-fixes`  
**Branch:** `feature/salesdesk-9-fixes`  
**UI commits:** `95abed85` (metadata/history/closedOnly), `25ae63b2` (profile names + board/topic cleanup)

## Files changed (tickets UI scope)

| Path | Role |
|------|------|
| `src/components/work/WorkItemDetailPage.tsx` | A1 meta · A2 بستن/بازگشایی · A3 سابقه |
| `src/components/work/WorkBoardPage.tsx` | A1 row columns · A2 sections + counters |
| `src/components/work/WorkTopicDetailPage.tsx` | A1 on linked rows |
| `src/lib/work/history.ts` | `listWorkItemEvents` + `EVENT_FIELD_LABELS` (empty if table missing) |
| `src/lib/work/profiles.ts` | `resolveProfileNames` / `profileDisplayName` |
| `src/lib/work/items.ts` | `closedOnly` filter (openOnly unchanged) |
| `src/lib/work/types.ts` | `closedOnly`, `WORK_OPEN/CLOSED_STATUSES`, `isWorkItemClosed` |
| `src/lib/work/index.ts` | re-exports |

**Not touched (other agents):** purchases / `PurchaseForm` / supplier migrations.

## Exact Persian labels (grep-backed)

| Label | Where |
|-------|--------|
| ایجاد کننده | Detail meta, Board row, Topic linked row |
| مسئول | Detail meta, Board row, Topic linked row |
| تاریخ ثبت | Detail / Board / Topic via `formatJalaliDateTime` |
| در حال اجرا | Board section heading + counter |
| بسته شده | Board section heading + counter |
| تاریخ بسته شدن | Detail when closed; Board closed section (`completed_at`) |
| بستن | Detail → `status: "done"` |
| بازگشایی | Detail → previous open status or `pending` |
| سابقه | Detail timeline heading |

## Acceptance checklist

### A1 — creator / assignee / created_at
- [x] Detail shows three fields with profile `full_name` resolution (`profiles.ts`, CreateWorkWizard pattern).
- [x] Board list rows show the same three columns under each title.
- [x] Topic linked rows show the same three when feasible.
- [x] Jalali via existing `formatJalaliDateTime` (`src/lib/messenger/format.ts`).

### A2 — open / closed
- [x] Board sections «در حال اجرا» / «بسته شده» with counts.
- [x] Open = not done/cancelled; closed = done/cancelled (`isWorkItemClosed`).
- [x] «تاریخ بسته شدن» from `completed_at` (Wave 0: no separate `closed_at`).
- [x] Detail «بستن» → done; «بازگشایی» → remembered open status or pending (never `in_progress` without ETA).
- [x] `listWorkItems({ closedOnly })` added; existing `openOnly` consumers unchanged (`WorkBoardPage` queue, `WorkTopicDetailPage` unlinked picker).

### A3 — سابقه
- [x] `src/lib/work/history.ts` queries `work_item_events` ordered by `event_at` desc.
- [x] Missing table → `[]` (PGRST205 / 42P01 / message match), no throw.
- [x] Detail timeline: field label, old→new, actor name if resolved, Jalali time.
- [x] Migration `560_work_item_events` may land in parallel (UI tolerates absence).

## Verification notes (E1–E3)

### Static (E1/E2)
```text
rg "ایجاد کننده|مسئول|تاریخ ثبت|در حال اجرا|بسته شده|بستن|بازگشایی|سابقه" src/components/work
rg "closedOnly|listWorkItemEvents|isMissingRelationError" src/lib/work
```
Hits confirmed in Detail / Board / Topic + `history.ts` / `items.ts`.

### Typecheck (E3)
`npx tsc --noEmit` on this host reports many pre-existing errors outside work UI
(audit / invoices / automation / …). Filtered scan of `src/lib/work` and
`src/components/work` in that run: **no matches** (no work-path TS errors in the sample).

### Runtime UI
- Browser walk deferred to W1 acceptance / `e2e/missions/salesdesk-9-fixes-w1-a3-history.spec.ts`.
- Profile names require live `profiles` rows matching `creator_id`/`assignee_id`.

## Untested / out of scope
- Purchases A4–A6 (other agent).
- Deploy / push.
- Live Playwright pass of A3 UI path in this session.
