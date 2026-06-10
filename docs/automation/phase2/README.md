# Phase 2 Planning

**Status:** planning baseline merged — execution **NOT STARTED**

Phase 2 execution is not unlocked by this folder alone. Each real execution path requires an approved task packet.

This folder tracks entry gate, scope, roadmap, module candidates, risks, task packets, evidence, and acceptance criteria.

## Current rule

- Planning is allowed after [Phase 1 Implementation Acceptance](../../baseline/PHASE1_IMPLEMENTATION_ACCEPTANCE_2026_06_10.md).
- Real execution requires a separate approved implementation packet.
- Initial source work must stay limited, read-only, and explicitly approved.

## Phase 2 task packets (Torob track)

| ID | Title | Status | File |
|----|-------|--------|------|
| TPC-2-001 | Phase 2 Unlock and Torob Limited Read-Only Gate | merged | [TPC-2-001](../task-packets/TPC-2-001-phase2-unlock-torob-readonly-gate.md) |
| TPC-2-002 | Torob Limited Read-Only Design | merged | [TPC-2-002](../task-packets/TPC-2-002-torob-limited-readonly-design.md) |
| TPC-2-003 | Torob Limited Read-Only Implementation Packet | approved | [TPC-2-003](../task-packets/TPC-2-003-torob-limited-readonly-implementation-packet.md) |

> **Note:** Phase 1 also uses `TPC-2-00x` IDs for a different track (persistence, UI, tests). Always use the full filename when citing packets.

## Baseline

- [PHASE2_PLANNING_BASELINE_2026_06_10.md](../../baseline/PHASE2_PLANNING_BASELINE_2026_06_10.md)
- [PHASE2_TPC_2_003_APPROVAL_2026_06_10.md](../../baseline/PHASE2_TPC_2_003_APPROVAL_2026_06_10.md)

## Next step after TPC-2-003 approval

1. Open a **separate** implementation PR within Allowed Files defined in TPC-2-003.
2. Keep the first implementation PR minimal and guarded.
3. Record evidence in `docs/baseline/PHASE2_TOROB_LIMITED_READONLY_EXECUTION_EVIDENCE_YYYY_MM_DD.md`.

No Torob live execution before the separate implementation PR is reviewed and accepted.
