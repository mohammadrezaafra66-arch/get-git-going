# Phase 3 — Gate A remediation — PROGRESS

Remediation of the six defects raised in `docs/execution/phase-3-GATE-A.md` (merged as `dc7fd8c2`):
**1 BLOCKER, 2 MAJOR, 3 MINOR.**

## HANDOFF STATE

```
Mission:              phase-3 Gate A remediation
Status:               complete
Branch:               feature/phase-3-gatea-remediation
Base:                 staging @ dc7fd8c2
Migrations applied:   356, 357, 358
REST restarted after: yes after each
Backup taken:         D:\AfraKalaBackups\pre-p3rem-20260819-013856.dump (16,881,212 bytes)
Typecheck:            70 / 70 baseline
Defects closed:       B1, M2, m1, and OG-20
With the owner:       M1 (OG-18 restated, deliberately not chosen)
Deferred with reason: m2 -> phase 6, m3 -> phase 6
Test data created:    NONE that persists — every probe ran inside BEGIN … ROLLBACK
Census:               before vs after differs by exactly +1 public function (357's trigger fn)
```

## Pre-flight

- [x] Backup taken before the first migration, path above
- [x] Rollback file written **before** each forward migration and proved with
      `docs/verification/rollback-dryrun.sql`
- [x] `docker restart afrakala-lan-rest` after each migration
- [x] Every object read from the live catalogue, never from repo files

---

## The owner's decision on B1, recorded in full

**Asked:** should the endorsement uniqueness rule keep excluding `rejected`, or become unconditional?

**Answered 2026-08-19 — option (a): UNCONDITIONAL. One cheque is consumed once.**

**The cost, stated plainly and not softened: until `reverse_document` exists, a mistaken endorsement
cannot be corrected. That cheque stays consumed.** Refusing a correction is strictly safer than
silently permitting a permanent double credit — Gate A reproduced one 300,000 cheque becoming
600,000 credited across two suppliers, with two immutable entries and no way back.

**The consequence that follows (not itself a decision):** OG-14 (`reverse_document`) was scheduled as
"must close before phase 9". Option (a) makes every endorsement error permanent in the meantime, so
**OG-14 becomes reachable-urgent the moment anyone uses this path.** `reverse_document` was **not**
built here — it is out of scope and needs its own dispatch. The changed urgency is recorded against
OG-14 in `00-progress.md`. The owner decides when it gets built.

Because the refusal is now permanent, migration 356 also extends the Persian message to say *why* it
cannot be undone, rather than leaving the user to guess. That is the only user-visible change beyond
the refusal itself.

---

## B1 — the endorsement uniqueness rule — **CLOSED**

### §H, both halves, answered before the change

**What writes `status='rejected'` to `payment_vouchers`?** Measured: **no SQL function does.** The
only two functions that write the table are `create_payment` and `pay_purchase_with_voucher`, and
both write `'approved'`. `'rejected'` is reachable only by a direct `UPDATE` through PostgREST under
`payment_vouchers_update_finance`, which grants `UPDATE` to `admin` and `accountant`. There is no UI
control for it today.

**What reads `endorsed_receipt_id`?** `create_payment` **only** — no view, no trigger, nothing in
`src/`.

**Rows that would block a stricter index** — asked because the index is becoming stricter, so an
existing violation would have prevented it being built:

```
SELECT endorsed_receipt_id, count(*) FROM payment_vouchers
 WHERE endorsed_receipt_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;   -> 0 rows
SELECT count(*) FROM payment_vouchers WHERE endorsed_receipt_id IS NOT NULL; -> 0
```

**Nothing to migrate over.** Recorded before applying, not after.

### What changed (migration 356)

Both halves moved together. Changing only the index would have left the constraint and the
Persian-message path disagreeing — the user would be refused by a raw unique-violation instead of a
sentence.

* `payment_vouchers_endorsed_receipt_unique_idx` → `WHERE endorsed_receipt_id IS NOT NULL`
  (the `AND status <> 'rejected'` is gone).
* `create_payment`'s `EXISTS` guard → the same predicate, and its message now explains permanence.

`create_payment` was replaced **in full, from the live definition** (`pg_get_functiondef`, CLAUDE.md
rule 6) with exactly that one edit applied, so what is deployed and what is reviewed are the same
text. Signature byte-identical → replaces rather than overloads (rule 5). ACL verified preserved:
`authenticated` and `service_role` only, no `anon`.

### Re-verified with Gate A's own probe

Gate A's sequence, re-run verbatim under an admin JWT inside `BEGIN … ROLLBACK`:

```
NOTICE:  endorsement 1: created
NOTICE:  voucher set to rejected
NOTICE:  endorsement 2: REFUSED  sqlstate=P0001
         msg=این چک قبلاً ظهرنویسی شده است و دوباره قابل استفاده نیست؛
             تا زمانی که امکان صدور سند برگشتی فراهم نشده، ظهرنویسی اشتباه قابل اصلاح نیست
NOTICE:  POSTED entries against this ONE cheque = 1  total credited = 300000
         (Gate A measured 2 and 600000)
```

| | Gate A measured | After 356 |
|---|---|---|
| Second endorsement | **succeeded** | **refused, `P0001`** |
| Posted entries against the cheque | **2** | **1** |
| Total credited to `cheque_receivable` | **600,000** | **300,000** |

**Reviewers**
- *Observer:* PASS — one edit, generated from live, not a re-authoring. The stale comment about the
  "partial UNIQUE index" was updated in the same place rather than left to mislead.
- *Software Engineer:* PASS — index and guard moved together; the index remains the real guarantee
  against a concurrent second endorsement the `EXISTS` cannot see.
- *Security Engineer:* PASS — ACL preserved and re-checked; no new grant; message leaks no identifier.
- *Lead:* accepted.

---

## OG-20 — the missing delete guard — **CLOSED**

Gate A pushed back on phase 3's deferral, and was right: this is migration 353's trigger with two
identifiers changed, and phase 3 opened the path that makes it reachable.

Migration 357 mirrors `trg_payment_receipts_block_delete_when_posted` exactly — same `BEFORE DELETE`
timing, same `FOR EACH ROW`, same `SET search_path`, same `ERRCODE`, same `RETURN OLD`, with
`source_type` changed to `'payment_voucher'` and the message to سند پرداخت.

### Verified with the M8 probe used on the receipt side

```
NOTICE:  voucher created with a posted entry: d765d1aa-…
NOTICE:  DELETE REFUSED  sqlstate=P0001
         msg=این سند پرداخت سند حسابداری ثبت‌شده دارد و حذف نمی‌شود؛ سند ثبت‌شده فقط با سند برگشتی اصلاح می‌شود
NOTICE:  orphaned voucher entries after the attempt = 0  (0 expected)
NOTICE:  receipt guard armed = O
```

### And the stress cleanup's ordering still passes

`phase-3-stress-cleanup.sql` deletes journal entries **before** vouchers. Re-proved with the new
guard live, following the script's exact sequence:

```
NOTICE:  entries deleted first (cleanup order)
NOTICE:  voucher DELETE succeeded -> cleanup ordering STILL WORKS with the 357 guard
```

Trigger firing order was checked too: PostgreSQL fires `BEFORE DELETE` triggers in name order, so
`trg_burn_payment_document_number` and `trg_cleanup_payment_attachments` run before the guard. That
is harmless — the guard `RAISE`s, which aborts the statement, so their effects roll back with it.
The same property already held for 353 on the receipt side.

**Reviewers** — *Observer:* PASS (deliberate mirror, no new pattern). *Software Engineer:* PASS
(refusal beats orphan; cleanup ordering re-proved). *Security Engineer:* PASS (no `SECURITY DEFINER`
needed — it reads `journal_entries`, which the deleting session can already see). *Lead:* accepted.

---

## M2 — the English identifier in a Persian message — **CLOSED**

### The obvious fix was tried first and does not exist

Phase-2 Gate A m3 recommended *"seed `asan_control_accounts` with a `label_fa` for every
`account_kind` in the CHECK, even where `accounting_code` stays NULL"*. **That cannot be done.**
Attempted, and the attempt failed loudly — recorded rather than quietly abandoned:

```
ERROR:  null value in column "accounting_code" of relation "asan_control_accounts"
        violates not-null constraint
```

Measured from the live catalogue afterwards:

```
asan_control_accounts_account_kind_check ::
  CHECK (account_kind = ANY (ARRAY['invoice_ar','clearing','other']))
accounting_code is_nullable = NO
```

So the table **cannot hold a row for `cheque_receivable` or `cheque_payable` at all**, and no row may
carry a NULL code. Following m3 literally would have required widening that CHECK and dropping a
`NOT NULL` on a configuration table whose purpose is to hold Asan codes — far larger than the message
defect warrants, and it would let a code-less row masquerade as configured. **The migration errored
and applied nothing;** `asan_control_accounts` still holds its one original row.

### What was done instead — message only

Migration 358 changes exactly one expression in `asan_list_journal_export`: the `aname` fallback.
`acode` is untouched, so **what the export blocks and how it classifies do not move** — that is phase
5's surface and D8's decision. A configured `label_fa` still wins; the raw identifier remains the
last resort on purpose, so a future unnamed `account_kind` still surfaces visibly.

Body generated from the live definition with that one edit; signature unchanged.

### Re-verified with Gate A's probe

