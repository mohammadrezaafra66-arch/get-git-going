# TPC-I-011 — Credentialed Insert Planning

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** ACCEPTED — approved for credentialed insert planning  
**Owner:** محمدرضا افرا  
**Technical Owner:** خانم پورچیستا  
**Reviewer:** Platform review  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Goal

Define the planning boundary for a future credentialed insert path from Worker Runtime to the verified output table.

This packet is docs-only.

It must not implement code, database writes, UI, API routes, migrations, real source integrations, or production automation.

---

## 2. Why This Packet Exists

TPC-I-010 recorded the credential boundary evidence gate.

The next risk is introducing a credentialed database path without strict planning, operator approval, and evidence requirements.

TPC-I-011 defines that planning boundary only.

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
```

---

## 4. Scope

This packet may define only:

```text
Credentialed insert objective
Allowed target table
Allowed input row shape
Credential boundary
Operator approval boundary
Unit and integration test strategy
Evidence requirements
Rollback and stop conditions
Future implementation scope
```

---

## 5. Out of Scope

The following are forbidden:

```text
Any implementation
Any migration
Any UI change
Any API route
Any credentialed database write
Any real source integration
Any external website call
Any browser automation
Any secret recording
Production automation
```

---

## 6. Proposed Credentialed Insert Boundary

A future implementation may only insert validated mock rows into:

```text
public.automation_driver_outputs
```

The only allowed input row shape is a row validated by:

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

No real source payload is allowed in this planning packet.

---

## 7. Credential Boundary Rules

Future implementation must obey:

```text
No credentials committed to GitHub
No connection strings in docs
No .env contents in docs
No service role key in browser code
No UI direct write path
No API route in this packet
Worker runtime environment only for credentials
Operator-approved LAN/staging testing only
```

If any credential boundary needs to change, stop and create an ADR.

---

## 8. Future Allowed Files

A future implementation packet may define allowed files, but the suggested narrow scope is:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/tests/test_credentialed_insert_contract.py
docs/baseline/TPC_I_011_CREDENTIALED_INSERT_PLANNING_EVIDENCE_2026_06_08.md
```

Optional docs-only update:

```text
docs/automation/task-packets/TPC-I-011-credentialed-insert-planning.md
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

## 10. Future Test Strategy

Future implementation must separate:

```text
Unit tests without credentials
Operator-approved LAN integration test, if required
```

Unit tests must not require:

```text
Real database credentials
Production credentials
External network
Real source data
```

Integration testing must not record secrets.

---

## 11. Evidence Requirements

Future evidence must include:

```text
Changed files
Unit test result
Credential handling review
No-secret review
No UI change review
No migration review
No API route review
No real source integration review
Operator-approved integration result, if performed
Rollback readiness
```

---

## 12. Stop Conditions

Stop immediately if:

```text
Any implementation is added in this docs-only PR
Any migration is added
Any UI file is changed
Any API route is changed
Any credential is recorded
Any real source call is added
Any credentialed write is performed
Tests require production credentials
External source network is required
```

---

## 13. Acceptance Criteria

This packet is accepted only when:

```text
Credentialed insert planning scope is defined
Credential boundary is defined
Allowed files are defined
Forbidden files are defined
No implementation is included
No migration is included
No UI is changed
No API route is added
No real source integration is added
No secret is recorded
```

---

## 14. Next Packet After Acceptance

Only after TPC-I-011 is accepted, the next packet may be opened:

```text
TPC-I-011-IMPLEMENTATION — Credentialed Insert Implementation
```

Real source execution remains forbidden after TPC-I-011.

---

## 15. Approval / Sign-off

Owner: محمدرضا افرا — approved  
Reviewer: Platform review — reviewed

Decision: TPC-I-011 is accepted as the credentialed insert planning packet.

Next allowed PR: docs-only implementation packet or separate controlled implementation packet after approval.

No implementation, migration, UI, API route, credentialed database write, real source integration, external source call, or production automation is allowed in this PR.

---

## 16. Final Decision

```text
TPC-I-011 may define credentialed insert planning only.
No implementation.
No migration.
No UI.
No API route.
No real source call.
No credentialed write.
Implementation planning may proceed only after this packet is merged.
```