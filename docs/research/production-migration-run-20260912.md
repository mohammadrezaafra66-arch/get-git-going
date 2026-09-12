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
| 0.1 | checkout state | 2026-09-12 | branch `staging` @ `4c608900`, one untracked file | **STOP** |

### Block 0.1 — checkout state — 2026-09-12

```
command: git status --porcelain
         git rev-parse --abbrev-ref HEAD
         git rev-parse --short HEAD
output:
?? supabase/migrations/20260907123000_425_bot_api_expose_settlement_metadata.sql
staging
4c608900
verdict: STOP
```

**Two mismatches against the block's «باید ببینی» (branch `main`, SHA `469fe0a9`, empty
`git status --porcelain`):**

1. **The checkout is already on `staging`, at `4c608900` — not `main` at `469fe0a9`.**
   `4c608900` is higher than `a6b6c629`, the commit BLOCKS.md §0.1 and this file both record as
   the tip of `origin/staging`, and its subject is `prodprep - Phase 4 written out, and the gap
   recounted to 77 (#436)` — a **PR #436** that BLOCKS.md §0.1 and this file both state **does
   not exist** (`gh pr view 436` → `Could not resolve to a PullRequest`). Something moved this
   checkout and this branch after the blocks were written, and nothing here records it. The
   end-state Block 0.1 wanted (checked out on `staging`) is already reached, but not by a path
   anyone wrote down, and not at the commit anyone predicted.

2. **`git status --porcelain` returns one line.** Block 0.1's stop rule fires verbatim: a file in
   `C:\afrakala` that exists nowhere else. Not stashed, not discarded, not touched.
   The file is `supabase/migrations/20260907123000_425_bot_api_expose_settlement_metadata.sql`,
   and it is **not inert**: its version prefix `20260907123000` is the *same version* as
   `20260907123000_515_system_health_reports_require_admin.sql`, which tonight's Phase 4 applies
   and records (§4.8, the four-file batch). Both files are on disk. A duplicated migration version
   is exactly what `e2e/security/og81-migration-ledger-matches-disk.spec.ts` exists to catch, and
   its number `425` also collides with `20260904160000_425_settlement_dead_predicates.sql`
   (order 3).

**No production command was run.** Block 0.2, Block 0-B and everything after are not started.
Nothing was committed, branched or pushed — creating `feature/prodrun-20260912` would move the
checkout off `staging`, and the checkout's provenance is the open question.

note: the brief names this file `production-migration-run-20260908.md`; the file that exists on
disk, and the one appended to here, is `production-migration-run-20260912.md`.

### Block 0.1 diagnostic — orchestrator-ordered, read-only — 2026-09-12

Four commands, all read-only. No verdict taken. The run is still stopped.

```
command: Get-Item supabase\migrations\20260907123000_425_bot_api_expose_settlement_metadata.sql |
         Select-Object Name, Length, CreationTime, LastWriteTime
output:
Name          : 20260907123000_425_bot_api_expose_settlement_metadata.sql
Length        : 7471
CreationTime  : 9/7/2026 3:32:51 PM
LastWriteTime : 9/7/2026 3:32:51 PM
```

```
command: docker exec -u postgres afrakala-lan-db psql -d postgres
         -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20260907123000';"
output:
 version
---------
(0 rows)
```

```
command: git log --all --oneline -- supabase/migrations/20260907123000_425_bot_api_expose_settlement_metadata.sql
output:
(no output — no commit on any ref touches this file)
```

`Get-Content` returned 260 lines / 7,471 bytes. Summary of the body:

- Two `CREATE OR REPLACE FUNCTION` statements only — `public.bot_list_products_for_key(uuid, uuid,
  timestamptz, integer, integer)` and `public.bot_get_product_for_key(uuid, uuid)`. Both
  `SECURITY DEFINER`, `SET search_path = public`.
- Each is followed by `REVOKE ALL … FROM public, anon, authenticated` and
  `GRANT EXECUTE … TO service_role` — least-privilege style, consistent with the project.
- The stated scope is additive: the `prices[]` array in each product's JSON gains
  `settlement_type_id` / `_code` / `_title` via a `LEFT JOIN public.settlement_types`. Header
  claims no pricing-calculation, RLS, table-privilege or route changes.
- **No `BEGIN;`/`COMMIT;`**, no `DROP FUNCTION`, no DDL on tables.
- **It does not start with `SET client_encoding='UTF8';`**, which `CLAUDE.md` requires of every
  migration file. The body is pure ASCII — no Persian text — so nothing is at risk of corruption,
  but the file does not meet the project's own migration convention.
- Both functions carry defaulted parameters. If the live signatures on production differ in arity,
  `CREATE OR REPLACE` **overloads** rather than replaces (`CLAUDE.md` rule 5) — unread, because
  reading `pg_get_functiondef` on production is not in any block.

**What the four readings establish:**

1. **It predates the run and has never been edited.** Created and last written at the same instant,
   2026-09-07 15:32:51 — the day before BLOCKS.md was written, five days before tonight.
2. **It exists on no ref anywhere.** `git log --all` is empty: not on `main`, `staging`, any
   feature branch, any tag, any remote-tracking ref. It was never committed, so it is not
   recoverable from history if destroyed — the `CLAUDE.md` hazard in its purest form.
3. **The version is not yet in production's ledger.** `20260907123000` returns 0 rows, consistent
   with production's ledger max of `20260827120000`. So there is no collision *today*; the
   collision would be created tonight, at the moment §4.8 applies migration 515 and inserts
   `20260907123000`. After that insert, this file's version is permanently claimed by a different
   migration.
4. **The number `425` is also taken** by the tracked `20260904160000_425_settlement_dead_predicates.sql`,
   which tonight applies at order 3.

**Role deviation, recorded:** the orchestrator's third command specified `-u postgres`, not the
`supabase_admin` the brief pins execution to. It was run as handed. It succeeded via peer auth
with no password, which shows the `postgres` OS user can read this catalogue — a data point, not
a decision, and not a precedent for any write. **Accepted by the orchestrator: read-only, its own
instruction, not a precedent.**

### Block 0.1 — resolution: move-aside-and-continue — 2026-09-12

Orchestrator decision. The file is an uncommitted, unapplied draft left on this host on
2026-09-07. Not deleted (unrecoverable — it exists on no ref), not left in `supabase/migrations/`
(duplicate version with 515, duplicate number with 425, `og81` would go red).

```
command: Test-Path "C:\Users\AfRa KaLa\Desktop\DRAFT-untracked-from-production-20260907_425_bot_api_expose_settlement_metadata.sql"
output:  False          (destination free — checked before moving, so nothing was overwritten)

command: Move-Item supabase\migrations\20260907123000_425_bot_api_expose_settlement_metadata.sql
         "C:\Users\AfRa KaLa\Desktop\DRAFT-untracked-from-production-20260907_425_bot_api_expose_settlement_metadata.sql"
         Get-Item <destination> | Select-Object FullName, Length, LastWriteTime
output:
FullName      : C:\Users\AfRa KaLa\Desktop\DRAFT-untracked-from-production-20260907_425_bot_api_expose_settlement_metadata.sql
Length        : 7471
LastWriteTime : 9/7/2026 3:32:51 PM
```

**Preserved intact:** length `7471` and mtime `2026-09-07 15:32:51` both identical to the readings
taken before the move. Same volume, so the move was a rename, not a copy.

```
command: git status --porcelain ; git rev-parse --abbrev-ref HEAD ; git rev-parse --short HEAD
output:
 M docs/research/production-migration-run-20260912.md
staging
4c608900
```

verdict: **SKIP-AND-RECORD**
note: owner to ask who authored it. The draft is preserved on the Desktop at the path above; it
is on no git ref, so that file is the only copy.

**Deviation from the predicted output, declared rather than waved past:** the orchestrator expected
`git status --porcelain` to be **empty**, and it returns **one line**. That line is
`docs/research/production-migration-run-20260912.md` — **this run log**, a tracked file I have been
appending to under PART 4 of the executor brief. The untracked draft is gone; the hazard Block 0.1
guards against ("a file in `C:\afrakala` that exists nowhere else") is cleared, because this file's
baseline is on `origin`. Branch and SHA unchanged: `staging` @ `4c608900`.

> **Forward-looking consequence, flagged now so it is not a surprise later:** **Block 69 requires a
> clean working tree** before the deploy build, and this run log is inside the repo and will be
> modified continuously until Phase 7. Block 69 will therefore show this same line. It needs a
> decision before Phase 6 — commit the log first, or have Block 69 tolerate exactly this path.

### 🔴 AMENDMENT TO BLOCK 69 — read this before running Block 69 — decided 2026-09-12

**Orchestrator decision.** Block 69's «working tree **تمیز**» requirement is amended to:

> **Exactly one modified path is tolerated:** `docs/research/production-migration-run-20260912.md`.
> **Any other modified or untracked path at Block 69 is still a stop.**

**Why it is tolerated:** it is the run log, it is not build input, and nothing in the deploy reads
it.

**Why it is not committed instead:** committing mid-run creates a new commit and moves `HEAD` off
`4c608900`, which is the SHA the deploy stamps into `APP_GIT_SHA` and the SHA that must match
`origin/staging`. Committing to tidy the check would break the check.

So at Block 69 the expected output of `git status -sb` / `git status --porcelain` is **that one
line and nothing else**, with branch `staging` and the SHA unchanged.

### Block 0.2 — the morning backup — 2026-09-12

```
command: $dump = "C:\Users\AfRa KaLa\Desktop\prod-20260912.dump"
         Get-Item $dump | Select-Object FullName, Length, LastWriteTime
         cmd /c "certutil -hashfile ""$dump"" MD5"
output:
FullName      : C:\Users\AfRa KaLa\Desktop\prod-20260912.dump
Length        : 35069593
LastWriteTime : 9/12/2026 10:51:06 AM

MD5 hash of C:\Users\AfRa KaLa\Desktop\prod-20260912.dump:
86c8609fe856abba1a3f8e516c2c5a86
CertUtil: -hashfile command completed successfully.
```

verdict: **OK** — every expectation met.

- File present.
- `Length` = **35,069,593** bytes — exactly the figure in the executor brief, and larger than the
  2026-09-08 dump's 33,784,463, which is the required direction.
- `LastWriteTime` = **2026-09-12**, today.
- **md5 = `86c8609fe856abba1a3f8e516c2c5a86`** — carried forward; Block 0-B must reproduce this
  exact value inside the container or the file was damaged in transit.

note: the dump's timestamp is **10:51 AM**, not first thing in the morning. The brief describes it
as taken "before staff started work"; at 10:51 that is unlikely to be strictly true, so it may
already contain part of today's work. **This changes nothing tonight** — this file is drill input
only, and the restore target is the Block 3.5 final dump taken after everyone is logged out. It is
recorded so nobody later mistakes this file for a pre-work baseline.

### Block 0-B — restore drill — 2026-09-12

#### Defect found before running: the transfer fence is PowerShell

Block 0-B's first half is fenced ```powershell and pipes the dump with `cat $dump | docker exec -i`.
In PowerShell `cat` is `Get-Content`, which reads a 35 MB **binary** `-Fc` dump as decoded text
lines — the exact route `CLAUDE.md` forbids and measured as corrupting (167 bytes against 165), and
the route Block 3.5.2 of this same document explicitly warns against. Every other transfer in this
document — Block 2-a, Block 3.5.2, `mig_apply` — is fenced ```bash with `MSYS_NO_PATHCONV=1`. The
fence is a defect, not a decision. **Reported before running; orchestrator authorised the Git Bash
equivalent.** Nothing was run through PowerShell.

#### 0-B first half — transfer and TOC

```
command: export MSYS_NO_PATHCONV=1
         DUMP="/c/Users/AfRa KaLa/Desktop/prod-20260912.dump"
         cat "$DUMP" | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/p12.dump'
         docker exec afrakala-lan-db ls -l /tmp/p12.dump
         docker exec afrakala-lan-db md5sum /tmp/p12.dump
