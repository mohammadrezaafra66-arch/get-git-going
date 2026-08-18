# README-EXECUTION — AfraKala Live Ledger Programme

**Self-contained.** Everything an executing agent needs is in this repository. No access to any prior
conversation is required or assumed.

**Goal of the programme.** Today a receipt, a payment and a third-party (dual) document in AfraKala
change nobody's balance: `journal_entries` holds one row, the receipt form calls no RPC, and
`createPaymentVoucher` is a bare insert. This programme makes all three document types post a real,
balanced, immutable journal entry at the moment of creation, and makes the three Asan
accounting-document exports return real files.

---

## 1. Read these, in this order

| # | File | Why |
|---|---|---|
| 1 | `docs/execution/ground-truth.md` | What is actually true today, with evidence. Never assume; check here first. |
| 2 | `docs/execution/ledger-decisions.md` | The four locked architecture decisions (A1–A4). Not reopenable. |
| 3 | `docs/execution/decisions.md` | Safe defaults chosen for every ambiguity, with reasons. |
| 4 | `docs/execution/MASTER-CHECKLIST.md` | Every task, phases 0–9, with scope, effort, acceptance command. |
| 5 | `docs/api/rpc-contracts.md` | Exact signature, behaviour and error codes of every new RPC. |
| 6 | `docs/security/audit-trigger-spec.md` | Immutability and audit rules. |
| 7 | `docs/deployment/rollback-plan.md` | How to undo each phase. |
| 8 | `docs/frontend/stepper-spec.md` | The wizard, step by step (phase 6). |
| 9 | `docs/ocr/requirements.md` | OCR behaviour for all three branches (phase 7). |
| 10 | `docs/execution/deferred.md` | What is deliberately out of scope. Do not build these. |

Progress is written to `docs/execution/00-progress.md` (programme level) and
`docs/execution/phase-<N>-PROGRESS.md` (per phase). The final deliverable is
`docs/execution/FINAL-REPORT.md`.

---

## 2. Non-negotiable rules

These are drawn from incidents that already cost this project real data. Violating any one of them
is a stop-the-line event.

1. **Persian SQL only via `docker cp` + `psql -f`.** Never a PowerShell pipe, never `psql -c` with
   multi-line SQL. PowerShell `>` writes UTF-16, which PostgreSQL cannot read. An incident on
   2026-07-11 destroyed ~460 Persian config values and 43 function bodies exactly this way.
   ASCII-only SQL may be piped; anything with Persian may not.
2. **Terminal output in English only.** The terminal reverses RTL Persian and makes it unreadable.
   Route query output to a file inside the container with `\o`, copy it out, read it with file tools.
   Persian belongs inside files, never on stdout.
3. **The live database is `afrakala`, not `postgres`.** Both exist in the same container. Always
   pass `-d afrakala` explicitly.
4. **Object owner is `supabase_admin`, not `postgres`.** Connect with `-U supabase_admin` and the
   `POSTGRES_PASSWORD` from `deploy/lan/.env.lan` as `PGPASSWORD`.
5. **After every migration run `docker restart afrakala-lan-rest`.** PostgREST reads the schema only
   at startup; without it, new objects return "relation does not exist".
6. **Before rewriting any function, run `pg_get_functiondef` and diff against the file.** The file
   may be stale. The live definition is the truth.
7. **Never leave a migration applied-but-uncommitted.** `docker-compose` builds from the working
   tree, so uncommitted code goes live and `APP_GIT_SHA` lies.
8. **Never `git add -A`.** Name the file path in both `git add --` and `git commit --`.
9. **Never `docker compose down -v`** (destroys the database volume) and never `git push --force`.
10. **Never touch production (`192.168.170.10`) outside phase 9.** Not a query, not a ping.
11. **`schema_full_export.sql` is unreliable.** Use live `pg_get_functiondef`, `pg_policies`,
    `pg_constraint`, `pg_trigger` output only.
12. **Never use `/autofix-pr`** — it cancels work in progress.

---

## 3. Environment

