# Production handoff — sales-desk / person-dedupe / live caller popup

Prepared from test (`192.168.170.8:3100`) for transfer to production laptop (`192.168.170.10`).

**Test stamp (verify before cutover):** `curl http://192.168.170.8:3100/api/version`

Preflight on test (2026-09-16):

- Web `healthy`, commit aligned with `feature/sales-desk` tip at cutover prep
- Bundle markers: حذف گروهی، لینک merge↔cleanup، `ami_ring` / `ring-popup`
- Ledger has person `120000`–`123000` and ring `160000`–`162000`
- `person_detect_merge_candidates(NULL)` OK; `call_ring_events` + `call_logs` receiving data
- Host tasks windowless via `wscript` + `run-ps-hidden.vbs`: CelRing / Import / Pricing

Branch / PR: `feature/sales-desk`, [#451](https://github.com/mohammadrezaafra66-arch/get-git-going/pull/451) → `staging`.

---

## What was built / fixed on the test host

### A. App / UI (inside the web container)

| Capability | Where |
|---|---|
| Sales desk (۹ نیاز فروش) | `/operations/sales-desk` |
| Caller popup — inbound + outbound, panel from **left** | `CallerInboundPopup` (Sheet `side=left`) |
| Sidebar pin **میز فروش** next to **تیکت** | `AppSidebar` → `/operations/sales-desk` |
| Live ring feed (not CDR-only) | `call_ring_events` via `recent-calls.ts` |
| Call activity page updates | `/operations/call-activity` |
| Person hard-identity gate + merge candidates | create/merge RPCs |
| Bulk person cleanup | `/admin/persons-cleanup` |
| Cross-link merge ↔ cleanup | `/persons/merge` |
| Hook for CEL/AMI ingest | `POST /api/public/hooks/issabel-ami-ring` |
| Pricing queue auto-publish (host worker) | `process-pricing-queue` + task |

### B. Database migrations (applied on LAN DB `afrakala`)

**Sales desk**

1. `20260916030000_545_sales_interactions.sql`
2. `20260916031000_546_sales_interaction_rpcs.sql`
3. `20260916032000_547_sales_interaction_assign_notify.sql`
4. `20260916033000_548_sales_interactions_lock_author_id.sql`

**Person identity / cleanup**

5. `20260916120000_548_person_create_hard_identity_gate.sql`
6. `20260916121000_549_person_detect_merge_candidates.sql`
7. `20260916122000_550_person_hard_identity_deferred_gate.sql`
8. `20260916123000_551_person_delete_audit_entity_type.sql`

**Live ring**

9. `20260916160000_552_call_ring_events.sql`
10. `20260916161000_553_call_ring_events_source.sql`
11. `20260916162000_554_call_ring_events_direction.sql`

**Pricing auto-enqueue (if not already on prod)**

12. `20260916170000_554_enqueue_on_settlement_and_sale_price_types.sql`

(Also on this branch: work-calm migrations `550_work_*` / `551_work_*` — only if that feature is going live too.)

### C. Host scripts / Windows tasks (test PC — not inside Docker)

| Artifact | Role |
|---|---|
| `deploy/lan/scripts/issabel-cel-ring-poller.mjs` | CEL → ring hook (~1s) |
| `deploy/lan/scripts/issabel-cel-ring-poller-run.ps1` | Hidden node loop (`CreateNoWindow`) |
| `deploy/lan/scripts/issabel-ami-listener.mjs` | Optional true AMI (needs credentials) |
| `deploy/lan/scripts/issabel-import-live.ps1` | CDR import every 2 min |
| `deploy/lan/scripts/pricing-worker-live.ps1` | Pricing queue every 1 min |
| `deploy/lan/scripts/run-ps-hidden.vbs` | **No console flash** (wscript style 0) |
| `deploy/lan/scripts/hide-afrakala-live-tasks.ps1` | Rebind tasks to wscript |
| `register-*-task.ps1` | One-time task registration |
| `docs/ops/issabel-ami-listener-setup.md` | AMI/CEL setup |
| `docs/ops/issabel-production-config.md` | Prod Issabel env gap |

**Tasks on test (windowless):**

- `AfraKala-IssabelCelRing`
- `AfraKala-IssabelImport-Live`
- `AfraKala-PricingWorker-Live`

### D. Still NOT done on test (optional)

- **AMI credentials empty** (`ISSABEL_AMI_USER` / `SECRET`) — live popup uses **CEL**, not AMI.
- AMI `permit=` on PBX still points at test IP `192.168.170.8` if you add AMI later; prod needs `192.168.170.10`.

---

## Do on production laptop (`192.168.170.10`) — in order

### 0. Pick the tree that actually runs

Production has **two** clones; only one autostarts (see `docs/ops/issabel-production-config.md`):

- `C:\afrakala`
- `C:\AfraKalaServer\get-git-going01lan\deploy\lan` ← often the live one

Work only in the autostarted tree (or keep both in lockstep).

### 1. Code

```powershell
# on production, in the live clone root
git fetch origin
# after PR #451 merges to staging/main — pull that tip
git checkout <merged-branch>
git pull
```

Until merge: you can temporarily `git checkout feature/sales-desk && git pull` on prod for a controlled cutover window.

### 2. Migrations (owner-approved; prod DB name is usually `postgres`)

Apply with `supabase_admin` + stdin path (AGENTS.md), ledger row each time. **Skip any version already in `supabase_migrations.schema_migrations`.**

Order: list in section B above (545 → … → 554 direction → pricing enqueue if needed).

Then:

```sql
SELECT public.person_detect_merge_candidates(NULL);
NOTIFY pgrst, 'reload schema';
```

### 3. Env + compose (critical gap on prod today)

On prod, `ISSABEL_*` / import token were historically **absent** → `call_logs` empty.

1. Diff `deploy/lan/docker-compose.yml` against this branch (Issabel + pricing env blocks).
2. Fill `deploy/lan/.env.lan` on prod only (never commit):

```
ISSABEL_CDR_HOST=192.168.170.252
ISSABEL_CDR_PORT=3306
ISSABEL_CDR_USER=...
ISSABEL_CDR_PASSWORD=...
ISSABEL_CDR_DB=asteriskcdrdb
ISSABEL_IMPORT_WORKER_TOKEN=<new long random>
PRICING_WORKER_TOKEN=<new long random>
# AMI optional:
# ISSABEL_AMI_HOST=192.168.170.252
# ISSABEL_AMI_PORT=5038
# ISSABEL_AMI_USER=...
# ISSABEL_AMI_SECRET=...
```

3. MySQL RO user on Issabel must `permit` **`192.168.170.10`** (not only `.8`) — see `issabel-production-config.md`.
4. Firewall on PBX: allow `3306` from `192.168.170.10/32`.

### 4. Web (build ON production — never copy LAN image)

```powershell
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml `
  up -d --no-deps --build web
```

Verify:

```powershell
curl http://127.0.0.1:3100/api/version
# commit must match HEAD; environment lan
```

### 5. Host tasks (windowless)

```powershell
# Admin PowerShell, from live clone
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\register-issabel-import-live-task.ps1
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\register-issabel-cel-ring-task.ps1
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\register-pricing-worker-live-task.ps1
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\hide-afrakala-live-tasks.ps1
```

Confirm tasks use `wscript.exe` + `run-ps-hidden.vbs` (no terminal flash).

### 6. Data prerequisites for popup

- `/admin/call-extensions` — map sales extensions (403, 412, …) to employees on **prod**.
- After first import: `call_logs` count > 0.
- After CEL: rows in `call_ring_events`.

### 7. Smoke (15 min)

- [ ] `/operations/sales-desk` loads
- [ ] Inbound call → left popup within ~2s (CEL)
- [ ] Outbound dial → popup «تماس خروجی»
- [ ] No PowerShell window flashing every minute
- [ ] `/admin/persons-cleanup` + merge gate
- [ ] Pricing worker log: HTTP 200 (if queue used)

---

## Do not

- Reuse `afrakala-app:lan` built on the test PC.
- `docker compose down -v` on production.
- Auto-merge persons.
- Point AMI `permit=` only at `.8` when prod is `.10`.
- Commit `.env.lan` secrets.

---

## Remaining work summary (before cutover)

| # | Item | Owner |
|---|---|---|
| 1 | Merge PR #451 → staging → main (or deploy `feature/sales-desk` intentionally) | git |
| 2 | Apply missing migrations on prod DB | DBA / owner |
| 3 | Fill `ISSABEL_*` + tokens in **live** prod `.env.lan` + compose diff | ops |
| 4 | Issabel MySQL user + firewall for `192.168.170.10` | PBX admin |
| 5 | Rebuild web **on** prod (`--no-deps --build web`) | ops |
| 6 | Register windowless CelRing / Import / Pricing tasks | ops |
| 7 | Map `call_log_extensions` on prod | sales admin |
| 8 | (Optional) AMI user + secret for sub-second push | PBX + ops |
| 9 | Decide which of the two prod clones is canonical | owner |

Test host (`192.168.170.8:3100`) is the reference implementation; treat it as the golden config to mirror, not as an image to copy.
