# OG-35 — the Asan Excel output: what is already built, and the three questions that block it

Audited on 2026-08-26 for mission 8 of the chained execution (branch
`feature/og35-asan-export-audit`). **Nothing was built.** v8 orders the wiring audited
first, and the audit changes what the mission is.

---

## The headline: v8's two templates are already implemented

v8 supplies a template specification and calls it the source of truth. Compared against the
repository, **both templates already exist** — one of them character-for-character.

### Template 2 — `سنددوبل_اسان.xls` — **EXACT MATCH**

| v8 | `src/lib/asan/layouts.ts:64` (`JOURNAL_HEADERS`) |
|---|---|
| A کد حساب · B کد کالا · C شرح · D تعداد · E بدهکار · F بستانکار | `"کد حساب","کد کالا","شرح","تعداد","بدهکار","بستانکار"` |

Same six columns, same order, same text. The file's own comment reads *"Layout 3 —
accounting document, 6 columns A–F. **Serves receipts, payments and دوبل**"*, which is
exactly v8's auto/manual map for the dual document. **Nothing to decide and nothing to
build here.**

### Template 1 — `واریزوپرداخت_بانکی.xlsx` — same layout, **three characters apart**

| col | v8 says | `layouts.ts:74` (`BANK_DEPOSIT_HEADERS`) ships |
|---|---|---|
| A | `Date` | `Date` |
| B | `Code_M` | `Code_M` |
| C | `Name_Moshtare` | **`Name_Moshtari`** |
| D | `Shopmare_Peygeri` | **`Shomare_Peygiri`** |
| E | `Mablagh` | `Mablagh` |
| F | `Bank_cod` | `Bank_cod` |

Six columns, same order, four of six identical. **The two disagreements are the whole
conflict**, and v8 pre-empts one of them — *"the misspelling 'Shopmare' is
legacy-intentional; do NOT correct it"* — while the repository says the opposite just as
firmly:

```
e2e/asan/export-bank-deposits.spec.ts:27
 *   * the Latin transliterations are reproduced **exactly** — `Name_Moshtari`, not …
e2e/asan/export-bank-deposits.spec.ts:98-99   "Name_Moshtari", "Shomare_Peygiri"
src/lib/asan/export-bank-deposit.ts:9         named in the contract comment
src/lib/asan/export-bank-deposit-rows.ts:39-40
src/lib/asan/layouts.ts:77-78                 "Name_Moshtari", "Shomare_Peygiri"
```

Both statements are owner-sourced, and a wrong header lands the column in the wrong place
inside live accounting software. **A2.6 forbids an agent picking between them**, so nothing
was changed. This is question 1 below.

## Everything else in v8's spec that IS already built

| v8 rule | status |
|---|---|
| Internal amounts are Toman; export multiplies by 10 → Rial | **BUILT.** `amounts.ts`: `RIAL_PER_TOMAN = 10`, `tomanToRial`, `tomanStringToRial`, with a written rationale for integer-only arithmetic |
| Date is Jalali with slashes, e.g. `1405/05/27` | **BUILT.** `dates.ts`: Jalali `YYYY/MM/DD`, four-digit, zero-padded, **Latin** digits — and it explicitly converts in Asia/Tehran first, noting that converting a timestamp before shifting to Tehran is an off-by-one-day bug |
| `Bank_cod` is our bank account's Asan code, already in `bank_accounts` | **BUILT.** `export-bank-deposit-rows.ts:42` emits `r.bank_code` into column F |
| `Code_M` / counterparty name | **BUILT**, columns B and C |
| Dual document → auto (template 2) | **BUILT** — layout 3 serves it |

`dates.ts`'s Tehran-first rule is worth noting alongside **OG-63**: the same timezone class
that `create_purchase` got wrong is handled correctly here, deliberately and with the reason
written down.

## What is genuinely NOT built

