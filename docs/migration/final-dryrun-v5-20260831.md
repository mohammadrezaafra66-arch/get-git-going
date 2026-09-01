# Final dry-run v5 — **PARTIAL**, 31 of 43 clean, halted on 391's probe block

Option A was applied: the four gates are gone and the set is **43 migrations, purely the Live Ledger
module**. The sweep came back cleaner than any previous run — the `ALTER DEFAULT PRIVILEGES` class
left with 393, and the body-reference class is closed.

The run halted on migration 391, and the cause is now fully characterised: **every hard-coded probe
account in 391, 392 and 402 is absent from production.** This is the same root cause I deferred once
for A0; measurement now shows it covers the whole probe block, not one assertion.

Run 2026-09-01. Production was **never contacted**; the live `afrakala` database was **not touched**;
no tracked migration file was edited.

```
$ hostname
VIRA-SERVICE
```

---

## 1. The four gates are removed — and what that defers

378, 379, 380 and 393 are out. The set is 43.

> **This DEFERS the anon exposure on production. It does not fix it.**
>
> Those doors are open on production **today**, and this migration set neither opens nor closes
> them. Measured on the clone, all four functions named by 393's C7 regression bar are anon-executable
> right now:
>
> | function | anon can execute | would be closed by |
> |---|---|---|
> | `find_duplicate_product` | yes | migration 389 |
> | `get_recent_purchase_label` | yes | migration 381 |
> | `get_recent_purchase_labels` | yes | migration 381 |
> | `calculate_adjusted_price` | yes | migration 390 |
>
> Closing them is a **separate security mission** that must run the whole 370–401 series in order —
> 24 migrations, several in fix-then-repair-the-gate pairs (381/382, 384/385, 386/387, 388/389).
> It is on the owner's list; it is not in this one.

## 2. Pre-flight sweep, re-derived for the 43-set

Not carried over — recomputed, because the composition changed.

| pattern | 47-set | **43-set** |
|---|---|---|
| **P1** `current_database()` guard | 11 | **11 — unchanged.** None of the four removed gates carried one: 337 338 339 341 342 344 345 346 347 391 392 |
| **P2** `ALTER DEFAULT PRIVILEGES` (executable) | 393 only | **zero** — the problem left with 393 |
| **P3** assertion vs data volume | 418, 410 | 418, 410 — both relaxed |
| **P4** hard-coded UUIDs | 391, 392, 402 | 391, 392, 402 — **this is what stopped the run**, see §4 |
| **P5** `current_user` / `session_user` | none | none |
| **P6** self-contained `BEGIN;`/`COMMIT;` | 402 | 402 |

### Body-reference sweep — the class execution cannot catch

Re-run against a fresh clone: every `INSERT INTO t (cols…)` and `UPDATE t SET col =` in all 43
files, checked against the clone's **2,563** live columns plus the **22 columns** and **3 tables**
the set creates.

```
columns the set adds: 22 | tables it creates: 3
findings: [('392', 'document_status_history', 'result')]
```

**That single hit is a false positive, confirmed by looking:** `result` appears only inside a
`RAISE EXCEPTION` message — `'392 FAILED D: … (result %)'` — never as a column. 392's two real
INSERTs use `(document_id, from_status, to_status, changed_by, note)`, all of which exist.

**Verdict: clean.** Every column every migration writes exists on production or is created by the
set. The CHECK-value half stays closed by 341 (`cheque_receivable`, `cheque_payable`, `settlement`
all permitted).

## 3. The run

Fresh clone `afrakala_prod_clone6`, restored and verified at **221 / 20 / 823 / 622**, named to
expose the guard.

```
291 ✅ 337 ✅ 338 ✅ 339 ✅ 341 ✅ 342 ✅ 344 ✅ 345 ✅ 346 ✅ 347 ✅ 348 ✅
349 ✅ 350 ✅ 351 ✅ 352 ✅ 353 ✅ 354 ✅ 355 ✅ 356 ✅ 357 ✅
359 ✅ 360 ✅ 361 ✅ 362 ✅ 363 ✅ 364 ✅ 365 ✅ 366 ✅ 367 ✅ 368 ✅ 369 ✅
391 🔴 FAILED
```

**31 of 43.** Every migration up to 391 applied without an unplanned adjustment, including all five
additions from v4.

## 4. Why it stopped