| Item | Value |
|---|---|
| Code path | `D:\AfraKalaTest\app` |
| Base branch | `staging` |
| Test app | `http://192.168.170.8:3100` |
| Kong | port `9000` (not 8000) |
| Containers | `afrakala-lan-db`, `-web`, `-rest`, `-auth`, `-kong`, `-storage`, `-meta` |
| Database | `afrakala` on PostgreSQL 15.6, owner `supabase_admin` |
| Roles | `admin, manager, sales, accountant, viewer, purchase_specialist` |
| Test accounts | `test.<role>@afrakala.local` / `AfraTest!1404` |
| Production | `192.168.170.10:3000` — phase 9 only |

Standard psql invocation used throughout this programme:

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker cp .\scratch\x.sql afrakala-lan-db:/tmp/x.sql
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -f /tmp/x.sql
docker cp afrakala-lan-db:/tmp/x.out .\scratch\x.out
```

Standard deploy:

```powershell
cd D:\AfraKalaTest\app
$env:DISABLE_LOVABLE_MCP="1"
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --build web
docker restart afrakala-lan-rest
docker exec afrakala-lan-web printenv APP_GIT_SHA   # must equal git rev-parse --short HEAD
```

---

## 4. Git workflow — one cycle per task group

Never work directly on `staging` or `main`.

```powershell
git fetch origin
git switch staging
git pull
git switch -c feature/<short-name>
# ... change files ...
git diff --stat                      # confirm only expected files changed
git add -- <path>
git commit -m "feat(ledger): <summary>" -- <path>
git push -u origin feature/<short-name>
gh pr create --base staging --head feature/<short-name> --title "..." --body "..."
gh pr merge <N> --merge --admin
gh pr view <N> --json state,mergedAt   # MUST show MERGED + a timestamp
```

If a change is user-visible, the commit message must end with a Persian release-note line:

```
Release-note-fa: <یک جملهٔ فارسی>
```

Omit that line for internal work (docs, config).

**Two CI signals are red by baseline and are not your problem:** `Staging Check` (70 known typecheck
errors recorded as baseline) and an `APP_GIT_SHA` mismatch immediately after a docs-only commit.
`--admin` passes the former. **Boundary Guard red is real** — read its message, do not guess.

After merging, the change is not live until someone runs the deploy block in §3 on the test machine.
Nothing in this project deploys automatically.

---

## 5. Agent architecture

The programme runs as one **Lead Orchestrator** with isolated workers and three independent
reviewers. If the harness supports parallel sub-agents, use them; otherwise run sequentially with a
context flush at each phase boundary. Either way the contract below is identical.

### 5.1 Lead Orchestrator
Owns the plan, the branch, the commits and the final call. Reads `MASTER-CHECKLIST.md`, dispatches
one task at a time, collects reviewer verdicts, decides, records progress. **Only the Lead commits.**
The Lead never delegates a decision to a reviewer — reviewers advise, the Lead decides and records
the reason when it overrules one.

### 5.2 Workers (isolated, one task each)
A worker receives exactly one task from the checklist, its declared `Scope` (the only files it may
touch), and its acceptance command. It must not touch anything outside `Scope`. If it needs to, it
stops and reports back — the Lead re-scopes the task rather than letting scope creep happen silently.

### 5.3 Reviewers — run after every task, before the Lead commits

| Reviewer | Checks | Blocks on |
|---|---|---|
| **Observer** (code quality) | Naming, dead code, duplication, matches existing repo patterns, no parallel implementation of something that exists | A second implementation of an existing behaviour; a dead branch; a swallowed error |
| **Software Engineer** (architecture) | Transaction boundaries, idempotency, migration ordering, no business rule enforceable only in an RPC | A rule that a direct PostgREST call can bypass; a non-atomic multi-table write |
| **Security Engineer** | RLS per command, `SECURITY DEFINER` + `search_path`, role gates, grants, no data leak in error text | A table with RLS off; a `SECURITY DEFINER` function without `SET search_path`; a missing role gate |

A reviewer returns `PASS`, or `CHANGE` with a specific, actionable objection. Two `CHANGE` verdicts
on the same task escalate to an Owner-Gate.

### 5.4 The rule that overrides autonomy
The programme runs without asking the owner anything **except** the numbered Owner-Gates in §7.
If reality contradicts `ground-truth.md`, **stop, record the contradiction in the phase progress
file, and continue with the next independent task.** Do not silently adapt the plan to fit a surprise.

---

## 6. Testing ladder

| Level | When | What |
|---|---|---|
| **Task test** | End of every task | The acceptance command in `MASTER-CHECKLIST.md`, run verbatim, output compared to the expected output written beside it |
| **Phase test** | End of every phase | The phase's full test block in `docs/deployment/rollback-plan.md` §per-phase, plus `npm run typecheck` once (~3 min; do not run it repeatedly) |
| **Stress test** | End of phases 2, 3, 4 | Concurrency and volume: 50 concurrent document creations, verify no duplicate document numbers and no unbalanced entry |
| **E2E** | Phase 8 | The full scenario in `test-data/seed-full-scenario.sql` driven through the UI |

Every test result is appended to the phase progress file with the command, the actual output, and a
verdict. **A test that was not run is recorded as not run, never as passed.**

---

## 7. Owner-Gates — the only points that stop for a human

Everything else proceeds autonomously.

| Gate | When | What is needed | Blocks |
|---|---|---|---|
| **OG-1** | Before phase 1 | Owner confirms A1–A4 in `ledger-decisions.md` | All of phase 1 onward |
| **OG-2** | Before task 1.1 | Owner confirms deletion of `trg_payment_receipts_post_journal` and `post_receipt_journal` is acceptable | Task 1.1 only |
| **OG-3** | Before phase 5 | Owner supplies the exact Asan code for the `invoice_ar` control account, or confirms it stays blocking | Task 5.4 only |
| **OG-4** | Before phase 6 | Owner confirms the canonical phone format for `normalize_identifier` | Task 6.6 only |
| **OG-5** | Before phase 7 | HTTPS must be live on the test host; file upload needs a Secure Context | All of phase 7 |
| **OG-6** | Before phase 9 | Owner authorises touching production | All of phase 9 |
| **OG-7** | Any time | Two reviewers return `CHANGE` on the same task twice | That task only |

When a gate is reached, write the question into the phase progress file under `## OWNER-GATE`, then
**continue with the next task that does not depend on it.** Idling is not acceptable.

