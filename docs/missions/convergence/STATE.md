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
| V-2 | `dev-security-critic` | none | `prod_rehearsal_gate` | QUEUED | — | — | Stage 2 · **+ og61 baseline (below)** |

### Stage 2 verifier scope — two additions the mission earned

**V-1, first task:** re-run **526's two-pass idempotency proof independently**. The orchestrator
produced that proof while *also* being the one who confirmed the drift it repairs — producer and
gate in one hand, which is weaker than an independent check. Every command is recorded above and
is cheap to repeat. **If V-1 cannot reproduce it, 526 leaves the integration branch** and the
ledger-vs-catalogue repair becomes its own mission.

**V-2, added scope:** run **og61 on a clean integration restore** to establish whether the 8
failures E-5 reported **pre-date this mission**. E-5 proved *non-causation* — the four named
functions have zero mentions in 533/534 — but non-causation is not prior state. **That gap stays
open until measured.**

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

## 🔴🔴 MISSION-CHANGING — production does NOT deploy from `C:\afrakala` (owner, 2026-09-12)

§1 of the brief is **wrong**, and so is a premise the 2026-09-12 release was run on.

A Windows scheduled task **"AfraKala LAN Auto Start"** runs `start-afrakala-lan.ps1`:

```powershell
cd "C:\AfraKalaServer\get-git-going01lan\deploy\lan"
docker compose --env-file .env.lan up -d        # NOTE: no --no-deps
```

Container labels confirm it: project `afrakala-lan`, working_dir
**`C:\AfraKalaServer\get-git-going01lan\deploy\lan`**. It **recreated `afrakala-lan-web` at 16:43
on 2026-09-12 — after our deploy.**

**There are two compose trees on the production host**, and the one we deploy from is not the one
the machine restarts from. The *image* is shared, so `APP_GIT_SHA` is still `d60232f5` and the app
is healthy — but the **env file comes from the other tree**. Measured inside the running container:

```
ISSABEL*=0   OLLAMA*=0   WHATSAPP*=0   MARKETING*=0
```

> **What this does to the 09-12 release record.** Block 71's verification was true when taken —
> but the container was **recreated afterwards from a different `.env.lan`**. For anything
> env-derived, "verified at deploy" does not imply "true now". The SHA check survives because the
> image is shared; nothing env-shaped does.

### Corrections this forces

| item | was | is |
|---|---|---|
| **O-3** (OCR dark) | "Ollama vision times out since 2026-08-28" | **The container has no Ollama address at all** (`OLLAMA*=0`). The timeout may also be true, but it is not the operative cause |
| **F-6** (healthz whatsapp `TypeError`) | suspected code defect; E-3 called it intentional soft behaviour | **A config gap** — `WHATSAPP*=0`. **E-3 correctly did NOT touch it**, so no code was wrongly changed. Its *reasoning* ("configured-but-unreachable") was wrong; its *action* was right |
| **Owner task 1** (extension mapping) | pending | **BLOCKED.** `call_logs` and `call_log_extensions` are both **0 rows** on production — the importer has never run, because its token never reached the container |
| **E-4 scope** | build a release line | must target **the tree the autostart actually uses**, or repoint the scheduled task at one canonical tree; plus a RELEASE.md block reconciling the two `.env.lan` files and removing the unguarded `up -d` (no `--no-deps`) from `start-afrakala-lan.ps1` |

**The unguarded `up -d` is a live hazard.** CLAUDE.md documents that without `--no-deps`, compose
pulls the one-shot `db-role-fix` container into the start-up graph and the app goes down. That
command runs automatically on every boot of the production host.

*"Two compose stacks on one host is exactly 'what was split was not what needed to be right' again"* — owner.

Nothing was changed on production. Staff are working. The env fix ships in the release.

---

## ✅ GATE VERDICT — migration 526 PASSES. It enters the integration branch.