output:
TRANSFER_EXIT=0
-rw-r--r-- 1 root root 35069593 Sep 12 08:27 /tmp/p12.dump
86c8609fe856abba1a3f8e516c2c5a86  /tmp/p12.dump

command: docker exec afrakala-lan-db sh -c 'pg_restore --list /tmp/p12.dump | head -12'
         docker exec afrakala-lan-db sh -c 'pg_restore --list /tmp/p12.dump | wc -l'
output:
; Archive created at 2026-09-12 07:21:03 UTC
;     dbname: postgres
;     TOC Entries: 5050
;     Compression: -1
;     Dump Version: 1.14-0
;     Format: CUSTOM
;     Dumped from database version: 15.6
;     Dumped by pg_dump version: 15.6
5059
```

verdict: **OK**. md5 identical to Block 0.2 on both sides — byte-exact delivery proven.
`dbname: postgres` correct. `TOC Entries: 5050`, far above the "much less than 5000" stop
threshold. Line count **5,059** against the block's "near 5,073" — 14 lines / 0.3% low, not a stop.
Archive time `07:21:03 UTC` = **10:51 Tehran**, corroborating Block 0.2's `LastWriteTime` exactly.

#### 0-B Level 2 — real restore into a scratch database (D-63)

```
command: psql -U supabase_admin -d postgres -c "CREATE DATABASE restore_drill_20260912;"
output:  CREATE DATABASE / CREATE_EXIT=0

command: pg_restore -U supabase_admin -d restore_drill_20260912 --no-owner --disable-triggers /tmp/p12.dump
output:  PG_RESTORE_EXIT=1        (21 error lines)
     17  ERROR:  schema "cron" does not exist
      1  ERROR:  extension "pg_cron" does not exist
      1  ERROR:  can only create extension in database postgres
      1  ERROR:  relation "decrypted_secrets" already exists
      1  ERROR:  function "secrets_encrypt_secret_secret" already exists with same argument types
```

verdict: **OK — the forecast matched exactly.** The block predicted "exit 1 and about 21 errors,
19 of them `pg_cron` and 2 vault". Measured: **precisely 21 = 19 cron (17 + 1 + 1) + 2 vault.**

**No business-data loading error.** The only failed `COPY`s are `cron.job` and
`cron.job_run_details`, both inside the 19 cron failures, because the `cron` schema is not created
outside a database named `postgres`. No `public` table failed to load.

#### Defect found mid-block: `''…''` quoting collapses inside `sh -c '…'`

The count query is written `WHERE table_schema=''public''` inside a single-quoted `sh -c '…'`.
POSIX sh cannot escape a single quote inside single quotes: `''` simply closes and reopens the
string, so psql receives the bare identifier `public` and the query dies with
`ERROR: column "public" does not exist`. Measured, first attempt.

**This is not local to Block 0-B. The same pattern appears five times in BLOCKS.md:**

| line | block | what it verifies |
|---|---|---|
| 226 | 0-B | the six restore counts |
| 249 | 0-B | that the scratch database is gone |
| 726–727 | **13** | that 446, 443, 445 recorded — expects `3` |
| 849 | **20** | that the six 453→459 recorded — expects `6` |
| 1013 | **37** | that 484's rename landed — expects NULL |

**Why this matters more in Phase 4 than here:** in Blocks 13, 20 and 37 the verification is chained
with `&&` **after** `mig_apply`. The migrations apply and record successfully, then the *verifier*
dies with a confusing `column … does not exist`. That reads like a migration failure and could
trigger an unnecessary stop — or a restore — over a shell-quoting bug.
**The orchestrator should reissue those three verifiers before Phase 4.** `mig_apply` itself is
unaffected: it uses `\"` escaping and is correct.

Worked around here by delivering the SQL as a **file** (`CLAUDE.md` rule 3), md5 verified both
sides `272b0d75513bfae96e3703e68e0f7313`, and by `'"'"'` escaping for the one-line drop check.

```
command: psql -U supabase_admin -d restore_drill_20260912 --no-psqlrc -f /tmp/drill-counts.sql
output:
 tables | views | functions | policies | persons | audit_logs
--------+-------+-----------+----------+---------+------------
    246 |    22 |       839 |      628 |    4856 |     111403
```

| | expected | measured | |
|---|---|---|---|
| `persons` | ≥ 4,851 | **4,856** | ✅ the block's only hard stop — cleared, data is present |
| `audit_logs` | ≥ 107,713 | **111,403** | ✅ +3,690, consistent with days of real work |
| `tables` | ~221 | **246** | ⚠️ +25 |
| `views` | ~20 | **22** | ⚠️ +2 |
| `functions` | ~823 | **839** | ⚠️ +16 |
| `policies` | ~622 | **628** | ⚠️ +6 |

**Not a stop** — the block's stated stop condition is `persons` zero or far low, and the other four
are given as "near". **But recorded as an open question for the orchestrator**, because the four
schema counts all run high in the same direction, and Phase 4 applies 76 migrations on the
assumption that production's schema top is migration **424**. Production's ledger cannot settle
this (direct `psql` application never writes it — `CLAUDE.md` 2b). Block 1's `to_regclass` probes
test four specific objects, not the count. Two innocent readings exist — the `221 | 20 | 823 | 622`
reference may come from an older dump (findings `U-10` names a 2026-08-31 dump), or
`information_schema.tables` counting views inflates it — and one that is not innocent: production's
schema moved since 2026-09-08.

#### Cleanup — not skipped

```
command: DROP DATABASE restore_drill_20260912;
         SELECT count(*) FROM pg_database WHERE datname = 'restore_drill_20260912';
output:  DROP DATABASE
         0
command: docker exec afrakala-lan-db rm -f /tmp/p12.dump /tmp/drill-counts.sql
```

Scratch database gone, confirmed `0`. Both files removed from the container's `/tmp`. The live
`postgres` database was never connected to except to create and drop the scratch database.

> **Unexplained artefact, noted not touched:** `/tmp` in `afrakala-lan-db` still holds
> `afrakala-db-canonical.dump`, 35,013,286 bytes, dated **Sep 12 00:30** — today, half past
> midnight, and not created by this run. **Left alone.** It joins the unrecorded checkout move to
> `staging` @ `4c608900` and the 2026-09-07 draft migration as a third sign that someone worked on
> this host recently without leaving a record. Worth asking the owner who.

### Orchestrator decisions on the three Block 0-B findings — 2026-09-12

- **A · The `''…''` verifiers.** At Blocks **13**, **20** and **37**, each verification `SELECT` is
  to be delivered **by file** — written into the container's `/tmp`, run with `psql -f` — instead
  of the `sh -c` form that cannot carry `''public''`. **`BLOCKS.md` is not to be edited:** a second
  modified path would trip the amended Block 69 check. Each substitution is logged as a block
  defect, with the original and the replacement.
- **B · The schema-count delta is not the schema test.** Block 1's four `to_regclass` probes are.
  A stop is the ledger or any of the four objects differing from expectation — not the count delta.
- **C · The overnight artefact.** Noted; the owner is asking who worked on this host.
  `afrakala-db-canonical.dump` stays untouched.

### Block 1 — PREFLIGHT — 2026-09-12

```
command: git rev-parse --short HEAD
         docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA"
output:
4c608900
APP_GIT_SHA=469fe0a9
```

```
command: $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
         docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c "<the seven preflight SELECTs>"
         docker exec afrakala-lan-db df -h /var/lib/postgresql/data
output:
 is_replica
 f

 ledger_rows |   ledger_min   |   ledger_max
         569 | 20260424144837 | 20260827120000

 db_size
 464 MB

        dn        |       dd       |          da          |               m408
 document_numbers | dual_documents | document_attachments | hold_credit_for_quote(uuid,uuid)

  name  |       kind        | is_active |   capabilities    |          base_url          |                  id
 gpt    | openai_compatible | f         | {vision}          | https://api.openai.com/v1  | f6a5bc04-9c89-42a1-9bfe-dd3258313a0b
 ollama | ollama            | t         | {chat,embeddings} | http://192.168.170.8:11434 | e07894ce-e804-443c-9873-040c312c48d5

    service_key     | is_enabled | fallback_enabled | provider_name
 receipt_ocr.vision | t          | f                | ollama

 anon_default_acl
                9

Filesystem      Size  Used Avail Use% Mounted on
/dev/sde       1007G   51G  905G   6% /var/lib/postgresql/data
```

verdict: **OK — every one of the block's eight expectations met.**

| check | expected | measured | |
|---|---|---|---|
| `is_replica` | `f` | **`f`** | ✅ not a replica; the run may proceed |
| `ledger_rows` | ~569 | **569** | ✅ exact |
| `ledger_max` | `20260827120000` | **`20260827120000`** | ✅ exact |
| `dn` / `dd` / `da` | all three named | **all three** | ✅ |
| `m408` | `hold_credit_for_quote(uuid,uuid)` | **present** | ✅ |
| `ai_providers` | `gpt` inactive; `ollama` active @ `http://192.168.170.8:11434` | **exact** | ✅ |
| vision route | `t` / `f` / `ollama` | **exact** | ✅ |
| `anon_default_acl` | 9 | **9** | ✅ exact |
| free space | ≥ 1 GB | **905 GB** | ✅ |

**Decision B is therefore satisfied and the Block 0-B count delta is closed as a non-stop.** The
ledger is exactly where it was forecast — 569 rows, top `20260827120000` — and all four probed
objects exist. The schema is where the plan assumes it is.

Cosmetic only: `m408` prints as `hold_credit_for_quote(uuid,uuid)` without the `public.` prefix the
block quotes, because `to_regprocedure` omits a schema that is on `search_path`. Same object.

Two readings worth carrying forward, neither a stop:

1. **`APP_GIT_SHA=469fe0a9`** — the running container was built from `main` at `469fe0a9`, the SHA
   BLOCKS.md §0.1 expected the checkout to be on. Production is still serving the old code, as
   planned; Phase 6 replaces it. It also corroborates the checkout story: the image was built while
   the checkout was `main` @ `469fe0a9`, and the move to `staging` @ `4c608900` came afterwards.
2. **`ollama.capabilities = {chat,embeddings}` — no `vision`**, while the only provider that
   declares `vision` (`gpt`) is inactive. This is the already-documented reason receipt OCR
   resolves to an empty candidate list and degrades to manual entry, and it is what migration 522
   reports rather than changes. `base_url` is exactly the string migration 475 requires at order
   37, so 475 is expected to pass.
3. `db_size` **464 MB** against 905 GB free — disk is not a constraint tonight by three orders of
   magnitude.

### Block 2-a — ledger reconciliation report (read-only) — 2026-09-12

```
command: printf '20260903100000\n20260903140000\n' > /tmp/skip.txt
         ls supabase/migrations/*.sql | xargs -n1 basename | sed 's/_.*//' \
           | awk '$1 <= "20260904150000"' | sort -u > /tmp/all.txt
         comm -23 /tmp/all.txt /tmp/skip.txt > /tmp/candidates.txt
         wc -l /tmp/all.txt /tmp/skip.txt /tmp/candidates.txt
         cat /tmp/candidates.txt | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/reconcile_candidates.txt'
output:
  612 /tmp/all.txt
    2 /tmp/skip.txt
  610 /tmp/candidates.txt
md5 host      f79ed61665c12afd0f995957f2b4b199
md5 container f79ed61665c12afd0f995957f2b4b199      <- identical
```

