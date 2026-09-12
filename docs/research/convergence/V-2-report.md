# V-2 — Independent security verification, convergence release

Verifier: **V-2**. I am not the author of any migration, route, or spec checked here.
I read no author report before measuring. Every claim below carries the command that produced it.

Scratch database: **`prod_rehearsal_v2`** only. `afrakala` was touched read-only or not at all.

---

## Restore identity

Dump (inside container `afrakala-lan-db`):

```
$ docker exec afrakala-lan-db sh -c 'ls -la /tmp/prod13.dump && md5sum /tmp/prod13.dump'
-rw-r--r-- 1 root root 35424962 Sep 12 14:11 /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0  /tmp/prod13.dump
```

| field | value |
|---|---|
| dump name | `/tmp/prod13.dump` |
| dump md5 | `6ccd2dbb07a9a4d9bbae4421eb3265e0` |
| size | 35 424 962 bytes |

Restore command and exit code:

```
$ docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U supabase_admin \
    -d prod_rehearsal_v2 --no-owner --disable-triggers /tmp/prod13.dump'
EXIT=1
$ grep -c "^pg_restore: error:" restore.err
21
```

**21 errors, 1 warning.** Classes, counted from `grep "Command was:"`:

| class | count | what failed |
|---|---|---|
| pg_cron extension | 2 | `CREATE EXTENSION ... pg_cron`; `COMMENT ON EXTENSION pg_cron` |
| vault (already present in template) | 2 | `CREATE FUNCTION vault.secrets_encrypt_secret_secret()`; `CREATE VIEW vault.decrypted_secrets` |
| `schema "cron" does not exist` | 17 | 2 × `COPY cron.*`, 2 × `setval('cron.*')`, 11 × `GRANT ... cron.*`, 3 × `ALTER DEFAULT PRIVILEGES ... IN SCHEMA cron` |

**Data-load errors: 2, and I name them rather than wave at them.**

```
Command was: COPY cron.job (jobid, schedule, command, ...) FROM stdin;
Command was: COPY cron.job_run_details (jobid, runid, job_pid, ...) FROM stdin;
```

Both are pg_cron *catalogue* tables that could not load because the extension is absent
in this container. **No `public` or `auth` table failed to load** — `grep` over the
stderr returns no other `TABLE DATA` / `COPY` entry. The practical consequence for this
mission: the restore carries **no scheduled-job rows**, so any check that depends on
`cron.job` content is not measurable here. I flag that where it bites (Section 3, mig. 533/534).

Business data landed:

```sql
SELECT (SELECT count(*) FROM public.persons)  AS persons,
       (SELECT count(*) FROM auth.users)      AS users,
       (SELECT count(*) FROM public.audit_logs) AS audit_logs,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind='r') AS public_tables;
```
```
persons|users|audit_logs|public_tables
4857|37|112696|227
```

### Ledger, before any of the twelve — this is the proof my baseline is a real baseline

```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;      -- 681
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
SELECT version FROM supabase_migrations.schema_migrations WHERE version LIKE '20260913%';
```
```
ledger_rows
681
(1 row)
version
20260912150000
20260912143000
20260912140000
20260908120000
20260908034500
(5 rows)
version
(0 rows)          <-- none of 526..538 present
```

681 rows, top `20260912150000`, **zero** `20260913*` rows. Matches the required baseline exactly.

The twelve, in the order I will apply them:

```
20260913090000_526_catalogue_repair_absent_migration_effects.sql
20260913091000_527_drop_dead_receipt_posting_path_no_guard.sql
20260913092000_528_posted_entry_immutability_no_guard.sql
20260913094000_530_overdue_sensor_covers_unknown_due_date.sql
20260913095000_531_audit_logs_actor_fk_set_null_on_delete.sql
20260913100000_532_drop_duplicate_signup_trigger.sql
20260913101000_533_pg_cron_http_scheduler.sql
20260913102000_534_cron_run_log.sql
20260913103000_535_security3_s5_function_fixes.sql
20260913104000_536_ai_providers_updated_by.sql
20260913105000_537_revoke_truncate_from_authenticated.sql
20260913110000_538_close_anon_execute_on_pre393_functions.sql
```
(no 529 — gap confirmed on disk, `ls supabase/migrations/20260913*.sql` returns 12 files)

---

## Harness identity — which spec talks to which database

I read both helpers before trusting any number.

`e2e/helpers/db.ts:15-17` is parameterised, so `dbRows()` hits **my restore**:

```ts
const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const DB_NAME   = process.env.E2E_DB_NAME      ?? "afrakala";
const DB_USER   = process.env.E2E_DB_USER      ?? "postgres";
```

`e2e/helpers/pgrest.ts:37-39` is **not**, and no environment variable redirects it:

```ts
export function restUrl(): string {
  return `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}/rest/v1`;
}
```

That is Kong in front of the **live `afrakala`** database. So `og61` is a **mixed** spec:
19 of its 23 tests are `dbRows()`-only and are statements about `prod_rehearsal_v2`;
**5 tests issue HTTP calls and are statements about the live LAN database, not about my restore**
(lines 223, 249, 438×2, 474). I mark them below and I do not count their result as evidence
about this release.

Environment used for every Playwright run in this report:

```
E2E_DB_CONTAINER=afrakala-lan-db
E2E_DB_USER=postgres
E2E_DB_NAME=prod_rehearsal_v2
```

Prerequisites resolved without copying any secret: the worktree already carries its own
`node_modules/`, its own `deploy/lan/.env.lan`, and six `e2e/auth/*.storage.json` session files.
Nothing was copied from `D:\AfraKalaTest\app`, and no content of any of those files appears here.

Also applied to the scratch database only, exactly as the brief prescribes, because `--no-owner`
as `supabase_admin` otherwise leaves `postgres` unable to read `auth.users`:

```
GRANT USAGE ON SCHEMA auth, public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA auth, public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth, public TO postgres;
EXIT=0
```

This grant is to `postgres`, not to `anon` or `authenticated`, so it does not disturb any
count in Section 2.

---

## Section 1 — `og61` baseline on a clean restore

### 1a. BEFORE — none of the twelve applied

Ledger state at the moment of this run is the one printed above: **681 rows, top
`20260912150000`, zero `20260913*`**.

```
$ npx playwright test --project=chromium-admin --reporter=line \
    e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts
...
  3 failed
    og61...spec.ts:69:1  › ⛔ anon executes NONE of the 26 definer writers
    og61...spec.ts:400:1 › ⛔ DERIVED: no ungated SECURITY DEFINER writer is reachable by anon
    og61...spec.ts:633:1 › ⛔ DERIVED: no SECURITY DEFINER writer without a CALLER check is reachable by authenticated
  20 passed (12.9s)
EXIT=1
```

**The count is 3, not 8.** I do not know where "8 failing tests" came from and I did not look;
this is what the spec does on a clean production restore with none of the twelve applied.
The three, named, with the exact set each reports:

| # | test | reported set |
|---|---|---|
| 1 | `:69` ⛔ anon executes NONE of the 26 definer writers | `anon can still execute: bot_authenticate_key, refresh_sale_list_prices` |
| 2 | `:400` ⛔ DERIVED: no ungated SECURITY DEFINER writer is reachable by anon | `bot_authenticate_key, expire_stale_credit_holds, post_receipt_journal, refresh_sale_list_prices` |
| 3 | `:633` ⛔ DERIVED: no SECURITY DEFINER writer without a CALLER check is reachable by authenticated | `expire_stale_credit_holds, post_receipt_journal` |

The 20 that passed include the 5 PostgREST tests, whose pass is about the live `afrakala`
database and is **not** evidence about this restore.

### 1b. Applying the twelve - md5 verified on both sides, every file

Per file: local `md5sum`, stdin into the container, container `md5sum`, compare, then
`psql -v ON_ERROR_STOP=1 --single-transaction`. All twelve matched; all twelve exited 0.

| file | md5 (local = container) | exit |
|---|---|---|
| 526_catalogue_repair_absent_migration_effects.sql | 183ee118db0d929d7292e876cb0249a2 | 0 |
| 527_drop_dead_receipt_posting_path_no_guard.sql | 1183f08466fe26905e392e27450ca2f8 | 0 |
| 528_posted_entry_immutability_no_guard.sql | b806a1fd1f1e9e0bd1f0f2657be758cd | 0 |
| 530_overdue_sensor_covers_unknown_due_date.sql | 618a0873816e786b2560b450808f9e3a | 0 |
| 531_audit_logs_actor_fk_set_null_on_delete.sql | 47a8b2d183040f4b793ecedd9802973d | 0 |
| 532_drop_duplicate_signup_trigger.sql | e012d60e442d613e0cd927ae47e6175d | 0 |
| 533_pg_cron_http_scheduler.sql | 610c55e02d9480d7082f50950b0e1bfd | 0 |
| 534_cron_run_log.sql | 6b30be2e620d80f9511ce34b424885d8 | 0 |
| 535_security3_s5_function_fixes.sql | 5a8d88357a2d6ed4141024c25d085fbf | 0 |
| 536_ai_providers_updated_by.sql | 3a1e4b5d18ea20eaec0827c1ff2da7e3 | 0 |
| 537_revoke_truncate_from_authenticated.sql | cf4e1d0907001a07de2e474d87a0a752 | 0 |
| 538_close_anon_execute_on_pre393_functions.sql | 39b963b8d4c69f8571ae2303288a4614 | 0 |

Three NOTICEs from that run that matter to the rest of this report, quoted verbatim:

    533: current_database() = prod_rehearsal_v2, not "postgres" -- pg_cron extension and all
         eight job rows are SKIPPED on purpose. Wrapper functions, their REVOKEs, and
         cron_run_log (534) were still created.
    537: authenticated holds TRUNCATE on 0 of 228 tables; service_role still holds it on all 228.
    538: closed 36 function(s) to anon; issued 23 preserving grant(s); 0 skipped.
    538 OK: anon executes 0 outside the exclusions.

### 1c. AFTER - all twelve applied, same restore, same command

    $ npx playwright test --project=chromium-admin --reporter=line \
        e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts
      23 passed (11.8s)
    EXIT=0

### 1d. The diff, per test - not in aggregate

| test | before | after | verdict |
|---|---|---|---|
| `:69` anon executes NONE of the 26 definer writers | FAIL (bot_authenticate_key, refresh_sale_list_prices) | PASS | **pre-existing, FIXED** |
| `:400` DERIVED: no ungated definer writer reachable by anon | FAIL (bot_authenticate_key, expire_stale_credit_holds, post_receipt_journal, refresh_sale_list_prices) | PASS | **pre-existing, FIXED** |
| `:633` DERIVED: no definer writer without a CALLER check reachable by authenticated | FAIL (expire_stale_credit_holds, post_receipt_journal) | PASS | **pre-existing, FIXED** |
| the other 20 | PASS | PASS | unchanged - **nothing was caused** |

**Plain statement: every failure observed is PRE-EXISTING, none is CAUSED, and all three are
FIXED.** No test that passed before fails after.

**The caveat I will not bury.** Five of the 20 unchanged tests (`:223`, `:249`, `:438` x2,
`:474`) go through `pgrest.ts` to the live `afrakala` database. They were green before and after
because they were never looking at my restore at all. Their pass is NOT evidence about this
release. The 18 db-only tests are.

### 1e. A defect this run exposed, unrelated to og61 - the ledger does not advance

After applying all twelve:

    SELECT 'ledger_rows='||count(*) FROM supabase_migrations.schema_migrations;  -- ledger_rows=681
    SELECT 'top='||version FROM ... ORDER BY version DESC LIMIT 1;               -- top=20260912150000
    SELECT ... WHERE version LIKE '20260913%';                                   -- (0 rows)

**681 rows and top 20260912150000 - identical to before.** No migration file writes its own row:

    $ grep -n "schema_migrations" supabase/migrations/20260913*.sql
    535:290:-- supabase_migrations.schema_migrations and expects `INSERT 0 1` as the proof ...
    536:112:-- supabase_migrations.schema_migrations and expects `INSERT 0 1` as the proof ...
    537:194:-- supabase_migrations.schema_migrations and expects `INSERT 0 1` as the proof ...
    538:306:-- supabase_migrations.schema_migrations and expects `INSERT 0 1` as the proof ...

Four comments instructing a human to do it; **zero INSERT statements**, and 526-534 do not even
carry the comment. Meanwhile 526 prints this at line 1304:

    RAISE NOTICE '526 OK: ... Ledger rows for 386/394/396/404/409 are untouched;
                  this migration records its own new row.';

**It does not record its own row.** That NOTICE is false as written, and it is the kind of false
that matters: it tells the operator the step was taken. Concrete failure: an operator who applies
these twelve by psql and trusts the NOTICE leaves twelve applied-but-unrecorded migrations. The
next person reading the ledger to plan a production deploy concludes twelve are outstanding and
re-runs them - and 526 drops a function overload, 527 drops post_receipt_journal and a trigger,
532 drops a trigger, so a re-run is not idempotent in the direction that matters. This is exactly
the hazard CLAUDE.md rule 2b was written for, and
`e2e/security/og81-migration-ledger-matches-disk.spec.ts` will go red on the LAN database the
moment these twelve are applied without twelve ledger rows.

Scope note: a deploy-procedure defect, not a schema defect. Every object-level check in
Sections 2-4 confirms the twelve really did apply.

---

## Section 2 - anon census, before and after, same restore

Each number is produced by the query shown, run on `prod_rehearsal_v2` before applying the twelve
and again after, with nothing else touching the database in between.

| metric | before | after | direction |
|---|---|---|---|
| A - functions in `public` that `anon` may EXECUTE | **544** | **505** | -39 |
| B - tables (relkind r,p) `anon` may SELECT | **13** | **13** | unchanged |
| C - tables on which `anon` holds INSERT/UPDATE/DELETE/TRUNCATE | **0** | **0** | unchanged, and the required zero |
| D - views + matviews (relkind v,m) `anon` may read | **7** | **7** | unchanged |
| E - pg_default_acl entries granting `anon` anything (tables AND functions) | **0** | **0** | unchanged |
| F (extra, not requested) - tables on which `authenticated` holds TRUNCATE | **214** | **0** | -214 |

