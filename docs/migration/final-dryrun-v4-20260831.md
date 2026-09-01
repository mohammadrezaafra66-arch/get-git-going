# Final dry-run v4 — **PARTIAL**, 31 migrations clean, halted on a composition question

The four additions were right and they worked: **341, 339, 345 and 347 all applied cleanly**, and
348 was established as belonging and applied too. The run reached **31 migrations** before stopping.

It stopped on something bigger than a step: **the set contains four security *gates* whose
prerequisite migrations — 24 of them — are not in the set.** That is not a defect to patch. It is a
question about what this migration is for, and it is the owner's to answer.

Run 2026-09-01. Production was **never contacted**; the live `afrakala` database was **not touched**;
no tracked migration file was edited.

```
$ hostname
VIRA-SERVICE
```

---

## 1. Is 348 in or out? — **IN**, established by measurement

Production's constraint today permits exactly three shapes:

```sql
CHECK ( (destination_bank_account_id IS NOT NULL AND receiver_party_id IS NULL)
     OR (destination_bank_account_id IS NULL AND receiver_party_id IS NOT NULL)
     OR (status = 'pending_review' AND both NULL) )
```

A **cheque** receipt is none of them: the money is a piece of paper, so there is no destination bank
account and no receiver party. `create_receipt` (349) requires a bank account only for the `bank`
and `cash` channels — line 170 — so a cheque receipt row has neither and **violates the current
CHECK**. 348 adds the fourth shape.

**Without 348, no cheque receipt can be inserted at all.** It is not speculative; it belongs.

Final set: **47 migrations** (the original 42, plus 339, 341, 345, 347, 348).

## 2. Pre-flight sweep on the new 47-migration set

| pattern | result |
|---|---|
| **P1** `current_database()` guard | **eleven** — 337 338 339 341 342 344 345 346 347 391 392. Was seven; the four additions brought four more, exactly as predicted |
| **P2** `ALTER DEFAULT PRIVILEGES` without `FOR ROLE` | only 393 — fixed, see §4 |
| **P3** assertion vs production data volume | 418 and 410 only — both relaxed |
| **P4** hard-coded UUIDs | 391, 392, 402 — probes deferred |
| **P5** `current_user` / `session_user` | none |
| **P6** self-contained `BEGIN;`/`COMMIT;` | only 402 |

### The v3 defect class, swept systematically

This is the class execution cannot catch: a function body referencing a column, type or CHECK value
that some **other** migration creates. `CREATE OR REPLACE FUNCTION` does not resolve plpgsql bodies,
so these apply silently and raise at call time.

**Method:** extracted every `INSERT INTO t (cols…)` and `UPDATE t SET col =` from all 47 files, built
the union of the clone's **2,563** live columns plus the **22** columns and **3** tables the set
itself creates, and checked every reference against it.

```
=== BODY-REFERENCE SWEEP: columns written that would not exist ===
   392  document_status_history.result   column missing
checked 47 migrations against 2563 live columns + 22 the set adds
```

**That one hit is a false positive** — 392's two real INSERTs use
`(document_id, from_status, to_status, changed_by, note)`, all of which exist; `result` came from an
unrelated `UPDATE … SET` match in my extractor. **Every column every migration writes exists.**

**The CHECK-value half of the same class**, which is how `cheque_receivable` would have bitten:

| constraint | permitted after 341 | literals the set writes |
|---|---|---|
| `journal_lines_account_kind_chk` | customer_credit, bank, external_party, invoice_ar, clearing, other, supplier_payable, **cheque_receivable, cheque_payable** | cheque_receivable, cheque_payable, bank, customer_credit |
| `journal_entries_doc_kind_chk` | receipt, payment, dual, purchase_payment, **settlement**, other | receipt, payment, dual, other, settlement |

**All covered.** Adding 341 closes this class completely.

## 3. The run

Fresh clone `afrakala_prod_clone5`, restored and verified at **221 / 20 / 823 / 622**. Named to
expose the guard, never `afrakala`.

```
291 ✅  337 ✅  338 ✅  339 ✅  341 ✅  342 ✅  344 ✅  345 ✅  346 ✅  347 ✅  348 ✅
349 ✅  350 ✅  351 ✅  352 ✅  353 ✅  354 ✅  355 ✅  356 ✅  357 ✅
359 ✅  360 ✅  361 ✅  362 ✅  363 ✅  364 ✅  365 ✅  366 ✅  367 ✅  368 ✅  369 ✅
393 🔴 FAILED
```

**31 of 47 applied cleanly, including all five additions.** No step needed an unplanned adjustment.

## 4. Why it stopped — and why this is not a patchable step

The C2 fix from v3 **worked**: the run got past C2 and died on a different check in the same
migration.

```
ERROR:  393 C7: find_duplicate_product is executable by anon or PUBLIC again
        (1 signature(s)) — OG-33/OG-49/OG-55 regression
```

**C7 does not fix anything. It is a regression bar.** Its own comment: *"the doors earlier missions
closed must still be shut"*. It checks four functions and raises if anon can execute them:

```sql
FOREACH fn IN ARRAY ARRAY['find_duplicate_product','get_recent_purchase_label',
                          'get_recent_purchase_labels','calculate_adjusted_price'] LOOP
  … IF has_function_privilege('anon', p.oid, 'EXECUTE') … RAISE EXCEPTION
```

Measured on the clone — **all four are anon-executable on production:**

| function | anon can execute | closed by |
|---|---|---|
| `find_duplicate_product` | ✅ yes | migration **389** |
| `get_recent_purchase_label` | ✅ yes | migration **381** |
| `get_recent_purchase_labels` | ✅ yes | migration **381** |
| `calculate_adjusted_price` | ✅ yes | migration **390** |

**None of 381, 389 or 390 is in the set.** 393 is correctly reporting that a security posture it
assumes was never established here.

### The real shape of the problem

The 370–401 range holds **32 migrations of one continuous security-hardening series**. The set
contains **eight** of them and is missing **twenty-four** — including every migration that actually
closes a door:

```
370 close_anon_read_on_viewer_guard_views      MISSING
373 close_anon_default_privileges              MISSING
381 close_anon_function_execute                MISSING
386 close_null_uid_on_viewer_guard_views       MISSING
388/389/390 narrow anon columns, close definer MISSING
395 close_anon_definer_price_and_staff_leaks   MISSING
399 og61_close_unauthenticated_definer_writers MISSING
        …and seventeen more…

378 gate_compares_census_as_a_set              IN SET
379 census_by_effect_all_relkinds              IN SET
380 pin_privilege_set_and_column_effect        IN SET
393 close_function_default_privilege…          IN SET
```

**The set has the gates without the fixes.** That ordering is backwards and cannot succeed: it has
now failed twice on exactly this — 378/379/380 in the first rehearsal, 393's C2 and now C7.

### And these four gates create nothing

Measured:

| migration | tables/views/columns created | functions created | DDL/DML statements |
|---|---|---|---|
| 378 | 0 | none | **0** |
| 379 | 0 | none | **0** |
| 380 | 0 | none | **0** |
| 393 | 0 | none | 8 (all `ALTER DEFAULT PRIVILEGES`) |

378, 379 and 380 are **pure assertion migrations**. They contain no executable DDL at all. And
`is_viewer_only`, the function the gates lean on, is **not** created by 393 — it already exists on
production.

**Nothing in the Live Ledger module depends on any of the four.**

## 5. The decision this needs

**Option A — remove the four gates from the set. Recommended.**
Set becomes 43 migrations, purely the Live Ledger module. 378/379/380 contain no DDL, so removing
them costs nothing whatsoever. 393's eight `ALTER DEFAULT PRIVILEGES` statements do real work, but
they harden *future* objects and are not needed by the ledger. Production's anon exposure is
**pre-existing** — this migration neither creates nor widens it — and closing it becomes a separate,
properly scoped security mission that runs the whole 370–401 series in order.

**Option B — add the 24 missing security migrations.**
Set becomes ~71. Coherent, and it brings production to staging's security posture. But it changes
the security posture of a live system in the same maintenance window as a schema migration, and each
of those 24 needs its own sweep — several carry the `current_database()` guard, and 381/382,
384/385, 386/387, 388/389 come in fix-then-repair-the-gate pairs.

**I have not chosen.** Option A is smaller and is what a Live Ledger migration should be, but it
leaves a real anon exposure in place, and that is a judgement about risk that belongs to the owner.

## 6. Not verified

- **Steps after 393**: 378, 379, 380, 391, 392, 398, 400, 402, 403, 407, 408, 410, 417, 418, 419.
- **The RPC call test.** You asked for `create_receipt`, `create_payment`, `create_dual_document` and
  `reverse_document` to be *called* against real data. The run did not reach 403, the last definition
  of the first two, so calling them now would test a half-built module. This remains the single most
  valuable outstanding check, precisely because it is what v3's reading predicted would fail.
- **A3** (391's `document_type` probe executing).
- **The 151-row backfill** in a clean pass.
- **Anything about production.** Not contacted.

## 7. Unresolved

**One question, not a defect:** does this migration carry the security series with it, or not?

Everything else is ready. The additions work, the guard list is confirmed at eleven, the
body-reference class is swept clean, the CHECK-value class is closed by 341, and 31 migrations apply
without complaint.

## 8. What the four runs have established

| | halted at | cause | could execution have caught it? |
|---|---|---|---|
| v1 | step 1 | 337's guard | yes |
| v2 | step 9 | 393's missing `FOR ROLE postgres` | yes |
| v3 | pre-flight | 341 omitted; six migrations silently broken | **no** |
| **v4** | **31 migrations in** | **the set has security gates without their 24 prerequisites** | yes, but only after 31 steps |

The sweep is earning its keep: v3's finding could not have been caught any other way, and v4's
sweep confirmed the fix for it was complete before the run started.

---

`afrakala_prod_clone5` is left at 31 migrations for inspection. Clones 3 and 4 remain from earlier
rehearsals; clone2 was dropped. The live `afrakala` database was not touched, and **production was
never contacted**.
