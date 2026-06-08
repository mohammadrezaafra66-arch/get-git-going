# TPC-I-009-IMPLEMENTATION — Live Insert Bridge Implementation

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** ACCEPTED — approved for controlled live insert bridge implementation  
**Owner:** محمدرضا افرا  
**Technical Owner:** خانم پورچیستا  
**Reviewer:** Platform review  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Goal

Define the implementation boundary for the first controlled live insert bridge.

This packet is docs-only.

It must not implement code yet.

---

## 2. Background

TPC-I-009 planning was accepted.

The only allowed target table for the future implementation is:

```text
public.automation_driver_outputs
```

The only allowed input shape is the validated row produced by:

```text
build_controlled_driver_output_row(...)
```

---

## 3. Preconditions

This packet may proceed only after:

```text
TPC-I-003 migration apply evidence = recorded
TPC-I-004 mock output persistence = accepted and tested
TPC-I-005 controlled output insert contract = accepted and tested
TPC-I-006 worker output evidence = recorded
TPC-I-007 controlled bridge implementation = merged and tested
TPC-I-008 live insert gate evidence = recorded
TPC-I-009 live insert bridge planning = accepted
```

---

## 4. Scope

The future implementation may add only:

```text
A guarded live insert method inside the worker data client boundary
A strict mock-only guard before insert
A unit test proving invalid rows are rejected before any live path
A separate operator-approved integration evidence path if needed
An evidence file for review
```

No real source execution is allowed.

---

## 5. Proposed Implementation Boundary

The bridge may add a method shape similar to:

```text
insert_live_controlled_driver_output(row: dict) -> dict
```

The method must accept only rows already validated by:

```text
validate_controlled_driver_output_row(row)
```

Allowed values remain:

```text
driver_name = mock
job_type = MOCK_DRIVER_RUN
source_kind = mock
phase_label = PHASE-1
```

---

## 6. Credential And Security Rules

Rules:

```text
No credentials committed to GitHub
No .env contents in docs
No connection strings in docs
No service-role key in browser code
No UI direct write path
No API route in this packet
No RLS change
No migration change
Worker environment only for any database credential
```

If any credential boundary needs to change, stop and create an ADR.

---

## 7. Allowed Files For Future Implementation

Only these paths may be modified or created:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/tests/test_live_insert_bridge_contract.py
automation/worker-runtime/README.md
docs/baseline/TPC_I_009_LIVE_INSERT_BRIDGE_EVIDENCE_2026_06_08.md
```

Optional docs-only update:

```text
docs/automation/task-packets/TPC-I-009-IMPLEMENTATION-live-insert-bridge.md
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
any real source integration
```

If any forbidden file must change, stop and create a new packet or ADR.

---

## 9. Test Plan For Future Implementation

Required unit test command:

```powershell
1. cd automation/worker-runtime
2. python -m pip install -e .[dev]
3. python -m pytest -q
```

Tests must prove:

```text
valid mock row is accepted by live insert bridge contract
non-mock driver is rejected
non-mock source_kind is rejected
non-mock job_type is rejected
invalid status is rejected
missing job_id is rejected
unit tests do not need production credentials
unit tests do not need external network
```

Integration testing, if added later, must be operator-approved and must not record secrets.

---

## 10. Evidence Requirements

Future evidence must include:

```text
Changed files
Unit test command used
Unit test result summary
Credential handling review
No-secret review
No UI change review
No migration review
No real source integration review
Operator-approved integration result, if performed
```

---

## 11. Stop Conditions

Stop immediately if:

```text
Any UI file is changed
Any migration is added
Any API route is added
Any real source call is added
Any secret is recorded
Tests require production credentials
External source network is required
```

---

## 12. Acceptance Criteria

This packet is accepted only when:

```text
Implementation boundary is defined
Allowed files are defined
Forbidden files are defined
Security constraints are clear
No implementation is included in this PR
No migration is included
No UI is changed
No real source integration is added
No secret is recorded
```

---

## 13. Next Step After Acceptance

Only after this packet is accepted, the next PR may implement the controlled live insert bridge inside the allowed files.

Real source execution remains forbidden.

---

## 14. Approval / Sign-off

Owner: محمدرضا افرا — approved  
Reviewer: Platform review — reviewed  

Decision: TPC-I-009-IMPLEMENTATION is accepted as the controlled live insert bridge implementation boundary.

Next allowed PR: controlled live insert bridge implementation inside the allowed files only.

No UI implementation, new migration, API route, real source integration, external source call, or production automation is allowed in the next implementation PR.

---

## 15. Final Decision

```text
TPC-I-009-IMPLEMENTATION may define the controlled live insert bridge implementation boundary.
Implementation may proceed only inside the allowed files.
No migration.
No UI.
No real source call.
```
