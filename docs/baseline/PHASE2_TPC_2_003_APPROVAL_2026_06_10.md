# Phase 2 — TPC-2-003 Approval

**Date:** 2026-06-10  
**Packet:** `TPC-2-003 — Torob Limited Read-Only Implementation Packet`  
**Related PR:** `#123 — docs(phase2): define torob limited read-only implementation packet`  
**Phase Label:** `PHASE-2`  
**Approval Type:** docs-only implementation packet approval  

---

## 1. Decision

`TPC-2-003` is approved as the controlling packet for the next Phase 2 implementation step.

This approval does **not** authorize uncontrolled production automation. It only authorizes opening a separate implementation PR that stays within the allowed files and limits defined in `TPC-2-003`.

---

## 2. Review Summary

The merged packet satisfies the required gate conditions:

1. Phase 0 is accepted.
2. Phase 1 Planning / Governance is accepted.
3. Phase 1 Implementation is accepted.
4. Phase 2 Planning Baseline is merged.
5. `TPC-2-001` is merged.
6. `TPC-2-002` is merged.
7. `TPC-2-003` is merged as a docs-only packet.
8. The Torob scope is limited to read-only execution.
9. The run is limited to 3–5 operator-defined test products.
10. Browser automation is not approved unless a separate ADR/packet approves it.
11. No login, messaging, scheduler, bulk crawl, bypass, secrets, UI, API route, or migration is authorized by this approval.

---

## 3. Approval Table

| Role | Name | Status | Date | Notes |
|------|------|--------|------|-------|
| Owner | محمدرضا افرا | APPROVED | 2026-06-10 | Approved proceeding to the next controlled step after review. |
| Reviewer | Platform Review | REVIEWED / APPROVED | 2026-06-10 | Packet is docs-only and preserves Phase 2 guardrails. |
| Tester | آقای حیدری / آقای طالبی‌زاده | PENDING FOR IMPLEMENTATION | — | Tester evidence is required only after a separate implementation PR/run. |

---

## 4. What This Approval Allows

The next PR may propose a controlled implementation within the paths allowed by `TPC-2-003`, including:

```text
automation/worker-runtime/src/drivers/torob_limited_readonly.py
automation/worker-runtime/src/driver_registry.py
automation/worker-runtime/tests/test_torob_limited_readonly_contract.py
automation/worker-runtime/tests/test_torob_limited_readonly_mock.py
docs/baseline/PHASE2_TOROB_LIMITED_READONLY_EXECUTION_EVIDENCE_YYYY_MM_DD.md
```

The next implementation PR must remain small and reviewable.

---

## 5. What Remains Forbidden

The following remain forbidden unless a new approved packet or ADR explicitly allows them:

```text
login / account / session cookies
messaging
scheduler / cron / always-on worker
bulk crawl / catalog-wide extraction
captcha solving / anti-bot bypass / stealth
ranking manipulation / unnecessary clicks
high-volume requests
browser automation without separate approval
credentials / secrets in repository
production schedule
UI implementation
API route
new migration without separate migration packet
Divar / WhatsApp / Instagram
OCR / STT / AI production
Redis / RabbitMQ / Laravel / parallel API
changing AfraKala product prices from automation output
multi-worker concurrent Torob runs
```

---

## 6. Next Step

Open the next implementation PR for a minimal, guarded Torob read-only driver skeleton and contract tests.

Recommended next PR title:

```text
feat(worker): add torob limited read-only driver skeleton
```

The next PR must not perform a live Torob run unless its implementation scope and tests are explicitly reviewed and accepted.

---

## 7. Final State After This Approval

```text
Phase 2 Planning = MERGED
TPC-2-003 = APPROVED
Phase 2 Execution = still NOT STARTED until implementation PR is approved and evidenced
Torob real execution = still NOT STARTED
```
