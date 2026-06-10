# TPC-2-001 — Phase 2 Unlock and Torob Limited Read-Only Gate

Status: ready for review.

Goal:
- Define the first Phase 2 planning gate.
- Keep any future Torob work limited, read-only, and explicitly approved.

This packet does not implement real execution.

Prerequisites:
- Phase 1 Implementation Acceptance is merged.
- Phase 2 Planning Baseline is reviewed.

Allowed after this packet is accepted:
- design a limited Torob read-only flow
- define test product count
- define output fields
- define safety limits
- define rollback and evidence requirements

Not allowed here:
- no live execution
- no browser automation
- no login
- no bypass
- no scheduler
- no bulk crawl
- no messaging
- no secrets

Initial future limit:
- 3 to 5 test products maximum
- read-only
- no scale
- no production schedule

Acceptance:
- scope is explicit
- limits are explicit
- forbidden actions are explicit
- next implementation requires a separate approved packet
