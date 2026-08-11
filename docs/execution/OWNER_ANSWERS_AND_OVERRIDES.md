# OWNER ANSWERS AND OVERRIDES — read before continuing the Asan program

**This is a genuine instruction from me, the owner (Mohammad Reza Afra).**

Place in `docs/execution/`. This file **overrides** anything conflicting in the mission
program or in `UNVERIFIED-LAYOUTS.md`. Update `docs/execution/asan-progress.md` to reference
it.

---

## PACE — changed

Previous instruction said "slow and deliberate". **Raise the pace now.** Move faster, but
finish each phase **completely** — no half-done work, no skipped tests, no rushing that
leaves a phase partially built. The goal is steady forward progress at a normal working
speed, not the very slow crawl of the last sessions. Correctness and completeness per phase
still hold; only the deliberate slowness is lifted.

---

## PRODUCT IMPORT — replaces the earlier "cancel 3.4" decision

I previously said skip product import. **Refined decision:** I *do* want a product importer,
but with strict limits.

1. **Build an Excel product importer reachable from the frontend.** A human will use it later
   to bring products in one batch at a time.
2. **Do not push any products into the database automatically now.** No auto-run, no
   background job, no seeding. The importer is a tool that sits and waits for a human to
   operate it.
3. **No automatic matching of any kind.** No barcode auto-link, no name match, no fuzzy match
   — the research proved fuzzy is unsafe (`QH-2800` vs `QH-2200`). The importer parses the
   file, stages it, shows a preview, and a human decides. Nothing is committed without an
   explicit human action in the UI.

So phase 3.4 is **not cancelled** — it is rebuilt as a **staging-only, human-operated,
no-auto-match** importer, mirroring the person importer's staging architecture from 3.3.
Unmatched rows stay unmatched; a human resolves them by hand in the UI.

---

## PRODUCT ASAN CODE FIELD — this is now a first-class requirement

We learned that a product needs a dedicated field for its **Asan code** — the single shared
unique key between Asan and AfraKala.

1. Phase 3.1 already added a nullable Asan-code column on `products` with a partial unique
   index. **Confirm it exists; if it does, that is the field.** If for any reason it does not,
   add it now (nullable, partial unique index on non-null values).
2. **The product creation form must expose this field.** From now on, when a human creates a
   product in AfraKala, there is a visible input for the Asan product code.
3. **It is optional, not required.** Creating a product without an Asan code must still
   succeed — many products will not have one yet. Only export cares whether it is present,
   and per the export rule below a missing product code does not block export.
4. Wire it end to end: the column exists, the create form writes to it, the edit form updates
   it, and it survives a round-trip. Add a phase test proving a product created via the form
   with an Asan code stores it, and one created without still saves.

## FILLING ASAN CODES FOR PRODUCTS THAT ALREADY EXIST WITHOUT ONE

The products already in AfraKala have no Asan code. I will fill them **by hand**. Give me two
manual paths, both human-operated, no automation:

1. **Inline edit** — the product edit form (from the field above) lets me set the Asan code on
   any existing product one at a time.
2. **The Excel importer** — the same importer from the product-import decision can also
   *update* the Asan code on an existing AfraKala product when a human matches a staged Asan
   row to it in the preview. This is a human match in the UI, never automatic.

No fuzzy matching populates this column, ever. Every value arrives from a human action.

---

## CURRENCY UNIT — RESOLVED. This was the ×10 risk.

**Asan expects RIAL.** AfraKala stores **Toman**. Therefore every amount exported to Asan
must be **converted Toman → Rial (× 10)**.

1. Apply the ×10 conversion in the export row-builders for every amount in every layout:
   sales `مبلغ ق` / `مبلغ کل` / `دریافت نقد` / `واریز به بانک` / `تخفیف` / `عوارض`, purchase
   equivalents, and the accounting document `بدهکار` / `بستانکار`, and Layout 4 `Mablagh`.
2. Do the conversion in integer arithmetic — multiply by 10, never floating point, so no
   rounding error is introduced. AfraKala Toman values are whole numbers; ×10 stays whole.
3. Keep the unit **visible** in the export UI: show that amounts are being written in Rial,
   so the accountant can see at a glance the conversion happened. Do not make it silent.
4. Add a phase-test assertion: a known quote whose AfraKala total is T Toman produces a file
   whose corresponding cell is exactly `T * 10`. This is the single most important assertion
   in M4 — make it strict.

## BANK MELLAT ASAN CODE — RESOLVED

The Asan code for the Bank Mellat account (`ملت`, id
`32a4c282-85a3-485c-bbb4-dae3bb4febd6`) is **`8`**.

Replace the placeholder `TEMP-CHANGE-ME` with `8` — via the safe method (`docker cp` +
`psql -f`, ASCII only so a pipe is technically fine, but keep to the safe method for
consistency). Verify the row reads back `8`. After this, a `bank` line for Mellat exports
its code as `8` and no longer fails the "TEMP-CHANGE-ME" guard.

---

## CONTROL ACCOUNTS — partially resolved

### `invoice_ar` (receivables control)
My question back to you: does this mean the **total-of-debtors** account — the report showing
how much every party owes us in aggregate? Assume **yes** for now: `invoice_ar` maps to the
receivables/debtors control account. **I still owe you its exact Asan `کد حساب`** — record it
as still-needed in `UNVERIFIED-LAYOUTS.md`, and until I supply it, a document containing an
`invoice_ar` line fails loudly rather than emitting a blank code. Do **not** guess the number.

