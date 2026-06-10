# TPC-I-004 — Mock Output Persistence Wiring

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** ACCEPTED — approved for mock output persistence implementation  
**Owner:** محمدرضا افرا  
**Technical Owner:** خانم پورچیستا  
**Reviewer:** Platform review  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Source of Truth:** GitHub  
**Google Drive:** Mirror / Review Pack only

---

## 1. Goal

Wire the mock-only Worker Runtime output path to the verified `automation_driver_outputs` table.

This packet must persist only mock driver output.

It must not implement any real source integration, UI, API route, or production automation.

---

## 2. Why This Packet Exists

TPC-I-001 created the minimal Worker Runtime skeleton.

TPC-I-002 created the mock-only Driver Contract.

TPC-I-003 created and verified the output persistence table:

```text
public.automation_driver_outputs
```

The next risk is allowing drivers to return outputs without a standard persistence path.

TPC-I-004 defines the controlled implementation scope for saving mock driver results into the verified output table.

---

## 3. Preconditions

This packet may proceed only because the following gates are satisfied:

```text
TPC-I-001 = accepted and implemented
TPC-I-002 = accepted and implemented
TPC-I-003 migration file = merged
TPC-I-003 database apply evidence = merged
Issue #49 = closed
```

---

## 4. Scope

This packet may define the implementation scope for:

```text
Extending the Supabase wrapper with save_driver_output shape
Adding mock-mode persistence behavior
Wiring JobRunner to call save_driver_output after mock driver completion
Adding tests for output persistence in mock store
Adding evidence for TPC-I-004 implementation
```

Recommended future implementation files:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/src/job_runner.py
automation/worker-runtime/tests/test_output_persistence.py
docs/baseline/TPC_I_004_MOCK_OUTPUT_PERSISTENCE_EVIDENCE_2026_06_08.md
```

Optional docs update:

```text
automation/worker-runtime/README.md
```

---

## 5. Out of Scope

The following are forbidden:

```text
Real source integrations
Browser automation
External website calls
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

## 6. Required Persistence Contract

The Worker Runtime must expose a method shape similar to:

```text
save_driver_output(
  job_id: str,
  run_id: str | None,
  driver_name: str,
  job_type: str,
  status: str,
  output: dict,
  checkpoint: dict | None,
  errors: list,
  source_kind: str = 'mock',
) -> dict
```

In this packet's implementation, only mock-mode behavior is required.

Real Supabase insert may remain outside scope unless explicitly approved in the implementation PR.

If real Supabase insert is included later, it must use the verified table contract and must not expose service-role keys to browser code.

---

## 7. Mock Persistence Requirements

Mock persistence must:

```text
Run without network
Run without browser
Run without secrets
Store persisted output in MockSupabaseClient memory
Preserve job_id
Preserve run_id when available
Preserve driver_name
Preserve job_type
Preserve status
Preserve output
Preserve checkpoint
Preserve errors
Preserve source_kind = mock
Be testable with pytest
```

---

## 8. JobRunner Wiring Requirements

When a `MOCK_DRIVER_RUN` job completes, JobRunner must:

```text
Run mock driver
Validate DriverResult
Save checkpoint if present
Save driver output through store wrapper
Write structured logs
Return result including output persistence acknowledgement
```

Recommended event name:

```text
DRIVER_OUTPUT_SAVED
```

No real source call is allowed.

---

## 9. Allowed Files For Future Implementation

Only these paths may be modified or created:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/src/job_runner.py
automation/worker-runtime/tests/test_output_persistence.py
automation/worker-runtime/README.md
docs/baseline/TPC_I_004_MOCK_OUTPUT_PERSISTENCE_EVIDENCE_2026_06_08.md
```

Optional docs-only update:

```text
docs/automation/task-packets/TPC-I-004-mock-output-persistence-wiring.md
```

---

## 10. Forbidden Files

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

## 11. Test Plan For Future Implementation

Required commands:

```powershell
1. cd automation/worker-runtime
2. python -m pip install -e .
3. pytest
```

Tests must prove:

```text
Mock driver output is persisted in mock store
Persisted output has job_id
Persisted output has driver_name = mock
Persisted output has job_type = MOCK_DRIVER_RUN
Persisted output has status = COMPLETED
Persisted output has source_kind = mock
JobRunner writes DRIVER_OUTPUT_SAVED event
No external network is required
No real secrets are required
```

---

## 12. Acceptance Criteria

This packet is accepted only when:

```text
Mock persistence contract is defined
Allowed files are defined
Forbidden files are defined
No implementation is included in this PR
No UI is changed
No migration is created
No real source integration is added
No external call is introduced
Stop conditions are clear
```

---

## 13. Stop Conditions

Stop immediately if:

```text
A real source integration is added
A real source call is added
A migration is added
UI is changed
API route is changed
Service role key appears in browser code
A parallel database is introduced
Tests require real credentials
External network is required
```

---

## 14. Owner / Reviewer / Tester

```text
Owner: محمدرضا افرا
Technical Owner: خانم پورچیستا
Reviewer: Platform review
Tester 1: آقای حیدری
Tester 2: آقای طالبی‌زاده
```

---

## 15. Rollback Plan

If implementation fails:

```text
Revert implementation PR
Keep automation_driver_outputs table intact
Keep real source execution blocked
Do not proceed to read-only real source integration
Create review note explaining failure
```

---

## 16. Next Packet After Acceptance

Only after TPC-I-004 is accepted and implemented, the next packet may be opened:

```text
TPC-I-005 — Controlled Real Supabase Output Insert or Mock-to-DB Bridge
```

Real source execution is still forbidden after TPC-I-004.

---

## 17. Approval / Sign-off

Owner: محمدرضا افرا — approved  
Reviewer: Platform review — reviewed  

Decision: TPC-I-004 is accepted as the mock output persistence wiring packet.

Next allowed PR: Mock Output Persistence Wiring implementation only.

No real source integration, UI implementation, new migration, API route, or production automation is allowed in the next implementation PR.

---

## 18. Final Decision

```text
TPC-I-004 may define and implement mock output persistence wiring.
No real automation.
No real source call.
No migration.
No UI.
Implementation may proceed only for mock output persistence.
```
