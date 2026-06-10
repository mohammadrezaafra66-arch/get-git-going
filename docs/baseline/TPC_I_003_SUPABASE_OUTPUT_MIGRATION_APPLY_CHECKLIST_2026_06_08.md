# TPC-I-003 Supabase Output Migration Apply Checklist — 2026-06-08

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet:** TPC-I-003 — Supabase Output Migration  
**Status:** APPLY / VERIFICATION REQUIRED  
**Source of Truth:** GitHub  
**Environment target:** LAN pilot / Supabase target selected by operator

---

## 1. Purpose

PR #47 added the migration file for:

```text
public.automation_driver_outputs
```

However, database apply evidence is still required before the project may proceed to:

```text
TPC-I-004 — Mock Output Persistence Wiring
```

This checklist defines the exact operator verification steps.

---

## 2. Migration File

```text
supabase/migrations/20260608091000_phase1_automation_driver_outputs.sql
```

---

## 3. Preconditions

Before applying the migration, confirm:

```text
PR #47 is merged
Target database is LAN pilot or approved Supabase environment
Database backup policy is understood
No production automation is running
No real Torob / Google Maps / Divar / WhatsApp / Instagram automation is active
```

---

## 4. Apply Command — LAN Docker Path

Use this path only if the target database is the known LAN pilot container.

PowerShell commands:

```powershell
1. git checkout main
2. git pull origin main
3. Get-Content supabase/migrations/20260608091000_phase1_automation_driver_outputs.sql | docker exec -i afrakala-lan-db psql -U postgres -d postgres
```

If your local database user or database name is different, replace:

```text
postgres
```

with the correct operator-approved value.

Do not paste secrets or connection strings into this document.

---

## 5. Apply Command — Supabase CLI Path

Use this only if the project is configured for Supabase CLI migration flow.

PowerShell commands:

```powershell
1. git checkout main
2. git pull origin main
3. supabase migration list
4. supabase db push
```

If Supabase CLI is not configured, do not improvise. Use the LAN Docker path or ask for operator confirmation.

---

## 6. Required Verification SQL

### 6.1 Table existence

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'automation_driver_outputs';
```

Expected:

```text
1 row
public.automation_driver_outputs
```

### 6.2 Column check

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'automation_driver_outputs'
order by ordinal_position;
```

Expected columns:

```text
id
job_id
run_id
driver_name
job_type
status
output
checkpoint
errors
source_kind
phase_label
created_at
updated_at
```

### 6.3 RLS check

```sql
select relname, relrowsecurity
from pg_class
where relname = 'automation_driver_outputs';
```

Expected:

```text
relrowsecurity = true
```

### 6.4 Policy check

```sql
select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'automation_driver_outputs';
```

Expected:

```text
automation_driver_outputs_select_admin_manager
cmd = SELECT
```

### 6.5 Authenticated write policy check

```sql
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'automation_driver_outputs'
  and cmd in ('INSERT', 'UPDATE', 'DELETE');
```

Expected:

```text
0 rows
```

---

## 7. Optional Controlled Mock Insert Check

Only run this in LAN/staging if operator approves.

This check should not use any real source data.

It requires a valid existing `automation_jobs.id` from the database.

```sql
-- Replace <job_id> with a valid automation_jobs.id from the LAN/staging database.
insert into public.automation_driver_outputs (
  job_id,
  driver_name,
  job_type,
  status,
  output,
  checkpoint,
  errors,
  source_kind,
  phase_label
)
values (
  '<job_id>'::uuid,
  'mock',
  'MOCK_DRIVER_RUN',
  'COMPLETED',
  '{"message":"mock output verification"}'::jsonb,
  '{"step":"verification","progress":100}'::jsonb,
  '[]'::jsonb,
  'mock',
  'PHASE-1'
);
```

If this optional check is run, clean it up after verification unless the operator wants to keep the row as evidence.

---

## 8. Evidence To Record

Create or update:

```text
docs/baseline/TPC_I_003_SUPABASE_OUTPUT_MIGRATION_APPLY_EVIDENCE_2026_06_08.md
```

Record:

```text
Environment
Apply command path used
Migration file name
Table existence result
Column check result
RLS check result
Policy check result
Authenticated write policy check result
Optional mock insert result, if run
Rollback readiness
Operator name/date
```

Do not record:

```text
Connection strings
Passwords
Service-role keys
.env contents
Docker secrets
```

---

## 9. Rollback

Only if no production data exists:

```sql
drop table if exists public.automation_driver_outputs cascade;
```

If any real or operational data exists, stop and request manual rollback review.

---

## 10. Stop Conditions

Stop immediately if:

```text
Migration fails to apply
Existing automation tables are missing
RLS is not enabled
Authenticated write policies are accidentally created
Unexpected tables are created
Service-role secrets are exposed
Any real source data is inserted
Any UI/API/worker code is changed during apply
```

---

## 11. Gate Decision

TPC-I-004 must remain blocked until apply evidence exists.

```text
TPC-I-003 migration file = merged
TPC-I-003 database apply = pending operator verification
TPC-I-004 = BLOCKED until apply evidence is recorded
```
