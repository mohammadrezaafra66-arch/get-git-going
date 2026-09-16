# Checkpoint p1-be — Calm Mind work lib (backend client layer)

**Branch:** `feature/work-calm-mind`  
**Agent:** dev-backend-engineer  
**Date:** 2026-09-15

## Delivered

`src/lib/work/**` — thin Supabase client helpers over migration 543 tables/RPCs.

| File | Role |
| --- | --- |
| `types.ts` | Unions + row types matching CHECK constraints |
| `items.ts` | list/get/create/update; create → `work_scan_merge_suggestions` |
| `summary.ts` | `work_morning_summary` |
| `decision.ts` | `work_set_decision_bucket` |
| `merge.ts` | list/scan/accept/dismiss + TS body enrichment |
| `topics.ts` | topic CRUD + link/unlink via `work_items.topic_id` |
| `similarity.ts` | normalize + Jaccard (threshold 0.35) |
| `intakeFromMessage.ts` | `buildCreatePayloadFromChat` |
| `suggestTopic.ts` | heuristic `suggestTopicTitle` (no AI usage key) |
| `index.ts` | re-exports |
| `similarity.test.ts` | node:test for Jaccard |

## Create → merge scan

`createWorkItem` calls RPC `work_create_item`, then `scanMergeSuggestions(id)` (`work_scan_merge_suggestions`), then optionally `enrichMergeSuggestionsWithBody` (title+body+intake_summary inserts via RLS).

## Typecheck (E3)

| | error TS* count | exit |
| --- | --- | --- |
| Before (`npm run typecheck`) | **70** | 2 |
| After | **70** | 2 |
| Delta | **0** | — |
| Errors under `src/lib/work/` | **0** | — |

## Similarity unit probe (E3/E4)

```
npx --yes tsx --test src/lib/work/similarity.test.ts
# tests 4 / pass 4 / fail 0 / EXIT=0
```

Before module existed: `Glob src/lib/work/**` → 0 files. After: Jaccard threshold behavior proven.

## Gaps

- `suggestTopicTitle` is heuristic only — wiring `aiChat` needs a new `AiUsageKey` + route seed (out of scope).
- Generated `integrations/supabase/types.ts` still lacks `work_*` — cast `(supabase as any)`.
- Live RPC E4 against DB not run in this checkpoint (auth session); unit Jaccard covered.

## Forbidden untouched

- `public.tasks`, `/operations/tasks` routes — not modified.
