# TPC-I-003 Supabase Output Migration Evidence — 2026-06-08

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet:** TPC-I-003 — Supabase Output Migration  
**Status:** MIGRATION PR READY FOR REVIEW  
**Source of Truth:** GitHub  
**Reviewer:** Platform review

---

## 1. Summary

This PR implements the first output persistence migration for Worker Runtime driver results.

It adds one table only:

```text
public.automation_driver_outputs
```

No UI, worker code, API route, real source integration, or production automation is introduced.

---

## 2. Migration File

```text
supabase/migrations/20260608091000_phase1_automation_driver_outputs.sql
```

---

## 3. Table Contract

Table:

```text
public.automation_driver_outputs
```

Columns:

```text
id uuid primary key
job_id uuid not null
run_id uuid null
driver_name text not null
job_type text not null
status text not null
output jsonb not null default '{}'
checkpoint jsonb null
errors jsonb not null default '[]'
source_kind text not null default 'mock'
phase_label text not null default 'PHASE-1'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

---

## 4. Relationships

```text
automation_driver_outputs.job_id -> automation_jobs.id
automation_driver_outputs.run_id -> automation_job_runs.id
```

Delete behavior:

```text
job_id ON DELETE CASCADE
run_id ON DELETE SET NULL
```

---

## 5. Constraints

```text
status in COMPLETED, FAILED, SKIPPED
source_kind in mock, internal, external_read_only
phase_label in BASELINE, PHASE-0, PHASE-1, FUTURE
driver_name format: lowercase snake_case-like key
output must be a JSON object
errors must be a JSON array
job_type must not be blank
```

---

## 6. Indexes

```text
idx_automation_driver_outputs_job_created
idx_automation_driver_outputs_run_created
idx_automation_driver_outputs_driver_status
idx_automation_driver_outputs_source_kind
```

---

## 7. RLS / Security

RLS is enabled.

Read policy:

```text
automation_driver_outputs_select_admin_manager
```

Read access is limited to authenticated admin/manager users using the existing role helper pattern:

```text
public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])
```

No INSERT/UPDATE/DELETE policies are created for authenticated users.

Worker writes must go through service-role server routes or approved RPCs in future packets.

---

## 8. Apply Evidence

This PR creates the migration file.

Database apply has not been executed by this review assistant.

The operator must apply and verify the migration in the target Supabase/LAN environment before accepting production use.

Required verification SQL:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'automation_driver_outputs';
```

RLS check:

```sql
select relname, relrowsecurity
from pg_class
where relname = 'automation_driver_outputs';
```

Column check:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'automation_driver_outputs'
order by ordinal_position;
```

Policy check:

```sql
select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'automation_driver_outputs';
```

---

## 9. Rollback

Manual rollback if no production data exists:

```sql
drop table if exists public.automation_driver_outputs cascade;
```

If production data exists, rollback must be reviewed manually before execution.

---

## 10. Scope Verification

Confirmed:

```text
No real Torob extraction
No real Google Maps extraction
No Divar
No WhatsApp
No Instagram
No OCR/STT
No AI production
No Playwright
No Selenium
No external website calls
No Redis
No RabbitMQ
No UI implementation
No new API route
No worker code change
No parallel Core
No parallel database
No parallel admin panel
No hardcoded secret
No production schedule
```

---

## 11. Known Limitation

This migration only creates the output table.

It does not:

```text
Insert real outputs
Wire Worker Runtime to Supabase output persistence
Create API endpoints
Expose UI output display
Run Torob extraction
Run any external source
```

---

## 12. Next Allowed Packet

After this migration is reviewed and applied, the next packet should be:

```text
TPC-I-004 — Mock Output Persistence Wiring
```

Real Torob execution is still forbidden.

---

## 13. Final Decision

```text
TPC-I-003 implementation = READY FOR REVIEW
Migration file exists
Database apply evidence = pending operator execution
Production automation = still forbidden
```
