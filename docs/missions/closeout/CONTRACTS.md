# CONTRACTS — close-out mission (waves 2–6)

Written by the orchestrator at Stage 0, 2026-09-07. Every number here was
**measured**, not copied from the brief. Where the brief and the measurement
disagreed, the measurement is recorded with both sides ([A-7], [A-1]).

---

## 1. Ground truth, measured

| Item | Measured value | Command |
|---|---|---|
| `HEAD` | `4fc737c6` | `git rev-parse HEAD` |
| `origin/staging` | `4fc737c6` — identical, 0 ahead / 0 behind | `git rev-list --left-right --count HEAD...origin/staging` |
| `APP_GIT_SHA` (deployed) | `4fc737c6` — **equals HEAD** | `docker inspect afrakala-lan-web` |
| Migrations on disk | **672** | `ls supabase/migrations/*.sql \| wc -l` |
| Ledger rows | **672 — matches disk** | `SELECT count(*) FROM supabase_migrations.schema_migrations` |
| Highest migration number | **507** (`499`–`503` do not exist; the series skips) | `ls supabase/migrations` |
| **Next migration number** | **508** | confirmed against disk *and* ledger |
| Typecheck | **70**, per-file identical to brief | `npx tsc --noEmit` |
| Container health | **`unhealthy`** | `docker inspect --format '{{.State.Health.Status}}'` |

### Typecheck baseline — per file (this is the gate, not the total)

| File | Errors |
|---|---|
| `src/routes/_app.products.index.tsx` | 18 |
| `src/routes/_app.admin.sales-reminders.tsx` | 15 |
| `src/lib/accounting/functions.ts` | 13 |
| `src/lib/invoices/functions.ts` | 13 |
| `src/lib/audit/index.ts` | 6 |
| `src/routes/_app.admin.automation.tsx` | 5 |
| **total** | **70** |

**No file may rise.** A total of 70 that moved an error from one file to another is a regression.

---

## 2. Two places the brief was stale — measurement wins

### 2.1 Session generators: the brief says four, there are **six**

> Brief: *"Only 4 of 6 roles have generators (no `manager`, no `viewer`); cold-login those two."*

**Measured false.** `e2e/auth/generate-role-sessions.spec.ts` declares six targets —
`manager` at line 97 and `viewer` at line 108 — added by wave 6 under hazard H·e, with a
comment saying exactly why. Only four `*.storage.json` files existed on disk because the
last run predated that change.

All six were regenerated and revalidated this session. **This does not relax [A-10]:** a
stored `viewer` session is a *warm* session. Every "role X is refused" claim in Group V is
still proved with a cold browser context — no `storageState`, no cookies, login from zero.

### 2.2 `CONSTITUTION.md` / `WORKFLOWS.md` are not in `.claude/agents/`