1. **A negative `Mablagh` for bank payments.** v8: *"Receipt = plain positive. Payment =
   negative with `-` on the LEFT."* A search across all of `src/lib/asan/` finds **no sign
   handling at all** — no negation, no `Math.abs`, nothing. And the built bank export is
   deposit-only by design: `export-bank-deposit.ts` describes itself as *"the secondary
   bank-deposit export … an **alternative** path for deposits"*, with the accounting
   document (layout 3) remaining the default for receipts and payments.
2. **Columns G–O emitted as empty strings to `max_col=15`.** The shipped layout is six
   columns. Nothing pads to fifteen.

Both widen a contract that two e2e specs currently assert. They are questions 2 and 3.

## The page error is a refusal, not a missing configuration — and it points somewhere else

v8 predicts *"likely built and unwired; the page error «قالب پیکربندی نشده است» may be a
missing configuration."* Half right, and the other half matters.

There are **two separate Asan surfaces**, and they are not the same family:

| surface | state | reached from |
|---|---|---|
| `src/lib/asan/*` — layouts, `write-xlsx`, journal, bank-deposit, sales, purchase | **BUILT**, seven registered exports (`sales`, `purchase`, `receipts`, `payments`, `third_party`, `purchase_settlement`, `bank_deposits`) | `/admin/asan-export` |
| `src/lib/export/export-modes.ts` — `ASAN_ADAPTERS`, five entries | **ALL DELIBERATELY UNCONFIGURED** | the accounting-receipts page (`_app.accounting.receipts.tsx:29`, branching at `:180`) |

`AsanLayoutNotConfiguredError` is declared at `export-modes.ts:69` and thrown from
`createUnconfiguredAsanAdapter` at `:107`/`:116`. Its header comment states the reason
plainly: a layout description exists in `docs/asan/ASAN_BRIDGE.md` but **nothing that can be
verified against**, and *"wiring it in blind would produce a file that looks authoritative
and imports silently into the owner's live accounting software."*

**The five unconfigured adapters are ASAN_BRIDGE.md's layouts** — `sales_invoice`,
`purchase_invoice`, `accounting_voucher`, `bank_receipt`, `bank_payment` — **not** the seven
built ones. That file exists (`docs/asan/ASAN_BRIDGE.md`, 25 KB) and `export-modes.ts` says
adopting it *"is the owner's call, and is itself a separate mission that requires the
owner's approval before any of it is built."*

So there are two distinct possible missions hiding under "OG-35", and they should not be
merged by accident:

- **(A)** finish template 1 against the *existing* `/admin/asan-export` implementation —
  three small questions, most of the work already done;
- **(B)** configure the receipts page's five ASAN_BRIDGE adapters — a larger, separately
  owner-gated piece of work that v8's template block does not describe.

v8's specification describes **(A)**. Nothing here assumes it authorises **(B)**.

---

## The three questions that block this mission

Recorded as **OG-65**. Nothing was built, no file under `src/` was touched.

1. **Header transliteration.** `Name_Moshtari` / `Shomare_Peygiri` as shipped and asserted
   by two e2e specs, or `Name_Moshtare` / `Shopmare_Peygeri` as v8 states? Three characters,
   and they decide which column the data lands in. *(Open since 2026-08-25 as question 3 of
   the chain's STOP-AND-ASK table; still unanswered.)*
2. **Bank payments in template 1.** Should the deposit export also carry bank **payments**
   with a negative `Mablagh` (minus sign on the left)? No sign handling exists today and the
   export is deliberately deposit-only, with the accounting document as the default path for
   payments. This widens a verified contract.
3. **Columns G–O.** Should the file emit empty G–O to `max_col=15`, as v8 says the original
   template has? The shipped layout is six columns.

A fourth, larger question sits behind them: **is `docs/asan/ASAN_BRIDGE.md` in scope at
all** — i.e. is the receipts page's five-adapter refusal part of OG-35, or the separate
owner-gated mission `export-modes.ts` says it is?
