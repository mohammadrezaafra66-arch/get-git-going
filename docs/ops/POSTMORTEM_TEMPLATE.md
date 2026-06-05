# Postmortem Template

Use after SEV1/SEV2 incidents or when leadership requests a blameless review.

---

## Postmortem: [Title]

| Field | Value |
|-------|-------|
| **Incident ID** | INC-YYYY-MM-DD-### |
| **Date** | |
| **Authors** | |
| **Status** | Draft / Final |
| **Related incident report** | |

## Summary

2–3 sentences: what happened, duration, user impact.

## Impact

- **Duration:**
- **Scope:**
- **SLA / business impact:**

## Timeline (UTC)

| Time | Event |
|------|-------|
| | |

## Root cause analysis

### What happened

### Why it happened (5 Whys or equivalent)

### Contributing factors

## What went well

-

## What went poorly

-

## Where we got lucky

-

## Action items

| ID | Action | Owner | Priority | Due | Status |
|----|--------|-------|----------|-----|--------|
| | | | | | |

## Architecture guardrails (AfraKala)

Confirm learnings align with baseline:

- Control plane remains this repository (ADR-0001)
- No parallel database introduced as "hotfix" (ADR-0002, ADR-0004)
- Worker issues isolated from web deploy path where possible (ADR-0006)
- Drive not used as remediation store for authoritative data (ADR-0008)

## Lessons learned

-

## Approval

| Role | Name | Date |
|------|------|------|
| Incident commander | | |
| Engineering lead | | |

---

Store final postmortem in GitHub. Mirror to Drive optional.
