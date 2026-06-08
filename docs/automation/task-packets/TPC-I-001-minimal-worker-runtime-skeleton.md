# TPC-I-001 — Minimal Worker Runtime Skeleton

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** ACCEPTED — approved via PR #40  
**Owner:** محمدرضا افرا  
**Technical Owner:** خانم پورچیستا  
**Reviewer:** Platform review  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Goal

Create the minimal Python Worker Runtime skeleton for Phase 1 Implementation Track.

This packet must create only the runtime skeleton.

It must not implement any real automation, real driver, real Torob extraction, Google Maps extraction, Divar, WhatsApp, Instagram, OCR/STT, or AI production.

---

## 2. Why This Packet Exists

Phase 1 planning is accepted, but implementation has not started.

Before any real module is built, the platform needs a controlled Worker Runtime foundation.

Without this, future modules will become separate scripts instead of controlled platform plugins.

This packet creates the minimum structure needed for:

```text
Worker startup
Config loading
Structured logging
Supabase client wrapper
Job claim skeleton
Heartbeat skeleton
Checkpoint skeleton
Job runner skeleton
Graceful shutdown skeleton
Mock/test mode
```

---

## 3. Scope

This packet may create:

```text
automation/worker-runtime/
automation/worker-runtime/README.md
automation/worker-runtime/.env.example
automation/worker-runtime/pyproject.toml
automation/worker-runtime/src/
automation/worker-runtime/tests/
```

Allowed Python modules:

```text
src/main.py
src/config.py
src/logger.py
src/supabase_client.py
src/job_claim.py
src/heartbeat.py
src/checkpoint.py
src/job_runner.py
src/shutdown.py
tests/test_worker_contract.py
```

Allowed behavior:

```text
Load config from environment variables
Initialize structured logging
Provide Supabase client wrapper
Provide job claim function skeleton
Provide heartbeat function skeleton
Provide checkpoint save/load function skeleton
Provide job runner skeleton
Provide graceful shutdown structure
Run in mock mode without real secrets
Run tests without external platform calls
```

---

## 4. Out of Scope

The following are forbidden in this packet:

```text
Real Torob extraction
Google Maps extraction
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
New Supabase migration
RLS change
UI implementation
New API route
Parallel Core
Parallel database
Parallel admin panel
Hardcoded secret
Production schedule
```

---

## 5. Allowed Files

Only these paths may be created or modified:

```text
automation/worker-runtime/README.md
automation/worker-runtime/.env.example
automation/worker-runtime/pyproject.toml
automation/worker-runtime/src/main.py
automation/worker-runtime/src/config.py
automation/worker-runtime/src/logger.py
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/src/job_claim.py
automation/worker-runtime/src/heartbeat.py
automation/worker-runtime/src/checkpoint.py
automation/worker-runtime/src/job_runner.py
automation/worker-runtime/src/shutdown.py
automation/worker-runtime/tests/test_worker_contract.py
docs/automation/task-packets/TPC-I-001-minimal-worker-runtime-skeleton.md
```

Optional metadata update:

```text
docs/automation/PHASE1_TASK_PACKET_INDEX.md
```

Only if needed to register TPC-I-001 status.

---

## 6. Forbidden Files

Do not change:

```text
src/routes/
src/components/
src/lib/
supabase/migrations/
automation/openapi/
openapi/
package.json
pnpm-lock.yaml
vite.config.*
tanstack router generated files
any UI file
any production automation module
```

If a forbidden file must change, stop and create a new packet or ADR.

---

## 7. ADR References

This packet must comply with:

```text
get-git-going = Control Plane / Core
Supabase/PostgreSQL = Source of Truth
React/TanStack/Lovable = UI only
Python Worker Runtime = separate
Plugins/Drivers live inside Worker Runtime
No parallel Core
No parallel database
No parallel API
No parallel admin panel
No real automation without packet approval
```

No new ADR is required if the packet stays inside the allowed scope.

New ADR is required if:

```text
Redis is introduced
RabbitMQ is introduced
A new API layer is introduced
A new database is introduced
Worker talks to a real external platform
UI implementation is added
```

---

## 8. Implementation Plan

### Step 1 — Create Worker Runtime folder

Create:

```text
automation/worker-runtime/
```

### Step 2 — Add README

README must explain:

```text
Purpose
Scope
Out of scope
How to run in mock mode
Required environment variables
How to run tests
What this worker does not do yet
```

### Step 3 — Add .env.example

Only placeholders are allowed.

