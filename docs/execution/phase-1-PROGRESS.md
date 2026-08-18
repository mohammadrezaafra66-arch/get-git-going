# Phase <N> — <name> — PROGRESS

Copy to `phase-<N>-PROGRESS.md` at phase start. One per phase. **Fill as you go, not at the end** —
a phase that hits its context limit mid-run must be resumable from this file alone.

## HANDOFF STATE

```
Phase:                1 - Shared foundations
Status:               in progress
Branch:               feature/backend-phase-1
Base:                 staging @ 7197c190
Tasks:                7 of 7
Current task:         phase exit (Gate A / Gate B)
Blocked by:           nothing
Migrations applied:   336..344
REST restarted after: 336..341 all yes
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


### Task 1.3 - require_asan_code(p_person_id uuid)
```
Scope:      supabase/migrations/
Effort:     S
Migration:  20260818154000_340_require_asan_code.sql
Rollback:   docs/verification/340-down.sql
Started:    2026-08-18
Finished:   2026-08-18

Acceptance (verbatim from MASTER-CHECKLIST):
  for a person known to lack a code, the call raises;
  for one with a code it returns the code. Record both outputs.

Actual - CASE A, person WITH a code:
  code=90019001  len=8            (returned, not raised)

Actual - CASE B, person WITHOUT a code:
  sqlstate    : P0001
  names party : t                 (the message interpolates persons.display_name)

Verdict:    PASS
```

#### Extra cases run beyond the checklist

```
CASE C  require_asan_code(NULL)                       -> 22023 (argument error, not P0001)
CASE D  customer whose customers.accounting_code is
        set but who has NO person_identifiers row     -> P0001  ** D6 upheld **
```

CASE D is the one that matters. ground-truth section 12 records a customer carrying
`customers.accounting_code = 114067` with no identifier row, and the Asan export reads the
identifier, not the mirror. Had `require_asan_code` fallen back to the mirror, that customer's
document would have been created and then silently withheld by the export. The function refuses
it instead, which is exactly what D6 requires.

Status is deliberately not filtered: all 11 existing codes are `status='provisional'` and the
export does not filter on status either. Existence is the rule.

#### Self-test defect caught before the migration was applied

The first draft of the migration's own `DO $verify$` block asserted failure with a bare
`RAISE EXCEPTION`, which defaults to SQLSTATE P0001 - the very code the surrounding handler
catches. The assertion could therefore never fail: a broken `require_asan_code` would have been
reported as passing. Rewritten to record the outcome in a flag and assert outside the handler,
with ERRCODE 39000. Fixed before apply, not after.

#### Reviewers

```
Observer (code quality):   PASS
  No existing function does this, so it is not a second implementation. No dead branch. The
  one swallowed-error risk was in the migration's self-test and was fixed before apply
  (above).

Software Engineer:         PASS
  STABLE + read-only, so no transaction-boundary or idempotency surface. Correctly a single
  enforcement point rather than a rule copied into each RPC. NOTE, not an objection: this
  function only enforces anything once the create RPCs call it in phases 2-4. D13 requires
  both halves (form and database); the database half is now available, the form half is
  phase 6.

Security Engineer:         PASS
  secdef=true, cfg=search_path=public. anon revoked, authenticated granted. The error text
  names the party's display_name, which is required by the task ("naming the party") and is
  not in the prohibited set - audit-trigger-spec forbids Asan code, phone and national id in
  the AUDIT payload, which this is not. No code value is leaked on the failure path.
```


### Task 1.4 - cheque account kinds + journal_entries.doc_kind
```
Scope:      supabase/migrations/
Effort:     M
Migration:  20260818155000_341_cheque_kinds_and_doc_kind.sql
Rollback:   docs/verification/341-down.sql
Started:    2026-08-18
Finished:   2026-08-18

Acceptance (verbatim from MASTER-CHECKLIST):
  SELECT count(*) FROM journal_entries WHERE doc_kind IS NULL;      -> 0
  inserting a line with account_kind='cheque_receivable' succeeds in a rolled-back transaction

