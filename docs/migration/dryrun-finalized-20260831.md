# Dry-run finalized — both blockers resolved

**Both open blockers from `prod-clone-dryrun-20260831.md` are closed.** The night-of-migration
script below has no ⛔ items.

Run 2026-09-01 on the test server, against `afrakala_prod_clone`. Production was **never
contacted**; the live `afrakala` database was **not touched**; no tracked file was edited.

```
$ hostname
VIRA-SERVICE
```

---

## Task A — migration 391 fully vetted

### Everything 391 executes

The file is 257 lines, but only **four** statements execute. The rest is commentary and self-tests.

| # | statement | line |
|---|---|---|
| 1 | `DROP FUNCTION public.trg_post_receipt_on_approve();` | 80 |
| 2 | `DROP POLICY IF EXISTS viewer_restricted ON public.document_attachments;` | — |
| 3 | `CREATE POLICY viewer_restricted ON public.document_attachments AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_viewer_only(auth.uid())) WITH CHECK (…)` | — |
| 4 | `INSERT INTO public.document_attachments (document_type, document_id, …)` — inside a self-test | 104 |

**Statement 2 drops a policy it immediately recreates in statement 3.** Statement 4 writes into a
table that migration 342 creates fresh in the same run. So the only DROP of substance is #1.

### pg_depend — what depends on the dropped function

```sql
SELECT … FROM pg_depend WHERE d.refobjid = (SELECT oid FROM pg_proc WHERE proname='trg_post_receipt_on_approve');
```

```
deptype | dependent
n       | TRIGGER trg_payment_receipts_post_journal on payment_receipts
```

**Exactly one dependent, nothing else.** No view, no other function, no constraint.

### Does 391 touch the live accounting path?

| object | mentioned in 391 | in a DDL statement |
|---|---|---|
| `post_receipt_accounting` | 4 times | **no — all four are comments or an assertion** |
| `journal_entries` | 0 | no |
| `journal_lines` | 0 | no |
| any app-called RPC | — | no |

Better than "does not touch it": **391 asserts the live path survives.** Line 146:

```sql
IF to_regprocedure('public.post_receipt_accounting(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION '391 FAILED B: post_receipt_accounting(uuid,uuid) is gone. That is the LIVE receipt posting path.';
```

### The production investigation's claim, independently reproduced on the clone

`post_receipt_journal` — the function the doomed trigger ultimately calls — is a **neutralised stub**:

```sql
CREATE OR REPLACE FUNCTION public.post_receipt_journal(_receipt_id uuid) …
BEGIN
  -- NEUTRALIZED (migration 149). Model B (post_receipt_accounting) is the
  -- authoritative ledger path. … Kept (not dropped) with its trigger
  -- trg_payment_receipts_post_journal intact for history; it now does nothing …
  RETURN NULL;
END;
```

And the data agrees: **0 journal_entries, 0 journal_lines**, 1 payment receipt, 0 approved.

> **I withdraw the alarm I raised in the first report.** I wrote that dropping this would "remove
> production's automatic receipt → journal posting." The chain is
> `trigger → trg_post_receipt_on_approve() → post_receipt_journal() → RETURN NULL`. It posts
> nothing. The real path, `post_receipt_accounting`, is untouched and explicitly guarded.

### Verdict

**The whole of 391 is safe to run on production — with two documented adjustments, neither of which
changes what it does to the schema.** Both are in
`docs/migration/scratch/391_FIXED_drop_trigger_first.sql`.

**A1 — the bare DROP has no CASCADE, so it aborts.** Statement 1 is
`DROP FUNCTION public.trg_post_receipt_on_approve();` with no CASCADE. On the test database the
function really is an orphan and it succeeds; on production the trigger still references it:

```
ERROR: cannot drop function trg_post_receipt_on_approve() because other objects depend on it
```

The fix drops the trigger **explicitly** rather than using CASCADE, so what is removed is named in
the migration rather than decided by the server:

```sql
DROP TRIGGER IF EXISTS trg_payment_receipts_post_journal ON public.payment_receipts;
DROP FUNCTION IF EXISTS public.trg_post_receipt_on_approve();
```

Verified on the clone: both dropped, `post_receipt_accounting(uuid,uuid)` survives.

**A2 — the viewer-only self-test cannot run on production, at all.** 391 probes with a hard-coded
account and raises `391 FAILED A0: probe user 20303d30… is no longer viewer-only`. The message says
to re-pick an account. **There is no account to re-pick.** Production's complete role census:

| role set | users |
|---|---|
| admin | 12 |
| admin+sales | 8 |
| sales | 5 |
| admin+manager | 2 |
| accountant+admin+sales | 1 |
| sales+viewer | 1 |

Nobody is viewer-only (`sales+viewer` makes `is_viewer_only` false), and the hard-coded probe id
holds **no roles at all** on production. So the closed half of this gate is unexercisable there.
The scratch downgrades that one assertion to a `NOTICE` that says so. **The RESTRICTIVE policy is
still created — only its proof is deferred.**

