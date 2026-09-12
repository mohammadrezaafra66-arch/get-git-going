# Production migration — the run record · run date 2026-09-12

> **Status: STAGE 0 COMPLETE, REFRESHED FOR 2026-09-12. THE RUN HAS NOT STARTED.**
> No agent has contacted `192.168.170.10`. Nothing below the Stage 0 section has happened yet.
> This file is written **as the run proceeds**, not after it.

**Orchestrator:** Claude Code · **Executor:** the owner, at the production keyboard
**Branch:** `feature/prodprep-20260908` · **Runbook:** `docs/runbooks/production-migration-20260908.md`
**Blocks:** `docs/runbooks/production-migration-20260908-BLOCKS.md`
**Stage 0 evidence:** `docs/missions/prodprep/STAGE0-findings.md`

---

## Ground truth at the start

| Item | Value |
|---|---|
| Production | `192.168.170.10` · app `:3000` · Kong `:8000` · DB **`postgres`** · container `afrakala-lan-db` |
| Production repo | `C:\afrakala` · tracks `main` at `469fe0a9` (610 migration files) · **Block 0.1 checks it out onto `staging`** — every file the executor reads lives there. `main` is realigned by a `staging → main` PR in Block 73, after the data is safe |
| Production schema top | migration **424** (`20260904150000`) |
| Production ledger | **569 rows**, max `20260827120000` (= migration 410) — lies in **both** directions |
| Backup — **the restore target** | `C:\Users\AfRa KaLa\Desktop\prod-20260912-final.dump` · taken in **Block 3.5**, after the owner confirms every user is logged out, and **after** the ledger reconciliation and the default-ACL closure — so restoring it undoes neither |
| Backup — drill input only | `…\prod-20260912.dump` · `-Fc` · taken 2026-09-12 morning · **does not contain today's staff work**; the input to the Block 0-B restore drill and nothing else |
| Backup — superseded | `…\prod-20260908.dump` · 33,784,463 bytes · four days stale · **no role.** Keep the file, do not restore from it |
| Rehearsal DB | `prod_rehearsal_20260908` on `192.168.170.8` — a restore of a production dump; still available |
| The 74 | `docs/missions/prodprep/MIGRATIONS-74.md`, in file-timestamp order (446 before 443, 518 before 517), 422–424 excluded |

### The owner's three preflight readings, 2026-09-08 morning

1. `document_numbers`, `dual_documents`, `document_attachments` — **all three exist**
2. `hold_credit_for_quote(uuid,uuid)` — **exists**
3. `pg_default_acl` entries granting to `anon` — **9**

**Consequence: 8 of the rehearsal's 14 failures disappear.** Six were real defects; five of those
now have measured verdicts (below) and two of the five turn out to pass.

---

## Stage 0 · what was done before the owner touched anything

All work on the test host and the rehearsal database. **Production untouched.**

| Step | Outcome |
|---|---|
| **S-1** | Runbook read whole (1,839 lines). 34 `UNREHEARSED` tags re-tagged: **7 resolved**, **10 remain** (`U-1`…`U-10`). Full list in `STAGE0-findings.md` §6 |
| **S-2** | Migration **522** written and **proven three ways** — applies on the rehearsal (2 rows), no-ops on the test DB (0 rows, rolled back), no-ops on the rehearsal's second pass (0 rows). Committed |
| **S-3** | Verdicts for 449, 450, 452, 507 measured against the restored production dump. **449/450/452 will fail; 507 will pass.** Two of the "class-(a)" set (475, 507) turn out to pass under the production order |
| **S-4** | Phase 4 rebuilt as owner blocks — contiguous `[schema]` runs batched to ≤10, every `[schema+data]` migration alone, special blocks for 449/450/452/460→522/475/507 |
| **S-5** | Branch pushed, PR opened to `staging`. **Not merged — the owner merges** |

### Stage 0 findings that change the runbook

