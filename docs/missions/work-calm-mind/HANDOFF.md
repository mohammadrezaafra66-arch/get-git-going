# HANDOFF

## چه چیزی تغییر کرد

شاخهٔ `feature/work-calm-mind` (HEAD اندازه‌گیری‌شده `00d89363`) سیستم Calm Mind / «دستیار کار» را اضافه کرد: مهاجرت ۵۴۳ با جداول `work_topics`، `work_items`، `work_merge_suggestions` و RPCهای مرتبط (`git log` subjects `6734c233`…`51f98fdf`; `supabase/migrations/20260915233000_543_work_calm_mind.sql:39-194`, `:396-895`). لایهٔ کلاینت `src/lib/work/**` روی همان جداول/RPCهاست (`docs/missions/work-calm-mind/checkpoints/p1-be.md:8-23`; commit `860a8690`). UI فاز ۱–۳: تابلو، جزئیات، موضوعات، صف تصمیم، خلاصهٔ صبحگاهی، ادغام، ثبت از چت (`checkpoints/p1-fe.md:8-48`; commit `b539fccf`). اصلاح RTL عنصر‌به‌عنصر (`checkpoints/rtl-pass.md`; commit `0313c362`). e2e کسب‌وکار `e2e/business-flows/calm-mind-work.spec.ts` با fail-first روی LAN و پاس روی Vite محلی (`checkpoints/e2e.md:36-39`; commit `51f98fdf`).

**Security remediation (544):** glance `sec-rls` حکم **FAIL** (RLS بدون allowlist نقش؛ تغییر مستقیم `work_merge_suggestions.status`) سپس مهاجرت `20260916001500_544_work_calm_mind_rls_role_gate.sql` — allowlist روی policies + `work_can_see_item` + گیت status فقط از طریق RPC (`checkpoints/sec-rls.md:10-12`; `…544….sql:3-11`; `checkpoints/p1-data-rls-fix.md:10-32`; commit `00d89363`). **`viewer` هنوز در allowlist DB هست؛ مسیرهای UI همچنان بدون `viewer`** (`…544….sql:32`, `:55`; `_app.operations.work.tsx:5`; `p1-data-rls-fix.md:32`).

**What shipped (URLs):** `/operations/work`, `/operations/work/$itemId`, `/operations/work/topics`, `/operations/work/topics/$topicId` (`checkpoints/p1-fe.md:10-15`; route files under `src/routes/_app.operations.work*.tsx`).

## چرا

نیاز محصولی «دستیار کار / آرامش ذهن» داخل اپ موجود، بدون شکستن برد عملیات روی `public.tasks` (`docs/missions/work-calm-mind/LEDGER.md:1-6`; `…543_work_calm_mind.sql:4-7`; cartography `docs/research/work-calm-mind/PROJECT_GROUND_TRUTH.md:82`).

## فایل‌ها و خطوط تغییریافته

| Area | Paths | Evidence |
| --- | --- | --- |
| Migration 543 | `supabase/migrations/20260915233000_543_work_calm_mind.sql` (980 lines in commit `6734c233`) | `git show --stat 6734c233` |
| Migration 544 (RLS role gate) | `supabase/migrations/20260916001500_544_work_calm_mind_rls_role_gate.sql` + `docs/verification/544-down.sql` | `git show --stat 00d89363`; `p1-data-rls-fix.md:19-21` |
| Client lib | `src/lib/work/*` (11 files) | `git show --stat 860a8690`; `p1-be.md:11-23` |
| UI + routes + nav | `src/components/work/*`, `src/routes/_app.operations.work*.tsx`, `src/lib/navigation/registry.ts`, `src/components/layout/primary-modules.ts`, messenger hooks | `git show --stat b539fccf`; `p1-fe.md:19-56` |
| RTL | components under `src/components/work/` | `git show --stat 0313c362`; `rtl-pass.md` |
| e2e | `e2e/business-flows/calm-mind-work.spec.ts` + `checkpoints/e2e.md` + `_e2e-*.txt` | `git show --stat 51f98fdf` |
| Security glance (FAIL) | `docs/missions/work-calm-mind/checkpoints/sec-rls.md` | commit `581d2e2b` |
| Docs | `docs/research/work-calm-mind/README.md`, `PROGRESS.md`, this file | amended 2026-09-16 for 544 |

## شواهد در دست با سطحشان