Run by the **orchestrator**, not by E-1 (which was stopped and cannot be resumed). Fresh restore
of `prod-20260913.dump`, md5 `6ccd2dbb07a9a4d9bbae4421eb3265e0`, ledger **681 / 20260912150000**
proven before any change. Migration md5 verified identical across delivery.

**BEFORE (production shape)** — R-1's finding reproduced independently, all seven drifted:

```
product_computed_prices_public sec=UNSET          create_purchase tehran_today=NO
v_promotion_suggestions sec=UNSET uidguard=NO     get_payables_list tehran_today=NO
asan_list_bank_deposit_export direction=NO        upsert_staff_daily_performance_metric=NO
expire_stale_credit_holds signatures=2
```

**AFTER PASS 1** — every one repaired: `security_invoker=true` on both views, `uidguard=YES`,
`tehran_today=YES` ×3, `direction=YES`, `signatures=1`. Exit 0.

**AFTER PASS 2 — the idempotency test.** Every step self-reported `already … -- no-op`, and the
proof is a **state diff, not the absence of an error**:

```
diff <state after pass 1> <state after pass 2>   ->  IDENTICAL, zero drift
```

plus stable `md5(pg_get_functiondef)` / `md5(pg_get_viewdef)` fingerprints for all eight repaired
objects.

**TEST SHAPE (`afrakala`, inside `BEGIN … ROLLBACK`)** — a **pure no-op from the first pass**:
all nine targets reported `already … -- no-op`, state byte-identical before and after, transaction
rolled back. Nothing was committed to the live test database.

**Ledger integrity honoured.** 526's own NOTICE: *"Ledger rows for 386/394/396/404/409 are
untouched; this migration records its own new row."* Confirmed — the ledger read `681` on
production shape and `686` on test shape, unchanged across every pass. **Zero `DELETE` against
`schema_migrations` anywhere in the 1,300 lines.**

> **526 repairs more than R-1 reported.** Its own precondition check counts **nine** target
> objects, not seven: it also restores `vw_account_balances` (386c) and the `tehran_today()`
> comparison inside the `sdpm_insert_privileged` / `sdpm_update_privileged` **policies** (396c).
> Both are genuine parts of what 386/396 assert and both were drifted. R-1's five-migration
> headline was right; its object list was incomplete.

---

## 🔴 Production host — the autostart tree (owner, env-parity-20260913.md, read-only)

Extends the earlier finding. The tree the scheduled task actually uses,
`C:\AfraKalaServer\get-git-going01lan`, is:

- on branch **`fix/auth-user-profile-trigger` @ `69d78c68` (2026-05-30)** with **38 uncommitted
  paths**, and **does not contain migrations 522/523/524/525**;
- the env diff to the deploy tree is **small**: no key exists only there; only `OCR_ENABLED`
  (true vs false) and `SMTP_SENDER_NAME` differ. **`JWT_SECRET`, `POSTGRES_PASSWORD`, anon and
  service-role keys are IDENTICAL in both** — so the two trees are not isolated from each other;
- **neither tree defines `ISSABEL_*` or `OLLAMA_*` at all.** That is why the container reports 0
  for both and why OCR is dark. **Not a code bug** — which is why E-3 was right to leave F-6 alone.

🔴 **All five scheduled-task scripts** (`start-afrakala-lan.ps1`, three backup scripts,
`AfraKala-AutoBackup.ps1`) **exist only in that untracked tree and are in no repository.**
**A fresh clone of `main` does not reproduce this host's behaviour — no autostart, no backups.**

🔴 **Five untracked copies of production secrets** and several auth-API JSON payloads containing
**plaintext passwords** sit in that tree. **Owner cleanup, HANDOFF item — no agent touches them.**

**E-4's release line must therefore add a RELEASE block that:** (a) commits the five operational
scripts into the repo under `deploy/lan/scripts/`, (b) repoints the scheduled task at one
canonical tree, (c) adds `--no-deps` to the autostart compose line, (d) adds the missing
`ISSABEL_*` / `OLLAMA_*` keys and sets `OCR_ENABLED` consistently.

---

## 🔴 HANDOFF ITEM — auto-resume is NOT INSTALLED, and it cost three agents today

