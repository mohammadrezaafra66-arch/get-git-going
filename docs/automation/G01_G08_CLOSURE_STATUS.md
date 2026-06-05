# G-01 … G-08 Closure Status

**Phase Label:** PHASE-0  
**Status:** Tracking  
**Owner:** محمدرضا افرا  
**Blocks Phase 1 until:** All rows `CLOSED`

مرجع: `docs/process/PHASE0_OPEN_QUESTIONS_G01_G08.md`

---

| ID | Topic | Decision file | Closure criteria | Status | Notes |
|----|-------|---------------|------------------|--------|-------|
| G-01 | Core = get-git-going | `docs/adr/ADR-0001-phase0-architecture-freeze.md` | ADR accepted on main | **CLOSED** | |
| G-02 | GitHub SoT, Drive mirror | `docs/process/SOURCE_OF_TRUTH.md` | Policy on main | **CLOSED** | Drive manifest per commit TBD |
| G-03 | UI vs Worker boundary | ADR-0001, ADR-0006 | Task packets separate UI/Worker | **CLOSED** | Enforce per PR |
| G-04 | DB-backed queue | automation migration | Tables exist + dummy uses DB | **CLOSED** | PR #15 merge `9c54ea9`; migration `20260605120000_phase0_automation_tables.sql` + `PHASE0_AUTOMATION_TABLES.md` on main; build PASS; lint baseline debt; RLS reviewed; rollback documented. Runtime dummy E2E → G-08 |
| G-05 | No real bot in Phase 0 | PR template + DoD | PRs attest no real bot | **CLOSED** | Ongoing enforcement |
| G-06 | Control Plane contract | `automation/openapi/automation-v1.yaml` | Canonical path; stub deprecated | **CLOSED** | WPC-0-002; run/events TBD in API packet |
| G-07 | auth/RLS/secrets | `docs/security/SECURITY_BASELINE.md` | Baseline on main | **CLOSED** | Per-migration RLS review |
| G-08 | E2E dummy path | WPC-0-001 | Full path tested without real bot | **OPEN** | Worker + UI packets pending |

---

## Summary

| State | Count |
|-------|-------|
| CLOSED | 7 |
| OPEN | 1 (G-08) |

**Phase 1 entry:** Blocked until G-04 and G-08 are **CLOSED** and `PHASE0_ACCEPTANCE_GATE.md` is signed.

---

## Update protocol

When closing an item:

1. Set Status → `CLOSED`
2. Add evidence link (PR, commit, test log)
3. Update `PHASE0_ACCEPTANCE_GATE.md` row if applicable