| ادعا | سطح E | دستور یا مسیر:خط |
| --- | --- | --- |
| جداول/RPCهای work_* در مهاجرت ۵۴۳ تعریف شده‌اند | E1/E2 | `…543_work_calm_mind.sql:39`, `:69`, `:184`, `:396`, `:487`, `:555`, `:635`, `:762`, `:895` |
| `public.tasks` عمداً دست نخورده | E2 | `…543_work_calm_mind.sql:7`, `:972-977`; probe note `checkpoints/p1-data.md:58` |
| اعمال مهاجرت روی کپی LAN با `supabase_admin` EXIT=0 | E3 (checkpoint) | `checkpoints/p1-data.md:45-46` → `_543-apply2.out.txt` |
| پروب‌های تریگر ETA / decision_bucket در تراکنش برگشتی PASS | E4 (checkpoint) | `checkpoints/p1-data.md:48-59` → `_543-probes.out.txt` EXIT=0 |
| گیت نقش مسیر: admin\|manager\|sales\|accountant | E2 | `_app.operations.work.tsx:5-10`; `registry.ts:1409-1411` |
| e2e روی Vite `:5199`: ۸ تست، EXIT=0 | E3 | `_e2e-pass.out.txt` (`8 passed (25.0s)`); `_e2e-pass.exit.txt` (`EXIT=0`); `e2e.md:39` |
| e2e روی LAN `:3100` (بدون redeploy): UI fail (heading غایب) | E3/E4 | `_e2e-fail-first.out.txt:10-18`; `e2e.md:38` |
| حکم رجیستری e2e: PARTIAL LAN / COMPLETE local Vite | E1 | `registry/e2e/run.json:12-14` |
| Security glance work_*: **FAIL** (RLS بدون allowlist؛ merge status مستقیم) | E1/E2 | `checkpoints/sec-rls.md:10-12`, `:37-38`, `:51` |
| 544: allowlist روی RLS + گیت status از RPC؛ fail-first سپس DENIED | E3/E4 (checkpoint) | `…544….sql:53-74`, `:252-273`; `p1-data-rls-fix.md:37-52`; commit `00d89363` |
| `viewer` در DB allowlist ۵۴۴؛ UI بدون viewer | E2 | `…544….sql:32`, `:55`; `_app.operations.work.tsx:5`; `p1-data-rls-fix.md:32` |

### How to verify

1. Confirm migration objects: names in `checkpoints/p1-data.md:16-32` vs live DB (not re-probed in this docs pass).
2. Open board at `/operations/work` on a build that includes this branch (local Vite recipe in `checkpoints/e2e.md:12-19`).
3. Run: `npx playwright test e2e/business-flows/calm-mind-work.spec.ts --reporter=list` with `E2E_BASE_URL=http://127.0.0.1:5199` (`e2e.md:21-24`).

### e2e (honest)

Passed **only** against local Vite `:5199` + LAN Supabase; **not** claimed green on default LAN web `:3100` (`e2e.md:36-39`, `:82`).

## چه چیزی تأیید نشد

- Production apply of migrations 543 / 544 (LAN copy only — `checkpoints/p1-data.md:6`, `:63`; `p1-data-rls-fix.md:60-61`).
- Re-run of independent sec-rls glance after 544 (original verdict remains FAIL on pre-544 baseline — `sec-rls.md:10`; remediation evidence is `p1-data-rls-fix.md`, not a second critic pass).
- e2e green on `http://192.168.170.8:3100` without local Vite (`e2e.md:74-75`, `:82`).
- Accept-merge UI/path (suite covers dismiss only — `e2e.md:77`).
- Cold-session RBAC [A-10] (`e2e.md:79`; `p1-fe.md:69`).
- Embedding-based similarity and morning **push** notification (optional backlog in `TASK-MANAGER-METAPROMPT.md:111`; not present as code under `src/components/work/` for notif).
- Live re-run of typecheck/build/e2e by this docs-writer session (relies on checkpoint artifacts above; not re-executed here).
- Push / merge of `feature/work-calm-mind` to shared branches (forbidden without human approval; `CONTRACTS.md:23`).

## ریسک‌های باقی‌مانده

- LAN web image stale at `APP_GIT_SHA=a935be0b` ⇒ SPA 404 for `/operations/work` (`e2e.md:10`).
- Committed `e2e/auth/admin.storage.json` JWT expired; suite mints token instead (`e2e.md:68-70`; spec `calm-mind-work.spec.ts:25-28`).
- Generated `integrations/supabase/types.ts` still lacks `work_*` — lib casts `(supabase as any)` (`p1-be.md:50-51`).
- Nav `module` key reused `invoices` (no dedicated `work` ModuleKey) (`registry.ts:572-573`; `p1-fe.md:54`).
- `viewer` is still in DB RLS allowlist (544) and `role_permissions` module `work`, but UI/nav routes exclude `viewer` (`…544….sql:55`; `…543.sql:23-25`; `_app.operations.work.tsx:5`; `registry.ts:1410`; `p1-data-rls-fix.md:32`).

## دقیقاً چه چیزی باید بازبینی شود

1. **Next (ops):** redeploy `afrakala-lan-web` from this branch and re-run e2e with default `E2E_BASE_URL=http://192.168.170.8:3100` (`e2e.md:74-75`).
2. **Next (product, optional):** embedding similarity upgrade; morning notification; reports (`TASK-MANAGER-METAPROMPT.md:111`).
3. **Review:** accept-merge path + cold RBAC before calling LAN default COMPLETE (`e2e.md:77-79`).
4. **Out of scope for this mission (do not treat as shipped):** ALTER/`public.tasks` / `/operations/tasks` changes (`LEDGER.md:6`); production migration without owner approval (`p1-data.md:63-64`).
5. Module README for reviewers: `docs/research/work-calm-mind/README.md`.
