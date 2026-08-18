# Phase <N> — <name> — PROGRESS

Copy to `phase-<N>-PROGRESS.md` at phase start. One per phase. **Fill as you go, not at the end** —
a phase that hits its context limit mid-run must be resumable from this file alone.

## HANDOFF STATE

```
Phase:                1 - Shared foundations
Status:               in progress
Branch:               feature/backend-phase-1
Base:                 staging @ 7197c190
Tasks:                2 of 7
Current task:         1.3
Blocked by:           nothing
Migrations applied:   336, 337, 338, 339
REST restarted after: 336=yes 337=yes 338=yes 339=yes
Backup taken:         D:/AfraKalaBackups/pre-phase1-20260818-144648.dump (16,773,020 bytes)
Typecheck:            not yet run this phase (run once at phase exit)
Last commit:          <pending>
PR:                   none (mission forbids)
```

## Pre-flight

- [x] `git fetch origin && git switch staging && git pull` - staging @ 7197c190
- [x] `git switch -c feature/backend-phase-1`
- [x] Backup taken and path recorded above
- [x] `ground-truth.md` re-verified - see task 1.1 findings
- [x] Rollback file written **before** apply - docs/verification/336-down.sql, dry-run validated

## Task log

One block per task. **A test not run is recorded as not run, never as passed.**


### Task 1.1 - Remove the dead posting path
```
Scope:      supabase/migrations/
Effort:     S
Migration:  20260818150000_336_drop_dead_receipt_posting_path.sql
Rollback:   docs/verification/336-down.sql  (written BEFORE the drop, dry-run validated)
Started:    2026-08-18
Finished:   2026-08-18
Gate:       OG-2 CONFIRMED

Acceptance command (verbatim from MASTER-CHECKLIST):
  SELECT count(*) FROM pg_proc WHERE proname='post_receipt_journal';
  SELECT count(*) FROM pg_trigger WHERE tgname='trg_payment_receipts_post_journal';

Expected:
  0
  0

Actual:
  0
  0

Verdict:    PASS
```

**Checklist defect corrected before running (FIX 3).** The checklist said
`DROP FUNCTION public.post_receipt_journal();` with no arguments. Live signature verified via
`pg_get_function_identity_arguments`: `post_receipt_journal(_receipt_id uuid)`, exactly one
overload. The no-argument form errors. Corrected on branch `fix/og2-and-checklist-corrections`.

**Rollback-file defect caught by dry run.** `pg_get_functiondef` emits no trailing semicolon after
the closing dollar-quote, so the generated down file merged the function and the following
`CREATE TRIGGER` into one statement. The dry run surfaced it; a semicolon was added and the file
re-validated (CREATE FUNCTION succeeded; the only remaining error was the trigger already
existing, which is correct pre-drop).

#### Captured definitions - the ONLY rollback source (rollback-plan.md)

```sql
--- OBJECT 1: trigger definition ---
CREATE TRIGGER trg_payment_receipts_post_journal AFTER INSERT OR UPDATE OF status ON public.payment_receipts FOR EACH ROW EXECUTE FUNCTION trg_post_receipt_on_approve();
--- OBJECT 2: post_receipt_journal ---
CREATE OR REPLACE FUNCTION public.post_receipt_journal(_receipt_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- NEUTRALIZED (migration 149). Model B (post_receipt_accounting) is the
  -- authoritative ledger path. This former Path A wrote
  -- account_kind='accounting_code', which the journal_lines CHECK forbids, and
  -- it duplicated posting. Kept (not dropped) with its trigger
  -- trg_payment_receipts_post_journal intact for history; it now does nothing,
  -- so the approve UPDATE succeeds and only Path B posts.
  RETURN NULL;
END;
$function$

--- OBJECT 3: trg_post_receipt_on_approve ---
CREATE OR REPLACE FUNCTION public.trg_post_receipt_on_approve()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved')
     AND NEW.payer_accounting_code IS NOT NULL
     AND COALESCE(NEW.beneficiary_accounting_code, NEW.receiver_accounting_code) IS NOT NULL
  THEN
    PERFORM public.post_receipt_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$

--- other callers of post_receipt_journal ---
trg_post_receipt_on_approve
--- other triggers using trg_post_receipt_on_approve ---
trg_payment_receipts_post_journal on payment_receipts
```

#### Dependency measurement (why the path is closed)

```
post_receipt_journal        -> called by exactly 1 function: trg_post_receipt_on_approve
trg_post_receipt_on_approve -> used by exactly 1 trigger:  trg_payment_receipts_post_journal
```

#### Reviewers

