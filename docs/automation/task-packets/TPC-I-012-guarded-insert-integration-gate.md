# TPC-I-012 — Guarded Insert Integration Gate

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** ACCEPTED — approved as the guarded insert integration gate  
**Owner:** محمدرضا افرا  
**Technical Owner:** خانم پورچیستا  
**Reviewer:** Platform review  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Goal

Define the next gate after TPC-I-011 guarded insert tests passed.

This packet is docs-only.

It must not implement code, migration, UI, API route, browser automation, external source integration, or production scheduling.

---

## 2. Current State

Completed gates:

```text
TPC-I-011 implementation = merged
TPC-I-011 local worker-runtime tests = passed
TPC-I-011 test evidence = merged
Issue #95 = closed
```

Recorded test result:

```text
9 passed in 0.03s
```

---

## 3. Scope

TPC-I-012 may define only the review and operator gate for a future controlled integration path.

Allowed in this packet:

```text
Define the integration decision boundary
Define required operator approvals
Define evidence requirements
Define stop conditions
Define allowed future files for the next packet
Define forbidden areas
```

Not allowed in this packet:

```text
No code implementation
No database credential use
No database write implementation
No migration
No RLS change
No UI
No API route
No browser automation
No real source integration
No external website call
No production automation
No secret recording
```

---

## 4. Future Integration Boundary

A future implementation may be considered only after this packet is accepted.

The future integration must remain limited to:

```text
worker runtime boundary only
validated mock-compatible row shape only
operator-approved local or LAN/staging execution only
no browser or real source execution
no UI direct write path
no service-role key in browser code
```

Any change to database schema, RLS, API routes, UI, or real source execution must stop and require a separate approved packet or ADR.

---

## 5. Required Evidence For Future Packet

A future packet must record:

```text
Exact command used
Environment used
Credential boundary review without exposing secrets
Target table review
Row shape review
Mock-only or staging-only review
No UI change review
No migration review
No real source review
Operator name/date
Result summary
Rollback or abort plan
```

Evidence must never include:

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

## 6. Allowed Future Files

The next packet may modify only paths explicitly approved in that packet.

Candidate paths for future review:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/tests/test_*integration*_contract.py
automation/worker-runtime/README.md
docs/baseline/TPC_I_012_*_EVIDENCE_2026_06_09.md
```

This packet does not approve those changes by itself.

---

## 7. Forbidden Files

Do not change in this packet:

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

---

## 8. Stop Conditions

Stop immediately if any future plan requires:

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

## 9. Acceptance Criteria

This packet is accepted only when:

```text
Integration gate is clearly defined
Evidence requirements are clear
Forbidden areas are explicit
No implementation is included
No migration is included
No UI is changed
No API route is added
No real source integration is added
No secret is recorded
```

---

## 10. Next Step After Acceptance

Only after this packet is accepted, the next PR may define a concrete controlled integration implementation packet.

That next packet must still be reviewed before any implementation begins.

Real source execution remains forbidden.

---

## 11. Approval / Sign-off

Owner: محمدرضا افرا — approved  
Reviewer: Platform review — reviewed

Decision: TPC-I-012 is accepted as a guarded integration gate only.

Next allowed PR: a separate docs-only concrete implementation packet.

No implementation, migration, UI, API route, real source execution, external source call, production schedule, or secret is allowed in this acceptance PR.

---

## 12. Final Decision

```text
TPC-I-012 = ACCEPTED
TPC-I-012 may define the guarded insert integration gate.
This PR is docs-only.
No implementation.
No migration.
No UI.
No API route.
No real source call.
No secret.
```