**1 · 🔴 The runbook's Phase 3 block is insufficient.** It revokes `anon` from the 9 default ACL
entries and declares success at `count = 0`. Measured: that criterion is reachable while `anon`
still executes every newly created **function**, via PostgreSQL's built-in `EXECUTE TO PUBLIC`
default (`=X` in the ACL). Tables and sequences are unaffected. Two extra statements — the
**global** `ALTER DEFAULT PRIVILEGES FOR ROLE <r> REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` for
both grantors — close it. Proven as a unit: fresh function/table/sequence all `anon = f`,
`authenticated = t`. **Without this, Phase 5 step 5.2 cannot return 0 rows.**

**2 · ✅ OD-3(a) + 507 — the runbook's flagged untested combination — now measured, and it
passes.** Simulated in the production order on the rehearsal: corrected Phase 3, then
`roll_employee_daily_streaks` created fresh, then 507 → passed. The rehearsal fails 507 only
because the function already exists there with `anon=X` baked into its ACL; production is at 424
and does not have the function yet.

**3 · ✅ 475 will pass; it was never really a 460 cascade.** 475's check reads **state**, not
UUIDs. The state the owner created by hand on 2026-09-07 satisfies every clause. The one column
nobody had read is `ai_providers.base_url` — the production dump carries exactly
`http://192.168.170.8:11434`, which is what 475 requires. Measured: with the route pinned, 475
exits 0. `base_url` has been **added to the Phase 1 block** so this is confirmed live.

**4 · New — 450 has four wrong constants, not one.** The rehearsal reported only the first
(`backup_142` 18 vs 16) because it stopped there. Also wrong on the production dump:
`backup_20260722` (18 vs 16), `knowledge_documents` (1 vs 0), `messenger_messages` (16 vs 1).
Loosening one constant only moves the failure to the next.

**5 · New — 452's reason for existing does not hold on production.** 452 renames rather than
drops because two rows allegedly live in `backup_142` and nowhere else. Measured on the
production dump: **0**. On production the backups are pure duplicates; skipping 452 loses nothing.

**6 · The rehearsal carries production's default ACLs** (9 of 14 rows mention `anon` — exactly the
owner's reading). This was never stated and it is why the rehearsal, unlike the test database,
could reproduce this class of defect at all.

### 2026-09-12 addendum · the gap is **77**, not 74 — `MIGRATIONS-74.md` is stale

PR #435 merged to `staging` on 2026-09-08 (`a6b6c629`). It carried **three** migration files
production does not have: **520**, **521** and **522**. Recounted today against
`origin/staging`:

```
files production lacks (ts > 20260904150000, plus 420/421) : 77
the same list in MIGRATIONS-74.md                          : 74
on staging but absent from that list                       : 520, 521, 522
in that list but absent from staging                       : none
```

**`MIGRATIONS-74.md` must not be used as tonight's complete list.** The authoritative list is
the Phase 4 table in `production-migration-20260908-BLOCKS.md`, validated mechanically: 76
`mig_apply` calls, every file present on disk, every version equal to its filename prefix, no
duplicates, and the only gap member never applied is 460 — by design.

**`staging` has not moved otherwise.** `origin/staging` is `a6b6c629` = `9c113aac` + #435.
**PR #436 does not exist** — 435 is the highest in the repository (`gh pr view 436` returns
`Could not resolve to a PullRequest`). #433 was closed; #434 merged before `9c113aac`.

**520 and 521 were never part of the rehearsed 74, so they were rehearsed today.** Both applied
to `prod_rehearsal_20260908`, md5 matched on both sides, **both `EXIT=0`**. 520 asserts no
absolute row counts — its comparisons are relational (`= 0`) — and 521 is three `REVOKE`s.
**Both carry their own `BEGIN;`/`COMMIT;`**, so the harmless-transaction-warning list is now
eight: 466, 512, 513, 514, 516, 517, **520, 521**.

### Forecast for the 77

