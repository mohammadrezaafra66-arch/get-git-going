# Phase 1 Task Packet Index

**Phase Label:** PHASE-1  
**Status:** PARTIAL — Packets 1.1 to 2.2 accepted; Packet 2.3 ready for review; later packets locked  
**Owner:** محمدرضا افرا

---

## Packet registry

| Packet | Title | Phase | Status | Task file | Depends on |
|--------|-------|-------|--------|-----------|------------|
| **1.1** | TPC-1-001 — Planning and First Module Selection | PHASE-1 | ACCEPTED | [TPC-1-001](./task-packets/TPC-1-001-phase1-packet-1.1-planning-and-first-module-selection.md) | Phase 0 sign-off |
| **1.2** | TPC-1-002 — Phase 1 Scope Lock | PHASE-1 | ACCEPTED | [TPC-1-002](./task-packets/TPC-1-002-phase1-scope-lock.md) | [Packet 1.1 acceptance](../baseline/PHASE1_PACKET_1_1_ACCEPTANCE_2026_06_07.md) |
| **1.3** | TPC-1-003 — Worker Runtime Boundary | PHASE-1 | ACCEPTED | [TPC-1-003](./task-packets/TPC-1-003-worker-runtime-boundary.md) | [Packet 1.2 acceptance](../baseline/PHASE1_PACKET_1_2_ACCEPTANCE_2026_06_07.md) |
| **1.4** | TPC-1-004 — Plugin / Driver SDK Boundary | PHASE-1 | ACCEPTED | [TPC-1-004](./task-packets/TPC-1-004-plugin-driver-sdk-boundary.md) | [Packet 1.3 acceptance](../baseline/PHASE1_PACKET_1_3_ACCEPTANCE_2026_06_07.md) |
| **1.5** | TPC-1-005 — Torob Limited Implementation Design | PHASE-1 | ACCEPTED | [TPC-1-005](./task-packets/TPC-1-005-torob-limited-implementation-design.md) | [Packet 1.4 acceptance](../baseline/PHASE1_PACKET_1_4_ACCEPTANCE_2026_06_07.md) |
| **1.6** | TPC-1-006 — Torob Limited Execution | PHASE-1 | ACCEPTED | [TPC-1-006](./task-packets/TPC-1-006-torob-limited-execution.md) | [Packet 1.5 acceptance](../baseline/PHASE1_PACKET_1_5_ACCEPTANCE_2026_06_07.md) |
| **2.1** | TPC-2-001 — Supabase Output Persistence | PHASE-1 | ACCEPTED | [TPC-2-001](./task-packets/TPC-2-001-supabase-output-persistence.md) | [Packet 1.6 acceptance](../baseline/PHASE1_PACKET_1_6_ACCEPTANCE_2026_06_07.md) |
| **2.2** | TPC-2-002 — UI Output Display | PHASE-1 | ACCEPTED | [TPC-2-002](./task-packets/TPC-2-002-ui-output-display.md) | [Packet 2.1 acceptance](../baseline/PHASE1_PACKET_2_1_ACCEPTANCE_2026_06_07.md) |
| **2.3** | TPC-2-003 — Retry / Failure / Checkpoint Tests | PHASE-1 | READY FOR REVIEW | [TPC-2-003](./task-packets/TPC-2-003-retry-failure-checkpoint-tests.md) | [Packet 2.2 acceptance](../baseline/PHASE1_PACKET_2_2_ACCEPTANCE_2026_06_07.md) |
| **2.4** | TBD — Resource usage test | PHASE-1 | LOCKED | _not created_ | 2.3 |
| **2.5** | TBD — Phase 1 evidence sync | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.6** | TBD — Phase 1 closure / review | PHASE-1 | LOCKED | _not created_ | 2.5 |

---

## Current decision

Packet 1.1 selected **Torob limited** as the first Phase 1 module.

Packets 1.2 to 2.2 completed planning, boundaries, limited execution authorization, output persistence planning, and UI display planning only.

Packet 2.3 defines retry/failure/checkpoint test planning only; no tests are implemented.

---

## Related

- [TPC-1-001](./task-packets/TPC-1-001-phase1-packet-1.1-planning-and-first-module-selection.md)
- [TPC-1-002](./task-packets/TPC-1-002-phase1-scope-lock.md)
- [TPC-1-003](./task-packets/TPC-1-003-worker-runtime-boundary.md)
- [TPC-1-004](./task-packets/TPC-1-004-plugin-driver-sdk-boundary.md)
- [TPC-1-005](./task-packets/TPC-1-005-torob-limited-implementation-design.md)
- [TPC-1-006](./task-packets/TPC-1-006-torob-limited-execution.md)
- [TPC-2-001](./task-packets/TPC-2-001-supabase-output-persistence.md)
- [TPC-2-002](./task-packets/TPC-2-002-ui-output-display.md)
- [TPC-2-003](./task-packets/TPC-2-003-retry-failure-checkpoint-tests.md)
- [Packet 2.2 acceptance](../baseline/PHASE1_PACKET_2_2_ACCEPTANCE_2026_06_07.md)
- [Phase 0 acceptance](../baseline/PHASE0_ACCEPTANCE_SIGNOFF_2026_06_07.md)
