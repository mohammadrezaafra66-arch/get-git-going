# 526 repair — measurement, rehearsal, and why the release skipped it (2026-09-14)

Mission: measure exactly what migration 526 would do on production, rehearse it on a restore, and
produce a gated runbook. **Nothing was applied anywhere real.** `afrakala` was not written; nothing
touched `192.168.170.10`; no image work; no PR.

Runbook produced: `docs/runbooks/526-repair-20260914.md` (+ four ASCII check scripts in
`docs/runbooks/526-repair-20260914/`).

Starting evidence: `docs/research/backlog8-measurement-20260914.md` on branch
`feature/backlog8-measurement` @ `557738d7` (section «یافتهٔ بیرون از فهرست»).

---

## Phase 0 — isolation and the two texts that matter

| | |
|---|---|
| Worktree | `D:\AfraKalaTest\wt-526`, branch `feature/526-repair`, created from `origin/main` @ `9bc8d554`; `git status` clean at start; upstream unset so no push can reach `main` |
| Dump | `D:\AfraKalaTest\dumps\afrakala-db-20260913-post-release-696.dump`, md5 `b4e43d31e055ea23ab860608e9a7adfc` on host and inside the container |
| 526 file | `supabase/migrations/20260913090000_526_catalogue_repair_absent_migration_effects.sql`, 1306 lines, md5 `fa1bb671a6bb1373122ab7b9590aa361` (same on `origin/main`); `.gitattributes`: `*.sql text eol=lf` |
| Release doc | `D:\AfraKalaTest\dumps\release-20260913\RELEASE-20260913b.md`, md5 `2ae681092062bf140ad5c839f4f2c680` (identical to `wt-main-build/release/out/`) |

### 526's guard structure (quoted)

526 is a **psql script**, not plain SQL: every repair is decided by the catalogue at run time.

1. **Precondition** (`:47-82`) — a `DO` block that raises unless all ten target objects exist:
   `RAISE EXCEPTION '526: cannot repair -- the following target object(s) are absent entirely, which is a different failure than "effect absent": %. ...'`
2. **Nine `\gset` + `\if` pairs**, one per repair. Shape (386a, `:91-103`):
   ```
   SELECT CASE WHEN EXISTS ( ... o.option_name = 'security_invoker' AND lower(o.option_value) IN ('true','on')
     ) THEN 'false' ELSE 'true' END AS need_386a \gset
   \if :need_386a
   ALTER VIEW public.product_computed_prices_public SET (security_invoker = true);
   \echo '526: [386a] set security_invoker=true on product_computed_prices_public (was unset)'
   \else
   \echo '526: [386a] product_computed_prices_public already carries security_invoker=true -- no-op'
   \endif
   ```
   The same pattern gates 386b (`:118-251`), 386c (`:260-311`), 394 (`:318-803`), 396a (`:810-870`),
   396b (`:877-967`), 396c (`:974-1002`), 404 (`:1019-1143`, `DROP FUNCTION IF EXISTS` + `CREATE`),
   409 (`:1170-1180`).
3. **409 caller guard** (`:1152-1168`) — refuses to drop `expire_stale_credit_holds(integer)` if any
   other `public` function's source calls it.
4. **Final gate** (`:1187-1306`) — runs unconditionally and re-asserts every end state, including
   "anon holds nothing on the 8 guard views", "authenticated/service_role keep EXECUTE on the export,
   anon does not", "exactly one `expire_stale_credit_holds`".

### Block 19 of RELEASE-20260913b.md (quoted, lines 273-282)

```
### Block 19 - ledger-row-only 20260913090000 . 20260913090000_526_catalogue_repair_absent_migration_effects.sql

Catalogue evidence in the rehearsal showed this migration's effect is already PRESENT but
the ledger has no row for it (applied-but-unrecorded, CLAUDE.md rule 2b). The SQL is NOT
re-run. Only the ledger row is written.

    ledger_insert_only 20260913090000

Expect: INSERT 0 1
Expect: OK ledger-row-only 20260913090000
```

It decided "already PRESENT" from the rehearsal `prod_rehearsal_e4e`. What that "catalogue
evidence" actually was is Phase 2. Note also that **Block 18 (539, "explicit revoke on 526-535
definers") ran before Block 19**, i.e. against the *un-repaired* export function.

---

## Phase 1 — the truth per effect, on the restore