Checked read-only on 2026-09-12, nothing promoted:

| probe | result |
|---|---|
| `C:\Users\AFRA\resume\` | exists but holds only `probe/` and `zz-s6-demo/` — **eval fixtures, not mission slugs** |
| `~/.claude/agents/dev-orchestrator.md` | **`grep -c 'B-9'` → 0.** The live agent does not carry the rule |
| where `[B-9]` *does* live | `~/.claude/dev-team/candidates/resume-v1/` — an **unpromoted candidate** plus its eval runs |
| `.needs-resume` convention | same candidate tree only; **no flag file anywhere on disk** |
| scheduled task running `claude --continue` | **none** |
| `…/Desktop/agents/auto-resume-report.md` | present, 28,493 B, dated **today 14:50** — a candidate under evaluation |

**Verdict: NOT INSTALLED** — but my first reading of *why* was wrong and is corrected here.

> **CORRECTION.** I initially called it "a prototype mid-evaluation". It is not. **It is built and
> proven end-to-end, and blocked by a gating decision nobody has made.** Verified in
> `~/.claude/dev-team/candidates/resume-v1/EVAL_REPORT.md`:
>
> - **`S6` end-to-end against real `claude`: 20/20.** Session identity proven —
>   *"planned `d9c8e1cc…` = got `d9c8e1cc…`. همان session."*
> - **All ten rejection conditions clean**: *"هیچ‌کدام از ده شرط رد فعال نیست. رد شدن promote از
>   جای دیگری می‌آید: عدد مجموعهٔ تیم."*
> - It was refused anyway, by the machine gate:
>   ```
>   $ python tools/promote.py resume-v1
>   REFUSED dev regression: baseline=1.000 candidate=0.600
>   ```
> - **The two dev-set failures are in agents the change never touched:**
>   `T03-security-census` → `dev-security-critic` (6/7) and `T04-archaeology-count` →
>   `dev-archaeologist` (8/9). The resume change edits **`dev-orchestrator`**.
> - The author did not override it: *"رد — `promote` انجام نشد. گیت ماشینی رد کرد و من دورش نزدم."*
>
> The eval also caught three real bugs, **two of which only `S6` could catch** — including a probe
> that was poisoning `--continue`.
>
> **So this is a decision, not a build.** And it is exactly what cost E-1, E-4 and E-5 today.
>
> *(Footnote worth keeping: `T03-security-census` — one of the two blocking failures — is the very
> eval that was running on this machine when this mission started, and which I waited for before
> touching any shared resource.)*

Per owner instruction the machinery was **not built or promoted during this mission**.

**What it cost, measured:** E-1, E-4 and E-5 were stopped mid-run and **cannot be resumed** — the
harness refuses (*"was stopped by the user and won't be resumed. Treat its work as cancelled"*).
E-1's output survived only because it had already committed and pushed; **E-4's and E-5's existed
solely as untracked files** and would have been lost with the disk. Recovering them needed an
explicit preserve pass.

### Standing rule now attached to every remaining brief

After each **proven** step and **before** starting the next, an agent writes
`docs/missions/convergence/RESUME-<id>.md` — what is finished *with the evidence command*, what is
unfinished, the exact next command, and what would prove it done — then commits
`WIP: <id> checkpoint, unverified` and pushes. **No agent holds more than one unproven step in
memory.** A replacement reads that file first and **re-proves the last claim on a fresh restore**;
it inherits the branch and the reserved numbers, **never the claims**.

> Applied late to the running E-5 (launched before the rule existed) by message rather than by
> restarting it — restarting would have destroyed the very context the rule exists to protect.

---

## Stage 1 — execution status

Dispatched 2026-09-12 after all four post-restart checks passed. Six worktrees, each on its own
branch from **`ad0138df`**, own scratch DB, own reserved migration numbers.

| agent | branch | PR | status | orchestrator verification |
|---|---|---|---|---|
| **E-1** | `feature/conv-migrations` | — | RUNNING | 526 catalogue repair → 527/528 guard replacements |
| **E-2** | `feature/conv-db-fixes` | **#441** | ✅ **DONE** | partition clean (5 files) · numbers 530/531/532 exact · Persian card text **byte-identical** · scratch DB dropped |
| **E-3** | `feature/conv-frontend` | **#443** | ✅ **DONE** | partition clean (5 files) · zero build artifacts leaked · **typecheck independently re-run by the orchestrator: 70 errors across exactly 6 files, none of them a file E-3 touched** |
| **E-4** (replacement) | `feature/conv-release-line` | — | ⏸ **STOPPED at checkpoint 1 — ~2/3 done, NOTHING LOST** | 2 checkpoint commits pushed (`dba17712`) + `RESUME-E4.md` (10.8 KB) · **clean tree** · scratch DB dropped |

> **The resume discipline worked, and the contrast is the evidence.** The first three stops left
> E-4's and E-5's work **entirely untracked** — recoverable only by an explicit preserve pass. This
> stop left **2 checkpoint commits, a full `RESUME-E4.md`, a clean working tree and a verbatim next
> command.** Same failure, opposite outcome.
>
> **Done (evidence re-runnable):** `release/lib/shape-tolerance.sh`, unit-tested across four cases
> — declared+matching → tolerated; declared+non-matching, undeclared version, and no-file → **not**
> tolerated (safe default). Wired into the replay loop behind `-ShapeTolerant`; tolerated versions
> downgrade to `SHAPE_TOLERATED` and emit **"HUMAN REVIEW REQUIRED"** instead of an automatic
> `mig_apply`. Plus the four autostart-tree blocks, key names taken from
> `deploy/lan/docker-compose.yml:53-84` rather than invented.
> `known-shape-tolerant-migrations.txt` shipped **empty**, with the reason stated: 531 lives on an
> unmerged branch, so there is no real occurrence to declare.
>
> **Its checkpoint caught a fabricated citation:** `release/config/known-ledger-lies.txt` cites
> `docs/research/convergence/E-4-proof.md` as already written. **That file never existed.** Same
> class as R-4's "validated mechanically" claim on 09-12 — caught this time before it propagated.
>
> **Not done:** the PASS rehearsal, the emit→validate→apply chain, the Persian README,
> `E-4-proof.md`, the PR. Next command recorded verbatim in `RESUME-E4.md` and in `RESUME.md`.
| **E-5** (replacement) | `feature/conv-ops` | **#445** | ✅ **DONE** | partition clean · 533/534 only · no out-of-partition write · og61 failures proven **not caused** by this change |
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

### 🔴 THE RESUME DISCIPLINE HAS A DEFECT — and E-5 found it by refusing to obey me

The replacement E-5 **flagged the orchestrator's mid-run resume-discipline message as a suspected
prompt injection and did not comply.** The harness itself marked the tool result as a likely
injection. **E-5 was right to refuse**, on two counts:

1. **Delivery.** A "coordinator standing rule" arriving mid-session inside a tool result is
   indistinguishable from an injected instruction. An agent that obeys such a message because it
   sounds authoritative is an agent that can be steered by any tool output it reads. Refusing was
   correct security behaviour, and it cost nothing — E-5 completed its work anyway.
2. **Content.** My message told it to *push after every checkpoint*. That **directly contradicts
   `CLAUDE.md`**: *"Push only after a commit (which happens at the end of a completed, tested
   phase), never mid-phase."* E-5 caught the conflict and named it. The instruction was wrong, not
   merely suspicious.

**Both corrections are the orchestrator's, and the record states them plainly rather than
softly: the push-every-checkpoint instruction was wrong, and E-5 was right on both counts.**
It was right that the delivery channel was untrustworthy, and right that the content contradicted
`CLAUDE.md`. It refused an instruction from its coordinator and that was the correct call.

**MISSION POLICY, effective now: mid-run instruction injection is BANNED.** A brief is trusted
context **only at launch**. If a rule must change mid-flight, the agent is **stopped and relaunched
with the rule in its brief** — or the rule waits. No exceptions, including from the orchestrator.

**Reconciliation, which also fixes the rule.** What actually bit this mission was that E-4's and
E-5's work was **uncommitted**, not unpushed — a local commit survives an agent's context
vanishing, because the worktree persists. So:

> **Checkpoint = a LOCAL commit. Mandatory after every proven step.**
> **Push = at phase end only, per `CLAUDE.md`.**

That closes the gap that actually cost us three agents without breaking the house rule.

**And the delivery channel matters:** the discipline must be in an agent's **original brief**,
where it is trusted context, never injected mid-run. E-5 ran without checkpoints because the rule
arrived after it started; it completed, but that was luck, not design.

### ✅ E-5 (replacement) — verified

Its inheritance assessment was the valuable part: its predecessor's `E-5-proof.md`
**never existed**, so every "measured tonight" claim in the WIP pointed at a missing file, and
**nothing had ever been applied to any database.** The SQL itself held up.

- 533 creates **two PROCEDUREs** — `run_issabel_import`, `generate_birthday_notifications_worker`
  — not functions, and 10 REVOKE lines.
- The database guard is the **positive** form, `IF current_database() = 'postgres' THEN` — it
  **no-ops elsewhere instead of aborting**, the correct inversion of the 336/343 defect.
- **A real defect found in its predecessor's 534**: the RLS comment called the two routines
  "SECURITY DEFINER functions". They are plain PROCEDUREs, and SECURITY DEFINER is *impossible*
  here (`ERROR: invalid transaction termination` — the procedures `COMMIT` mid-body). The actual
  reason RLS is bypassed is that `supabase_admin` is a superuser, **verified live**
  (`rolsuper` → `t`). Measured, not assumed.
- **og61: 15 passed, 8 failed — proven not caused by this change.** All four named functions
  (`bot_authenticate_key`, `refresh_sale_list_prices`, `expire_stale_credit_holds`,
  `post_receipt_journal`) have **zero mentions** in 533/534. *(This proves non-causation, not that
  they were failing beforehand — a baseline run would be needed for that, and is a V-2 task.)*

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

---

# STAGE 2 — integration and gate

Branch `feature/conv-integration`, worktree `D:\AfraKalaTest\wt-conv-int`.
**The full evidence trail is `docs/missions/convergence/INTEGRATION-LOG.md`, step by step.** This
section is the summary and the verdict table; the log is the record.

## What is in the release

Six branches merged clean, zero conflicts, zero shared files:
`feature/conv-migrations` (E-1, #444) · `conv-db-fixes` (E-2, #441) · `conv-ops` (E-5, #445) ·
`conv-security` (E-6, #442) · `conv-frontend` (E-3, #443) · `conv-orchestrator-state` (docs).

**Twelve migrations**, 526-528 · 530-536 · **537** · **538**. 529 reserved and unused — the gap is
intentional.

## Gate findings

| id | severity | what | disposition |
|---|---|---|---|
| **G-1** | 🔴 | 535 and 536 each ended with `INSERT INTO supabase_migrations.schema_migrations … ON CONFLICT DO NOTHING`, making the operator's ledger step report a duplicate-key **ERROR** on a clean restore — a stop condition on the owner-typed run, on a migration that had succeeded | **fixed in the gate.** Swept all twelve afterwards: **zero executable ledger writes anywhere.** 526's header *claimed* it inserted its own row — prose, not SQL, and corrected because it reads as an instruction to re-add the defect |
| **G-2** | 🟠 | 533's production branch (`current_database() = 'postgres'`) cannot be exercised on this host — no rehearsal DB may take that name | not a defect. Stage 3 must run a pg_cron pre-flight **on production** before the 533 block |
| **G-3** | 🟠 | `authenticated` held `TRUNCATE` on **214 of 227** tables; TRUNCATE is not filtered by RLS, so the privilege was the entire protection | escalated by the owner from HANDOFF to **migration 537** |
| **G-4** | 🔴 | F-9 localised the KPI subtitle in `AdminKpis()` and missed the byte-identical string in `SalesKpis()`; the salesperson dashboard rendered `0 تأیید · 0 در انتظار` in Latin digits | **fixed in the gate** (`c0804142`), re-proved by redeploy + screenshot |
| **G-5** | 🔴 | Production never received migration 476's effect: **36** `public` functions are `anon`-executable outside the 17 documented exclusions, two of them SECURITY DEFINER writers with no caller check | **migration 538** |

## 🔴 The orchestrator was PRODUCER and GATE on four artifacts

**526's idempotency proof · G-4's fix · migration 537 · migration 538.**

That is the weakest evidence in this stage and it is named here rather than buried. All four lead
V-1's brief **with the requirement only** — no proof of mine, no header text of mine — and two of
them carry an independent re-count that fails the artifact outright:

- **537 RED** unless V-1's own restore counts `214 → 0` tables granting `TRUNCATE` to `authenticated`.
- **538 RED** unless V-1's own restore counts **36** anon-executable functions with og102's predicate.

A RED row leaves the release. That includes mine.

## Numbers that the chain's falsification checks depend on

| measure | production shape | after the twelve |
|---|---|---|
| ledger rows / top | **681 / `20260912150000`** | 693 / `20260913110000` |
| tables (`relkind='r'`) | 227 | 228 |
| views + matviews (`relkind IN ('v','m')`) | **24** | **24** |
| anon-readable relations | **20** | **20** |
| anon-executable `public` functions | 544 | **505** |
| anon-exec outside og102's 17 exclusions | **39** | **36 → 0** after 538 |
| `authenticated` holding TRUNCATE | **214** | **0** |
| `SECURITY DEFINER` functions | 446 | 444 |
| `persons` / `audit_logs` rows | 4,857 / 112,696 | **unchanged** |

Dump: `/tmp/prod13.dump`, md5 **`6ccd2dbb07a9a4d9bbae4421eb3265e0`**, 35,424,962 bytes.
`pg_restore` exits 1 with **exactly 21** errors, all pg_cron/vault, zero data-load errors.

**Idempotency: all twelve re-applied to the already-migrated database produce a state identical
across 15,422 snapshot lines** (relations, view definitions, columns, defaults, function bodies,
policy `qual`/`with_check`, constraints, triggers, grants, per-function EXECUTE, indexes).

## Test results, with attribution

| suite | production shape | after the twelve |
|---|---|---|
| og81 / og102 / og103 | 8 failed · 11 passed | **7 failed · 12 passed** |
| scoped DB suite (16 specs) | 27 failed · 63 passed · 1 skipped | **19 failed · 71 passed · 1 skipped** |
| `validate-role-sessions` | — | **5 passed**, same hour |
| O-5 cold sessions | — | **2 passed** |
| typecheck | — | **70 errors / 6 files — the baseline exactly** |
| build · deploy | — | pass · `APP_GIT_SHA=c0804142` = HEAD |

**Eight tests moved red → green. Nothing moved green → red, at any of the three steps** (ten, +537,
+538). Every residual failure is red on production's own shape, measured on a restore taken minutes
earlier — which is the discipline og61 went a whole day without.

## Accepted divergence and decisions

- **OG-C** — 373: ledger row only, never re-run, and only after `anon_default_acl = 0` checks out.
- **OG-J** — 449/450/452: permanently skipped, **no ledger row**, because nothing did their work.
  Consequence: **six `zz_retired_*` names, plus `payment_receipts_backup_20260722`, differ between
  test and production forever.** That divergence is exactly what made 477 abort. The rule it leaves:
  **a migration whose target set is a list of names generated on one database cannot be applied to
  the other.**
- **OG-A** — 411/412/413 ship as-is in their own release block.

## 🔴 HANDOFF — Docker Desktop loses published ports, twice in one mission

A container reports `Up (healthy)`, is reachable **inside** the Docker network, and answers nothing
on its published host port. It has now happened to two different containers on this machine:

```
afrakala-lan-web   :3100 answered from PostgREST (Server: postgrest/12.2.0) behind a healthy container
afrakala-lan-kong  :9000/auth/v1/health -> http=000 from the host
                   wget http://kong:8000/auth/v1/health from inside -> {"name":"GoTrue",...}
