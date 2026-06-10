# TPC-2-003 — Torob Limited Read-Only Implementation Packet

**Phase Label:** PHASE-2  
**Packet:** Phase 2 — Torob limited read-only execution authorization  
**Task ID:** TPC-2-003 (Phase 2 track — not Phase 1 Packet 2.3)  
**Status:** READY FOR REVIEW  
**Owner:** محمدرضا افرا  
**Reviewer:** Platform Review / خانم پورچیستا  
**Tester:** آقای حیدری / آقای طالبی‌زاده  
**Created:** 2026-06-10  
**Implementation:** **NOT AUTHORIZED IN THIS PACKET**

> **Naming note:** Phase 1 also has `TPC-2-003-retry-failure-checkpoint-tests.md` (Packet 2.3). This document is the **Phase 2** Torob implementation packet. Always cite the full filename.

---

## 1. Goal

Define the **first authorized implementation packet** for Phase 2 Torob limited **read-only** execution.

This packet:

- Translates [TPC-2-002](./TPC-2-002-torob-limited-readonly-design.md) design into an executable scope boundary.
- Specifies test products, inputs, outputs, limits, tests, evidence, rollback, and stop conditions.
- **Does not** implement code, migrations, UI, API routes, drivers, or external calls.

**Rule:** No real Torob execution is allowed until **this packet is reviewed, approved, and merged**. The next PR after merge may propose controlled implementation only within the Allowed Files listed below.

---

## 2. Current State

| Item | Status |
|------|--------|
| Phase 0 | **ACCEPTED** |
| Phase 1 Planning / Governance | **ACCEPTED** |
| Phase 1 Implementation | **ACCEPTED** — [PHASE1_IMPLEMENTATION_ACCEPTANCE_2026_06_10.md](../../baseline/PHASE1_IMPLEMENTATION_ACCEPTANCE_2026_06_10.md) |
| Phase 2 Planning Baseline | **MERGED** — [PHASE2_PLANNING_BASELINE_2026_06_10.md](../../baseline/PHASE2_PLANNING_BASELINE_2026_06_10.md) |
| TPC-2-001 Phase 2 unlock gate | **MERGED** — [TPC-2-001-phase2-unlock-torob-readonly-gate.md](./TPC-2-001-phase2-unlock-torob-readonly-gate.md) |
| TPC-2-002 Torob read-only design | **MERGED** — [TPC-2-002-torob-limited-readonly-design.md](./TPC-2-002-torob-limited-readonly-design.md) |
| Phase 2 Execution | **NOT STARTED** |
| Torob real execution | **NOT STARTED** |
| Browser automation | **NOT APPROVED** |
| Worker Runtime | Mock / contract tests only — no real source driver |

---

## 3. Scope

If this packet is **approved** and a **separate implementation PR** is opened, that PR may only:

1. Add a **read-only** Torob limited driver under Worker Runtime (no write actions to Torob).
2. Process **3 to 5 operator-defined test products** per run (see §6).
3. Use **Torob as the sole external source** for that run.
4. Emit normalized output fields defined in §8.
5. Persist results via existing automation output tables (see §9).
6. Run **manually / local / staging** — one controlled run at a time.
7. Record evidence in `docs/baseline/PHASE2_TOROB_LIMITED_READONLY_EXECUTION_EVIDENCE_YYYY_MM_DD.md`.

---

## 4. Out of Scope

Forbidden in this packet and in any implementation PR unless a **new approved packet** says otherwise:

| # | Forbidden |
|---|-----------|
| 1 | Login / account / session cookies |
| 2 | Messaging (WhatsApp, SMS, email bots) |
| 3 | Scheduler / cron / always-on worker |
| 4 | Bulk crawl / catalog-wide extraction |
| 5 | Bypass (CAPTCHA solving, anti-bot evasion, stealth) |
| 6 | Ranking manipulation / unnecessary clicks |
| 7 | High-volume requests |
| 8 | Browser automation (Playwright/Puppeteer/Selenium) **unless separately approved** |
| 9 | Credentials / secrets in repo |
| 10 | Production schedule |
| 11 | UI implementation |
| 12 | API route |
| 13 | Migration **without separate migration packet** |
| 14 | Divar / WhatsApp / Instagram |
| 15 | OCR / STT / AI production |
| 16 | Redis / RabbitMQ / Laravel / parallel API |
| 17 | Changing AfraKala product prices from automation output |
| 18 | Multi-worker concurrent Torob runs |

