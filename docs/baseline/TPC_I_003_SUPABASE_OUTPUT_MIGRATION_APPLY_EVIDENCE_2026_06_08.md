# TPC-I-003 Supabase Output Migration Apply Evidence — 2026-06-08

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet:** TPC-I-003 — Supabase Output Migration  
**Status:** APPLIED AND VERIFIED — LAN pilot  
**Source of Truth:** GitHub  
**Operator:** محمدرضا افرا  
**Reviewer:** Platform review

---

## 1. Summary

The TPC-I-003 migration was applied successfully to the LAN pilot database.

Migration file:

```text
supabase/migrations/20260608091000_phase1_automation_driver_outputs.sql
```

Target table:

```text
public.automation_driver_outputs
```

---

## 2. Environment

| Field | Value |
|-------|-------|
| Environment | LAN pilot |
| DB container | `afrakala-lan-db` |
| Database user | `postgres` |
| Database name | `postgres` |
| Apply path | Docker + psql via PowerShell |
| Migration applied | `20260608091000_phase1_automation_driver_outputs.sql` |

No connection strings, passwords, service-role keys, `.env` contents, or Docker secrets were recorded.

---

## 3. Apply Result

Operator command shape:

```powershell
Get-Content .\supabase\migrations\20260608091000_phase1_automation_driver_outputs.sql | docker exec -i afrakala-lan-db psql -U postgres -d postgres
```

Observed output:

```text
BEGIN
CREATE TABLE
COMMENT
COMMENT
COMMENT
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
NOTICE:  trigger "trg_automation_driver_outputs_updated_at" for relation "public.automation_driver_outputs" does not exist, skipping
DROP TRIGGER
CREATE TRIGGER
ALTER TABLE
NOTICE:  policy "automation_driver_outputs_select_admin_manager" for relation "public.automation_driver_outputs" does not exist, skipping
DROP POLICY
CREATE POLICY
COMMIT
```

Result:

```text
Migration applied successfully.
```

---

## 4. Verification — Table Existence

Query:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'automation_driver_outputs';
```

Observed output:

```text
 table_schema |        table_name
--------------+---------------------------
 public       | automation_driver_outputs
(1 row)
```

Result:

```text
PASS
```

---

## 5. Verification — Columns

Query:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'automation_driver_outputs'
order by ordinal_position;
```

Observed output:

```text
 column_name |        data_type         | is_nullable
-------------+--------------------------+-------------
 id          | uuid                     | NO
 job_id      | uuid                     | NO
 run_id      | uuid                     | YES
 driver_name | text                     | NO
 job_type    | text                     | NO
 status      | text                     | NO
 output      | jsonb                    | NO
 checkpoint  | jsonb                    | YES
 errors      | jsonb                    | NO
 source_kind | text                     | NO
 phase_label | text                     | NO
 created_at  | timestamp with time zone | NO
 updated_at  | timestamp with time zone | NO
(13 rows)
```

Result:

```text
PASS — expected 13 columns are present.
```

---

## 6. Verification — RLS

Query:

```sql
select relname, relrowsecurity
from pg_class
where relname = 'automation_driver_outputs';
```

Observed output:

```text
          relname          | relrowsecurity
---------------------------+----------------
 automation_driver_outputs | t
(1 row)
```

Result:

```text
PASS — RLS is enabled.
```

---

## 7. Verification — SELECT Policy

Query:

```sql
select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'automation_driver_outputs';
```

Observed output:

```text
                   policyname                   |  cmd   |      roles
------------------------------------------------+--------+-----------------
 automation_driver_outputs_select_admin_manager | SELECT | {authenticated}
(1 row)
```

Result:

```text
PASS — admin/manager SELECT policy exists for authenticated users.
```

---

## 8. Verification — Authenticated Write Policy Check

Query:

```sql
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'automation_driver_outputs'
  and cmd in ('INSERT', 'UPDATE', 'DELETE');
```

Observed output:

```text
 policyname | cmd
------------+-----
(0 rows)
```

Result:

```text
PASS — no authenticated INSERT/UPDATE/DELETE policy exists.
```

---

## 9. Security Review

Confirmed:

```text
No secrets recorded
No connection strings recorded
No service-role keys recorded
No .env contents recorded
No Docker secrets recorded
No real source data inserted
No UI/API/worker code changed during apply
```

---

## 10. Rollback Readiness

Rollback command if no production data exists:

```sql
drop table if exists public.automation_driver_outputs cascade;
```

If operational or production data exists, rollback requires manual review before execution.

---

## 11. Gate Impact

```text
TPC-I-003 migration file = MERGED
TPC-I-003 database apply = PASS
TPC-I-003 verification = PASS
Issue #49 = ready to close after this evidence PR merges
TPC-I-004 = may be defined after this evidence PR merges
```

---

## 12. Final Decision

```text
TPC-I-003 database apply evidence = RECORDED
Migration applied and verified in LAN pilot
Production automation = still forbidden
Next allowed step after merge = define TPC-I-004 — Mock Output Persistence Wiring
```
