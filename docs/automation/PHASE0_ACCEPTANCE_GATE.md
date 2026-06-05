# Phase 0 Acceptance Gate

**Phase Label:** PHASE-0  
**Status:** Open — not yet accepted  
**Owner:** محمدرضا افرا  
**Blocks:** All Phase 1 Task Packets (1.1 … 2.6)

مرجع: [`EXECUTION_DECISION_FINAL.md`](./EXECUTION_DECISION_FINAL.md) — بند ۶، ۸

---

## Purpose

Phase 0 is **not complete** until every criterion below is checked and signed. Only then may Phase 1 Task Packets start.

---

## Acceptance criteria

### A. Governance & baseline

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| A1 | Baseline frozen and tagged | `docs/baseline/`, git tag | [ ] |
| A2 | GitHub SoT policy active | `SOURCE_OF_TRUTH.md` | [ ] |
| A3 | Drive mirror-only acknowledged | ADR-0008 | [ ] |
| A4 | G-01 … G-08 closed | `G01_G08_CLOSURE_STATUS.md` | [x] — all CLOSED 2026-06-05 (G-08 E2E evidence recorded) |
| A5 | Review Baseline passed on acceptance commit | `REVIEW_BASELINE_CHECKLIST.md` | [ ] |

### B. Contract

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| B1 | Canonical OpenAPI at `automation/openapi/automation-v1.yaml` | ADR-0007 | [ ] |
| B2 | JSON Schemas at `automation/schemas/` | heartbeat + job | [ ] |
| B3 | No dual authoritative OpenAPI | `OPENAPI_CANONICAL_RESOLUTION.md` | [ ] |
| B4 | No marketplace-specific contract paths | OpenAPI review | [ ] |

### C. Database

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| C1 | Automation tables migration applied (staging/self-host) | migration file + apply log | [ ] — on main at `9c54ea9` (PR #15); staging/self-host apply pending |
| C2 | RLS enabled; write path documented | migration + security note | [x] — PR #15 `20260605120000_phase0_automation_tables.sql`; `PHASE0_AUTOMATION_TABLES.md` § Security |
| C3 | `dummy_worker` module seeded only | seed row | [x] — seed in migration; no other modules enabled |
| C4 | No real-bot domain tables | schema review | [x] — PR #15 scope review; 8 generic `automation_*` tables only |

### D. Worker Dummy (no real bot)

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| D1 | Worker Dummy sends heartbeat (contract/dummy) | WPC-0-001 E2E log | [x] — `heartbeat_recorded: true` (LAN/local, PR #19) |
| D2 | Claim → run → events → complete (dummy) | E2E log | [x] — job `CLAIMED`, run `COMPLETED`; events RUN_STARTED, CHECKPOINT_SAVED, RUN_COMPLETED |
| D3 | Checkpoint recorded (dummy) | DB or event log | [x] — `checkpoint_count: 1` |
| D4 | Job lifecycle statuses correct (PENDING/CLAIMED vs RUNNING/COMPLETED) | DB + contract | [x] — job CLAIMED; run COMPLETED |
| D5 | No external platform calls | code/network review | [x] — `real_bot_scope: false`; no Divar/WhatsApp/Instagram/Torob/OCR/AI |

### E. E2E demo

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| E1 | UI command → DB job created | manual test path | [ ] |
| E2 | Worker claims and completes dummy job | manual test path | [x] — `automation/worker-dummy/run-e2e.mjs` LAN/local; PR #19 on main |
| E3 | UI or admin query shows completed status | screenshot/query | [ ] |

### F. Hard prohibitions (must be NO)

| Item | Confirmed NO |
|------|--------------|
| Divar / WhatsApp / Instagram / Torob real | [ ] |
| OCR/STT / AI production | [ ] |
| Parallel core / DB / API / admin | [ ] |
| Redis/RabbitMQ without ADR | [ ] |

---

## Acceptance sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Owner | محمدرضا افرا | | [ ] |
| Reviewer | | | [ ] |

**Phase 0 Status:** `OPEN` → change to `ACCEPTED` only when all required rows are checked.

---

## After acceptance

1. Update `PHASE1_TASK_PACKET_INDEX.md` — unlock Packet 1.1
2. Record acceptance commit/tag in `docs/baseline/RELEASE_NOTES_*.md`
3. PR template may show `Phase 0 complete: YES`