---

## 5. Source Rules

| Rule | Value |
|------|-------|
| **Source** | `torob` only — no secondary marketplace in same run |
| **Mode** | `read-only` — fetch/public page read only; no POST that changes Torob state |
| **Transport** | Prefer minimal HTTP fetch of public product pages **if** legal, stable, and approved in implementation review; otherwise **stop** and request browser-automation ADR/packet |
| **Authentication** | None — no login flow |
| **Rate** | Human-scale, low frequency (see §7) |
| **User-Agent** | Honest, identifiable operator agent string — no impersonation |
| **Robots / ToS** | Operator must confirm read-only test is permitted before first live run; abort if blocked |

---

## 6. Product Limit

**Maximum:** 5 test products per run. **Minimum for evidence:** 3 products (one full evidence run must cover at least 3).

Operator-defined test catalog (placeholders — URLs supplied at run time via job payload, **not** committed to repo):

| test_product_id | display_name (sample) | notes |
|-----------------|----------------------|-------|
| `torob-test-001` | Sample product A | Operator provides `product_url` or search key in job payload |
| `torob-test-002` | Sample product B | Same |
| `torob-test-003` | Sample product C | Same |
| `torob-test-004` | Sample product D | Optional 4th |
| `torob-test-005` | Sample product E | Optional 5th |

Rules:

- URLs/identifiers are **runtime input only** — never stored in git.
- No production catalog sync in this packet.
- No automatic discovery of new products.

---

## 7. Allowed Inputs

Job envelope (conceptual — implementation must validate):

```json
{
  "job_type": "TOROB_LIMITED_READONLY",
  "module": "torob_limited_readonly",
  "source": "torob",
  "mode": "read-only",
  "items": [
    {
      "test_product_id": "torob-test-001",
      "product_name": "operator-supplied name",
      "product_url": "operator-supplied public URL"
    }
  ],
  "limits": {
    "max_products": 5,
    "min_products_for_evidence": 3,
    "max_sellers_per_product": 3,
    "max_concurrency": 1,
    "min_delay_ms_between_requests": 2000,
    "timeout_seconds_per_product": 60,
    "max_total_run_seconds": 300
  },
  "requested_by": "admin user id (server-side)"
}
```

Validation:

- Reject if `items.length > 5` or `items.length < 1`.
- Reject if `source !== "torob"` or `mode !== "read-only"`.
- Reject unknown `job_type` / `module`.

---

## 8. Allowed Outputs

Per product/seller row (normalized):

| Field | Type | Required |
|-------|------|----------|
| `job_id` | uuid | yes |
| `run_id` | uuid | yes |
| `source` | `"torob"` | yes |
| `test_product_id` | string | yes |
| `product_name` | string | yes |
| `product_url` | string | yes |
| `seller_name` | string | if available |
| `price` | number/string | if available |
| `availability_status` | enum | if available |
| `extracted_at` | timestamptz | yes |
| `status` | `ok` \| `partial` \| `failed` | yes |
| `error_code` | string | on failure |

Run-level summary:

```json
{
  "job_id": "...",
  "run_id": "...",
  "driver_id": "torob_limited_readonly",
  "source": "torob",
  "mode": "read-only",
  "items_requested": 3,
  "items_succeeded": 0,
  "items_failed": 0,
  "real_bot_scope": true,
  "read_only_confirmed": true
}
```

---

## 9. Persistence Decision

