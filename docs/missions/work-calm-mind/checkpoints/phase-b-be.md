# Phase B BE — classify + intake + API

**Agent:** dev-backend-engineer  
**Branch:** `feature/work-calm-mind`  
**Worktree:** `d:\AfraKalaTest\wt-work-calm`  
**HEAD_start:** `6c717ecc281edcdc67ee3916ac6f87dcd60e4a59`  
**deadline_at:** 2026-09-16T04:00:00+05:00  
**status:** COMPLETE (pending commit SHA fill)

## Heartbeat
- 02:59 — verified HEAD @ 6c717ecc; read types / ai-chat / index
- 03:01 — wrote classify, intake, intake.server, API routes, tests; `npm install` EXIT=0
- 03:02 — unit tests 7/7 pass; routeTree regenerate EXIT=0
- 03:05 — typecheck after: 70 TS errors (baseline match), 0 under work/api/work
- 03:06 — classify examples probe + checkpoint finalize → commit/push

## Files changed (line refs)

| File | Role |
| --- | --- |
| `src/lib/work/classify.ts` | Rule-based FA/EN `classifyWorkItem` + `suggestTitleFromText` |
| `src/lib/work/classify.test.ts` | node:test suite |
| `src/lib/work/intake.ts` | 5 open + 5 MCQ FA questions; `buildIntakeTranscript` / `summarizeIntake` (browser-safe) |
| `src/lib/work/intake.test.ts` | node:test suite |
| `src/lib/work/intake.server.ts` | `summarizeIntakeWithAi` via `aiChat` → local fallback |
| `src/lib/work/index.ts` | Re-exports classify + intake (NOT `.server`) — L70–95 |
| `src/routes/api/work/classify.ts` | POST `/api/work/classify` bearer auth + zod |
| `src/routes/api/work/intake-summary.ts` | POST `/api/work/intake-summary` bearer auth |
| `src/routeTree.gen.ts` | Generated routes for both APIs |

## Callers examined
- Pattern: `src/routes/api/messenger/ai-chat.ts` L65–97 (createFileRoute + Authorization bearer + createClient JWT)
- Types: `src/lib/work/types.ts` L14–16 (`WorkItemKind` / `WorkItemPriority`)
- AI: `src/lib/ai/client.server.ts` `aiChat` — used only from `intake.server.ts` + API route
- Export surface: `src/lib/work/index.ts` — browser-safe only

## Classify examples (E3)

```
npx --yes tsx -e "…classifyWorkItem…"
EXIT=0
```

| input | kind | priority | group | confidence |
| --- | --- | --- | --- | --- |
| باگ فوری در ثبت فاکتور مالی | bug | high | مالی | 0.75 |
| درخواست تغییر: افزودن قابلیت جدید فروش | change_request | normal | فروش | 0.94 |
| چگونه گزارش را دانلود کنم؟ | question | normal | null | 0.74 |
| یادداشت جلسه فردا | note | normal | null | 0.35 |

Full JSON: `_phase-b-be-classify-examples.txt`

## API curl examples

```bash
# Classify (requires staff JWT)
curl -sS -X POST "$ORIGIN/api/work/classify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"باگ فوری در ثبت فاکتور مالی","title":"فاکتور"}'

# expected 200 JSON: { kind, suggestedTitle, group, priority, confidence, reasons }

# missing auth → 401
curl -sS -o /dev/null -w "%{http_code}" -X POST "$ORIGIN/api/work/classify" \
  -H "Content-Type: application/json" -d '{"text":"x"}'
# → 401

# Intake summary (AI if provider; else local)
curl -sS -X POST "$ORIGIN/api/work/intake-summary" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"گزارش","description":"نیاز هفتگی","answers":[{"questionId":"open_goal","value":"ارسال گزارش"},{"questionId":"mcq_area","value":"sales"}]}'
# → { summary, source: "ai"|"local", transcript }
```

Live HTTP against running server **not** exercised in this worktree (no local server started). Route files + routeTree registration proven.

## Evidence

### E4 — behavior previously absent
- **Before:** `git show HEAD:src/lib/work/classify.ts` → fatal path exists on disk but not in HEAD (exit 128)
- **After:** `npx --yes tsx --test src/lib/work/classify.test.ts src/lib/work/intake.test.ts` → `# tests 7 # pass 7 # fail 0` EXIT=0  
  Evidence file: `_phase-b-be-unit.txt`

### E3 — typecheck (do not raise baseline)
| | error TS* count | work/api/work hits | exit |
| --- | --- | --- | --- |
| After (`npx tsc --noEmit`) | **70** | **0** | 2 |
| Prior p1-be baseline | 70 | 0 | 2 |
| Delta | **0** | — | — |

Evidence: `_phase-b-be-typecheck-after.txt`

### E3 — route gen
`npx @tanstack/router-cli@1.167.36 generate` EXIT=0; `routeTree.gen.ts` contains `/api/work/classify` and `/api/work/intake-summary`.

## Commit / push
- commit SHA: _(filled after commit)_
- push: _(filled after push)_

## Untouched (forbidden)
- `public.tasks` — not modified
- Product UI / CreateWorkWizard — not modified
- `d:\AfraKalaTest\app` — not touched
- Untracked `docs/missions/work-calm-mind/registry/phase-b/` — left alone (not ours)

## Blockers / تأییدنشده
- Live curl against authenticated server (needs running app + JWT)
- UI wizard wiring (frontend)
- No dedicated `AiUsageKey` for intake summary (uses default provider walk)

## حکم: COMPLETE (code + unit E4); live HTTP PARTIAL
