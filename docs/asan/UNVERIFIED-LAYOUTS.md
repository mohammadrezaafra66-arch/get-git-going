# Asan layouts and mappings that are NOT verified

Everything here is **deliberately unbuilt or deliberately left empty**. Nothing in this file
may be emitted with a value until the owner resolves it.

The verified specification is `docs/asan/asan-layouts.md`. This file is a strict subset of the
open questions — it contains **no layout marked VERIFIED**.

Kept current through M4. Last refreshed against
`docs/execution/OWNER_ANSWERS_AND_OVERRIDES.md`, which resolved five of the seven questions
that used to be listed here. The resolved ones are recorded at the bottom so nobody re-opens
a settled question, but they are no longer blocking anything.

---

## 1. The Asan `کد حساب` for the receivables control account (`invoice_ar`)

**Status:** owner confirmed the *meaning*, still owes the *number* · **Impact:** any Layout 3
document containing an `invoice_ar` line

The owner confirmed what this account is: the **total-of-debtors / receivables control**
account — the aggregate of what every party owes. What is still missing is its Asan
`کد حساب`.

This is an account in Asan's chart, not an AfraKala party, so no AfraKala row can supply it
and neither reference workbook contains it.

**What I need from you:** the Asan `کد حساب` for the receivables/debtors control account.

**Until then:** a document containing an `invoice_ar` line **fails loudly and is excluded from
the file**, naming the account. A blank account code is never emitted, and the number is never
guessed.

---

## 2. The Asan `کد حساب` for `other`

**Status:** owner deferred it · **Impact:** any Layout 3 document containing an `other` line

The owner's instruction is explicit: *"Skip `other` for now. If a document contains an `other`
line, block that document from export and note it, rather than emitting a blank or guessed
code. I will define `other` later."*

**What I need from you:** what `other` should mean, and its Asan code — when you are ready.

**Until then:** an `other` line blocks its whole document, with the reason named in the
preview.

---

## 3. Asan codes for external parties in real دوبل documents

**Status:** per-party data, not a layout question · **Impact:** Layout 3 third-party documents

`external_parties.accounting_code` exists (it pre-dated this program) and Layout 3 places it in
column A. But a real intermediary — the owner's example is *Sahar Shahmoradi*, someone he has
only a name and an account number for — will normally have **no Asan code yet**.

The rule here is deliberately **different from the product rule**, and the two must not be
merged:

| missing code | behaviour | why |
|---|---|---|
| product `کد کالا` | export proceeds, column D left empty | Asan mints a code under group `101` |
| person / account / external party | **document blocked**, party named | a financial line with no account cannot post |

**What I need from you:** the Asan code for each external party you actually want exported.
They are listed by name in the export preview when they block a document.

**Until then:** the document is excluded and the missing party is named in Persian.

---

## 4. Radio options on `ورود اطلاعات از Excel` that were not captured

**Status:** known to exist, layouts unknown · **Decision: deliberately unbuilt, confirmed by the owner**

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

The owner re-confirmed these stay unbuilt: *"The six uncaptured radio options stay unbuilt. If
I need one later I will ask. No action."* Layout 3 (the accounting document) covers the actual
need for receipts, payments and third-party documents.

**What I need from you:** nothing.

---

## 5. The account called "12"

**Status:** unresolved, and reserved to the owner · **Impact:** one supplier's export identity

AfraKala has a supplier whose name is literally `12`, mobile `09903858654`. That mobile matches
**no** account in `اشخاص.xlsx`, so the export cannot resolve who it is.

The owner's answer: *"Understood, no problem. Leave it exactly as is."* It remains one of the
two person matches mission control section 6 reserves for him.

**What I need from you:** eventually, the correct title and Asan code. Nothing until then.

**Until then:** untouched. If it appears in an export range its document is blocked for the
ordinary missing-person-code reason, like any other party without a code.

---

## 6. Sales-tab columns AfraKala has no field for (M4.3)

**Status:** mapped as **deliberately empty** · **Impact:** three optional columns on every sales
and purchase row

