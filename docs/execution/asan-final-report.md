# ASAN BRIDGE — FINAL REPORT

For Mohammad Reza Afra. Written at the end of the five-mission program
(`docs/execution/ASAN_MISSION_CONTROL.md`), after M5.2's verification pass.

**The short version.** Your accountant can now select a date range, untick what she does not
want, and download an Excel file that Asan imports directly. Five exports exist, plus two
secondary paths. Every amount is written in **Rial** (AfraKala Toman × 10) and the page says so
on screen. Every document that *cannot* be exported is **shown with the reason in Persian**
rather than silently dropped.

**The one number that matters most.** Almost every purchase document is blocked, and when I looked
at *why*, the answer was not what I expected and is worth your attention: **281 of your 289 real
purchases have no supplier recorded at all.** Only 8 have one. So giving your 15 suppliers Asan
codes unblocks **8** documents, not 289 — the rest need a supplier assigned first, which is a data
problem in AfraKala rather than an Asan one. Section 7 has the breakdown.

---

## 1. WHAT WAS DELIVERED

### M1 — housekeeping

| phase | what was built | commit | verification |
|---|---|---|---|
| 1.1 | repaired every recoverable corrupted Persian value (migration 279) | `39125211` | 702 findings scanned, 687 repaired; re-scan leaves only the 15 unrecoverable |
| 1.2 | removed the legacy capital-allocation path (migration 280) | `e9e53483` | 2 empty tables, 8 functions, 5 policies gone; drift report 0 rows |
| 1.3 | restricted the `viewer` role at the database (migration 281) | `5341df3a` | viewer-readable relations 58 → 28; spec 40/40 green |
| 1.4 | cleaned the repository | `cdc172be` | tree clean; typecheck still exactly 70 |
| 1.5 | deploy scripts refuse a dirty tree | `bf49fc7f` | 7 cases tested with docker stubbed |
| 1.6 | emergency admin returned to dormant (migration 282) | `0dcf78e9` | spec 4/4 green |
| **gate** | | `011f0fce` | typecheck 70, e2e **202/5/4**, no new red |

### M2 — research (read-only)

`docs/asan/research-asan-bridge.md`, 1 067 lines, R1–R8 each with findings, unknowns and
build implications — commit `ac1040a6`. It changed the build in four places that mattered, all
recorded in section 3 below.

### M3 — foundation

| phase | what was built | commit | verification |
|---|---|---|---|
| 3.0 | the Asan layout specification | `a1ba226d` | 4 layouts VERIFIED, 8 open items recorded |
| 3.1 | Asan code fields on person, product, bank account (283) | `2a9f47c0` | 11 person + 3 product codes backfilled |
| 3.2 | canonical phone storage + collision queue (284) | `5c4c0a12` | 9 triggers; exactly the 3 predicted collisions; spec 9/9 |
| 3.3 | staged Asan person import (285) + its workbench | `aab2c158`, `41225d80` | `e2e/asan/` **21/21** on the deployed build |
| 3.4 | staged Asan product import (286) | `da6a6f60` | spec **8/8** on the real 7 256-row export; **no product created**, asserted at the table |
| fix | 287 — register the new FK with `person_merge` | `8b48c4b2` | `e2e/persons` back to 36/1 |
| **gate** | | `c0d5b7b9` | e2e **231/5/4**, zero new red |

### O1–O4 — your answers, executed as their own phases

| phase | what | commit |
|---|---|---|
| O1 | Bank Mellat's Asan code is `8` (288) | `abdb2c6a` |
| O2 | the Asan product code became a real form field (289) | `004477bd` |
| O3 | `UNVERIFIED-LAYOUTS.md` refreshed against your answers | `8b4310e7` |
| O4 | the receivables control account is `989` (297) | `3a1d8815` |

### M4 — the exports (the mission the program exists for)

