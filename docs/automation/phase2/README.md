# Phase 2 Planning

**Status:** planning baseline merged — Torob skeleton implementation accepted — real execution **NOT STARTED**

Phase 2 execution is not unlocked by this folder alone. Each real execution path requires an approved task packet.

This folder tracks entry gate, scope, roadmap, module candidates, risks, task packets, evidence, and acceptance criteria.

## Current rule

- Planning is allowed after [Phase 1 Implementation Acceptance](../../baseline/PHASE1_IMPLEMENTATION_ACCEPTANCE_2026_06_10.md).
- Real execution requires a separate approved implementation/execution packet.
- Initial source work must stay limited, read-only, explicitly approved, and evidence-backed.
- The Torob skeleton implementation is accepted, but live Torob execution remains locked.
- TPC-2-004 defines the next review gate for first live-readiness/evidence, but does not authorize execution by itself.

## Phase 2 task packets (Torob track)

| ID | Title | Status | File |
|----|-------|--------|------|
| TPC-2-001 | Phase 2 Unlock and Torob Limited Read-Only Gate | merged | [TPC-2-001](../task-packets/TPC-2-001-phase2-unlock-torob-readonly-gate.md) |
| TPC-2-002 | Torob Limited Read-Only Design | merged | [TPC-2-002](../task-packets/TPC-2-002-torob-limited-readonly-design.md) |
| TPC-2-003 | Torob Limited Read-Only Implementation Packet | implementation accepted | [TPC-2-003](../task-packets/TPC-2-003-torob-limited-readonly-implementation-packet.md) |
| TPC-2-004 | Torob Limited Read-Only Execution Evidence Packet | ready for review | [TPC-2-004](../task-packets/TPC-2-004-torob-limited-readonly-execution-evidence-packet.md) |

> **Note:** Phase 1 also uses `TPC-2-00x` IDs for a different track (persistence, UI, tests). Always use the full filename when citing packets.

## Baseline

- [PHASE2_PLANNING_BASELINE_2026_06_10.md](../../baseline/PHASE2_PLANNING_BASELINE_2026_06_10.md)
- [PHASE2_TPC_2_003_APPROVAL_2026_06_10.md](../../baseline/PHASE2_TPC_2_003_APPROVAL_2026_06_10.md)
- [PHASE2_TOROB_LIMITED_READONLY_SKELETON_ACCEPTANCE_2026_06_13.md](../../baseline/PHASE2_TOROB_LIMITED_READONLY_SKELETON_ACCEPTANCE_2026_06_13.md)

## Next step after skeleton acceptance

1. Review and merge [TPC-2-004](../task-packets/TPC-2-004-torob-limited-readonly-execution-evidence-packet.md) before any real Torob request.
2. Keep any future first live run manual, low-volume, read-only, and explicitly approved.
3. Record evidence in `docs/baseline/PHASE2_TOROB_LIMITED_READONLY_EXECUTION_EVIDENCE_YYYY_MM_DD.md` only after the execution packet is approved.

No Torob live execution before the separate execution/evidence packet is reviewed, approved, and merged.
