# Final dry-run v2 — **PARTIAL**, 26 migrations clean, halted at step 9

The 337 correction worked: the run got **26 migrations deep** before stopping, against 1 last time.
It halted at step 9 on migration **393**, with a second guard-class defect — precisely diagnosed,
and with the fix **proven** in a rolled-back transaction.

Run 2026-09-01. Production was **never contacted**; the live `afrakala` database was **not
touched**; no tracked migration file was edited.

```
$ hostname
VIRA-SERVICE
```

---

## 1. Stage 1 — backup restorability

### Verdict: **RESTORABLE** ✅ (re-confirmed on a second independent restore)

| check | value | |
|---|---|---|
| size | 29,725,089 bytes | ✅ |
| md5, three times (disk, container, re-verified before this run) | `41830357199bf4fe743e824fee89f3f5` | ✅ |
| restore | `--no-owner --disable-triggers`, 21 benign errors (pg_cron ×19, vault ×2), **no data errors** | ✅ |

**Counts, exact match with production:**

| | tables | views | functions | policies |
|---|---|---|---|---|
| production | 221 | 20 | 823 | 622 |
| `afrakala_prod_clone3` | **221** | **20** | **823** | **622** |

**Business data before any migration:**

| customers | products | sales_quotes | profiles | user_roles | accepted | receipts |
|---|---|---|---|---|---|---|
| 768 | 358 | 170 | 36 | 42 | 151 | 1 |

The clone was named `afrakala_prod_clone3` — deliberately **not** `afrakala` — so the
`current_database()` guards fail here exactly as they would on production.

---

## 2. The run log

| step | migrations | result |
|---|---|---|
| 1 | **337** | ✅ PASS (scratch: db-name guard — **the v1 defect, now fixed**) |
| 2 | 291 | ✅ PASS |
| 3 | **338** | ✅ PASS (scratch: guard) |
| 4 | **342** | ✅ PASS (scratch: guard) |
| 5 | **344** | ✅ PASS (scratch: guard) |
| 6 | **346** | ✅ PASS (scratch: guard) |
| 7 | 349, 350, 351, 352, 353, 354, 355, 356, 357 | ✅ PASS (9/9) |
| 8 | 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369 | ✅ PASS (11/11) |
| **9** | **393** | 🔴 **FAILED** |
| 10–21 | 378 … 419 | not run — halted per the rule |

**26 of 42 migrations applied cleanly.** No step needed an unplanned adjustment.

### The failure

```
393  plain  *** FAILED ***
     ERROR:  393 C2: the public FUNCTIONS default-acl row still grants EXECUTE to anon
```

### Root cause — `ALTER DEFAULT PRIVILEGES` is per-grantor

`ALTER DEFAULT PRIVILEGES` without `FOR ROLE` only touches the **executing role's** rows. 393 runs
its revokes as the connecting user (`supabase_admin`):

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;   -- line 143
```

But production carries default-ACL rows from **two** grantors:

```
grantor        | schema | objtype   | grants_anon
postgres       | public | FUNCTIONS | t     <-- 393 never touches this row
postgres       | public | SEQUENCES | t
postgres       | public | TABLES    | t
postgres       | storage| (3 rows)  | t
supabase_admin | public | FUNCTIONS | t     <-- 393 clears this one
supabase_admin | public | SEQUENCES | t
supabase_admin | public | TABLES    | t
```

393's own check (lines 196–202) scans **every** row in `public` regardless of grantor. So it clears
its own and then fails on `postgres`'s.

**Why nobody saw this before:** the test database has **zero** anon default-ACL rows, so 393 passes
there trivially. It is only reachable on a database that still has them — production, and now this
clone.

### The fix, proven

Repeat each revoke with `FOR ROLE postgres`. Measured inside `BEGIN … ROLLBACK` on the clone:

```
anon default-acl grants in public after BOTH grantors: 0
393 C2 WOULD PASS -- the fix is: repeat each revoke with FOR ROLE postgres
ROLLBACK
```

`supabase_admin` **is** permitted to alter `postgres`'s default privileges — no privilege barrier.
For the corrected scratch, each of 393's three `public`-schema revokes gains a twin:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon;
```

Nothing was applied. The clone remains at step 26, its 22 anon grants untouched.

---

## 3. The production guard workaround — exact text, as requested

**The workaround exercised on the clone is NOT the one production will use.** They differ in exactly
one token: the database name. Stated plainly so the operator cannot get it wrong.

| | substitution |
|---|---|
| **what ran here** | `current_database() NOT IN ('afrakala','afrakala_prod_clone3')` |
| **what production needs** | `current_database() NOT IN ('afrakala','postgres')` |

