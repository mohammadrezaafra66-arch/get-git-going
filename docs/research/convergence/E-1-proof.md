# E-1 proof — catalogue repair (526), guard re-issue (527/528), OG-A confirmation (411/412/413)

Mission: AfraKala Convergence, E-1 partition. Branch `feature/conv-migrations`, worktree
`D:\AfraKalaTest\wt-conv-migrations`. All work below ran against the scratch database
`prod_rehearsal_e1` on `afrakala-lan-db`, restored from `/tmp/prod13.dump`. `prod_rehearsal_e1`
was dropped at the end of every restore cycle and does not exist at hand-off. No statement in
this mission ever wrote to the `afrakala` or `postgres` databases; `afrakala` was read with
SELECT-only queries exactly twice, both reproduced below.

## Step 0 — restore, proved

```
$ docker exec afrakala-lan-db md5sum /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0  /tmp/prod13.dump          <- matches required hash

$ docker exec afrakala-lan-db sh -c '... psql ... -c "CREATE DATABASE prod_rehearsal_e1;"'
CREATE DATABASE

$ docker exec afrakala-lan-db sh -c '... pg_restore -U supabase_admin -d prod_rehearsal_e1 --no-owner --disable-triggers /tmp/prod13.dump'
pg_restore: warning: errors ignored on restore: 21        <- 19 pg_cron + 2 vault, all schema/extension, ZERO data-load errors

$ ... psql -d prod_rehearsal_e1 -tAc "SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;"
681|20260912150000                                         <- matches required ledger state
```

This restore-and-verify cycle was repeated three times over the course of this mission (once
before each clean two-run idempotency proof below); every cycle reproduced the same 21 errors and
the same `681|20260912150000` ledger state.

## Task 1 — migration 526 (catalogue repair)

### (a) Exact object state asserted vs. actually held — read live, not trusted from the file

All nine target objects were confirmed to exist first (a hard precondition in 526 itself). For
each of the five migrations, the LAST migration file to define each touched object was found with
`grep -l 'CREATE OR REPLACE (FUNCTION|VIEW) public.<name>('` / `ALTER POLICY` across
`supabase/migrations/`, and that file was read in full — not assumed from the migration number
named in the brief.

| Object | Last migration to define it | Live state on `prod_rehearsal_e1` (fresh restore) |
|---|---|---|
| `product_computed_prices_public` reloptions | 386 | `reloptions` empty (E2: `SELECT reloptions ...` → blank row) |
| `v_promotion_suggestions` reloptions | 386 | `reloptions` empty |
| `v_promotion_suggestions` predicate | 386 | tail `WHERE NOT is_viewer_only(uid());` — missing `uid() IS NOT NULL AND` |
| `vw_account_balances` predicate | 386 | tail `WHERE NOT is_viewer_only(uid());` — missing `uid() IS NOT NULL AND` |
| other 5 of the 8 guard-class views | 386 (2 of them: 396 later, confirmed still correct) | already correct — `has_notnull_guard = t` for all 5, confirmed by direct catalogue query |
| `create_purchase` | 394 (251/252 predate it) | `prosrc` has no `tehran_today()`, has raw `> CURRENT_DATE` |
| `get_payables_list` | 396 (457/520 only *mention* it in comments, never redefine it — verified by `grep -l 'CREATE OR REPLACE FUNCTION public.get_payables_list('`) | `CURRENT_DATE` present, `tehran_today` absent |
| `upsert_staff_daily_performance_metric` | 396 (520 adds a new unrelated trigger, never redefines this function — verified) | `CURRENT_DATE` present, `tehran_today` absent |
| `sdpm_insert_privileged` / `sdpm_update_privileged` policies | 396 | both: `CURRENT_DATE` present, `tehran_today` absent |
| `vw_supplier_payables`, `vw_customer_receivables`, `get_receivables_list`, `get_payables_summary`, `get_receivables_summary` | 396 or later (457 further modifies `vw_supplier_payables`) | **already correct** — `clean` / `HAS tehran_today` for all five; NOT touched by 526 |
| `asan_list_bank_deposit_export` | 404 (295/350/364 predate it) | single signature `(date,date)`; `combined` CTE absent; `direction` NOT an OUT-param name (still the pre-404 10-column return) |
| `expire_stale_credit_holds` | 409 defines the drop; **462** (later) redefines the 2-arg body again | **both** `(integer)` and `(integer,integer)` signatures exist; the live 2-arg body already matches 462's text byte-for-byte (role set `admin/manager/accountant/sales`, `auth.uid()` as actor) — confirmed by reading `pg_get_functiondef` and diffing against both 409's and 462's file text |

