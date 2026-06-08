# TPC-I-005 — Controlled Real Supabase Output Insert / Mock-to-DB Bridge

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

Define the next controlled step after mock-only output persistence.

TPC-I-005 may define a safe path for writing mock driver output into the verified database table:

```text
public.automation_driver_outputs
```

This packet is docs-only.

It must not implement real source extraction.

---

## 2. Why This Packet Exists

TPC-I-004 persists mock driver output only in memory.

The verified database table exists and has apply evidence.

The next risk is connecting worker output to the real database too early or too broadly.

TPC-I-005 narrows the scope to a controlled mock-to-database bridge only.

---

## 3. Preconditions

This packet may proceed only because these gates are satisfied:

```text
TPC-I-001 = accepted and implemented
TPC-I-002 = accepted and implemented
TPC-I-003 = migration applied and verified
TPC-I-004 = accepted and implemented in mock-only mode
```

---

## 4. Scope

This packet may define the implementation scope for:

```text
Adding a real insert path for automation_driver_outputs
Using the existing SupabaseClientWrapper boundary
Allowing only MOCK_DRIVER_RUN output
Allowing only driver_name = mock
Allowing only source_kind = mock
Adding tests for safe insert contract
Adding evidence for controlled database insert
```

The implementation must remain limited to mock driver output.

---

## 5. Out of Scope

The following are forbidden:

```text
Real source integrations
External website calls
Browser automation
Real Torob extraction
Google Maps extraction
Divar
WhatsApp
Instagram
OCR/STT
AI production
Redis
RabbitMQ
New Supabase migration
RLS change
UI implementation
New API route
Parallel Core
Parallel database
Parallel admin panel
Hardcoded secret
Production schedule
```

---

## 6. Controlled Insert Contract

The implementation may add a real insert path only for this shape:

```text
job_id: uuid
run_id: uuid | null
driver_name: mock
job_type: MOCK_DRIVER_RUN
status: COMPLETED | FAILED | SKIPPED
output: json object
checkpoint: json object | null
errors: json array
source_kind: mock
phase_label: PHASE-1
```

No other driver name or source kind is allowed in this packet.

---

## 7. Security Requirements

The implementation must not expose secrets.

Rules:

```text
No service-role key in browser code
No connection string in committed files
No .env content in docs
No direct UI write path
No authenticated write policy change
No RLS change
```

If real Supabase insert requires credentials, it must be available only through the worker runtime environment and never through UI.

---

## 8. Allowed Files For Future Implementation

Only these paths may be modified or created:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/tests/test_real_output_insert_contract.py
automation/worker-runtime/README.md
docs/baseline/TPC_I_005_CONTROLLED_REAL_OUTPUT_INSERT_EVIDENCE_2026_06_08.md
```

Optional docs-only update:

```text
docs/automation/task-packets/TPC-I-005-controlled-real-output-insert.md
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

## 10. Test Plan For Future Implementation

Required command shape:

```powershell
1. cd automation/worker-runtime
2. python -m pip install -e .
3. pytest
```

Tests must prove:

```text
Mock output insert contract accepts only driver_name = mock
Mock output insert contract accepts only source_kind = mock
Mock output insert contract rejects non-mock driver names
Mock output insert contract rejects non-mock source kinds
No browser/UI code is involved
No external network is required for unit tests
No real source data is required
```

If integration test is added later, it must be operator-approved and must not record secrets.

---

## 11. Acceptance Criteria

This packet is accepted only when:

```text
Controlled insert scope is defined
Allowed files are defined
Forbidden files are defined
Security constraints are clear
No implementation is included in this PR
No UI is changed
No migration is created
No real source integration is added
No external call is introduced
Stop conditions are clear
```

---

## 12. Stop Conditions

Stop immediately if:

```text
A real source integration is added
A real source call is added
A migration is added
UI is changed
API route is changed
Service role key appears in browser code
A parallel database is introduced
Tests require real production credentials
External source network is required
```

---

## 13. Owner / Reviewer / Tester

```text
Owner: محمدرضا افرا
Technical Owner: خانم پورچیستا
Reviewer: Platform review
Tester 1: آقای حیدری
Tester 2: آقای طالبی‌زاده
```

---

## 14. Rollback Plan

If implementation fails:

```text
Revert implementation PR
Keep automation_driver_outputs table intact
Keep real source execution blocked
Do not proceed to read-only real source integration
Create review note explaining failure
```

---

## 15. Next Packet After Acceptance

Only after TPC-I-005 is accepted and implemented, the next packet may be opened:

```text
TPC-I-006 — Worker Output Evidence Sync / DB Insert Verification
```

Real source execution is still forbidden after TPC-I-005.

---

## 16. Final Decision

```text
TPC-I-005 may define a controlled mock-to-database output insert path.
No real automation.
No real source call.
No migration.
No UI.
Implementation may proceed only after this packet is accepted.
```