Example:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
WORKER_ID=local-worker-001
WORKER_MODE=mock
LOG_LEVEL=INFO
```

No real secret may appear.

### Step 4 — Add pyproject.toml

Use minimal dependencies only.

Do not add Playwright/Selenium in this packet.

### Step 5 — Add config module

Config module must:

```text
Read env variables
Validate required variables
Support mock mode
Never print secrets
```

### Step 6 — Add logger module

Logger must:

```text
Use structured logs
Include worker_id
Include job_id when available
Include event name
Avoid logging secrets
```

### Step 7 — Add Supabase client wrapper

Wrapper must:

```text
Initialize client only when not in pure mock mode
Expose safe methods
Avoid direct raw usage across code
```

### Step 8 — Add job claim skeleton

Job claim must be a skeleton only.

It may define function signatures and mock behavior.

No production DB locking logic is required yet.

### Step 9 — Add heartbeat skeleton

Heartbeat must define the function shape.

In mock mode it may print structured log.

### Step 10 — Add checkpoint skeleton

Checkpoint must define:

```text
save_checkpoint()
load_checkpoint()
```

In mock mode it may use in-memory or temp data only.

### Step 11 — Add job runner skeleton

Job runner must:

```text
Accept a job object
Run a mock handler
Emit logs
Call checkpoint function
Return completed mock status
```

### Step 12 — Add graceful shutdown skeleton

Define:

```text
handle_sigterm()
handle_sigint()
shutdown_requested flag
```

### Step 13 — Add tests

Tests must prove:

```text
Config loads in mock mode
Logger initializes
Job runner can run mock job
Checkpoint save/load shape works
No external website call exists
No real Torob/Google/Divar module exists
```

---

## 9. Test Plan

Required commands:

```powershell
1. cd automation/worker-runtime
2. python -m pip install -e .
3. pytest
```

If `pytest` is not yet configured, use the minimum test runner agreed by the repo.

Tests must not require:

```text
Real Supabase secret
Real Torob URL
Real Google Maps URL
External network
Browser automation
```

---

## 10. Acceptance Criteria

This packet is accepted only when:

```text
Worker runtime folder exists
README exists
.env.example exists
Config module exists
Logger module exists
Supabase client wrapper exists
Job claim skeleton exists
Heartbeat skeleton exists
Checkpoint skeleton exists
Job runner skeleton exists
Graceful shutdown skeleton exists
Mock mode works
Tests pass
No real driver exists
No external platform call exists
No migration exists
No UI change exists
No secret is committed
PR evidence is attached
```

---

## 11. Required Evidence

The PR must include:

```text
List of changed files
Test command output
Confirmation that no UI files changed
Confirmation that no migration was created
Confirmation that no real driver was created
Confirmation that no external website call exists
Confirmation that no secret is committed
```

---

## 12. Stop Conditions

Stop immediately if:

```text
A real Torob request is added
A Google Maps request is added
Playwright/Selenium is added
A Supabase migration is added
A UI file is changed
A secret is added
A new API layer is introduced
A parallel core is introduced
Tests require real credentials
```

---

## 13. Owner / Reviewer / Tester

```text
Owner: محمدرضا افرا
Technical Owner: خانم پورچیستا
Reviewer: Platform review
Tester 1: آقای حیدری
Tester 2: آقای طالبی‌زاده
```

Responsibilities:

```text
محمدرضا افرا = final approval and security-sensitive decisions
پورچیستا = technical implementation and code review readiness
حیدری = manual test and evidence collection
طالبی‌زاده = secondary test and UI/non-regression check
```

---

## 14. Rollback Plan

If this packet fails:

```text
Revert the PR
Remove automation/worker-runtime/
Keep Phase 1 Implementation Track locked for real execution
Create a review note explaining why it failed
Do not proceed to Mock Driver
```

---

## 15. Next Packet After Acceptance

Only after TPC-I-001 is accepted, the next packet may be opened:

```text
TPC-I-002 — Mock Driver Contract Test
```

Real Torob execution is still forbidden after TPC-I-001.

---

## 16. Final Decision

```text
TPC-I-001 may build only Minimal Worker Runtime Skeleton.
No real automation.
No real driver.
No external source call.
No migration.
No UI.
```

---

## 17. Approval / Sign-off

Owner: محمدرضا افرا — approved  
Reviewer: Platform review — reviewed  

Decision: TPC-I-001 is accepted as the first Phase 1 implementation packet.

Next allowed PR: Minimal Worker Runtime Skeleton implementation only.

No real Torob, Google Maps, Divar, WhatsApp, Instagram, OCR/STT, AI, migration, or UI implementation is allowed in this PR.
