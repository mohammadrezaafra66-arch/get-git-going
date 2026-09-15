# Calm Mind / دستیار کار

Module research note for the Calm Mind work assistant shipped on branch `feature/work-calm-mind`. Every factual sentence cites a path in this repo.

## What it is

Calm Mind is a work-assistant domain under Operations labeled «دستیار کار» in navigation (`src/lib/navigation/registry.ts:569-574`). It stores work rows in `public.work_*` tables created by migration 543 (`supabase/migrations/20260915233000_543_work_calm_mind.sql:4-7`, `:39-48`, `:69-101`, `:184-194`). The client helpers live under `src/lib/work/` and re-export item/topic/summary/decision/merge APIs without touching `public.tasks` (`src/lib/work/index.ts:1-3`, `:28-55`). UI surfaces are board, item detail, topics list, and topic detail (`docs/missions/work-calm-mind/checkpoints/p1-fe.md:8-22`). Chat intake adds «ثبت کار از این پیام» via `CreateWorkFromMessageButton` mounted on messenger surfaces (`docs/missions/work-calm-mind/checkpoints/p1-fe.md:36-48`).

## Explicit: does **not** use `public.tasks`

Migration 543 states the new tables are intentionally separate and do not `ALTER` `public.tasks` (`supabase/migrations/20260915233000_543_work_calm_mind.sql:7`). Table comments name Calm Mind rows as distinct from the operations board table (`…543_work_calm_mind.sql:50-51`, `:103-104`). The migration end-gate asserts `public.tasks` still exists (`…543_work_calm_mind.sql:972-977`). The work lib header says it does not touch `public.tasks` (`src/lib/work/index.ts:1-3`). The e2e spec header says it never touches `public.tasks` (`e2e/business-flows/calm-mind-work.spec.ts:4-5`). Mission ledger forbids touching `public.tasks` and `/operations/tasks` (`docs/missions/work-calm-mind/LEDGER.md:6`).

## Tables and RPCs (names)

| Kind | Name | Source |
| --- | --- | --- |
| Table | `public.work_topics` | `…543_work_calm_mind.sql:39` |
| Table | `public.work_items` | `…543_work_calm_mind.sql:69` |
| Table | `public.work_merge_suggestions` | `…543_work_calm_mind.sql:184` |
| Trigger fn | `public.work_items_before_write` | `…543_work_calm_mind.sql:126` |
| Helper | `public.work_can_see_item(uuid)` | `…543_work_calm_mind.sql:219`; allowlist added in `…544….sql:19-39` |
| RPC | `public.work_morning_summary()` | `…543_work_calm_mind.sql:396` |
| RPC | `public.work_set_decision_bucket(uuid, text, date)` | `…543_work_calm_mind.sql:487` |
| RPC | `public.work_create_item(...)` | `…543_work_calm_mind.sql:555` |
| RPC | `public.work_scan_merge_suggestions(uuid)` | `…543_work_calm_mind.sql:635` |
| RPC | `public.work_accept_merge(uuid, uuid)` | `…543_work_calm_mind.sql:762` (redefined + merge-RPC gate in 544) |
| RPC | `public.work_dismiss_merge(uuid)` | `…543_work_calm_mind.sql:895` (redefined + merge-RPC gate in 544) |
| Migration 544 | `supabase/migrations/20260916001500_544_work_calm_mind_rls_role_gate.sql` | role allowlist on RLS + `work_can_see_item` + merge status guard (`…544….sql:3-11`, `:19-39`, `:49-246`, `:252-273`) |
| Trigger fn (544) | `public.work_merge_suggestions_status_guard` | `…544….sql:252-273` — status only if `work.merge_rpc=1` |
| Reverse 544 | `docs/verification/544-down.sql` | cited `…544….sql:11`; checkpoint `p1-data-rls-fix.md:21` |

Checkpoint p1-data lists the same tables/RPCs after apply (`docs/missions/work-calm-mind/checkpoints/p1-data.md:16-32`). Similarity scan in SQL is title-token Jaccard with threshold `0.35` and reason `jaccard_title=…` (`…543_work_calm_mind.sql:672-738`; `docs/missions/work-calm-mind/checkpoints/p1-data.md:30`).