Restore: `CREATE DATABASE rehearsal_526_20260914`; dump delivered over stdin, md5 identical both
sides; `pg_restore --no-owner --disable-triggers` → exit 1 with **21 errors, all 21 in the release
engine's tolerated allowlist** (`release/lib/rehearse-engine.sh:85-91`: cron/pg_cron/vault), 0 others.
Ledger on the restore: **696 rows, max `20260913111000`, row `20260913090000` inserted
`2026-09-13 13:47:08.206266+00`** — identical to the backlog report. `persons` 4857.

Every "restore has" cell below is read from the live catalogue (`pg_get_viewdef`,
`pg_get_functiondef`, `prosrc`, `pg_policy`, `reloptions`, `proargnames`) — not from a schema file.
`need_*` is 526's own predicate, copied verbatim.

| # | Repair | 526 should make it | Restore actually has (live) | need_* | VERDICT |
|---|---|---|---|---|---|
| 1 | 386a `product_computed_prices_public` | `reloptions` contains `security_invoker=true` | `reloptions` = `<none>` | true | **ABSENT** |
| 2 | 386b `v_promotion_suggestions` | `security_invoker=true` **and** viewdef ends `WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));` | `reloptions` = `<none>`; viewdef ends `  WHERE (NOT is_viewer_only(uid()));` | true | **ABSENT** |
| 3 | 386c `vw_account_balances` | viewdef ends with the `uid() IS NOT NULL` guard | viewdef ends `  WHERE (NOT is_viewer_only(uid()));` | true | **ABSENT** |
| 4 | 394 `create_purchase` (15-arg) | `IF p_purchase_date > public.tehran_today() THEN` | `IF p_purchase_date > CURRENT_DATE THEN` (1 overload) | true | **ABSENT** |
| 5 | 396a `get_payables_list` | due-date filters on `public.tehran_today()` | `OR (v_filter = 'today'    AND v.due_date = CURRENT_DATE)` / `= CURRENT_DATE + 1` / `> CURRENT_DATE + 1` | true | **ABSENT** |
| 6 | 396b `upsert_staff_daily_performance_metric` | both date guards on `tehran_today()` | `IF p_metric_date IS NULL OR p_metric_date > CURRENT_DATE THEN` / `IF p_metric_date < CURRENT_DATE - INTERVAL '5 days' AND NOT v_is_admin THEN` | true | **ABSENT** |
| 7 | 396c policies `sdpm_insert_privileged`, `sdpm_update_privileged` | `tehran_today()` in USING/WITH CHECK | insert CHECK: `... AND (metric_date >= (CURRENT_DATE - '5 days'::interval)) AND (metric_date <= CURRENT_DATE))`; update USING and CHECK: `... AND (metric_date >= (CURRENT_DATE - '5 days'::interval)))` | true | **ABSENT** |
| 8 | 404 `asan_list_bank_deposit_export(date,date)` | 11 OUT columns ending `direction text`; body with `payment_vouchers` and `combined` | `RETURNS TABLE(doc_id uuid, doc_label text, doc_date date, party_name text, person_code text, tracking_number text, amount numeric, bank_code text, bank_title text, blocked_reason text)` — 10 columns; `has_direction=false`, `prosrc~combined=false`, `prosrc~payment_vouchers=false` | true | **ABSENT** |
| 9 | 409 `expire_stale_credit_holds` | only `(integer,integer)` | `expire_stale_credit_holds(integer)` **and** `expire_stale_credit_holds(integer,integer)` | true | **ABSENT** |

**The backlog report's "nine ABSENT" is confirmed — with one correction.** Row 396c there says
"`sdpm_insert_privileged` اصلاً وجود ندارد" (does not exist at all). **That is wrong:** both policies
exist; they still compare against `CURRENT_DATE`. The distinction matters: had the policy been
missing, 526's precondition (`:66-68`) would have raised and the whole file would abort — the
runbook would be a different one.

---

## Phase 2 — why the rehearsal said PRESENT

### The code path

`release/lib/rehearse-engine.sh:437` hands every candidate to the evidence tool:

```bash
DOCKER_DB_CONTAINER="$CONTAINER" bash "$REPO_ROOT/docs/missions/prodprep/ledger-evidence.sh" "$DB" "$MIGDIR" "$TMP/candidates.txt" > "$EVIDENCE_RAW" 2>&1
```

`docs/missions/prodprep/ledger-evidence.sh:61-62` extracts view names by regex and `:77-79` probes
only whether an object **by that name exists**:

