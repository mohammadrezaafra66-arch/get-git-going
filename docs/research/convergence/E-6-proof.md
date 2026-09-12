# E-6 — Security-3 / S-5 fix proof

**Mission:** AfraKala Convergence, E-6 (`feature/conv-security`, worktree
`D:\AfraKalaTest\wt-conv-security`, base `ad0138df`).

**Scope actually executed:** S-5 only — three function-body defects + the missing
`ai_providers.updated_by` column. S-4 is void (confirmed by R-5: the static `PERMISSIONS`
table was already removed in wave 6 / migration 485, zero consumers — nothing to delete).
S-1 was reassigned to a separate Security-3 mission per R-5's "NO" verdict on a single-mechanism
fix. Neither is addressed here.

---

## Restore proof (STEP 0)

```
$ docker exec afrakala-lan-db md5sum /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0  /tmp/prod13.dump          <- matches required checksum
```

```
$ docker exec afrakala-lan-db sh -c 'psql -U supabase_admin -d postgres -c "CREATE DATABASE prod_rehearsal_e6;"'
CREATE DATABASE
$ docker exec afrakala-lan-db sh -c 'pg_restore -U supabase_admin -d prod_rehearsal_e6 --no-owner --disable-triggers /tmp/prod13.dump'
... (21 errors, all "schema \"cron\" does not exist" — pg_cron is not installed on this host,
     matches "~21 harmless errors normal")
pg_restore: warning: errors ignored on restore: 21
$ docker exec afrakala-lan-db sh -c 'psql -U supabase_admin -d prod_rehearsal_e6 -tAc \
    "SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;"'
681|20260912150000
```

**Ledger read exactly the required `681 / 20260912150000`.** Proceeded.