Actual:
  doc_kind_nulls = 0
  cheque_receivable inserted = 1 row   (inside BEGIN..ROLLBACK)

Verdict:    PASS
```

#### Backfill result

```
doc_kind | source_type     | count
receipt  | payment_receipt | 1
```

A1 specifies the backfill value 'other'; branches for `payment_voucher` -> 'payment' and
`mutual_settlement` -> 'settlement' were written too, but both matched 0 rows because those
tables are empty (ground-truth section 1). Recorded so the zero is not mistaken for a bug.

#### Extra cases run beyond the checklist

```
cheque_payable against a supplier                    -> inserted
cheque_receivable pointing at a non-customer uuid    -> rejected, 23503 (validator works)
account_kind = 'not_a_real_kind'                     -> rejected by CHECK
INSERT into journal_entries omitting doc_kind        -> rejected, not_null_violation
rows persisted after ROLLBACK                        -> journal_lines still 2
```

#### Target tables for the cheque kinds - a decision A2 requires but does not name

```
cheque_receivable -> customers    (a cheque WE HOLD, received from a customer)
cheque_payable    -> suppliers    (a cheque WE ISSUED, owed to a supplier)
```

Mirrors the existing customer_credit->customers / supplier_payable->suppliers mapping, and is the
shape phases 2 and 3 need: a receipt's cheque branch debits cheque_receivable against the paying
customer, and an endorsed cheque later credits that same customer's line.

>>> OG-10: payment_vouchers.payee_type also allows external_party and customer. An own cheque
issued to an external party rather than a supplier would fail this validation. No such document
can exist yet (payment_vouchers holds 0 rows, the payment RPC is phase 3), so this is a boundary
phase 3 must confirm or widen - not deferred breakage.

#### Hardening beyond the checklist: doc_kind carries NO default

A1 specifies 'other' as the *backfill* value. It was applied as a backfill and the DEFAULT was
then dropped. Had the default remained, a future INSERT that forgot doc_kind would silently
become 'other' - the one value the export treats as belonging to no menu option, so the document
would disappear from every export with no error anywhere. Requiring the value turns that omission
into a loud NOT NULL failure. Verified above.

#### Reviewers

```
Observer (code quality):   PASS
  The validator is edited in place rather than a second validator being added (A1 explicitly
  warns against leaving two implementations). No dead branch. The three backfill UPDATEs that
  matched 0 rows are correct-by-construction, not dead code - they exist so the migration is
  right on a database where those tables are populated.

Software Engineer:         PASS
  Whole migration is one transaction, so a failure leaves neither the widened CHECK nor a
  half-populated column. Ordering is deliberate and load-bearing: backfill runs BEFORE the
  CHECK and BEFORE SET NOT NULL, so neither can fail on legacy rows. Dropping the DEFAULT
  closes the silent-'other' hole described above. The rollback narrows the CHECK again, so
  341-down.sql carries an explicit warning that it must not run while cheque lines exist or
  after phase 5 rewires the export.

Security Engineer:         PASS
  No new table, so no RLS surface. validate_journal_line_ref keeps SET search_path TO 'public'
  and remains SECURITY INVOKER, which is correct - it must run with the caller's rights so it
  cannot be used to probe rows the caller cannot see. Its EXECUTE format() interpolates only
  a literal from a fixed CASE list, never user input, so there is no injection path. Error
  text names the account kind and the missing uuid, not party data.
```


### Task 1.5 - document_attachments + RLS
```
Scope:      supabase/migrations/
Effort:     M
Migration:  20260818156000_342_document_attachments.sql
Rollback:   docs/verification/342-down.sql
Started/Finished: 2026-08-18

Acceptance (verbatim from MASTER-CHECKLIST):
  SELECT relrowsecurity FROM pg_class WHERE relname='document_attachments';   -> t
  SELECT count(*) FROM pg_policies WHERE tablename='document_attachments';    -> 3