```bash
  views=$(grep -oiE "CREATE (OR REPLACE )?(MATERIALIZED )?VIEW (IF NOT EXISTS )?(public\.)?[a-z0-9_]+" "$f" \
           | sed -E 's/.*[[:space:]]//; s/^public\.//' | sort -u)
...
  for v in $views; do
    echo "SELECT '$ver|VIEW|$v|' || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='$v' AND c.relkind IN ('v','m'));" >> "$TMPSQL"; n=1
  done
```

`rehearse-engine.sh:444-459` then turns any non-zero count into PRESENT:

```bash
# aggregate PRESENT/ABSENT/NO-EVIDENCE per version: any explicit 0 -> ABSENT; else if only
# NO-EVIDENCE lines -> NO-EVIDENCE; else PRESENT.
...
    if (val=="0") absent[$1]=1; else present[$1]=1;
```

and `:473-474` maps "no ledger row + PRESENT" straight to a ledger-row-only block:

```bash
  case "$has_ledger:$ev" in
    no:PRESENT)      echo "$ver" >> "$TMP/to_ledger_only.txt" ;;
```

`release/emit-blocks.ps1:392-403` writes that as Block 19 with the sentence "Catalogue evidence in the
rehearsal showed this migration's effect is already PRESENT".

### The evidence it actually used (quoted from the run that built the release)

`D:\AfraKalaTest\wt-main-build\release\runs\e4e\evidence.raw`:

```
20260913090000|VIEW|v_promotion_suggestions|1
20260913090000|VIEW|vw_account_balances|1
```

`evidence.txt`: `20260913090000|PRESENT`. `apply_out_20260913090000.txt`: `INSERT 0 1` / `OK ledger-row-only 20260913090000`.

