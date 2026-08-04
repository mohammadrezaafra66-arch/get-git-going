# Asan layouts and mappings that are NOT verified

Everything here is **deliberately unbuilt or deliberately left empty**. Nothing in this file
may be emitted with a value until the owner resolves it.

The verified specification is `docs/asan/asan-layouts.md`. This file is a strict subset of the
open questions — it contains **no layout marked VERIFIED**.

Kept current through M4.

---

## 1. Column K on the sales tab — BLOCKS one cell, not the layout

**Status:** unverified · **Impact:** one column of Layout 1 · **Current behaviour:** emitted empty

On the `خرید` (purchase) tab, position K is `پرداخت چک` — verified. On the `فروش` (sales) tab
the same position appeared **blank** in the owner's screenshot. It is plausible that sales has a
cheque column too, but plausible is not verified, and a cheque amount written into the wrong
column would post a payment that never happened.

**What I need from you:** a screenshot of the `فروش` tab header row, or simply the answer —
is K blank, `دریافت چک`, or something else?

**Until then:** M4 writes nothing in column K of the sales layout.

---

## 2. Radio options on `ورود اطلاعات از Excel` that were not captured

**Status:** known to exist, layouts unknown · **Decision: deliberately unbuilt**

The `نوع اطلاعات` radio group offers seven options. Only `واریزیهای بانکی` was captured and is
built (Layout 4).

| radio option | column layout | decision |
|---|---|---|
| `اسامی مشتریان` | UNKNOWN | not built |
| `دریافتهای نقدی` (with a `فروش` dropdown) | UNKNOWN | not built |
| `اسناد دریافتنی` | UNKNOWN | not built |
| `پرداخت نقدی` | UNKNOWN | not built |
| `اسناد پرداختنی` | UNKNOWN | not built |
| `اطلاعات فاکتور` | UNKNOWN | not built |

These are **out of scope for this program by the owner's own instruction**: Layout 3 (the
accounting document) covers the actual need for receipts, payments and third-party documents.
Recorded here so nobody later mistakes their absence for an oversight.

**What I need from you:** nothing, unless you want one of them built later.

---

## 3. Currency unit Asan expects — THE HIGHEST-RISK OPEN ITEM

**Status:** UNKNOWN · **Impact:** every amount in every layout

AfraKala is **provably Toman**: `products.base_currency` defaults to `'toman'` (214 rows
explicitly toman, 140 usd, 1 aed), `purchases.cash_price_currency` is literally `'toman'` on a
real row, and `market_indicators.unit` / `market_rate_ticks.unit` are `'toman'`.

Asan's side is **inferred only**. `اشخاص.xlsx` has no unit label anywhere. Its balances have a
median of 6 000 000 and a maximum of 101 676 374 980 — magnitudes that read naturally as Toman
(6 million Toman ≈ a normal customer balance) and implausibly as Rial (600 000 Rial ≈ one
dollar). Magnitude is evidence, not a unit label.

**A ×10 error here is the worst outcome this program can produce.**

**What I need from you:** open one invoice in Asan whose total you also know in AfraKala, and
tell me the two numbers. One data point ends this permanently.

**Until then:** M4 exposes the unit as an explicit, visible setting with no silent default, and
refuses to generate a file until it has been confirmed once.

---

## 4. `bank_accounts.accounting_code` is a placeholder

**Status:** placeholder `TEMP-CHANGE-ME` · **Impact:** every `bank` line in Layout 3, and column F of Layout 4

There is exactly one bank account in the system (`ملت`, id `32a4c282-85a3-485c-bbb4-dae3bb4febd6`)
and its Asan code is the literal string `TEMP-CHANGE-ME`.

**Strong candidate, not applied:** `اشخاص.xlsx` contains account **`3064`** whose `نام حساب` is
exactly `ملت`, with no mobile and no address — the shape of a ledger account rather than a
person. There is no competing `ملت` row.

**What I need from you:** confirm `3064`, or give me the correct code.

**Until then:** any export containing a bank line whose code is still `TEMP-CHANGE-ME` **fails
loudly**, naming the account. It is never emitted.

---

## 5. Asan codes for control accounts

**Status:** UNKNOWN · **Impact:** Layout 3 lines whose `account_kind` is `invoice_ar`, `clearing` or `other`

These are accounts in Asan's chart, not AfraKala parties, so no AfraKala row can supply them
and neither reference workbook contains them.

**What I need from you:** the Asan `کد حساب` for
- receivables control (`invoice_ar`)
- clearing / suspense (`clearing`)
- anything you want `other` to map to

**Until then:** a document containing such a line refuses to export rather than emitting a
blank code.

---

## 6. The account called "12"

**Status:** unresolved, and reserved to you · **Impact:** one supplier's export identity

AfraKala has a supplier whose name is literally `12`, mobile `09903858654`. That mobile matches
**no** account in `اشخاص.xlsx`, so the export cannot resolve who it is.

This is also one of the two person matches mission control section 6 explicitly reserves for
you ("ستایسا سعادت مبارکی" ⇒ "12"), so it is reported and **left untouched**.

**What I need from you:** the correct title and Asan code for this account.

---

## 7. Which sales-quote status means "finalized"

**Status:** undefined · **Impact:** which documents the sales export includes

Of 50 quotes: 35 `draft`, 9 `canceled`, **4 `accepted`**, 1 `rejected`, 1 `sent`. If `accepted`
is the export gate, the first batch is four documents.

**What I need from you:** one word — which status (or statuses) should be exported?

---

## 8. Product code strategy for the 352 unmatched products

**Status:** decision needed, not a layout question · **Impact:** column D of Layouts 1 and 2

Only **3 of 355** AfraKala products can be matched to an Asan product code, and fuzzy matching
is unsafe (0.90-similarity pairs are demonstrably different products — R1.5).

Asan's `گروه کدهای کالای جدید = 101` means Asan will **mint a new code** for any product it does
not recognise, so a blank column D is a workable path rather than a blocker.

**What I need from you:** confirm that unmatched products may arrive in Asan as new items under
group `101`, rather than being held back until they are matched by hand.