The rehearsal database was dropped and recreated once mid-mission (see "A mistake caught in
rehearsal" below) and the restore + ledger check was repeated identically, with the same result,
before re-applying corrected migrations.

---

## Task 1 · `delete_bot_api_key_secure` — multi-role authorization bug

**Live body confirmed** via `pg_get_functiondef` on `prod_rehearsal_e6` — byte-identical to
`supabase/migrations/20260626145739_..._delete_bot_api_key_secure...sql:26-70`, including the
defect at the live body's equivalent of lines 39-42:

```sql
SELECT role::text INTO v_user_role
FROM public.user_roles
WHERE user_id = v_user_id
LIMIT 1;
...
IF v_user_role IS DISTINCT FROM 'admin' AND v_user_role IS DISTINCT FROM v_managed_role THEN
  RAISE EXCEPTION 'UNAUTHORIZED: ...';
```

No `ORDER BY` — a multi-role caller is collapsed to one arbitrary role before the authorization
check ever runs.

**Fix applied** — `supabase/migrations/20260913103000_535_security3_s5_function_fixes.sql`
(fix 1): `CREATE OR REPLACE` with the same signature, `v_user_role` and the `LIMIT 1` select
removed, authorization now checks `EXISTS (... role = 'admin' OR role = v_managed_role)` over
**all** of the caller's role rows.

### E4 proof — both halves, real old code / real new code, same probe, `BEGIN…ROLLBACK`

Script: `e4_proof_535.sql` (delivered via stdin, md5 verified `1cb306b65057819f91895d596725bc96`
on both sides). Fixture: synthetic user `a000...0001` holding `{accountant, sales}` — legitimately
qualifies via `sales` — against a key with `managed_by_role = 'sales'`.

**HALF A — before (the actual pre-535 function body, temporarily restored inside the rolled-back
transaction, called against the same fixture):**

```
=== HALF A · OLD (pre-535) code, multi-role user who legitimately holds sales, key 1 ===
NOTICE:  OLD CODE RESULT: RAISED UNAUTHORIZED: شما مجاز به حذف این کلید نیستید  (sqlstate=P0001)
=== key 1 is_active after HALF A (must still be true) ===
 id                                    | is_active
 b0000000-0000-4000-8000-000000000001  | t
```

A user who legitimately holds `sales` (the key's `managed_by_role`) was **denied** — bug
reproduced on the real old code, not a fabricated assertion.

**HALF B.1 — after (the real 535-fixed body, same user, same key):**

```
=== HALF B.1 · NEW (535) code, same multi-role user, same key 1 -- must now succeed ===
NOTICE:  NEW CODE RESULT: SUCCEEDED (correctly authorized)
=== key 1 is_active after HALF B.1 (must now be false) ===
 id                                    | is_active
 b0000000-0000-4000-8000-000000000001  | f
```

**HALF B.2 — negative control (new code, user holding neither `admin` nor `sales`):**

```
=== HALF B.2 · NEW (535) code, user holding NEITHER admin nor sales, key 2 -- must still be refused ===
NOTICE:  NEW CODE RESULT (neither-role user): RAISED UNAUTHORIZED: ... (sqlstate=P0001)
=== key 2 is_active after HALF B.2 (must still be true) ===
 id                                    | is_active
 b0000000-0000-4000-8000-000000000002  | t
```

After `ROLLBACK`, the function body read back from `pg_proc` is the real 535-fixed body (not
either test body), and both synthetic users/keys are gone (`count = 0` for both). E4 satisfied:
same probe, real old code red, real new code green, negative case still red.

---

## Task 2 · `admin_upsert_ai_provider` / `admin_delete_ai_provider` — RPC audit

**Confirmed live:** both RPCs' own `audit_logs` INSERT is new-values-only (upsert) / name-only
(delete). **Confirmed live**, `trg_audit_ai_providers` (migration 475's
`audit_ai_routing_change()`) is installed as `AFTER INSERT OR DELETE OR UPDATE ON ai_providers`
and independently captures a complete redacted diff for every write to the table, including
writes that bypass the RPC.

**Decision: option (B)** — document, do not duplicate. Justification is in the migration header
(`20260913103000_535...sql`, "Fix 2" section): re-adding a pre-image snapshot inside each RPC
just to widen its own audit row would record the same change, on the same table, in the same
transaction, a second time — with no reader who needs both and two redaction lists to keep in
sync if either drifts. What was actually missing was a signpost that the RPC's row is partial;
that is what was added — comments only, no logic change. Both functions are
`CREATE OR REPLACE`d with byte-identical bodies apart from the added comments (verified: the
functional statements are unchanged from the live pull captured before editing).

**Live confirmation that both records actually exist side by side** (`e4_proof_task2.sql`, same
`BEGIN…ROLLBACK` pattern, synthetic admin user):

INSERT via RPC produced 3 audit rows: `ai_providers`/`insert` (trigger, full new row, `old: null`),
`ai_providers`/`update` (trigger, fired by the RPC's own follow-up key-set `UPDATE`, full
`old`/`new`, `has_key_before/after` instead of the raw key), and `ai_provider`/`ai_provider_created`
(RPC's own row: `{"kind": "ollama", "name": "...", "is_active": true, "key_changed": true,
"capabilities": ["chat"]}` — no old values, confirming the "weaker, new-value-only duplicate"
characterization is accurate, not assumed).

DELETE via RPC produced 2 audit rows: `ai_providers`/`delete` (trigger, full `old` row including
`updated_by`) and `ai_provider`/`ai_provider_deleted` (RPC's own row: `{"name": "..."}` only).

---

## Task 3 · `ai_providers.updated_by`

**Confirmed absent, live:** `information_schema.columns` for `public.ai_providers` on
`prod_rehearsal_e6` listed exactly `id, name, label, kind, base_url, is_active, priority,
chat_model, embed_model, vision_model, capabilities, secret_id, key_prefix, notes, created_at,
updated_at, created_by` — no `updated_by`.

**Added** in `supabase/migrations/20260913104000_536_ai_providers_updated_by.sql`: plain
`updated_by uuid` (no FK, matching the sibling `created_by uuid`, which also has no FK — confirmed
live via `pg_constraint` returning zero foreign keys on `ai_providers`), populated by a new
`BEFORE UPDATE` trigger `trg_ai_providers_set_updated_by` / `set_ai_providers_updated_by()` from
`auth.uid()`.

**Decision on the no-JWT case:** `auth.uid()` is `NULL` for a cron/service-role write (no JWT
present) — documented in the migration header as the deliberate, correct value: NULL means "no
authenticated human editor for this write" and is checkable, versus a fabricated placeholder actor
that would misattribute the change. No cron job currently writes to `ai_providers` (grepped
`src/server`, `supabase/functions` for the RPC/table names outside the RPCs and the 475 trigger —
zero hits), so this is a documented default for a case that does not fire today, not dead code for
a case that can't happen.

**507 rule applied:** the new trigger function's own `REVOKE ALL ... FROM PUBLIC/anon/authenticated`
sits in the same file, and the migration's own verification `DO` block **measures** (does not
trust) `has_function_privilege('anon'/'authenticated', ..., 'EXECUTE')` and fails the migration if
either still has it — the exact lesson migration 521 recorded (`ALTER DEFAULT PRIVILEGES` grants
EXECUTE to `PUBLIC`/`authenticated` on every new function unless revoked, and the ACL must be
measured, not assumed from having written a REVOKE).

### E4 proof — real before/after on the same probe

Script: `e4_proof_536.sql` (md5 verified `0321b23b6908146a64e1541f640256b3` both sides),
`BEGIN…ROLLBACK`, synthetic admin user.

```
=== after INSERT (via RPC, authenticated admin): updated_by must be NULL ===
 id            | created_by      | updated_by
 a7ad40e9-...  | a0000000-...003 | (null)                      <- correct: trigger is UPDATE-only

=== after UPDATE by authenticated admin (auth.uid() present): updated_by must equal the admin id ===
 id            | updated_by       | matches_admin
 a7ad40e9-...  | a0000000-...003  | t

=== after UPDATE with NO jwt claims (auth.uid() NULL, simulating service-role/cron) ===
 id            | updated_by
 a7ad40e9-...  | (null)                                        <- correct: not the previous admin id
```

Before this migration, `updated_by` did not exist at all — this is the strongest form of
before/after: the column, the trigger, and the correct-NULL behaviour did not exist, and now they
do, proven against the live restored database, not a fixture-only test.

---

## Suite / regression check

There is no project-wide automated test suite reachable from this mission's scope (this is a
database-only change under `supabase/migrations/`; `e2e/` tests require the LAN test server's
live `afrakala` database, which this mission is explicitly forbidden from touching —
`FORBIDDEN: afrakala db (SELECT-only)`). The equivalent check performed instead: both migrations
applied cleanly with `--single-transaction -v ON_ERROR_STOP=1` to a full production-data restore,
each migration's own verification `DO` block passed (no `RAISE EXCEPTION`, confirmed by the `DO`
/ `INSERT 0 1` output with no error lines), and the post-apply ledger read `683 /
20260913104000` — `681 + 2`, both new versions present, nothing else changed.

```
$ docker exec afrakala-lan-db sh -c 'psql -U supabase_admin -d prod_rehearsal_e6 -tAc \
    "SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;"'
683|20260913104000
```

---

## A mistake caught in rehearsal (reported, not hidden)

The first attempt at `20260913104000_536...sql` wrapped its own statements in `BEGIN;...COMMIT;`
in addition to being applied with `--single-transaction`. `psql --single-transaction` already opens
its own outer transaction; the file's internal `COMMIT` closed that outer transaction early
(confirmed by the literal `WARNING: there is already a transaction in progress` /
`WARNING: there is no transaction in progress` output from that first apply), so the
verification `DO` block and the ledger `INSERT` ran in autocommit mode rather than inside the
protected transaction — exactly the partial-apply failure mode `--single-transaction` exists to
prevent, even though nothing actually failed that run. Caught before commit: the rehearsal
database was dropped, recreated, and re-restored from `/tmp/prod13.dump` (ledger re-verified
`681/20260912150000`), the file was corrected to remove the internal `BEGIN;`/`COMMIT;`, and both
migrations were re-applied and re-verified as shown above. The committed migration file does not
contain this bug.

---

## RLS / RBAC / audit impact

- **RLS:** none of the three touched objects are tables with policies changed. `ai_providers`
  already has RLS (unchanged); the new `updated_by` column inherits the table's existing
  policies automatically (no new policy needed — confirmed no policy on `ai_providers`
  enumerates specific columns).
- **RBAC:** Task 1 makes `delete_bot_api_key_secure`'s authorization check *strictly more
  correct* (no caller who previously passed can now fail — the fix only widens the qualifying
  set from "one arbitrary role" to "any actual role"; a caller who passed before because their
  arbitrary pick happened to be right still passes, since that role is still in their set).
  Tasks 2/3 add no new authorization logic — `admin_upsert_ai_provider`/`admin_delete_ai_provider`
  still gate on `has_role(auth.uid(), 'admin')` exactly as before; the new trigger function does
  not check the caller at all (it fires as part of an already-authorized `UPDATE`) and is
  additionally unreachable by direct SQL/RPC (`RETURNS trigger`).
- **Audit:** Task 2 changes no audit *behavior*, only adds a documentation comment. Task 3 adds
  one new column to `audit_ai_routing_change()`'s existing full-row capture automatically (no
  change needed to that trigger — `to_jsonb(NEW)`/`to_jsonb(OLD)` already includes every column).

## API contract changed or not

No signature changed on any of the three functions. `ai_providers` gained one nullable column
(`updated_by uuid`), additive only — no existing `SELECT *` consumer breaks from an added column
in Postgres (column order is not positional for any real client in this codebase; verified no
`SELECT *`-into-fixed-arity caller exists by grepping `src/` for `ai_providers` — all reads go
through PostgREST's named-column JSON, which is additive-safe).

## What was NOT verified

- No automated e2e/spec test exists for either fixed function or the new column — this mission's
  own scope forbids touching the live `afrakala` database to add or run one. The `e2e/` suite
  under `D:\AfraKalaTest\app` was not run against this change.
- Frontend behavior (e.g. whether any admin screen surfaces `ai_providers.updated_by`) was not
  checked — `src/**` is out of scope for this mission by explicit instruction.
- Whether any other RPC or trigger elsewhere in the schema reads `ai_providers.updated_by` or
  assumes its absence was not exhaustively re-verified beyond the targeted greps noted above.
- Real production behavior after this migration actually ships — only the full-data rehearsal
  copy was exercised; production itself is untouched by this mission (SELECT-only on `afrakala`,
  no rehearsal database ever created there).

## Verdict: COMPLETE

All three S-5 fixes applied, each proven with E4 (real before/after on the same probe, inside
`BEGIN…ROLLBACK`, using real captured old code where "before" required it). Restore proof matches
the required checksum and ledger row exactly. `prod_rehearsal_e6` was dropped and confirmed gone.
S-4 correctly left untouched (void, per R-5). S-1 correctly left to the separate Security-3
mission.
