# TPC-I-014-IMPLEMENTATION — Worker Follow-up Packet

**Phase Label:** PHASE-1-IMPLEMENTATION  
**Packet Status:** READY FOR REVIEW  
**Source of Truth:** GitHub

---

## 1. Goal

Define the concrete packet for the next controlled Worker Runtime follow-up step after TPC-I-014 was accepted.

This packet is docs-only and does not change runtime code.

---

## 2. Completed Before This Packet

```text
TPC-I-013 implementation = merged
TPC-I-013 tests = passed
TPC-I-013 test evidence = merged
Issue #109 = closed
TPC-I-014 next gate = merged
TPC-I-014 review note = merged
```

---

## 3. Allowed Scope For A Future Implementation PR

A future implementation PR may only extend the controlled Worker Runtime mock boundary.

Allowed future files:

```text
automation/worker-runtime/src/supabase_client.py
automation/worker-runtime/tests/test_controlled_worker_follow_up_contract.py
automation/worker-runtime/README.md
docs/baseline/TPC_I_014_WORKER_FOLLOW_UP_EVIDENCE_2026_06_09.md
```

Optional packet update:

```text
docs/automation/task-packets/TPC-I-014-IMPLEMENTATION-worker-follow-up.md
```

---

## 4. Forbidden For This Packet

```text
No runtime code change in this packet
No database schema change
No UI change
No API route
No browser automation
No live source call
No scheduled production run
No private runtime values
```

---

## 5. Future Test Requirement

Future implementation must run:

```bash
cd automation/worker-runtime
python -m pip install -e ".[dev]"
python -m pytest -q
```

---

## 6. Acceptance Criteria

```text
Future boundary is explicit
Allowed files are explicit
Forbidden areas are explicit
Test command is explicit
This packet has no implementation
```

---

## 7. Final Decision

```text
TPC-I-014-IMPLEMENTATION = READY FOR REVIEW
Next action after acceptance = implementation PR inside allowed files only
```