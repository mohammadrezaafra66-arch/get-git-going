# Phase 2 Automation Driver Outputs Phase Label Migration — 2026-06-13

**Status:** IMPLEMENTATION PR OPEN — apply evidence pending  
**Track:** Phase 2 / Torob limited read-only evidence persistence  
**Scope:** Evidence-table compatibility only.

## Purpose

Allow `PHASE-2` rows in `public.automation_driver_outputs` so approved Torob read-only evidence rows can be persisted after the persistence helper has produced a validated row.

## Migration file

```text
supabase/migrations/20260613123000_phase2_automation_driver_outputs_phase_label.sql
```

## Constraint changed

Existing accepted values:

```text
BASELINE
PHASE-0
PHASE-1
FUTURE
```

New accepted values:

```text
BASELINE
PHASE-0
PHASE-1
PHASE-2
FUTURE
```

## Scope confirmation

This migration changes only the `automation_driver_outputs_phase_label_check` constraint on the evidence table.

It does not alter:

- products,
- prices,
- customers,
- suppliers,
- sales lists,
- purchase prices,
- purchase records,
- CRM records,
- messages,
- scheduler behavior,
- worker execution behavior,
- UI/API routes.

## Guardrails

This migration does not authorize:

- live Torob requests,
- browser automation,
- login/session/cookie use,
- bulk crawl,
- automatic retries,
- business writeback.

## Local apply command

Apply only after review/merge:

```powershell
cd C:\Users\AFRA\AfraKala\get-git-going
supabase db push
```

If using the local Docker database directly, apply the migration file through the existing controlled migration workflow used for prior Phase 2 migrations.

## Verification query

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname = 'automation_driver_outputs_phase_label_check';
```

Expected constraint text includes:

```text
PHASE-2
```

## Acceptance notes

This migration is necessary before real database inserts of Phase 2 Torob read-only evidence rows. It is not itself an insert path.
