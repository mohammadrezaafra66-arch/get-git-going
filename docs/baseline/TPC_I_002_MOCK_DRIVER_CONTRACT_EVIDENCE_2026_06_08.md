# TPC-I-002 Mock Driver Contract Evidence — 2026-06-08

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet:** TPC-I-002 — Mock Driver Contract Test  
**Status:** ACCEPTED — implementation evidence recorded  
**Source of Truth:** GitHub  
**Reviewer:** Platform review

---

## 1. Summary

TPC-I-002 implements a mock-only driver contract for the existing Python Worker Runtime skeleton.

No real source integration is introduced.

---

## 2. Files Added / Modified

```text
automation/worker-runtime/README.md
automation/worker-runtime/src/driver_registry.py
automation/worker-runtime/src/drivers/__init__.py
automation/worker-runtime/src/drivers/base.py
automation/worker-runtime/src/drivers/mock_driver.py
automation/worker-runtime/src/job_runner.py
automation/worker-runtime/tests/test_driver_contract.py
```

---

## 3. Local Validation Result

A local reconstruction of the worker-runtime test surface was executed to validate the mock driver contract.

Command shape:

```powershell
1. cd automation/worker-runtime
2. python -m pytest -q
```

Observed result:

```text
5 passed
```

Validated behavior:

```text
DriverResult validates allowed statuses
MockDriver validates allowed job input
MockDriver rejects non-mock driver job types
MockDriver returns deterministic output
DriverRegistry resolves the mock driver
JobRunner can run a MOCK_DRIVER_RUN job
Checkpoint is saved
Structured run events are written through the mock store
```

---

## 4. Scope Verification

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
No Supabase migration
No RLS change
No UI implementation
No new API route
No parallel Core
No parallel database
No parallel admin panel
No hardcoded secret
No production schedule
```

---

## 5. Known Limitation

The current driver contract is mock-only.

It does not yet include:

```text
Real database locking
Real Supabase output tables
Real source adapters
Torob read-only extraction
Google Maps extraction
UI output display
Production scheduling
```

These must be introduced only through future approved packets.

---

## 6. Next Allowed Packet

The next allowed packet is:

```text
TPC-I-003 — Supabase Output Migration
```

Real Torob execution is still forbidden after TPC-I-002.

---

## 7. Approval / Sign-off

Owner: محمدرضا افرا — approved  
Reviewer: Platform review — reviewed  

Decision: TPC-I-002 is accepted as mock-only driver contract implementation.

Next allowed PR: docs-only definition and approval of TPC-I-003 — Supabase Output Migration.

No real Torob, Google Maps, Divar, WhatsApp, Instagram, OCR/STT, AI, UI implementation, or real source integration is allowed yet.

---

## 8. Final Decision

```text
TPC-I-002 = ACCEPTED
Mock Driver Contract = implemented in mock-only mode
Production automation = still forbidden
Next step = define and approve TPC-I-003
```