```

**The remedy is one line, and it is the same both times: `docker restart <container>`.** Restarting
Docker Desktop is **not** needed and, on 2026-08-26, did not actually execute.

Two corollaries worth more than the fix:
- **`Up (healthy)` is not evidence the app is reachable.** The healthcheck probed a path PostgREST
  also answers. A deploy check must assert `content-type: text/html` **and the absence of a
  `Server:` header**, not just `200`.
- It silently breaks the auth harness: `generate-role-sessions` cannot reach the Auth Admin API, and
  a five-day-old session set then produces a suite-wide red that looks like a regression. That cost
  189 false failures on 2026-08-27.

Also for HANDOFF, found in Wave B:

- **The app opens a Realtime websocket that nothing serves.** `ws://…:9000/realtime/v1/websocket`
  returns **404** — the LAN compose file declares **no `realtime` service** and no container exists.
  Every user sees a permanent red «اتصال زنده قطع است» badge on every page. Production runs the same
  compose family. A permanently-red status indicator trains people to ignore status indicators.
- **`node_modules` on this machine was last installed 2026-07-29** and was missing `mysql2`, which
  `package.json` has declared since PR #434. Any local typecheck read **72/7** instead of 70/6 until
  `npm install` was run. The release line must install before it trusts a typecheck number.
