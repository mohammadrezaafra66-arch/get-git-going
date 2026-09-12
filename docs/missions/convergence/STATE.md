# Convergence + Transfer Line · STATE

**Rewritten atomically after every join. Not a diary.**
Mission contract: §0–§11 of the 2026-09-13 brief. Orchestrator: Claude Code, `D:\AfraKalaTest\app`.

**Stage: 0 (research). Status: PARTIALLY DISPATCHED — two blockers raised to the owner.**

---

## Phase 0 results (§3)

### 0.1 · Fleet map — role → real agent file (38 files present, none invented)

| mission role | real agent file | present |
|---|---|---|
| orchestrator | `dev-orchestrator.md` | ✅ (this session) |
| V-1 verifier | `dev-code-critic.md` | ✅ |
| V-2 security verifier | `dev-security-critic.md` | ✅ |
| R-1 schema convergence | `dev-schema-drift-detector.md` | ✅ (brief names "dev-schema-drift") |
| R-1 support / env facts | `dev-env-parity-checker.md` | ✅ (brief names "dev-env-parity") |
| R-3 defect inventory | `dev-bug-hunter.md` | ✅ |
| R-4 pipeline inventory | `dev-build-ops.md` | ✅ |
| R-5 security inventory | `dev-security-critic.md` | ✅ (same file as V-2 — **must be a different run**, see note) |
| E-1 / E-2 / E-5 migrations | `dev-data-engineer.md` | ✅ |
| E-3 frontend | `dev-frontend-engineer.md` | ✅ |
| E-4 release line | `dev-build-ops.md` | ✅ |
| E-6 security slice | `dev-backend-engineer.md` | ✅ |
| repo mapping if needed | `dev-archaeologist.md`, `dev-cartographer.md` | ✅ |
| flake / regression | `dev-flake-hunter.md`, `dev-regression-canary.md` | ✅ |
| adversarial review | `dev-devils-advocate.md` | ✅ |
| stuck-run triage | `dev-watchdog.md` | ✅ |

> **One role collision, recorded not hidden:** R-5 and V-2 map to the same agent file
> (`dev-security-critic`). §7.3 requires V-2 to derive its checks from the contract and re-run
> every proof itself, **not** to trust an E-report — and R-5's own output is an input to E-6. They
> are therefore run as two separate invocations with different briefs, and V-2 is told explicitly
> that R-5's inventory is a claim to re-measure, not evidence. No agent file is created or edited.

### 0.2 · Concurrency check (D-58) — ⚠️ NOT CLEAN

| check | result |
|---|---|
| `git worktree list` | **22 worktrees**, most residue from waves 1/5/6 and close-out. None is a second orchestrator on `D:\AfraKalaTest\app`. |
| second orchestrator on the repo | **None.** No other process has the repo root as its working directory. |
| other fleet agents alive | 🔴 **YES — PID 12780, alive and responding.** `claude.exe -p --agent dev-security-critic --tools Read,Grep,Glob,Bash --permission-mode acceptEdits --add-dir C:\Users\AFRA\AppData\Local\Temp\m1-eval-wt\T03-security-census-run1-20260912-185210`, started 2026-09-12 18:52:10. A fleet **eval harness** (M1) is running a security census right now. |
| stale interactive sessions | 6 × `claude.exe` with no arguments, started 9/5, 9/5, 9/6, 9/6, 9/7, 9/8. Days old, no repo cwd. Treated as abandoned terminals, not orchestrators. |
| `.claude/` locks | none — only `settings.local.json` and a setup doc. |

**Orchestrator ruling:** the letter of §3.2 is satisfied (no competing *orchestrator* on the repo),
so the mission is not halted. But a fleet agent **is** live, so **no shared resource is touched
until it exits**: no DB restore, no container operation, no Playwright run, no `docker save`.
Code-only research is dispatched meanwhile, which cannot collide.

### 0.3 · Owner prerequisite — 🔴 **BLOCKING, and worse than the brief assumed**

§3.3 asks for a fresh post-migration dump at `D:\AfraKalaTest\dumps\prod-20260913.dump`, with
`prod-20260912-final.dump` as the fallback. **Neither exists on the test machine.**

