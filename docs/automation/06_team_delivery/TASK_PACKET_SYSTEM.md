# Task Packet System

Every Phase 0 task must be small, reviewable, testable and traceable.

## Purpose

A Task Packet is the unit of work given to a team member or Cursor.

It prevents broad, vague and unsafe changes.

## Required fields

Each Task Packet must include:

- Task ID
- Title
- Phase label
- Owner
- Reviewer
- Goal
- Allowed files to inspect
- Allowed files to change
- Explicit non-goals
- Acceptance criteria
- Related test case IDs
- Security impact
- Migration impact
- RLS/RBAC impact
- Delivery report requirements

## Phase 0 rule

A Phase 0 Task Packet must not ask for real bots, real scraping, real sending, OCR/STT, AI pipeline, proxy management, browser automation, Laravel core, parallel database, parallel API or parallel panel.

## Workflow

1. Create Task Packet.
2. Check Definition of Ready.
3. Execute only approved scope.
4. Update test case registry.
5. Check Definition of Done.
6. Submit PR for review.