- **A rehearsal restored with `pg_restore --no-owner` as `supabase_admin` gives `supabase_admin`
  ownership of everything**, so the e2e helpers' `postgres` role cannot read `auth.users`. Specs
  then fail for a reason unrelated to the migration under test. `GRANT ALL ON ALL TABLES IN SCHEMA
  auth, public TO postgres` on the scratch database clears it.
- **`generate-role-sessions.spec.ts` deletes all six `storageState` files before rebuilding them.**
  If it then fails, there are none. A copy taken into another worktree is not a safeguard if the
  generator will also run there.
---

# WAVE C · the verdict table

Three independent passes: **V-1** (`dev-code-critic`, own restore, psql + source only), **V-2**
(`dev-security-critic`, own restore, owns the e2e harness), **DA** (`dev-devils-advocate`, own
restore, read-only adversary). No two shared a database. None was given the orchestrator's proofs.

| # | artifact | verdict | whose evidence |
|---|---|---|---|
| 1 | **526** catalogue repair | **GREEN** | V-1: pass-1-vs-pass-2 catalogue diff **empty**; first-pass no-op on test shape; zero `DELETE` against the ledger. DA re-derived every headline number |
| 2 | **527** / **528** guard re-issue | **GREEN** | V-1, first check either has ever had: applies on production shape, no-ops on pass 2, **no-ops rather than aborts** on test shape, no database-name guard in either direction |
| 3 | **530 / 531 / 532** | **GREEN** | V-2: E-2's spec fails 4/4 without them and passes 4/4 with them. V-1 re-measured #441's Persian card text byte-identical, md5 `a503ff5346952b15d1981b3addf6a6a8` both sides |
| 4 | **533 / 534** | **GREEN with a deploy-note condition** | V-2 proved 534's RLS deny behaviourally (`42501` on authenticated INSERT, on anon SELECT). 533's `http` line is unguarded — see the conditions below |
| 5 | **535 / 536** | **GREEN** | V-2: zero new `SECURITY DEFINER` routines; all eight replaced objects carry quoted caller checks |
| 6 | **537** TRUNCATE | **GREEN** | **V-1's own restore: `214 → 0`**, both `pg_default_acl` grantors closed, a table created afterwards proven not to inherit, every other privilege for `authenticated`/`service_role`/`anon` unchanged. DA confirmed the scope is complete and every factual claim in the header verbatim |
| 7 | **538** anon EXECUTE | **GREEN** | **V-1's own restore: 39 bare, 36 after the other eleven, → 0.** V-2 proved closure **by calling as `anon`**: `42501` after, no error at all before. DA swept all 39 across the whole repo plus five indirect SQL vectors for other callers — **zero** |
| 8 | **G-4** dashboard | **GREEN** | V-1 on the file; orchestrator on the render, both roles, live DOM scan for Latin digits adjacent to the Persian labels — **none** |
| 9 | **the merge itself** | **GREEN** | six branches, zero shared files, zero conflicts, `routeTree.gen.ts` untouched by construction |

