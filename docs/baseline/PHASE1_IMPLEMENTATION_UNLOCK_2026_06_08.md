# Phase 1 Implementation Track Unlock Decision — 2026-06-08

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Status:** UNLOCKED FOR FIRST PACKET ONLY  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform review  
**Acceptance type:** Implementation track unlock decision  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Background

Phase 0 has been accepted.

Phase 1 has also been accepted, but only as a planning / governance baseline.

This means Phase 1 did not implement production automation.

The following items are still not implemented:

```text
No real Torob execution
No Worker Runtime implementation
No Driver implementation
No Supabase migration for real output
No UI implementation for real output
No retry/checkpoint real test
No resource usage real test
No production schedule
```

Therefore, before any implementation starts, a new implementation track must be explicitly unlocked.

---

## 2. Final Unlock Decision

```text
Phase 1 Implementation Track = UNLOCKED
Only first implementation packet = UNLOCKED
All other implementation work = LOCKED
Production automation = FORBIDDEN
Real Torob extraction = FORBIDDEN until Worker skeleton and mock driver are accepted
Google Maps real execution = FORBIDDEN
Divar = FORBIDDEN
WhatsApp = FORBIDDEN
Instagram = FORBIDDEN
OCR/STT = FORBIDDEN
AI production = FORBIDDEN
```

---

## 3. First Unlocked Packet

The first unlocked implementation packet is:

```text
TPC-I-001 — Minimal Worker Runtime Skeleton
```

This packet is allowed to create only the minimal Python Worker Runtime skeleton.

It must not implement any real driver or external extraction.

---

## 4. Why Minimal Worker Runtime Comes First

The project must not jump directly to Torob, Google Maps, Divar, WhatsApp, or any real automation.

The correct implementation order is:

```text
1. Minimal Worker Runtime Skeleton
2. Mock Driver Contract Test
3. Supabase Output Migration
4. Torob Limited Driver in Mock Mode
5. Torob Limited Read-Only Real Execution
6. UI Output Display
7. Retry / Failure / Checkpoint Real Test
8. Resource Usage Real Test
9. Evidence Sync
10. Implementation Acceptance
```

Reason:

```text
Without Worker Runtime, every driver becomes a standalone script.
Without Driver Contract, every module becomes custom and inconsistent.
Without mock mode, real extraction becomes risky and hard to test.
Without checkpoint/retry tests, production usage in Iran becomes fragile.
```

---

## 5. Architecture Guardrails

The following architecture decisions remain mandatory:

```text
get-git-going = Control Plane / Core
Supabase/PostgreSQL = Source of Truth
React/TanStack/Lovable = UI only
Python Worker Runtime = separate
Plugins/Drivers live inside Worker Runtime
No Laravel
No parallel Core
No parallel database
No parallel API
No parallel admin panel
No Redis/RabbitMQ without ADR
No production automation without explicit packet approval
```

---

## 6. Allowed Work After This Unlock

Only the following work is allowed:

```text
Create TPC-I-001 task packet
Review TPC-I-001
Approve TPC-I-001
Implement minimal worker runtime skeleton in a separate PR
Run mock tests only
Collect evidence
```

---

## 7. Forbidden Work

The following work is still forbidden:

```text
Real Torob scraping
Real Google Maps extraction
Divar bot
WhatsApp automation
Instagram automation
OCR/STT production
AI production
New Supabase migration without packet
UI implementation without packet
Direct changes to main
Secret handling in browser
External platform calls from UI
Parallel API/Core/DB/Admin
```

---

## 8. Required PR Policy

All work must follow this rule:

```text
No direct commit to main.
Every change must be done through a branch.
Every implementation needs a Task Packet.
Every PR must be reviewed.
Every PR must have evidence.
```

Recommended branch:

```text
docs/phase1-implementation-unlock
```

Recommended PR title:

```text
docs(phase1): unlock implementation track and define minimal worker runtime packet
```

---

## 9. Stop Conditions

Stop immediately if any of the following happens:

```text
A file outside allowed scope is changed
A real driver is created
A real external source is called
A migration is created without a migration packet
A UI page is changed without UI packet
A secret is added to code
A parallel API/Core/DB/Admin is introduced
The implementation tries to skip TPC-I-001 review
```

---

## 10. Acceptance Criteria

This unlock decision is accepted only when:

```text
PHASE1_IMPLEMENTATION_UNLOCK_2026_06_08.md exists
TPC-I-001-minimal-worker-runtime-skeleton.md exists
Both files are docs-only
No code is implemented
No migration is created
No UI is changed
No driver is created
No external call is introduced
PR is reviewed
Owner approves the unlock
```

---

## 11. Final Decision

```text
Phase 1 Implementation Track = UNLOCKED FOR TPC-I-001 ONLY
Next step = write and approve TPC-I-001
Implementation = still blocked until TPC-I-001 is accepted
```
