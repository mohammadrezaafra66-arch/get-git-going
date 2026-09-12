# Stage 0 — findings before the owner touches production

**Date:** 2026-09-08 · **Branch:** `feature/prodprep-20260908` · **Author:** orchestrator (Claude Code)
**Sources:** `docs/runbooks/production-migration-20260908.md` (read whole, 1,839 lines),
`R1-R3-results.md`, `R4-R5-results.md`, `CONTRACTS.md`, `MIGRATIONS-74.md`,
`docs/research/production-audit-2026-09-07.md`, and **new measurements taken on
`prod_rehearsal_20260908`** (the restored production dump) on 2026-09-08.

> **Nothing in this document was measured on production.** Every number below comes from the
> rehearsal database, from the repository, or from the owner's own three preflight readings.
> Where the rehearsal is used as a proxy for production it says so, and the block that confirms
> it on the night is named.

> ## ⚠️ Addendum, 2026-09-12 — three things in this document have moved
>
> 1. **The backup is `prod-20260912.dump`.** The 2026-09-08 dump named below is four days
>    stale and **is not the restore target**. Keep the file; do not restore from it.
> 2. **The gap is 77, not 74.** PR #435 merged on 2026-09-08 and carried 520, 521 and 522
>    onto `staging` — all three absent from production. `MIGRATIONS-74.md` is stale; the
>    authoritative list is the Phase 4 table in `production-migration-20260908-BLOCKS.md`.
>    `staging` has not moved otherwise (`a6b6c629` = `9c113aac` + #435), and **PR #436 does
>    not exist.**
> 3. **520 and 521 were rehearsed on 2026-09-12**, since they were never in the rehearsed 74.
>    Both applied to `prod_rehearsal_20260908` with md5 matched on both sides and **`EXIT=0`**.
>    520 asserts no absolute row counts — its comparisons are relational (`= 0`) — and 521 is
>    three `REVOKE`s. Both carry their own `BEGIN;`/`COMMIT;`, so the harmless-warning list is
>    now eight: 466, 512, 513, 514, 516, 517, 520, 521.
>
> Everything else below stands as measured on 2026-09-08.

---

## 0 · The three preflight answers, applied

| Preflight | Owner's reading | What it settles |
|---|---|---|
| `document_numbers`, `dual_documents`, `document_attachments` | **all three exist** | OD-1 closed. **All seven class-(b) failures vanish** — 476, 477, 478, 487, and the 497 → 514 → 516 cascade |
| `hold_credit_for_quote(uuid,uuid)` | **exists** | OD-2 closed. **Class-(b′) 462 vanishes.** The ledger's 408 row is correct, so 408 must NOT go in the not-applied list |
| `pg_default_acl` entries granting `anon` | **9** | Phase 3 is mandatory and runs **before** the 74. The count matches the rehearsal exactly (9 of 14 total rows) |

**Rehearsal had 14 failures. With these three answers, 8 of them disappear.** Six remain, and
they are the six real defects.

---

## 1 · NEW MEASUREMENT — the rehearsal carries production's default ACLs

This was not stated anywhere and it matters for reading every other result:

```
prod_rehearsal_20260908:  pg_default_acl rows total = 14, rows mentioning anon = 9
```

**9 is exactly the number the owner read on production.** The rehearsal is a restore of a
production dump, so it inherits production's default-privilege configuration. That is why 507
failed on the rehearsal and why the test database `afrakala` — which has **zero** such rows —
could never have shown that class of defect. The rehearsal is therefore a *faithful* proxy for
this specific question, which the runbook did not claim.

The nine rows, with the grantor and schema Phase 3 must name:

| grantor | schema | object types |
|---|---|---|
| `postgres` | `public` | `r` (tables), `f` (functions), `S` (sequences) |
| `postgres` | `storage` | `r`, `f`, `S` |
| `supabase_admin` | `public` | `r`, `f`, `S` |

---

## 2 · 🔴 CORRECTION TO THE RUNBOOK — Phase 3 as written does NOT close the hole

**This is the most important finding in this document.** The runbook's step 1.4 revokes `anon`
from the default ACLs and declares success when
`SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%'` returns `0`.

**That criterion can be met while `anon` still executes every newly created function.**

Measured on the rehearsal, in rolled-back transactions:

| probe | what was revoked | fresh function's ACL | `anon` can execute? |
|---|---|---|---|
| **A** | nothing (production's state today) | `{=X, postgres=X, supabase_admin=X, anon=X, authenticated=X, service_role=X}` | **t** |
| **B** | `anon` only, schema-scoped (**the runbook's block**) | `{=X, postgres=X, supabase_admin=X, authenticated=X, service_role=X}` | **t** |
| **F** | `PUBLIC` only, global | `{postgres=X, supabase_admin=X, anon=X, …}` | **t** |
| **G** | `anon` schema-scoped **+** `PUBLIC` global | `{postgres=X, supabase_admin=X, authenticated=X, service_role=X}` | **f** |

Reading B: the explicit `anon=X` grant is gone — which is what unblocks 507 — but the empty-role
entry `=X`, PostgreSQL's built-in `EXECUTE TO PUBLIC` default for functions, remains, and `anon`
is a member of `PUBLIC`. So `anon` still reaches the function by the other road.

**Tables and sequences do not have this problem.** Probe H: with only the `anon` revoke, a fresh
`CREATE TABLE` came out `{postgres=…, supabase_admin=…, authenticated=…, service_role=…}` and
`has_table_privilege('anon', …, 'SELECT')` was **`f`**. PostgreSQL's built-in default grants
nothing to `PUBLIC` on tables. **The gap is functions only.**

**One honest caveat:** the schema-scoped form
`ALTER DEFAULT PRIVILEGES … IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` had **no
effect** (probe C — the fresh function still carried `=X`), while the **global** form, with no
`IN SCHEMA`, worked. I did not determine why PostgreSQL treats the two differently, and I am not
going to guess at the catalogue mechanism. The measurement is reproducible; the explanation is
not mine to assert.

### The corrected Phase 3 block — proven as a unit

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public  REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA storage REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA storage REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA storage REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public  REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public  REVOKE ALL ON SEQUENCES FROM anon;
-- the two the runbook is missing:
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Measured outcome of exactly this block on the rehearsal:

```
anon_default_acl_rows = 0
   kind   | anon | authenticated
----------+------+---------------
 function | f    | t
 table    | f    | t
 sequence | f    | t
```

**`authenticated` keeps everything it had.** This block narrows `anon` and nothing else.

**Blast radius the owner must accept:** the last two statements are **global** — no `IN SCHEMA` —
so they change the default for functions this grantor creates in *any* schema, not just `public`.
Tonight's 74 create functions in `public` only, so the run itself is unaffected; the lasting
effect is on objects created later, anywhere. That is the direction the project already chose in
migration 393, which issued the same global `REVOKE … FROM PUBLIC`.

---

## 3 · S-3 · The five class-(a) migrations, with measured verdicts

Counts below were read from `prod_rehearsal_20260908` on 2026-09-08. **The audit's D-4 table does
not carry any of these tables**, so the rehearsal — the restored production dump — is the only
evidence available. It is one week old; the block at each step re-reads the live number.

### 449 — `retire_daily_capital_functions` · order 15 · **WILL FAIL**

Asserts three things after dropping three functions:

| assertion | wants | production dump holds | verdict |
|---|---|---|---|
| 3 functions gone | 0 | (drops succeed — all three exist) | ok |
| `daily_capital_snapshots` | **10** | **0** | **FAILS HERE** |
| `daily_capital_inputs` | **2** | **0** | would also fail |

The `10` and `2` were read off the **test** database when the migration was written; the owner
declined the daily-capital feature, and production never wrote those rows. **Two constants are
wrong, not one.**

### 450 — `retire_superseded_tables` · order 16 · **WILL FAIL**

**New finding: four separate constants are wrong, not the one the rehearsal reported.** The
rehearsal stopped at the first, so the runbook only records that one.

| assertion | wants | production dump holds |
|---|---|---|
| `dynamic_parameter_weights_backup_142` | **18** | **16** ← the rehearsal's reported failure |
| `dynamic_parameter_weights_backup_20260722` | **18** | **16** |
| `knowledge_documents` | **1** | **0** |
| `messenger_messages` | **16** | **1** |

Loosening one constant would move the failure to the next one. All four would have to be
rewritten, and the migration also `DROP`s a table and `RENAME`s four before it asserts anything.

### 452 — `retire_parameter_weight_backups_by_rename` · order 18 · **WILL FAIL**

Guard block passes (the backups are not both empty) and prints
`452: backup_142=16 rows, backup_20260722=16 rows, live dynamic_parameter_weights=16 rows`.
Then it renames both tables and the verify block demands 18 and 18 → aborts with
`452: rows were lost in the rename (142=16, 0722=16)`.

**New finding — the reason 452 exists does not hold on production.** 452's whole argument for
renaming rather than dropping is that two rows live in `backup_142` and nowhere else. Measured on
the production dump:

```
rows_only_in_b142 = 0
```

On production the backups are **pure duplicates** of the live table. Skipping 452 therefore
forfeits nothing but the tidy-up; the data-preservation argument is a test-database artefact.

### 460 — `pin_receipt_ocr_to_local_vision` · order 25 · **WILL FAIL** (aborts) → superseded

Owner decision **D-62**. Replaced by migration **522** (below). 460's file is not edited; it is
skipped and its ledger row is recorded with a note that 522 superseded it.

### 507 — `cron_definer_writers…` · order 62 · ✅ **WILL PASS** — measured, no longer UNKNOWN

The runbook flagged OD-3(a) + 507 as *the* untested combination. **It has now been tested**, in a
rolled-back transaction on the rehearsal, in the production order:

1. Corrected Phase 3 applied → `pg_default_acl` anon rows = 0
2. `roll_employee_daily_streaks` created **fresh** (production does not have it — 504 creates it
   at order 59, *after* Phase 3), giving
   `{postgres=X, supabase_admin=X, authenticated=X, service_role=X}` → `anon_exec = f`
3. Migration 507 run → **passed**, all four `REVOKE`s, both `GRANT`s and the assertion block
4. Phase 5.2 check on both functions → `anon_exec = f`, `auth_exec = f`

> **Why the rehearsal fails 507 but production will not.** On the rehearsal the function already
> exists with an explicit `anon=X` baked into its ACL from when it was first created, and closing
> a default privilege never touches an object that already exists. Production is at migration 424
> and **does not have this function yet**. Order is everything: Phase 3, then 504 creates it
> clean, then 507 passes.

---

## 4 · NEW FINDING — 475 will pass, and it was never really a 460 cascade

475's check #4 was assumed to fail on production because 460 fails. **It reads state, not
UUIDs:**

```sql
JOIN public.ai_providers p ON p.id = r.provider_id
WHERE r.service_key = 'receipt_ocr.vision' AND r.capability = 'vision'
  AND r.is_enabled AND NOT r.fallback_enabled
  AND p.kind = 'ollama' AND p.base_url LIKE 'http://192.168.170.8:11434%'
```

Every one of those is satisfied by the state **the owner created by hand on 2026-09-07**. The one
column nobody had read is `base_url`, and step 1.5's query does not select it. Measured on the
production dump:

```
 name   | kind   | is_active | capabilities      | base_url
 ollama | ollama | t         | {chat,embeddings} | http://192.168.170.8:11434
```

**Production's ollama row carries exactly the LAN address 475 requires.** And measured directly:
with the route pinned, **475 runs to completion, exit 0**, printing
`475 VERIFY: … receipt_ocr.vision still pinned to the LAN Ollama provider`.

> **Worth noticing, though it is not tonight's business:** that address is the **test** machine,
> `192.168.170.8`. Production's receipt OCR is configured to call Ollama on the test computer.
> Recorded in HANDED FORWARD, not changed here.

---

## 5 · S-2 · Migration 522, the 460 replacement

`supabase/migrations/20260908120000_522_pin_receipt_ocr_by_name_supersedes_460.sql`

Next free number: **522** — highest on disk is 521, `origin/staging` tops out at 519, and no
`52x` exists on any remote ref. ASCII-only, no BOM, `md5` verified identical across the stdin
delivery.

**Design, and the three things it refuses to do:**

- Looks rows up **by name** (`'ollama'`, `'gpt'`), never by UUID.
- **Does not require the pinned provider to declare `vision`.** Production's ollama declares
  `{chat,embeddings}`; 460 asserts vision and that is one of the reasons it aborts. The
  consequence — an empty candidate list, OCR degraded to manual entry — is printed as a NOTICE
  instead. That is 460's own "ACCEPTED CONSEQUENCE", and it fails in the safe direction.
- **Does not touch `base_url`.** Nobody has read production's value directly; rewriting a URL
  nobody has read would blindly redirect the path receipt images travel.
- **Does not touch any credential.** `secret_id` and `key_prefix` are left alone, so
  deactivation stays reversible with one `UPDATE`.

Every write carries an `IS DISTINCT FROM` predicate, so a database already in the desired state
gets `ROW_COUNT = 0` and `updated_at` does not move. 460's two `UPDATE`s are unconditional and
rewrite `updated_at` even when nothing changes; 522 does not repeat that.

### Proven three ways, as required

| # | database | starting state | result |
|---|---|---|---|
| **1** | `prod_rehearsal_20260908` | route → `gpt`, fallback **on**, gpt active (the leaking state) | **applied** — `total rows written = 2`, verify passed, exit 0 |
| **2** | `afrakala` (test), in `BEGIN … ROLLBACK` | already correct; cloud row is named `for ocr`, not `gpt` | **no-op** — `total rows written = 0`, verify passed, exit 0 |
| **3** | `prod_rehearsal_20260908`, immediately again | now correct | **no-op** — `total rows written = 0`, verify passed, exit 0 |

Proof 2 also exercises the "no provider named `gpt`" path, which is the shape the test database
has and production does not — the migration reports it and continues rather than aborting.

**Where it goes in the run:** at 460's slot, **order 25**, *before* 475 at order 37. Production
already satisfies 475 on its own, but running 522 first makes that guarantee rather than a hope.

---

## 6 · S-1 · `UNREHEARSED` re-tagged

### Resolved — no longer unrehearsed

| item | resolved by |
|---|---|
| Steps 1.1 / 1.2 as production queries | the owner ran them this morning |
| The seven class-(b) failures (476, 477, 478, 487, 497, 514, 516) | 336–370 present |
| Class-(b′) 462 | 408 present |
| **OD-3(a) + 507** — the runbook's flagged unknown | measured on the rehearsal in production order (§3) |
| **475 at order 37** | measured — passes once the route is pinned (§4) |
| **The `ALTER DEFAULT PRIVILEGES` closure as a technique** | measured, and **corrected** — the runbook's block is insufficient (§2) |
| `pg_dump` on database `postgres` | the backup was taken this morning: 33,784,463 bytes, `-Fc` |

### Still unrehearsed — the owner starts knowing these

| # | item | why it still matters |
|---|---|---|
| **U-1** | **The restore drill of this specific dump.** Verified **by size only** | The runbook's own line: a backup nobody has restored is not a backup, it is hope. **This is the largest remaining gap and it is cheap to close** |
| **U-2** | Ledger reconciliation against a database named `postgres` | Rehearsed twice on the rehearsal plus a negative test; never on production, and the script refuses the name `postgres` by design (OD-4) |
| **U-3** | The corrected Phase 3 block **on production** | Proven on the rehearsal; production is a different cluster |
| **U-4** | Production's `ai_providers.base_url`, read directly | The dump says `http://192.168.170.8:11434`; 475 depends on it. **Added to the Phase 1 block** |
| **U-5** | Phase 5 as a sequence | Each query has run; the checklist as a whole has not |
| **U-6** | The deploy (`--no-deps`, `GIT_SHA`) | Never rehearsed; two distinct failure modes if either is dropped |
| **U-7** | All 12 `down` files | None has ever been executed. 62 of the 74 have no down file at all |
| **U-8** | Restoring onto the **live** `postgres` database | Only restore-to-a-different-database has been rehearsed |
| **U-9** | Container behaviour after a reboot on production | UNKNOWN by design — must not be measured there |
| **U-10** | Whether production's data has moved since the 2026-08-31 dump | Every count in §3 is a week old. The blocks re-read them live |

---

## 7 · What the run should expect

With the three preflight answers and the findings above, the honest forecast for the 74 is:

| | count | which |
|---|---|---|
| expected to succeed | **69** | including 462, 475, 476, 477, 478, 487, 497, 507, 514, 516 |
| expected to fail, decision at the step | **3** | 449, 450, 452 — all three at orders 15, 16, 18 |
| skipped by owner decision, replaced | **1** | 460 → 522 |
| applied in addition | **1** | 522, at order 25 |

**The run's first stop is order 15, and the three stops are consecutive-ish and early.** Past
order 18, nothing is currently forecast to stop it.

> **The standing caveat, which applies to every line above:** the rehearsal showed X; production
> may differ; the `SELECT` inside each block is what confirms it on the night.