```
command: <the report body from ledger-reconcile.sh:74-137, delivered by file>
         md5 host / container: 061d040e12ca1b6b57b649855474d0c6 (identical)
         psql -U supabase_admin -d postgres --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f /tmp/rr.sql
output:
 ledger_rows |   ledger_min   |   ledger_max
         569 | 20260424144837 | 20260827120000

 candidate_rows | candidate_max
            610 | 20260904150000

 gap_rows
       41

 orphan_rows
        0
```

verdict: **STOP** — `gap_rows` is **41**, against the block's "a number between 5 and 20, it was 10
on the rehearsal", and the block's own rule: *«اگر خیلی بزرگ‌تر از ۲۰ بود، بایست و بپرس چرا.»*
**Nothing was written. 2-b was not run.**

**The 41 versions, in full:**

```
20260818150000 20260818151000 20260818152000 20260818153000 20260818154000
20260818155000 20260818156000 20260818157000 20260818158000 20260818160000
20260818161000 20260818170000 20260818180000 20260819091000 20260819092000
20260819093000 20260819100000 20260819101000 20260819111000 20260819130000
20260819140000 20260819150000 20260819151000 20260819160000 20260819180000
20260821120000 20260821121000 20260822143000 20260822210000 20260828000000
20260828010000 20260829000000 20260829120000 20260831090000 20260831140000
20260831170000 20260831190000 20260831210000 20260903160000 20260904113000
20260904150000
```

**What the numbers say, and why 41 is not obviously wrong:**

1. **The arithmetic is exactly consistent.** 610 candidates − 569 ledger rows = 41, with
   `orphan_rows = 0`. Every row the ledger holds is a real candidate; nothing bogus is recorded.
   There is no third category hiding here.
2. **`candidate_max` = `20260904150000`** — exactly production's stated schema top, migration 424.
3. **The gap splits cleanly in two at the ledger's own ceiling** (`ledger_max = 20260827120000`):
   **29 of the 41 fall *below* it** — the 2026-08-18/19/21/22 cluster — and **12 fall above it**
   (2026-08-28 onward). The 12 are unremarkable: they are simply later than the last row anyone
   wrote. The 29 are the interesting half, and they are a dense contiguous run, not a scatter.
4. **This is a documented, recurring failure of this project, at this magnitude.** `CLAUDE.md` §2b
   records the same thing on the test host on 2026-08-27: *"the ledger held 552 rows against 597
   files on disk — 45 applied migrations were unrecorded — and it had stopped updating on
   2026-08-22."* **45 there, 41 here, and both stalls begin in the same week.** The cause is the one
   `CLAUDE.md` names: applying by `psql` does not write `supabase_migrations.schema_migrations`;
   only the Supabase CLI does.
5. `CLAUDE.md` §2b also prescribes exactly what Block 2-b would do: *"If you find a migration
   already applied but unrecorded, **RECORD THE ROW** — never re-run the migration to 'make the
   ledger right'."* So the **action** 2-b takes is the correct one; only its **magnitude** was
   mis-forecast.

**The one thing the report cannot prove, and the reason this is a real stop rather than a
formality:** the whole candidate list rests on the premise *"every file with a version ≤
20260904150000 is already applied on production, except 420 and 421."* If any of those 41 was in
fact **never applied**, then inserting its ledger row does not correct a record — it **erases the
evidence that a migration is missing**, permanently, and the next reader concludes the schema is
complete when it is not. Block 1's four `to_regclass` probes do not test any of the 41. Nothing
measured so far tests them.

This is also the most plausible explanation left for the Block 0-B schema-count delta (+25 tables,
+16 functions, +6 policies) — the two findings may be the same fact seen twice, or they may be
unrelated. Neither is settled.

**Not proposed, not run — for the orchestrator to rule on:** the 41 are cheap to spot-check. Each
migration creates or alters a named object, so a handful of `to_regclass` / `to_regprocedure`
probes drawn from the ends and the middle of the 29-row cluster would either confirm the premise or
expose a genuinely missing migration before anything is written. **Awaiting a decision naming Block
2-a.**

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
| **D-66** | Block 3.5.1 | `all out` was not true — writes continued for at least 7 minutes after it. `docker stop afrakala-lan-rest` was used to close the write path, **instead of** `DELETE FROM auth.refresh_tokens; DELETE FROM auth.sessions;` | Not in `BLOCKS.md`; taken as an explicit owner decision. Deletes no data and is reversible. **PostgREST is DOWN from 09:31 UTC and must be started again — Block 68 already does this, and skipping it leaves production with no data path.** The proposed `DELETE` was refused as a `CLAUDE.md` rule-3 violation that would also not have stopped the writes (stateless JWTs outlive the session rows) |

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

### Block 2-a follow-up — all 41 probed, not a sample — 2026-09-12

Orchestrator decision: probe every one of the 41 before 2-b writes anything. Each migration was
read, one object it creates or alters was named, and one read-only query checked all 41 at once
(delivered by file, md5 `cb877d6192919abfa9f70fa86befa5e1` identical both sides).

**Result: 35 of 41 are applied. Six are NOT, and must not be recorded.**

| version | # | object probed | present |
|---|---|---|---|
| 20260818150000 | **336** | func `post_receipt_journal(uuid)` is GONE | **f** |
| 20260818151000 | 337 | func `jalali_year(date)` | t |
| 20260818152000 | 338 | table `document_numbers` | t |
| 20260818153000 | 339 | `anon` cannot execute `burn_document_number` | t |
| 20260818154000 | 340 | func `require_asan_code(uuid)` | t |
| 20260818155000 | 341 | column `journal_entries.doc_kind` | t |
| 20260818156000 | 342 | table `document_attachments` | t |
| 20260818157000 | **343** | func `tg_journal_entry_immutable()` | **f** |
| 20260818158000 | 344 | `role_permissions` module `ledger-documents` | t |
| 20260818160000 | 345 | func `pay_purchase_with_voucher/11` | t |
| 20260818161000 | 346 | `require_asan_code` is SECURITY INVOKER (2nd probe) | t |
| 20260818170000 | 347 | func `validate_journal_line_ref()` [weak] | t |
| 20260818180000 | 348 | constraint `payment_receipts_receiver_exclusive_chk` | t |
| 20260819091000 | 351 | func `create_receipt` [weak] | t |
| 20260819092000 | 352 | policy `document_numbers_select_finance` [weak] | t |
| 20260819093000 | 353 | trigger `trg_payment_receipts_block_delete_when_posted` | t |
| 20260819100000 | 354 | column `payment_vouchers.endorsed_receipt_id` | t |
| 20260819101000 | 355 | func `create_payment` [weak] | t |
| 20260819111000 | 357 | trigger `trg_payment_vouchers_block_delete_when_posted` | t |
| 20260819130000 | 360 | table `dual_documents` | t |
| 20260819140000 | 362 | func `create_dual_document` [weak] | t |
| 20260819150000 | 363 | column `journal_entries.reverses_entry_id` | t |
| 20260819151000 | 364 | func `reverse_document(text,uuid,text)` [weak] | t |
| 20260819160000 | 365 | view `vw_account_balances` [weak] | t |
| 20260819180000 | 367 | func `asan_list_journal_export(date,date,text)` | t |
| 20260821120000 | 368 | zero INSERT policies on `payment_vouchers` | t |
| 20260821121000 | 369 | func `get_account_ledger(uuid,date,date)` | t |
| 20260822143000 | 370 | `anon` cannot read `v_promotion_suggestions` | t |
| 20260822210000 | **373** | no `anon` in default ACL `supabase_admin/public` r+S | **f** |
| 20260828000000 | **411** | `customer_cooperation_months.max_value = 360` | **f** |
| 20260828010000 | **412** | cooperation `input_hint` names the new ceiling | **f** |
| 20260829000000 | **413** | `salesperson_sales_amount_monthly.max = 15000000000` | **f** |
| 20260829120000 | 414 | func `person_create_inline/9` | t |
| 20260831090000 | 415 | func `create_sales_quote_with_items/19` | t |
| 20260831140000 | 416 | policy `settlement_types_write` | t |
| 20260831170000 | 417 | column `sales_quotes.accepted_at` | t |
| 20260831190000 | 418 | no accepted quote left with NULL `accepted_at` | t |
| 20260831210000 | 419 | view `vw_customer_receivables` | t |
| 20260903160000 | 422 | view `v_documents_unified` | t |
| 20260904113000 | 423 | `purchases.payment_term_id` is NOT NULL | t |
| 20260904150000 | 424 | column `bank_accounts.asan_code` | t |

#### Two first-pass probes were wrong and were corrected before concluding

- **346 — first probe INVALID, migration IS applied.** It probed
  `tg_cleanup_receipt_attachments()`, which migration **402** — already recorded as applied —
  explicitly drops (`DROP FUNCTION IF EXISTS public.tg_cleanup_receipt_attachments();`). Absence
  proved nothing. Re-probed on 346's durable change: it flips `require_asan_code` from
  `SECURITY DEFINER` to `SECURITY INVOKER`. Production reads `prosecdef = f`, and only 340 and 346
  ever define that function. **346 is applied.**
- **412 — first probe was my bug.** It matched `input_hint LIKE '%360%'` in ASCII, but the migration
  writes Persian digits. Re-probed with Persian digits — and the verdict did not change:
  production's hint reads the OLD ceiling, `position` of the new ceiling is 0, of the old is 10.
  **412 is genuinely not applied.**

#### The six that are NOT applied — evidence, not inference

- **336** `post_receipt_journal(uuid)` **still exists** on production (1 overload). 391, which *is*
  recorded, only asserts in its comments that 336 already removed it — 391 does not drop it itself.
  So nothing has dropped it. 336 never ran.