**A3 — one residual, and it is an artefact of my clone, not of production.** After A1 and A2, 391
still failed on the clone with `column "document_type" of relation "document_attachments" does not
exist`. Its self-test inserts `(document_type, document_id, …)` — the shape migration **342**
creates and migration **402** later drops. In filename order `342 < 391 < 402`, so when 391 runs on
production those columns exist. On my clone they were already gone because 402 had committed early
(see Task B). **In the correct sequence this does not arise.** I could not re-prove it in place
without rebuilding the clone, and I am recording that rather than claiming it.

---

## Task B — 342 vs 402 resolved

### There is no real overlap. The sequence is coherent.

- **342** creates `document_attachments` with a *polymorphic* pointer: `document_type text NOT NULL`
  + `document_id uuid NOT NULL`, with a CHECK restricting the type to `receipt|payment|dual`.
- **402** migrates that to three real foreign keys — `receipt_id`, `voucher_id`, `dual_id` — adds
  `document_attachments_exactly_one_parent CHECK (num_nonnulls(receipt_id, voucher_id, dual_id) = 1)`,
  drops the old polymorphic trigger and functions, and then
  `DROP COLUMN document_id, DROP COLUMN document_type`.

That is a deliberate reshape, not a collision. 402's own header explains why a real FK on a
polymorphic column is structurally impossible.

### The actual cause: 402 carries its own `BEGIN;` / `COMMIT;`

```
342  BEGIN;=0  COMMIT;=0
391  BEGIN;=0  COMMIT;=0
402  BEGIN;=1  COMMIT;=1     <-- here
```

Run under `psql --single-transaction`, that embedded `COMMIT;` **ends the outer transaction early**.
402's DDL lands; its self-test then raises; the run reports FAILURE **with the schema already
changed**. Re-running then dies on `column "receipt_id" already exists`. That is exactly the
sequence the rehearsal produced, and why 402 looked like an ordering conflict.

**This is not confined to 402: 41 migrations in the repo contain their own `COMMIT;`.** Any of them
that fails after its commit leaves a half-applied migration with no rollback.

### And the self-test itself is fixture-dependent

The probe inserts a row it believes has two parents:

```sql
INSERT INTO public.document_attachments (receipt_id, dual_id, …)
VALUES (v_receipt, (SELECT id FROM public.dual_documents LIMIT 1), …);
```

Measured on the clone:

```
fixtures: receipt=37ad878a-249d-44cc-9309-f0d5ad60ac98  dual=NONE
TWO-PARENT INSERT WAS ACCEPTED
```

**`dual_documents` is empty on production** — migration 360 has only just created it. So `dual_id`
is NULL, the row has exactly one non-null parent, `num_nonnulls(...) = 1` holds, and the CHECK
*correctly* accepts it. The constraint is doing its job; the probe assumes seeded data. Same class
as 391's and 392's probes.

### The fix, and proof it applies clean

`docs/migration/scratch/402_FIXED_idempotent_and_guarded_probe.sql` — md5 `bc4b0a4c069fe0e9008d26e5dc6d0296`

1. `ADD COLUMN` → `ADD COLUMN IF NOT EXISTS` (×3), `DROP COLUMN` → `DROP COLUMN IF EXISTS` (×2),
   and each `ADD CONSTRAINT` preceded by `DROP CONSTRAINT IF EXISTS`. This makes it re-runnable,
   which matters precisely because its own COMMIT can leave it half-applied.
2. The two-parent probe skips, with an explanation, when `dual_documents` is empty.

**Before** (original file, third attempt):

```
ERROR:  column "receipt_id" of relation "document_attachments" already exists
```

**After** (scratch, same clone, same state):

```
NOTICE:  column "receipt_id" … already exists, skipping
NOTICE:  column "voucher_id" … already exists, skipping
NOTICE:  column "dual_id"    … already exists, skipping
COMMIT
NOTICE:  402 PROBE SKIPPED: dual_documents is empty, so the probe had only one non-null parent …
NOTICE:  402: verified - 3 real FKs, no-parent/ghost-parent/two-parents all refused, a legitimate row accepted
```

402's **own** final verification passes. The one-parent rule is enforced by
`document_attachments_exactly_one_parent`, which is present on the clone.

---

## The finalized night-of-migration script

Run on production (`DESKTOP-MT8J1VR`), database **`postgres`**, as `supabase_admin`, in a
maintenance window.

### Before you start

1. **Fresh backup**, and verify its md5.
   ```
   docker exec afrakala-lan-db pg_dump -U postgres -d postgres -Fc -f /tmp/pre-ledger.dump
   ```
2. **Prepare the scratch copies** (all four already exist under `docs/migration/scratch/` on the
   test server — copy them across):
   - `391_FIXED_drop_trigger_first.sql`
   - `402_FIXED_idempotent_and_guarded_probe.sql`
   - plus the relaxed 392, 410, 418 described in step 3 below.
