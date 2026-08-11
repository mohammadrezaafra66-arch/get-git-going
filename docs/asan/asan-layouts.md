# Asan Excel layouts — authoritative specification

The single source of truth for every Asan import layout AfraKala produces. Transcribed from
screens the owner captured personally, cross-checked against
`docs/asan/research-asan-bridge.md`.

**Rule for anyone editing this file:** a layout is `VERIFIED` only when the owner has seen the
actual Asan dialog. Everything else belongs in `docs/asan/UNVERIFIED-LAYOUTS.md`. A column
whose meaning is guessed must never be emitted with a value — an empty cell is recoverable, a
wrong one silently imports into live accounting.

## Layout index

| # | layout | screen | columns | status | serves |
|---|---|---|---|---|---|
| 1 | Sales invoice | ارسال یا دریافت اطلاعات توسط Excel → tab `فروش` | 18 (A–R) | **VERIFIED** | فاکتور فروش |
| 2 | Purchase invoice | same screen → tab `خرید` | 18 (A–R) | **VERIFIED** | فاکتور خرید |
| 3 | Accounting document | ورود اطلاعات تولید یا سند از فایل Excel | 6 (A–F) | **VERIFIED** | دریافت/واریز · پرداخت/برداشت · دوبل |
| 4 | Bank deposits | ورود اطلاعات از Excel → radio `واریزیهای بانکی` | 6 (A–F) | **VERIFIED** | secondary path for bank deposits |

Layout 3 alone covers three of the five deliverables; the three differ only in which side of
the ledger each line falls on.

---

## Shared conventions

| concern | rule | source |
|---|---|---|
| **Date format** | Jalali `YYYY/MM/DD`, four-digit year, zero-padded, **Latin digits** — `1405/05/12` | owner's screens |
| **Digits** | Latin throughout. Every existing formatter in the app emits *Persian* digits because `moment.loadPersian({usePersianDigits:true})` mutates the shared moment instance — the Asan formatter must fold them back with `toAsciiDigits()` | R8.2 |
| **Timezone** | `AT TIME ZONE 'Asia/Tehran'` → `::date` → *then* Jalali. Converting before shifting is an off-by-one-day bug | R8.3 |
| **Currency unit** | **UNRESOLVED.** AfraKala is provably Toman; Asan's expectation is unknown. Must be an explicit setting, never a silent default | R8.4 |
| **Account code namespace** | One namespace for everything — customers, suppliers, banks and cash boxes are all `کد حساب`. Asan account `3064` is named `ملت` | R5.3 |
| **Encoding** | UTF-8. Persian text is written verbatim, including visually scrambled product descriptions — a human corrects those later | brief |
| **Empty vs zero** | An amount that does not apply is left **empty**, not `0`. Layout 3's `بدون مبلغ حذف شود` checkbox drops zero-amount lines by default | owner's screen |

### Header controls on the sales/purchase screen

| control | effect | our choice |
|---|---|---|
| `از تاریخ` / `تا تاریخ` | Jalali date range | mirror the export's own filter |
| `محدودیت تاریخ` | enforce that range | leave to the operator |
| `فقط تست شود ذخیره انجام نشود` | dry run — validates, saves nothing | **recommend ticking on every first run of a new layout** |
| `شماره فاکتور اتوماتیک` | Asan assigns invoice numbers and ignores column A | **leave unticked** — we supply numbers so they are stable across re-exports (R7.4) |
| `گروه کدهای کالای جدید` = `101` | group under which Asan creates codes for unknown products | relied upon: 352 of 355 products have no Asan code (R1.5) |
| `گروه کدهای حسابهای جدید` = `101` | same for unknown persons | same |

---

## Layout 1 — Sales invoice (`فروش` tab) — VERIFIED

Columns A–H are highlighted in the dialog, which marks them as the mandatory core.

| Col | Header | Mandatory | Type | Format / source |
|---|---|---|---|---|
| A | `شماره فاکتور` | **yes** | integer | our own number, allocated once and never renumbered (R7) |
| B | `تاریخ` | **yes** | Jalali date | `YYYY/MM/DD`, Latin digits |
| C | `کدشخص` | **yes** | account code | the customer's Asan person code |
| D | `کد کالا` | **yes** | product code | Asan product code; blank lets Asan mint one under group 101 |
| E | `نام کالا` | **yes** | text | product description |
| F | `تعداد` | **yes** | number | quantity |
| G | `مبلغ ق` | **yes** | amount | unit price |
| H | `مبلغ کل` | **yes** | amount | line total |
| I | `دریافت نقد` | no | amount | cash received |
| J | `واریز به بانک` | no | amount | deposited to bank |
| K | *(blank in the screenshot)* | — | — | **LEAVE EMPTY** — see UNVERIFIED-LAYOUTS.md |
| L | `تخفیف` | no | amount | discount |
| M | `عوارض` | no | amount | duties/levies |
| N | `نام حساب` | no | text | account name |
| O | `گروه حساب/کد۲` | no | text | account group / second code |
| P | `سریال کد کالا` | no | text | product serial |
| Q | `بارکد کالا` | no | text | product barcode — **AfraKala has none**, 0/355 populated (R1.2) |
| R | `تلفن/کد۳` | no | text | phone / third code |