`role_permissions` module key is `work`, seeded for every existing role (`…543_work_calm_mind.sql:19-34`; `docs/missions/work-calm-mind/checkpoints/p1-data.md:39-40`).

Reverse-only script for 543 (copy DB): `docs/verification/543-down.sql` (cited from migration header `…543_work_calm_mind.sql:9-11`).

### Security glance → migration 544

Independent security glance on post-543 RLS returned **FAIL**: policies checked identity but not the work role allowlist, so any authenticated role could PostgREST-insert own rows; merge `status` could also be updated without accept/dismiss RPCs (`docs/missions/work-calm-mind/checkpoints/sec-rls.md:10-12`, `:37-38`, `:51`, `:62-63`; commit `581d2e2b`). Forward repair is migration **544** (do not edit 543): RLS SELECT/INSERT/UPDATE require allowlist `admin|manager|sales|accountant|viewer` **AND** prior identity rules; `work_can_see_item` gains the same allowlist; merge status changes require `current_setting('work.merge_rpc')` set by `work_accept_merge` / `work_dismiss_merge` (`…544_work_calm_mind_rls_role_gate.sql:5-11`, `:30-33`, `:53-74`, `:248-273`, `:397`, `:450`; `checkpoints/p1-data-rls-fix.md:10-32`; commit `00d89363`).
## URLs

| Surface | Path | Route file |
| --- | --- | --- |
| Board | `/operations/work` | `src/routes/_app.operations.work.tsx:7` |
| Item detail | `/operations/work/$itemId` | `src/routes/_app.operations.work_.$itemId.tsx` (listed `p1-fe.md:13`) |
| Topics list | `/operations/work/topics` | `src/routes/_app.operations.work_.topics.tsx:7` |
| Topic detail | `/operations/work/topics/$topicId` | listed `p1-fe.md:15` |

Primary-module path includes `/operations/work` next to `/operations/tasks` (`src/components/layout/primary-modules.ts:54-55`).

## Roles

Route gates use `requireAnyRole(["admin","manager","sales","accountant"])` on the board (`src/routes/_app.operations.work.tsx:5-10`) and topics (`src/routes/_app.operations.work_.topics.tsx:5-10`). Nav allowlist matches those four roles for `/operations/work` and `/operations/work/topics` (`src/lib/navigation/registry.ts:1409-1411`). Mission contracts lock the same route gate (`docs/missions/work-calm-mind/CONTRACTS.md:16-19`).

After 544, table RLS + `work_can_see_item` require role allowlist `admin|manager|sales|accountant|viewer` **and** identity (`admin`/`manager` all-rows, else creator/assignee/owner) (`…544….sql:30-61`, `:53-61`). **`viewer` remains DB-allowed** on that allowlist and in `role_permissions` module `work` (`…544….sql:32`, `:55`; `…543….sql:23-25`; `p1-data-rls-fix.md:32`) while **UI routes still exclude `viewer`** (`_app.operations.work.tsx:5`; `registry.ts:1410`).

## How to run locally + e2e command

e2e checkpoint documents local Vite on `127.0.0.1:5199` against LAN Supabase, because LAN web was still `APP_GIT_SHA=a935be0b` without Calm Mind routes (`docs/missions/work-calm-mind/checkpoints/e2e.md:10-24`).

```powershell
# 1) Local Vite (this branch) + LAN Supabase — e2e.md:12-19
$env:DISABLE_LOVABLE_MCP = "1"
$env:APP_SUPABASE_PUBLIC_URL = "http://192.168.170.8:9000"
$env:SUPABASE_PUBLISHABLE_KEY = "<from deploy/lan/.env.lan>"
$env:VITE_APP_ENV = "test"
$env:APP_PUBLIC_ENV = "test"
npx vite --host 127.0.0.1 --port 5199

# 2) Playwright suite — e2e.md:21-24
$env:E2E_BASE_URL = "http://127.0.0.1:5199"
$env:E2E_SUPABASE_URL = "http://192.168.170.8:9000"
npx playwright test e2e/business-flows/calm-mind-work.spec.ts --reporter=list
```

