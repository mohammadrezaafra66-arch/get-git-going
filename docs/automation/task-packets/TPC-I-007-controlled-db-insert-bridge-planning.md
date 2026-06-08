# TPC-I-007 — Controlled Database Insert Bridge Planning

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** ACCEPTED — approved for controlled database bridge planning  
**Owner:** محمدرضا افرا  
**Technical Owner:** خانم پورچیستا  
**Reviewer:** Platform review  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Goal

Define the first controlled planning packet for a future database insert bridge.

This packet is docs-only.

It must not implement database writes, worker code, UI, API routes, real source integrations, or production automation.

---

## 2. Why This Packet Exists

TPC-I-006 recorded worker-runtime evidence after the controlled output insert contract.

The next architectural risk is connecting worker runtime output to a real database write path without a narrow bridge contract.

TPC-I-007 defines the planning boundary for that bridge before any implementation.

---

## 3. Preconditions

This packet may proceed only after:

```text
TPC-I-003 database migration apply evidence = recorded
TPC-I-004 mock output persistence = accepted
TPC-I-005 controlled output insert contract = accepted
TPC-I-006 worker output evidence = recorded
Issue #59 = closed
```

---

## 4. Scope

This packet may define only:

```text
Bridge goal
Allowed bridge inputs
Allowed table target
Allowed worker boundary
Credential handling rules
Test strategy
Evidence requirements
Rollback/stop conditions
```

---

## 5. Out of Scope

The following are forbidden:

```text
Database write implementation
Worker code implementation
UI implementation
API route implementation
New migration
RLS change
Real source integration
External website calls
Browser automation
Production automation
Hardcoded secret
```

---

## 6. Proposed Bridge Boundary

The future bridge may only write rows shaped by:

```text
build_controlled_driver_output_row(...)
```

to the verified table:

```text
public.automation_driver_outputs
```

Only this controlled shape is allowed:

```text
driver_name = mock
job_type = MOCK_DRIVER_RUN
source_kind = mock
phase_label = PHASE-1
```

No other driver or source kind is allowed in this phase.

---

## 7. Credential Handling Rules

The future implementation must follow:

```text
No credentials committed to GitHub
No .env contents in docs
No service-role key in browser code
No UI direct write path
Worker environment only for any database credential
Operator-controlled local/LAN testing only until approved
```

---

## 8. Allowed Files For Future Implementation

The future implementation packet may define allowed files, but this planning packet suggests the narrowest possible scope:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/tests/test_db_insert_bridge_contract.py
docs/baseline/TPC_I_007_DB_INSERT_BRIDGE_EVIDENCE_2026_06_08.md
```

Optional docs-only update:

```text
docs/automation/task-packets/TPC-I-007-controlled-db-insert-bridge-planning.md
```

---

## 9. Forbidden Files

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
any real source integration
```

If any forbidden file must change, stop and create a new packet or ADR.

---

## 10. Test Strategy For Future Implementation

Future implementation must have two layers:

```text
Unit tests without credentials
Optional operator-approved LAN integration test
```

Unit tests must not require:

```text
Real database connection
Production credentials
External network
Real source data
```

Integration tests, if added later, must not record secrets.

---

## 11. Evidence Requirements

Future evidence must include:

```text
Unit test result
Bridge scope review
Credential handling review
No UI change review
No migration review
No real source integration review
Operator-approved integration result, if performed
```

---

## 12. Stop Conditions

Stop immediately if:

```text
Any implementation is added in this docs-only PR
Any migration is added
Any UI file is changed
Any API route is changed
Any real source call is added
Any secret is recorded
Tests require production credentials
```

---

## 13. Acceptance Criteria

This packet is accepted only when:

```text
Bridge planning scope is defined
Credential rules are defined
Allowed files are defined
Forbidden files are defined
No implementation is included
No migration is included
No UI is changed
No real source integration is added
No secret is recorded
```

---

## 14. Next Packet After Acceptance

Only after TPC-I-007 is accepted, the next packet may be opened:

```text
TPC-I-007-IMPLEMENTATION — Controlled DB Insert Bridge Implementation
```

Real source execution remains forbidden after TPC-I-007.

---

## 15. Approval / Sign-off

Owner: محمدرضا افرا — approved  
Reviewer: Platform review — reviewed  

Decision: TPC-I-007 is accepted as the controlled database insert bridge planning packet.

Next allowed PR: docs-only definition or implementation packet for controlled database bridge only.

No UI implementation, new migration, API route, real source integration, external source call, or production automation is allowed yet.

---

## 16. Final Decision

```text
TPC-I-007 may define controlled database insert bridge planning only.
No implementation.
No migration.
No UI.
No real source call.
Implementation planning may proceed only within the accepted bridge boundary.
```