| phase | what was built | commit | verification |
|---|---|---|---|
| 4.1 | stable Asan document numbering (290) | `e3c98846` | spec **8/8** |
| 4.2 | the shared export shell, `/admin/asan-export` (291) | `960abd2f` | spec **30/30** |
| 4.3 | export 1 — sales invoices (292) | `812dff79` | spec **20/20**, file read back with openpyxl |
| 4.4 | export 2 — purchase invoices (293) | `5d8849d3` | spec **14/14**, sales still 20/20 |
| 4.5 | the shared accounting-document builder (294) | `a7c5a983` | spec **13/13** |
| 4.6 | exports 3, 4 and 5 over that builder | `626e68c3` | spec **9/9** |
| 4.7 | secondary bank-deposit export (295) | `5d02a328` | spec **8/8** |
| 4.8 | single pre-invoice export from its detail page | `ff0b942d` | spec **6/6**, byte-identical to a range export |
| **gate** | | `66118fc6` | typecheck 70, e2e **343/6/4**, zero new red |

### M5 — video chain, verification, report

| phase | what was built | commit | verification |
|---|---|---|---|
| 5.1 | the product video chain (296) | `c84bfd9b` | spec **13/13** |
| 5.2 | the full-program verification pass, as standing assertions | `f328dea3` | spec **12/12**; four sample files committed |
| — | marketing-spec isolation fix + the two missing down scripts | `d157d471` | 8/8 green; see section 8 |
| 5.3 | this report | — | — |

---

## 2. DATABASE CHANGES

Nineteen migrations, 279 through 297. **Every one has a matching down script** in
`docs/verification/`.

| # | subject | down script |
|---|---|---|
| 279 | repair corrupted Persian values | `279-down.sql` |
| 280 | remove the legacy capital-allocation path | `280-down.sql` |
| 281 | restrict the `viewer` role | `281-down.sql` |
| 282 | emergency admin dormant | `282-down.sql` |
| 283 | Asan code fields (person / product / bank account) | `283-down.sql` |
| 284 | phone normalization + collision queue | `284-down.sql` ⚠️ *written during M5.2* |
| 285 | staged Asan person import | `285-down.sql` ⚠️ *written during M5.2* |
| 286 | staged Asan product import | `286-down.sql` |
| 287 | register the new FK with `person_merge` | `287-down.sql` |
| 288 | Bank Mellat code `8` | `288-down.sql` |
| 289 | normalise `products.accounting_code` in a trigger | `289-down.sql` |
| 290 | Asan document numbering | `290-down.sql` |
| 291 | export module permissions + batch numbering | `291-down.sql` |
| 292 | sales export source | `292-down.sql` |
| 293 | purchase export source + one canonical row shape | `293-down.sql` |
| 294 | accounting-document export source | `294-down.sql` |
| 295 | bank-deposit export source | `295-down.sql` |
| 296 | product video chain | `296-down.sql` |
| 297 | `invoice_ar` = `989` | `297-down.sql` |

**One ordering note, for honesty.** On this server 297 was applied *before* 296, because 296 was
held back while the M4 gate was recorded. A fresh install applies them in filename order, 296 then
297, and the result is identical: they touch disjoint objects (296 the video chain, 297 the
journal export source and a new control-account table). Nothing depends on the order, but the
report should say what actually happened rather than imply a tidy sequence.

**Two of those down scripts did not exist until M5.2 found them missing** — 284 and 285. I am
flagging that rather than presenting nineteen-out-of-nineteen as if it had always been true. Both
now exist, and both carry an explicit note about what they do **not** undo: 284 cannot
un-normalise phone values it rewrote (it rewrote 0 on this database), and 285 cannot un-write
persons a committed import created. 285 also warns that `287-down.sql` must run **first**, or
`person_merge` starts failing on every merge — the exact regression 287 fixed, in reverse.

---

## 3. DECISIONS I MADE AUTONOMOUSLY

You said you read this section most carefully, so it is not compressed.

### 3.1 The exportable set for sales invoices — and the disagreement I chased down

**Decision.** A sales quote exports only when it is `status='accepted'` **and**
`accounting_registered_at IS NOT NULL` **and** a `stock_movements` row with
`ref_type='sale_quote_confirm'` exists for it.