Queries:

    -- A
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'EXECUTE');
    -- B
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('r','p')
       AND has_table_privilege('anon',c.oid,'SELECT');
    -- C
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('r','p')
       AND (has_table_privilege('anon',c.oid,'INSERT') OR has_table_privilege('anon',c.oid,'UPDATE')
         OR has_table_privilege('anon',c.oid,'DELETE') OR has_table_privilege('anon',c.oid,'TRUNCATE'));
    -- D
    SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('v','m')
       AND has_table_privilege('anon',c.oid,'SELECT');
    -- E
    SELECT count(*) FROM pg_default_acl d, unnest(d.defaclacl) a WHERE a::text LIKE 'anon=%';

### Counts are not enough - I diffed the NAMES, because a count can hide a swap

**A (functions): 0 added, 39 removed.** `comm -13 before after` is empty. The 39 removed:

    _par_latest_usd_rate()                      get_observatory_pdf_hints_for_products(uuid[])
    _promo_policy_for(uuid)                     get_observatory_snippets_for_products(uuid[])
    asan_list_bank_deposit_export(date,date)    get_product_price_bounds(uuid,uuid)
    bot_authenticate_key(text)                  get_product_stats(uuid)
    calculate_adjusted_price(uuid)              get_product_timeline(uuid,integer,integer)
    compute_promotion_scores(uuid,numeric,int)  get_rank_neighbors(uuid,text,integer)
    create_dual_document(...)                   get_receivable_detail(uuid,uuid)
    create_payment(...)                         get_recent_purchase_label(uuid)
    create_receipt(...)                         get_recent_purchase_labels(uuid[])
    expire_stale_credit_holds(integer)          get_workflow_settings()
    find_duplicate_product(...)                 person_fk_registry_report()
    get_current_league(uuid)                    person_merge_registry_keys()
    get_customer_credit(uuid)                   post_receipt_journal(uuid)
    get_employee_rank(uuid)                     product_videos_waiting()
    get_leaderboard(...)                        refresh_sale_list_prices(uuid)
    get_leaderboard_all_time(...)               require_asan_code(uuid)
    get_leaderboard_daily(...)                  resolve_market_product_match(...)
    get_leaderboard_monthly(...)                search_messenger_messages_semantic(uuid,vector,int)
    get_leaderboard_weekly(...)
    get_league_leaderboard(league_tier,int,int)
    get_numeric_setting(text,numeric)

Two left the set by being **dropped**, not revoked - `post_receipt_journal(uuid)` (527) and the
`expire_stale_credit_holds(integer)` overload (526). The rest lost the grant.
This list is not only definer *writers*: `get_customer_credit`, `get_receivable_detail`,
`get_observatory_snippets_for_products` and the whole leaderboard family are **sensitive
readers** ([A-4]). Closing them to `anon` reduces what an unauthenticated caller can READ, not
only what it can write.

**B (tables): byte-identical lists**, `diff` empty. The 13 are
academy_quiz_questions, brands, categories, currencies, league_settings, payment_terms,
presence_logs, pricing_recompute_queue, product_images, products, profile_field_definitions,
purchase_prices, sale_price_types.

**D (views): byte-identical lists.** The 7 are academy_quiz_questions_public,
effective_currencies_view, employee_monthly_hours, v_latest_active_purchase_prices,
v_league_tiers_public, v_pricing_recompute_queue_summary, vw_purchase_float.

**E (pg_default_acl): empty both times** - no default ACL grants `anon` anything, so no new
object in `public` is born anon-readable or anon-executable.

I also diffed the WHOLE `pg_default_acl` for every grantee, not only `anon`, because that is
where a grant arrives that no GRANT statement in history mentions ([C-3] item 5). Exactly one
line moved, in the safe direction, for both grantors:

    - postgres       / public / r / authenticated=arwdDxt/postgres
    + postgres       / public / r / authenticated=arwdxt/postgres
    - supabase_admin / public / r / authenticated=arwdDxt/supabase_admin
    + supabase_admin / public / r / authenticated=arwdxt/supabase_admin

The dropped letter is `D` = TRUNCATE. That is migration 537, and it is the load-bearing half of
it: revoking TRUNCATE from 215 existing tables while leaving the DEFAULT in place would have
re-granted it on the next CREATE TABLE. Both grantors were fixed.

**Section 2 verdict: nothing increased on any of the five measures. GREEN.**

Standing observation, measured, NOT a finding against this release: `pg_default_acl` still
carries `authenticated=arwdxt` on new tables in `public`. Every table created in `public` from
now on is born with INSERT/SELECT/UPDATE/DELETE for `authenticated` and is protected only by RLS.
Pre-existing and out of this release's scope; recorded because Section 3 needs it.

---

## Section 4 - the two live holes, closed by BEHAVIOUR

Method: a real `anon` session inside `BEGIN; ... ROLLBACK;` on `prod_rehearsal_v2`. I did NOT use
PostgREST here, deliberately: `pgrest.ts` would have gone to the live `afrakala` database and told
me nothing about this release. Probe arguments chosen under [A-9] so that a caller which reaches
the body still writes nothing - `'x'` is shorter than bot_authenticate_key's own 8-character
minimum, and the all-zero UUID matches no sale_list_items row.

    BEGIN;
    SET LOCAL ROLE anon;
    SET LOCAL "request.jwt.claims" = '{"role":"anon"}';
    SELECT 'current_user='||current_user||' session_user='||session_user;
    DO $probe$ BEGIN PERFORM public.bot_authenticate_key('x');
      RAISE NOTICE 'PROBE bot_authenticate_key -> RETURNED (no error) = REACHED';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'PROBE bot_authenticate_key -> SQLSTATE=% MSG=%', SQLSTATE, SQLERRM; END $probe$;
    DO $probe2$ BEGIN
      PERFORM public.refresh_sale_list_prices('00000000-0000-0000-0000-000000000000'::uuid);
      RAISE NOTICE 'PROBE refresh_sale_list_prices -> RETURNED (no error) = REACHED';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'PROBE refresh_sale_list_prices -> SQLSTATE=% MSG=%', SQLSTATE, SQLERRM; END $probe2$;
    ROLLBACK;

**BEFORE the twelve:**

    current_user=anon session_user=supabase_admin
    NOTICE:  PROBE bot_authenticate_key     -> SQLSTATE=P0001 MSG=invalid_key
    NOTICE:  PROBE refresh_sale_list_prices -> RETURNED (no error) = REACHED

**AFTER the twelve (identical script, identical database):**

    current_user=anon session_user=supabase_admin
    NOTICE:  PROBE bot_authenticate_key     -> SQLSTATE=42501 MSG=permission denied for function bot_authenticate_key
    NOTICE:  PROBE refresh_sale_list_prices -> SQLSTATE=42501 MSG=permission denied for function refresh_sale_list_prices

Read exactly: `P0001 invalid_key` is the function's OWN validation, raised in the first statement
of its body - an unauthenticated caller was INSIDE the body. And `refresh_sale_list_prices` did
not raise at all; it ran to completion for `anon`. After 538 both return
`42501 insufficient_privilege`, which is the caller refused at the door.