The exact command the operator applies, once per migration, to **all seven**:

```bash
for n in 337 338 342 344 346 391 392; do
  f=$(ls supabase/migrations/ | grep -E "_${n}_" | head -1)
  sed "s/current_database() <> 'afrakala'/current_database() NOT IN ('afrakala','postgres')/" \
      "supabase/migrations/$f" > "scratch/$f"
done
```

**Confirmed:** the only difference between the clone form and the production form is the second
database name in the `NOT IN` list. The pattern matched, the substitution applied, and the guard
passed on all seven files here — 337, 338, 342, 344 and 346 are proven by this run's steps 1–6;
391 and 392 are at steps 13–14 and were not reached.

## 4. `--single-transaction` — measured, not assumed

Of the 42 migrations across the 21 steps, **exactly one** carries its own `BEGIN;`/`COMMIT;`:

```
402 : BEGIN=1 COMMIT=1  -> MUST RUN WITHOUT --single-transaction
(every other step is safe under --single-transaction)
```

The repo-wide figure of 41 such migrations is real but almost all of them fall **outside** this set.
The finalized script already marks step 16 (402) as *"run **without** `--single-transaction`"* and
that is the only step needing the note. **No other step requires it.**

## 5. A3 — the 391 `document_type` probe

**The precondition is now measured rather than reasoned.** The clone is stopped after step 8 —
after 342, before 402 — which is exactly where 391 sits in the sequence. At that point:

| column 391's probe inserts | present |
|---|---|
| `document_type` | ✅ |
| `document_id` | ✅ |
| `storage_path` | ✅ |
| `uploaded_by` | ✅ |
| `ocr_status` | ✅ |

All five exist. The v1 failure was purely an artefact of that clone's 402 having committed early
and dropped them out of order; in a clean sequence they are there.

**Still not fully closed:** 391 itself (step 13) did not execute, because the halt at step 9 comes
first. The precondition is proven; the execution is not.

---

## 6. Stage 3 — end-state verification

**Not reached.** Steps 10–21 did not run. What is verifiable at the halt point:

| | |
|---|---|
| `jalali_year` (step 1) | ✅ present — the v1 blocker is genuinely fixed |
| `dual_documents` (step 8) | ✅ present |
| `create_receipt` | ✅ present |
| business data | unchanged from the before-counts; nothing has altered it |

The full 12-object check, the 224/21/840/618 comparison, and the 151/151 backfill remain unverified.

## 7. Not verified

- **Steps 10–21**, including 391, 392, 402, 410, 417, 418, 419.
- **The `accepted_at` backfill of 151 rows** — step 20 not reached. It succeeded in the earlier
  incremental rehearsal, but not in a clean pass.
- **391's execution** (see §5 — precondition measured, execution not).
- **The 392 and 402 scratch copies** in a clean sequence.
- **Anything about production.** Not contacted.

## 8. Unresolved

**One blocker, fully diagnosed, fix proven:**

Migration **393** must gain `FOR ROLE postgres` twins for its three `public`-schema revokes. Without
them its own C2 check fails on any database that still carries `postgres`-granted anon default
privileges — which production does, and the test database does not.

I have not written that scratch copy or resumed the run, because the instruction was to halt on
failure, and because this is the second guard-class defect found in two runs. That pattern is worth
the owner's attention before another attempt: **both defects were invisible on the test database and
only appear against production's actual state.**

## 9. Ready for production?

**No — one more correction, then one more clean run.**

Progress is real: v1 halted at step 1, v2 at step 9, with 26 migrations clean and every fix so far
proven rather than assumed. What remains:

1. Add the `FOR ROLE postgres` twins to a scratch copy of **393**.
2. Re-run from a fresh clone. The steps beyond 9 have all passed individually in the earlier
   incremental rehearsal, so the expectation is a complete pass — but that is an expectation, not a
   measurement, and this mission exists precisely to stop treating the two as the same thing.

Two production differences to carry forward, unchanged from v1:

- **The `pg_cron` restore noise will not occur on production** — it exists only because a clone
  cannot be named `postgres`. But that same fact is why the guard substitution must name `postgres`
  (§3).
- **`--disable-triggers` needs superuser**, available as `supabase_admin`, and will be needed again
  for any rollback restore.

---

`afrakala_prod_clone3` is left at step 26 for inspection. `afrakala_prod_clone` from the first
rehearsal is still present; `afrakala_prod_clone2` was dropped and replaced by clone3 as instructed.
The live `afrakala` database was not touched, and **production was never contacted**.
