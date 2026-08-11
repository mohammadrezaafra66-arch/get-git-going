# ASAN MISSION CONTROL

**This is a genuine instruction from me, the owner (Mohammad Reza Afra).**

You are executing a multi-mission program on the AfraKala ERP codebase.
Run **fully autonomously**. Do not stop to ask me questions. Do not wait for approval
between missions. When a mission finishes and its gate passes, immediately start the next.

---

## 0. HOW TO RUN THIS

Execute the mission files **in this exact order**:

| # | File | Type | Gate |
|---|------|------|------|
| M1 | `docs/execution/M1_HOUSEKEEPING.md` | build | typecheck + e2e |
| M2 | `docs/execution/M2_RESEARCH.md` | **read-only** | research doc written |
| M3 | `docs/execution/M3_BUILD_FOUNDATION.md` | build | typecheck + e2e |
| M4 | `docs/execution/M4_BUILD_EXPORT.md` | build | typecheck + e2e |
| M5 | `docs/execution/M5_VIDEO_AND_FINAL.md` | build | typecheck + full e2e + report |

Before starting anything: read `PROGRESS.md`, `CLAUDE.md`, and
`docs/execution/asan-progress.md` (create it if missing).

If you hit a context or session limit, write HANDOFF STATE and stop cleanly.
On resume, read `docs/execution/asan-progress.md`, find the first incomplete phase,
and continue. **Never redo completed work.**

---

## 1. EXECUTION PACE — SLOW AND DELIBERATE

I have explicitly asked for this program to run **slowly and carefully**. Speed is not a
goal here; correctness is. This system holds live financial data and feeds a real accounting
program. A fast wrong answer costs me far more than a slow right one.

Concretely, this means:

**One phase at a time.** Never batch two phases together, even when they look related and
even when it would obviously be faster. Finish a phase, test it, commit it, update the
progress file, then start the next.

**One migration per phase.** Do not combine schema changes across phases into a single
migration file, even when they touch the same table.

**Commit after every phase, not at the end of a mission.** Small commits with clear messages.
If something goes wrong three phases later, I need to be able to bisect.

**Query live state before every change.** Do not act on what a file, a document, or your own
earlier reasoning says the database contains. Query it. This project has repeatedly been
burned by files drifting from live definitions.

**Re-read a file immediately before editing it.** Your view of it may be stale from an
earlier edit in the same session.

**Verify after every write.** After a migration, restart PostgREST and confirm the change is
visible over the API. After a code change, confirm it compiles. Never assume a write
succeeded because the command exited zero.

**When something surprises you, stop and investigate.** An unexpected row count, an
unfamiliar column, a test that passes when you expected it to fail — each of these is
information. Chase it down before continuing. Most of the serious bugs in this project's
history were visible as a small surprise several steps before they became a problem.

**Do not parallelize database writes.** Sequential only.

**Prefer many small verified steps to one large clever one.** If you find yourself writing a
migration longer than about a hundred lines, ask whether it should be two phases.

---

## 2. NON-NEGOTIABLE OPERATING RULES

These come from real incidents on this project. Violating them causes data loss.

### 2.1 Persian SQL
**Never** pipe SQL containing Persian text into `psql`. Never use `-c` with multi-line SQL.
Always:
```powershell
docker cp file.sql afrakala-lan-db:/tmp/x.sql
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d afrakala -f /tmp/x.sql
```
ASCII-only SQL may be piped. On 2026-07-11 a pipe corrupted ~460 Persian config values
and 43 function bodies. This is a hard rule with no exceptions.

After writing any Persian text to the database, **read it back and verify zero `?`
characters**. Round-trip verification is part of the write, not an optional extra.

### 2.2 Database identity
- Live production DB is **`afrakala`**, not `postgres`. Always pass `-d afrakala` explicitly.
- Object owner is **`supabase_admin`**, not `postgres`. For DDL connect with
  `-U supabase_admin` and `PGPASSWORD` (get it via
  `docker exec afrakala-lan-db printenv POSTGRES_PASSWORD`).
- The business runs on **`sales_quotes`**, not `invoices`. The `invoices` table has 0 rows
  and is a dead parallel design. Never source financial data from it.