Default `E2E_BASE_URL` in the spec is `http://192.168.170.8:3100` when unset (`e2e/business-flows/calm-mind-work.spec.ts:30`).

### Measured e2e outcomes (do not invent)

| Run | Base URL | Exit | Evidence |
| --- | --- | --- | --- |
| Fail-first UI | `http://192.168.170.8:3100` | **1** | `checkpoints/e2e.md:38`; `_e2e-fail-first.out.txt` — heading «دستیار کار» not found |
| Pass suite | `http://127.0.0.1:5199` | **0** | `checkpoints/e2e.md:39`; `_e2e-pass.out.txt` — `8 passed (25.0s)`; `_e2e-pass.exit.txt` — `EXIT=0` |

Registry summary: `PARTIAL_lan_COMPLETE_local_vite`, `tests_passed: 8`, `exit_pass: 0` (`docs/missions/work-calm-mind/registry/e2e/run.json:12-14`).

## Git commits on this branch (feature work)

From `git log` on `feature/work-calm-mind` (measured HEAD `51f98fdf`):

| SHA | Subject |
| --- | --- |
| `6734c233` | feat(work): مهاجرت ۵۴۳ — جداول Calm Mind بدون دست‌زدن به tasks |
| `860a8690` | feat(work): لایهٔ کلاینت Calm Mind روی work_* |
| `b539fccf` | feat(work): UI فاز ۱–۳ دستیار کار / آرامش ذهن |
| `0313c362` | fix(work): اصلاح RTL عنصر‌به‌عنصر دستیار کار |
| `51f98fdf` | test(work): e2e آرامش ذهن — fail-first سپس ۸ سبز روی Vite محلی |
| `581d2e2b` | docs(work): checkpoint sec-rls — FAIL با شواهد artifact-positive |
| `00d89363` | fix(work): گیت نقش RLS برای work_* (۵۴۴) |

## Remaining optional work

These are **not** claimed as shipped; sources below mark them as backlog or incomplete:

1. **Better embedding / similarity beyond title Jaccard** — mission metaprompt lists «embedding بهتر» as optional remaining work (`TASK-MANAGER-METAPROMPT.md:111`); current DB scan is title-token Jaccard only (`…543_work_calm_mind.sql:672-738`); p1-data notes Jaccard beyond title-token baseline as not done (`checkpoints/p1-data.md:65`).
2. **Morning notification (نوتیف صبح)** — metaprompt lists «نوتیف صبح» as optional remaining (`TASK-MANAGER-METAPROMPT.md:111`); morning **summary strip** via RPC `work_morning_summary` + UI is in phase 1 (`…543_work_calm_mind.sql:396-482`; e2e ok 4 in `_e2e-pass.out.txt:8`); no `notif`/`notification`/`اعلان` matches under `src/components/work/` (repo search, 2026-09-16).
3. **LAN web redeploy** — e2e still needs `afrakala-lan-web` rebuilt from `feature/work-calm-mind` (or later) so default `:3100` passes without local Vite (`checkpoints/e2e.md:74-75`, `:82`).

Also called out as not exercised: accept-merge path (dismiss only), cold-session RBAC (`checkpoints/e2e.md:77-79`).

## Related checkpoints

- Data apply + probes: `docs/missions/work-calm-mind/checkpoints/p1-data.md`
- Client lib: `docs/missions/work-calm-mind/checkpoints/p1-be.md`
- UI phases 1–3: `docs/missions/work-calm-mind/checkpoints/p1-fe.md`
- RTL: `docs/missions/work-calm-mind/checkpoints/rtl-pass.md`
- e2e: `docs/missions/work-calm-mind/checkpoints/e2e.md`
- Pre-build cartography: `docs/research/work-calm-mind/PROJECT_GROUND_TRUTH.md`