**Why, from the data rather than from the brief.** You told me not to assume `accepted`. So:
`trg_sales_quotes_stock_out` fires on the transition *to* `accepted` and writes the movement row,
which makes `accepted` the stock-deducting status by construction and the movement row the
material evidence. `accounting_registered_at` is your accountant's own tick, and it is the only
accountant-operated flag on the table — **but on its own it means nothing**: 32 of your 50 quotes
carry it while still in `draft`. It is a finalization signal only together with `accepted`, which
is exactly why you asked for both.

**The disagreement, and what it turned out to be.** Three of your four accepted quotes have no
stock movement. That is **history, not a bug**: SQ-2026-000003/4/5 were accepted on 2026-07-21 and
07-23, *before* migration 210 created the stock-out trigger on 07-26. SQ-2026-000024 was accepted
on 07-28 and is the only one carrying a movement. Confirmed against `audit_logs`, not inferred
from `updated_at` — all four were touched again on 08-01, so `updated_at` would have misled me.

**Rejected:** exporting all four anyway (it would post invoices to Asan whose stock never moved),
and silently listing only the one (a set that shrinks from four to one with no explanation is how
an invoice goes missing). The three are **listed and blocked with that exact reason**.

### 3.2 The receivables code lives in a table, not in the function

**Decision.** `989` is stored in a new `asan_control_accounts` table; migration 297's gate
*refuses to apply* if `'989'` appears in the function body.

**Why.** It is configuration you gave me, exactly like Mellat's `8` — and Mellat's lives in
`bank_accounts.accounting_code`, where you can see and change it. Burying `989` in a function body
would make the single number you are most likely to correct the hardest one to find, and would
need a migration to change. **Rejected:** the literal, for that reason. The indirection weakens
nothing: a kind with no row still resolves to NULL and still blocks its document, which is why
`clearing` and `other` deliberately have no row and the gate asserts they have none.

### 3.3 One row builder per layout, never one per export

**Decision.** Sales and purchase share `buildInvoiceRows`; receipts, payments and دوبل share
`buildJournalRows`; the single pre-invoice export reuses the sales source and builder unchanged.

**Why.** The two invoice tabs are the *same eighteen columns* and differ in three header texts;
the three accounting-document exports are the *same six columns* and differ only in which
documents they select. A second mapper for identical columns is how two files drift until only one
is right. To make that structural rather than aspirational, migration 293 **renames migration
292's output columns** so both sources expose one shape, and its gate compares `proargnames` of
both functions and refuses to apply if they differ.

**Rejected:** three tidy per-export mappers. They read better and would have rotted.

### 3.4 A blocked document is shown, never dropped, and never fatal

**Decision.** `splitForExport` returns three lists — exportable, blocked, skipped — and the page
shows all three. A blocked document appears with its Persian reason and is excluded from the file.

**Why.** Silently dropping it leaves your accountant believing an invoice was exported. Failing the
whole export leaves her unable to export the other forty-nine. **Rejected** both.

### 3.5 The export rules live in the database, not in the page

**Decision.** Every "what is exportable" question is answered by a `SECURITY DEFINER` function,
and each **refuses loudly** rather than returning zero rows to a caller who lacks the role.

**Why.** Rule 2.5: a rule that lives only in application code is bypassed by a direct PostgREST
call, and RLS on SELECT never errors — it returns zero rows, which upstream reads as "there is
nothing to export". That is the worst possible answer here.

### 3.6 Zero is an empty cell, not a `0`

**Decision.** An amount of zero is written as an **empty cell** in every layout.

**Why.** "No discount" and "a discount of zero" are the same fact, and Asan's
`بدون مبلغ حذف شود` drops zero-amount rows on import anyway — so writing `0` where we mean "not
applicable" changes what Asan imports. On the accounting document it also means our file and
Asan's import agree about which rows exist, so the balance holds on both sides.

### 3.7 A fractional Toman amount blocks its document instead of rounding

**Decision.** `tomanToRial` refuses a fractional value; the purchase source blocks any document
containing one.