```
 case           | doc_kind     | blocked_reason                                   | party_name
 cheque payment | unclassified | کد حساب آسان برای «چک‌های پرداختنی» ثبت نشده است | تأمین‌کنندهٔ آزمایشی 4

 STILL BLOCKED? (must be yes - blocking unchanged) | blocked = t | doc_kind = unclassified
 contains the English identifier?                  | leaks_english = f
```

Gate A measured `کد حساب آسان برای «cheque_payable» ثبت نشده است`. The identifier is gone; the
blocking and the classification are byte-identical.

**Reviewers** — *Observer:* PASS (one expression; the failed seed attempt is recorded in the header
so the next author does not retry it). *Software Engineer:* PASS (blocking provably unchanged).
*Security Engineer:* PASS (`SECURITY DEFINER` + `search_path` preserved; role gate untouched).
*Lead:* accepted.

---

## M1 — a cheque payment reduces the displayed bank balance — **WITH THE OWNER (OG-18)**

**Not chosen, as instructed.** OG-18 is restated below with Gate A's evidence attached.

`vw_account_balances`'s outflow CTE and `get_account_ledger` both sum `payment_vouchers.amount`
filtered on `status='approved'` with **no `document_channel` predicate**, so a cheque payment moves
`total_out` although the ledger entry has no `bank` line at all.

**Gate A's reproduction, attached:**

```
BEFORE        | out_count = 0 | total_out = 0
(create a 900,000 own-cheque payment)
AFTER cheque  | out_count = 1 | total_out = 900000

the entry's lines:  supplier_payable 900000 / 0
                    cheque_payable        0 / 900000     <-- no bank line exists
```

The **ledger is correct**; the two cash views are wrong about the same document. Pre-existing —
`pay_purchase_with_voucher` can already write a cheque voucher — but reachable through a supported
path since phase 3.

**Phase 6 will render both views.** The options mean different things to an accountant:

- **(a)** exclude cheques from both readers — the direct mirror of what migration 350 did on the
  receipt side;
- **(b)** relabel the figure as *committed* rather than *available*.

**The owner's call. Nothing was changed here.**

---

## The three MINORs

### m1 — the reader table was presented as complete and was not — **CLOSED**

Gate A found `validate_journal_entry_balance` (a helper, not a trigger — 0 triggers reference it),
`polymorphic_ref_orphan_report`, and the view `v_promotion_suggestions` missing from phase 3's
five-row table. All three are benign for rows shaped the way `create_payment` shapes them — the
balance helper returns `is_balanced = t` — so nothing broke. The defect was the **claim of
completeness**.

Closed by recording the **enumeration query itself**, so the next phase's table is reproducible and
its completeness checkable rather than asserted:

```sql
-- functions
SELECT v.tbl, p.proname,
       (p.prosrc ~ ('INSERT INTO (public\.)?'||v.tbl)) AS writes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN (VALUES ('payment_vouchers'),('journal_entries'),('journal_lines'),
                     ('audit_logs'),('document_numbers')) v(tbl)
 WHERE n.nspname = 'public' AND p.prosrc ~ ('\m'||v.tbl||'\M')
 ORDER BY v.tbl, p.proname;

-- views
SELECT v.tbl, c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN (VALUES (…same list…)) v(tbl)
 WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
   AND pg_get_viewdef(c.oid) ~ ('\m'||v.tbl||'\M');
```

**Rule for the phases that follow: paste the query and its output, not a curated list.**

### m2 — every bank payment renders as "سایر" — **DEFERRED to phase 6, with the reason**

`document_channel` is `NOT NULL` and its CHECK has no `bank` value, so C7 stores `other`;
`CHANNEL_FA` maps `other → "سایر"`, so a real bank transfer is labelled *Other* in the treasury list
and the account ledger.

**Not fixed, deliberately.** The three candidate fixes each require a decision this mission has no
authority to make: pick a default sub-channel (`paya`? `satna`? — they are not interchangeable and
the wrong one is worse than "سایر"), widen the CHECK to admit `bank` (a schema change to satisfy a
label), or have the wizard collect it. **The third is what C7 anticipated and what phase 6 already
owns.** Recorded here and in the defect table so it is carried, not lost.

### m3 — `new_balance` returns negative from a public RPC — **DEFERRED to phase 6, with the reason**

Gate A agreed the value should stay honest and not be clamped, since clamping would hide OG-19. Its
recommendation was to *name the field for what it is* and have phase 6 suppress or annotate it.

**Renaming is not available cheaply:** a `RETURNS TABLE` column name is part of the function's result
type, so changing it requires `DROP FUNCTION` + `CREATE`, which breaks the "replace, never overload"
property this mission worked to preserve and would need its own rollback story — a large change for a
label. The value is already documented in `rpc-contracts.md` §2 as a ledger position in the recorded
convention, negative while no purchase has ever been credited.

