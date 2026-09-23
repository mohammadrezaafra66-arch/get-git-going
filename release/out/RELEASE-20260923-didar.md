# RELEASE-20260923-didar — Didar import + city/province + brand shipping

Date: 2026-09-23
Target code: `main` `dd82b6dee26fbbbef4e2c5fe26f1f8746b90add4`
Target tree: `e72f3d31feba1385f41787be46a528ae02691677` (same tree as `origin/staging` `2f296798`; `git diff origin/staging origin/main` is empty)
Format: same engine directives as `release/out/RELEASE-20260923.md`
  (`mig_apply <version> <file.sql>` / `ledger_insert_only <version>`; walk stops at `# Phase 5`).

Owner apply equivalent (do not type from memory):
`mig_apply afrakala-lan-db supabase_admin postgres <version> <file>`

This document is the explicit list `release/apply-release.ps1` → `release/lib/apply-release-engine.sh`
will execute. The engine does **not** scan `supabase/migrations/`. A version that is not written
below as `mig_apply` or `ledger_insert_only` is not applied.

Production (`192.168.170.10`, `192.168.1.43`) is never touched by the test-computer run that
wrote this file. The owner releases by hand.

---

## What this release contains

1. Didar contacts Excel import at `/admin/didar-import` (admin and accountant only; mobile is the only required field; an existing mobile is rejected — no create, no update; source «دیدار»; owner/expert column ignored).
2. Upgrade path: an existing Didar person without an Asan code receives the code on first purchase instead of a duplicate — in manual create and in Asan import. Adding a code to an existing person or changing one: admin and accountant only (trigger `tg_asan_code_role_gate`); sales may still enter a code when creating a brand-new customer.
3. Optional city and province on Didar and Asan import (fill empty; never overwrite a non-empty value).
4. Brand shipping rule with a product pick-list; the quote pays the sum of every matched scoped rule. A catch-all default is used only when nothing scoped matched.

---

## How `decided-migrations.txt` participates

`release/config/decided-migrations.txt` is defence-in-depth only. This release does **not**
edit that file. Pass the same file to `apply-release.ps1 -Decided` as previous releases did.

`ledger_insert_only` is **not** used below. All four versions are new relative to the
20260923 production ledger (741 rows, last applied through 579).

---

## Not listed — 533 and 534 (intentional)

`20260913101000` (`20260913101000_533_pg_cron_http_scheduler.sql`) and
`20260913102000` (`20260913102000_534_cron_run_log.sql`) remain in `supabase/migrations/` and are
**not** listed in Phase 4. They stay excluded. Do not treat their absence as an omission.
Do not roll them forward as part of rollback.

---

# Phase 4 - migrations

Source list: files on `main` that were not in the 20260923 production ledger (741 rows).
Version order. Test DB `afrakala` already has all four.

### Block 1 - Preflight

Confirm the target is not a replica, then take a **new** `pg_dump -Fc` of production `postgres`
as `supabase_admin` and keep it off the git tree. Do not run 3100 compose overrides against
production. Do not set production `VITE_APP_ENV` to the test-banner value.

    docker exec afrakala-lan-db psql -U supabase_admin -d postgres -tAc \
      "SELECT pg_is_in_recovery();"

Expect: pg_is_in_recovery() = f (a replica must STOP this run immediately)

No extra config/data files. Persian values live inside the committed SQL files and must be
applied by the SQL-file method in `AGENTS.md` (Node Buffer / stdin; never a PowerShell pipe).
Hex-verify any Persian literal the owner cares about after apply.

---

### Block 2 - migration 20260923140000 . 20260923140000_580_didar_person_import.sql

New vs the 20260923 ledger. Didar staging tables, `persons.origin`, `didar-import`
`role_permissions` (admin/accountant view true; every other role false).

    mig_apply 20260923140000 20260923140000_580_didar_person_import.sql

Owner: `mig_apply afrakala-lan-db supabase_admin postgres 20260923140000 20260923140000_580_didar_person_import.sql`

Expect: OK 20260923140000_580_didar_person_import.sql
Expect: INSERT 0 1

### Block 3 - migration 20260923141000 . 20260923141000_581_asan_code_upgrade_path.sql

Trigger `tg_asan_code_role_gate` on `person_identifiers` (M9 — not RPC-only).

    mig_apply 20260923141000 20260923141000_581_asan_code_upgrade_path.sql

Owner: `mig_apply afrakala-lan-db supabase_admin postgres 20260923141000 20260923141000_581_asan_code_upgrade_path.sql`

