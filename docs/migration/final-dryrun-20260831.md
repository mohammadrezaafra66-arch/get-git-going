# Final dry-run — **PARTIAL**, halted at step 1 with one precise defect

**The backup is RESTORABLE — that finding stands on its own and is complete.**

**The migration script is not yet correct.** It halted on its very first step, and the cause is a
one-line omission I introduced myself. Per the mission's rule the run was stopped rather than
patched, so the end state was not reached.

Run 2026-09-01. Production was **never contacted**; the live `afrakala` database was **not
touched**; no tracked file was edited.

```
$ hostname
VIRA-SERVICE
```

---

## 1. Stage 1 — is the backup restorable?

### Verdict: **RESTORABLE.** ✅

This has never been tested before, and it now has been. Every backup so far warned about circular
foreign keys; the restore needs `--disable-triggers`, and with it the dump restores completely and
reproduces production exactly.

**The dump, verified before use:**

| check | value | expected | |
|---|---|---|---|
| size | 29,725,089 bytes | 29,725,089 | ✅ |
| md5 on disk | `41830357199bf4fe743e824fee89f3f5` | same | ✅ |
| md5 inside the container after transfer | `41830357199bf4fe743e824fee89f3f5` | same | ✅ |

**The restore:** `pg_restore --no-owner --disable-triggers` into a fresh `afrakala_prod_clone2`.
Exit code 1 with **21 errors, all benign and all accounted for**: 19 are `pg_cron` (the extension
can only live in a database named `postgres`, and the clone is not one — **this class will not
occur on production, which IS `postgres`**), and 2 are vault objects that pre-exist in the
container. **No data-loading errors** — the `--disable-triggers` requirement is real and sufficient.

**The result matches production on every count:**

| | tables | views | functions | policies |
|---|---|---|---|---|
| production | 221 | 20 | 823 | 622 |
| **restored clone** | **221** | **20** | **823** | **622** |

**And the clone sits at production's level, proven in both directions:**

| must be ABSENT | | must be PRESENT | |
|---|---|---|---|
| `dual_documents` | ✅ | `settlement_types.days` | ✅ |
| `document_numbers` | ✅ | `payment_vouchers` | ✅ |
| `document_attachments` | ✅ | `post_receipt_accounting(uuid,uuid)` | ✅ |
| `create_receipt` | ✅ | | |
| `sales_quotes.accepted_at` | ✅ | | |
| `jalali_year` | ✅ | | |

**Business data captured before any migration ran:**

| customers | products | sales_quotes | profiles | user_roles | accepted quotes | payment_receipts |
|---|---|---|---|---|---|---|
| 768 | 358 | 170 | 36 | 42 | 151 | 1 |

> **Stage 1 exit condition met in full.** Independent of anything below: **the production backup can
> be restored, and restoring it gives you production.**

---

## 2. Stage 2 — the run log

The clone was deliberately named `afrakala_prod_clone2`, **not** `afrakala`, so the
`current_database()` guards would fail here exactly as they will on production rather than passing
silently.

| step | migration | result |
|---|---|---|
| **1** | **337** | **🔴 FAILED** — `ERROR: wrong database: afrakala_prod_clone2 (expected afrakala)` |
| 2–21 | 291 … 419 | **not run** — halted per the mission rule |

### The defect

Migration **337 carries the `current_database() <> 'afrakala'` guard**, and my finalized script does
not list it among the migrations needing the workaround. The script says:

> Fourteen migrations open with `IF current_database() <> 'afrakala' THEN RAISE EXCEPTION` …
> **Six are in our set: 338, 342, 344, 346, 391, 392.**

That count is wrong. Enumerated across all 21 steps just now:

```
CARRY THE GUARD : 337 338 342 344 346 391 392     (seven, not six)
```

**337 is the one I added myself** — it was missing from the original brief's list, I appended it as
step 1 because `jalali_year` is required by the document-number functions, and I never checked
whether it carried the guard. It does.

This is not a subtle failure mode; it is the first statement of the first step. Had the script been
run on production as written, it would have aborted immediately — which is precisely the outcome
this rehearsal exists to prevent, and it was caught because the clone was named to expose the guard
instead of hide it.

### The correction is one line

337 joins the guard list. Its content is otherwise trivially safe — the whole migration is a guard
block, one `CREATE OR REPLACE FUNCTION public.jalali_year(_d date)`, a `COMMENT`, and a verify
block, and its only dependency is `jalali_year` itself. **The guard is provably the sole blocker.**

```
sed "s/current_database() <> 'afrakala'/current_database() NOT IN ('afrakala','postgres')/" \
    supabase/migrations/20260818151000_337_jalali_year_helper.sql > scratch/337.sql
```

### Why the run was not patched and resumed

The mission is explicit that a failure means the script is wrong and must be corrected before
production, and that patching mid-run would recreate the accumulated-state problem that made A3
unprovable last time. **A clean halt with a precise failure is the intended outcome here**, so the
run was stopped with the clone left at its restored, pre-migration state.

---

## 3. Stage 3 — end-state verification

**Not reached.** Steps 2–21 did not run, so there is no end state to verify. The clone remains a
pristine restored copy of production; the before-counts in §1 are also its current counts.

---

## 4. Not verified

- **Steps 2 through 21 of the script.** They ran successfully during the earlier incremental
  rehearsal, but never in one clean pass on a pristine clone. That is exactly the gap this mission
  set out to close and it remains open.
- **A3 — the 391 `document_type` probe.** Still unproven. The reasoning that it works in correct
  filename order (`342 < 391 < 402`) is unchanged and sound, but the run halted long before
  reaching step 13, so it was not demonstrated. It cannot be closed without a complete run.
- **The `--single-transaction` behaviour of the 41 migrations carrying their own `COMMIT;`.** Only
  402 has been exercised, and only in the earlier run.
- **Anything about production.** Not contacted.

## 5. Unresolved

**One blocker, fully diagnosed, correction known:** migration **337** must be added to the
guard-workaround list in `dryrun-finalized-20260831.md`. The script cannot be called ready until
that is corrected **and a full 21-step run completes clean on a fresh clone**.

I have not edited the finalized script, because correcting the deliverable and then re-running is a
decision for the owner rather than something to do silently inside a mission whose instruction was
to halt.

## 6. Ready for production?

**No — not yet, and the gap is small and specific.**

What is needed:
1. Add **337** to the guard list in the finalized script (seven migrations, not six).
2. Re-run this mission from a **fresh** clone. Not a resumed run — a fresh one, so the result is
   what the mission asked for: the script executed once, cleanly, end to end, against a pristine
   copy of production.

Two things about the production environment that will still differ from this clone, and are worth
holding in mind for that run:

- **The `pg_cron` restore noise will not occur.** Those 19 errors exist only because a clone cannot
  be named `postgres`. Production is `postgres`, so its cron objects are already in place and
  untouched — but it also means **the guard workaround must substitute `postgres`**, not the clone
  name used here.
- **`--disable-triggers` requires superuser.** It was available here as `supabase_admin`. The same
  privilege is needed on production for any restore-from-backup during a rollback.

---

`afrakala_prod_clone2` is left in place, restored and un-migrated, ready for the corrected run.
`afrakala_prod_clone` from the earlier rehearsal was **not** dropped — nothing depends on it, disk
is not short, and it stays available for inspection.