```
Observer (code quality):   CHANGE
  Objection: dropping only the two authorised objects leaves trg_post_receipt_on_approve()
  unreferenced, with a body that calls a function that no longer exists. That is dead code -
  precisely what this task set out to remove.

Software Engineer:         PASS
  Single transaction; DROP ... IF EXISTS is idempotent; a DO $verify$ block asserts both
  objects are gone before commit. The authoritative path post_receipt_accounting is untouched
  (count=1). Five legitimate triggers remain on payment_receipts. Nothing here is bypassable
  from PostgREST - it removes surface.

Security Engineer:         PASS
  No new object. One SECURITY DEFINER function removed (surface reduced). The orphaned
  trg_post_receipt_on_approve is secdef=true, config=search_path=public - compliant, and now
  unreachable. Tables in public with RLS off: 0. No sensitive data in any error text.

Lead decision on the Observer CHANGE:  NOT ACTIONED - deferred to the owner as OG-8.
  OG-2 authorises exactly two objects by name:
    "owner authorised dropping trg_payment_receipts_post_journal and post_receipt_journal."
  Dropping a third object exceeds that written authorisation, and the session rule forbids
  reshaping the plan unilaterally. The defect is real but inert: nothing can invoke the
  function now that its only trigger is gone. Its definition is captured above, so the drop
  is a one-line follow-up whenever the owner approves.
  >>> OG-8 (new): may trg_post_receipt_on_approve() also be dropped?
```


### Task 1.2 - document_numbers + assign_document_number
```
Scope:      supabase/migrations/
Effort:     M
Migrations: 20260818151000_337_jalali_year_helper.sql
            20260818152000_338_document_numbers.sql
            20260818153000_339_lock_down_burn_document_number.sql  (reviewer fix)
Rollback:   docs/verification/337-down.sql, 338-down.sql, 339-down.sql
Started:    2026-08-18
Finished:   2026-08-18

Acceptance command (verbatim from MASTER-CHECKLIST):
  SELECT assign_document_number('receipt','<uuid>') = assign_document_number('receipt','<uuid>');

Expected:
  t

Actual:
  t

Verdict:    PASS
```

#### Additional acceptance evidence (run inside BEGIN..ROLLBACK with a simulated JWT)

```
A1 idempotency, same source_id twice            -> t
A2 number produced                              -> RCP-1405-000001     (D3 format confirmed)
A3 different source_id                          -> RCP-1405-000002     (distinct)
A4 per-type series                              -> PAY-1405-000001 | DUAL-1405-000001
A5 invalid doc_type                             -> refused, SQLSTATE 22023
A6 null source_id                               -> refused, SQLSTATE 22023
A7 rows persisted after ROLLBACK                -> 0
```

`auth.uid()` is NULL in psql (ground-truth section 9), so the role-gated function was exercised
with `SET LOCAL "request.jwt.claims"` per CLAUDE.md safety rule 7, inside a transaction that was
rolled back. Nothing was written to the database.

#### Unplanned prerequisite: migration 337, public.jalali_year(date)

decisions.md D3 fixes the number format as `<PREFIX>-<jalali year>-<6 digits>`. The database had
**no Gregorian to Jalali conversion of any kind**: the only date helper is `tehran_today()`, and
`market_rate_ticks.jalali_date_label` is caller-supplied text, not a conversion. Task 1.2 could not
produce its specified format without this primitive, so it was built first as its own migration.

Standard Khayyam/Birashk civil algorithm, IMMUTABLE, pure integer arithmetic. The migration carries
assertions that refuse to apply if the conversion is wrong. Verified independently after apply:

```
2026-08-18 -> 1405     2026-03-20 -> 1404     2026-03-21 -> 1405   (Nowruz boundary)
2021-03-21 -> 1400     2024-03-19 -> 1402     2024-03-20 -> 1403   (Nowruz boundary)
2000-01-01 -> 1378     2030-12-31 -> 1409     1979-02-11 -> 1357   (22 Bahman 1357)
```

This is infrastructure the checklist did not list. Recorded rather than silently absorbed.

#### Series-scope decision, raised as OG-9

The serial is `max+1` per `doc_type` **globally**, exactly as `asan_assign_document_number` does,
because the checklist says "mirror it exactly". Consequence: numbering runs
`RCP-1405-000042 -> RCP-1406-000043` across a year boundary; the Jalali year is a label, not a
reset point. The common accounting alternative is a per-year reset (`RCP-1406-000001`).
This is an accountant-visible convention, not a technical choice.
>>> OG-9: should the serial reset each Jalali year?

#### Reviewers