Actual:
  t
  3
    document_attachments_select        | SELECT
    document_attachments_insert        | INSERT
    document_attachments_delete_admin  | DELETE
    (no UPDATE policy, as specified)

Verdict:    PASS
```

#### Existence-trigger functional test (BEGIN..ROLLBACK)

```
valid receipt attachment                  -> inserted
document_id pointing at nothing           -> rejected 23503
document_type='dual'                      -> refused loudly 0A000
duplicate storage_path                    -> rejected (unique_violation)
rows persisted after ROLLBACK             -> 0
```

'dual' is refused rather than accepted-unvalidated because its source table is not chosen until
task 4.2 (D10). An attachment silently hung on a document that does not exist is worse than a
blocked upload, and phase 4 must replace this function regardless. Recorded as work phase 4 owns.

#### Why there is no fourth (viewer_restricted) policy

Sibling tables carry a RESTRICTIVE `viewer_restricted` policy. Its absence here is deliberate and
is not a gap: SELECT is already limited to admin/accountant/manager and a viewer-only user holds
none of those, so the restrictive policy would exclude nobody who is not already excluded. Adding
it would also break the acceptance count of 3.

#### Reviewers

```
Observer (code quality):   PASS
  One polymorphic table as A3 requires, not one per document kind. The existing
  payment_receipt_documents is left alone rather than migrated, so there is no half-finished
  second store. No dead branch: the 'dual' arm raises rather than falling through.

Software Engineer:         PASS
  No FK is possible (document_id points into a different table per document_type), so the
  BEFORE INSERT/UPDATE trigger is the integrity mechanism and it fires on exactly the two
  columns that matter. UNIQUE(storage_path) stops the same uploaded object being attached
  twice. UPDATE is impossible by construction rather than by convention. The format() call
  interpolates only a literal from a fixed CASE, never user input.

Security Engineer:         PASS
  RLS enabled, 3 policies, no UPDATE path at all. INSERT additionally requires
  uploaded_by = auth.uid(), so a caller cannot attribute an upload to someone else - the same
  rule audit-trigger-spec sets for actor_id. DELETE is admin-only. ocr_payload will hold OCR
  text in phase 7 and is readable only by the three finance roles. No sensitive data in error
  text: the messages name the document type and uuid, never party data.
```


### Task 1.6 - immutability on posted entries
```
Scope:      supabase/migrations/
Effort:     M
Migration:  20260818157000_343_posted_entry_immutability.sql
Rollback:   docs/verification/343-down.sql  (WARNING: re-opens editing of posted entries)
Started/Finished: 2026-08-18

Acceptance (verbatim from MASTER-CHECKLIST):
  UPDATE journal_entries SET description='x' WHERE status='posted';   -> raises P0001

Actual:
  ERROR (Persian): "a posted document cannot be changed; issue a reversing document"
  SQLSTATE P0001, raised by tg_journal_entry_immutable()