**Why.** Rounding money silently is worse than refusing. On `sales_quotes` the refusal costs
nothing — zero rows are fractional. On `purchases` **two rows are** (24 999 999.99 and 24.95), and
without the block those two would throw and take the whole export down with them: one bad row
costing your accountant every other invoice.

### 3.8 The video task goes to the `sales` queue

**Decision.** `assigned_queue = 'sales'`.

**Why.** You said to assign it to whoever owns the physical delivery step, and to fall back to the
delivery-receipt owner if that is genuinely ambiguous. It **is** ambiguous — `delivery_receipts`
holds 0 rows, so no history can be read. What is established is that the bucket's INSERT policy
already grants admin / manager / **sales**. Adding a new uploading role would widen access with no
evidence for it. **If store or shipping staff actually film the TV, this is one value plus one
policy to change.**

### 3.9 The video chain extends three existing systems rather than adding a fourth

**Decision.** "Video" is a **data row** in the migration-276 service model; the work item is an
ordinary `tasks` row; the notification is a `notification_events` row.

**Why.** All three already existed. `tasks.proof_requirement` *already allowed* `product_video`
and `tasks` held 0 rows — the capability was modelled and never wired, in the very table mission
control section 3 names as its example. And because the service model is keyed by category rather
than hard-coded to `slug='tv'`, adding a second category later is an INSERT.

### 3.10 The upload goes through `create_delivery_receipt`, not around it

**Decision.** `product_video_mark_uploaded` calls the existing RPC; migration 296 patches that
RPC's type whitelist from its **live** definition to admit `product_video`.

**Why.** My first draft wrote its own INSERT. It failed outright (`review_deadline` is NOT NULL
with no default), but the real problem was deeper: `create_delivery_receipt` reads the review timer
out of `workflow_settings`, computes the deadline, **and writes the
`delivery_receipt_status_history` row**. A raw INSERT would have silently produced receipts with no
history. Patching rather than retyping follows rule 2.3 — the function carries Persian messages,
the anchor is asserted to match exactly once, and the `?` count is compared before and after.

### 3.11 Events are stamped with `clock_timestamp()`, not `now()`

**Decision.** `product_video_chain_events.created_at DEFAULT clock_timestamp()`.

**Why.** `now()` is the *transaction* timestamp, identical for every row written in one
transaction — and two of this chain's transitions routinely land in one. Ordered by `now()` they
tie, and the history reads back in an arbitrary order; the phase test saw exactly that. A chain
whose whole purpose is "each transition is recorded, not inferred" must be able to say what order
things happened in.

### 3.12 Where the research beat the brief

Four places, all recorded at the time:

- The brief calls **barcode** "the strongest match key". R1.5 measured it as **0 % populated on
  both sides**, so it is not a strategy that can be tried and found wanting — matching is by Asan
  code, then normalized name, then unmatched.
- The brief names a table **`mandatory_category_services`** that does not exist; migration 276
  created three differently-named tables. Anything written against the brief's name would have
  failed at once.
- The brief says "I have 374 products"; the live count is **355**.
- The research proposed `3064` as Bank Mellat's code — a good inference from a real row in
  `اشخاص.xlsx`. **You said `8`.** Migration 288 records that explicitly so a later session does not
  "correct" your number back to the guess.

---

## 4. WHAT NEEDS YOUR VERIFICATION AGAINST LIVE ASAN

### Safe to use today

| export | status |
|---|---|
| **1 — sales invoices (فروش)** | layout VERIFIED against your screenshots and reproduced character for character. Safe. |
| **2 — purchase invoices (خرید)** | layout VERIFIED. Safe. Blocked today only for missing supplier codes. |
| **3/4/5 — accounting document** | layout VERIFIED. Safe now that `invoice_ar` is `989`. |
| **secondary — واریزیهای بانکی** | Layout 4 VERIFIED, Latin headers reproduced verbatim. Safe. |

All four sample files are committed at **`docs/verification/m5-export-samples/`** — open them and
compare against your Asan import dialog before the first real import. That is the one check I
cannot do for you.

### Still open — the full contents of `docs/asan/UNVERIFIED-LAYOUTS.md`

**Blocking (2):**