The sales layout is VERIFIED and reproduced in full, but three of its optional columns have no
counterpart anywhere in AfraKala's schema. They are written as **empty cells**, and the export
page says so before download rather than leaving the accountant to notice:

| Col | Header | Why it is empty |
|---|---|---|
| M | `عوارض` | AfraKala records no duty or tax on a pre-invoice. There is no field to map. |
| O | `گروه حساب/کد۲` | AfraKala has no Asan account-group concept. |
| P | `سریال کد کالا` | AfraKala products carry no serial number. |

**P is the one worth a second look.** The tempting mapping is AfraKala's own SKU
(`AFK-2026-00033`), which is right there in `sku_snapshot`. It was **not** used: that would put
an AfraKala identifier into a field Asan means for a manufacturer's serial, and a plausible
wrong value is worse than a blank one. If the owner confirms Asan treats `سریال کد کالا` as a
free reference field, mapping the SKU there is a one-line change.

Column **Q `بارکد کالا`** is mapped for real, and is empty in practice only because barcode is
0 % populated on both sides (R1.5). If barcodes are ever entered, they flow with no code change.

**What I need from you:** confirmation of what Asan expects in `سریال کد کالا`, and whether
`عوارض` will ever be needed (it would require a new field on the pre-invoice first).

---

## MODEL GAPS

Recorded per the owner's instruction: where the current data model cannot represent something
the requirements imply, it is written down rather than invented.

### The `clearing` account does not exist in Asan

The owner: *"There is no clearing/suspense account in Asan. Do not map `clearing` to any code
and do not emit it."* His real-world flow is a **cash receipt and a cash payment recorded in
the same moment**, not a suspense line.

`journal_lines.account_kind` still allows `clearing`, so AfraKala can produce such a line even
though Asan has nowhere to put it. **No Asan code is mapped to `clearing` and no
`clearing`-coded line is ever emitted.** M4 records here whether the existing model can express
the receipt+payment pair the owner actually uses; see the M4 phase notes in
`docs/execution/asan-progress.md` for the measured answer.

### The third-party (دوبل) case — money landing in an unknown person's account

The owner's example: money is taken from Khan-Mohammadi and paid to Mokhtar Shahmoradi, but
deposited into the account of **Sahar Shahmoradi**, of whom AfraKala holds only a name and an
account number. `external_parties` is the right shape for that intermediary (minimal identity,
name + account). What must be checked, and is recorded in the M4 notes, is whether the model can
state **"the money owed to A landed in B's account"** as a relationship rather than as free
text.

---

## RESOLVED — do not re-open these

Kept only so a future session does not resurrect a settled question. None of these blocks
anything.

| was | resolved to | where |
|---|---|---|
| currency unit Asan expects | **Rial.** AfraKala stores Toman, so every exported amount is multiplied by 10 in integer arithmetic, and the unit is stated visibly in the export UI | owner answers, "CURRENCY UNIT" |
| Bank Mellat `accounting_code` | **`8`** — not the researched candidate `3064`. Applied by migration 288 | owner answers, "BANK MELLAT ASAN CODE" |
| column K on the `فروش` tab | **nothing — intentionally blank** | owner answers, "SALES-TAB COLUMN K" |
| which sales-quote status means finalized | **accountant-finalized AND stock-deducted**, established from the data rather than assumed from `status='accepted'`. Settled in M4.3 and implemented in migration 292: candidates are `status='accepted'` (the only status that deducts stock), finalization is `accounting_registered_at`, and the material evidence of deduction is a `stock_movements` row with `ref_type='sale_quote_confirm'`. **`accounting_registered_at` alone means nothing** — 32 `draft` quotes carry it | owner answers, "FINALIZED SALES-QUOTE STATUS"; migration 292 |
| what to do with the 352 products having no Asan code | export proceeds with column D empty; Asan mints a code under group `101`. A missing product code never blocks a sales/purchase export | owner answers, "PRODUCT CODE STRATEGY" |