That is the whole basis: **two views that 526 `CREATE OR REPLACE`s already existed by name.** They
had to — 526 is a repair of existing objects, and its precondition *requires* they exist. The seven
other repairs (`ALTER VIEW ... SET`, function bodies, `ALTER POLICY`, `DROP FUNCTION`) are invisible to
the tool by design (`ledger-evidence.sh:16-17`: "CREATE OR REPLACE FUNCTION -- the name existing
proves nothing about WHICH version"). The same blindness is why 394/396/404/409 themselves never
tripped the LEDGER-LIES abort: being function-only, they were NO-EVIDENCE → UNVERIFIABLE → "ledger
trusted, continue" (`rehearse-engine.sh:32`); only 386 needed an entry in
`release/config/known-ledger-lies.txt:81`.

### The defect, named

**RL-526 — existence-as-effect promotion.** The rehearsal classifier treats "an object with this
name exists" as "this migration's effect is present" and, for an unrecorded migration, emits a
ledger-row-only block with no human gate. For any migration that *modifies* existing objects —
`CREATE OR REPLACE VIEW`, `ALTER ... SET`, `ADD COLUMN IF NOT EXISTS` on an existing column,
`CREATE INDEX IF NOT EXISTS` — name existence is guaranteed before the SQL runs, so the verdict is
PRESENT whether or not the migration ever ran. The tool's own header admits PRESENT for views is only
"MEDIUM (later migs replace)" (`ledger-evidence.sh:12`), but the classifier gives MEDIUM evidence the
same authority as STRONG and acts on it by skipping SQL.

**Can it misfire again on a future release? Yes** — any unrecorded migration whose only
regex-visible artefacts are pre-existing objects (every catalogue-repair or view-redefinition
migration) will again be written into the ledger without its SQL ever running. Not fixed here, by
instruction.

---

## Phase 3 — rehearsal

All SQL delivered over stdin with md5 checked on both sides; every psql exit code read from `$?` of
the `docker exec` itself, never through a pipe. psql flags: `--no-psqlrc -X -v ON_ERROR_STOP=1
--single-transaction`.

### First apply

`psql exit code (read directly, no pipe) = 0`. Output, verbatim (every line ASCII — 0 non-ASCII lines measured):

```
SET
psql:/tmp/r526x_mig526.sql:82: NOTICE:  526: precondition OK -- all nine target objects exist
DO
ALTER VIEW
526: [386a] set security_invoker=true on product_computed_prices_public (was unset)
CREATE VIEW
526: [386b] redefined v_promotion_suggestions -- restored security_invoker=true and the uid() IS NOT NULL guard
CREATE VIEW
526: [386c] redefined vw_account_balances -- restored the uid() IS NOT NULL guard
CREATE FUNCTION
526: [394] redefined create_purchase -- restored the tehran_today() future-date comparison
CREATE FUNCTION
526: [396a] redefined get_payables_list -- restored the tehran_today() due-date comparison
CREATE FUNCTION
526: [396b] redefined upsert_staff_daily_performance_metric -- restored the tehran_today() comparisons
ALTER POLICY
ALTER POLICY
526: [396c] restored tehran_today() on sdpm_insert_privileged / sdpm_update_privileged
DROP FUNCTION
CREATE FUNCTION
526: [404] dropped and redefined asan_list_bank_deposit_export -- restored the payment-vouchers branch and the direction column
psql:/tmp/r526x_mig526.sql:1168: NOTICE:  526: [409 precheck] no other function in public source-references expire_stale_credit_holds(...) -- safe to drop the (integer) overload
DO
DROP FUNCTION
526: [409] dropped the stale expire_stale_credit_holds(integer) overload
psql:/tmp/r526x_mig526.sql:1306: NOTICE:  526 OK: all five migrations' asserted end states (386/394/396/404/409) are present in the catalogue. Ledger rows for 386/394/396/404/409 are untouched. This migration does NOT write supabase_migrations.schema_migrations -- the operator's ledger step does, and expects INSERT 0 1.
DO
```

### The nine effects after

| # | Repair | Live after apply | need_* | VERDICT |
|---|---|---|---|---|
| 1 | 386a | `reloptions` = `security_invoker=true` | false | **PRESENT** |
| 2 | 386b | `security_invoker=true`; viewdef ends `  WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));` | false | **PRESENT** |
| 3 | 386c | viewdef ends `  WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));` | false | **PRESENT** |
| 4 | 394 | `IF p_purchase_date > public.tehran_today() THEN` (1 overload) | false | **PRESENT** |
| 5 | 396a | `v.due_date = public.tehran_today()` / `+ 1` / `> public.tehran_today() + 1` | false | **PRESENT** |
| 6 | 396b | `p_metric_date > public.tehran_today()` / `< public.tehran_today() - INTERVAL '5 days'` | false | **PRESENT** |
| 7 | 396c | insert CHECK `(metric_date >= (tehran_today() - '5 days'::interval)) AND (metric_date <= tehran_today())`; update USING/CHECK on `tehran_today()` | false | **PRESENT** |
| 8 | 404 | `RETURNS TABLE(... blocked_reason text, direction text)` — 11 columns; `has_direction=true`, `prosrc~combined=true`, `prosrc~payment_vouchers=true`; ACL `{postgres=X, supabase_admin=X, authenticated=X, service_role=X}` (same four grantees as before, no anon, no PUBLIC) | false | **PRESENT** |
| 9 | 409 | only `expire_stale_credit_holds(integer,integer)` | false | **PRESENT** |

### What changed, all of it — catalogue and data fingerprint

A fingerprint was taken before and after: exact `count(*)` of every table in `public`, `auth`,
`supabase_migrations` (244 tables); md5 of `pg_get_functiondef` + ACL + owner for all 861 `public`
functions; md5 of viewdef + reloptions + ACL for 24 views; md5 of expression/cmd/roles for 667
policies; ACL of 227 tables; non-internal trigger count; `pg_default_acl`.

`diff` before → after contains exactly these entries and nothing else:

```
F asan_list_bank_deposit_export(date,date)      body md5 changed, grantee set unchanged
F create_purchase(15-arg)                        body md5 changed
F expire_stale_credit_holds(integer)             removed
F get_payables_list(8-arg)                       body md5 changed
F upsert_staff_daily_performance_metric(8-arg)   body md5 changed
V product_computed_prices_public                 reloptions <none> -> security_invoker=true (viewdef md5 unchanged)
V v_promotion_suggestions                        viewdef md5 changed, reloptions -> security_invoker=true
V vw_account_balances                            viewdef md5 changed
P staff_daily_performance_metrics.sdpm_insert_privileged   changed
P staff_daily_performance_metrics.sdpm_update_privileged   changed
```

**No data changed:** all 244 `R|` row-count lines identical, including
`R|supabase_migrations.schema_migrations|696`. No table ACL, trigger count or default ACL changed.

### Second apply — no-op

`psql exit code (read directly, no pipe) = 0`. Every branch took its `\else`:

```
526: [386a] product_computed_prices_public already carries security_invoker=true -- no-op
526: [386b] v_promotion_suggestions already correct -- no-op
526: [386c] vw_account_balances already correct -- no-op
526: [394] create_purchase already compares against tehran_today() -- no-op
526: [396a] get_payables_list already uses tehran_today() -- no-op
526: [396b] upsert_staff_daily_performance_metric already uses tehran_today() -- no-op
526: [396c] sdpm_insert_privileged / sdpm_update_privileged already use tehran_today() -- no-op
526: [404] asan_list_bank_deposit_export already has the payment-vouchers branch -- no-op
526: [409] expire_stale_credit_holds(integer) already absent -- no-op
... NOTICE:  526 OK: all five migrations' asserted end states ...
```

The full fingerprint after the second apply is **byte-identical** to the one after the first (2026 lines).

### The proof that matters — the bank-deposit export, same data, before and after

Called as the app calls it: accountant JWT (`request.jwt.claims` sub from `user_roles`), `SET LOCAL
ROLE authenticated`, range `2026-08-01..2026-09-14`, inside a transaction that was rolled back.
Data on the restore: 6 approved receipts (2026-08-11..2026-09-13) and **5 approved payment vouchers**
(2026-09-01..2026-09-12, channel `other`, not reversed).

| | before 526 | after 526 |
|---|---|---|
| OUT columns (`pg_proc`) / keys per result row | **10 / 10** | **11 / 11** |
| `direction` column | absent | present |
| total rows | 6 | 11 |
| receipt rows | 6 (no direction; the app defaults them to receipt) | 6 |
| **payment rows** | **0** | **5** |
| voucher ids in the output | 0 | 5 (= all 5 qualifying vouchers) |
| blocked rows | 0 | 0 |
| sum of `amount` | 1,719,000,000.00 | 3,129,000,000.00 |

Per-row after (no names/codes printed): payments on 09-01, 09-03, 09-05, 09-06, 09-12, each with
person code and bank code present and not blocked.

**The payments reach the export.** The STOP conditions did not trigger: the nine effects were absent
before; no unexpected data or catalogue change; the export gained payment rows.

### The app side, which is what turns rows into the Asan file

At `3bc526c4` (the release image's commit), unchanged on `main`:

- `src/lib/asan/export-bank-deposit-rows.ts:66` — `const direction: BankFlowDirection = r.direction === "payment" ? "payment" : "receipt";`
- `:57-60` — `mablaghFor` returns `-rial` when `direction === "payment"`; `:72` writes it as `E Mablagh`.
- `src/lib/asan/export-bank-deposit.ts:58-66` — the on-screen note already tells staff: payments are
  in this file with a negative amount. **On production that sentence has been false since the
  release**, because the DB function never returned `direction` or voucher rows. This is how staff
  "were told otherwise".

### Things 526 could break that the rehearsal cannot see by itself — checked

- **pg_cron.** Production's cron lives in database `postgres`; the restore dropped the `cron` schema
  (tolerated error), so 526's 409 caller scan (`pg_proc` only) would not see a cron caller. Read
  `cron.job` data straight from the dump (`pg_restore -a -n cron -t job`): 4 jobs —
  `generate_birthday_notifications`, `recompute_all_employee_scores`, `capture_score_snapshots`,
  `cleanup_stale_auto_suppliers`. **None calls any of 526's nine targets.**
- **App callers of `expire_stale_credit_holds`.** Only `src/routes/_app.sales.quotes.new.tsx:209-212`,
  passing **both** `p_days: 10, p_limit: 50` — resolves to the 2-arg function before and after.
- **Overload ambiguity, measured** (PREPARE only, rolled back): after 526, `expire_stale_credit_holds(60)`
  and `expire_stale_credit_holds()` both resolve (2-arg has `p_days integer DEFAULT 10, p_limit integer DEFAULT 50`).
  With a stand-in `(integer DEFAULT 60)` overload recreated, `expire_stale_credit_holds(60)` fails:
  `ERROR:  function public.expire_stale_credit_holds(integer) is not unique`. Dropping it removes an
  error, it does not create one.
- **Other SQL callers of the export.** Only `create_receipt` mentions the name, in a comment
  (`-- asan_list_journal_export's and asan_list_bank_deposit_export's date windows, ...`). The
  `DROP FUNCTION` succeeded without CASCADE, so no catalogue dependency exists.
- **539's explicit revokes lost by the DROP?** 539 ran on production against the old function. After
  526's DROP+CREATE on the restore of production's shape, the ACL came out with the same grantee set
  and no anon/PUBLIC; 526's own final gate and the runbook postcheck both assert it.

---

## Phase 4 — the ledger problem

**Answer: apply the SQL with the row present. Do not remove the row. Do not write one.**

Settled from the file itself:

- `:12-13` — "this migration gets a ledger row of its own, at version 20260913090000, WRITTEN BY THE
  OPERATOR'S mig_apply STEP AND NOT BY THIS FILE."
- `:15-18` — a self-INSERT was deliberately removed because it "makes the operator's ledger step
  report a duplicate-key ERROR"; "No migration in this mission writes its own ledger row".
- `:1304` — final NOTICE: "This migration does NOT write supabase_migrations.schema_migrations".
- No statement in the file references `supabase_migrations` except those comment/NOTICE texts, and
  nothing in its logic reads the ledger — every decision is from `pg_class`/`pg_proc`/`pg_policy`.

Measured: `schema_migrations` 696 rows before, 696 after the first apply, 696 after the second.

What does need care is the **operator tooling**, not the file: `mig_apply` inserts the row after
applying, with no `ON CONFLICT` (`release/lib/mig-apply.sh:75-80`). Against production that second step
would raise a duplicate key *after* the schema change committed. So the runbook applies with plain
`psql --single-transaction -f` and has no ledger step. Deleting the row first would also be wrong: it
is a DELETE on a table holding data (CLAUDE.md rule 3), and it would make the ledger lie in the
other direction for the duration.

---

## Phase 5 — the runbook

`docs/runbooks/526-repair-20260914.md`: Blocks 0 (files + md5), 0.5 (`docker cp` into the container
+ md5), 1 preflight, 2 pre-check that **refuses** (`ALREADY-PRESENT` / `PARTIAL` / `TARGET-ABSENT`,
exit 3), 3 export before, 4 schema-only backup, **5 apply (owner approval)**, 6 post-check, 7 export
after, 8 cleanup, 9 manual accountant check. Every block has literal `Expect:` lines and a rollback
statement; production DB `postgres`; PowerShell 5.1 forms only; no Persian in any SQL written for it.

### Dress rehearsal of the runbook itself

The rehearsal database was dropped and restored again from the same dump (21 tolerated errors, 0
others; fingerprint identical to the first restore), and the runbook's scripts run in order:

| Block | measured |
|---|---|
| 1 | `r526_preflight|db=rehearsal_526_20260914|replica=false|ledger_rows=696|ledger_max=20260913111000|row_526=1|row_539=1`, exit 0 |
| 2 | nine `need_*=true`; `r526_context|export_out_columns=10|export_anon_exec=false|expire_overloads=2|callers_of_expire=0`; `r526_precheck|targets_missing=0|needs=9|of=9|VERDICT=APPLY-NEEDED`, exit 0 |
| 6 run *before* apply (negative test) | `r526_postcheck|needs=9|...|expire_overloads=2|...` + `ERROR:  r526 POSTCHECK FAILED`, exit 3 |
| 3 | `r526_export|uid_resolved=true|out_columns=10|total_rows=6|receipt_rows=0|payment_rows=0|rows_without_direction=6|voucher_ids_in_output=0|expected_payment_rows=5|payments_match=false|blocked_rows=0` |
| 5 | runbook form (`PGOPTIONS=-clock_timeout=10s`, `ON_ERROR_STOP`, `--single-transaction`): output identical to the first rehearsal, exit 0 |
| 6 | `r526_postcheck|needs=0|of=9|export_anon_exec=false|export_authenticated_exec=true|expire_overloads=1|ledger_rows=696|row_526=1` / `VERDICT=ALL-NINE-PRESENT`, exit 0 |
| 7 | `r526_export|uid_resolved=true|out_columns=11|total_rows=11|receipt_rows=6|payment_rows=5|rows_without_direction=0|voucher_ids_in_output=5|expected_payment_rows=5|payments_match=true|blocked_rows=0` |
| post-apply fingerprint | byte-identical to the first rehearsal's post-apply fingerprint |
| 2 again | `VERDICT=ALREADY-PRESENT` + `ERROR:  r526 REFUSE`, exit 3 |
| 2, PARTIAL | inside `BEGIN; ALTER VIEW ... RESET (security_invoker)` then rolled back: `needs=1` → `VERDICT=PARTIAL` + `ERROR:  r526 STOP`, exit 3; reloption still `security_invoker=true` afterwards |

**PowerShell 5.1.26100 (`powershell.exe`)** ran the Block 2, 4, 5-md5 and 7 command forms verbatim
(DB name swapped to the rehearsal): exit codes 3 / 0 / 0 read from `$LASTEXITCODE`; `match=True`.
It also caught a trap now written into the runbook: a `grep -E "..."` inside `sh -c '...'` returned
**1561** instead of **23**, because PS 5.1 mangles inner double quotes. The runbook contains none.

**`docker cp` on the test computer, 2026-09-14:** into `afrakala-lan-db` — an ASCII file and the 526
file itself — both byte-identical (526: `fa1bb671a6bb1373122ab7b9590aa361` both sides); out of the
container — rc 0, same size. CLAUDE.md (2026-08-26) says `docker cp` "fails every time" on this
machine. That is no longer true today. Not changed in CLAUDE.md here (out of scope); reported.

---

## «آنچه تأیید نشد»

1. **هیچ‌چیز روی production اندازه گرفته نشد.** همهٔ اعداد از بازیابی dump پس از release (۱۳ سپتامبر، لجر ۶۹۶) است.
   اگر از آن زمان مهاجرتی روی production اجرا شده یا دادهٔ پرداخت تغییر کرده، بلوک ۱ و ۳ runbook آن را نشان می‌دهند
   و باید متوقف شد.
2. **پذیرفتن مبلغ منفی توسط نرم‌افزار آسان.** کد اپ پرداخت را با `Mablagh` منفی می‌نویسد؛ این‌که آسان هنگام ورود
   فایل «واریزیهای بانکی» سطر منفی را به‌عنوان پرداخت بانکی درست ثبت کند، **هیچ‌گاه آزموده نشده** — نه در این
   مأموریت، نه در سوابقی که خواندم. بلوک ۹ runbook دستی است و همین را می‌آزماید.
3. **خروجی اکسل واقعی ساخته نشد.** تابع SQL را صدا زدم و ردیف‌ها را شمردم؛ `buildBankDepositRows` و نوشتن فایل
   xlsx اجرا نشد. منفی‌شدن مبلغ از خواندن کد (`export-bank-deposit-rows.ts:57-72` در `3bc526c4`) است، نه از اجرا.
4. **این‌که production دقیقاً image `3bc526c4` را اجرا می‌کند** دوباره بررسی نشد؛ از نام فایل release و گزارش backlog نقل شده.
5. **`docker cp` روی لپ‌تاپ production** هرگز اندازه گرفته نشده. روی کامپیوتر تست امروز کار کرد؛ runbook با md5
   تصمیم می‌گیرد و در صورت خطای mount متوقف می‌شود.
6. **پوستهٔ PowerShell 5.1 روی لپ‌تاپ production** — فرم دستورها روی 5.1 همین ماشین آزموده شد، نه آن‌جا.
   بلوک ۰ (git archive / Expand-Archive) و بلوک ۴ (`docker cp` به بیرون روی مسیر `C:\r526`) روی PowerShell اجرا
   نشدند؛ `docker cp` به بیرون فقط از Git Bash آزموده شد.
7. **job‌های pg_cron امروزِ production** — از دادهٔ dump خوانده شد (۴ job، هیچ‌کدام به اهداف ۵۲۶ دست نمی‌زند)؛
   job اضافه‌شده بعد از dump دیده نمی‌شود.
8. **مدت قفل روی production** اندازه گرفته نشد؛ `lock_timeout=10s` گذاشته شد تا به‌جای صف‌کشیدن شکست بخورد و rollback شود.
9. **نقص RL-526 رفع نشد** (طبق دستور)؛ release بعدی همچنان می‌تواند مهاجرت ترمیمی را فقط با ردیف لجر «اعمال‌شده» ثبت کند.
10. **مهاجرت‌های دیگری که ممکن است همین سرنوشت را داشته باشند** بررسی نشدند. release ۲۰۲۶-۰۹-۱۳ فقط همین یک بلوک
    ledger-row-only خودکار داشت (`01-restore.md`: `UNRECORDED ... | 1`)؛ اما ۴۰۳ نسخهٔ UNVERIFIABLE به لجر اعتماد شدند
    و سنجیده نشدند.
