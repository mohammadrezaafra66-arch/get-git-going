# Checkpoint p1-fe — Calm Mind UI (phases 1–3)

**Agent:** dev-frontend-engineer  
**Branch:** `feature/work-calm-mind`  
**HEAD at start:** `860a869079a6503c6ec606414e5a5ba64d066e5a`  
**Date:** 2026-09-15

## URLs (exact)

| Surface | URL |
| --- | --- |
| Board | `/operations/work` |
| Item detail | `/operations/work/$itemId` |
| Topics list | `/operations/work/topics` |
| Topic detail | `/operations/work/topics/$topicId` |

Route files (TanStack escape so `work` stays a leaf and `$itemId` cannot swallow `topics`):

- `src/routes/_app.operations.work.tsx`
- `src/routes/_app.operations.work_.$itemId.tsx`
- `src/routes/_app.operations.work_.topics.tsx`
- `src/routes/_app.operations.work_.topics_.$topicId.tsx`

Confirmed in `src/routeTree.gen.ts` fullPath entries (E2).

## typecheck

| | Count | Evidence |
| --- | --- | --- |
| Baseline | **70** | `checkpoints/_orch-typecheck-fe-baseline.txt` + EXIT=2 |
| After | **70** | `checkpoints/_orch-typecheck-fe-after.txt` + EXIT=2 |
| New errors in FE work files | **0** | filtered `error TS` lines — none under `components/work` / `operations.work*` / messenger wires |

Delta: not worsened.

## Chat action wiring

`CreateWorkFromMessageButton` (`src/components/work/CreateWorkFromMessageButton.tsx`):

1. Compact dialog: title + kind + optional acceptance  
2. `buildCreatePayloadFromChat` → `createWorkItem` → `listMergeSuggestions(pending)`  
3. Toast + link to `/operations/work#work-merge-panel` if pending merges

Mounted at:

- `MessageList` — per text message (icon)  
- `MessageComposer` — uses draft text (icon, beside InquiryButton)  
- `AiAssistantDrawer` Bubble — on completed assistant turns (menu label «ثبت کار از این پیام»)

AI SSE path untouched.

## Nav

- `registry.ts`: «دستیار کار» → `/operations/work`, module `invoices` (no `work` ModuleKey), group `operations`  
- `ROLE_ALLOWLIST_BY_ROUTE`: `/operations/work` + `/operations/work/topics` → admin|manager|sales|accountant  
- `primary-modules.ts`: `/operations/work` under dashboard, next to tasks  

## Gate

All four routes: `staticData.gate` + `beforeLoad` → `requireAnyRole(["admin","manager","sales","accountant"])` (mirror call-activity).

## States covered

Board / detail / topics / merge / create / chat intake: loading, empty, error, success paths present in components.

## Not verified in this pass (honest)

- Live Supabase RPC against real DB (no browser E4 against LAN)  
- Cold-session RBAC browser probe [A-10]  
- Visual QA on mobile viewport  

## Out of scope notes

- `ListWorkItemsFilters` lacks `group_name` / `work_mode` — filtered client-side on board  
- Module key reused `invoices` intentionally; dedicated `work` module would need ModuleKey + role_permissions seed  

## حکم

**COMPLETE** for FE deliverable of phases 1–3 UI wiring (typecheck delta OK; routes registered). Runtime DB smoke remains for orchestrator/e2e.