**No artifact is RED. Nothing found in three passes stops the merge.**

## What the adversary actually changed

It refuted two of its three attacks with evidence, which is worth more than a confirmation would
have been, and it converted the third from "defect" to "evidence gap".

**🔻 F-1 is downgraded from functional regression to NO-OP — and the real finding is bigger.**
V-2 reported that after 538 the public sale-list loader silently gets `42501`. True, and irrelevant:
**`anon` cannot read `sale_lists` at all**, so that loader fails at its *first* query, before it
ever reaches the RPC. Verified independently by the orchestrator, behaviourally, on production
shape **with none of the twelve applied**:

```
SET LOCAL ROLE anon; SELECT count(*) FROM public.sale_lists;
ERROR:  permission denied for table sale_lists

has_table_privilege('anon', 'sale_lists',      'SELECT')  ->  f
has_table_privilege('anon', 'sale_list_items', 'SELECT')  ->  f
```

So 538 changes nothing about that page. But that means something nobody had noticed:
**the public sale-list feature is already dead for anonymous visitors on production.** `anon`'s
SELECT on `sale_lists`/`sale_list_items` went when 477/523/524 closed the table grants to eleven
keepers, and these two are not among the eleven. It went unnoticed because there are **19 sale
lists and all 19 are `draft`**.

