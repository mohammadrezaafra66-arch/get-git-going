# TPC-I-003 — Supabase Output Migration

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** ACCEPTED — approved for migration implementation packet  
**Owner:** محمدرضا افرا  
**Technical Owner:** خانم پورچیستا  
**Reviewer:** Platform review  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Goal

Design and approve the first Supabase/PostgreSQL output migration for Worker Runtime results.

This packet is docs-only. It must not create the migration yet.

The goal is to define exactly what output table(s) are needed before any SQL migration is implemented.

---

## 2. Why This Packet Exists

TPC-I-001 created the minimal Worker Runtime skeleton.

TPC-I-002 created the mock-only Driver Contract.

The next risk is uncontrolled persistence.

If each driver creates its own output shape, the platform will again become inconsistent.

TPC-I-003 prevents that by defining one standard output persistence contract before any migration is created.

---

## 3. Scope

This packet may define only:

```text
Output table purpose
Allowed table name(s)
Allowed columns
Job/run relationship
RLS expectations
Migration file naming rule
Rollback rule
Test plan
Acceptance criteria
Stop conditions
```

Recommended first table:

```text
automation_driver_outputs
```

Recommended relationship:

```text
automation_driver_outputs.job_id -> automation_jobs.id
automation_driver_outputs.run_id -> automation_job_runs.id
```

---

## 4. Out of Scope

The following are forbidden in this packet:

```text
Creating SQL migration
Changing Supabase tables
Changing RLS policies
Changing UI
Changing API routes
Real Torob extraction
Real Google Maps extraction
Divar
WhatsApp
Instagram
OCR/STT
AI production
Playwright
Selenium
External website calls
Redis
RabbitMQ
Parallel Core
Parallel database
Parallel admin panel
Hardcoded secret
Production schedule
```

---

## 5. Proposed Table Contract

Recommended table name:

```text
automation_driver_outputs
```

Recommended columns:

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
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended status values:

```text
COMPLETED
FAILED
SKIPPED
```

Recommended source_kind values:

```text
mock
internal
external_read_only
```

For TPC-I-003 implementation, only `mock` is expected.

---

## 6. RLS / Access Expectations

RLS must be enabled.

Minimum expectation:

```text
Authenticated admin/manager users may read outputs through existing application access rules.
Worker service role may insert outputs.
No anonymous access.
No browser-side service-role key.
```

Exact RLS rules must be reviewed against the existing project Supabase policy pattern before implementation.

---

## 7. Migration Naming Rule

The future migration PR must use a timestamped file under:

```text
supabase/migrations/
```

Name pattern:

```text
YYYYMMDDHHMMSS_phase1_automation_driver_outputs.sql
```

Migration implementation is not allowed in this docs-only packet.

---

## 8. Rollback Rule

The future migration PR must include rollback instructions in evidence.

Minimum rollback expectation:

```text
DROP TABLE IF EXISTS automation_driver_outputs;
```

Only if no production data exists.

If data exists, rollback must be reviewed manually.

---

## 9. Allowed Files For Future Implementation Packet

The future implementation PR may touch only:

```text
supabase/migrations/YYYYMMDDHHMMSS_phase1_automation_driver_outputs.sql
docs/baseline/TPC_I_003_SUPABASE_OUTPUT_MIGRATION_EVIDENCE_2026_06_08.md
```

Optional docs update:

```text
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

---

## 10. Forbidden Files For Future Implementation Packet

Do not change:

```text
src/routes/
src/components/
src/lib/
automation/worker-runtime/src/drivers/
automation/worker-runtime/src/job_runner.py
automation/openapi/
openapi/
package.json
pnpm-lock.yaml
vite.config.*
tanstack router generated files
any UI file
any real source integration
```

If any forbidden file must change, stop and create a new packet or ADR.

---

## 11. Test Plan For Future Implementation

The future migration PR must include evidence for:

```text
Migration applies cleanly
Table exists
automation_driver_outputs has expected columns
RLS is enabled
No real output is inserted from external source
Mock output insert can be demonstrated only through controlled SQL or local test
Rollback instructions are documented
```

Suggested verification SQL:

```sql
select table_name
from information_schema.tables
where table_name = 'automation_driver_outputs';
```

Suggested RLS check:

```sql
select relname, relrowsecurity
from pg_class
where relname = 'automation_driver_outputs';
```

---

## 12. Acceptance Criteria

This packet is accepted only when:

```text
Output table contract is defined
Allowed columns are defined
RLS expectation is defined
Migration naming rule is defined
Rollback rule is defined
Future allowed files are defined
Future forbidden files are defined
No SQL migration is created in this PR
No UI is changed
No worker code is changed
No real source integration is added
```

---

## 13. Stop Conditions

Stop immediately if:

```text
SQL migration is added in this docs-only PR
A real source integration is added
Worker code is changed
UI is changed
API route is changed
Service role key appears in browser code
A parallel database is introduced
A table unrelated to driver output is proposed without ADR
```

---

## 14. Owner / Reviewer / Tester

```text
Owner: محمدرضا افرا
Technical Owner: خانم پورچیستا
Reviewer: Platform review
Tester 1: آقای حیدری
Tester 2: آقای طالبی‌زاده
```

---

## 15. Next Packet After Acceptance

Only after TPC-I-003 is accepted, the next packet may be opened:

```text
TPC-I-003-IMPLEMENTATION — Supabase Output Migration Implementation
```

Real Torob execution is still forbidden after TPC-I-003 docs approval.

---

## 16. Approval / Sign-off

Owner: محمدرضا افرا — approved  
Reviewer: Platform review — reviewed  

Decision: TPC-I-003 is accepted as the Supabase output migration contract.

Next allowed PR: Supabase Output Migration implementation only.

No real Torob, Google Maps, Divar, WhatsApp, Instagram, OCR/STT, AI, UI implementation, worker code change, API route, or real source integration is allowed in the next migration implementation PR.

---

## 17. Final Decision

```text
TPC-I-003 may define and approve the Supabase output migration contract.
Migration implementation may proceed only in the next PR.
No real automation.
No real source call.
No UI.
```
