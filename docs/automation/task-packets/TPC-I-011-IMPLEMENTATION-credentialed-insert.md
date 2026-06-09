# TPC-I-011-IMPLEMENTATION — Credentialed Insert Implementation

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** ACCEPTED — approved for controlled credentialed insert implementation  
**Owner:** محمدرضا افرا  
**Technical Owner:** خانم پورچیستا  
**Reviewer:** Platform review  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Goal

Define the implementation boundary for the first controlled credentialed insert path.

This packet is docs-only.

It must not implement code yet.

---

## 2. Background

TPC-I-011 planning was accepted.

The only allowed future target table is:

```text
public.automation_driver_outputs
```

The only allowed future row shape is a row already validated by:

```text
validate_controlled_driver_output_row(row)
```

Allowed row values remain:

```text
driver_name = mock
job_type = MOCK_DRIVER_RUN
source_kind = mock
phase_label = PHASE-1
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
TPC-I-009 live bridge guard = merged and tested
TPC-I-010 credential boundary evidence = recorded
TPC-I-011 credentialed insert planning = accepted
```

---

## 4. Scope

The future implementation may add only:

```text
A guarded insert method inside the worker data client boundary
A strict mock-only row guard before any insert call
A unit test proving invalid rows are rejected before any integration path
An optional operator-approved LAN/staging integration evidence path
An evidence file for review
```

No real source execution is allowed.

---

## 5. Proposed Implementation Boundary

The bridge may add a method shape similar to:

```text
insert_credentialed_driver_output(row: dict) -> dict
```

The method must accept only rows already validated by:

```text
validate_controlled_driver_output_row(row)
```

The implementation must reject:

```text
non-mock driver_name
non-mock source_kind
non-MOCK_DRIVER_RUN job_type
invalid status
missing job_id
malformed output
malformed errors
```

---

## 6. Credential And Security Rules

Rules:

```text
No credentials committed to GitHub
No connection strings in docs
No .env contents in docs
No service-role key in browser code
No UI direct write path
No API route in this packet
No RLS change
No migration change
Worker runtime environment only for any future database credential
```

If any credential boundary needs to change, stop and create an ADR.

---

## 7. Allowed Files For Future Implementation

Only these paths may be modified or created:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/tests/test_credentialed_insert_contract.py
automation/worker-runtime/README.md
docs/baseline/TPC_I_011_CREDENTIALED_INSERT_EVIDENCE_2026_06_08.md
```

Optional docs-only update:

```text
docs/automation/task-packets/TPC-I-011-IMPLEMENTATION-credentialed-insert.md
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
valid mock row is accepted by the guarded method
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

Only after this packet is accepted, the next PR may implement the controlled credentialed insert boundary inside the allowed files.

Real source execution remains forbidden.

---

## 14. Approval / Sign-off

Owner: محمدرضا افرا — approved  
Reviewer: Platform review — reviewed

Decision: TPC-I-011-IMPLEMENTATION is accepted as the controlled credentialed insert implementation boundary.

Next allowed PR: controlled credentialed insert implementation inside the allowed files only.

No UI implementation, new migration, API route, real source integration, external source call, or production automation is allowed in the next implementation PR.

---

## 15. Final Decision

```text
TPC-I-011-IMPLEMENTATION may define the controlled credentialed insert implementation boundary.
Implementation may proceed only inside the allowed files.
No migration.
No UI.
No real source call.
```