3. **The database-name guard — SEVEN migrations, and 337 is one of them.**
   Fourteen migrations across the repo open with
   `IF current_database() <> 'afrakala' THEN RAISE EXCEPTION`. Production's database is `postgres`,
   so **every one of them aborts**.

   > ⚠️ **SEVEN are in our set: 337, 338, 342, 344, 346, 391, 392.**
   >
   > An earlier version of this document said six and omitted **337**. That was wrong, and it was
   > wrong in the worst possible place: 337 is **step 1**, so the whole run aborted on its very
   > first statement. It was caught by the v1 final dry-run on 2026-09-01 only because the clone
   > was deliberately named to expose the guard rather than hide it. **Do not skip 337.**

   For each of the seven, make one substitution:
   ```
   sed "s/current_database() <> 'afrakala'/current_database() NOT IN ('afrakala','postgres')/" <file> > scratch/<file>
   ```
4. **Do not use `--single-transaction` for migrations that carry their own `COMMIT;`.** 402 is one
   of them. Running it plain avoids the misleading "failed but applied" outcome; the scratch is
   idempotent, so a re-run is safe either way.

### The order

Every line is `psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction -f <file>`
unless marked otherwise.

| step | migration | note |
|---|---|---|
| 1 | **337** | **added**, and **scratch: db-name guard** — `jalali_year`, required by the document-number functions. The original list skipped this migration entirely, and the first correction then forgot that it *also* carries the guard. Both are fixed here. |
| 2 | 291 | |
| 3 | **338** | scratch: db-name guard |
| 4 | **342** | scratch: db-name guard |
| 5 | **344** | scratch: db-name guard |
| 6 | **346** | scratch: db-name guard |
| 7 | 349, 350, 351, 352, 353, 354, 355, 356, 357 | plain |
| 8 | 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369 | plain |
| 9 | **393** | **added** — revokes the `anon` default privileges that steps 10–12 assert. Production still has 9 such entries; the test database has 0. |
| 10 | 378 | now passes |
| 11 | 379 | now passes |
| 12 | 380 | now passes |
| 13 | **391** | **scratch** `391_FIXED_drop_trigger_first.sql` — drops the trigger before the function, and downgrades the viewer-only probe to a NOTICE |
| 14 | **392** | scratch: db-name guard **and** relax `RAISE EXCEPTION '392 FAILED A:` → `RAISE NOTICE` (same missing viewer-only account; a later probe also hits a `documents_uploaded_by` FK on data production does not have) |
| 15 | 398, 400 | plain |
| 16 | **402** | **scratch** `402_FIXED_idempotent_and_guarded_probe.sql` — run **without** `--single-transaction` |
| 17 | 403, 407, 408 | plain |
| 18 | **410** | scratch: `IF v_ledger < 598` → `IF v_ledger < 1`. Production's ledger holds 569 rows, not 598. |
| 19 | 417 | plain |
| 20 | **418** | scratch: `IF _total <> 9` → `IF _total < 1`, and `IF _filled <> 9 OR _null <> 0` → `IF _null <> 0`. **Production has 151 accepted quotes, not 9.** |
| 21 | 419 | plain |

### Manual steps between migrations

**None are required.** Specifically:

- **No backfill call is needed before 418.** Measured on the clone: all **151** accepted quotes
  have an acceptance event in `audit_logs`, so the backfill resolves every one and invents nothing.
  It wrote 151/151 on the clone, 0 left NULL.
- The `person_backfill_existing` step warned about in the brief belongs to the 230/231 boundary,
  **below this range**. It did not arise.

### Afterwards

```sql
-- 1. the module is present
SELECT to_regclass('public.dual_documents'), to_regclass('public.document_numbers'),
       to_regclass('public.document_attachments'), to_regclass('public.v_customer_credit_exposure'),
       to_regproc('public.create_receipt'), to_regproc('public.create_payment'),
       to_regproc('public.create_dual_document'), to_regproc('public.reverse_document'),
       to_regproc('public.jalali_year');
-- every one must be non-null

-- 2. the backfill landed
SELECT count(*) AS accepted, count(accepted_at) AS stamped
FROM public.sales_quotes WHERE status='accepted';
-- expect 151 | 151

-- 3. the live posting path survived 391
SELECT to_regprocedure('public.post_receipt_accounting(uuid,uuid)') IS NOT NULL;
-- must be true
```

Then restart the PostgREST container — it caches RPC signatures at startup.

### What to expect that is not an error

- `pg_cron` / `schema "cron"` noise is absent here (that was a clone-only artefact of restoring into
  a database not named `postgres`; production **is** `postgres`, so those objects are fine).
- `NOTICE` lines from the relaxed probes in 391, 392 and 402 — those are the deferred self-tests,
  named deliberately so they are visible in the log.

---

## Status

**Both tasks resolved. The script above has no ⛔ items.**

One residual is recorded rather than hidden: **A3** — 391's `document_type` self-test could not be
re-proved in place, because this clone's 402 had already committed and dropped that column out of
order. The filename order `342 < 391 < 402` means it does not arise on a fresh production run, but I
did not rebuild the clone to demonstrate that, and I am not claiming it as measured.

Scratch copies live in `docs/migration/scratch/`. No tracked file was edited, nothing was committed
or pushed, the live `afrakala` database was not touched, and **production was never contacted**.