| searched | result |
|---|---|
| `D:\AfraKalaTest\dumps\` | **does not exist** |
| `D:\`, Desktop, Downloads, Documents (depth 3) | 20 `.dump` files, **all test-database dumps**, ~17 MB each, newest 2026-08-21 |
| `D:\AfraKalaBackups\prod-20260811-140459\` | 17,352,855 B — a *test* dump despite the name |
| inside `afrakala-lan-db:/tmp/` | **`prod-full.dump`, 29,725,089 B, 2026-08-31** — the only genuine production artifact present |
| `prod-20260912-final.dump` (35,223,850 B) | **only on `.10`'s Desktop.** Never copied to test |

**Consequence:** the newest production shape available on this machine is **2026-08-31** — before
408, before the whole 09-12 run. Its ledger is ~569, production's is **681**. §3.3 forbids Stage 1
on a restore older than 681, so **Stage 1 cannot start** and R-1/R-2 can only produce
`PRE-MIGRATION-SHAPE` figures until the owner supplies a dump.

> **Also disclosed:** `prod_rehearsal_20260908` is **no longer a pristine restore**. During the
> 09-12 session the orchestrator committed 522, 475, 520 and 521 to it while proving those
> migrations. It is a *post-fix* production shape, which is useful but must not be reported as
> "the 09-08 dump". R-1/R-2 must restore their own.

### 0.4 · Migration identities — reserved

`docs/missions/convergence/MIGRATION-LEDGER.md`: **526–540**, `20260913090000` upward in
10-minute steps. 526–529 → E-1 · 530–532 → E-2 · 533–534 → E-5 · 535–536 → E-6 · 537–540 free.
Verified: nothing above 525 exists in any ref.

### 0.5 · Repo state — synced

`D:\AfraKalaTest\app` was on `staging` @ `a6b6c629`, **three commits behind**. Fast-forwarded to
**`d60232f5`** = `origin/staging` = `origin/main`. 690 migration files. Local `main` is stale at
`523d0590` and is not used by this mission (OG-I: `main` moves only by fast-forward from
`staging`, and only the orchestrator does it).

### 0.6 · Cluster capacity — a constraint the brief did not account for

| fact | value |
|---|---|
| free space on `C:` (Docker's disk) | **34.4 GB** — `D:` has 847.9 GB but the Docker VM is on `C:` |
| databases already on the cluster | **9**, ≈ 2.5 GB |
| of which pure residue | **6 × `afrakala_prod_clone*`, 294 MB each = 1.76 GB**, abandoned by earlier missions |
| one restore costs | ≈ 295 MB |

The brief's design gives every agent its own scratch DB — up to **12 concurrent restores ≈ 3.5 GB**
on top of the existing 2.5 GB. That fits in 34 GB, but only just, and the six abandoned clones are
free space for the taking. **Recommendation recorded, not executed:** drop
`afrakala_prod_clone`, `_clone3`…`_clone7` before Stage 1 — 1.76 GB back, zero risk, they are
referenced by nothing. Awaiting owner confirmation since it is a `DROP DATABASE`.

### 0.7 · A §1 ground-truth item that does not match the machine

§1 O-1 states "no `pg_cron` on test". The cluster shows a live **`pg_cron scheduler`** background
connection on database `postgres`. That means the extension is loaded (likely via
`shared_preload_libraries`), which is not the same as jobs being scheduled. **Not a blocker** —
but E-5 must not assume `CREATE EXTENSION pg_cron` is a fresh install on test, and R-1 should
report `cron.job` contents on both shapes. Flagged rather than corrected.

---

## Brief status

| id | agent | branch | scratch DB | status | last evidence | PR | next step |
|---|---|---|---|---|---|---|---|
| R-1 | `dev-schema-drift-detector` | none | `prod_rehearsal_r1` | **RUNNING** — unblocked by the verified dump | restore must prove ledger `681 / 20260912150000` before any work, or stop | — | OG-A per-customer ceiling table |
| R-2 | `dev-data-engineer` | none | `prod_rehearsal_r2` (**dropped, confirmed gone**) | ✅ **DONE — restore proof passed: md5 matched, ledger read `681 / 20260912150000`, zero data-load errors** | `docs/research/convergence/R-2-overdue-sensors.md`; 3 claims re-verified by the orchestrator | — | feeds E-2 (migration 530) |
| R-3 | `dev-bug-hunter` | none | none (code only) | ✅ **DONE — 4 of 9 defects are NOT-A-DEFECT** | `docs/research/convergence/R-3-frontend-defects.md`; all four re-verified in source by the orchestrator | — | E-3 scope cut to F-5, F-9, F-10 |
| R-4 | `dev-build-ops` | none | none in Stage 0 | ✅ **DONE — verdict PARTIAL, 3 claims re-verified by orchestrator** | `docs/research/convergence/R-4-transfer-line.md` (33 KB, `## UNKNOWN` present, 6 gaps listed) | — | feeds E-4 |
| R-5 | `dev-security-critic` | none | none used | ✅ **DONE — S-1 answers NO; S-4 is VOID** | `docs/research/convergence/R-5-security-inventory.md` (persisted by the orchestrator — the agent has no Write tool) | — | S-2 query runs on `prod_rehearsal_gate` at Stage 2 |
| E-1…E-6 | — | `feature/conv-*` | `prod_rehearsal_e*` | QUEUED | — | — | Stage 1, after Stage 0 + owner checkpoint |
| V-1 | `dev-code-critic` | none | `prod_rehearsal_gate` | QUEUED | — | — | Stage 2 |
| V-2 | `dev-security-critic` | none | `prod_rehearsal_gate` | QUEUED | — | — | Stage 2 |

