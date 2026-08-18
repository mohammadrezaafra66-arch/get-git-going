# Phase <N> — <name> — PROGRESS

Copy to `phase-<N>-PROGRESS.md` at phase start. One per phase. **Fill as you go, not at the end** —
a phase that hits its context limit mid-run must be resumable from this file alone.

## HANDOFF STATE

```
Phase:                1 - Shared foundations
Status:               in progress
Branch:               feature/backend-phase-1
Base:                 staging @ 7197c190
Tasks:                1 of 7
Current task:         1.2
Blocked by:           nothing
Migrations applied:   336
REST restarted after: 336 = yes
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