**Carried to phase 6**, which owns rendering, with the note that the contract is not what the user
reads. It closes properly when OG-19 is answered.

---

## Defect-by-defect status — all six

| # | Sev | Defect | Status | Evidence / reason |
|---|---|---|---|---|
| **B1** | BLOCKER | Reject-and-re-endorse credits a cheque twice, permanently | **CLOSED** | Migration 356. Gate A's probe re-run: second endorsement **refused** `P0001`; posted entries against the cheque **1, not 2**; credited **300,000, not 600,000**. Owner decision (a); the accepted cost is recorded above. |
| **M1** | MAJOR | Cheque payment reduces the displayed bank balance | **WITH THE OWNER — OG-18** | Not chosen, as instructed. Restated above with Gate A's reproduction attached (`total_out` 0 → 900,000 with no bank line). Phase 6 renders both views. |
| **M2** | MAJOR | Raw English `account_kind` in a Persian message | **CLOSED** | Migration 358. `کد حساب آسان برای «چک‌های پرداختنی» ثبت نشده است`; `leaks_english = f`; blocking and classification unchanged (`blocked = t`, `doc_kind = unclassified`). The seed approach phase-2 m3 recommended was tried and is impossible — recorded. |
| **m1** | MINOR | Reader table claimed complete, was not | **CLOSED** | The enumeration query is now recorded in place of a curated list. The three missing readers were verified benign. |
| **m2** | MINOR | Bank payment renders as "سایر" | **DEFERRED — phase 6** | Every fix needs a decision this mission cannot make; the wizard collecting the sub-channel is what C7 anticipated and phase 6 owns. |
| **m3** | MINOR | `new_balance` negative from a public RPC | **DEFERRED — phase 6** | Renaming a `RETURNS TABLE` column requires `DROP FUNCTION` + `CREATE`. The value must stay honest (it is the OG-19 symptom); phase 6 owns rendering. Closes when OG-19 is answered. |
| — | — | **OG-20** (Gate A said it should not have been deferred) | **CLOSED** | Migration 357. `DELETE REFUSED  P0001`; orphaned entries **0**; cleanup ordering re-proved. |

**Totals: 4 closed (B1, M2, m1, OG-20), 1 with the owner (M1 → OG-18), 2 deferred with reasons.**

---

## Observation recorded, not fixed

While reading `asan_list_journal_export` for M2 I noticed its payment-voucher label resolves the
payee from `suppliers`, `external_parties` and `payee_name` — **but not `payee_customer_id`**. Phase
3 introduced customer payees, so a payment to a customer would render as `پرداخت به «؟»`.

**Not fixed:** this mission's M2 scope is the `account_kind` leak, and changing the document label is
a different edit to a phase-5 surface I was told not to widen. Recorded here so it is not lost. It is
cheap and belongs with whoever answers OG-18, since they will be in this function anyway.

---

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **70** — the D14 baseline, unchanged. No TypeScript touched. |
| `npm run build` / `npm run lint` | **NOT RUN.** No application code changed; every file is `.sql` or `.md`. Recorded as not run, not as passed. |
| tests | **There is no test script in this project.** Behaviour verified by invoking the real objects under simulated JWTs inside `BEGIN … ROLLBACK`. |
| Rollback files | 356-down, 357-down, 358-down each written before its forward migration and proved through the M7 harness. |

### Test data

**None persists.** Every probe ran inside `BEGIN … ROLLBACK`. Census before and after the whole
mission differs by exactly one line:

```
15c15
< public_functions|836
---
> public_functions|837        <-- tg_payment_vouchers_block_delete_when_posted, migration 357
```

`payment_vouchers` 0, `journal_entries` 1, `journal_lines` 2, `document_numbers` 102 with 0 live,
`audit_logs` 43418, `asan_control_accounts` 1 — all unchanged. Phase 2 left 50 rows in the
accountant's live export; phase 3 did not repeat it, and neither did this.

## Self-Host Acceptance Check

No CDN, no online font, no external API, no non-self-hostable service. Three SQL migrations against
the project's own Postgres and Markdown. Nothing added to `package.json`. No secret in any committed
file; the database password is read from the untracked `deploy/lan/.env.lan` and never printed.

## Remaining manual steps

1. **Answer OG-18** (M1). Blocks nothing today; phase 6 renders both views.
2. **Decide when `reverse_document` (OG-14) is built.** Its urgency changed — see below.
3. **Web image rebuild.** `APP_GIT_SHA` still trails HEAD. `deploy/lan/build.ps1` refuses an unclean
   tree and this shared checkout holds untracked files from other missions; forcing would stamp a
   SHA onto an image containing uncommitted work. This mission changed only SQL and Markdown, so
   nothing in it reaches the web bundle, and PostgREST was restarted after every migration.
4. **m2 and m3** carried to phase 6, with reasons above.