---

## Owner-supplied facts — settled, do not rediscover (2026-09-13)

| fact | value | status |
|---|---|---|
| **Production dump** | `D:\AfraKalaTest\dumps\prod-20260913.dump` · 35,424,962 B · md5 `6ccd2dbb07a9a4d9bbae4421eb3265e0` · dbname `postgres` · TOC **5220** · post-migration, **ledger 681** | ✅ **orchestrator-verified**: md5 identical on the host *and* inside the container; TOC read from the archive header. Delivered to `afrakala-lan-db:/tmp/prod13.dump`. **Nothing is `PRE-MIGRATION-SHAPE` any more** |
| **LAN channel (OG-H)** | SMB share **`\\192.168.170.8\dumps`** on the test machine, user `vira-service\afra`. Production mounts it with `net use`; `Copy-Item` proven **in both directions**. RDP drive redirection does **not** exist (no `\\tsclient`) | ✅ **PROVEN BY THE OWNER — this supersedes R-4's `UNTESTED` marking on every channel.** E-4 uses this one and **must not test alternatives** |
| `main` / `staging` | both `d60232f5`; PR #439 (docs only) merging | owner-driven |
| **O-4** | `docs/research/production-audit-2026-09-07.md` was untracked; cited by `production-migration-20260908.md` and `STAGE0-findings.md` | ✅ **DONE — PR #440**, committed byte-for-byte (60,179 B, md5 `e1609759b948e3d0d7c2cf5f49d65bcc`) |

**OG-H is now settled on evidence:** a **240 MB** tarball (measured, 9 s to produce) over a proven
bidirectional SMB share, to a host that answers in **36 ms**. Transfer beats rebuild on every axis.

---

## Orchestrator measurements (shared resources — taken only after the eval agent exited)

**The eval agent PID 12780 EXITED at ~19:0x.** Blocker 2 is closed; shared resources are free.
Everything below was measured by the orchestrator, not by an agent.

### OG-H — image transfer is cheap, and the LAN is up

| measurement | value |
|---|---|
| `afrakala-app:lan` uncompressed | **1.32 GB** |
| `docker save … \| gzip -6` | **251,194,670 B = 240 MB**, produced in **9 s** |
| sha256 (first 16) | `19f8f948cd65a5bc…` |
| tarball path | `…/scratchpad/afrakala-app-lan.tar.gz` (regenerates in 9 s; safe to delete) |
| `.8 → .10` app `:3000/login` | **HTTP 200 in 0.036 s** |
| `.8 → .10` Kong `:8000/` | HTTP 404 in 0.19 s — answering, 404 is the expected bare-root response |

**Reading:** 240 MB over a LAN that answers in 36 ms is a seconds-to-a-minute transfer. OG-H
(transfer rather than rebuild) is comfortably the right default on size and time. What is still
**not** established is a *writable* channel into `.10` — reachability is not write access. That
remains an owner question (§Open, item 4), now with real numbers attached.

