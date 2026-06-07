# Phase 1 Task Packet Index

**Phase Label:** PHASE-1 (partial unlock)  
**Status:** **PARTIAL** — Packet **1.1** ready for review; Packets 1.2 … 2.6 remain locked  
**Owner:** محمدرضا افرا

مرجع: [`EXECUTION_DECISION_FINAL.md`](./EXECUTION_DECISION_FINAL.md) — بند ۹، ۱۰

**Phase 0 prerequisite:** [PHASE0_ACCEPTANCE_SIGNOFF_2026_06_07.md](../baseline/PHASE0_ACCEPTANCE_SIGNOFF_2026_06_07.md) — **ACCEPTED** 2026-06-07  
**Unlock record:** [PHASE1_UNLOCK_2026_06_07.md](../baseline/PHASE1_UNLOCK_2026_06_07.md)

---

## Lock rule

```
IF Phase0AcceptanceGate != ACCEPTED
THEN no Phase 1 packet may start
```

Phase 0 gate: [`PHASE0_ACCEPTANCE_GATE.md`](./PHASE0_ACCEPTANCE_GATE.md) — **ACCEPTED** (signed 2026-06-07).

Individual packets unlock **one at a time** via index update + baseline unlock record. Only **1.1** is unlocked as of 2026-06-07.

---

## Packet registry (1.1 → 2.6)

| Packet | Title | Phase | Status | Task file | Depends on |
|--------|-------|-------|--------|-----------|------------|
| **1.1** | TPC-1-001 — Planning and First Module Selection — Torob limited selected | PHASE-1 | **READY FOR REVIEW** | [TPC-1-001](./task-packets/TPC-1-001-phase1-packet-1.1-planning-and-first-module-selection.md) | [Phase 0 sign-off](../baseline/PHASE0_ACCEPTANCE_SIGNOFF_2026_06_07.md) |
| **1.2** | TBD | PHASE-1 | LOCKED | _not created_ | 1.1 |
| **1.3** | TBD | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **1.4** | TBD | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **1.5** | TBD | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **1.6** | TBD | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.1** | TBD | PHASE-1 | LOCKED | _not created_ | 1.x complete |
| **2.2** | TBD | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.3** | TBD | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.4** | TBD | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.5** | TBD | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.6** | TBD — Phase 1 closure / review | PHASE-1 | LOCKED | _not created_ | 2.5 |

---

## Candidate modules (planning only — not authorized until packet is approved)

Per `docs/process/PHASE_LABEL_POLICY.md`, possible Phase 1 candidates after acceptance:

- Google Maps (limited)
- Torob (limited, not real extractor at scale)

**Packet 1.1 selection for review:** Torob limited.

**Forbidden in Phase 1 without new ADR:** Divar, WhatsApp, Instagram, OCR/STT, AI production.

---

## Creating a Phase 1 packet

For **Packet 1.1** (unlocked), owner must:

1. Copy `docs/process/DOR.md` minimum template
2. Assign Packet ID (e.g. `TPC-1-001`)
3. Set `Phase Label: PHASE-1`
4. List Allowed/Forbidden files
5. Reference ADR-0001 … ADR-0008
6. Update row in this index when task file is created

Packets **1.2 … 2.6** remain locked until explicitly unlocked in a future index update.

---

## Phase 0 packets (reference — complete)

| Packet | Title | Status |
|--------|-------|--------|
| WPC-0-001 | Worker Dummy E2E | **CLOSED** |
| WPC-0-002 | OpenAPI canonical cleanup | **CLOSED** |
| WPC-0-003 | Automation DB migration | **CLOSED** |
| WPC-0-004 | Admin dummy enqueue (E1) | **CLOSED** |