```
Observer (code quality):   PASS
  Not a second implementation of an existing thing: asan_assign_document_number numbers Asan
  export documents (sales_invoice/purchase_invoice/accounting_document); this numbers source
  documents (receipt/payment/dual). Different registers, deliberately the same proven shape.
  No dead branch. burn_document_number's UPDATE affecting 0 rows when no number was ever
  assigned is correct behaviour, not a swallowed error - there is nothing to burn.

Software Engineer:         PASS
  Idempotency is enforced twice: check-before-lock and re-check under the lock, plus
  UNIQUE (doc_type, source_id) as the backstop if both reads race. Single-table write, so
  atomicity is trivial. Not bypassable from PostgREST: document_numbers has RLS on with a
  SELECT-only policy and no insert/update/delete policy at all, so the SECURITY DEFINER
  function is the only write path. No sequence, so a rolled-back transaction leaves no gap
  (D4). Burned rows are retained, so MAX(serial) still counts them and a burned number is
  never reissued - verified empirically below.

Security Engineer:         CHANGE  -> FIXED in migration 339
  Objection: burn_document_number was created SECURITY DEFINER with NO role gate, and new
  functions here inherit the Supabase default grants. The catalog confirmed:
    burn_document_number | =X/supabase_admin ... anon=X/... authenticated=X/...
  Any caller, including anon, could call
    SELECT burn_document_number('receipt','<uuid>','anything');
  and permanently burn a live document's number. Burned numbers are never reissued, so this
  corrupts the numbering ledger irreversibly.
  Also: assign_document_number retained anon EXECUTE (its in-body role gate stops anon, but
  the grant had no business existing).

Lead decision: CHANGE accepted and fixed before proceeding, in migration 339.
  The execute path was revoked rather than a role gate added. A gate was rejected deliberately:
  the burn runs inside an AFTER DELETE trigger and auth.uid() is NULL for service_role and for
  any background deletion, so a gate would block legitimate deletes instead of protecting
  anything. The two callers are SECURITY DEFINER trigger functions owned by supabase_admin,
  which keep EXECUTE as owner.

  Grants after the fix:
    assign_document_number | postgres, supabase_admin, authenticated, service_role   (no anon)
    burn_document_number   | postgres, supabase_admin, service_role                  (no anon,
                                                                                      no authenticated)

  Regression check that the fix did not break the feature (BEGIN..ROLLBACK):
    assign number to a real receipt        -> RCP-1405-000001
    burned_at before DELETE                -> NULL
    DELETE the receipt (fires the trigger) -> burned=t, has_reason=t
    next receipt number                    -> RCP-1405-000002  (burned serial NOT reissued)
    after ROLLBACK                         -> 0 document_numbers, 7 receipts intact
```

### Task <id> — <title>
```
Scope:      <files>
Effort:     S | M
Started:    <ts>
Finished:   <ts>
Commit:     <sha>

Acceptance command:
  <verbatim>

Expected:
  <verbatim>

Actual:
  <verbatim — paste the real output>

Verdict:    PASS | FAIL | NOT RUN

Reviewers:
  Observer:            PASS | CHANGE — <objection>
  Software Engineer:   PASS | CHANGE — <objection>
  Security Engineer:   PASS | CHANGE — <objection>
  Lead decision:       <accepted / overruled, and why>
```

## Phase test

```
Command:   npm run typecheck
Expected:  70 errors (documented baseline)
Actual:    <n>

Command:   <phase-specific verification>
Expected:  <...>
Actual:    <...>
```

## Stress test (phases 1–4 only)

```
Scenario:  50 concurrent <operation>
Expected:  50 distinct document numbers, 0 duplicates, 0 unbalanced entries, 0 orphans
Actual:    <...>
```

## Contradictions found

| Expected (ground-truth.md) | Found | Impact |
|---|---|---|

## Owner-Gate

Question, date asked, answer. If open, name the tasks continued in the meantime — idling is not
acceptable.

## Deploy verification

```
git rev-parse --short HEAD:              <sha>
docker exec afrakala-lan-web printenv APP_GIT_SHA:  <sha>
Match:                                    <yes/no>
docker restart afrakala-lan-rest:         <done>
git status --short:                       <n> lines — clean of programme files
```

## Exit criteria

- [ ] Every task PASS with real output recorded
- [ ] Phase test passed
- [ ] Stress test passed (where applicable)
- [ ] No migration applied-but-uncommitted
- [ ] PR merged and verified: `gh pr view <N> --json state,mergedAt` → `MERGED` + timestamp
- [ ] `APP_GIT_SHA` matches HEAD
- [ ] `00-progress.md` updated
