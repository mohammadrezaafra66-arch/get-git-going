# Phase 1 Task Packet Index

**Phase Label:** PHASE-1 (locked)  
**Status:** **LOCKED** — Phase 0 not yet accepted  
**Owner:** محمدرضا افرا

مرجع: [`EXECUTION_DECISION_FINAL.md`](./EXECUTION_DECISION_FINAL.md) — بند ۹، ۱۰

---

## Lock rule

```
IF Phase0AcceptanceGate != ACCEPTED
THEN no Phase 1 packet may start
```

Check: [`PHASE0_ACCEPTANCE_GATE.md`](./PHASE0_ACCEPTANCE_GATE.md)

---

## Packet registry (1.1 → 2.6)

| Packet | Title | Phase | Status | Task file | Depends on |
|--------|-------|-------|--------|-----------|------------|
| **1.1** | TBD — first Phase 1 module (low-risk) | PHASE-1 | 🔒 LOCKED | _not created_ | Phase 0 ACCEPTED |
| **1.2** | TBD | PHASE-1 | 🔒 LOCKED | _not created_ | 1.1 |
| **1.3** | TBD | PHASE-1 | 🔒 LOCKED | _not created_ | Prior packets |
| **1.4** | TBD | PHASE-1 | 🔒 LOCKED | _not created_ | Prior packets |
| **1.5** | TBD | PHASE-1 | 🔒 LOCKED | _not created_ | Prior packets |
| **1.6** | TBD | PHASE-1 | 🔒 LOCKED | _not created_ | Prior packets |
| **2.1** | TBD | PHASE-1 | 🔒 LOCKED | _not created_ | 1.x complete |
| **2.2** | TBD | PHASE-1 | 🔒 LOCKED | _not created_ | Prior packets |
| **2.3** | TBD | PHASE-1 | 🔒 LOCKED | _not created_ | Prior packets |
| **2.4** | TBD | PHASE-1 | 🔒 LOCKED | _not created_ | Prior packets |
| **2.5** | TBD | PHASE-1 | 🔒 LOCKED | _not created_ | Prior packets |
| **2.6** | TBD — Phase 1 closure / review | PHASE-1 | 🔒 LOCKED | _not created_ | 2.5 |

---

## Candidate modules (planning only — not authorized)

Per `docs/process/PHASE_LABEL_POLICY.md`, possible Phase 1 candidates after acceptance:

- Google Maps (limited)
- Torob (limited, not real extractor at scale)

**Forbidden in Phase 1 without new ADR:** Divar, WhatsApp, Instagram, OCR/STT, AI production.

---

## Creating a Phase 1 packet

When Phase 0 is accepted, owner must:

1. Copy `docs/process/DOR.md` minimum template
2. Assign Packet ID (e.g. `TPC-1-001`)
3. Set `Phase Label: PHASE-1`
4. List Allowed/Forbidden files
5. Reference ADR-0001 … ADR-0008
6. Unlock row in this index

---

## Phase 0 packets (reference — not Phase 1)

| Packet | Title | Status |
|--------|-------|--------|
| WPC-0-001 | Worker Dummy E2E | Ready for Planning |
| WPC-0-002 | OpenAPI canonical cleanup | In Progress / PR |
