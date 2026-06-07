# Phase 1 Task Packet Index

**Phase Label:** PHASE-1  
**Status:** PARTIAL — Packets 1.1 to 1.3 accepted; Packet 1.4 ready for review; later packets locked  
**Owner:** محمدرضا افرا

---

## Packet registry

| Packet | Title | Phase | Status | Task file | Depends on |
|--------|-------|-------|--------|-----------|------------|
| **1.1** | TPC-1-001 — Planning and First Module Selection | PHASE-1 | ACCEPTED | [TPC-1-001](./task-packets/TPC-1-001-phase1-packet-1.1-planning-and-first-module-selection.md) | Phase 0 sign-off |
| **1.2** | TPC-1-002 — Phase 1 Scope Lock | PHASE-1 | ACCEPTED | [TPC-1-002](./task-packets/TPC-1-002-phase1-scope-lock.md) | [Packet 1.1 acceptance](../baseline/PHASE1_PACKET_1_1_ACCEPTANCE_2026_06_07.md) |
| **1.3** | TPC-1-003 — Worker Runtime Boundary | PHASE-1 | ACCEPTED | [TPC-1-003](./task-packets/TPC-1-003-worker-runtime-boundary.md) | [Packet 1.2 acceptance](../baseline/PHASE1_PACKET_1_2_ACCEPTANCE_2026_06_07.md) |
| **1.4** | TPC-1-004 — Plugin / Driver SDK Boundary | PHASE-1 | READY FOR REVIEW | [TPC-1-004](./task-packets/TPC-1-004-plugin-driver-sdk-boundary.md) | [Packet 1.3 acceptance](../baseline/PHASE1_PACKET_1_3_ACCEPTANCE_2026_06_07.md) |
| **1.5** | TBD — Torob limited implementation packet design | PHASE-1 | LOCKED | _not created_ | 1.4 |
| **1.6** | TBD — Torob limited execution | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.1** | TBD — Supabase output persistence | PHASE-1 | LOCKED | _not created_ | 1.x complete |
| **2.2** | TBD — UI output display | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.3** | TBD — Retry / Failure / Checkpoint tests | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.4** | TBD — Resource usage test | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.5** | TBD — Phase 1 evidence sync | PHASE-1 | LOCKED | _not created_ | Prior packets |
| **2.6** | TBD — Phase 1 closure / review | PHASE-1 | LOCKED | _not created_ | 2.5 |

---

## Current decision

Packet 1.1 selected **Torob limited** as the first Phase 1 module.

Packet 1.2 locked the Phase 1 scope.

Packet 1.3 defined the Worker Runtime boundary only.

Packet 1.4 defines the Plugin / Driver SDK boundary only; it does not implement any Driver.

---

## Related

- [TPC-1-001](./task-packets/TPC-1-001-phase1-packet-1.1-planning-and-first-module-selection.md)
- [TPC-1-002](./task-packets/TPC-1-002-phase1-scope-lock.md)
- [TPC-1-003](./task-packets/TPC-1-003-worker-runtime-boundary.md)
- [TPC-1-004](./task-packets/TPC-1-004-plugin-driver-sdk-boundary.md)
- [Packet 1.1 acceptance](../baseline/PHASE1_PACKET_1_1_ACCEPTANCE_2026_06_07.md)
- [Packet 1.2 acceptance](../baseline/PHASE1_PACKET_1_2_ACCEPTANCE_2026_06_07.md)
- [Packet 1.3 acceptance](../baseline/PHASE1_PACKET_1_3_ACCEPTANCE_2026_06_07.md)
- [Phase 0 acceptance](../baseline/PHASE0_ACCEPTANCE_SIGNOFF_2026_06_07.md)
