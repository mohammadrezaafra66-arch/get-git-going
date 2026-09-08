# Production migration — the run record · 2026-09-08

> **Status: STAGE 0 COMPLETE. THE RUN HAS NOT STARTED.**
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
| Production repo | `C:\afrakala` · tracks `main` · currently at `469fe0a9` (610 migration files) |
| Production schema top | migration **424** (`20260904150000`) |
| Production ledger | **569 rows**, max `20260827120000` (= migration 410) — lies in **both** directions |
| Backup | `C:\Users\AFRA KaLa\Desktop\prod-20260908.dump` · **33,784,463 bytes** · `-Fc` · taken 2026-09-08 · **verified by size only — restore NOT drilled** |
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

### Forecast for the 74

| | count | which |
|---|---|---|
| expected to succeed | **69** | includes 462, 475, 476, 477, 478, 487, 497, 507, 514, 516 |
| expected to fail, decision at the step | **3** | 449 (order 15), 450 (16), 452 (18) |
| skipped by owner decision, replaced | **1** | 460 → 522 |
| applied in addition | **1** | 522, at order 25 |

**First stop is order 15.** Past order 18, nothing is currently forecast to stop the run.

### Remaining `UNREHEARSED`, at the moment the owner starts

`U-1` **restore drill of this dump** (verified by size only — largest remaining gap) ·
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

---

## Owner decisions taken at a step

*(appended live)*

| Code | Step | Decision | Consequence recorded |
|---|---|---|---|
| **D-62** | order 25 | 460 skipped and superseded by 522; 460's ledger row recorded with a note | Taken before the run |
| **D-59** | standing | 23 of 42 users keep `admin`; nothing changed | All 15 client-side `admin` gates stay open to half the company after the deploy |

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
