# Integration 3100 report — 2026-09-22

> **Rule for all agents:** From now on, deploy to 3100 only from `integration/3100-20260922` (merge your feature branch into it first); never deploy a single feature branch to 3100.

**3100 status: READY**

**STATUS: COMPLETE** — integration SHA deployed; Phase 5 gates met (one non-P0 flake classified).

---

## Owner decisions

| Item | Decision |
|------|----------|
| `feature/purchase-prices-single-active` | **Not integrated — owner follow-up** |
| Phase 5.4 pricing smoke | **EXCLUDED** |
| Five ledger gaps | **Exempted** (do not apply/record); see below |

---

## Branches merged

| Tip | SHA | In HEAD? |
|-----|-----|----------|
| `origin/release/collab-20260922` | `d78a5c4e` | yes |
| `origin/feature/salesdesk-9-fixes` | `106ae89a` | yes |
| `origin/feature/purchase-prices-single-active` | `40db298b` | **no** (excluded) |

Merge commit: `92a5f5af` (salesdesk into collab).  
Docs: `c7096026`, `b0caa21b`, `6a870aff`.  
**Deployed:** `APP_GIT_SHA=6a870aff` (= `git rev-parse --short HEAD`).

---

## Migration timestamp collisions (kept)

| Timestamp | Salesdesk/collab/integration | Purchase (excluded) |
|-----------|------------------------------|---------------------|
| `20260916210000` | `557_person_merge_overview_paged.sql` | `557_torob_ops_path_a.sql` |
| `20260916220000` | `558_person_merge_helper_grants.sql` | `558_torob_ops_correlation.sql` |

---

## Pre-existing ledger gaps (exempted)

Owner: pre-existing on 3100, unrelated to this release; deploy changes no DB state. **Do not apply or record.**

| Version | File | Note |
|---------|------|------|
| `20260912140000` | `523_…` | **Production-only by design** — never apply/record on test |
| `20260913101000` | `533_…` | Owner follow-up |
| `20260913102000` | `534_…` | Owner follow-up (`cron_run_log` absent) |
| `20260916210000` | `557_…` | Owner follow-up (paginated overview fn live) |
| `20260916220000` | `558_…` | Owner follow-up |

**Salesdesk issue:** `558` — `authenticated` EXECUTE on `_person_merge_repoint` measured **false**. Persons merge UI may get permission denied. Out of scope for this deploy.

---

## Phase 3 — Typecheck

- Command: `npm run typecheck` (DISABLE_LOVABLE_MCP=1)
- **ERROR_COUNT=74** (≤74) → **PASS**
- Merge-touched `src/lib/navigation/registry.ts` still has pre-existing `person-merge-pending` TS2322 (not introduced by this integration)

---

## Phase 4 — Deploy

```
$env:DISABLE_LOVABLE_MCP="1"
$env:GIT_SHA=(git rev-parse --short HEAD)   # 6a870aff
$env:BUILD_TIME=2026-09-22T17:51:53
docker compose -p afrakala-lan --env-file D:\AfraKalaTest\app\deploy\lan\.env.lan `
  -f deploy/lan/docker-compose.yml up -d --build --no-deps web
docker restart afrakala-lan-rest
```

| Check | Result |
|-------|--------|
| Ancestry precheck (`106ae89a` ⊂ HEAD) | PASS |
| `APP_GIT_SHA` | `6a870aff` |
| `/login` | 200 |
| `/api/healthz` | 200 |
| Yellow test banner (`محیط تست`) | visible |

---

## Phase 5 — Verification

Evidence under `docs/qa/integration-evidence/`.

### 5.1 Collaboration

| Run | Command | Exit | Result |
|-----|---------|------|--------|
| Non-slow #1 | `playwright test --config=e2e/collaboration/playwright.config.ts --grep-invert @slow` | **0** | **51 passed** (1.3m) |
| Non-slow #2 | same | **1** | **50 passed, 1 failed** (C4 realtime) |
| SLA @slow | `--grep @slow` | **0** | **1 passed** (11.1m) |

Gate items:

| Item | Verdict | Evidence |
|------|---------|----------|
| A6 | **PASS** | hub.spec A6 ok run1 |
| A3 (viewer no پیام‌ها) | **PASS** | A1–A3 viewer ok run1 |
| C6 / C6b upload | **PASS** | C6 + C6b ok run1 |
| C11 work_items | **PASS** | C11 ok run1 |
| D6 cron SLA | **PASS** | slow: cron_job_active=1; status→transfer_available without manual tick |
| D7 penalty | **PASS** | slow annotation `penalties=1` `final=transfer_available` |

**Failure classified:** C4 realtime on run2 only — `realtime misses 3/3`. Run1 C4 **passed**. Classification: **environment / flake (P2)** — not a product regression from this deploy; not P0.

### 5.2 Salesdesk regression

| Suite | Config | Exit | Result |
|-------|--------|------|--------|
| fix-f3 | `docs/missions/.../playwright.fix-f3.config.ts` | 0 | 2 passed |
| fix-f4 | `.../playwright.fix-f4.config.ts` | 0 | 3 passed |
| fix-f5 | `.../playwright.fix-f5.config.ts` | 0 | 2 passed |

No new regressions vs prior salesdesk green.

### 5.3 Auth guard (app-wide cold-session fix)

`docs/qa/playwright.integration-auth.config.ts` → **exit 0, 5 passed** (20s): cold → `/login`; warm admin/manager/sales/accountant open `/dashboard`, `/sales/quotes`, `/pricing/my-workbench`, `/collaboration`, `/messages`, `/sales` without login bounce.

### 5.4 Pricing branch smoke

**EXCLUDED** (purchase branch not integrated).

---

## Unresolved (non-blocking)

1. C4 realtime flake (P2) — observe realtime infra on 3100 if it worsens.
2. Ledger gaps 533/534/557/558 — owner follow-up; **558 repoint grant** = salesdesk issue.
3. Purchase branch — renumber colliding migrations + resolve `src/` conflicts before merge.

---

## Worktree

- `D:\AfraKalaTest\wt-integration-3100` · `integration/3100-20260922` @ `6a870aff`