**Why reading the ACL would not have been sufficient here, concretely.** Before 538 the catalogue
read:

    refresh_sale_list_prices(p_list_id uuid) secdef=true
      acl={=X/supabase_admin, supabase_admin=X/..., postgres=X/..., anon=X/...,
           authenticated=X/..., service_role=X/...}

The leading `=X/supabase_admin` is a grant to **PUBLIC**. Revoking `anon` alone would have left
that entry and the door open, and an ACL inspection that greps only for `anon=` would have
reported success. The 42501 above proves the named grant AND the PUBLIC grant are both gone,
because has_function_privilege resolves PUBLIC too.

**Section 4 verdict: GREEN, by behaviour, both functions, both directions.**

---

## Section 3 - the structural rules, on what this release adds

Surface confirmed with a read-only `git diff` (no git state was changed; I ran only
`rev-parse`, `status --porcelain`, `diff`, `show`):

    $ git rev-parse HEAD
    1c7e6d5e62e7e58adee89e95b48dbb3441333dd5        <- matches the briefed HEAD
    $ git status --porcelain
    ?? docs/research/convergence/V-1-report.md      <- another agent's file. Not touched. [D-1]
    ?? docs/research/convergence/V-2-report.md      <- mine
    $ git diff --name-status ad0138df..HEAD
    A  supabase/migrations/20260913{090000..110000}_{526..538}.sql   (12 files)
    A  e2e/security/e2-signup-audit-and-actor-delete.spec.ts
    A  docs/... (23 documentation and verification artefacts)
    M  src/routes/_app.accounting.payables.tsx
    M  src/routes/_app.dashboard.tsx
    M  src/routes/_app.pricing.index.tsx
    M  src/routes/sitemap[.]xml.ts

### 3a. No new bare SECURITY DEFINER writer reachable by `authenticated`

First: which routines do the twelve actually create, as opposed to replace? I answered that from
the dump itself rather than from any file's header, by listing the archive:

    $ docker exec afrakala-lan-db sh -c 'pg_restore --list /tmp/prod13.dump' | grep -i "FUNCTION public ..."

Present in the production dump (so `CREATE OR REPLACE` = **replaced**): `admin_delete_ai_provider`,
`admin_upsert_ai_provider`, `asan_list_bank_deposit_export`, `can_issue_customer_invoice`,
`create_purchase`, `delete_bot_api_key_secure`, `get_payables_list`,
`upsert_staff_daily_performance_metric`.

**Absent from the dump (genuinely NEW):** `run_issabel_import`,
`generate_birthday_notifications_worker`, `set_ai_providers_updated_by`,
`tg_journal_entry_immutable`, `tg_journal_line_immutable`, and the table `cron_run_log`.

Measured state of all thirteen routines after the twelve
(`has_function_privilege` on the live restore, not from any file):

| routine | new? | secdef | writes | anon | authenticated | caller check in body |
|---|---|---|---|---|---|---|
| `run_issabel_import()` | **NEW** | **false** | yes | false | **false** | n/a - unreachable by both web roles |
| `generate_birthday_notifications_worker()` | **NEW** | **false** | yes | false | **false** | n/a - unreachable by both web roles |
| `set_ai_providers_updated_by()` | **NEW** | false | no | false | **false** | trigger function |
| `tg_journal_entry_immutable()` | **NEW** | false | no | false | true | trigger function; runs as invoker |
| `tg_journal_line_immutable()` | **NEW** | false | no | false | true | trigger function; runs as invoker |
| `create_purchase(...)` | replaced | true | yes | false | true | **yes** |
| `get_payables_list(...)` | replaced | true | no | false | true | **yes** |
| `upsert_staff_daily_performance_metric(...)` | replaced | true | yes | false | true | **yes** |
| `asan_list_bank_deposit_export(date,date)` | replaced | true | no | false | true | **yes** |
| `can_issue_customer_invoice(uuid)` | replaced | true | no | false | true | **yes** |
| `delete_bot_api_key_secure(uuid,text)` | replaced | true | yes | false | true | **yes** |
| `admin_upsert_ai_provider(...)` | replaced | true | yes | false | true | **yes** |
| `admin_delete_ai_provider(uuid)` | replaced | true | yes | false | true | **yes** |

**Result: the twelve create ZERO new SECURITY DEFINER routines.** The rule's subject set for
"new" is empty. The two new procedures are deliberately not SECURITY DEFINER and are closed to
both `anon` and `authenticated`; the three new trigger functions are not SECURITY DEFINER either.

For the eight *replaced* SECURITY DEFINER objects - all reachable by `authenticated`, five of
which write - here is each caller check, quoted from the migration that installs it:

`create_purchase` - `526:365-378`
> ```
>   IF _uid IS NULL THEN
>     RAISE EXCEPTION 'احراز هویت لازم است.'
>       USING ERRCODE = '42501', HINT = 'PURCHASE_NOT_AUTHENTICATED';
>   END IF;
>   _is_priv := public.has_any_role(_uid, ARRAY['admin','manager']::text[]);
>   IF p_request_id IS NULL AND NOT _is_priv THEN
>     RAISE EXCEPTION 'اجازهٔ ثبت سند خرید ندارید.'
>       USING ERRCODE = '42501', HINT = 'PURCHASE_PERMISSION_DENIED';
>   END IF;
> ```

`get_payables_list` - `526:829-831`
> ```
>   IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
>     RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
>   END IF;
> ```

`upsert_staff_daily_performance_metric` - `526:895-900`
> ```
>   IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
>   IF NOT public.has_any_role(v_uid,
>        ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
>     RAISE EXCEPTION 'دسترسی غیرمجاز برای ثبت عملکرد روزانه';
>   END IF;
> ```
> (note: this one raises with no ERRCODE, so it is recognised as a gate only by the
> `has_any_role` signal, not by SQLSTATE. It is a real caller check; the SQLSTATE is just not 42501.)

`asan_list_bank_deposit_export` - `526:1038-1040`
> ```
>   IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
>     RAISE EXCEPTION 'اجازهٔ خروجی گرفتن از واریزیهای بانکی را ندارید' USING ERRCODE = '42501';
>   END IF;
> ```

`can_issue_customer_invoice` - `530:60-62`
> ```
>   IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]) THEN
>     RAISE EXCEPTION 'دسترسی غیرمجاز' USING ERRCODE = '42501';
>   END IF;
> ```

`delete_bot_api_key_secure` - `535:57-65`
> ```
>   IF NOT EXISTS (
>     SELECT 1 FROM public.user_roles
>     WHERE user_id = v_user_id
>       AND (role::text = 'admin' OR role::text = v_managed_role)
>   ) THEN
>     RAISE EXCEPTION 'UNAUTHORIZED: شما مجاز به حذف این کلید نیستید'
>       USING ERRCODE = 'P0001';
>   END IF;
> ```
> A real caller check that reads `user_roles` for `auth.uid()` directly - invisible to a
> `has_role` grep ([A-6]). 535's own purpose is that this check previously collapsed a multi-role
> caller into one arbitrary role via `LIMIT 1` with no `ORDER BY`; the rewrite authorises if ANY
> of the caller's role rows qualifies.