1. **`other` account** — what it means and its Asan `کد حساب`. Until then a document containing an
   `other` line is blocked with that reason named.
2. **External-party Asan codes** — per party, for real دوبل documents. The export **names the
   party** in the preview when it blocks, so you will see exactly whose code to supply.

**Not blocking, recorded for completeness:**

3. **Six uncaptured radio options** on `ورود اطلاعات از Excel` — you confirmed these stay unbuilt.
   *Nothing needed.*
4. **The account called "12"** — reserved to you. *Nothing needed until you choose.*
5. **`عوارض`** — AfraKala records no duty or tax anywhere, so the column stays empty. Making it
   real would need a new field on the pre-invoice first: a feature, not an export question.
6. **`گروه حساب/کد۲`** — no AfraKala counterpart; stays empty.
7. **How a purchase was paid** — `پرداخت نقد` / `پرداخت از بانک` / `پرداخت چک` stay empty because
   **nothing in AfraKala records it**: `payment_receipt_links` has no purchase column,
   `purchase_receipts` holds images, and `paid_at` is NULL on all 289 purchases. Capturing it would
   be a new field or link table.

**Resolved by you during the program, recorded so nobody re-opens them:** the currency unit
(Rial, ×10), Bank Mellat `8`, sales column K (empty), the finalized-quote definition, the
product-code strategy, `invoice_ar` = `989`, and `سریال کد کالا` (intentionally empty — your SKU
must **not** go there).

---

## 5. WHAT I NEED YOU TO SUPPLY

| # | what | where it shows up | consequence today |
|---|---|---|---|
| 1 | **Asan codes for your suppliers** | purchase export preview | **the single biggest unblock available** — see the numbers in section 7 |
| 2 | the `other` account definition + code | accounting-document preview | those documents blocked |
| 3 | external-party Asan codes, per party | دوبل preview, party named | those documents blocked |
| 4 | the 15 bucket-C corrupted labels | `docs/asan/corrupted-labels-scan.md` | 14 are in a backup table; **1 is a live `journal_entries.description`** and I refused to invent financial wording |
| 5 | the real title for the supplier called **"12"** | — | reserved to you |
| 6 | the two person matches from Phase 4 | — | reserved to you (mission control §6) |
| 7 | **3 phone collisions** in the review queue | `/admin/phone-collisions` | exactly the three R2.4 predicted; a human decides each |
| 8 | import conflicts, when you run an import | `/admin/asan-import` | none staged today |

Items already resolved and needing nothing further: the currency unit, the Bank Mellat code.

---

## 6. MODEL GAPS

Recorded rather than invented, per your instruction.

### `clearing` has no Asan counterpart

You said: *"There is no clearing/suspense account in Asan."* Your real-world flow is a **cash
receipt and a cash payment recorded in the same moment**, not a suspense line. So `clearing` is
never mapped and never emitted. A journal entry containing a `clearing` line is blocked with that
sentence as its reason.

**The gap:** AfraKala's data model *can* record the receipt and the payment as two separate
journal lines, so your flow is representable — but nothing in the model links them as a pair, and
nothing converts an existing `clearing` line into that pair automatically. Today there are **zero**
`clearing` lines, so nothing is stuck. If you start using them, converting them is a data question
I would need your rules for.

### The دوبل case — money owed to A landing in B's account

Your example: you took money from Khan-Mohammadi and paid Shahmoradi, but the money went into
**Sahar Shahmoradi's** account — someone you know only by name and account number.

**What works:** `external_parties` is exactly the right shape for that intermediary, the
accounting document places her Asan code in column A, and the export is proven end to end — a
دوبل entry blocks while she has no code, **naming her**, and exports correctly the moment one
exists.

**The gap:** the model records *that* an external party is on the entry. It does **not** record the
relationship "the money owed to Mokhtar Shahmoradi landed in Sahar Shahmoradi's account" as a
link between the two parties. Today that lives in the line's free-text `شرح`. Making it
structural would mean a "paid on behalf of" reference on the journal line — a schema change I did
not make unilaterally.

---