They live in `C:\Users\AFRA\.claude\dev-team\`. The `agents/` directory holds only the
38 `dev-*.md` bodies.

---

## 3. Q-1 — Issabel credentials: **ABSENT**. Group C is blocked.

Measured, not asked:

```
deploy/lan/.env.lan — 44 lines, 39 keys
keys matching ISSABEL : none
keys matching CDR|MYSQL|PHONE|CALL|PBX|ASTERISK : none
```

The file is readable and non-empty, so this is a real absence and not a failed read.

**The four keys the owner must create** (names from
`docs/research/issabel-groundwork-20260906.md`):

```
ISSABEL_CDR_HOST
ISSABEL_CDR_USER
ISSABEL_CDR_PASSWORD
ISSABEL_CDR_DB
```

**C-4 … C-8 return `blocked: owner must create the MySQL user — statements in
docs/research/issabel-groundwork-20260906.md`. No CDR row is invented, no importer is
written against a guessed schema.** `DESCRIBE cdr` is the first thing C-4 does when it
does run, and the `[doc]` column map stays unverified until then.

---

## 4. Migration numbers — allocated once, atomically ([B-4])

| Range | Owner | Status |
|---|---|---|
| **508 – 511** | Group H (`dev-bug-hunter`) | live |
| 512 – 516 | Group C | **not issued** — C is blocked |

No range overlaps. Take the number at the moment you write the file and re-check disk
**and** ledger before applying — other worktrees hold untracked migration files that
`git ls-tree` does not see.

---

## 5. Worktrees — seeded and proven ([B-3])

| Agent | Worktree | Branch |
|---|---|---|
| `dev-bug-hunter` (H) | `D:\AfraKalaTest\wt-h` | `closeout/group-h` |
| `dev-frontend-engineer` (V) | `D:\AfraKalaTest\wt-v` | `closeout/group-v` |

Each was seeded with, and verified for:

1. **`node_modules`** — a Windows junction to the main tree. Verified by running
   `npx tsc --noEmit` in the worktree: it returned **70 with the identical per-file
   split**, not the silent `0` that a missing `node_modules` produces.
2. **`deploy/lan/.env.lan`** — gitignored, and the code reads it.
3. **`e2e/auth/*.storage.json`** — all six, freshly minted this session.
4. `git status --porcelain` — **empty** at hand-off.

**Gitignored files written this session ([E-2]):** the six
`e2e/auth/{admin,accountant,manager,viewer,salesperson-a,salesperson-b}.storage.json`
in the main tree, copied into both worktrees.

---

## 6. Before-state probes — captured so the "after" is provable ([G-1])

These are the *before* halves of the E4 pairs. An agent that cannot reproduce the
before-state should stop, not adapt.

| Row | Before, measured |
|---|---|
| **H-1** | `SELECT count(*) FROM allocation_rows` → **1**. `audit_logs` for entity `b8e9286c-26cb-4211-a434-39630466a4e5` → **4 rows** (ids 64654–64657: `allocation_created`, two `allocation_status_changed`, `allocation_updated`). After: rows **0**, audit **5**. |
| **H-2** | `profiles.last_seen_at` ~50 days stale. |
| **H-3** | `curl /api/healthz` → **HTTP 503**, body `{"ok":false,"status":"unhealthy","checks":{"database":{"state":"down","ms":4,"detail":"HTTP 401"}...}`. The `401` is migration 477's `anon` revoke. Docker health log: five consecutive exit code `8`. |

`audit_logs` columns are `id, actor_id, entity_type, entity_id, action, diff, created_at`
— the entity key is **`entity_id`**, not `record_id`.

---

## 7. Database access — the working invocation

`docker cp` is broken on this machine (OG-68 mount layer). Read-only queries:

```bash
docker exec afrakala-lan-db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -tAc "<sql>"'
```

The password is already in the container's environment — never pass it on a command line
and never print it. For **applying a migration**, deliver over **stdin** (never `docker cp`),
verify `md5sum` on both sides, use `--single-transaction -v ON_ERROR_STOP=1`, and
**record the ledger row in the same breath** (rule 2b) — `psql` does not write it.

Database is **`afrakala`** on the test box. Production (`192.168.170.10`, database
`postgres`) is never contacted.

---

## 8. Verdicts

Every row closes with the evidence its kind demands, and no other:

| Kind | Closes with |
|---|---|
| **FIX** | The same probe twice — wrong, then right ([G-1]: the probe must read the condition, not seed it). |
| **CONNECT** | A screenshot of the real screen with the real role, **and** the non-permitted role refused from a **cold** context ([A-10]). |
| **BUILD** | Object exists · grants (`anon = f`; `authenticated` only where a real caller needs it — cron-only functions revoke `authenticated` in the same migration) · one real row through the real path. |
| **INVESTIGATE → …** | The measurement first, then the action or the stop. |

`PARTIAL` and `BLOCKED` are honourable. A `COMPLETE` that cannot show its evidence is not.