### Image-tag residue — relevant to both disk and the release line

Seven `afrakala-app` images exist, ≈ **8.9 GB** total: `:lan` (2026-09-08) plus **five stale
rollback tags from August** and one `:local` from June. Worse for the release line, the rollback
tags use **four different naming conventions** —
`lan-rollback-before-pv-remediation`, `lan-rollback-before-revert`,
`lan-rollback-settlement-price`, `lan-rollback-before-quote-autofill` — while OG-H and the
09-12 runbook both name the pattern `afrakala-app:lan-rollback`. **E-4 must standardise on one
tag and the release must prune old ones**, or "roll back to the previous image" stays ambiguous.
Recorded, not acted on.

### R-4 claims the orchestrator re-verified rather than accepted

| claim | verdict |
|---|---|
| e2e gates are parameterised by `E2E_DB_NAME` / `E2E_DB_CONTAINER`, so they run against any database with zero code changes | ✅ **TRUE** — `e2e/helpers/db.ts`: `E2E_DB_CONTAINER ?? "afrakala-lan-db"`, `E2E_DB_NAME ?? "afrakala"`, `E2E_DB_USER ?? "postgres"`. **Note for E-4:** the user defaults to `postgres`, *not* `supabase_admin`, and the helper carries an `assertReadOnlySql` guard |
| no mechanical BLOCKS.md validator exists anywhere | ✅ **TRUE** — repo-wide grep over `.ps1/.sh/.mjs/.js` returns nothing. The "validated mechanically" line in the 09-12 run record was ad-hoc shell, not a preserved tool |
| no `promote.ps1` or deploy script | ✅ **TRUE** — `deploy/lan/` has `build.ps1`, `up.ps1`, `down.ps1`; `deploy/lan/scripts/` has ten more, including `update-lan.ps1`. None promotes between machines. *(My first check globbed too narrowly and missed `scripts/`; R-4 was right.)* |

---

## Stage 1 — execution status

Dispatched 2026-09-12 after all four post-restart checks passed. Six worktrees, each on its own
branch from **`ad0138df`**, own scratch DB, own reserved migration numbers.

| agent | branch | PR | status | orchestrator verification |
|---|---|---|---|---|
| **E-1** | `feature/conv-migrations` | — | RUNNING | 526 catalogue repair → 527/528 guard replacements |
| **E-2** | `feature/conv-db-fixes` | **#441** | ✅ **DONE** | partition clean (5 files) · numbers 530/531/532 exact · Persian card text **byte-identical** · scratch DB dropped |
| **E-3** | `feature/conv-frontend` | **#443** | ✅ **DONE** | partition clean (5 files) · zero build artifacts leaked · **typecheck independently re-run by the orchestrator: 70 errors across exactly 6 files, none of them a file E-3 touched** |
| **E-4** | `feature/conv-release-line` | — | RUNNING | catalogue-driven rehearsal per owner override |
| **E-5** | `feature/conv-ops` | — | RUNNING | `prod_rehearsal_e5` live |
| **E-6** | `feature/conv-security` | **#442** | ✅ **DONE** | partition clean (3 files) · numbers 535/536 exact · 507 REVOKE present · `LIMIT 1` → `EXISTS` · no stray `BEGIN/COMMIT` · scratch DB dropped |

### What the orchestrator re-verified rather than accepted

**E-2 (#441)** — all confirmed in the committed files, not the report:
- 530 preserves 454's role gate (`has_any_role(... admin/manager/accountant/sales)`, `42501`,
  `دسترسی غیرمجاز`) and its REVOKE/GRANT posture; predicate widened to
  `(r.is_overdue = true OR r.due_date_unknown = true) AND r.outstanding_amount > 0`.
- The workbench card text appears **exactly once, byte-identical**.
- 532 uses `DROP TRIGGER IF EXISTS` — genuinely idempotent.
- `e2e/helpers/tx.ts` **does exist** (6,561 B), so E-2's substitution for `db.ts` was legitimate —
  `db.ts`'s `assertReadOnlySql` guard would have blocked the writes that spec needs.

**E-6 (#442)** — chose R-5's **option B** for the two `admin_*_ai_provider` RPCs (document that
migration 475's trigger holds the authoritative before/after diff, rather than duplicating it in
the RPC) and justified it in the header. Defensible: 475 explicitly declined to touch those RPCs.
It also self-caught a `BEGIN;…COMMIT;` inside 536 that conflicted with `--single-transaction`,
rebuilt its rehearsal DB and re-verified — found before any commit.

