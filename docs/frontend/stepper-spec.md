# Stepper specification — the three-branch document wizard

Replaces the current single-card form (2205 lines, ~33 fields all visible at once) at
`/accounting/receipts/create`.

## Governing principle

**A field appears only when the user's earlier answers make it relevant.** The current form shows
everything and lets the user work out what applies; the wizard asks, then shows.

Three branches, chosen at step 1: **دریافت** (receipt), **پرداخت** (payment), **سند دوبل** (dual).
These are not arbitrary — they map exactly onto the three Asan accounting-document export filters.
Step 1 is really asking "which Asan document is this", without saying so.

**In receipt and payment, one side of the transaction is always us**, so there is no third-party or
beneficiary field in those branches. The dual branch is the only one with three parties.

---

## Constraints inherited from the platform

1. **No browser storage.** No `localStorage`, no `sessionStorage`. Wizard state lives in React state
   only. Artifacts and this app both fail with browser storage.
2. **RTL throughout.** Persian labels, `dir="rtl"`.
3. **No HTML `<form>` element.** Use `onClick` / `onChange` handlers.
4. **`Stepper` does not exist** in `src/components/ui/`. Build it in task 6.2 — Tailwind core
   utilities and shadcn/ui only.
5. **HTTP, not HTTPS.** File upload needs a Secure Context, so step "attachment" is disabled until
   OG-5 clears. The wizard must work fully without it.

---

## Step 1 — What kind of document? (all branches)

Three large buttons. No other field.

| Option | Sub-label | Goes to |
|---|---|---|
| دریافت | پول مستقیم به دست ما رسیده | `create_receipt` |
| پرداخت | پول مستقیم از دست ما رفته | `create_payment` |
| سند دوبل | پول از یکی به دیگری، ما فقط ثبت‌کننده | `create_dual_document` |

Selecting a branch resets every later answer. Changing branch mid-flow discards, with a confirm.

---

## Receipt branch

### Step 2 — How did the money arrive?
`بانکی` (bank) · `نقدی` (cash) · `چکی` (cheque). Determines which fields exist in step 4.

### Step 3 — Who paid us?
One primary input: **کد آسان یا شمارهٔ موبایل**. Everything else is read-only and auto-filled:
name, file type, current balance.

Search runs over **`persons`**, not only `customers` — otherwise suppliers and external parties are
unreachable. Mobile input requires `normalize_identifier` so `09121234567`, `9121234567` and
`+989121234567` resolve to the same person (OG-4).

**If the party has no Asan code, the step blocks** with a clear Persian message naming the person and
what to do. Never a raw database error. This is T3's front-end half; the database half in
`require_asan_code` is what actually enforces it.

### Step 4 — Document details

| Bank | Cash | Cheque |
|---|---|---|
| destination account (ours) * | cash box * | cheque number * |
| amount * | amount * | issuing bank * |
| date *, time * | date *, time * | due date * |
| tracking number * | tracking number: **none** — minted internally | amount * |
| source bank | note | drawer |
| slip upload → OCR pre-fill | | cheque image |

`*` = required. Amount must be a whole Toman number — block fractions in the field, because the
Asan export rejects them and the RPC raises.

### Step 5 — Review and submit
Show the party, amount, channel and the resulting journal entry.

**The preview must come from the server, not be assembled in the form.** The current form hardcodes
a preview that is materially false — it shows debit=beneficiary / credit=payer while the real entry
is debit=bank / credit=`customer_credit`. A hand-written copy of the posting logic drifts the moment
the server changes. If a read-only preview RPC is not available, show the inputs only and no journal
lines at all — a blank is better than a false one.

Submitting calls `create_receipt`. There is **no approval step** (T1): the document posts
immediately and the balance moves.

---

## Payment branch

### Step 2 — How did the money leave?
`بانکی` · `نقدی` · `چکی`. Cheque opens a **sub-question**: `چک خودمان` (our own cheque book) or
`چک مشتری` (endorsing a cheque we hold).

For an endorsed cheque the user **selects from a list of held cheques** and every cheque field is
auto-filled and locked. They never retype cheque details.

### Step 3 — Who did we pay?
Same code-or-mobile lookup. Payee type (supplier / external party / customer / other) is derived from
the person's file, not asked.

### Step 4 — Document details
Bank: source account (ours) *, amount *, date *, tracking number *, destination bank, destination
IBAN (auto-filled from the party's file), receipt upload.
Cash: source cash box *, amount *, date *, no tracking number.
Cheque (own): cheque book *, cheque number *, our bank (auto), due date *, amount *.
Cheque (endorsed): select cheque * — everything else locked.

### Step 5 — Review and submit
Calls `create_payment`.

---

## Dual-document branch

### Step 2 — Slip details
Amount *, date, time, tracking number *, source bank, destination bank, slip upload → OCR.

The money never reaches our accounts; the slip is evidence of a transfer between two other parties.

### Step 3 — The payer
Code or mobile *. Someone who owed us. Shows their receivable balance.

### Step 4 — The beneficiary
Code or mobile *. Someone we owed. Shows their payable balance.

### Step 5 — The intermediary (صراف)
Optional. Code or mobile, fee, who bears the fee. With a zero fee this is metadata only; with a fee
it becomes a third journal line.

### Step 6 — Review and submit

**Two things are stricter here than elsewhere:**

1. **Description is required.** In the accounting-document layout the tracking number and payer name
   are buried inside the شرح column, so the description is the only context an accountant sees in
   Asan for this document.
2. **The two sides must be equal.** An unbalanced document is excluded from the Asan export
   entirely, so the wizard must reconcile before calling and the RPC rejects any mismatch.

---

## Field-level rules across all branches

| Rule | Behaviour |
|---|---|
| Locked field | Grey background, lock icon, not focusable |
| Primary lookup field | Accent border — the one field the user actually types |
| Required | Persian label + `*` |
| Amount | Integer Toman only; reject fractions in-field with an explanatory message |
| Date | Jalali picker; stored as a date |
| Server error `P0001` | Show the Persian message verbatim — it is written for the user |
| Server error `23505` | Treat as success — the document already exists; navigate to it |
| Server error `42501` | "no permission" — never an empty state |

---

## What is removed and why

| Removed | Reason |
|---|---|
| `receipt_type` (4 options) | Dead for accounting — all four post identically and no function reads it. Replaced by always listing the customer's open proformas. (T5) |
| `has_perforation`, `is_typed_receipt`, `is_mobile_bank_screenshot` | Never enforced server-side; removing them loses no control that existed. (T4) |
| `beneficiary_accounting_code` in receipt/payment | Its only reader was neutered; the value never reached the ledger. Reappears as a real step in the dual branch, where it belongs. (T1/A1) |
| The hardcoded journal preview | Materially false — see step 5. |
| The approval step | Removed by T1; role gates replace it. |

## Acceptance

- All three branches create a document from the browser and the balance moves immediately.
- A party without an Asan code is refused with a readable Persian message, not a raw error.
- The same person is found by all three mobile formats.
- Cash and cheque branches never ask for a bank tracking number.
- An endorsed cheque is chosen from a list; no cheque field is typed twice.
- No `localStorage` or `sessionStorage` anywhere in the wizard.