Expect: OK 20260923141000_581_asan_code_upgrade_path.sql
Expect: INSERT 0 1

### Block 4 - migration 20260923150000 . 20260923150000_582_import_city_province.sql

`customers.province`; city/province on both import row tables; live-patch of
`asan_commit_person_batch` and `didar_commit_person_batch`.

    mig_apply 20260923150000 20260923150000_582_import_city_province.sql

Owner: `mig_apply afrakala-lan-db supabase_admin postgres 20260923150000 20260923150000_582_import_city_province.sql`

Expect: OK 20260923150000_582_import_city_province.sql
Expect: INSERT 0 1

### Block 5 - migration 20260923160000 . 20260923160000_583_shipping_brand_product_picks.sql

Table `shipping_cost_rule_products`, RLS, enqueue triggers for brand + pick-list.

    mig_apply 20260923160000 20260923160000_583_shipping_brand_product_picks.sql

Owner: `mig_apply afrakala-lan-db supabase_admin postgres 20260923160000 20260923160000_583_shipping_brand_product_picks.sql`

Expect: OK 20260923160000_583_shipping_brand_product_picks.sql
Expect: INSERT 0 1

---

## Expected ledger after Phase 4

- New ledger rows for `20260923140000`, `20260923141000`, `20260923150000`, `20260923160000`.
- `20260913101000` / `20260913102000` still **absent**.
- `END|<production_db>|on`

---

# Phase 5 - image

The engine **stops here**. `release/apply-release.ps1` never deploys. Image build and deploy are
human steps.

### Block 6 - post-release probes (human)

    docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String APP_GIT_SHA
    git rev-parse --short HEAD
    docker ps --filter name=afrakala-lan --format "{{.Names}}`t{{.Status}}"

Expect: APP_GIT_SHA equals `git rev-parse --short HEAD` for the checkout of this release (`dd82b6de`)
Expect: afrakala-lan-db-role-fix = Exited (0); every other afrakala-lan-* = Up

---

# Phase 6 - deploy notes (human only; not executed by apply-release.ps1)

Compose `up` for `web` **must** carry `--no-deps`. `GIT_SHA` must be set on the command line.

Build (production laptop, that machine's `.env.lan`):

    deploy\lan\build.ps1 web --no-deps

Then `.\deploy\lan\up.ps1` (or the official compose `up -d --no-deps web`) and
`docker restart afrakala-lan-rest`.

### Owner visual check (Persian)

1. ورود اشخاص از دیدار: با حساب مدیر یا حسابدار به `/admin/didar-import` بروید؛ منوی کناری همان نقش‌ها باید «ورود اشخاص از دیدار» را نشان بدهد. فروشنده و مدیر فروش آن را نباید ببینند و نشانی مستقیم باید رد شود. یک فایل نمونه با موبایل معتبر باید شخص با منبع «دیدار» بسازد؛ موبایل تکراری نباید ردیف موجود را عوض کند.
2. ارتقای کد آسان: شخص دیداری بدون کد را با همان موبایل از آسان وارد کنید؛ باید همان شناسه بماند و کد ست شود، شخص دوم ساخته نشود. فروشنده روی پروندهٔ موجود نتواند کد بگذارد؛ حسابدار بتواند.
3. شهر و استان: ستون‌های اختیاری شهر/استان در اکسل دیدار و آسان باید در کارت مشتری دیده شوند و مقدار پرشده را بازنویسی نکنند.
4. قانون ارسال برند: قانونی با برند و چند کالای انتخاب‌شده بسازید؛ پیش‌فاکتوری که همان کالاها را دارد باید جمع قوانین منطبق را نشان بدهد، نه کالای خارج از فهرست و نه هزینهٔ پیش‌فرض صفر روی بقیه.

---

# Rollback

1. Restore the pre-release production `pg_dump`.
2. Redeploy image tag `afrakala-app:rollback-49c4339d`.
3. Do not roll forward 533/534 as part of rollback.

---

# Sign-off

- [ ] Pre-release `pg_dump -Fc` of production `postgres` taken and stored off git
- [ ] Phase 4: 4 `mig_apply` lines, 0 `ledger_insert_only`; 533/534 still absent from ledger
- [ ] Image: `deploy\lan\build.ps1 web --no-deps`; APP_GIT_SHA = `dd82b6de`
- [ ] Four Persian visual checks above

Executor: ______________     Date/time: ______________

Overall: PASSED / STOP  (circle one)