`admin_upsert_ai_provider` - `535:124-127` and `admin_delete_ai_provider` - `535:229-232`
> ```
>   IF NOT public.has_role(auth.uid(), 'admin') THEN
>     RAISE EXCEPTION 'فقط مدیر سیستم می‌تواند ارائه‌دهنده هوش مصنوعی را ...'
>       USING ERRCODE = '42501';
>   END IF;
> ```

**3a verdict: no finding. Zero new SECURITY DEFINER writers; every replaced one carries a quoted
caller check; none is reachable by `anon`.**

### 3b. The 507 rule - own REVOKE, in the same migration file

Every `REVOKE`/`GRANT` statement in all twelve files, exhaustively:

    $ grep -nE "^\s*(REVOKE|GRANT)" supabase/migrations/20260913*.sql
    530:91:REVOKE EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) FROM PUBLIC;
    530:92:REVOKE EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) FROM anon;
    530:93:GRANT  EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) TO authenticated;
    530:94:GRANT  EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) TO service_role;
    533:245:REVOKE ALL ON PROCEDURE public.run_issabel_import() FROM PUBLIC;
    533:246:REVOKE ALL ON PROCEDURE public.run_issabel_import() FROM anon;
    533:247:REVOKE ALL ON PROCEDURE public.run_issabel_import() FROM authenticated;
    533:248:GRANT EXECUTE ON PROCEDURE public.run_issabel_import() TO postgres, supabase_admin, service_role;
    533:444:REVOKE ALL ON PROCEDURE public.generate_birthday_notifications_worker() FROM PUBLIC;
    533:445:REVOKE ALL ON PROCEDURE public.generate_birthday_notifications_worker() FROM anon;
    533:446:REVOKE ALL ON PROCEDURE public.generate_birthday_notifications_worker() FROM authenticated;
    533:447:GRANT EXECUTE ON PROCEDURE public.generate_birthday_notifications_worker()
    536:77:REVOKE ALL ON FUNCTION public.set_ai_providers_updated_by() FROM PUBLIC;
    536:78:REVOKE ALL ON FUNCTION public.set_ai_providers_updated_by() FROM anon;
    536:79:REVOKE ALL ON FUNCTION public.set_ai_providers_updated_by() FROM authenticated;

538's revokes are generated inside a `DO` loop and so do not appear in this grep; they are covered
in Section 4.

| object | migration | own REVOKE in its own file? |
|---|---|---|
| `run_issabel_import()` (NEW) | 533 | **yes, full** - PUBLIC + anon + authenticated |
| `generate_birthday_notifications_worker()` (NEW) | 533 | **yes, full** |
| `set_ai_providers_updated_by()` (NEW) | 536 | **yes, full** |
| `can_issue_customer_invoice(uuid)` SECDEF | 530 | **partial** - PUBLIC + anon revoked; `authenticated` deliberately re-granted at `530:93` |
| `create_purchase(...)` SECDEF | 526 | **NO REVOKE AT ALL** |
| `get_payables_list(...)` SECDEF | 526 | **NO REVOKE AT ALL** |
| `upsert_staff_daily_performance_metric(...)` SECDEF | 526 | **NO REVOKE AT ALL** |
| `asan_list_bank_deposit_export(date,date)` SECDEF | 526 | **NO REVOKE AT ALL** - and it is `DROP FUNCTION` + `CREATE` (526:1026-1028), which RESETS the ACL |
| `delete_bot_api_key_secure(...)` SECDEF | 535 | **NO REVOKE AT ALL** |
| `admin_upsert_ai_provider(...)` SECDEF | 535 | **NO REVOKE AT ALL** |
| `admin_delete_ai_provider(uuid)` SECDEF | 535 | **NO REVOKE AT ALL** |
| `tg_journal_entry_immutable()`, `tg_journal_line_immutable()` | 528 | no - 528 argues at `528:32-33` that they are plain trigger functions, not SECURITY DEFINER, so the contract does not apply. I verified `prosecdef=false` for both. The argument holds. |

**FINDING (structural; not exploitable in the state I measured): seven SECURITY DEFINER objects
are installed by 526 and 535 with no REVOKE in their own migration file.**

What actually protects them, measured: all seven read `anon=false` after the twelve. That safety
comes from two places, and **neither is the migration file**:

1. `CREATE OR REPLACE` preserves an existing ACL, so the six `OR REPLACE` cases inherit whatever
   an earlier migration left behind.
2. `asan_list_bank_deposit_export` IS dropped and recreated, so its ACL was genuinely reset - to
   `pg_default_acl`'s value. Measured after the twelve:
   `acl={postgres=X, supabase_admin=X, authenticated=X, service_role=X}` - no `anon`, no PUBLIC,
   purely because Section 2 measured `pg_default_acl` granting `anon` nothing (E = 0).

Concrete failure this leaves open: if `pg_default_acl` in `public` ever regains an `anon` or
PUBLIC entry - one `ALTER DEFAULT PRIVILEGES` from any superuser in any future migration - the
next `DROP`+`CREATE` of any of these seven silently reopens an admin-gated function to the
unauthenticated internet, and nothing in 526 or 535 contradicts it. That is the hazard 507 exists
to remove: a rule living in a default instead of in the statement. Impact today is bounded because
all seven carry body-level `has_role`/`has_any_role` checks (quoted in 3a), so reaching them buys
an anonymous caller an error rather than a write.

### 3c. New policies with `qual = true`

The twelve create exactly one policy (`grep -nE "CREATE POLICY" supabase/migrations/20260913*.sql`
returns one hit, `534:56`). Measured on the live restore:

    cron_run_log_admin_manager_read | cmd=r | permissive=true | roles=authenticated
      | qual=has_any_role(uid(), ARRAY['admin'::text, 'manager'::text])
      | check=(none)

**Not `true`. No finding.** No other policy is created, altered or dropped by the twelve.

The one new table, and a point worth naming because it is a case of "RLS is the only barrier":

    cron_run_log: rls_enabled=true rls_forced=false
      anon_select=false | auth_select=true | auth_insert=true | auth_update=true
      auth_delete=true | auth_truncate=false
      acl={postgres=arwdDxt/..., supabase_admin=arwdDxt/..., authenticated=arwdxt/...,
           service_role=arwdDxt/...}

`authenticated` holds table-level INSERT/UPDATE/DELETE on `cron_run_log`, inherited from
`pg_default_acl` (Section 2), not from anything 534 wrote. 534 creates no write policy and argues
at `534:61-64` that RLS therefore denies by default. **I did not take that on trust - I measured
it**, in a rolled-back transaction as a real session of each role:

    BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claims" = '{"role":"authenticated","sub":"<admin uuid>"}';
    INSERT INTO public.cron_run_log(job_name,status) VALUES ('v2_probe','running');
    ROLLBACK;
    -> NOTICE: SQLSTATE=42501 MSG=new row violates row-level security policy for table "cron_run_log"

    BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.cron_run_log; ROLLBACK;
    -> NOTICE: SQLSTATE=42501 MSG=permission denied for table cron_run_log

The `authenticated` INSERT is refused by RLS; `anon` is refused one layer earlier, at the GRANT.
**Honest limit on the read half:** the `authenticated` SELECT probe returned "0 row(s) visible",
but `cron_run_log` is empty on this restore, so that number proves nothing about the read policy.
The policy's `qual` is quoted above; its behaviour on non-empty data is **not measured**.