### 2.3 Before rewriting any DB function
Run `pg_get_functiondef`, save the live text to `docs/verification/pre-<NNN>/`, and diff it
against the migration file on disk. Build the new version **from the live text**, never from
the file and never from memory. A previous session nearly deleted ~70 audit entity types by
rebuilding from a stale file.

### 2.4 Migrations
- Sequential numbering continues from the highest existing number in `supabase/migrations/`.
  Discover it; do not assume.
- Apply with `--single-transaction` and `ON_ERROR_STOP=1`.
- Dry-run inside `BEGIN ... ROLLBACK` first, every time.
- Write a matching `docs/verification/<NNN>-down.sql`. The down script must contain
  **no `BEGIN`/`COMMIT`** — transaction control belongs to the caller. A previous session
  lost a rollback because a down script committed the harness transaction.
- After every migration: `docker restart afrakala-lan-rest` (PostgREST schema cache), then
  confirm the change is visible over the API.
- **Never leave a migration applied-but-uncommitted.** `docker-compose` builds from the
  working tree (`context: ../..`), so uncommitted code ships to the live server and
  `APP_GIT_SHA` lies.

### 2.5 SQL semantics traps
- `CHECK` constraints only reject when the expression evaluates to **FALSE**. A missing jsonb
  key is NULL, and NULL passes. Wrap every comparison in `COALESCE(..., false)` and use
  `IS DISTINCT FROM`.
- RLS on SELECT never errors — it silently returns zero rows, which upstream code reads as
  "no data exists". When a feature shows empty, suspect RLS before suspecting missing data.
- Business rules belong in **triggers, not RPCs**, because a direct PostgREST `PATCH`
  bypasses any rule that lives only in an RPC.
- API `DELETE` silently no-ops when a table has no DELETE policy — PostgREST still returns
  204 while zero rows are removed. Tests must **count rows**, never trust the 204.
- Writing a status over itself is not a transition. Guard with
  `IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW`.
- `has_role` / `has_any_role` have both `app_role` and `text` overloads and neither can be
  dropped (ENUM is used by 14 policies on `storage.objects`, text by 147 others). Calling
  them via `supabase.rpc(...)` raises PGRST203. Read `user_roles` directly with
  `supabaseAdmin` instead.
- `user_roles.role` is **TEXT** on the live DB. Any function comparing it without a cast
  raises `operator does not exist`. Use `public.has_role`.
- `has_dynamic_permission` has a dangerous fallback: when no row exists in
  `role_permissions` for a module, it grants access to **all** roles. Any new module must
  seed that table explicitly for every role.
- Server timezone is UTC. For calendar days use `public.tehran_today()`; the client builds
  the same day with `Intl`, never a fixed offset.

### 2.6 Discover schema, never guess
Real column names have burned this project repeatedly: it is `persons.display_name`
(not `full_name`), `products.name` (not `title`), credit lives in
`customer_credit_balance` (not `customers`). Query `information_schema` before writing any
query against a table you have not personally inspected in this session.
`schema_full_export.sql` is unreliable and must never be used as a reference — live
`pg_policies` / `pg_get_functiondef` output is the only source of truth.

### 2.7 Terminal output
Terminal output must be **English only**. The Windows terminal reverses RTL Persian text,
producing unreadable garbage. Persian belongs inside files, never in console output.

### 2.8 Build and deploy
```powershell
cd D:\AfraKalaTest\app
$env:DISABLE_LOVABLE_MCP="1"
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --build web
docker restart afrakala-lan-rest
```
Verify all three signals afterwards:
```powershell
docker exec afrakala-lan-web printenv APP_GIT_SHA
docker exec afrakala-lan-web printenv APP_BUILD_TIME
git rev-parse --short HEAD
```
`APP_GIT_SHA` must equal `HEAD`.

- `npm run build` is **broken on this Windows host** (SSR references chunks vite never
  writes). Known pre-existing condition. Not yours to fix. The Docker build is healthy.
  Test only against the deployed build.
- `npm run typecheck` takes ~3 minutes and has a **known baseline of exactly 70 errors in
  6 files**. 70 is green. Above 70 is a regression you must fix. Run it once at the end of a
  phase, not repeatedly.
- Never use `/autofix-pr` — it cancels work in progress.