| | count | which |
|---|---|---|
| in the gap | **77** | |
| actually run | **76** | 460 is not executed |
| expected to succeed | **73** | includes 462, 475, 476, 477, 478, 487, 497, 507, 514, 516, 520, 521 |
| expected to fail, decision at the step | **3** | 449 (order 15), 450 (16), 452 (18) |
| skipped, ledger row **recorded** | **1** | 460 — because 522 does its work |
| skipped, ledger row **not** recorded | **3** | 449, 450, 452 — nothing does their work; recording would be a lie |
| ledger rows added by a complete run | **74** | 73 successes + 460's row |

**First stop is order 15.** Past order 18, nothing is currently forecast to stop the run.

### Remaining `UNREHEARSED`, at the moment the owner starts

`U-1` **restore drill — now partly closed and partly still open.** The morning dump *is*
drilled, in Block 0-B, on production into a scratch database that is dropped afterwards
(owner decision). But **the actual restore target — the Block 3.5 final dump — is not
drilled**; it is checked with `pg_restore --list`, size and md5 only. The drill proves the
pipeline on this cluster minutes earlier, so the residual risk is small but real, and a full
drill of the final dump is offered in Block 3.5 at the cost of a few more minutes of
downtime. ·
`U-2` ledger reconciliation against a DB named `postgres` · `U-3` the corrected Phase 3 on
production · `U-4` production's `ai_providers.base_url` read directly · `U-5` Phase 5 as a
sequence · `U-6` the deploy · `U-7` all 12 `down` files · `U-8` restore onto the live `postgres`
database · `U-9` container behaviour after reboot on production · `U-10` whether production's data
has moved since the 2026-08-31 dump.

### One open question handed to the owner, not decided here

The mission brief says psql on production runs as `postgres` (superuser). The runbook, the
rehearsal and every verified measurement used **`supabase_admin`**. The blocks prescribe
`supabase_admin`; if any statement returns `must be member of role "postgres"` or
`permission denied`, the owner stops and a new block is issued. **The role was not switched on a
guess.**

---

## The run · block by block

*(appended live — one row per block handed over, with what came back, the verdict, and the time)*

| # | Block | Handed at | Owner's output | Verdict |
|---|---|---|---|---|
| — | *run not started* | — | — | — |

---

## Deviations from the runbook

| # | Deviation | Why |
|---|---|---|
| D-a | Phase 3 gains two global `REVOKE EXECUTE … FROM PUBLIC` statements | The runbook's block leaves `anon` able to execute every new function (Stage 0 finding 1) |
| D-b | Phase 1 block reads `ai_providers.base_url` | 475 depends on it and step 1.5's query omits it (finding 3) |
| D-c | 460 skipped, ledger row recorded, migration 522 applied at order 25 | Owner decision **D-62** |
| D-d | 475 and 507 re-forecast from FAIL to PASS | Measured under the production order (findings 2 and 3) |
| D-e | **Block 0.1 checks the production host out onto `staging`**; the deploy builds from `staging`; `main` is realigned by a PR in Block 73 | Every file the executor reads — the 77 migrations, BLOCKS.md, 522 — lives on `staging`. On `main` at `469fe0a9` the first `mig_apply` prints `MISSING FILE` and the run stops. A checkout switch is reversible in seconds; a merge into `main` is a change to shared history, so it waits until the data is safe |
| D-f | **Block 3.5 takes a second, final `pg_dump`** after the owner confirms every user is logged out; it becomes the restore target | Staff worked on production today, so the morning dump would lose their work. It also sits *after* Blocks 2 and 3, so restoring it undoes neither the ledger reconciliation nor the ACL closure — which restoring the morning dump would |
| D-g | The Phase 4 gate additionally requires `BLOCK 3.5 OK` **and** a recorded final-dump md5 | Without a recorded final dump there is no restore target, and Phase 4 is the first irreversible phase |

---

## Owner decisions taken at a step

*(appended live)*