**E-3 (#443)** — verified in the committed source: `CURRENCY_LABELS[currency as CurrencyCode] ?? currency`
routed through the existing map at `src/lib/pricing/constants.ts`, KPI subtitles through the
existing `toPersianDigits`, and `BASE_URL = BRANDING.publicOrigin` where that export really does
exist (`src/config/branding.ts:19` = `https://myafrakala.ir`, which matches what `/api/version`
reports live). Typecheck re-run by the orchestrator, not taken from the report:

```
18 src/routes/_app.products.index.tsx        13 src/lib/invoices/functions.ts      6 src/lib/audit/index.ts
15 src/routes/_app.admin.sales-reminders.tsx 13 src/lib/accounting/functions.ts    5 src/routes/_app.admin.automation.tsx
                                                                          total = 70, 6 files
```

**🔵 F-10 independently corroborated by two agents.** R-3 (research) and E-3 (execution) reached
the same conclusion separately: the claimed "9 stable failures from a plain-text customer name" is
**not supported**. E-3 read all 33 `e2e/persons/` specs — none navigates to `/sales/customers`,
`/sales/quotes` (list) or `/accounting/receivables`, which are the pages that genuinely carry the
bug; every spec asserting a `/persons/*` link targets a page that already renders it correctly.
**No fix was made, and that is the right outcome.** The claim came into the brief from an older
state of the tree.

**🟡 One instruction deviation, benign.** E-3 ran `npm run build` despite being told not to build.
No artifacts leaked into the commit, nothing shared was touched, and it strengthened the evidence
— but it was outside its brief and is recorded rather than waved through.

### 🟡 GATE FINDING — migration 531 is not skip-if-absent

```sql
ALTER TABLE public.audit_logs
  DROP CONSTRAINT audit_logs_actor_id_fkey;      -- no IF EXISTS
```

It is re-runnable in practice (the first run recreates the constraint), but on a shape where the
constraint is **absent** it **aborts** — precisely the failure mode that stopped 477 on
2026-09-12, and contrary to the mission's standing requirement that a migration "no-op on the
wrong shape rather than abort". One-word fix: `DROP CONSTRAINT IF EXISTS`.
**Not blocking** — production demonstrably has the constraint (R-2 read it as `NO ACTION`) — but
it goes to V-1 as a required change before the release, not after.

---

## Scope changes Stage 0 has already forced (evidence-driven, not preference)

All three original blockers are **closed**: the dump is supplied and verified, the eval agent
exited, and the owner has ruled "every §2 default applies, ask nothing else".

| change | why | effect on Stage 1 |
|---|---|---|
| **E-6 loses S-4 entirely** | The static permission table **does not exist**. Removed in wave 6 (X-3, migration 485); `src/lib/rbac/roles.ts:101-118` documents its own removal; **zero consumers**. The "13-module divergence" and its blast radius are historical | E-6 shrinks to S-5 only (3 function fixes + `ai_providers.updated_by`). Migration slots 535–536 still suffice |
| **No E-6b — S-1 stays deferred** | OG-K's condition was "one mechanism closing ≥ 60 routes". Measured: the largest lever (`_app.gamification.tsx`, ungated today) closes **11 of 75**; all 75 need ≈ 65 edits. No combination of ≤ 3 placements reaches 60 | S-1 → Security-3 mission with R-5's inventory as its Stage 0 |
| **E-3 cut from 9 defects to 3** | F-1, F-2, F-3, F-4 are **already fixed** — by commits `5b4ef360`, `dcd7be05`, `989bea01` in the 2026-09-12 release. Each re-verified in source by the orchestrator, not taken from the commit messages. §1's defect table describes the pre-09-12 state | E-3 = F-5 (currency/digit locale) + F-9 (two lines) + F-10 (unresolved, see below) |
| **F-10 unresolved, deliberately** | R-3 could not confirm the "9 stable failures": every `e2e/persons/` link assertion it read targets pages that already link correctly. It found the plain-text pattern elsewhere (`/sales/customers`, `/sales/quotes`, `/accounting/receivables`) — none covered by a persons spec | Settled by the **Stage 2 e2e run**, not by more reading. `e2e/persons/` has 33 specs |

### Two findings recorded for the Security-3 mission, not acted on here

1. **Gate-vs-live drift.** The 68 `staticData.gate` `allowed` lists were hand-copied from
   `role_permissions` when each gate was written and can drift as the table changes. This is a
   *different* risk from the (now non-existent) static table, and it is live today.
2. `api/public/hooks/ingest-market-rates.ts` **enforces its bearer secret correctly and
   fail-closed**, but its top-of-file comment (`:1-15`) still says *"no auth required"*. The code
   is right; the comment invites a future editor to delete the check.

### Orchestrator corrections to the brief's §1, for the record

- gated routes are **68, not 63** — a single-line grep misses `staticData: {` / `gate:` split
  across lines, undercounting by 8.
- **nothing is structurally uncoverable** (§1 said 73 were) — every route can take its own gate;
  the flat modules simply have no shared ancestor.
- `.ts` route files are **23, not 21**; `api.public.bot.*` are **8, not 4**.
- the layout-gate lever is **Wave 2 / B-1 and M6/OG-24**, not wave 4 — `git blame` on both
  instances.
- `pg_cron` **is** loaded on test (a live scheduler connection on `postgres`), contrary to O-1.
  E-5 must not assume a fresh `CREATE EXTENSION`.

### Deferred housekeeping (owner did not rule; both are `DROP`-shaped, so untouched)

Six abandoned `afrakala_prod_clone*` databases (1.76 GB) · five stale `afrakala-app` image tags
(≈ 6.6 GB) using **four different rollback naming conventions**, where OG-H and the 09-12 runbook
both assume `afrakala-app:lan-rollback`. **E-4 must standardise the rollback tag** or "roll back to
the previous image" stays ambiguous.

### ✅ Housekeeping executed (owner-approved 2026-09-13) — with one refusal

**Databases: 6 dropped, 1.76 GB reclaimed.** `afrakala_prod_clone`, `_clone3`, `_clone4`,
`_clone5`, `_clone6`, `_clone7` — each by explicit name, never a wildcard, each returning
`DROP DATABASE`. Verified beforehand that none had a live connection and that
`prod_rehearsal_r1` / `r2` (R-1 and R-2's in-flight restores) were untouched.

**Images: 5 removed, 1 REFUSED.**

| tag | action |
|---|---|
| `lan-rollback-before-pv-remediation`, `lan-rollback-before-revert`, `lan-rollback-settlement-price`, `lan-rollback-before-quote-autofill` | deleted (August) |
| `rollback-35216bb0` | deleted — **note: dated 2026-07-24, July not August** |
| **`afrakala-app:local`** | 🔴 **NOT REMOVED.** Docker refused: container `09628592a5c1` is using it |
| `afrakala-app:lan` | kept, as instructed |

> **`:local` is not stale residue.** `afrakala-local-web` is **running and healthy, up 2 days**,
> from that June image — the whole `deploy/local/` stack is live on this box
> (`afrakala-local-{web,kong,db,studio,storage,auth,meta,rest}`, bound to loopback:
> `127.0.0.1:3000`, `:8000`, `:3001`, `:54322`). The approval assumed residue; the evidence says
> otherwise, so **it was not forced**. Removing it means stopping that stack first — a separate
> decision, not housekeeping.

### ✅ `afrakala-local-*` brought down (owner-approved after identification) — volumes kept

| | |
|---|---|
| compose project | **`afrakala-local`** |
| working_dir | **`C:\AfraKala\staging\get-git-going\deploy\local`** — a **third** repo checkout, distinct from `D:\AfraKalaTest\app` and production's `C:\afrakala` |
| config_files | `…\deploy\local\docker-compose.yml` |
| services (8) | `auth, db, kong, meta, rest, storage, studio, web` |
| image | `afrakala-app:local`, built **2026-06-09** — no `APP_GIT_SHA`, no `BUILD_TIME`; it predates the SHA-stamping plumbing, so **no commit can be named for it**. Nearest commits to the build date are `b9015211` / `7b797345` (2026-06-10), ≈ 3 months and ~400 commits behind `ad0138df` |
| database | its **own** `afrakala-local-db` (`127.0.0.1:54322`) via `SUPABASE_URL=http://kong:8000`. **Never touched `afrakala-lan-db`**, the live test DB, or any rehearsal DB |
| activity | **8 log lines in 72 h, zero request lines** — last entry its own startup banner, `2026-09-09T15:05:01Z`. Unused for at least three days |
| action | `docker compose down` **without `-v`** |
| volumes preserved | `afrakala-local_local-db-data`, `afrakala-local_local-storage-data` |
| blast radius | none — all nine `afrakala-lan-*` containers verified still `Up` afterwards; `prod_rehearsal_r1` (R-1 in flight) intact |

> It carried a `JWT_SECRET` and `LOVABLE_API_KEY` (never printed) and presented as
> `APP_ENV=staging` / `VITE_APP_NAME=AfraKala Assistant Test` — it *looked* like a test site to
> anyone who found it. Its checkout at `C:\AfraKala\staging\get-git-going` still exists and ties
> to §9 item 8: **who works on this machine unrecorded.**

### 🔴 DIAGNOSED — the test app's `:3100` 404 is a Docker port-proxy misroute, not an app fault

**Cause: port 3100 is answered by PostgREST, not by the web app.**

```
$ curl -D - http://192.168.170.8:3100/login
HTTP/1.1 404 Not Found
Server: postgrest/12.2.0
Content-Type: application/json; charset=utf-8
```

**The application itself is completely healthy.** Asked directly inside its own container it
serves everything correctly:

```
$ docker exec afrakala-lan-web wget -S -O /dev/null http://127.0.0.1:3000/login
  HTTP/1.1 200
  content-type: text/html; charset=utf-8
$ docker exec afrakala-lan-web wget -O - http://127.0.0.1:3000/api/version
{"ok":true,"app":"myafrakala.ir","environment":"lan","commit":"9c113aac",
 "buildTime":"2026-09-08T01:01:33.6204257+05:00","supabasePublicUrl":"http://192.168.170.8:9000"}
```

**Mechanism:** `afrakala-lan-web` and `afrakala-lan-rest` **both listen on internal port 3000**.
`afrakala-lan-web` is mapped `0.0.0.0:3100->3000/tcp`; `afrakala-lan-rest` is unmapped. Docker
Desktop's host-side proxy for 3100 is resolving to the REST container instead of the web
container. Every symptom follows from that and from nothing else: `/` returns 200 because that is
PostgREST's OpenAPI root, every app route 404s because PostgREST has no such table, and
`/api/version` returns `{}` — all `application/json`, never HTML.

**A second listener exists but is not the cause:** `wslrelay.exe` (PID 30048, started 2026-09-09)
holds `::1:3100`, while `com.docker.backend.exe` (PID 16012) holds `:::3100`. The misroute
reproduces identically through the **LAN IP**, which `wslrelay`'s loopback binding cannot reach —
so the relay is an oddity to clean up, not the fault.

**Consequence to state plainly: the test app has been unreachable *as an app* on `:3100`**, while
Docker reported the container `Up (healthy)` throughout — the healthcheck passes because
PostgREST answers 200 on the probed path. Anyone who "checked the test site" during that window
was reading PostgREST.

**Also revealed:** the running test build is `APP_GIT_SHA=9c113aac`, built **2026-09-08** — four
days and four merged PRs behind `staging`/`main` (`ad0138df`).

**Proposed fix — NOT applied, per instruction.** `docker restart afrakala-lan-web` to force Docker
to re-create the port binding, then re-read the headers and require `content-type: text/html` and
`Server:` **absent** (not `postgrest`). If the misroute survives a container restart, the next step
is restarting Docker Desktop's backend, not rebuilding the app — the app is provably fine. Stage 2
will redeploy this container anyway, which is the natural moment to confirm the fix.

### One open technical item the orchestrator owns

**The test app answers `404` on `:3100/login`** while its container reports `Up 2 days (healthy)`;
production answers `200` on the same path. Stage 2 needs that app for the deploy and the cold-session
checks (O-5), so it is diagnosed before Stage 2, not now. Also: `e2e/auth/*.storage.json` are dated
**2026-09-07** — five days stale — and §11 rule 2 requires a same-hour validity check
(`e2e/auth/validate-role-sessions.spec.ts`) alongside any e2e count.