### 3d. `staticData.gate` on new routes

**No route is new.** All four files are `M` in `git diff --name-status ad0138df..HEAD`, so the
rule's subject set is empty and it cannot be violated by this release. Reporting each anyway:

| file | defines a route? | gate |
|---|---|---|
| `src/routes/_app.accounting.payables.tsx` | yes, `/_app/accounting/payables` | **present**, line 51: `staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } }` |
| `src/routes/_app.dashboard.tsx` | yes, `/_app/dashboard` | **absent.** Lines 43-45 only: `beforeLoad: async () => { await requirePermission("dashboard", "view"); }` |
| `src/routes/_app.pricing.index.tsx` | yes, `/_app/pricing/` | **absent.** Lines 30-32 only: `beforeLoad: async () => { await requirePermission("pricing", "view"); }` |
| `src/routes/sitemap[.]xml.ts` | yes, `/sitemap.xml`, a server `GET` handler | **absent, and correctly so** - it emits a static three-entry XML document for `/`, `/login`, `/register`, reads no database and no session |

The two absences are **pre-existing, not introduced**: the diffs touch no route-definition block.
`_app.dashboard.tsx` changes only Persian digit formatting in three KPI subtitles;
`_app.pricing.index.tsx` only removes a `t.enabled` branch; `_app.accounting.payables.tsx` only
adds a currency-label lookup. The distinction matters because, per
`e2e/phase6/m6-route-guard.spec.ts:59`, a route that calls a guard but carries no
`staticData.gate` is described by the project's own suite as "fail-open on a full page load" -
`beforeLoad` runs client-side and `RouteRoleGate` is what enforces the cold-load case ([A-10]).

Measured evidence that these two absences are within the project's own tolerated set rather than a
regression:

    $ npx playwright test --project=chromium-admin --reporter=line \
        e2e/phase6/m6-route-guard.spec.ts \
        e2e/security/s5-guarded-admin-routes-carry-a-client-gate.spec.ts
      106 passed (1.9m)

Those suites are source-level (no database), so their result is valid independent of which
database is pointed at. They assert that every guarded tier-1/accounting route carries a matching
`staticData.gate`, that gate and guard cannot drift, and that `RouteRoleGate` is still mounted.
`/dashboard` and `/pricing` are not in their tier-1 set.

Two by-products of the diffs, neither a vulnerability:

- `sitemap[.]xml.ts` changed `BASE_URL` from a hardcoded `https://get-git-going.lovable.app` to
  `BRANDING.publicOrigin`, which resolves to `"https://myafrakala.ir"`
  (`src/config/branding.ts:19`). A public brand domain, not an internal LAN address, so this
  unauthenticated endpoint leaks no internal topology. It is an improvement.
- `_app.pricing.index.tsx` removed the disabled-tile branch. I checked whether that turned a dead
  tile into a live link: `git show ad0138df:src/routes/_app.pricing.index.tsx | grep -c
  "enabled: false"` returns **0**, and the current file has none either - every tile was already
  `enabled: true`. No new navigation path was opened.

---

## Section 5 - S-2 inventory: every RLS policy whose `qual` is literally `true`

**Measurement only. I recommend nothing and I changed nothing.** Taken on production shape
(`prod_rehearsal_v2`). The twelve add exactly one policy and its `qual` is not `true` (3c), so this
list is identical before and after the release.