Verdict:    PASS
```

#### Full behaviour matrix (BEGIN..ROLLBACK)

```
UPDATE a posted entry                 -> P0001
DELETE a posted entry                 -> P0001
UPDATE a LINE of a posted entry       -> P0001   (line trigger reads the parent's status)
DELETE a LINE of a posted entry       -> P0001
UPDATE a DRAFT entry                  -> allowed
draft -> posted transition            -> allowed (the check reads OLD.status, not NEW.status)
UPDATE after that transition          -> P0001   (frozen from the moment it is posted)
rows persisted after ROLLBACK         -> 1 entry, 2 lines (unchanged)
```

#### KNOWN INTERACTION with post_receipt_accounting - recorded, not worked around

`post_receipt_accounting` has an idempotent ELSE branch that UPDATEs an EXISTING journal entry's
`payer_accounting_code` / `receiver_accounting_code`. That entry is `posted`, so that branch now
raises P0001. It is reachable only when a journal entry exists while the receipt's
`posting_status` is not yet 'posted' - i.e. after a partial failure. The normal path INSERTs a
new entry and is unaffected.

It was NOT exempted. audit-trigger-spec contemplates no exemptions, and an exemption would be a
bypass path around the guarantee this task exists to create. Phase 2 replaces this function
anyway (D12 keeps the old path alive only until task 6.9).

>>> OG-11: remove that back-fill branch, or allow it to edit a posted entry?

#### Note on the mandatory-audit half of this task

The task title pairs immutability with mandatory audit. Immutability is enforced here, in the
database. The audit half is per-RPC and in-transaction (audit-trigger-spec section 2), so it is
realised by create_receipt / create_payment / create_dual_document in phases 2-4 and is verified
there, not here. Recorded so the gap is visible rather than assumed done.

#### Reviewers

```
Observer:            PASS - two small triggers, no duplication of an existing mechanism, no
                     dead branch. The RETURN CASE TG_OP handles DELETE correctly (returning
                     OLD), which a naive RETURN NEW would have got wrong on DELETE.
Software Engineer:   PASS - a trigger, not RLS, precisely because an RLS UPDATE matching no
                     rows returns success and the caller reads it as done; this database
                     already has that failure mode on payment_receipts. The line trigger reads
                     the PARENT status, so a line cannot be edited out from under a posted
                     entry. draft->posted still works, so nothing legitimate is blocked.
Security Engineer:   PASS - both functions carry SET search_path TO 'public'. SECURITY INVOKER
                     is correct here: the rule must apply to every caller, and making it
                     DEFINER would not add protection. No data in the error text.
```

### Task 1.7 - seed role_permissions for the new module
```
Scope:      supabase/migrations/
Effort:     S
Migration:  20260818158000_344_seed_ledger_documents_module.sql
Rollback:   docs/verification/344-down.sql  (CAUTION: deleting the rows re-OPENS the module)
Started/Finished: 2026-08-18

Acceptance (verbatim from MASTER-CHECKLIST):
  SELECT count(DISTINCT role_name) FROM role_permissions WHERE module='<new>';
  equals the total distinct role count

Actual:
  module 'ledger-documents' -> 7
  total distinct roles      -> 7        EQUAL

Verdict:    PASS
```

#### Seeded matrix

```
role                 view create update delete export
admin                 t     t      f      t      t
accountant            t     t      f      f      t
manager               f     f      f      f      f
purchase_specialist   f     f      f      f      f
sales                 f     f      f      f      f
site                  f     f      f      f      f
viewer                f     f      f      f      f
```

`can_update` is false for everyone including admin, because posted documents are immutable (D11)
and correction is by reversal. `can_approve` is false for everyone because approval was removed
(T1). Rows are inserted for every role that exists, from
`SELECT DISTINCT role_name FROM role_permissions`, so the set cannot drift from reality.

#### The module name is my choice - it needs confirming

MASTER-CHECKLIST 1.7 and audit-trigger-spec section 5 both write the module name as a
placeholder. Nothing in the programme docs fixes it. 'ledger-documents' follows the existing
kebab-case convention (asan-export, audit-logs, price-lists).

>>> OG-12: is 'ledger-documents' correct? This matters more than it looks: an unseeded module is
OPEN to every role, so if phase 6's wizard registers a different string, THAT string is open
until it too is seeded.

>>> OG-13: audit-trigger-spec section 4 lets `manager` SELECT document_attachments, while
section 5 gives manager nothing here. Different mechanisms, so they can legitimately differ -
but should manager get can_view to match?

#### Reviewers

```
Observer:            PASS - seeds from the live role list rather than a hardcoded array, so it
                     cannot drift. Idempotent via NOT EXISTS, so re-running is safe.
Software Engineer:   PASS - the INSERT..SELECT is a single statement, so partial seeding is
                     impossible. The verify block asserts equality with the live role count
                     rather than the literal 7.
Security Engineer:   PASS - this task IS the security control: an unseeded module is open to
                     all roles, so seeding closes a default-open hole. Explicit all-false rows
                     rather than absence, exactly as section 5 requires. The down file carries
                     a caution that rolling back re-opens the module.
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