| Code | Step | Decision | Consequence recorded |
|---|---|---|---|
| **D-62** | order 25 | 460 skipped and superseded by 522; 460's ledger row recorded with a note | Taken before the run |
| **D-59** | standing | 23 of 42 users keep `admin`; nothing changed | All 15 client-side `admin` gates stay open to half the company after the deploy |
| **D-63** | Block 0-B | Restore drill runs **on production**, into a scratch database, dropped afterwards | One `CREATE DATABASE` and one `DROP DATABASE` on the production cluster; real data read, never written; `postgres` itself untouched |
| **D-64** | Block 0.1 | Production host checks out **`staging`** for the run; `staging → main` PR in Block 73 | Production does not track `main` during the run. **Block 73 must not be skipped**, or production follows `staging` silently from then on. After the Block 73 merge, `APP_GIT_SHA` will legitimately differ from `main`'s HEAD — same content, different commit — and a rebuild from `main` is offered to restore that check |
| **D-65** | Block 3.5 | Final dump taken only after the owner confirms all users are logged out, corroborated by zero `audit_logs` writes in the last 10 minutes | The morning dump is demoted to drill input; the final dump is the only restore target from Block 3.5 onward |

---

## Final state

*(filled in at the end)*

- Ledger top version: —
- Ledger row count: —
- `APP_GIT_SHA`: —
- Phase 5 census (`anon` reads exactly the KEEP_OPEN set): —
- Migrations applied / skipped / failed: —

---

## HANDED FORWARD — not tonight's business, must not be lost

1. **23 of 42 users hold `admin`** (D-59). The deploy installs 15 client-side `admin` gates; with
   23 admins, every one of them stays open to half the company. The gates are real, the audience
   is not narrow.
2. **The `anon` JWT secret is shared between test and production.** The audit measured a *test*
   `anon` key working against production. Any test-environment key leak is a production key leak.
3. **62 of the 74 migrations have no `down` script**, and the 12 that do have **never been
   executed**. For most of tonight, rollback means restoring the backup.
4. **The `og103` view gap on test:** migration 477 is a hard-coded list of 390 `REVOKE`s generated
   from the test catalogue, not a catalogue walk. A table present on production but absent from
   test is left with its `anon` grant silently — the census counts differ (199 test vs 202
   production), so at least three relations sit outside 477's list.
5. **Cron is not installed tonight.** Appendix A is composed but unexecuted. `cron.timezone` is
   GMT while Iran is UTC+3:30 with no DST, and there is an unresolved decision about where the
   worker token lives (vault vs a single-row table).
6. **`daily-birthday-notifications` has failed 56 consecutive times** with
   `ERROR: authentication required`, and nobody was notified. Same root cause 507 documents: cron
   carries no JWT, so `auth.uid()` is NULL.
7. **The extension mapping and the Caller-ID popup** remain open items from the phone work.
8. **New, from Stage 0: production's receipt OCR points at the test machine.**
   `ai_providers.ollama.base_url = http://192.168.170.8:11434` on production — that is
   `192.168.170.8`, the test computer. Migration 475 requires exactly this address, so it is
   load-bearing, not a typo to fix casually. Production OCR depends on the test host being up.
9. **New, from Stage 0: production's ollama does not declare `vision`**
   (`capabilities = {chat,embeddings}`), so receipt OCR resolves to an empty candidate list and
   degrades to manual entry. This is the safe direction of failure and 522 reports it rather than
   changing it. Whether the local model should advertise vision is an owner decision.
10. **New, from Stage 0: five migrations in this project assert an absolute row count** — 410,
    418, 449, 450, 452 — and 450 asserts four of them. The correct fix is to assert a
    *relationship*, not a number. This has now cost the project five incidents.

---

## If the run is stopped and the backup restored

**This section stays empty unless it happens.** If it does, it is written at the **top** of this
file, with the reason, before anything else. A restored production with an honest report is a
successful mission.