Query:

    SELECT c.relname, pol.polname, pol.polcmd, pol.polpermissive, pol.polroles,
           pg_get_expr(pol.polqual, pol.polrelid), pg_get_expr(pol.polwithcheck, pol.polrelid),
           EXISTS (SELECT 1 FROM pg_policy p2
                    WHERE p2.polrelid = pol.polrelid AND NOT p2.polpermissive
                      AND (p2.polcmd = pol.polcmd OR p2.polcmd = '*')) AS restrictive_partner
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND btrim(coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')) = 'true'
     ORDER BY c.relname, pol.polname;

Totals: **35 policies with `qual = true`, across 34 distinct tables, out of 646 policies in
`public`.** Every one is `PERMISSIVE`; every one is `SELECT` except `inquiries.inquiry_update_rpc`
(`UPDATE`). `with_check` is `(none)` on all 35.

Legend: **RP** = a `RESTRICTIVE` policy exists on the same table for the same command (or `ALL`).
**Data** = my classification from the table's actual column list, which I pulled rather than
guessed.

| table | policy | cmd | roles | RP | anon SELECT grant | data |
|---|---|---|---|---|---|---|
| brands | brands_public_read | SELECT | anon | no | yes | reference |
| call_log_extensions | call_log_extensions_select_authenticated | SELECT | authenticated | no | no | **personal** (extension + employee_id + updated_by) |
| categories | categories_public_read | SELECT | anon | **yes** | yes | reference |
| category_product_attributes | cpa_read_authed | SELECT | authenticated | no | no | reference |
| category_required_services | category_required_services_select | SELECT | authenticated | no | no | reference |
| currencies | currencies_read_authed | SELECT | authenticated | no | yes | reference |
| currency_rate_fetches | crf_read | SELECT | authenticated | no | no | **financial** (rate, fetched_by, approved_by, status) |
| custom_roles | custom_roles_read_authed | SELECT | authenticated | **yes** | no | security config (role catalogue) |
| daily_mood_hafez_poems | hafez readable to authenticated | SELECT | authenticated | no | no | content |
| daily_mood_questions | questions readable to authenticated | SELECT | authenticated | no | no | content |
| daily_mood_scenarios | scenarios readable to authenticated | SELECT | authenticated | no | no | content |
| dashboard_ticker_events | ticker_select_auth | SELECT | authenticated | no | no | **personal-adjacent** (actor_user_id + message_fa) |
| employee_leagues | employee_leagues_read_all | SELECT | authenticated | no | no | **personal** (employee_id, rank, score) |
| employee_profiles | ep_select_auth | SELECT | authenticated | no | no | **personal** (user_id, employment_start_date, department, direct_manager_id, bio) |
| gamification_kpis | Authenticated can view kpis | SELECT | authenticated | no | no | config |
| inquiries | inquiry_update_rpc | **UPDATE** | service_role | **yes** | no | workflow (requested_by, assigned_to) |
| league_seasons | league_seasons_read_authenticated | SELECT | authenticated | no | no | config |
| marketing_channels | mc_select_authed | SELECT | authenticated | no | no | config |
| marketing_task_templates | mtt_select | SELECT | authenticated | no | no | **personal-adjacent** (assigned_to, created_by) |
| payment_terms | payment_terms_select_authed | SELECT | authenticated | no | yes | **financial** (payment terms in days) |
| pricing_board_settings | pbs_select_auth | SELECT | authenticated | **yes** | no | **financial config** (sale_price_type_id) |
| product_attribute_groups | pag_select | SELECT | authenticated | no | no | reference |
| product_attributes | product_attributes_read_authed | SELECT | authenticated | no | no | reference |
| **product_images** | product_images_select | SELECT | **PUBLIC** (`polroles = {0}`) | no | yes | reference |
| product_recommendation_overrides | pro_select_authed | SELECT | authenticated | **yes** | no | reference |
| product_service_types | product_service_types_select | SELECT | authenticated | no | no | reference |
| products | products_public_read | SELECT | anon | no | yes | commercial (28 cols incl. `accounting_code`, `barcode`) |
| promotion_nomination_policy | promo_policy_select_authed | SELECT | authenticated | **yes** | no | **personal-adjacent** (role, user_id, quotas) |
| role_permissions | role_permissions_read_authed | SELECT | authenticated | **yes** | no | security config (the whole RBAC matrix incl. `can_view_sensitive`) |
| sale_price_types | sale_price_types_auth_read | SELECT | authenticated | no | yes | **financial config** (max_settlement_days) |
| sale_price_types | sale_price_types_public_read | SELECT | anon | no | yes | **financial config** |
| sales_reminders | sales_reminders_select_authed | SELECT | authenticated | **yes** | no | content |
| score_level_thresholds | score_level_thresholds_read_authenticated | SELECT | authenticated | no | no | config |
| shop_settings | shop_settings_read_authed | SELECT | authenticated | **yes** | no | **unclassified** - opaque `key`/`value` pairs; contents not inspected |
| validation_rules | validation_rules_select_authenticated | SELECT | authenticated | no | no | config |

Summary of the shape, without recommending anything:

- **4 tables expose a `qual = true` SELECT to `anon` by policy** - `brands`, `categories`,
  `products`, `sale_price_types` - and all four also hold an `anon` SELECT grant, so the policy is
  reached. These are the same names Section 2 measured as unchanged.
- **1 policy is written for the `PUBLIC` role, not a named role**: `product_images_select`, with
  `polroles = {0}`. `product_images` also holds an `anon` SELECT grant. Noting it because a grep
  for `TO anon` would not find it. (`product_images` carries a second PUBLIC-role policy,
  `product_images_write`, whose `qual` is not `true` and is therefore outside this inventory.)
- **8 of the 34 tables carry personal or financial data** by my classification:
  `call_log_extensions`, `currency_rate_fetches`, `employee_leagues`, `employee_profiles`,
  `payment_terms`, `pricing_board_settings`, `sale_price_types`, and `products` (commercially
  sensitive rather than personal). Three more are personal-adjacent
  (`dashboard_ticker_events`, `marketing_task_templates`, `promotion_nomination_policy`).
  `shop_settings` is an opaque key/value store and I did not read its contents, so it is
  unclassified rather than cleared.
- **Only 9 of the 35 have a `RESTRICTIVE` partner** on the same command: `categories`,
  `custom_roles`, `inquiries`, `pricing_board_settings`, `product_recommendation_overrides`,
  `promotion_nomination_policy`, `role_permissions`, `sales_reminders`, `shop_settings`.
  The other 26 have nothing narrowing them.
- **`role_permissions`** is worth a line of its own for whoever picks up Security-3: it is the
  RBAC matrix itself, including the `can_view_sensitive` column, readable in full by every
  authenticated user - which on this database includes `viewer`.

---

## The three ways each "done" could be lying - [C-1], and I went all three

**(1) Passed on a constructed input rather than a real one.** The og61 baseline was taken on a
`pg_restore` of the real production dump (md5 above), not a fixture, and the ledger print
(681 / `20260912150000` / no `20260913*`) is the proof it did not already contain the fix. The
Section 4 probes call the real functions in the real schema.

**(2) The rule is enforced on one path and another path exists.** This one produced a real
finding. I did not stop at the database; I searched every caller of the two functions 538 closes.

    $ grep -rn "refresh_sale_list_prices\|bot_authenticate_key" src/ server/ \
        --include=*.ts --include=*.tsx | grep -v "integrations/supabase/types.ts"
    src/lib/public/get-public-sale-list.ts:50:  await supabase.rpc("refresh_sale_list_prices", { p_list_id: listId });
    src/routes/_app.pricing.sale-lists_.$listId.tsx:224:      await supabase.rpc("refresh_sale_list_prices", { p_list_id: listId });
    src/routes/_app.pricing.sale-lists_.$listId.tsx:399:          await supabase.rpc("refresh_sale_list_prices", { p_list_id: listId });
    src/server/bot-api.ts:286:  const { data, error } = await supabaseAdmin.rpc("bot_authenticate_key", { p_raw_key: rawKey });

`bot_authenticate_key` is reached only through `supabaseAdmin` (service_role), and I measured
`service_role=true` after 538 - that path is intact. **`refresh_sale_list_prices` is different.**
`src/lib/public/get-public-sale-list.ts:1` imports the browser client
(`import { supabase } from "@/integrations/supabase/client"`), the file's own docblock at line 33
says "Fetches a published sale list for public/anonymous viewing", and it is the loader for
`src/routes/public.sale-lists.$listId.tsx:19` - a `public.*` route, outside `_app`. See F-1.

**(3) Measured on warm or cached state.** Every number here is a catalogue query or a fresh
`psql` session against a database I restored myself minutes earlier; nothing is served from an
application cache. The og61 before/after runs used the identical command on the identical restore
with only the twelve migrations in between.

**A fourth path I checked because nobody asked me to.** `products_api_readonly` is a third
PostgREST-reachable role (NOLOGIN, but `authenticator` is a member of it, so a JWT carrying
`"role":"products_api_readonly"` assumes it). After the twelve it holds EXECUTE on **526**
functions in `public` - including `refresh_sale_list_prices`, a SECURITY DEFINER writer - via an
explicit grant 538 issued. Section 2's census and og61's entire gate only look at `anon` and
`authenticated`, so this role is invisible to both. It is **not** an increase caused by this
release, and the proof is 538's own loop condition around line 182:

    AND has_function_privilege(g.rolname, r.oid, 'EXECUTE')
    AND COALESCE(array_to_string(r.proacl, ' '), '') !~ ('(^| )' || g.rolname || '=')

A preserving grant is issued only for a function the role **could already execute** and holds no
entry of its own for - it converts an implicit PUBLIC grant into an explicit one and can never
widen the role's reach. The before-state matches: `refresh_sale_list_prices`'s ACL before the
twelve was `{=X/supabase_admin, ...}`, a PUBLIC grant `products_api_readonly` already inherited.
Recorded as a blind spot for future censuses, not as a finding against this release.

---

## Findings

Stated as who can do what to which data, not as a severity word.

**F-1 - The public sale-list page stops refreshing its prices for logged-out visitors.**
`src/lib/public/get-public-sale-list.ts:50`, reached from
`src/routes/public.sale-lists.$listId.tsx:19`. That loader calls `refresh_sale_list_prices`
through the **anon** browser client. After 538 that call returns
`42501 permission denied for function refresh_sale_list_prices` (measured, Section 4). The call
site is `await supabase.rpc(...)` with the result discarded, and supabase-js returns
`{data, error}` rather than throwing, so **the error is swallowed and the page still renders** -
showing whatever `sale_list_items.current_price` last held. Concrete effect: an anonymous visitor
to a published price list sees prices only as fresh as the last visit by a logged-in user; a
logged-in visitor still triggers the refresh, because `authenticated=true` survives 538 (measured).
This is a functional regression produced by a correct security fix, not a vulnerability. og61's own
allowlist entry for this function (spec lines 589-594) asserts it is "invoked on sale-list page
load (src/lib/public/get-public-sale-list.ts and the sale-list route)" - that reasoning is now half
stale, and the suite cannot see it because the entry only concerns `authenticated`.
*Not measured:* whether a scheduled job or authenticated traffic refreshes those rows often enough
for the staleness to be invisible. I did not drive the public page in a browser, and `cron.job` did
not load on this restore, so I could not check for a scheduled refresher either.

**F-2 - Twelve applied migrations leave no ledger row, and 526 prints that they do.**
`supabase/migrations/20260913090000_526_...sql:1304` emits "this migration records its own new
row"; `grep schema_migrations` over all twelve returns four comments and **zero INSERT
statements**. Measured: ledger 681 rows, top `20260912150000`, both before and after applying all
twelve. Concrete effect: an operator who applies these by `psql` and believes the NOTICE leaves the
ledger twelve rows short; the next person planning a production deploy reads twelve outstanding
migrations and re-runs them, and 526/527/532 contain `DROP FUNCTION`/`DROP TRIGGER` that are not
idempotent in that direction. `e2e/security/og81-migration-ledger-matches-disk.spec.ts` goes red
the moment this happens.

**F-3 - Seven SECURITY DEFINER objects installed with no REVOKE in their own migration.**
`create_purchase`, `get_payables_list`, `upsert_staff_daily_performance_metric`,
`asan_list_bank_deposit_export` (526); `delete_bot_api_key_secure`, `admin_upsert_ai_provider`,
`admin_delete_ai_provider` (535). All seven measured `anon=false` today. `asan_list_bank_deposit_export`
is `DROP`+`CREATE`, so its ACL is decided entirely by `pg_default_acl`. Concrete effect: nobody can
read those two files and know who may execute those functions - the answer lives in a default that
a single `ALTER DEFAULT PRIVILEGES` elsewhere can change. Bounded today by the body-level role
checks quoted in 3a.

**F-4 - Two modified routes carry a `beforeLoad` guard but no `staticData.gate`.**
`src/routes/_app.dashboard.tsx:43` and `src/routes/_app.pricing.index.tsx:30`. Pre-existing, not
introduced - the diffs touch no route-definition block - and both sit outside the tier-1 set that
`e2e/security/s5-guarded-admin-routes-carry-a-client-gate.spec.ts` enforces (106 passed). Recorded
because the project's own suite calls this shape "fail-open on a full page load"
(`e2e/phase6/m6-route-guard.spec.ts:59`). *Not measured:* I did not open either route in a cold
browser session, so I cannot say what a `viewer` actually sees before roles settle.

**F-5 (measurement, not a defect) - `products_api_readonly` is a third PostgREST-reachable role
that no census in this wave looks at.** It can execute 526 `public` functions, including the
SECURITY DEFINER writer `refresh_sale_list_prices`. Proven non-increasing by 538's loop condition
above. Concrete effect: anyone able to present a JWT with `"role":"products_api_readonly"` has a
function surface neither og61 nor Section 2 measures.

**No finding for:** `anon` write privileges (0 before, 0 after); new `qual = true` policies (none);
new SECURITY DEFINER writers (none); `anon` executable or readable growth (nothing added on any of
the five measures); `bot_authenticate_key` and `refresh_sale_list_prices` anon reachability (closed,
proven behaviourally); `authenticated` TRUNCATE (214 tables -> 0, with the default privilege fixed
for both grantors).

---

## What I could not check

- **The five PostgREST tests inside og61** (`:223`, `:249`, `:438` x2, `:474`) hit the live
  `afrakala` database through Kong regardless of `E2E_DB_NAME`. Their green is not evidence about
  this release and I have not counted it as such.
- **pg_cron.** The dump's `cron.job` and `cron.job_run_details` could not load (extension absent),
  and 533 skipped the extension and all eight job rows because `current_database() <> 'postgres'`
  (its own NOTICE, quoted in 1b). **533's scheduling half is therefore entirely unverified here** -
  I measured its two wrapper procedures and their REVOKEs, and nothing about the jobs themselves,
  the HTTP calls they make, or any secret those calls carry.
- **`cron_run_log`'s read policy on non-empty data.** The table is empty on this restore, so the
  `authenticated` SELECT probe returning 0 rows proves nothing.
- **Cold-browser role checks.** I ran no browser-session test against `/dashboard` or `/pricing`
  with a `viewer` and no `storageState`, so F-4's practical impact is unmeasured ([A-10]).
- **`shop_settings` contents.** An opaque key/value table with a `qual = true` read policy; I did
  not read its values, so it is classified "unclassified", not "clean".
- **Secrets.** Outside my five sections; I did not go looking. I read no `.env.lan`, no
  `*.storage.json` and no untracked file, and no secret value appears anywhere in this report.
  `pgrest.ts` reads `deploy/lan/.env.lan` internally during the Playwright runs - that is the
  harness's own behaviour, not something I printed.
- **Anything on `afrakala`, `postgres`, `prod_rehearsal_base/gate/v1`, or the production laptop.**
  Untouched. Every write went to `prod_rehearsal_v2`, and every probe that could have written
  anything ran inside `BEGIN; ... ROLLBACK;`.

---

## Verdict

| section | verdict | basis |
|---|---|---|
| **1 - og61 baseline on a clean restore** | **GREEN** | Baseline 3 failed / 20 passed, with ledger 681 + top `20260912150000` + zero `20260913*` printed first; after the twelve, 23 passed / 0 failed. All three failures **pre-existing and fixed**; none caused. |
| **2 - anon census, before and after** | **GREEN** | Functions 544 -> 505 (0 added, 39 removed, names diffed). Tables 13 -> 13 identical. Writes 0 -> 0. Views 7 -> 7 identical. `pg_default_acl` anon 0 -> 0. Nothing increased on any measure. |
| **3 - structural rules on what the release adds** | **AMBER** | 3a no finding (zero new SECURITY DEFINER routines; all eight replaced ones carry quoted caller checks). 3c no finding (one new policy, `qual` not `true`; RLS deny proven behaviourally). 3d no finding against the rule (no route is new). **3b is the amber: F-3.** |
| **4 - the two live holes, by behaviour** | **GREEN** | Before: `P0001 invalid_key` raised inside the body, and a clean successful call. After: `42501` for both. The PUBLIC grant is confirmed gone, not merely the `anon` entry. |
| **5 - S-2 inventory** | **GREEN (complete)** | 35 policies / 34 tables / 646 total, each with roles, `RESTRICTIVE` partner, anon grant and data classification. Measurement only; nothing recommended, nothing changed. |

**Overall: the release does what Sections 1, 2 and 4 claim, and it regresses nothing I could
measure.** I am not marking it unconditionally approved, because F-1 is a real behavioural change
on an unauthenticated page that no test in this repository can see, F-2 will break the ledger gate
on the next deploy unless twelve rows are inserted by hand, and 533's scheduling half was not
verifiable on this restore at all.

*Written by V-2. No author report was read before measuring. This report file is the only thing I
wrote in the repository; nothing was staged, committed, stashed or checked out.*
