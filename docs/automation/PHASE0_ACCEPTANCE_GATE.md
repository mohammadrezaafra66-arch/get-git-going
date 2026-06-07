# Phase 0 Acceptance Gate

**Phase Label:** PHASE-0  
**Status:** Open — not yet accepted  
**Owner:** محمدرضا افرا  
**Blocks:** All Phase 1 Task Packets (1.1 … 2.6) — **Phase 1 BLOCKED**

مرجع: [`EXECUTION_DECISION_FINAL.md`](./EXECUTION_DECISION_FINAL.md) — بند ۶، ۸

---

## Purpose

Phase 0 is **not complete** until every criterion below is checked and signed. Only then may Phase 1 Task Packets start.

---

## Acceptance criteria

### A. Governance & baseline

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| A1 | Baseline frozen and tagged | [BASELINE_POINTER.md](../baseline/BASELINE_POINTER.md), [BASELINE_MANIFEST.md](../baseline/BASELINE_MANIFEST.md) | [x] — freeze `baseline-2026-06-05`; tag `baseline/v2026.06.05` on main |
| A2 | GitHub SoT policy active | [SOURCE_OF_TRUTH.md](../process/SOURCE_OF_TRUTH.md) | [x] — policy Active on main |
| A3 | Drive mirror-only acknowledged | [ADR-0008-drive-is-mirror.md](../adr/ADR-0008-drive-is-mirror.md) | [x] — Accepted; GitHub → Drive sync only |
| A4 | G-01 … G-08 closed | [G01_G08_CLOSURE_STATUS.md](./G01_G08_CLOSURE_STATUS.md) | [ ] — 7/8 CLOSED; **G-08 OPEN** (operator E2E test log pending) |
| A5 | Review Baseline passed on acceptance commit | [BASELINE_REVIEW_2026_06_05.md](../baseline/BASELINE_REVIEW_2026_06_05.md), [REVIEW_BASELINE_CHECKLIST.md](./REVIEW_BASELINE_CHECKLIST.md) | [x] — build PASS; lint baseline debt; OpenAPI PASS (PR #16 / `92ef42a`) |

### B. Contract

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| B1 | Canonical OpenAPI at `automation/openapi/automation-v1.yaml` | [ADR-0007-automation-contracts.md](../adr/ADR-0007-automation-contracts.md), [`automation/openapi/automation-v1.yaml`](../../automation/openapi/automation-v1.yaml) | [x] — canonical path on main; PR #16 review PASS |
| B2 | JSON Schemas at `automation/schemas/` | [`heartbeat.schema.json`](../../automation/schemas/heartbeat.schema.json), [`job.schema.json`](../../automation/schemas/job.schema.json) | [x] — heartbeat + job schemas present |
| B3 | No dual authoritative OpenAPI | [OPENAPI_CANONICAL_RESOLUTION.md](./OPENAPI_CANONICAL_RESOLUTION.md), [OPENAPI_BASELINE_AUDIT.md](./OPENAPI_BASELINE_AUDIT.md) | [x] — root stub deprecated; single canonical path (PR #16) |
| B4 | No marketplace-specific contract paths | [OPENAPI_BASELINE_AUDIT.md](./OPENAPI_BASELINE_AUDIT.md), [BASELINE_REVIEW_2026_06_05.md](../baseline/BASELINE_REVIEW_2026_06_05.md) §5 | [x] — no Divar/WhatsApp/Instagram/Torob paths in canonical OpenAPI |

### C. Database

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| C1 | Automation tables migration applied (staging/self-host) | [PHASE0_MIGRATION_APPLY_EVIDENCE_2026_06_06.md](../baseline/PHASE0_MIGRATION_APPLY_EVIDENCE_2026_06_06.md) | [x] — LAN pilot (`afrakala-lan-db`); `20260605120000_phase0_automation_tables.sql` applied 2026-06-06 (PR #21) |
| C2 | RLS enabled; write path documented | [PHASE0_AUTOMATION_TABLES.md](./PHASE0_AUTOMATION_TABLES.md) § Security, PR #15 migration | [x] — RLS on all 8 tables; authenticated writes blocked; service-role path documented |
| C3 | `dummy_worker` module seeded only | [PHASE0_MIGRATION_APPLY_EVIDENCE_2026_06_06.md](../baseline/PHASE0_MIGRATION_APPLY_EVIDENCE_2026_06_06.md), [PHASE0_AUTOMATION_TABLES.md](./PHASE0_AUTOMATION_TABLES.md) § Seed | [x] — sole enabled module `dummy_worker` (LAN apply verified) |
| C4 | No real-bot domain tables | [PHASE0_MIGRATION_APPLY_EVIDENCE_2026_06_06.md](../baseline/PHASE0_MIGRATION_APPLY_EVIDENCE_2026_06_06.md), [PHASE0_AUTOMATION_TABLES.md](./PHASE0_AUTOMATION_TABLES.md) | [x] — 8 generic `automation_*` tables only; real-bot query 0 rows |

### D. Worker Dummy (no real bot)

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| D1 | Worker Dummy sends heartbeat (contract/dummy) | [WPC-0-001-worker-dummy.md](./task-packets/WPC-0-001-worker-dummy.md), [`automation/worker-dummy/README.md`](../../automation/worker-dummy/README.md) | [ ] — PR #19 merged; operator test log not yet recorded |
| D2 | Claim → run → events → complete (dummy) | [WPC-0-001-worker-dummy.md](./task-packets/WPC-0-001-worker-dummy.md), [`automation/worker-dummy/README.md`](../../automation/worker-dummy/README.md) | [ ] — E2E script on main; operator run log pending |
| D3 | Checkpoint recorded (dummy) | [WPC-0-001-worker-dummy.md](./task-packets/WPC-0-001-worker-dummy.md) | [ ] — pending operator E2E evidence |
| D4 | Job lifecycle statuses correct (PENDING/CLAIMED vs RUNNING/COMPLETED) | [PHASE0_AUTOMATION_TABLES.md](./PHASE0_AUTOMATION_TABLES.md) § Status enums | [ ] — schema documented; runtime verification pending |
| D5 | No external platform calls | [ADR-0005-phase-zero-scope.md](../adr/ADR-0005-phase-zero-scope.md), [`automation/worker-dummy/README.md`](../../automation/worker-dummy/README.md) | [ ] — scope attested in docs/code; formal network review log pending |

### E. E2E demo

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| E1 | UI command → DB job created | [WPC-0-001-worker-dummy.md](./task-packets/WPC-0-001-worker-dummy.md) | [ ] — UI enqueue path not yet demonstrated |
| E2 | Worker claims and completes dummy job | [`automation/worker-dummy/run-e2e.mjs`](../../automation/worker-dummy/run-e2e.mjs) | [ ] — DB-only smoke on main; operator log pending |
| E3 | UI or admin query shows completed status | — | [ ] — pending manual test path / screenshot |

### F. Hard prohibitions (must be NO)

| Item | Confirmed NO |
|------|--------------|
| Divar / WhatsApp / Instagram / Torob real | [x] — [G-05 CLOSED](./G01_G08_CLOSURE_STATUS.md); [PHASE_LABEL_POLICY.md](../process/PHASE_LABEL_POLICY.md); C4 |
| OCR/STT / AI production | [x] — [ADR-0005](../adr/ADR-0005-phase-zero-scope.md); [BASELINE_MANIFEST.md](../baseline/BASELINE_MANIFEST.md) § NOT |
| Parallel core / DB / API / admin | [x] — [ADR-0004](../adr/ADR-0004-no-parallel-core.md); [G-01 CLOSED](./G01_G08_CLOSURE_STATUS.md) |
| Redis/RabbitMQ without ADR | [x] — [PHASE0_AUTOMATION_TABLES.md](./PHASE0_AUTOMATION_TABLES.md); [PHASE_LABEL_POLICY.md](../process/PHASE_LABEL_POLICY.md) |

---

## Acceptance sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Owner | محمدرضا افرا | | [ ] |
| Reviewer | | | [ ] |

**Phase 0 Status:** `OPEN` → change to `ACCEPTED` only when all required rows are checked.

**Phase 1 Status:** `BLOCKED` — packets 1.1 … 2.6 remain locked until acceptance signed.

---

## After acceptance

1. Update `PHASE1_TASK_PACKET_INDEX.md` — unlock Packet 1.1
2. Record acceptance commit/tag in `docs/baseline/RELEASE_NOTES_*.md`
3. PR template may show `Phase 0 complete: YES`