## 7. COVERAGE — HOW MUCH MANUAL TYPING THIS ACTUALLY REMOVES

All measured on the live database after the final regression run, not projected.

### Who and what has an Asan code

| thing | total | has an Asan code | gap |
|---|---:|---:|---|
| persons | 70 | **11** | the 11 are your customers; the rest are staff and others who never appear on an Asan document |
| customers | 14 | **11** | 3 customers have no code |
| **suppliers** | **15** | **0** | ← nothing can be exported for any of them |
| products | 355 | **3** | and this **does not block anything** — Asan mints a code under group 101 |
| bank accounts | 1 | **1** | Mellat = `8` |
| external parties | 1 | **0** | blocks only the دوبل documents that use it |
| control accounts | — | `invoice_ar` = `989` | `other` still undefined |

### What is exportable today, and what is blocking the rest

| export | documents in range | exportable | blocked |
|---|---:|---:|---:|
| 1 — sales invoices | 4 | **1** | 3 |
| 2 — purchase invoices | 331 | **0** | 331 |
| 3/4/5 — accounting documents | 1 | **1** | 0 |
| secondary — bank deposits | 1 | **1** | 0 |

**Why the 3 sales invoices are blocked** — exactly two reasons, both explainable:

- **2** were accepted before the stock-deduction trigger existed (2026-07-21 and 07-23, trigger
  created 07-26), so no stock movement was ever written for them and none ever will be.
- **1** has not been ticked «ثبت شد در حسابداری» by the accountant.

**Why the purchase invoices are blocked** — and this is the finding worth acting on:

| reason | documents |
|---|---:|
| **the purchase has no supplier at all** («؟») | **323** |
| supplier «صباح روشناس» has no Asan code | 4 |
| supplier «مختارشاهمرادی» has no Asan code | 2 |
| supplier «احسان بختیاری» has no Asan code | 1 |
| supplier «محمدرضا افرا» has no Asan code | 1 |

**So giving your suppliers Asan codes unblocks 8 documents, not 331.** The other 323 have no
supplier recorded, and no Asan code can help a document that does not say who it was bought from.
That is a data-entry gap inside AfraKala, and it is the single largest thing standing between you
and an automated purchase register.

⚠️ **A caveat on the 331.** Your real purchase count is **289**; the extra **84** were created
today by the pre-existing purchase e2e suite across two full-suite runs, and all 84 carry a test
marker in `notes`. I did **not** delete them: removing purchases would cascade into stock
movements and inventory, they are not this program's fixtures, and that clean-up is a decision for
you rather than a side effect of my report. Of your **289 real** purchases, **8** have a supplier
and **281** do not.

### The honest bottom line on manual typing removed

Today the exports would save your accountant re-typing **3 documents** (1 sales invoice, 1
accounting document, 1 bank deposit) — because that is genuinely all your data currently supports.
The machinery is built and proven for all five types; what limits it is missing identity data, and
every missing piece is named on screen in Persian. The order of value:

1. **assign suppliers to purchases** → unlocks up to 281 documents
2. **give the 15 suppliers Asan codes** → unlocks 8 immediately, and all 281 once step 1 is done
3. tick «ثبت شد در حسابداری» on finalized quotes → unlocks sales invoices as they are finalized
4. give the 3 remaining customers Asan codes
5. products need nothing — a missing product code never blocks an export

### Still waiting on you

| item | count |
|---|---:|
| phone collisions to resolve | **3** |
| staged import batches awaiting confirmation | 0 |
| Asan document numbers minted so far | **0** — nothing has been exported for real yet |
| product-video chains open | 0 |

---

## 8. BASELINE STATE

| measure | at program start | now | delta |
|---|---|---|---|
| `npm run typecheck` | 70 errors | **70 errors** | **0** — the baseline was never raised |
| full e2e | 155 green / 6 red / 4 skip | **369 green / 6 red / 4 skip** | **+214 green**, reds unchanged |
| total tests | 165 | **379** | **+214** |
| migrations | up to 278 | up to **297** | **+19**, all with down scripts |

### Every red in the final run, classified