- **343** There is **no immutability function or trigger anywhere** — `proname LIKE '%immutable%'`
  and `tgname LIKE '%immutable%'` both return 0 rows. Only 353 (a comment) and 487 (tonight's)
  mention them; nothing applied removed them.
- **373** All three `supabase_admin / public` default-ACL rows still carry `anon=...`
  (`r`, `f`, `S`). 373 is exactly two REVOKEs against `r` and `S`; neither took.
- **411** All seven customer parameters sit at the **old** ranges — cooperation months is
  **1..240**, not 1..360; `customer_purchase_1y` 5e9, not 25e9.
- **412** Hint still names the old ceiling.
- **413** All four salesperson parameters at old ranges — `salesperson_sales_amount_monthly`
  **1e9**, not 15e9; inbound/outbound calls **500**, not 1000.

#### Survivor count

**Reconciliation set for Block 2-b: 41 - 6 = 35.** The `gap = inserted` assertion must use **35**.
The six are removed from the set and appended to the Phase 4 apply list in timestamp order — where,
because every one of them predates `20260903100000`, they sort **ahead of 420**, at the very front
of Phase 4.

#### Three things about those six that are NOT routine additions

1. **411 and 413 move real customer credit ceilings, and `CLAUDE.md` rule 10 says so explicitly.**
   Widening a range re-normalises `dynamic_entity_scores`, which fires
   `trg_refresh_dyn_capital_after_score_change` and **rewrites the credit ceilings in
   `customer_capital_allocations_dynamic`** — measured previously as 52 score rows rewriting
   9 customers ceilings, **downward**, one `audit_logs` row each. The rule is unambiguous: get the
   owner approval for the ceiling movement, not merely for the numbers, and SELECT the affected
   ceilings before and after. **This is owner business-approval, not an executor decision, and it
   was not part of tonight forecast.** 412 is cosmetic by comparison — it only corrects the hint
   text 411 invalidates, and rule 10 closing paragraph exists because 411 shipped with a stale hint.
2. **373 is a subset of Block 3.** Block 3-b already issues
   `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES/SEQUENCES
   FROM anon` — 373 two statements verbatim — plus nine more. If Block 3 runs, 373 work is done by
   something else, which is structurally the same situation as 460/522 (D-62): skip the file,
   record the row, note why. Running 373 separately is harmless but redundant.
3. **487, at Phase 4 order 47, references `tg_journal_entry_immutable`** — the object 343 creates
   and production does not have. Whether that is a comment or a dependency was not established.
   **If it is a dependency, 343 must be applied before 487, not merely appended in timestamp
   order.** Worth settling before Phase 4 reaches order 47.

verdict: **STOP — awaiting the orchestrator.** Nothing was written. Block 2-b has not run.

### Block 2-b — the ledger write — 2026-09-12 · **FIRST WRITE TO `postgres`**

Orchestrator decision: run 2-b with 35.

The candidate set was rebuilt with an **8-entry** skip list — the original two (420, 421) plus the
six proven not applied (336, 343, 373, 411, 412, 413):

```
all versions <= 20260904150000 : 612
skipped                        :   8
candidates                     : 604        md5 ba6e54b9a7976af3b3bee46a876805c3 (identical both sides)
604 - 569 (ledger)             =  35
```

**One addition to the block, declared:** the `DO $reconcile$` body was given a hard pre-check
before the `INSERT`, so the probe result is enforced rather than assumed —

```sql
IF v_gap <> 35 THEN
  RAISE EXCEPTION 'ledger-reconcile: expected a gap of exactly 35 after the probe, found %', v_gap;
END IF;
```

If anything had changed between the probe and the write, the whole transaction would have rolled
back untouched. Everything else is the block body verbatim, including **no `ON CONFLICT`**.

```
command: psql -U supabase_admin -d postgres --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f /tmp/rr2.sql
         (md5 e5e2a0e3500ecbd55be949d20be1f0ab, identical both sides)
output:
COPY 604
 gap_rows = 35
 orphan_rows = 0
NOTICE:  ledger-reconcile: gap=35 inserted=35 ledger 569->604 (asserted)
DO
PSQL_EXIT=0
```

verdict: **OK.**

- `gap_rows` **35**, exactly as the probe predicted; the added assertion passed.
- `inserted` **35** = `gap` — the block's own equality requirement.
- Ledger **569 → 604**, and 604 equals the candidate count, so the ledger and the candidate set now
  agree exactly.
- `orphan_rows` **0** — nothing recorded that is not a real migration file.
- **None of the six unapplied migrations appears in the inserted list.** Verified against the
  printed 35: `20260818150000`, `20260818157000`, `20260822210000`, `20260828000000`,
  `20260828010000`, `20260829000000` are all absent. They remain unrecorded, which is the point —
  recording them would have erased the evidence that they were never applied.

**What this changes for anyone reading the ledger from now on:** before tonight it under-reported by
41 and would have invited a re-run of 41 migrations, several of them non-idempotent. It now
under-reports by exactly the six that genuinely have not run — and those six are queued for Phase 4
instead, which is the honest state.

### Block 2-c — idempotency proof — 2026-09-12

Run with the block's **original** `DO` body — the one-shot `v_gap <> 35` guard added for 2-b was
removed, because on a second pass it would (correctly) raise `found 0` and abort. Everything else
identical; md5 `16dc9a94a55f10157a218e6d13e4f05f` both sides.

```
output:
 ledger_rows |   ledger_min   |   ledger_max
         604 | 20260424144837 | 20260904150000

 candidate_rows | candidate_max
            604 | 20260904150000

 gap_rows    = 0
 orphan_rows = 0
NOTICE:  ledger-reconcile: gap=0 inserted=0 ledger 604->604 (asserted)
PSQL_EXIT=0
```

verdict: **OK — `gap=0 inserted=0`, exactly what the block requires.** The second pass wrote
nothing, so the reconciliation is idempotent and safe to re-run.

`ledger_max` has moved from `20260827120000` to **`20260904150000`** — the ledger now names
migration 424, which is where production's schema actually is. `ledger_rows` (604) equals
`candidate_rows` (604): the two sides agree exactly, for the first time in this record.

**Block 2 is complete.** Blocks 0, 0-B, 1 and 2 are all confirmed. Next is Block 3 (default-ACL
closure), then the staff boundary and Block 3.5.

### Block 3 — default-ACL closure — 2026-09-12

#### 3-a · read

**17 rows, not the 14 the block predicts — declared before running, and not a stop.** The
criterion the block actually depends on is exact:

| grantor / schema | objtype | mentions `anon` |
|---|---|---|
| `postgres` / `public` | S, f, r | yes, all three |
| `postgres` / `storage` | S, f, r | yes, all three |
| `supabase_admin` / `public` | S, f, r | yes, all three |
| `supabase_admin` / `cron`, `pgsodium`, `pgsodium_masks` | 8 rows | **none** |

Nine `anon` rows in exactly the three groups the block names; the eight extra rows grant only to
`postgres`, `pgsodium_keyholder` and `pgsodium_keyiduser` and are not what this block is about.
`anon_default_acl = 9` — the operative number — matches Block 1 exactly.

This reading is also the direct evidence that **migration 373 never ran**: the
`supabase_admin / public` rows for `r` and `S` still carried `anon=arwdDxt` and `anon=rwU`, which
are precisely 373's two REVOKEs.

#### 3-b · the write — eleven statements

Owner confirmed the statement set explicitly (the nine `anon` rows plus the two global
`REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`). Run as one transaction with `ON_ERROR_STOP=1`.

```
output:  ALTER DEFAULT PRIVILEGES   x 11

command: SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%';
output:  0
```

verdict: **OK.** Eleven statements, then **`0`** — and the zero, not the command messages, is the
success criterion the block sets.

#### 3-c · proof, entirely rolled back

```
   kind   | anon | authenticated
 function | f    | t
 table    | f    | t
 sequence | f    | t
ROLLBACK
```

verdict: **OK — character for character what the block requires.**

`anon` is `f` in all three rows, so the two extra global statements did the job the runbook's
original block could not: a **newly created function** is no longer executable by `anon` through
`PUBLIC`. `authenticated` is `t` in all three — nothing was taken from the role the application
actually uses. The probe objects were rolled back and nothing persists.

**Consequence for Phase 5:** step 5.2 / Block 65 can now return 0 rows, which Stage 0 finding 1
said was impossible without these two statements. **Consequence for Block 53 (migration 507):** its
`anon must not reach either function` check depends on exactly this, and 504 creates
`roll_employee_daily_streaks` *after* this closure — so 507 is now expected to pass.

**Blocks 0, 0-B, 1, 2 and 3 are confirmed. The staff boundary is next, then Block 3.5.**

### The staff boundary, and Block 3.5.1 — three attempts — 2026-09-12

The boundary was announced in Persian after Block 3, as the brief requires. The owner replied
`all out`. **The database disagreed, twice.**

#### Attempt 1 — 09:20 UTC · STOP

```
 last_audit_write              | idle_for        | writes_last_10min
 2026-09-12 09:20:29.813939+00 | 00:00:30.358849 |                23
```

Last write **30 seconds** earlier; 23 writes in the window. Expected `0`. **No dump taken** — the
block's rule is explicit: never take the backup in the middle of someone's work, because that file
is the restore target for the whole night.

Not caused by this run: Block 2 writes only to `supabase_migrations`, Block 3 only to
`pg_default_acl`; neither touches `audit_logs`.

#### Diagnostic — people, not a job

```
sales_quote_created / sales_quote_items_added | sales_quotes   | 09:23:18
sale_list_versioned                           | sale_list      | 09:20:29
currency_rate_created / _updated              | currency_rates | 09:19:58
product_updated, workbench_price_update, workbench_stock_update,
purchase_price_created / _updated                              | 09:17:5x
```

Human actions — product and workbench price/stock edits, currency rates, a sale-list version, and
**a sales quote created at 09:23:18**, i.e. *after* attempt 1. The per-minute shape was bursty and
irregular (54, 40, 34, 19 … then 11, 2, 1, 2), not the regular cadence a background job produces.
Tapering, but not finished.

#### Attempt 2 — 09:30 UTC · STOP

```
 last_audit_write             | idle_for       | writes_last_10min | checked_at
 2026-09-12 09:27:48.54397+00 | 00:02:37.23159 |                10 | 09:30:25
```

New activity again since attempt 1. Seven minutes after `all out`, work was still landing.

#### 🔴 Owner decision — stop PostgREST instead of deleting sessions

The owner proposed:

```
psql -c "DELETE FROM auth.refresh_tokens; DELETE FROM auth.sessions;"
```

**Not run.** Three objections were put, and the owner chose the alternative:

1. **It would probably not have worked.** GoTrue JWTs are stateless; PostgREST validates the
   signature, not `auth.sessions`. Deleting refresh tokens stops *renewal*, not an access token
   already in a user's hands — typically valid for up to an hour. The writes were arriving through
   PostgREST on valid JWTs and would have continued.
2. **It inflicts the exact harm we had just refused.** Anyone mid-form — like the 09:23 sales quote
   — loses the work, which is why we declined to dump mid-write in the first place.
3. **Out of contract:** not in `BLOCKS.md`, and `CLAUDE.md` DB-safety rule 3 forbids `DELETE` on a
   production table holding data.

**Chosen instead — `docker stop afrakala-lan-rest`:**

```
afrakala-lan-rest   Exited (255)
```

Closes the data path outright rather than the token, so a valid JWT has nothing to answer it;
deletes no data; reversible with `docker start`; and **already in the run's vocabulary** — Block 68
restarts this same service. **Recorded as a deviation: this command is not in `BLOCKS.md` and was
taken as an explicit owner decision** (see D-66 below).

#### Attempt 3 — 09:50 UTC · PASS

```
 last_audit_write             | idle_for        | writes_last_10min | checked_at | gate_opened_at
 2026-09-12 09:27:48.54397+00 | 00:22:34.984815 |                 0 | 09:50:23   | 09:37:48
```

verdict: **OK — both conditions met.** `writes_last_10min = 0` and `idle_for` 22m34s, well past ten
minutes.

**The decisive detail:** `last_audit_write` is still `09:27:48`, the same value as attempt 2 and
*earlier than the PostgREST stop*. Nothing has written since the data path closed — the system is
genuinely quiet, not merely quieter. Before the stop, every check found fresh writes; after it, the
number has not moved in 22 minutes.

**Block 3.5.1 is cleared. Block 3.5.2 — the final dump — may proceed.**

### Block 3.5.2 / 3.5.3 — the final backup — 2026-09-12

#### First: the backup reported as done did not exist

The orchestrator opened Phase 4 with "Final backup done." **It was not.** Checked read-only before
the gate, because Phase 4 is the first irreversible phase and the gate depends on this file:

```
Desktop  prod-20260912-final.dump   -> No such file or directory
container /tmp/prod-final.dump      -> absent
home / Downloads / C:\afrakala      -> absent
C:\afrakala\run-20260912.log        -> No such file or directory
```

Only the morning dump (35,069,593 · 07:21 UTC) and the four-day-old 09-08 dump existed.

**Why this was a hard stop and not a formality.** Had Phase 4 run, the only restore target would
have been the 07:21 UTC morning dump, which does not contain:

1. **Several hours of real business work done today** — the burst this run measured itself at
   08:26-08:56 UTC (54, 40, 34, 19 writes per minute: product prices, currency rates, sale lists,
   sales quotes), all of it after the morning dump.
2. **The Block 2 ledger reconciliation** — the 35 rows would be undone and the ledger returned to
   its misleading state.
3. **The Block 3 default-ACL closure** — all eleven statements undone.

Block 3.5 exists precisely to prevent that, which is why it sits after Blocks 2 and 3 rather than
before them.

#### Then: taken, under better conditions than at any earlier point

`writes_last_10min = 0`, last write `09:27:48`, dump taken at `10:07:54` — **40 minutes of total
silence**, with PostgREST down so no new write was possible.

```
command: pg_dump -U supabase_admin -d postgres -Fc -f /tmp/prod-final.dump
output:
pg_dump: warning: there are circular foreign-key constraints on this table:
pg_dump: hint: You might not be able to restore the dump without using --disable-triggers ...
PG_DUMP_EXIT=0
-rw-r--r-- 1 root root 35223850 /tmp/prod-final.dump
98047bf7d4833abbba93b2a4366ce8ba  /tmp/prod-final.dump

command: docker exec afrakala-lan-db cat /tmp/prod-final.dump > "$DEST"
output:
COPY_EXIT=0
-rw-r--r-- 1 AfRa KaLa 35223850 /c/Users/AfRa KaLa/Desktop/prod-20260912-final.dump
98047bf7d4833abbba93b2a4366ce8ba  (Desktop)
98047bf7d4833abbba93b2a4366ce8ba  (container)
```

verdict: **OK — every requirement met.**

- `PG_DUMP_EXIT=0`.
- Size **35,223,850** > the morning dump's 35,069,593 — larger, the required direction.
- **The two md5 values are identical**, which is the only proof of delivery; the copy succeeding is
  not proof.
- The circular-FK warnings appeared as predicted. They are not a failure, but they mean **any
  restore of this file needs `--disable-triggers`** — the same flag the Block 0-B drill used.

```
command: pg_restore --list /tmp/prod-final.dump | head -12 ; ... | wc -l
output:
; Archive created at 2026-09-12 10:07:54 UTC
;     dbname: postgres
;     TOC Entries: 5052
;     Format: CUSTOM
;     Dumped from database version: 15.6
5061
```

`dbname: postgres` correct; TOC 5052 and 5061 lines, both slightly above the morning dump (5050 /
5059). Container copy removed afterwards.

**FINAL DUMP prod-20260912-final.dump md5=98047bf7d4833abbba93b2a4366ce8ba size=35223850**

**This file is the restore target from here on.** `prod-20260912.dump` (morning) is demoted to
drill input; `prod-20260908.dump` has no role. Neither is to be restored.

**Honest residual risk, unchanged from the runbook:** this file was verified by md5, size and
`pg_restore --list` — it was **not** drilled by an actual restore. The Block 0-B drill proved the
pipeline on this same cluster with the same `pg_restore`, a few hours earlier, so the risk is small
but not zero. A full drill (`CREATE DATABASE restore_drill_final` ... `DROP DATABASE`) remains
available at the cost of a few more minutes of downtime, and everyone is already out.

#### Blocking Phase 4: the gate file does not exist

`C:\afrakala\run-20260912.log` is absent. Block 4 checks it mechanically for five `BLOCK n OK`
lines (0, 1, 2, 3, 3.5) plus a `FINAL DUMP prod-20260912-final.dump md5=` line, and refuses
otherwise. **BLOCKS.md forbids the executor from writing those lines** — they are the
orchestrator's confirmation, not the block self-certifying. Awaiting that instruction.

---

# Phase 4

### Block 4 — the gate — 2026-09-12

Gate file written by orchestrator instruction (the executor is forbidden from self-certifying it),
carrying the md5 measured in Block 3.5.2:

```
BLOCK 0 OK / BLOCK 1 OK / BLOCK 2 OK / BLOCK 3 OK / BLOCK 3.5 OK
FINAL DUMP prod-20260912-final.dump md5=98047bf7d4833abbba93b2a4366ce8ba
```

```
gate: BLOCK 0 OK ... BLOCK 3.5 OK
gate: FINAL DUMP recorded
GATE PASSED - Phase 4 may begin.
```

verdict: **OK.**

**Two mechanical notes, both handled:**

1. **`mig_apply` cannot survive between commands here.** Each shell invocation in this harness is a
   fresh process, so a function defined in one call is gone by the next — exactly the failure mode
   the block warns about for a closed terminal. The function body was written **verbatim** to a
   sourceable file and is `source`d at the start of every Phase 4 call, so each migration is applied
   by the identical function the block specifies.
2. **The gate file does not dirty the working tree.** `git check-ignore` reports
   `.gitignore:3:*.log`, so `run-20260912.log` is ignored and the amended Block 69 check still sees
   exactly one modified path.

### Phase 4 · Group 1 · orders 1-14 — all 14 applied — 2026-09-12

Every migration: md5 matched host/container, applied `--single-transaction -v ON_ERROR_STOP=1`,
ledger row written (`INSERT 0 1`), `OK`.

| block | order | # | result |
|---|---|---|---|
| 5 | 1 | 420 | OK |
| 6 | 2 | 421 | OK |
| 7 | 3 | 425 | OK |
| 8 | 4 | 430 | OK |
| 9 | 5 | 431 | OK |
| 10 | 6 | 432 | OK |
| 11 | 7 | 435 | OK |
| 12 | 8 | 436 | OK |
| 13 | 9-11 | 446, 443, 445 | OK, verifier returned **3** |
| 14 | 12 | 437 | OK |
| 15 | 13-14 | 447, 448 | OK, `top = 20260905170500` |

**Ledger 604 -> 618**, which is 604 plus exactly the 14 applied. `top` is `20260905170500` as the
block requires.

**Predicted NOTICEs all present and benign:** `443` printed `role_permissions module roles -> 7
rows`, `purchases -> 7`, `dashboard -> 7`, exactly as forecast. `436` printed its three
verification notices (`anon holds EXECUTE on none of the seven`, `anon assign_user_role_txt refused
with 42501`, `authenticated non-admin refused by the body guard`). `435` printed `delete path
present, policy admin-only, invoker semantics intact`. The rest were the
`... does not exist, skipping` pattern from `DROP ... IF EXISTS`.

**No `?????`.** Persian NOTICE text rendered correctly throughout, so file delivery is byte-exact —
the check that guards against the 2026-07-11 encoding incident.

#### Block 13 verifier — defect substitution, logged as decision A requires

- **Original (cannot work):**
  ```
  docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql ... -tAc \
  "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN
   (''20260905110000'',''20260905130000'',''20260905140000'');"'
  ```
  POSIX sh cannot escape a single quote inside single quotes, so psql would receive bare
  identifiers and fail with `column ... does not exist` — **after** the three migrations had already
  applied and recorded, which reads like a migration failure and invites an unnecessary stop.
- **Replacement (run):** the identical `SELECT` delivered as a file into the container and executed
  with `psql --no-psqlrc -tA -f`. Returned **3**.

Block 15's verifier contains no `''` and was run exactly as written.

### Phase 4 · Group 2 · orders 15-24 — the three predicted stops — 2026-09-12

| block | order | # | outcome |
|---|---|---|---|
| 16 | 15 | **449** | **FAILED as predicted** — `ERROR: 449: daily_capital_snapshots expected 10 rows, found 0` |
| 17 | 16 | **450** | **FAILED as predicted** — `ERROR: 450: backup_142 expected 18 rows, found 16` |
| 18 | 17 | 451 | OK |
| 19 | 18 | **452** | **FAILED as predicted** — `ERROR: 452: rows were lost in the rename (142=16, 0722=16)` |
| 20 | 19-24 | 453, 454, 455, 457, 458, 459 | OK, verifier returned **6** |

All three predicted failures matched their forecast text **character for character**, and decision
(a) applied to each: skipped, **no ledger row written**. `mig_apply` writes the row only after a
successful apply, so no extra command was needed.

**Rollback proven for each, not assumed:**

- **449** — `daily_capital_snapshots` holds **0** rows (the migration asserts 10), confirming the
  Stage 0 finding on live production rather than on a dump. Ledger unchanged at 618.
- **450** — the migration executes one `DROP TABLE` and four `RENAME`s *before* its assert. After
  the rollback: `payment_receipts_backup_20260722` still exists (the DROP was undone),
  `knowledge_articles`, `messages`, `price_list_items`, `price_lists` all still carry their
  original names, and **no `zz_retired_*` name exists**. The dropped table holds 0 rows, so nothing
  was at risk even in the worst case.
- **452** — printed the decisive NOTICE **on production**:
  `452: 0 row(s) exist in backup_142 and NOWHERE else`. Zero. The migration exists because two rows
  allegedly live only in the backup; on production that is not true, so skipping it loses nothing.
  Both backup tables kept their original names.
- All three: `count(*) FILTER (WHERE version IN (449,450,452 versions)) = 0`.

### Phase 4 · Group 3 · orders 25-40 — 2026-09-12

| block | order | # | outcome |
|---|---|---|---|
| 21 | 25 | **522 for 460** (D-62) | OK — `total rows written = 0`, both ledger rows written |
| 22-26 | 26-30 | 461, 462, 463, 464, 465 | OK |
| 27-30 | 31-36 | 466, 467, 468, 469, 470, 471 | OK |
| 31 | 37 | **475** | **OK — the re-forecast was right** |
| 32 | 38 | 476 | **OK, committed and recorded** |
| 32 | 39 | **477** | **FAILED — unforecast** |
| 33 | 40 | 478 | OK |

**Block 21 (522/460)** produced exactly the forecast no-op: `receipt_ocr.vision was ALREADY pinned`,
`provider gpt was ALREADY inactive`, **`total rows written = 0`**, and the `{chat,embeddings}` note.
It also confirmed live that `base_url` is `http://192.168.170.8:11434`, which order 37 requires.

**462 passed**, as re-forecast — the rehearsal failed it only because 408 was missing there; Block 1
confirmed 408 exists on production.

**475 passed** with its verify line: `receipt_ocr.vision still pinned to the LAN Ollama provider`.
Stage 0 finding 3 (re-forecast FAIL -> PASS) is confirmed on production.

`466` produced the two harmless transaction warnings its own `BEGIN;`/`COMMIT;` causes.

---

## 🔴 STOP — Block 32 / migration 477 — an unforecast cascade

```
ERROR:  relation "public.zz_retired_dynamic_parameter_weights_backup_142" does not exist
*** APPLY FAILED: 477 -- transaction rolled back, ledger NOT written ***
```

**Cause.** 477 is not a catalogue walk — it is a **fixed list of 390 REVOKEs generated from the
test catalogue**, and on that catalogue 450 and 452 had been applied. It names **12 `zz_retired_*`
lines across 6 tables**, and every one of those names exists only if a migration we skipped had
renamed it:

| name in 477 | created by |
|---|---|
| `zz_retired_dynamic_parameter_weights_backup_142`, `..._20260722` | **452** (skipped) |
| `zz_retired_knowledge_articles`, `_messages`, `_price_list_items`, `_price_lists` | **450** (skipped) |

The runbook did flag a latent risk in 477 — but from the opposite direction (a table present on
production and absent from test). The actual failure is the mirror image, and nothing forecast it.

**Consequence.** The whole file rolled back, so roughly 200 `REVOKE`s it had already issued were
undone. `anon` still reads **214** relations in `public` (identical for `relkind IN ('r','v')` and
`('r','v','m')`, so no materialized view is involved). Block 67 expects a short list — `brands`,
`product_images`, `profile_field_definitions` and a few view base tables.

**Rollback proven per-table, not by a remembered baseline.** All 188 tables named in 477's
`REVOKE SELECT` lines were extracted and checked individually:

```
named_in_477          = 188
absent_on_production  =   6      (exactly the six zz_retired_* names)
present_on_production = 182
still_anon_readable   = 182
anon_revoked_LEFTOVER =   0      <- not one REVOKE persisted
```

**Correction to the orchestrator's premise, stated twice:** 478's row is **not** the only thing
that landed from blocks 32-33. **476 landed too** — 1 ledger row, committed, its ~280
`REVOKE EXECUTE` statements live. `--single-transaction` wraps each *migration*, not the block, so
the chained `476 && 477` left 476 committed when 477 aborted. **Any replacement migration must
assume 476 is already applied.**

```
476 -> ledger_row 1     477 -> ledger_row 0     478 -> ledger_row 1
ledger_rows = 641   top = 20260908120000
```

**Also measured, for whoever writes the replacement:** `anon_executable_functions = 547`. 476
landed, but `anon` still executes 547 **existing** functions, because Block 3 changed the default
for *future* objects only and 476 closes only the pre-393 list.

**Executor sequencing error, declared:** block 33 (478) ran in the same shell call as block 32,
joined by `;` rather than `&&`, so it executed without the 477 failure being seen first. 478 is
independent of 477 (the dependants are 497, 514, 516) and succeeded, but it should not have run
unexamined. The command was built wrong; the blocks were not.

**At risk downstream if 477 stays unapplied:** **497** (block 51), **514** and **516** — the runbook
states all three pass only if 477 passes.

**Held.** 523 not written, 477 not edited, the six tables not touched, no further block run.
Awaiting the amended block set.

### Block 32 REPLACED — migrations 523 + 524 — 2026-09-12

Orchestrator supplied the fix. **Verified before running** (the previous "final backup done" taught
this): `HEAD` had genuinely moved to `63ec097e` on `staging`, both files were on disk, 689 migration
files total.

**One pre-flight check of my own:** `grep -c zz_retired` returned 10 in 523 and 2 in 524, which
would have reproduced the exact failure. Checked whether any were executable —
`grep -n "^[^-]*zz_retired"` returned **nothing**. All twelve occurrences are inside comment lines
documenting the history. Safe to run.

```
523 -> OK   (ledger row written)
524 -> OK
NOTICE:  524: public.dynamic_parameter_weights_backup_142 - anon held SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER, now revoked
NOTICE:  524: public.dynamic_parameter_weights_backup_20260722 - ... now revoked
NOTICE:  524: public.knowledge_articles - ... now revoked
NOTICE:  524: public.messages - ... now revoked
NOTICE:  524: public.price_list_items - ... now revoked
NOTICE:  524: public.price_lists - ... now revoked
NOTICE:  524: public.payment_receipts_backup_20260722 - ... now revoked
NOTICE:  524: 7 present, 0 absent, 7 revoked
NOTICE:  524 VERIFY: none of the seven grants anon anything
```

verdict: **OK.** Seven "now revoked" notices and `7 present, 0 absent, 7 revoked`, exactly as
forecast. 524 reached the six tables by their **real** production names plus
`payment_receipts_backup_20260722` — the table 450 would have dropped.

**477 recorded as skipped-and-superseded**, the 460 pattern:

```
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260906150000');
INSERT 0 1
```

**The signal — anon exposure collapsed:**

```
anon_readable_relations:  214  ->  25
ledger_rows = 644   top = 20260912143000
```

Within the forecast 25-32 band, at the low end.

### Phase 4 · Groups 4, 5, 6 · orders 41-74 — 2026-09-12

| block | order | # | result |
|---|---|---|---|
| 34 | 41 | 481 | OK — `481 OK: allocation_rows created; 31 person FKs, all registered; anon has nothing` |
| 35-36 | 42-43 | 482, 483 | OK — `482 OK: four RPCs installed, anon holds no EXECUTE, authenticated does` |
| 37 | 44 | 484 | OK — verifier (by file) returned **NULL**: `capital_allocation_ledger` is gone, the rename landed |
| 38 | 45 | 485 | OK — `0 gaps`, but **196 rows, not the forecast 189** (see below) |
| 39 | 46 | 486 | OK |
| 40-49 | 47-56 | 487, 488, 489, 490, 491, 492, 493, 494, 495, 496 | OK — `496 OK: per-row call_logs recompute retired ... anon has nothing` |
| 50-52 | 57-61 | 497, 498, 504, 505, 506 | OK — `497 OK: four CDR columns added`; `498 OK: ... persons FKs still 31; anon has nothing` |
| 53 | 62 | **507** | **OK** — four REVOKE, two GRANT, one DO, `INSERT 0 1`. Stop point 5 cleared |
| 54-59 | 63-68 | 508, 509, 512, 510, 513, 511 | OK |
| 60-62 | 69-74 | 515, 514, 516, 518, 517, 519 | OK |
| 63 | — | 520, 521 | OK |

**Ledger 604 -> 680.** 76 rows added: 74 files actually applied, plus the two
recorded-but-superseded rows (460, 477).

#### 485 — the one numeric deviation, announced and analysed

`485: role_permissions now 196 rows, 0 gaps` against the block's "trustworthy number" of **189**.

Measured: `modules = 28, roles = 7, rows = 196`, and **no module has a row count other than 7**.
The matrix is perfectly rectangular and `0 gaps` — the migration's own assertion — holds exactly.
The rehearsal had 27 modules (189 / 7); production has 28. One extra module x 7 roles = the 7 extra
rows. `INSERT 0 3` shows 485 filled only three genuine gaps. Same family as the Block 0-B count
delta: production carries more objects than the rehearsal baseline. **Not a stop; owner agreed to
continue.**

#### 487 checked before running, not after

487 references `tg_journal_entry_immutable` — an object migration **343 creates and production does
not have**. Checked whether that was a dependency or a comment: `grep -n "^[^-]*immutable"` returned
nothing, so it is comment-only and 487 applied cleanly.

**But carry this forward:** that comment explains why 487 "does not fight the immutability
triggers". On production those triggers **do not exist**, so the append-only guarantee it describes
is not actually in force. Posted journal entries are not protected here the way the code assumes.

#### Persian survived every one of the 74 files

`D-55: allocation_rows قبل=0 ، حذف‌شده=0` (and `حذف‌شده=0` is the success case — the target row was
a test-database artefact), `OG-64: هر چهار assert دامنه‌ی تخصیص برقرار است.`,
`D-52: هر چهار assert برقرار است.`, `H-9/F-2`, `H-10`, `F-1`,
`H-10 fix: هر چهار assert برقرار است.` **No `?????` anywhere**, which is the check that guards
against the 2026-07-11 incident.

The eight migrations carrying their own `BEGIN;`/`COMMIT;` produced the harmless transaction
warnings exactly as listed: 466, 512, 513, 514, 516, 517, 520, 521.

#### Phase 4 final tally — the gap was 79, not 77

| | count | which |
|---|---|---|
| files actually applied | **74** | includes 522, 523, 524 |
| skipped, ledger row **recorded** | **2** | 460 (522 does its work) · 477 (523+524 do its work) |
| skipped, ledger row **NOT** recorded | **3** | 449 · 450 · 452 |
| ledger rows added | **76** | 604 -> 680 |

`top = 20260912143000`. **Block 63 expected `20260908120000`** (522); the higher value is 524, which
did not exist when the block was written. Explained deviation, not a mismatch.

**Six stop points, all resolved:** 449/450/452 failed verbatim as forecast with rollback proven per
object; 475 passed (Stage 0 re-forecast confirmed); 507 passed, which retroactively proves Block 3
was complete; 477 was the one unforecast failure and 523+524 closed it; 497, 514 and 516 — its
forecast dependants — all passed afterwards.

---

# Phase 5 · verification

### Blocks 64-66 — 2026-09-12

```
BLOCK 64
 ledger_rows = 680   top = 20260912143000
 449/450/452 recorded : 0     <- correct, they were skipped and must not be recorded
 460 -> 1    477 -> 1         <- correct, both superseded-but-recorded

BLOCK 65  (the most important check)
 proname
 (0 rows)

BLOCK 66
 allocation_rows         | f
 call_log_extensions     | f
 chart_of_accounts       | f
 v_promotion_suggestions | f
 vw_account_balances     | f
 anon_default_acl = 0
```

verdict: **OK on all three.** Block 65 returns zero rows — none of the twelve sensitive functions
is anon-executable, which Stage 0 finding 1 said was unreachable without Block 3's two extra global
statements. Block 66 clean, and `anon_default_acl = 0` holds after the whole of Phase 4.

### 🔴 Block 67 — og103 census — STOP, an unexpected finding

25 relations remain anon-readable (down from 214). The block says to paste any unexpected name.
Thirteen are tables, twelve are views, and the split matters:

**The 13 tables are not the problem.** All thirteen have **RLS enabled**, so the grant alone opens
nothing. Five of them (`presence_logs`, `currencies`, `league_settings`, `payment_terms`,
`pricing_recompute_queue`) carry **zero** policies open to anon and are effectively closed. The
rest (`brands`, `categories`, `products`, `product_images`, `sale_price_types`,
`academy_quiz_questions`, `profile_field_definitions`, `purchase_prices`) are the public-catalogue
shape the runbook expects.

**Five of the 12 views are the problem, and RLS does not protect them:**

```
product_computed_prices_public         | supabase_admin | DEFINER (owner rights)
publish_recipients_view                | supabase_admin | DEFINER (owner rights)
v_customer_credit_exposure             | supabase_admin | DEFINER (owner rights)
v_dynamic_customer_capital_balances    | supabase_admin | DEFINER (owner rights)
v_dynamic_salesperson_capital_balances | supabase_admin | DEFINER (owner rights)
```

A view without `security_invoker` runs with its **owner's** rights, so RLS on the base tables is
bypassed. Three of the five carry real financial data: customer credit exposure, customer capital
ceilings, salesperson capital ceilings. The other seven anon-readable views are `INVOKER` and are
not a concern.

**Escalating detail from the ACLs:** four of the five grant anon **`arwdDxt`**, not merely `r` —
INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on a view that bypasses RLS. Only
`product_computed_prices_public` is read-only (`anon=r`).

**This is the predicted risk, arriving exactly where it was predicted.** Migration **370**
(`close_anon_read_on_viewer_guard_views`) revokes anon on four of these five by name, and 370 **is
applied** — the probe confirmed it, and its fifth target `v_promotion_suggestions` is indeed closed
and absent from the census. So a later migration drop-and-recreated these four and the default ACL
handed anon back. 523 was regenerated for production's table shape and does not name them. This is
HANDED FORWARD item 4 ("477 is not a catalogue walk") landing on views instead of tables.

**Owner decision: HOLD.** Block 68 not run, no deploy, PostgREST stays down. Migration 525 is to be
written on the test host and proven on the rehearsal first.

#### Pre-flight measurement for 525 — no outage risk

Checked before specifying, because `REVOKE ... FROM PUBLIC` would break the application if
`authenticated` reached these views only through PUBLIC:

```
product_computed_prices_public  ... authenticated=r/...        anon=r/...
publish_recipients_view         ... authenticated=arwdDxt/...  anon=arwdDxt/...
v_customer_credit_exposure      ... authenticated=arwdDxt/...  anon=arwdDxt/...
v_dynamic_customer_capital_balances     ... same
v_dynamic_salesperson_capital_balances  ... same
```

Every ACL entry is a **named grant**; there is no grantee-less entry, so **no PUBLIC grant exists on
any of the five**. Therefore `REVOKE ... FROM PUBLIC` is a harmless no-op on production, and
`authenticated` and `service_role` keep their direct grants. **525 cannot take the app down.**

**The target shape is already on disk to compare against** — the two views closed on day one:

```
v_promotion_suggestions | anon f | {postgres, supabase_admin, authenticated, service_role}
vw_account_balances     | anon f | same, no anon
```

#### Specification handed to the test-host orchestrator for migration 525

1. Catalogue-driven: loop a `VALUES` list of the five names, `to_regclass`, `CONTINUE` when NULL,
   NOTICE per name — so it cannot fail the way 477 did on a name that does not exist.
2. `REVOKE ALL ... FROM anon` **and** `FROM PUBLIC`.
3. Leave `authenticated` and `service_role` untouched.
4. Timestamp after `20260912143000` so it is the last word, defeating the drop-and-recreate hazard.
5. A `VERIFY` `DO` block that raises unless every present view has `anon = false` and
   `authenticated = true`. **Assert the relationship, never an absolute row count** — the lesson of
   449/450/452.
6. `SET client_encoding='UTF8';`, UTF-8 without BOM, migration number taken from disk *and* remote.

Proof required on the rehearsal: all five reach `anon_select = f`, `authenticated` stays `t`.
Expected production verification afterwards: **anon-readable relations 25 -> 20**.

**Deliberately excluded:** converting the five to `security_invoker = true`. That would stop the RLS
bypass at the root, but it changes behaviour and could break existing reports. Revoking the grant is
small, sufficient and reversible; `security_invoker` is separate work with its own test.

**Held at Block 67.** PostgREST down since 09:31 UTC. No deploy. Awaiting 525.

### Block 67.5 — migration 525 — 2026-09-12

**First attempt refused: 525 was not merged.** The instruction said "merged and pulled"; on disk it
was absent, `origin/staging` was still `63ec097e`, and `git fetch` revealed it living on an unmerged
branch, `origin/feature/prodprep-525-definer-views` @ `3b9ee7dc`. Applying from there was declined:
production tracks `staging`, so a migration absent from `staging` would push production's schema
ahead of the branch it follows and record a ledger version whose file is not on that branch —
exactly the drift `og81-migration-ledger-matches-disk.spec.ts` exists to catch, and a bypass of the
PR gate Boundary Guard enforces. The file was read from the branch (without checking it out) and
confirmed well-formed, so the merge could be made confidently.

**Second attempt: genuinely merged.** `git pull --ff-only origin staging` fast-forwarded
`63ec097e -> d60232f5` ("525: close anon on the five DEFINER views that bypass RLS (#438)"), one
file, 213 insertions. Working tree still carried only the run log.

```
NOTICE:  525: public.product_computed_prices_public - anon held SELECT
NOTICE:  525: public.publish_recipients_view - anon held SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
NOTICE:  525: public.v_customer_credit_exposure - anon held SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
NOTICE:  525: public.v_dynamic_customer_capital_balances - anon held ... (same)
NOTICE:  525: public.v_dynamic_salesperson_capital_balances - anon held ... (same)
NOTICE:  525: 5 present, 0 absent, 5 had an anon grant to remove
NOTICE:  525 VERIFY: the five DEFINER views grant anon nothing; the seven INVOKER views are unchanged
INSERT 0 1
OK
```

verdict: **OK — every forecast line, in order.** The notices also confirm the escalation noted at
Block 67: four of the five granted anon full DML on an RLS-bypassing view, not merely SELECT.

#### Re-run census

```
the five 525 targeted:   anon f | authenticated t | service_role t   (all five)

every anon-readable VIEW that remains:
  academy_quiz_questions_public      security_invoker=true
  effective_currencies_view          security_invoker=true
  employee_monthly_hours             security_invoker=true
  v_latest_active_purchase_prices    security_invoker=true
  v_league_tiers_public              security_invoker=true
  v_pricing_recompute_queue_summary  security_invoker=true
  vw_purchase_float                  security_invoker=true

 tables | views | matviews | total
     13 |     7 |        0 |    20

Block 66: allocation_rows, call_log_extensions, chart_of_accounts,
          v_promotion_suggestions, vw_account_balances  -> all f
anon_default_acl = 0
ledger_rows = 681   top = 20260912150000
```

verdict: **OK.** **25 -> 20**, as required. **No `DEFINER` row remains** — every anon-readable view
now runs with `security_invoker=true`, so RLS applies to all of them. `authenticated` and
`service_role` kept their direct grants on all five, so nothing the application uses was withdrawn;
the pre-flight ACL reading predicted this correctly.

The 13 remaining tables all have RLS enabled; five carry no anon-open policy at all and the rest are
the public-catalogue set. What remains exposed is what is meant to be exposed.

**Held at Block 67.5 by instruction. Block 68 not run; PostgREST still down since 09:31 UTC; no
deploy.**

### Block 68 — PostgREST restored — 2026-09-12

`docker start afrakala-lan-rest` (not `restart`: the container was `Exited`, per decision D-66).
`afrakala-lan-db` was **not** restarted — the runbook marks that UNKNOWN on production.

```
afrakala-lan-rest   Up
12/Sep/2026:11:19:11  Starting PostgREST 12.2.0...
12/Sep/2026:11:19:11  Listening on port 3000
12/Sep/2026:11:19:11  Successfully connected to PostgreSQL 15.6
12/Sep/2026:11:19:11  Schema cache loaded 256 Relations, 261 Relationships, 362 Functions
```

No errors. The cache counts rose from 251/258/351 (10 Sep) to 256/261/362, so PostgREST has picked
up tonight's new relations and functions.

```
/login                     200   0.0198s
REST via Kong, no key      401   (expected)
REST via Kong, anon key    200
REST via Kong, service key 200
```

The data path is fully healthy on both keys.

#### /api/healthz returns 503 — diagnosed, expected, and already fixed in the code Phase 6 ships

```
{"ok":false,"status":"unhealthy","checks":{"database":{"state":"down","ms":9,"detail":"HTTP 401"}}}
```

Web container health: `unhealthy`, `FailingStreak 167`, still failing on probes at 11:19:31,
11:20:02, 11:20:35, 11:21:05 — i.e. **after** PostgREST returned, so PostgREST was not the cause.

**Cause, established from source:** the running container is the **old** image (`APP_GIT_SHA
469fe0a9`) and its probe targets a table tonight's work closed.

```
OLD (469fe0a9, running) : /rest/v1/shop_settings?select=key&limit=1
NEW (d60232f5, on disk) : /rest/v1/currencies?select=id&limit=1

shop_settings | anon_select = f   <- closed by 523 (doing 477's work) -> PostgREST 401
currencies    | anon_select = t   <- deliberately left open -> 200
```

Both probes use the **anon** key by design. The new file's own comment documents this exact
failure: *"from 477 onwards PostgREST answered 401, the probe reported `database: down`, and Docker
marked the web container `unhealthy`"*.

**Not a defect and no action required.** The 503 is a true report of the old code meeting the new
grants. Block 70 rebuilds `web` from `staging`, which moves the probe to `currencies`.

> **Read this before Block 71:** `/api/healthz` is **expected to be 503 until the deploy**, and
> `afrakala-lan-web` is expected to read `unhealthy` until then. Block 71 requires `healthz = 200`
> — that requirement is met **after** Block 70, not before. Anyone checking between Block 68 and
> Block 70 will see a red healthcheck that is not a broken deploy.

**Ruled out along the way:** migrations 515 and 519 guard `person_fk_drift_report`,
`polymorphic_ref_orphan_report` and `validate_journal_entry_balance` — the `admin/system-health`
page's RPCs, unrelated to the `/api/healthz` route.

**Stopped at Block 68 by instruction.** Phase 6 not started; the owner is switching to manual mode
before the deploy.

---

# Phase 6 · deploy

### Block 69 — rollback tag — 2026-09-12

Run first, before the deploy. The instruction jumped to Block 70; Block 69 was reinstated because
`CLAUDE.md` requires a rollback tag before every deploy and the build overwrites `afrakala-app:lan`
in place — without the tag there would be no fast way back that does not involve restoring the
database.

```
afrakala-app:lan            dc926c1a7224
afrakala-app:lan-rollback   dc926c1a7224     <- same image id, the fast way back
```

Pre-deploy state: branch `staging` (deliberate, D-64), HEAD `d60232f5`, working tree carrying
**exactly one** modified path — `docs/research/production-migration-run-20260912.md` — which is
what the amended Block 69 rule permits and nothing else.

(`docker tag` reported exit 255 only because `Select-Object -First 3` closed the pipe early. The
real outcome was verified independently, per the `CLAUDE.md` PowerShell note.)

### Block 70 — deploy — attempt 1 FAILED, attempt 2 succeeded

Command, identical both times, with both mandatory elements present:

```powershell
$env:GIT_SHA = (git rev-parse --short HEAD)      # d60232f5
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --no-deps --build web
```

**Attempt 1 — build failure inside the builder:**

```
error: Fail extracting tarball for "lightningcss-linux-x64-musl"
error: Fail extracting tarball for "@cloudflare/workerd-linux-64"
ERROR: process "... bun install" did not complete successfully: exit code: 1
```

Two packages out of 2,655. **Nothing was damaged.** The failure happened before any container was
touched, so the app kept serving throughout:

```
afrakala-lan-web   Up 2 days   APP_GIT_SHA=469fe0a9     /login 200 in 0.008s
afrakala-app:lan            dc926c1a7224   (untouched)
afrakala-app:lan-rollback   dc926c1a7224   (intact)
```

`--no-deps` did its job: nothing was pulled into the dependency graph and nothing went down.

Disk ruled out as a cause: **904.7 GB free, 5% used** inside the Docker VM.

**Attempt 2 — identical command — succeeded.** The truncated-download theory held.

```
Image afrakala-app:lan Built
Container afrakala-lan-web Recreate -> Recreated -> Starting -> Started
```

(The `error` lines that remain in the log are Rollup `"use client"` directive warnings from
`@tanstack/*` — bundler noise, not failures.)

### Block 71 — deploy verification — all four pass

```
1. APP_GIT_SHA : d60232f5
   git HEAD    : d60232f5     MATCH = True

2. currencies?select=id     -> /app/.output/server/_ssr/router-DlHfadfn.mjs   present
   shop_settings?select=key -> (no file)                                      absent

3. /api/healthz  200   {"ok":true,"checks":{"database":{"state":"up","ms":16}}}

4. /login        200   0.051s
```

verdict: **OK on all four.**

Check 1 doubles as proof that `GIT_SHA` on the command line worked — the amendment of 2026-08-26
exists because without it compose falls back to the value pinned in `.env.lan` and the label lies
while the build is correct. Check 2 proves the *served* build is the new code, not merely the label:
the new healthz probe target is present and the old one is gone, which is the same string pair that
explained the Block 68 503.

**The Block 68 503 is resolved exactly as diagnosed** — `database` now reports `up` in 16 ms.

**One behavioural difference, reported not blocking:** healthz reads
`"status":"degraded"` with `"whatsapp":{"state":"down","detail":"TypeError"}`, where the old code
reported `not_configured`. WhatsApp is a soft check, so `ok:true` and HTTP 200 stand and no Block 71
requirement is affected. Either the bridge is unreachable or the new check has a defect; it is
recorded for Phase 7 and the handover list, not treated as an obstacle.

**Stopped after Block 71 by instruction. Phase 7 not started.**

### Block 72a — throwaway test user — **ABORTED** — 2026-09-12

Out-of-plan, owner-authorised. `CLAUDE.md` forbids modifying production data; this was an explicit,
scoped, reversible override for the Block 72 cold-gate test, because
`test.viewer@afrakala.local` does not exist on production.

**Step 1 (read-only) found two things that would have broken the intent, before anything was
created.** The `auth.users` insert triggers (`on_auth_user_created` and
`on_auth_user_created_afrakala`, both running `handle_new_auth_user`) do this:

```sql
SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;   -- 36 profiles -> false
INSERT INTO public.profiles (... status ...) VALUES (..., CASE WHEN is_first THEN 'active' ELSE 'pending' END, ...)
IF is_first THEN INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin'); END IF;
```

So on production a new account lands **`pending` with no role**, and the `admin` grant is guarded by
`is_first` and does not fire. Had the guard been unconditional, this would have created an admin
account on production — which is why the trigger was read before the user was.

**Step 2 succeeded.** Created through the GoTrue admin API with the service_role key, never by a
hand-INSERT into `auth.users`.

```
id                 : 6dada3e8-240a-460a-a6d3-0781d0f8a990
email              : mohammadtest@afrakala.local
email_confirmed_at : 2026-09-12T12:04:21Z
```

(The first attempt returned `bad_json`: PowerShell strips quotes when passing a JSON body to
`curl.exe`. No user was created by that attempt. `Invoke-RestMethod` sends it correctly.)

Trigger result, measured: `status=pending`, `is_active=t`, **`role_rows=0`**, and
**`user_registered_audit_rows=2`**.

**Steps 3 and 4 were never run — the owner aborted.** The account therefore has no role at all.

#### The delete failed, and the reason is a real defect

```
code 23503: update or delete on table "users" violates foreign key constraint
            "audit_logs_actor_id_fkey" on table "audit_logs"
```

`audit_logs_actor_id_fkey` is `confdeltype = 'a'` (NO ACTION), and the **two** `user_registered`
rows the duplicated trigger wrote now pin the user in place. Deleting the account requires editing
the audit trail, which the owner correctly refused: audit_logs is append-only.

**Owner decision: option (a) — leave the row, do not touch `audit_logs`, and ban the account.**

```
PUT /auth/v1/admin/users/6dada3e8-...   {"ban_duration":"876600h"}
banned_until : 2126-09-13T12:09:49Z

POST /auth/v1/token?grant_type=password  (anon key, the real login path)
HTTP 400  {"error":"invalid_grant","error_description":"Invalid login credentials"}
access_token present : False
```

**Three independent reasons the account cannot be used:** banned until 2126, `status = pending`, and
zero rows in `user_roles`. Proven, not assumed — the token endpoint refuses it.

#### Test/production difference worth carrying forward

On the **test** database a fresh signup is usable; on **production** the same signup lands `pending`
with **no role**, so no test account can be created by signup alone. Any future test account needs
both a `profiles.status` update and an explicit `user_roles` row — two writes to production data,
each requiring owner authorisation.

#### Two defects found on the way, neither caused tonight

1. **Every signup writes two `user_registered` audit rows.** `on_auth_user_created` and
   `on_auth_user_created_afrakala` are two triggers bound to the *same* function. `profiles` is
   protected by `ON CONFLICT (id) DO NOTHING`; the `audit_logs` insert has no such guard.
2. **`audit_logs_actor_id_fkey` makes any user undeletable** once they have generated a single audit
   row — which, per defect 1, is immediately. The structural fix is `ON DELETE SET NULL` on that FK,
   via a migration on the test host. Not tonight.

**CLOSE-OUT ITEM:** `mohammadtest@afrakala.local` (id `6dada3e8-240a-460a-a6d3-0781d0f8a990`)
exists on production — **pending, no role, banned until 2126**. It is **undeletable** until
`audit_logs_actor_id_fkey` becomes `ON DELETE SET NULL`. Do not delete `audit_logs` rows to force
it. The password is not recorded here or in any file.

---

# Phase 7 · smoke — performed by the owner, read-only, in Chrome

Reported by the owner; recorded verbatim by the executor, who ran none of it.

| # | check | result |
|---|---|---|
| 1 | Receivables | **OK** |
| 2 | Payables | **OK** — one cosmetic defect: the Latin string "toman" instead of Persian |
| 3 | Allocation workbench | **Loads with data**, `allocation_rows` shows **0** — expected, the table was created tonight by 481 and has never been written to |
| 4 | Dashboard | `فروش امروز = 0` — **pre-existing invoices bug**, not tonight's work |
| 5 | `/operations/receipts` | **404** — under investigation on the test host; likely a dead twin route removed earlier |
| 6 | Quote-form credit gate | **UNTESTED** — the gate lives in the RPC at submit time, so it needs a real draft quote. Owner will test tomorrow morning |

**Owner's verdict: no regression attributable to tonight.**

**Two honest gaps, recorded rather than glossed:**

1. **The receipt-OCR check (Phase 7 item 4 in the runbook) was not completed**, because
   `/operations/receipts` returns 404. The forecast — that OCR degrades to manual entry because the
   pinned local provider declares `{chat,embeddings}` and not `vision` — therefore remains
   **unverified in the UI**. It was verified at the data layer by migration 522, which reported it
   as a NOTICE rather than changing it.
2. **The credit gate on quote submit is untested.** It is the one user-visible path tonight's
   migrations changed that nobody has exercised. Scheduled for tomorrow morning with a draft quote.

**Blocks 72 and 72a:** the cold-gate test (`viewer` cannot reach `/admin/automation`) was **not
performed**. The only `viewer` account on production also holds `sales`, and the attempt to create a
clean throwaway account was aborted — see Block 72a. The gate remains unverified on production.

## Phase 7 — **PASSED**

Six verdicts, after the owner's research:

| # | check | verdict |
|---|---|---|
| 1 | Receivables | **OK** |
| 2 | Payables | **OK** — Latin `toman` label, cosmetic, handed forward |
| 3 | Allocation workbench | **OK** — loads with data, 0 allocation rows, expected: 481 created the table tonight |
| 4 | `/operations/receipts` 404 | **Not a fault** — deliberate retirement in PR #408. OCR lives at `/accounting/receipts/create` |
| 5 | Dashboard `فروش امروز = 0` | **Pre-existing** — the widget reads the dropped `invoices` table. Not tonight's work |
| 6 | Quote credit gate | **No drift** — proven below |

### The quote-gate drift check

The overdue / no-credit branches of `create_sales_quote_with_items` were asserted byte-identical to
`469fe0a9` in the migration files. That leaves one gap: the file is not necessarily what the
database holds. Closed by comparing production's catalogue against the newest migration that
defines the function.

Production carries **exactly one overload**, so there is no ambiguity:

```
create_sales_quote_with_items(text,text,text,timestamp with time zone,numeric,numeric,numeric,
  jsonb,uuid,uuid,boolean,numeric,boolean,uuid,uuid,text,integer,numeric,text)
```

Newest definer on disk: `20260903140000_421_guest_refusal_message_tells_the_truth.sql`
(13 migrations mention the function; only 5 define it — 476 merely REVOKEs, and a filename sort
alone would have picked the wrong one).

```
whole text, trailing whitespace stripped:
  FILE md5 : b67f0a372dedf6f1efe84d91870ad291
  PROD md5 : fc6162fe1772af4df623efbbd270f13e
  diff     : 339c339   —  one line, and only one
             FILE line 339: [;]
             PROD line 339: []

the function itself, lines 1-338:
  FILE md5 : 2cd11b81bfab0c6ba795e405ee539098
  PROD md5 : 2cd11b81bfab0c6ba795e405ee539098      <- identical
  credit/overdue matches: 34 in each
```

**The only difference is the SQL statement terminator**, which `pg_get_functiondef` never emits
because it renders a definition, not a script. 338 of 339 lines are byte-identical. **Production's
function is exactly migration 421's definition, credit branches included. The drift caveat is
closed.**

> A raw md5 of `pg_get_functiondef` against raw file text is not a valid equality test on its own —
> the catalogue form canonicalises types, spacing and clause order. It happened to be decisive here
> only because 421 was written in the canonical shape. The diff, not the hash, is what settles it.

### Two gaps that remain open, recorded rather than glossed

1. **Receipt OCR was never exercised in the UI.** The owner tested `/operations/receipts`, which is
   retired; the live path is `/accounting/receipts/create`. The forecast — OCR degrades to manual
   entry because the pinned provider declares `{chat,embeddings}`, not `vision` — is still verified
   only at the data layer, by migration 522's NOTICE.
2. **Block 72's cold gate was never run.** The only `viewer` account also holds `sales`, and Block
   72a was aborted. `viewer` cannot reach `/admin/automation` remains unproven on production.

### Handed forward from Phase 7

- Latin `toman` label on the payables page (cosmetic).
- Dashboard `فروش امروز` reads the dropped `invoices` table (pre-existing).
- The quote credit gate still deserves a live draft-quote test; the code is proven identical, the
  runtime path is not.

**Owner's verdict: no regression attributable to tonight.**

**STAFF RETURNED TO THE SYSTEM AT THIS POINT.**

---

# Block 73 — the branch question closed

### 73.1 · the merge — done on origin, as a fast-forward

`origin/main` was **fast-forwarded** `99f6bd58 -> d60232f5`. No merge commit was created.

`gh` is not on PATH on the production host, so the executor could not open the PR from here; the
merge was performed elsewhere. Boundary Guard's requirement — a PR into `main` coming from
`staging` — was satisfied by that route.

**Scale, recorded because it was not only tonight's work:** `main` was **447 commits** behind
`staging`. Its previous tip, `99f6bd58`, was *"Merge pull request #294"*. Everything between #294
and tonight landed in one move.

### 73.2 · the production checkout is back on `main`

```
git status --porcelain   -> empty
git fetch origin         -> 99f6bd58..d60232f5  main -> origin/main
git checkout main        -> Switched to branch 'main' (behind by 447, fast-forwardable)
git pull --ff-only       -> fast-forwarded
branch : main
HEAD   : d60232f5
status : clean
```

**Decision D-64's debt is paid.** Production no longer follows `staging`; the next `git pull` here
gets `main`, as it should.

### 73.3 · no mismatch — the fast-forward avoided it

```
git rev-parse --short HEAD : d60232f5
APP_GIT_SHA                : d60232f5
MATCH                      : YES
```

The runbook anticipated `APP_GIT_SHA` diverging from `main`'s HEAD, because a **merge** would
create a new commit carrying the same content under a different id — and it warned that leaving
that unexplained disables the one check that catches a bad deploy.

**That did not happen.** `main` was fast-forwarded, so `main`'s tip *is* the commit the image was
built from. No `EXPECTED SHA MISMATCH` line is needed, no rebuild from `main` is owed, and the
deploy-integrity check is live on this machine again.

> **One consequence of being back on `main`:** this run record is **not on `main`**. It lives on
> `origin/feature/prodrun-20260912` (`f8fd0920`), which is pushed and safe. In the production
> working tree, `docs/research/production-migration-run-20260912.md` has reverted to the 241-line
> pre-run version. **The record needs merging to `staging` and then `main`**, or the only account of
> this night stays on a side branch while the file on the mainline still says "THE RUN HAS NOT
> STARTED."

---

# Final state

- Ledger top version: **`20260912150000`** (migration 525)
- Ledger row count: **681** (604 at the end of Block 2, +76 in Phase 4, +1 for 525)
- `APP_GIT_SHA`: **`d60232f5`**, equal to `main`'s HEAD
- Phase 5 census: `anon` reads **20** relations, down from 214. Every remaining view is
  `security_invoker=true`; no `DEFINER` view is readable by `anon`; `anon_default_acl = 0`; none of
  the twelve sensitive functions is anon-executable
- Migrations applied / skipped / failed: **75 applied** (74 in Phase 4 + 525), **2 skipped and
  recorded** (460 superseded by 522; 477 superseded by 523+524), **3 skipped and deliberately not
  recorded** (449, 450, 452), **0 left failing**
- Backup: `prod-20260912-final.dump` · 35,223,850 bytes · md5 `98047bf7d4833abbba93b2a4366ce8ba`
- Branch: production tracks `main` again, clean at `d60232f5`
