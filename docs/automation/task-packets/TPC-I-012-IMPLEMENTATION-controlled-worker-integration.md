# TPC-I-012-IMPLEMENTATION — Controlled Worker Integration Packet

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

Define the concrete implementation boundary for the next controlled Worker Runtime integration step after TPC-I-012 was accepted.

This packet is docs-only.

It must not implement code yet.

---

## 2. Background

Completed gates:

```text
TPC-I-011 guarded insert implementation = merged
TPC-I-011 worker-runtime tests = passed
TPC-I-011 test evidence = merged
TPC-I-012 guarded integration gate = accepted
```

TPC-I-012 allowed only a separate concrete implementation packet after acceptance.

This document is that concrete implementation packet.

---

## 3. Scope

This packet may define a future implementation boundary only.

Allowed in this packet:

```text
Define future implementation scope
Define allowed files
Define forbidden files
Define required tests
Define evidence requirements
Define stop conditions
Define operator review gate
```

Not allowed in this packet:

```text
No code implementation
No database write implementation
No credential use
No migration
No RLS change
No UI
No API route
No browser automation
No real source integration
No external source call
No production automation
No secret recording
```

---

## 4. Proposed Future Implementation Boundary

A future implementation PR may add only a guarded Worker Runtime integration boundary.

The future implementation must remain constrained to:

```text
worker runtime only
validated PHASE-1 mock-compatible row shape only
operator-controlled execution path only
no UI write path
no API route
no schema change
no RLS change
no real source execution
```

The future implementation must continue to reject:

```text
non-mock driver_name
non-mock source_kind
non-MOCK_DRIVER_RUN job_type
invalid status
missing job_id
malformed output
malformed errors
non-PHASE-1 row
```

---

## 5. Allowed Files For Future Implementation

Only these paths may be modified or created in the future implementation PR:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/tests/test_controlled_worker_integration_contract.py
automation/worker-runtime/README.md
docs/baseline/TPC_I_012_CONTROLLED_WORKER_INTEGRATION_EVIDENCE_2026_06_09.md
```

Optional docs-only update:

```text
docs/automation/task-packets/TPC-I-012-IMPLEMENTATION-controlled-worker-integration.md
```

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
any real source integration
any production scheduler
```

If any forbidden file must change, stop and create a new packet or ADR.

---

## 7. Test Plan For Future Implementation

Required command:

```powershell
cd automation/worker-runtime
python -m pip install -e ".[dev]"
python -m pytest -q
```

Tests must prove:

```text
valid guarded row is accepted
invalid driver_name is rejected
invalid source_kind is rejected
invalid job_type is rejected
invalid phase_label is rejected
missing job_id is rejected
bad output shape is rejected
bad errors shape is rejected
unit tests do not need production credentials
unit tests do not need external network
```

---

## 8. Evidence Requirements

Future evidence must include:

```text
Changed files
Command used
Test result summary
Worker boundary review
Credential boundary review without exposing secrets
No-secret review
No UI change review
No migration review
No API route review
No real source integration review
No production schedule review
Operator name/date
```

Evidence must not include:

```text
connection strings
access tokens
service-role keys
.env contents
browser session data
customer data
production payload dumps
```

---

## 9. Stop Conditions

Stop immediately if the future implementation requires:

```text
committing secrets
copying .env values into docs
adding UI write path
adding API route
adding migration
changing RLS
calling a real external source
using browser automation
running production schedule
using real customer data
```

---

## 10. Acceptance Criteria

This packet is accepted only when:

```text
Concrete implementation boundary is defined
Allowed files are explicit
Forbidden files are explicit
Test plan is clear
Evidence requirements are clear
No implementation is included
No migration is included
No UI is changed
No API route is added
No real source integration is added
No secret is recorded
```

---

## 11. Next Step After Acceptance

Only after this packet is accepted, a future PR may implement the controlled Worker Runtime integration contract inside the allowed files only.

Real source execution remains forbidden.

---

## 12. Final Decision

```text
TPC-I-012-IMPLEMENTATION may define a controlled Worker Runtime integration implementation boundary.
This PR is docs-only.
No implementation.
No migration.
No UI.
No API route.
No real source call.
No secret.
```