## Layout 2 — Purchase invoice (`خرید` tab) — VERIFIED

Identical to Layout 1 **except columns I, J and K**:

| Col | Header | Mandatory | Type | Notes |
|---|---|---|---|---|
| I | `پرداخت نقد` | no | amount | cash paid |
| J | `پرداخت از بانک` | no | amount | paid from bank |
| K | `پرداخت چک` | no | amount | **paid by cheque — present and verified on this tab** |

All other columns (A–H, L–R) are exactly as Layout 1.

## Layout 3 — Accounting document — VERIFIED

Screen `ورود اطلاعات تولید یا سند از فایل Excel`. **This is the primary layout for receipts,
payments and third-party (دوبل) documents.**

| Col | Header | Mandatory | Type | Source |
|---|---|---|---|---|
| A | `کد حساب` | **yes** | account code | per `journal_lines.account_kind` — see mapping below |
| B | `کد کالا` | no | product code | usually empty for a financial voucher |
| C | `شرح` | no | text | `journal_lines.description` |
| D | `تعداد` | no | number | usually empty |
| E | `بدهکار` | one of E/F | amount | `journal_lines.debit` when > 0 |
| F | `بستانکار` | one of E/F | amount | `journal_lines.credit` when > 0 |

`journal_lines_one_side` already guarantees exactly one of debit/credit is non-zero, so E and F
can never both be filled.

### Screen controls

`شماره سند` (numeric) · `بدون مبلغ حذف شود` (checked by default) · `کد دلخواه` (numeric) ·
`بدهکاران` / `بستانکاران` (both checked) · buttons `کلیه مانده حسابها`, `خواندن از سند`,
`Clear`, `انتقال اطلاعات`, `ذخیره فایل Excel`.

**`شماره سند` is one number for the whole document**, entered on the screen rather than in a
column. **One Excel file must therefore contain exactly one accounting document.** Emitting two
would silently merge them under one voucher number.

### `account_kind` → `کد حساب` mapping

| `account_kind` | source | available today? |
|---|---|---|
| `customer_credit` | `customers.accounting_code` | yes — 11 of 14 |
| `bank` | `bank_accounts.accounting_code` | **placeholder only** — `TEMP-CHANGE-ME`; candidate `3064` |
| `external_party` | `external_parties.accounting_code` | column exists, **0 rows populated** |
| `invoice_ar` | — | **no source anywhere** |
| `clearing` | — | **no source anywhere** |
| `other` | — | **no source anywhere** |

**Export must refuse** rather than emit a blank or placeholder `کد حساب`.

### The three documents this layout serves

| document | debit side | credit side |
|---|---|---|
| دریافت / واریز (receipt) | bank / cash account | the customer's account |
| پرداخت / برداشت (payment) | the supplier or party account | bank / cash account |
| دوبل (third party) | the beneficiary's account | the receiver's account |

The دوبل case is representable today: `payment_receipts` carries `payer_accounting_code`,
`receiver_accounting_code` **and** `beneficiary_accounting_code` (R5.4).

## Layout 4 — Bank deposits (`واریزیهای بانکی`) — VERIFIED, secondary

Screen `ورود اطلاعات از Excel`, radio `نوع اطلاعات` → `واریزیهای بانکی`.
Controls: `شروع کد از کد` = `101` · `تعریف کد جدید` · `کدها عددی`.

**Headers here are Latin transliterations, unlike every other screen.**

| Col | Header | Mandatory | Type | Source |
|---|---|---|---|---|
| A | `Date` | **yes** | Jalali date | `YYYY/MM/DD` |
| B | `Code_M` | **yes** | account code | customer's Asan code |
| C | `Name_Moshtari` | no | text | customer name |
| D | `Shomare_Peygiri` | no | text | `payment_receipts.tracking_number` |
| E | `Mablagh` | **yes** | amount | `payment_receipts.amount` |
| F | `Bank_cod` | no | account code | `bank_accounts.accounting_code` |

This is an **alternative** route for bank deposits only. Layout 3 remains the default; Layout 4
is built but is not the primary path.