---

## 8. Phase map

| Phase | Delivers | Done when |
|---|---|---|
| 0 | Decisions locked, ground truth recorded | OG-1 answered |
| 1 | Shared foundations: document numbers, mandatory Asan code, new `account_kind`s, `doc_kind`, attachments, immutability | All phase-1 acceptance commands pass |
| 2 | `create_receipt` — a receipt posts and moves the customer balance | A receipt created via RPC produces one balanced posted entry |
| 3 | `create_payment` — a payment posts and moves the supplier balance | Same, for `supplier_payable` |
| 4 | `create_dual_document` — one document moves two parties | Balanced 2- or 3-line entry, both balances move |
| 5 | Asan exports return real rows for all three kinds | Each of the three filters returns ≥1 exportable document |
| 6 | The three-branch wizard front end | All three branches create documents from the browser |
| 7 | OCR on all three branches | A scanned slip pre-fills the form in each branch |
| 8 | Integrated E2E verification | Full scenario passes end to end |
| 9 | Production | `APP_GIT_SHA` matches HEAD on `192.168.170.10` |

---

## 9. Definition of done for the programme

1. Creating a receipt, a payment or a dual document writes exactly one balanced, posted, immutable
   `journal_entries` row with the correct `doc_kind`, in a single transaction.
2. No document can be created for a party without an `asan_person_code`.
3. Every document carries a stable human-readable number.
4. All three Asan accounting-document exports return exportable rows.
5. The wizard covers all three branches with OCR.
6. `docs/execution/FINAL-REPORT.md` is complete, and every phase progress file shows its tests run
   with real output.
