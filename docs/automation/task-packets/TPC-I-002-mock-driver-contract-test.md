# TPC-I-002 — Mock Driver Contract Test

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Technical Owner:** خانم پورچیستا  
**Reviewer:** Platform review  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Goal

Define and test the first Driver Contract for the Python Worker Runtime using a mock-only driver.

This packet must not implement any real Torob, Google Maps, Divar, WhatsApp, Instagram, OCR/STT, AI production, migration, or UI.

---

## 2. Why This Packet Exists

TPC-I-001 created the minimal Worker Runtime skeleton.

The next architectural risk is driver inconsistency.

If every future automation module implements its own shape, the platform will turn back into a set of scattered scripts.

TPC-I-002 prevents that by defining one small driver contract and validating it with a mock driver only.

---

## 3. Scope

This packet may add only:

```text
automation/worker-runtime/src/drivers/
automation/worker-runtime/src/drivers/__init__.py
automation/worker-runtime/src/drivers/base.py
automation/worker-runtime/src/drivers/mock_driver.py
automation/worker-runtime/src/driver_registry.py
automation/worker-runtime/tests/test_driver_contract.py
```

It may also modify these existing files only if required:

```text
automation/worker-runtime/src/job_runner.py
automation/worker-runtime/README.md
```

Allowed behavior:

```text
Define a Driver Protocol or abstract base class
Define DriverResult shape
Define driver lifecycle methods
Register a mock driver
Run mock driver through JobRunner
Save mock checkpoint
Return mock output
Test contract compliance
```

---

## 4. Out of Scope

The following are forbidden:

```text
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
Supabase migration
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

## 5. Required Driver Contract

The driver contract must be small and stable.

Recommended minimum interface:

```text
validate_input(job: dict) -> None
prepare(job: dict) -> None
run(job: dict, context: DriverContext) -> DriverResult
cleanup(job: dict) -> None
```

Recommended result shape:

```text
status
output
checkpoint
errors
```

Recommended status values:

```text
COMPLETED
FAILED
SKIPPED
```

---

## 6. Mock Driver Requirements

The mock driver must:

```text
Run without network
Run without browser
Run without secrets
Return deterministic output
Save a checkpoint through the worker store
Emit structured logs through JobRunner or logger boundary
Be usable from tests
```

The mock driver must not:

```text
Call Torob
Call Google Maps
Call any external website
Use Playwright
Use Selenium
Create migration
Change UI
```

---

## 7. Allowed Files

Only these paths may be created or modified:

```text
automation/worker-runtime/src/drivers/__init__.py
automation/worker-runtime/src/drivers/base.py
automation/worker-runtime/src/drivers/mock_driver.py
automation/worker-runtime/src/driver_registry.py
automation/worker-runtime/src/job_runner.py
automation/worker-runtime/tests/test_driver_contract.py
automation/worker-runtime/README.md
docs/automation/task-packets/TPC-I-002-mock-driver-contract-test.md
```

Optional evidence file:

```text
docs/baseline/TPC_I_002_MOCK_DRIVER_CONTRACT_EVIDENCE_2026_06_08.md
```

---

## 8. Forbidden Files

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
any production automation module outside automation/worker-runtime/
```

If any forbidden file must change, stop and create a new packet or ADR.

---

## 9. Implementation Plan

### Step 1 — Add driver package

Create:

```text
automation/worker-runtime/src/drivers/
```

### Step 2 — Define base contract

Create:

```text
automation/worker-runtime/src/drivers/base.py
```

It should define:

```text
DriverContext
DriverResult
WorkerDriver Protocol or ABC
```

### Step 3 — Add mock driver

Create:

```text
automation/worker-runtime/src/drivers/mock_driver.py
```

The mock driver must return deterministic mock output only.

### Step 4 — Add driver registry

Create:

```text
automation/worker-runtime/src/driver_registry.py
```

It should map driver names to driver classes.

### Step 5 — Wire JobRunner to mock driver

`job_runner.py` may be updated to call the mock driver when `job.type == MOCK_DRIVER_RUN`.

No real driver dispatch is allowed.

### Step 6 — Add tests

Create:

```text
automation/worker-runtime/tests/test_driver_contract.py
```

Tests must prove:

```text
Mock driver validates input
Mock driver returns deterministic result
Driver registry resolves mock driver
JobRunner can run mock driver
Checkpoint is saved
No external call is required
```

---

## 10. Test Plan

Required commands:

```powershell
1. cd automation/worker-runtime
2. python -m pip install -e .
3. pytest
```

Tests must not require:

```text
Real Supabase secret
Real Torob URL
Real Google Maps URL
External network
Browser automation
```

---

## 11. Acceptance Criteria

This packet is accepted only when:

```text
Driver base contract exists
Mock driver exists
Driver registry exists
JobRunner can run mock driver
Tests pass
No real driver exists
No external platform call exists
No migration exists
No UI change exists
No secret is committed
Evidence is attached
```

---

## 12. Required Evidence

The implementation PR must include:

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

## 13. Stop Conditions

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
The mock driver starts behaving like a real scraper
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

## 15. Rollback Plan

If this packet fails:

```text
Revert the implementation PR
Remove drivers package
Keep real Torob execution blocked
Do not proceed to migration or real source integration
Create a review note explaining why it failed
```

---

## 16. Next Packet After Acceptance

Only after TPC-I-002 is accepted, the next packet may be opened:

```text
TPC-I-003 — Supabase Output Migration
```

Real Torob execution is still forbidden after TPC-I-002.

---

## 17. Final Decision

```text
TPC-I-002 may define and test a mock-only driver contract.
No real automation.
No real source call.
No migration.
No UI.
```
