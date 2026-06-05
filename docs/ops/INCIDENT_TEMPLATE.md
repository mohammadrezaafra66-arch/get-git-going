# Incident Report Template

Copy this template for each incident. Store the canonical copy in GitHub (issue or `docs/ops/incidents/`) — not only on Google Drive.

---

## Incident summary

| Field | Value |
|-------|-------|
| **Incident ID** | INC-YYYY-MM-DD-### |
| **Severity** | SEV1 / SEV2 / SEV3 / SEV4 |
| **Status** | Investigating / Mitigating / Resolved / Monitoring |
| **Start (UTC)** | |
| **End (UTC)** | |
| **Reporter** | |
| **Incident commander** | |

## Impact

- **Users affected:**
- **Services affected:** (web / Supabase / proxy / workers / automation contracts)
- **Data impact:** (none / read-only degradation / write loss / security)
- **Self-host status:**

## Timeline (UTC)

| Time | Event |
|------|-------|
| | Detection |
| | Escalation |
| | Mitigation |
| | Resolution |

## Root cause (initial)

<!-- Update after investigation -->

## Mitigation and fix

<!-- Commands, PRs, rollbacks — no secrets in this doc -->

## Baseline / ADR check

- [ ] Incident did **not** involve unauthorized parallel core or bot deploy
- [ ] Supabase remains source of truth; no manual Drive "fixes" to production data
- [ ] Secrets rotated if exposed (document **that** rotation occurred, not the values)

## Communication

- **Internal:**
- **External (if any):**

## Follow-up

- [ ] Postmortem required? (SEV1/SEV2 → yes)
- **Postmortem link:**
- **Action items:**

---

**Reminder:** Google Drive may mirror this report; GitHub is authoritative.