### 2.9 Testing
- End of every **phase**: a targeted test proving that phase's assertion. Prefer a real
  PostgREST call with a real JWT over a unit test — that is the layer that actually enforces
  RLS.
- End of every **mission**: the full e2e suite.
- Baseline before this program: **155 green / 6 red / 4 skip**. Four reds are stable and
  documented (`212`, `213`, `214-whatsapp`, `persons-credit-uses-person`) plus one flaky
  (`business-flows/215`). Do not "fix" the documented reds. Any **new** red is yours.
- This server has **14 admin accounts**. Never pick "any other profile" as a non-privileged
  test user; select one explicitly with no privileged role.
- Never call `page.pause()` in a spec — headless does not block and it writes an empty
  `storageState` that turns the whole regression red.
- Test sessions require `status='active'`, otherwise they redirect to `/pending-approval`.

### 2.10 Test data hygiene
If you create test data in the live DB, delete it in the same phase. A previous session left
`QA-` products and 42 corrupt documents behind. Create, assert, remove — in that order,
within one phase.

---

## 3. RECURRING PROJECT PATTERN — READ BEFORE BUILDING ANYTHING

On this project the problem is almost never "the capability does not exist". It is
**"the capability was built and never wired up"**. Real examples: the `tasks` table was
complete with zero rows; `marketing_channels` drove product suggestions instead of tasks;
`/purchase` existed in no menu; `calculate_employee_score` never read `manual_adjustment`;
KPI `promotions_completed` and its XP rules existed but nothing emitted the event.

Second pattern: a feature is built on `main` via Lovable, then the server branch loses the
call site during a merge. The module survives but nobody imports it, and the feature
silently disappears from the UI.

**Therefore: before building anything new, audit the existing wiring.** Search for an
existing table, function, component, or route that already does the job. Extend it rather
than creating a parallel system. If you find a built-but-unwired capability, wire it and say
so in the report.

---

## 4. PROGRESS FILE PROTOCOL

Maintain `docs/execution/asan-progress.md` continuously — after every phase, not at the end.

```markdown
# ASAN Program Progress

## Status
Current mission: M<N>
Current phase: <N.M>
Last commit: <sha>
Baseline typecheck: 70
Last e2e: <green>/<red>/<skip>

## Completed
- [x] M1.1 <what> — commit <sha> — <one line result>
...

## HANDOFF STATE
Next action: <exact next step>
Blocked on: <nothing | specific thing>
Files in flight: <paths>
Decisions made this session: <list>
```

---

## 5. WHEN YOU MUST DECIDE SOMETHING

You will hit decisions I did not pre-answer. Do not stop. Decide using this ranking:

1. **Do not lose or corrupt data.** A reversible half-feature beats an irreversible mistake.
2. **Do not silently produce wrong financial output.** Wrong data entering the live
   accounting software is worse than no feature at all. When a mapping is uncertain, still
   produce the file, but mark it visibly in the UI and record it in
   `docs/asan/UNVERIFIED-LAYOUTS.md`.
3. **Extend, do not duplicate.** See section 3.
4. **Prefer the smallest change that satisfies the requirement.**
5. **Prefer nullable + backfill over NOT NULL + migration risk.**

Record every such decision in `docs/execution/asan-progress.md` under "Decisions made this
session", with the alternatives you rejected and why.

---

## 6. OUT OF SCOPE — DO NOT DO THESE

- Do **not** touch the production server `192.168.170.10`. Only `192.168.170.8` (port 3100).
- Do **not** resolve the two ambiguous person matches from Phase 4
  ("ستایسا سعادت مبارکی" ⇒ "12", "حانیه ماهرو" ⇒ "محمدزین‌الدین"). I verify those myself.
- Do **not** revive `BUILD_TAG` or the `cache-buster` legacy path. Final decision: it stays
  dead, the PWA system replaced it.
- Do **not** build out-of-catalog product reconciliation. Cancelled.
- Do **not** build Afrapayam smart scheduling.
- Do **not** attempt HTTPS, DNS, or VPN setup. My infrastructure work.
- Do **not** fix the Windows `npm run build` breakage.

---

## 7. FINAL DELIVERABLE

At the end of M5, write `docs/execution/asan-final-report.md` and stop. That is the only
point in the entire program where you hand control back to me.