| spec | classification |
|---|---|
| `business-flows/212-quote-credit-guard` | **documented baseline** |
| `business-flows/213-dynamic-customer-credit-scoring` | **documented baseline** |
| `business-flows/214-whatsapp-market-purchase-advisor` | **documented baseline** |
| `business-flows/215-quote-inventory-finalization` | **documented flaky** — it passed at the M3 and M5 interim runs and failed here |
| `persons/credit-uses-person` | **documented baseline** |
| `purchase/c5-permissions` E2E-9 | **documented baseline** — investigated in M1 and shown to fail for a reason that predates this program |

**Zero new reds.** Test arithmetic: 353 at the M4 gate, **+1** (O4 split the journal blocking test
in two and added the `989` assertion), **+13** (M5.1), **+12** (M5.2) = **379**, and
369 + 6 + 4 = 379. ✔

### ⛔ The one moment the gate did not pass, and what it was

The first M5 gate run came back **364 / 11 / 4** — six new reds, all in
`e2e/marketing/recurring-tasks.spec.ts`. I chased it rather than re-running until it was green.

The spec asserted **absolute** values on two **global** counters (`generated === 1`,
`skipped_existing === 1`). The generation job runs for *every* active template, so those absolutes
were only ever true because `marketing_task_templates` held zero rows when the spec was written.
**You configured a real template today at 12:52 UTC and changed its assignee a minute later** — and
from that moment the job legitimately accounted for two templates. Everything after the first
assertion failed as collateral, because Playwright re-runs `beforeAll` after a failure and this
spec's `beforeAll` deletes its own fixture.

What made it conclusive rather than a guess: the leftover tasks reference **your** template, not
the spec's; the two same-day tasks have **different assignees**, which is exactly what editing the
template produces and which the `(reference_id, due_date, assigned_to)` unique index correctly
permits; and **no `product_video` task exists at all**, so migration 296's trigger is not involved.

The fix is test-only — assert the spec's own template exactly, require the global counter merely to
be consistent. **I did not delete your template or its tasks.** They are live configuration and a
real person's assigned work.

### Deployment

| signal | value |
|---|---|
| `APP_GIT_SHA` | matches `HEAD` |
| `APP_BUILD_TIME` | stamped at the final build |
| working tree | clean |
| PostgREST | restarted after every migration |

---

## 9. WHAT ONLY A HUMAN CAN DO — REMAINING MANUAL STEPS

Listed explicitly rather than quietly omitted.

1. **Open the four sample files against your live Asan import dialog** —
   `docs/verification/m5-export-samples/`. Every layout is reproduced from your screenshots and
   verified character for character against `docs/asan/asan-layouts.md`, but I have never seen
   Asan accept one. Do this before the first real import.
2. **Record a video on a phone and watch it arrive.** M5.1's spec proves the RPC that records an
   upload, and migration 296 asserts the bucket accepts video at 100 MB — but **no automated test
   pushes real video bytes through `uploadWithProgress`**. The browser upload path is unproven by
   test. Path: sell a TV → `/sales/product-videos` → «ضبط ویدئو».
3. **Run one real export end to end** from `/admin/asan-export`: pick a range, untick something,
   download, and confirm the file matches what the preview showed.
4. **Resolve the 3 phone collisions** at `/admin/phone-collisions`. Each needs a human decision;
   the page deliberately has no merge button — `/persons/merge` remains the only merge path.
5. **Fill in Asan codes by hand**, which is what unblocks the most: supplier codes first (see
   section 7), then products via the product form's Asan-code field or the staged importer at
   `/admin/asan-import`.

### A side effect of the test suite you should know about

The full regression suite calls the marketing-task generation endpoint. That job runs for **every
active template**, so running the suite now also generates real daily tasks for **your** template
(«یک استوری در روز»), and one test runs the job for a past date, which expires yesterday's. Three
such rows exist today. I did **not** delete them — they are a real person's assigned work, and
removing them to tidy a test would be the wrong trade. If you would rather the suite never touched
live templates, the job endpoint would need a test-only flag; that is a change to the job, not to
the tests, and I did not make it unilaterally.