```
ERROR:  391 FAILED D: the probe row is invisible to admin (0), accountant (0) or manager (0).
        This migration must close the viewer and change nothing else; emptying the table for
        every role is a regression, not a fix.
```

**None of the probe accounts exists on production.** Measured directly:

| account | used as | roles on production |
|---|---|---|
| `05098088-…` | admin | **ABSENT** |
| `90c0479f-…` | accountant | **ABSENT** |
| `a0a4afe5-…` | manager | **ABSENT** |
| `20303d30-…` | viewer | **ABSENT** |
| `00ebe9d3-…` | sales | **ABSENT** |

All five are test-database identities. The same is true of all six in **392** and the sentinel in
**402**.

So D does not report a policy problem. It reports that it set a JWT for a user who does not exist,
read 0 rows, and concluded the table was empty for everyone.

### Why this is a halt and not a patch

I already deferred **A0** on exactly this ground, and the owner approved it. But A0 was one probe;
the measurement now shows the whole identity-dependent half of 391's self-test is unrunnable on
production. Widening an approved deferral from one assertion to a block is a scope change, and the
instruction for this run was to stop on failure rather than patch. So it stopped.

### The remedy is surgical, and worth stating precisely

391 carries **18** assertions. Classified by whether they need a probe account:

| label | what it checks | identity-dependent? |
|---|---|---|
| **A0** ×6 | preconditions — RLS enabled, table exists, probe user is viewer-only, receipts non-empty | **yes — defer** |
| **A** ×1 | the DROP took effect | no |
| **B** ×2 | no trigger still points at the dropped function; **`post_receipt_accounting` survives** | **no — keep** |
| **C** ×6 | the policy is RESTRICTIVE, FOR ALL, TO authenticated, with the house USING/WITH CHECK | **no — keep** |
| **D** ×3 | viewer reads 0; sales reads 0; **privileged roles still read** | 2 yes — defer; 1 no |

**B and C are the assertions that actually verify 391 did its job**, and neither needs an account.
The remedy is to defer only A0 and D's two identity-dependent lines — not the block, and certainly
not the migration.

**392 will need the same treatment** when the run reaches it: all six of its accounts are absent too.

## 5. RPC call test — not reached

The check you said matters most did not run. The set stopped at 391, twelve migrations short of 403,
which is the **last** definition of `create_receipt` and `create_payment`. Calling them now would
test a half-built module and prove nothing.

This remains outstanding and remains the single most valuable check, for exactly the reason v3
established: a set that applies cleanly can still ship functions that raise on first call.

## 6. End-state verification — not reached

Business data at the halt point, unchanged by the 31 migrations that did apply:

| | before | at halt |
|---|---|---|
| customers | 768 | 768 |
| products | 358 | 358 |
| sales_quotes | 170 | 170 |
| profiles | 36 | 36 |
| user_roles | 42 | 42 |
| accepted quotes | 151 | 151 |

The 12-object check and the 151/151 backfill are not verifiable until the run completes.

## 7. Not verified

- **Migrations 391 through 419** — twelve steps.
- **The four RPC calls** against real data.
- **The `accepted_at` backfill** in a clean pass.
- **A3** (391's `document_type` probe executing).
- **Anything about production.** Not contacted.

## 8. Unresolved

**One approval needed, narrow and precise:** defer 391's identity-dependent assertions (**A0** ×6
and **D**'s two) and 392's equivalents, on the measured ground that **none of the eleven hard-coded
probe accounts exists on production**. Keep 391's **B** and **C** intact — those are the assertions
that prove the migration worked, and they need no account.

Nothing else is outstanding. The sweep is clean, the guard list is confirmed at eleven, the
body-reference and CHECK-value classes are closed, and 31 migrations apply without complaint.

## 9. Where the five runs have got to

| | halted at | cause | class |
|---|---|---|---|
| v1 | step 1 | 337's guard | missing from a list |
| v2 | step 9 | 393's missing `FOR ROLE postgres` | per-grantor semantics |
| v3 | pre-flight | 341 omitted; six migrations silently broken | **invisible to execution** |
| v4 | 31 in | security gates without their 24 prerequisites | composition |
| **v5** | **31 in** | **391's probe accounts absent on production** | test-only identities |

Every cause has been a difference between the test database and production, and each run has found
one. This one is the last of the identity class — all eleven accounts are now enumerated and
measured, so there is no twelfth waiting.

---

`afrakala_prod_clone6` is left at 31 migrations for inspection. The live `afrakala` database was not
touched, and **production was never contacted**.