E1/E2 evidence: every row above is a direct `pg_get_functiondef` / `pg_get_viewdef` /
`information_schema` / `pg_policy` read against `prod_rehearsal_e1`, pasted in the working
transcript (reproduced in the command log section below), not inferred from the migration files.

A genuine additional finding beyond the mission brief: **`vw_account_balances`'s predicate was
also broken** (not just `v_promotion_suggestions`'s), and **both `sdpm_insert_privileged` and
`sdpm_update_privileged` RLS policies were UTC-bound**, not just the two functions the brief named.
526 repairs both.

### (b) Migration 526 — catalogue-driven, idempotent, no-op where already correct

File: `supabase/migrations/20260913090000_526_catalogue_repair_absent_migration_effects.sql`.

Design: a psql script using `SELECT ... \gset` to read live catalogue state into a boolean
variable per object, then `\if :need_x ... \else ... \endif` to apply the fix (copied
byte-for-byte from the authoritative migration file identified above) only when the live state
disagrees with the asserted end state. A single unconditional final gate (`DO $gate526$`) re-reads
the catalogue and asserts all five migrations' end states regardless of which `\if` branches fired,
so a partially-skipped repair cannot pass silently. Ledger rows for 386/394/396/404/409 are never
touched; 526 gets its own new row.

Two real bugs were found and fixed in 526 itself during this proof, both by the required E4
evidence (a probe that failed before the fix and passed after):

1. **`asan_list_bank_deposit_export` detection.** `direction` is an OUT-parameter name (part of
   `RETURNS TABLE`), not literal body text — the fixed function's `prosrc` never spells the word
   "direction" (it returns the column positionally via `b.dir`). The first detection check used
   `prosrc !~* 'direction'`, which stayed true even after the fix, so the final gate raised
   `asan_list_bank_deposit_export is still missing the payment-vouchers branch` against a function
   that WAS already fixed. Corrected to check `'direction' = ANY (p.proargnames)` instead.
2. **`pg_get_viewdef` arity.** `pg_get_viewdef(oid)` (one argument — what 387's own gate uses) and
   `pg_get_viewdef(oid, true)` (two arguments, explicit "pretty") render the *same* stored boolean
   expression differently on this engine: the one-arg form prints
   `WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));` (matching 387's own hardcoded
   string exactly); the two-arg form prints `WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());`
   with no extra parens. 526's `v_promotion_suggestions`/`vw_account_balances` checks originally
   used the two-arg form while the final gate (copied from 387's pattern) used the one-arg form —
   an internal inconsistency that made the second application of 526 keep reporting "still
   broken" and re-issuing `CREATE OR REPLACE VIEW` on both views every run. Fixed by standardizing
   the whole file on the one-arg form and 387's original parenthesized string throughout.

Both bugs were caught by literally running 526 and reading the failure — not by inspection — which
is the falsification step this format exists to force.

### (c) Applied on a fresh restore — E3 (command, full output, exit code) — RUN 1

```
$ docker exec afrakala-lan-db md5sum /tmp/526.sql
b997ce7fb3ed053d1132554095ba81e4  /tmp/526.sql
$ md5sum <local file>
b997ce7fb3ed053d1132554095ba81e4  <local file>              <- byte-identical, verified before every apply

$ docker exec afrakala-lan-db sh -c '... psql -U supabase_admin -d prod_rehearsal_e1 --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f /tmp/526.sql'
SET
NOTICE:  526: precondition OK -- all nine target objects exist
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
NOTICE:  526: [409 precheck] no other function in public source-references expire_stale_credit_holds(...) -- safe to drop the (integer) overload
DROP FUNCTION
526: [409] dropped the stale expire_stale_credit_holds(integer) overload
NOTICE:  526 OK: all five migrations' asserted end states (386/394/396/404/409) are present in the catalogue. ...
EXIT: 0
```

Re-read after run 1 (probe1.sql, full output preserved in session transcript): all eight
`is_viewer_only`-guard views show `has_notnull_guard = t`; `product_computed_prices_public` and
`v_promotion_suggestions` both show `reloptions = {security_invoker=true}`; `create_purchase`
shows `HAS tehran_today` / `no raw compare`; `get_payables_list` and
`upsert_staff_daily_performance_metric` and both `sdpm_*` policies show `clean` / `HAS
tehran_today`; `asan_list_bank_deposit_export` is a single `(date,date)` signature with `HAS v
CTE` / `HAS combined`; `expire_stale_credit_holds` has exactly one signature,
`(integer,integer)`; zero other functions source-reference `expire_stale_credit_holds(`.

### (c) — RUN 2, same restore, proving the no-op (E4: same probe before/after)

```
$ docker exec afrakala-lan-db sh -c '... psql ... --single-transaction -f /tmp/526.sql'
SET
NOTICE:  526: precondition OK -- all nine target objects exist
526: [386a] product_computed_prices_public already carries security_invoker=true -- no-op
526: [386b] v_promotion_suggestions already correct -- no-op
526: [386c] vw_account_balances already correct -- no-op
526: [394] create_purchase already compares against tehran_today() -- no-op
526: [396a] get_payables_list already uses tehran_today() -- no-op
526: [396b] upsert_staff_daily_performance_metric already uses tehran_today() -- no-op
526: [396c] sdpm_insert_privileged / sdpm_update_privileged already use tehran_today() -- no-op
526: [404] asan_list_bank_deposit_export already has the payment-vouchers branch -- no-op
526: [409] expire_stale_credit_holds(integer) already absent -- no-op
NOTICE:  526 OK: all five migrations' asserted end states ... are present in the catalogue. ...
EXIT: 0
```

Every one of the nine repair points reports `no-op` on the second run; no `CREATE`/`ALTER`/`DROP`
statement executed. This is the required "apply 526 a second time and show zero changes."

### 526 is a no-op on TEST too — proved without writing to `afrakala`

Per the mission's explicit permission (`afrakala`: SELECT-only if read at all), the same nine
boolean conditions 526 uses to decide whether to act were run as plain read-only `SELECT`
statements against `afrakala` (not `prod_rehearsal_e1`):

```
$ ... psql -U supabase_admin -d afrakala --no-psqlrc -f /tmp/probe_test_noop.sql
need_386a_would_be_true_if_broken | f
need_386b_would_be_true_if_broken | f
need_386c_would_be_true_if_broken | f
need_394_would_be_true_if_broken  | f
need_396a_would_be_true_if_broken | f
need_396b_would_be_true_if_broken | f
need_396c_would_be_true_if_broken | f
need_404_would_be_true_if_broken  | f
need_409_would_be_true_if_broken  | f
```

All nine `f` — every `\if` branch in 526 would resolve false on `afrakala`, confirming it runs
clean there too, without ever executing a single write against the test database.

## Task 2 — migrations 527 (336's work) and 528 (343's work), without the database guard

Both `336` (line 31) and `343` (line 34) carry:
```sql
IF current_database() <> 'afrakala' THEN
  RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
```
Production's database is `postgres`. Neither migration could ever have applied there. `336` and
`343` are NOT edited (CLAUDE.md rule 6); `527` and `528` are their bodies re-issued without the
guard, each getting a new ledger row.

**336 (→527) live state, read before touching:** `post_receipt_journal(uuid)` EXISTS on
`prod_rehearsal_e1`; `trg_payment_receipts_post_journal` is ALREADY ABSENT — matching R-1's report
that 336's trigger-drop half is already a no-op on production. A live source-scan precheck
(`p.prosrc ~ 'post_receipt_journal\s*\('` over every other function in `public`) confirmed zero
callers before the `DROP FUNCTION` ran.

**343 (→528) live state, read before touching:** all four of `tg_journal_entry_immutable()`,
`tg_journal_line_immutable()`, `trg_journal_entry_immutable`, `trg_journal_line_immutable` are
ABSENT on `prod_rehearsal_e1` — unlike 336 and unlike 386/394/396/404/409, 343 never took effect on
production at all. Gate precondition checked: 17 posted `journal_entries` rows and 34
`journal_lines` rows exist, so 528's own behavioural verify (a real `UPDATE ... WHERE
status='posted'` expected to raise `P0001`) is not vacuous.

### 527 — E3, both runs

```
RUN 1: SET / NOTICE precheck OK / DROP TRIGGER (skipping, already absent) / DROP FUNCTION / NOTICE 527 OK / EXIT 0
RUN 2: SET / DROP TRIGGER (skipping) / DROP FUNCTION (skipping, already absent) / NOTICE 527 OK / EXIT 0
```
Both `DROP ... IF EXISTS` statements are inherently idempotent; run 2 shows both skipping cleanly.

### 528 — E3, both runs, with the behavioural gate (E4)

```
RUN 1: CREATE FUNCTION x2 / DROP TRIGGER (skipping, absent) x2 / CREATE TRIGGER x2 /
       NOTICE 528 OK: posted journal_entries rows refuse UPDATE (tested against a real row...) / EXIT 0
RUN 2: identical sequence, CREATE OR REPLACE / DROP+CREATE TRIGGER succeed again, same NOTICE / EXIT 0
```
The E4 probe here is real: before 528 ran, `UPDATE journal_entries SET description=description
WHERE status='posted'` would have succeeded (no trigger existed). After 528, the same statement
inside the verify block raises `P0001` and is caught — proving the guard is live against one of
the 17 real posted rows, not a synthetic fixture, and the caught exception's implicit savepoint
means no row was permanently touched.

### Ledger rows recorded (CLAUDE.md rule 2b — apply and record in the same breath)

```
$ ... psql -d prod_rehearsal_e1 -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260913090000');"
INSERT 0 1
$ ... VALUES ('20260913091000');  -> INSERT 0 1
$ ... VALUES ('20260913092000');  -> INSERT 0 1
$ ... SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;
684|20260913092000                    <- 681 + 3, no collision, ledger rows for 386/394/396/404/409/336/343 untouched
```

## Task 3 — 411/412/413, ship as-is, ceiling table confirmed

No new migration. `411`, `412`, `413` were re-applied verbatim (delivered to the container and
md5-verified byte-identical to the working-tree files) inside one `BEGIN … ROLLBACK` on
`prod_rehearsal_e1`, reproducing R-1's forcing technique: `refresh_today_dynamic_capital_after_
score_change()` no-ops unless a `daily_capital_settings` row exists for `CURRENT_DATE`
(production's newest live row is dated 2026-09-06), so one synthetic row was inserted for
`CURRENT_DATE` (2026-09-12 on this server) inside the same transaction that was rolled back at the
end.

Procedure: insert the synthetic row → call `recompute_dynamic_capital_setting(id,
'e1_before_snapshot')` directly to capture the BEFORE state under the OLD (unwidened) ranges → run
411, 412, 413 verbatim (each ends in its own `DO $verify$` gate, all three passed) → their Part-B
value-preserving self-update on `dynamic_entity_scores` fires `trg_refresh_dyn_capital_after_
score_change` automatically, recomputing the SAME `daily_capital_settings` row under the NEW
(widened) ranges → read AFTER state → `ROLLBACK`.

```
=== today setting id ===  4e34b410-219f-4535-8b2d-fd83c7165f4e

recompute_dynamic_capital_setting ->
  {"skipped": false, "capital_date": "2026-09-12", "customers_count": 121,
   "salespersons_count": 15, "total_allocated_to_customers": 595077090}

=== BEFORE (old ranges) ===
 name         | final_limit
 اصحابی        |   224251151
 تست 2         |   104497731
 کوثری کوروش   |   266328208
(خان محمدی: zero rows -- not part of the 121-customer scored/recomputed set at all)

=== BEFORE total/zero ===  total_rows=121  zero_ceiling_rows=118

### Applying 411 ###  -> 7 UPDATEs (ranges) + 1 UPDATE 337 (self-update) + NOTICE 411 OK
### Applying 412 ###  -> 1 UPDATE (hint) + NOTICE 412 OK
### Applying 413 ###  -> 4 UPDATEs (ranges) + 1 UPDATE 48 (self-update) + NOTICE 413 OK

=== AFTER (widened ranges) ===
 name         | final_limit
 اصحابی        |   171473263
 تست 2         |   115412437
 کوثری کوروش   |   311374592

=== AFTER total/zero ===  total_rows=121  zero_ceiling_rows=118

ROLLBACK
=== post-rollback confirmation ===
SELECT count(*) FROM daily_capital_settings WHERE capital_date = CURRENT_DATE;  -> 0
```

**Compared against R-1's recorded numbers — exact match on every figure:**

| Customer | R-1 before -> after | E-1 reproduced before -> after | Match |
|---|---|---|---|
| اصحابی | 224,251,151 -> 171,473,263 (-52,777,888) | 224,251,151 -> 171,473,263 (delta = 52,777,888) | exact |
| کوثری کوروش | 266,328,208 -> 311,374,592 | 266,328,208 -> 311,374,592 | exact |
| تست 2 (R-1 wrote تست ۲, Persian digit; the actual customer row is `تست 2`, Latin digit — confirmed by `customers.name LIKE '%تست%'`) | 104,497,731 -> 115,412,437 | 104,497,731 -> 115,412,437 | exact |
| خان محمدی | unchanged | absent from both BEFORE and AFTER snapshots -- outside the 121-customer recompute set entirely, so its ceiling cannot move by this mechanism | consistent with "unchanged" |
| 118 others | 0 -> 0 | zero_ceiling_rows: 118 -> 118 (out of 121 total both times) | exact |

No discrepancy found. `daily_capital_settings` confirms zero rows for `CURRENT_DATE` after the
`ROLLBACK`, so nothing from this reproduction persisted.

## Consumers affected (path:line)

- `product_computed_prices_public`, `v_promotion_suggestions`, `vw_account_balances`: read by
  whichever product/marketing/treasury screens select from these views through PostgREST as
  `authenticated`. No application code changes; the repair only restores catalogue state these
  screens already assumed.
- `create_purchase`: called from the purchase-registration RPC path (owner-request only; every
  caller passes the same 15 named parameters `394` already defined — 526 does not change the
  signature).
- `get_payables_list`, `upsert_staff_daily_performance_metric`: called via RPC from the
  payables/staff-metrics screens (`src/lib/...` — not modified in this mission, only the DB body).
- `sdpm_insert_privileged` / `sdpm_update_privileged`: RLS on `staff_daily_performance_metrics`,
  enforced for every direct table write regardless of caller.
- `asan_list_bank_deposit_export`: called by the Asan bank-export feature; its ACL after the
  DROP+CREATE was verified to still grant `authenticated` and `service_role` EXECUTE via this
  schema's default privileges for `public` functions (measured: `pg_default_acl` for role
  `supabase_admin` in schema `public`, objtype `f`, grants `authenticated=X`, `service_role=X` by
  default — no explicit `GRANT` was needed or added).
- `expire_stale_credit_holds`: called from the new-quote page as `authenticated`
  (admin/manager/accountant/sales); only the stale 1-arg overload is removed, the live 2-arg body
  (already matching 462) is untouched.
- `post_receipt_journal` / `trg_payment_receipts_post_journal` (527): zero live callers, confirmed
  by source scan immediately before the drop.
- `tg_journal_entry_immutable` / `tg_journal_line_immutable` (528): fire on every `UPDATE`/`DELETE`
  against `journal_entries` / `journal_lines`; the only documented interaction is
  `post_receipt_accounting`'s idempotent back-fill branch, unrelated to this mission (OG-11,
  already on record in 343's own file).

## Data risk and rollback plan

- 526: two `ALTER VIEW`/`CREATE OR REPLACE VIEW` statements restore reloptions/predicates only —
  no data touched. Five `CREATE OR REPLACE FUNCTION` statements restore function bodies to what
  their own migrations already specified and already run cleanly on TEST — no schema/data change.
  One `DROP FUNCTION` + `CREATE OR REPLACE FUNCTION` (404's pattern) changes a return signature;
  proved the ACL survives via default privileges. One `DROP FUNCTION` removes a confirmed-unused
  overload. Rollback: re-apply the pre-526 bodies (available via each of 386/394/396/404/409's own
  file text, or `docs/verification/386-down.sql` / `387-down.sql` for the two views) — no `-down`
  file is written for 526 itself since every change it makes is re-derivable from the five
  original migrations' own text.
- 527: two `DROP ... IF EXISTS`. Rollback: `docs/verification/336-down.sql` (already exists,
  captured before 336's own drop).
- 528: two `CREATE OR REPLACE FUNCTION` + two `DROP TRIGGER IF EXISTS`/`CREATE TRIGGER`. Rollback:
  `docs/verification/343-down.sql` (already exists, re-opens editing of posted entries).
- Task 3: no migration shipped; 411/412/413 remain exactly as they are in the working tree,
  unmerged into this mission's changes beyond the read-only rehearsal above.

## What was NOT verified

- End-to-end application behaviour (the frontend screens that call these RPCs) was not exercised;
  only the database layer was proven. CLAUDE.md scopes this role to the data layer.
- 462's own historical application to production was not independently re-verified beyond reading
  that its ledger row (20260906093000) is present and that the live 2-arg
  `expire_stale_credit_holds` body matches its text — full confirmation of whether 462 belongs to
  the same "ledger says applied, catalogue disagrees" class as the five in Task 1 was out of
  scope for this mission and is flagged here as a candidate for a future audit.
- Whether any other migration beyond the nine objects checked here also suffers the same
  ledger/catalogue drift was not swept; this mission's scope was exactly the five named migrations.

## Recommendations outside scope

- Consider auditing the full 681-row ledger against the live catalogue systematically (the
  mechanism CLAUDE.md's `e2e/security/og81-migration-ledger-matches-disk.spec.ts` checks
  file-vs-ledger, not effect-vs-ledger) — this mission found five migrations where the ledger and
  the file both agree the migration ran, yet the catalogue disagreed; a similar systematic check
  for "did the effect actually land" does not appear to exist.
- 387's gate (and any other gate using the single-argument `pg_get_viewdef(oid)` form) is
  correct on this engine; anyone writing a NEW gate should be aware `pg_get_viewdef(oid)` and
  `pg_get_viewdef(oid, true)` render boolean-AND WHERE clauses differently (parens vs. no parens)
  and should pick one deliberately rather than mixing them, since 526 itself shipped the mixed-arity
  bug on its first draft.

## Verdict: COMPLETE

All three tasks' acceptance criteria were checked against evidence actually in hand:
- Task 1: E3 (both migration runs, full output, exit 0) + E4 (all five objects re-read after fix,
  matching each original migration's assertion; re-read again after a second run showing zero
  changes) + read-only confirmation that TEST needs no repair.
- Task 2: E3 (both migrations, both runs) + E4 (528's behavioural UPDATE-refusal probe against a
  real posted row, before absent / after raised P0001).
- Task 3: E4 (same recompute mechanism run before and after 411/412/413, inside one rolled-back
  transaction, all five reported figures matching R-1 exactly) — explicitly not hidden as a match
  by construction, since the numbers were independently reproduced from a fresh restore rather
  than copied.
