# TPC-I-007-IMPLEMENTATION — Controlled DB Insert Bridge Implementation

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** ACCEPTED — approved for controlled bridge implementation  
**Owner:** محمدرضا افرا  
**Technical Owner:** خانم پورچیستا  
**Reviewer:** Platform review  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Goal

Define the controlled implementation boundary for writing only validated mock output rows to the verified database table.

This packet is docs-only.

It must not implement code yet.

---

## 2. Background

TPC-I-007 planning was accepted.

The verified table is:

```text
public.automation_driver_outputs
```

The existing worker contract already shapes output rows through:

```text
build_controlled_driver_output_row(...)
```

TPC-I-007-IMPLEMENTATION narrows the next implementation step before any code change.

---

## 3. Preconditions

This packet may proceed only after:

```text
TPC-I-003 database migration apply evidence = recorded
TPC-I-004 mock output persistence = accepted
TPC-I-005 controlled output insert contract = accepted
TPC-I-006 worker output evidence = recorded
TPC-I-007 bridge planning = accepted
```

---

## 4. Scope

The future implementation may add only:

```text
A database bridge method inside the worker data client boundary
A strict guard that accepts only mock shaped output
A unit test for the bridge contract without production credentials
An evidence file for review
```

No real source execution is allowed.

---

## 5. Proposed Implementation Boundary

The bridge may add a method shape similar to:

```text
insert_controlled_driver_output(row: dict) -> dict
```

The method must accept only rows already produced by:

```text
build_controlled_driver_output_row(...)
```

The method must reject:

```text
non-mock driver_name
non-mock source_kind
non-MOCK_DRIVER_RUN job_type
invalid status
non-object output
non-array errors
missing job_id
```

---

## 6. Credential And Security Rules

Rules:

```text
No credentials committed to GitHub
No .env contents in docs
No service-role key in browser code
No UI direct write path
No API route in this packet
No RLS change
No migration change
```

If an integration test is needed, it must be operator-approved and must not record secrets.

---

## 7. Allowed Files For Future Implementation

Only these paths may be modified or created:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/tests/test_db_insert_bridge_contract.py
automation/worker-runtime/README.md
docs/baseline/TPC_I_007_DB_INSERT_BRIDGE_EVIDENCE_2026_06_08.md
```

Optional docs-only update:

```text
docs/automation/task-packets/TPC-I-007-IMPLEMENTATION-controlled-db-insert-bridge.md
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

Required command shape:

```powershell
1. cd automation/worker-runtime
2. python -m pip install -e .[dev]
3. python -m pytest -q
```

Tests must prove:

```text
valid mock row is accepted by bridge contract
non-mock driver is rejected
non-mock source_kind is rejected
non-mock job_type is rejected
invalid status is rejected
missing job_id is rejected
unit tests do not need production credentials
unit tests do not need external network
```

---

## 10. Evidence Requirements

Future evidence must include:

```text
Changed files
Test command used
Test result summary
Credential handling review
No-secret review
No UI change review
No migration review
No real source integration review
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

Only after this packet is accepted, the next PR may implement the controlled bridge inside the allowed files.

Real source execution remains forbidden.

---

## 14. Approval / Sign-off

Owner: محمدرضا افرا — approved  
Reviewer: Platform review — reviewed  

Decision: TPC-I-007-IMPLEMENTATION is accepted as the controlled bridge implementation boundary.

Next allowed PR: controlled bridge implementation inside the allowed files only.

No UI implementation, new migration, API route, real source integration, external source call, or production automation is allowed in the next implementation PR.

---

## 15. Final Decision

```text
TPC-I-007-IMPLEMENTATION may define the controlled bridge implementation boundary.
Implementation may proceed only inside the allowed files.
No migration.
No UI.
No real source call.
```
