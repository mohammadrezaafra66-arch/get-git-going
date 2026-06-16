# TPC-3-010 — Manual Operator Flow Packet

## Status

Documentation-only planning packet for the next PHASE-3 boundary.

## Background

Confirmed checkpoints:

1. PHASE-3 label compatibility is merged.
2. Local evidence bridge is merged.
3. Guarded contract is merged.
4. Single-row worker step is merged.
5. Local test evidence is recorded.
6. Single-row review is merged.

Latest reported worker-runtime result:

    173 passed in 0.47s

## Goal

Define how an operator should review one controlled evidence row before any future handoff step.

## Scope

Docs only.

No code, UI, API, scheduler, external integration, broad table change, or sensitive value is added by this packet.

## Operator checklist

Before any future handoff step, confirm:

1. branch is based on latest `main`
2. worker-runtime tests are green
3. only one evidence row is reviewed
4. phase label is `PHASE-3`
5. target is `automation_driver_outputs`
6. row summary is safe to record
7. rollback or cleanup note exists
8. reviewer can verify the boundary without guessing

## Stop conditions

Stop if:

1. more than one row is prepared
2. target table is not `automation_driver_outputs`
3. phase label is not `PHASE-3`
4. a UI/API trigger is introduced
5. an automatic job is introduced
6. an external source step is introduced
7. a broad table path is introduced
8. a sensitive value is committed

## Required future evidence

Future work must include:

- focused test output
- full worker-runtime test output
- safe row summary
- confirmation that the step stayed manual
- confirmation that the step stayed single-row

## Acceptance criteria

This packet is accepted when:

1. checklist is documented
2. stop conditions are documented
3. reviewer confirms docs-only scope
4. no implementation is included

## Final decision

TPC-3-010 defines operator review flow only.

It does not authorize automatic behavior or broader writes.
