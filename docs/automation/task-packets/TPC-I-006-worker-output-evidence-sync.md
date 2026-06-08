# TPC-I-006 — Worker Output Evidence Sync / DB Insert Verification

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

Define the evidence and verification step after TPC-I-005.

TPC-I-006 must verify that the controlled output insert contract is ready for a future database bridge.

This packet is docs-only.

---

## 2. Why This Packet Exists

TPC-I-005 validates and shapes the controlled output row.

It still does not execute a real database insert.

Before any database write path is implemented, the team needs a clean evidence sync packet that defines exactly what must be proven.

---

## 3. Preconditions

This packet may proceed only after:

```text
TPC-I-001 = accepted and implemented
TPC-I-002 = accepted and implemented
TPC-I-003 = migration applied and verified
TPC-I-004 = accepted and implemented
TPC-I-005 = accepted and implemented
```

---

## 4. Scope

This packet may define only:

```text
Evidence requirements for controlled output insert contract
Required test results
Required no-secret review
Required no-UI/no-migration/no-real-source verification
Future bridge gate criteria
```

---

## 5. Out of Scope

The following are forbidden:

```text
Real source integrations
External website calls
Browser automation
New Supabase migration
RLS change
UI implementation
API route implementation
Production automation
Hardcoded secret
```

---

## 6. Required Evidence

Future evidence must include:

```text
Worker-runtime test command
Test result summary
Controlled output row shape review
Mock-only constraint review
No-secret review
No UI change review
No migration review
No real source integration review
```

---

## 7. Required Test Result

The evidence must show worker-runtime tests were run using:

```powershell
1. cd automation/worker-runtime
2. python -m pip install -e .
3. pytest
```

Expected:

```text
All worker-runtime tests pass
```

---

## 8. Future Allowed Files

A future evidence PR may add or update only:

```text
docs/baseline/TPC_I_006_WORKER_OUTPUT_EVIDENCE_SYNC_2026_06_08.md
```

Optional docs-only update:

```text
docs/automation/task-packets/TPC-I-006-worker-output-evidence-sync.md
```

---

## 9. Forbidden Files

Do not change:

```text
automation/worker-runtime/src/
automation/worker-runtime/tests/
supabase/migrations/
src/routes/
src/components/
src/lib/
automation/openapi/
openapi/
package.json
pnpm-lock.yaml
vite.config.*
any UI file
any real source integration
```

If any forbidden file must change, stop and create a new packet or ADR.

---

## 10. Stop Conditions

Stop immediately if:

```text
Any implementation is added
Any migration is added
Any UI file is changed
Any API route is changed
Any real source call is added
Any secret is recorded
Tests require production credentials
```

---

## 11. Acceptance Criteria

This packet is accepted only when:

```text
Evidence scope is defined
Allowed files are defined
Forbidden files are defined
No implementation is included
No migration is included
No UI is changed
No real source integration is added
No secret is recorded
```

---

## 12. Next Packet After Acceptance

Only after TPC-I-006 is accepted and evidence is recorded, the next packet may be opened:

```text
TPC-I-007 — Controlled Database Insert Bridge Planning
```

Real source execution remains forbidden after TPC-I-006.

---

## 13. Final Decision

```text
TPC-I-006 may define worker output evidence sync only.
No implementation.
No migration.
No UI.
No real source call.
```
