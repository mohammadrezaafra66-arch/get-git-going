# Phase 0 Daily Build Plan

## Purpose

This document defines how the team should execute Phase 0 work day by day without drifting into real automation.

It is a delivery guide for documentation, contracts, schema, and dummy-flow preparation only.

## Scope

The daily plan covers:

- task packet discipline
- ownership and review flow
- allowed Phase 0 work
- daily verification
- stop conditions
- reporting format

## Non-Goals

This plan does not schedule:

- real bot implementation
- real scraping
- real sending
- browser automation
- OCR/STT runtime
- AI runtime
- migrations
- deploy changes
- production integration

## Decisions

1. Phase 0 work must be split into small task packets.
2. Each task must have one owner and one reviewer.
3. Work must stay on the approved branch and PR.
4. PR remains draft until the owner decides otherwise.
5. Daily work must report changed files and safety checks.
6. Any unclear request must stop before code or schema changes.

## Requirements

### Daily start checklist

Before work starts, the owner must confirm:

- target branch is correct
- target files are listed
- no new branch is needed
- no new PR is needed
- no runtime code is requested
- no migration is requested
- no sensitive value is included

### Daily task packet format

Each task packet must include:

- task id
- owner
- reviewer
- target files
- allowed change type
- forbidden work
- acceptance criteria
- verification notes

### Daily work sequence

Recommended Phase 0 sequence:

1. read canonical repo files
2. read target file
3. write only the requested file
4. verify changed file list
5. verify no forbidden files changed
6. report safety checks
7. keep PR draft and unmerged

### Daily review checklist

Reviewer must check:

- file path is correct
- branch is correct
- content matches Phase 0
- no real module was introduced
- no secret-like value was added
- no runtime code changed
- no migration changed
- related files are referenced

## Forbidden Work

Daily Phase 0 work must not include:

- package changes
- deployment changes
- migration changes
- core app runtime changes
- new production services
- live external calls
- real worker execution
- real module implementation
- private credentials

## Phase 0 Acceptance Criteria

This daily plan is accepted when:

1. It gives a repeatable daily execution process.
2. It defines owner and reviewer expectations.
3. It defines stop conditions.
4. It reinforces the Phase 0 boundary.
5. It includes a delivery report format.
6. It does not authorize runtime work.

## Owner / Review Responsibility

- Daily owner: assigned per task packet.
- Reviewer: assigned per task packet.
- Product approval: Mohammadreza Afra.
- Security review: Mohammadreza Afra for sensitive boundaries.

## Related Files

- `docs/automation/00_master/PLATFORM_FLEET_PRINCIPLES.md`
- `docs/automation/02_phases/phase_0/PHASE_0_FLEET_FOUNDATION_TASK_MAP.md`
- `docs/automation/05_security_ops/SLO_LITE_AND_FLEET_MONITORING.md`
- `docs/automation/06_team_delivery/DEFINITION_OF_READY.md`
- `docs/automation/06_team_delivery/DEFINITION_OF_DONE.md`
- `docs/automation/06_team_delivery/TASK_PACKET_SYSTEM.md`
- `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