| Decision | Choice |
|----------|--------|
| **Primary SoT** | Supabase / PostgreSQL (ADR-0002) |
| **Job / run** | Existing `automation_jobs`, `automation_job_runs` |
| **Driver output** | Existing `automation_driver_outputs` (from TPC-I-003 migration) |
| **Events / checkpoints** | Existing `automation_log_events`, `automation_checkpoints` |
| **New migration** | **Not authorized** in implementation PR unless separate migration packet approved |
| **Excel / Sheet / Drive** | Not authoritative — evidence export only |

Payload in `automation_driver_outputs.payload` must include `job_id`, `run_id`, `source`, `test_product_id`, and normalized fields from §8.

---

## 10. Duplicate Rule

| Layer | Rule |
|-------|------|
| **Job enqueue** | `automation_jobs.idempotency_key` UNIQUE — same key must not create duplicate PENDING job |
| **Run** | One active RUNNING run per job |
| **Output row** | Upsert or skip-if-exists on `(run_id, test_product_id, seller_name, source)` — no duplicate seller rows for same run |
| **Re-run** | New run requires new `run_id`; do not overwrite completed run outputs silently |
| **Evidence** | Evidence doc must cite commit + run_id; duplicate evidence runs must note idempotency behavior |

---

## 11. Evidence Requirement

After first approved implementation run, create:

```text
docs/baseline/PHASE2_TOROB_LIMITED_READONLY_EXECUTION_EVIDENCE_YYYY_MM_DD.md
```

Minimum evidence (no secrets):

| Field | Required |
|-------|----------|
| branch / PR / commit | yes |
| environment (local/staging/LAN) | yes |
| operator role | yes |
| job_id, run_id | yes |
| product count (3–5) | yes |
| per-product status summary | yes |
| request count / timing summary | yes |
| `read_only_confirmed` | yes |
| `real_bot_scope` | yes (limited Torob read-only) |
| no login / no scheduler / no bulk | yes |
| no secrets in repo | yes |
| test command | yes |
| build/lint result | yes |

---

## 12. Test Plan

### This packet (docs-only review)

1. Phase 1 Implementation Acceptance merged.
2. Phase 2 Planning Baseline merged.
3. TPC-2-001 and TPC-2-002 merged.
4. Scope is read-only Torob only.
5. Product limit 3–5 explicit.
6. Forbidden list matches Phase 2 baseline.
7. No code/migration/UI changes in this PR.

### Future implementation PR (after this packet merge + approval)

1. Contract test: driver rejects invalid input (6th product, wrong source).
2. Mock/stub test: no network — validates output shape.
3. Controlled live test: **3 products minimum**, staging/LAN, operator present.
4. Verify rows in `automation_driver_outputs` with `job_id` + `run_id`.
5. Verify checkpoints and log events.
6. Verify no credentials in logs or repo.
7. Verify request count ≤ limits in §7.
8. Abort test if Torob blocks or rate-limits — record in evidence, do not bypass.

---

## 13. Acceptance Criteria

This **packet document** is accepted when:

1. `TPC-2-003-torob-limited-readonly-implementation-packet.md` exists.
2. `docs/automation/phase2/README.md` links to this packet.
3. All sections §1–§19 are complete.
4. Phase 2 prerequisites referenced.
5. Implementation remains **NOT STARTED** in this PR.
6. No forbidden files changed.
7. No secrets recorded.

Implementation may begin only after:

1. This packet merged.
2. Owner + Reviewer approval recorded in §18.
3. Separate implementation PR opened within Allowed Files (§15).

---

## 14. Stop Conditions

Stop immediately and do **not** merge implementation if:

1. Login or CAPTCHA required to proceed.
2. Need for browser automation without separate approval.
3. Need for migration not covered by existing tables.
4. Need for scheduler or bulk crawl.
5. Request volume exceeds §7 limits.
6. Torob ToS / robots blocks read-only test path.
7. Any secret would need to be committed.
8. Scope expands beyond 5 test products.
9. Second source (Divar, etc.) requested in same run.
10. UI or API route requested in same PR.

---

## 15. Allowed Files

### This packet PR (docs-only)

```text
docs/automation/task-packets/TPC-2-003-torob-limited-readonly-implementation-packet.md
docs/automation/phase2/README.md
docs/baseline/PHASE2_TOROB_IMPLEMENTATION_PACKET_REVIEW_2026_06_10.md  (optional)
```