**The blocking note therefore changes, and it gets stronger rather than weaker.** It is not "no
sale list may be published until a one-line app fix lands". It is: **publishing a sale list will
not produce a working public page at all** until either `anon` is granted SELECT on those two
tables, or the public route is served server-side with a trusted key. That is a design decision,
not a one-liner, and it now has an owner.

**🟡 537's gate regex is weaker than 537 itself.** DA showed the gate's
`authenticated=[a-zA-Z]*D` test returns false against a PUBLIC-granted default such as
`=arwdDxt/postgres` — so a PUBLIC-granted TRUNCATE default would pass the gate silently. On the
shipping shape it cannot bite: **zero PUBLIC grants exist on any table in `public`**, which DA
measured. Latent, real, and it goes to the fix agent rather than to me.

**🟡 The idempotency snapshot omitted exactly the dimensions 537 and 538 write.** It captured only
`anon`/`authenticated` EXECUTE and **no `pg_default_acl` at all** — the two axes the two
producer-is-gate migrations move. The defect is refuted and the evidence gap is real: DA
snapshotted **nine omitted dimensions (2,877 lines)**, re-applied all twelve, and got a
**byte-identical** result with the same md5. So the conclusion held; the proof that was offered for
it did not cover it. That is the correct way for this to be caught, and it is recorded rather than
quietly fixed.

**One unit correction that reaches the owner's keyboard.** "214" means *tables in schema `public`*.
At apply time the operator will see **215**, because 534 creates `cron_run_log` before 537 runs.
The release block's `Expect:` line must say **215**, not 214 — a mismatch there is a stop condition
on a run that is actually correct.

**On 533's `http`, the adversary went further than either verifier.** It probed for SSRF and found
all 19 `http` functions come out `supabase_admin=X` only, with `anon` and `authenticated` both
getting `42501`. **But the closure comes from migration 393's global FUNCTIONS default revoke,
which 533 never mentions** — so the protection is inherited, not stated, and nothing in this
repository asserts the installed extension set. That is precisely why the extension ships guarded
and with its own REVOKEs rather than relying on an inheritance nobody wrote down.