### `clearing` (suspense) — does not exist in Asan
**There is no clearing/suspense account in Asan.** Do not map `clearing` to any code and do
not emit it. Instead, the real-world flow I use is: I record a **cash receipt** and, in the
same moment, a **cash payment**. So what would have been a clearing entry is represented as a
paired cash-in / cash-out, not a suspense line.

Handle it this way: if a journal entry contains a `clearing` line, that entry should be
representable as a receipt+payment pair on the accounting-document layout, not as a line whose
account is "clearing". If the current data model cannot express that cleanly, record it under
`## MODEL GAPS` in `UNVERIFIED-LAYOUTS.md` and do not emit a `clearing`-coded line.

### `other` — do not build yet
Skip `other` for now. If a document contains an `other` line, block that document from export
and note it, rather than emitting a blank or guessed code. I will define `other` later.

---

## THE THIRD-PARTY / DOUBLE CASE (دوبل) — clarified with a concrete example

Here is exactly what this is, in my words:

> I took money from **Khan-Mohammadi** and paid it to **Shahmoradi**. But Khan-Mohammadi
> deposited into the account of **Sahar Shahmoradi**, whom I do not know at all — I only have
> her name and account number, given to me by **Mokhtar Shahmoradi**, who said "deposit the
> money you owe me into this account."

So the **intermediary person** (Sahar Shahmoradi) is someone I have **no real record of** —
only a name and a bank account number. These intermediary parties are exactly what
`external_parties` is for: minimal identity, just a name and account.

Requirements for the دوبل export:
1. The intermediary is an `external_party` — name and account only, no full person record.
2. The accounting-document export must be able to place an `external_party` line with that
   party's Asan code in column A (`کد حساب`). Per the M3.1 work, external parties carry an
   Asan-code field; use it.
3. If an external party has no Asan code yet, the same rule as products does **not** apply —
   an account line with no code cannot post to Asan, so block that document and name the
   missing party, rather than emitting a blank account code. A financial line with no account
   is wrong; a product line with no product code is fine (Asan mints one). Keep these two
   rules distinct.
4. If the current model cannot represent "money came from A but landed in third party B's
   account," record precisely what is missing under `## MODEL GAPS` in
   `UNVERIFIED-LAYOUTS.md`. Do not invent a model for it silently.

---

## SALES-TAB COLUMN K — RESOLVED

Column K on the `فروش` (sales) tab is **nothing — leave it empty.** Confirmed. Remove it from
the open-questions list; it is settled as intentionally blank.

## UNCAPTURED RADIO OPTIONS — confirmed out of scope

The six uncaptured radio options stay unbuilt. If I need one later I will ask. No action.

## THE ACCOUNT CALLED "12" — acknowledged, leave untouched

Understood, no problem. Leave it exactly as is. It remains one of the person-matches I verify
myself.

---

## FINALIZED SALES-QUOTE STATUS — RESOLVED

Export the pre-invoices that are **finalized by the accountant** — the ones the accountant has
made final and where **stock has already been deducted** from our inventory.

Do **not** simply key off `status='accepted'`. Find the real signal in the data:
1. Determine which flag or status marks a quote as accountant-finalized (a finalization
   marker, a posted-accounting flag, or an accounting-document link — the research on
   `sales_quotes` markers is the place to look).
2. Confirm it correlates with **stock having been deducted** — locate where stock deduction
   is recorded (`apply_stock_movement` and its ledger) and verify the finalized quotes are
   exactly the ones whose stock moved.
3. Export only quotes satisfying **both**: accountant-finalized **and** stock-deducted.
4. Record in the progress file exactly which column/flag you used and the evidence that it
   equals "finalized + stock deducted". If the two signals disagree for any quote, treat that
   as a surprise worth investigating before proceeding (per Mission Control), and report it.

If, after investigating, the only reliable finalization signal genuinely is `accepted`, use
it — but only after confirming stock deduction lines up. Do not assume.

## PRODUCT CODE STRATEGY / EXPORT DIRECTION — clarified

I do **not** want to export products from AfraKala and import that export into Asan. Scratch
any product-export-to-Asan idea.

What I want instead is what the sections above describe: the ability to **manually set the
Asan code on products already created in AfraKala** (inline edit + human-operated importer).

For the **transaction exports** (sales/purchase invoices), the earlier rule stands: a line
whose product has no Asan code still exports, with column D (`کد کالا`) left **empty**, and
Asan mints a code under group `101`. A missing **product** code never blocks a sales/purchase
export. A missing **person** or **account** code still blocks, because Asan must know the
party.

---

## SUMMARY OF WHAT IS NOW UNBLOCKED vs STILL-NEEDED

**Unblocked — M4 can build these with real values:**
- currency: convert Toman → Rial (×10), visible in UI
- Bank Mellat code: `8`
- sales column K: empty
- finalized quote definition: accountant-finalized AND stock-deducted (confirm in data)
- product code on transaction exports: optional, blank allowed, Asan mints under 101

**Still needed from me — keep these blocking, never guess:**
- `invoice_ar` exact Asan `کد حساب` (I confirmed it means the debtors/receivables control;
  I still owe the number)
- external-party Asan codes for real دوبل documents (block + name the party until present)
- `other` account definition (skip for now; block `other` lines)

Keep `docs/asan/UNVERIFIED-LAYOUTS.md` current with exactly this still-needed list and
nothing that is now resolved.