### Future implementation PR (after approval — illustrative, must match actual review)

```text
automation/worker-runtime/src/drivers/torob_limited_readonly.py
automation/worker-runtime/src/driver_registry.py  (register driver only)
automation/worker-runtime/tests/test_torob_limited_readonly_contract.py
automation/worker-runtime/tests/test_torob_limited_readonly_mock.py
docs/baseline/PHASE2_TOROB_LIMITED_READONLY_EXECUTION_EVIDENCE_YYYY_MM_DD.md
```

Any path not listed requires explicit amendment to this packet before merge.

---

## 16. Forbidden Files

```text
src/**
src/routes/**
src/components/**
src/lib/**
supabase/migrations/**
automation/openapi/**
openapi/**
package.json
pnpm-lock.yaml
package-lock.json
.env
.env.*
automation/worker-runtime/src/**   (until implementation PR approved)
automation/worker-runtime/tests/** (until implementation PR approved)
```

---

## 17. Owner / Reviewer / Tester

| Role | Name | Responsibility |
|------|------|----------------|
| **Owner** | محمدرضا افرا | Scope approval, stop-condition authority |
| **Reviewer** | Platform Review / خانم پورچیستا | Packet review, implementation gate |
| **Tester** | آقای حیدری / آقای طالبی‌زاده | Evidence verification, controlled live test |

---

## 18. Rollback / Abort Plan

| Scenario | Action |
|----------|--------|
| **Before implementation PR** | Revert or close implementation PR; no runtime impact |
| **During live test** | Operator stops worker; mark run `FAILED` or `CANCELLED`; no retry storm |
| **Bad output persisted** | Delete or mark output rows by `run_id` via admin SQL (service role); document in evidence |
| **Driver misbehaviour** | Disable driver registration; revert implementation commit |
| **Packet scope creep** | Abort run; open new packet — do not expand in-flight |
| **Secrets leaked** | Rotate credentials out-of-band; **never** commit; incident per `docs/ops/INCIDENT_TEMPLATE.md` |

No down-migration required for this packet (docs-only).

---

## 19. Final Decision

### ADR requirement

| Question | Decision |
|----------|----------|
| New ADR required for this packet? | **No** — if implementation stays within ADR-0001, ADR-0002, ADR-0006, ADR-0007, Phase 2 planning baseline, and TPC-2-002 design |
| New ADR required later? | **Yes** if browser automation, proxy rotation, account login, or new persistence tables are needed |

### Packet decision

```text
TPC-2-003 authorizes DEFINITION ONLY in this PR.
After merge + sign-off in §17:
  → A separate implementation PR may propose torob_limited_readonly driver
  → Still read-only, 3–5 products, Torob-only, no scheduler, no bulk
  → No execution before TPC-2-003 approval
Phase 2 Execution status remains NOT STARTED until implementation PR is separately approved and evidenced.
```

### Approval

| Role | Name | Status | Date |
|------|------|--------|------|
| Owner | محمدرضا افرا | PENDING | — |
| Reviewer | Platform Review / خانم پورچیستا | PENDING | — |
| Tester | آقای حیدری / آقای طالبی‌زاده | PENDING | — |

---

## Related

```text
docs/baseline/PHASE2_PLANNING_BASELINE_2026_06_10.md
docs/baseline/PHASE1_IMPLEMENTATION_ACCEPTANCE_2026_06_10.md
docs/automation/task-packets/TPC-2-001-phase2-unlock-torob-readonly-gate.md
docs/automation/task-packets/TPC-2-002-torob-limited-readonly-design.md
docs/automation/task-packets/TPC-1-005-torob-limited-implementation-design.md
docs/automation/task-packets/TPC-1-006-torob-limited-execution.md
docs/process/PHASE_LABEL_POLICY.md
docs/adr/ADR-0006-worker-runtime-boundary.md
docs/process/SOURCE_OF_TRUTH.md
docs/adr/ADR-0008-drive-is-mirror.md
```
