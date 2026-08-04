# Asan bridge — research

ASAN mission M2. **Read-only.** No migration, no application code, nothing applied to the
database. Every answer carries its evidence: a query and its result, or a `file:line`.

Reference data extracted to `docs/verification/asan/reference-extract.json`
(488 persons, 7 256 products), AfraKala products to
`docs/verification/asan/products-extract.json`, match study to
`docs/verification/asan/product-match-report.json`.

Header mapping in the brief was verified independently against the workbooks and is correct:
`اشخاص` AB=`کد حساب`, Z=`نام حساب`, I=`موبایل`, Y=`تلفن`, E=`کد ملی`, X=`آدرس`;
`کالا` V=`کد کالا`, S=`شرح کالا`, T=`بارکدکـالا`, U=`سریال کـالا`, Q=`واحد 1`.

---

## R1 — Product coding in AfraKala

### Findings

**1. Yes, codes are generated automatically — into `products.sku`.**

`trg_products_assign_sku` (BEFORE INSERT OR UPDATE on `products`) calls
`public.products_assign_sku()`, which calls `public.next_product_sku(year)`:

```sql
_sku := 'AFK-' || _year::text || '-' || lpad(_next::text, 5, '0');
```

The counter lives in `product_sku_counters (year, last_value, updated_at)`, currently the
single row `2026 | 422`. Allocation is `INSERT … ON CONFLICT (year) DO UPDATE SET last_value =
last_value + 1 … RETURNING`, so it is atomic under concurrency. The trigger only fills the
value when `sku IS NULL OR btrim(sku) = ''`, retries up to 5 times on collision, and — this
matters for the Asan bridge — **makes the SKU immutable**:

```sql
elsif (tg_op = 'UPDATE') then
  if new.sku is distinct from old.sku then
    new.sku := old.sku;      -- silently reverts
  end if;
```

Format confirmed against live data: `AFK-2026-00422`, `AFK-2026-00359`, … So the observed
`AFK-2026-00402` style is real and it is 5-digit zero-padded, not 5 significant digits.

**2. Identifier columns on `products`.** There are exactly three, plus the primary key.

| column | type | nullable | unique | fill rate |
|---|---|---|---|---|
| `id` | uuid | NO | `products_pkey` | 355/355 |
| `sku` | text | YES | **twice** — `products_sku_key` and `products_sku_unique`, two identical unique indexes | **355/355** |
| `barcode` | text | YES | `idx_products_barcode`, partial `WHERE barcode IS NOT NULL` | **0/355** |
| `dedup_key` | text | YES | partial unique, excludes `status='discontinued'` | 349/355 |

Totals: **355 products, 355 with `is_active = true`, 340 with `status = 'active'`.**

`sku` carries a redundant pair of unique constraints (`products_sku_key`, `products_sku_unique`)
— harmless, but worth knowing before anyone adds a third.

**3. `easy_code` does not exist.** Not on `products`, not anywhere in the schema:

```sql
select table_name, column_name from information_schema.columns
 where table_schema='public' and (column_name ilike '%easy%' or column_name ilike '%accounting%');
```

returns zero `%easy%` rows. The project-history claim that a `phase F` populated
`products.easy_code` from `accounting_code` is **not true of this database** — either it was
reverted or it never landed here. **M3 must therefore add a product-side code; there is
nothing to extend.**

**4. No field on `products` holds an external accounting code**, and adding one is safe.
`accounting_code` exists on `customers`, `external_parties` and `bank_accounts` — so the name
is established in this schema and reusing it on `products` is consistent rather than novel.
Collision check: no `products.accounting_code` exists. Breakage check:

- functions/procedures containing `SELECT * FROM products`: **0**
- functions declaring `products%ROWTYPE`: **0**
- views selecting `products.*`: **0** (the three views over `products` —
  `effective_currencies_view`, `v_promotion_suggestions`, `v_purchase_requests_legacy_unknown`
  — all project explicit columns)
- TypeScript `.from("products").select("*")`: **0**

Adding a nullable column cannot break any of them.

**5. Matching the 7 256 Asan products against AfraKala's 355 — all three strategies measured.**

| strategy | result |
|---|---|
| **barcode** | **0 matches, and structurally impossible.** `products.barcode` is populated 0/355 **and** `کالا.xlsx` `بارکدکـالا` is populated 0/7 256. Neither side has a single barcode. |
| **exact name** | **0 matches.** Not one of the 355 `products.name` values equals a `شرح کالا` byte for byte. |
| **normalized name** | **3 matches** (0.85 %). Normalisation: NFKC, Arabic→Persian ye/kaf/heh/hamza, Persian & Arabic-Indic digits→Latin, ZWNJ and harakat removed, all punctuation and whitespace stripped, casefolded. |

The three that match are `AFK-2026-00039` ⇄ `7009`, `AFK-2026-00178` ⇄ `7243`,
`AFK-2026-00179` ⇄ `7272`. No conflicts: each matched key hit exactly one product on each side.

Conflicts in the wider data, for M3's benefit: **60 normalized descriptions are duplicated
within Asan itself**, covering 122 of its 7 256 rows — so any future match on description alone
has a built-in ambiguity rate.

**Why the hit rate is so low, and why fuzzy matching must not be automatic.** The catalogues do
overlap; the descriptions simply disagree. Best-match similarity across all 355:

| similarity to closest Asan description | products |
|---|---|
| 1.00 (exact after normalisation) | 3 |
| ≥ 0.90 | 20 |
| ≥ 0.80 | 47 |
| ≥ 0.70 | 90 |
| < 0.70 | 195 |

But high similarity is **not** evidence of the same product. Real pairs at ≥ 0.90:

| sim | AfraKala | Asan |
|---|---|---|
| 0.944 | کولر24هزارجنرال **گلد** | `6137` کولر24هزارجنرال **لند** |
| 0.909 | بخاری برقی برفاب مدل **QH-2800** | `4720` بخاری برقی برفاب مدل **2200** |
| 0.857 | سرخ کن فیلیپس مدل **na230** | `6133` سرخ کن فیلیپس **NA350** |

Those are three *different* products each time — the discriminating token is the model number,
which is exactly what a character-similarity score dilutes. Auto-accepting a 0.90 match would
post a sale against the wrong product code in the owner's live accounting system, which is the
precise failure mode mission control §5.2 forbids.

### UNKNOWN

- **Whether the remaining 352 AfraKala products exist in Asan at all.** The evidence supports
  "many do, under different descriptions", but nothing in either dataset settles it per
  product. What would settle it: the owner confirming a sample of ~20 candidate pairs, or an
  Asan export that includes a field AfraKala also holds (a barcode, a supplier part number, or
  a model code).
- **Whether `سریال کـالا` (populated 7 256/7 256, 7 253 distinct) is a serial number or a
  second code.** It is fully populated where the barcode is fully empty, which makes it the
  only other candidate key in the Asan export. What would settle it: the owner saying what that
  column is, or one known product's value.

### Implications for build

1. **M3 must add a product-side external code.** `products.easy_code` does not exist, so there
   is nothing to extend; `products.accounting_code text` (nullable, unique-where-not-null)
   matches the naming already used on `customers`, `external_parties` and `bank_accounts`.
   Nullable + backfill, per mission control §5.5.
2. **No automatic product matching.** M3 should present ranked candidates and require a human
   decision, recording who decided and when. 352 of 355 products will need one, so the UI has
   to make that cheap — but it must not make it automatic.
3. **`sku` is immutable and unique** — it is a safe join key for AfraKala's own re-export
   bookkeeping, and it must never be repurposed to hold an Asan code.
4. **Do not plan around barcodes.** Both sides are empty; any design that assumes barcode
   matching is dead on arrival.
5. Asan's import screen has `گروه کدهای کالای جدید = 101`, which suggests Asan can mint codes
   for unknown products on import. If so, unmatched products need no pre-assigned code — but
   that is R7's question, not settled here.

---

## R2 — Person codes and phone normalization

### Findings

**1. `customers.accounting_code` is confirmed to be the Asan person code — cross-validated two
independent ways.**

14 customers; **11 carry an `accounting_code`, all 11 distinct, zero duplicates.** Five of the
eleven exist in `اشخاص.xlsx` as `کد حساب`, and in every case the name corroborates:

| code | AfraKala | Asan `نام حساب` |
|---|---|---|
| `102012` | خان محمدی | کریم خان محمدی(شاهرود) |
| `114090` | محسن جلالی | محسن جلالی (امل مازندران) |
| `600018` | محمدزین الدین | محمدزین الدین |
| `601505` | دستان | شاهو دستان |
| `601702` | مختارشاهمرادی | مختارخریددلارثابت |

Independently, matching on normalized mobile reaches the same codes without using the code at
all — `09123740712` to Asan `102012` (خان محمدی) and `09181752304` to Asan `601505` (دستان).
Two different keys agreeing on the same pairing is what makes this a confirmation rather than a
coincidence.

**Six codes do not exist in `اشخاص.xlsx`:** `002`, `1125623`, `119041`, `58279`, `58716`,
`9908`. They are either stale, test data, or from a different Asan company file. Listed for the
owner; nothing was changed.

**2. Where the Asan person code should live: `person_identifiers`, as a new `kind`.**

The identity model is already unified. `persons` (70 rows) is the root; `person_identifiers`
(28 rows, all `kind='mobile_e164'`) is the per-person identifier store, with
`value_raw` / `value_normalized`, a `status` lifecycle (`provisional|confirmed|revoked`),
`is_primary`, and `verified_at` / `verified_by`.

`kind` is a CHECK, not an enum:

```
person_identifiers_kind_check CHECK (kind = ANY (ARRAY[
  'mobile_e164','landline','national_id_ir','tax_id_ir',
  'company_reg_id_ir','email','iban','custom']))
```

**Recommendation: add `'asan_person_code'` to that CHECK and store it there**, with a partial
unique index mirroring `uq_person_identifiers_strong_active`
(`UNIQUE (kind, value_normalized) WHERE status <> 'revoked'`).

Reasoning:
- The brief's own point is decisive: one human may be a customer, a supplier and an external
  party at once, and the Asan code identifies the **person**, not the role. Putting it on
  `customers` would mean the same human has a code as a customer and none as a supplier.
- `person_identifiers` already provides everything this code needs and nothing it does not:
  uniqueness, a confirmation lifecycle (a matched-but-unverified code is exactly
  `status='provisional'`), and an audit trail of who verified it.
- It is an extension of an existing table, not a parallel structure — rule 14.
- Rejected: reusing `kind='custom'`. `uq_person_identifiers_custom_confirmed` makes
  `(kind,value_normalized)` unique across *all* custom identifiers, so an Asan code of `102012`
  would collide with any other custom identifier that happened to be `102012`.
- `customers.accounting_code` should be **kept and backfilled from** the person identifier, not
  deleted — it is live data and other code reads it.

**3. Every phone-bearing column in `public`.** Twelve real ones (plus two on the
`payment_receipts` backup table and the boolean `payment_receipts.is_mobile_bank_screenshot`,
which is not a phone despite matching the name pattern).

| column | populated | format |
|---|---|---|
| `sales_quotes.customer_phone` | 50 | all `09XXXXXXXXX` |
| `person_identifiers.value_raw` (mobile_e164) | 28 | all `09XXXXXXXXX` (with `value_normalized` `+989…`) |
| `customers.phone` | 14 | all `09XXXXXXXXX` |
| `profiles.phone` | 14 of 41 | all `09XXXXXXXXX` |
| `payment_receipts.payer_phone` | 5 of 6 | all `09XXXXXXXXX` |
| `suppliers.phone` | 3 of 15 | all `09XXXXXXXXX` |
| `payment_receipts.receiver_phone` | 2 of 6 | all `09XXXXXXXXX` |
| `visitors.phone` | 1 | `09XXXXXXXXX` |
| `external_parties.phone` | 0 of 1 | — |
| `waybills.sender_phone`, `waybills.receiver_phone`, `stock_alert_requests.customer_phone` | table empty | — |

**The result is better than expected: every populated phone number in the database is already
in `09XXXXXXXXX` form.** Zero rows with `+98`, `0098`, no-leading-zero, spaces, dashes,
parentheses, or landline shapes. Profiling script: `docs/verification/asan/phone-profile.sql`.

**4. Collisions under `09XXXXXXXXX` normalization: none within a person set, three across
tables.**

- Within `persons` (via `person_identifiers`): **0**. This is structural, not luck —
  `uq_person_identifiers_contact_global` already enforces `UNIQUE (kind, value_normalized)`
  for `mobile_e164` and `email` among non-revoked rows.
- Within `customers`: **0**.
- Across `customers` / `suppliers` / `profiles` / `visitors`, which share no uniqueness:

| normalized number | records |
|---|---|
| `09122270261` | suppliers:محمدرضا افرا · suppliers:تست دستی من · visitors:شرکت |
| `09903858654` | suppliers:12 · profiles:پورچیستا سعادت مبارکی |
| `09026009898` | customers:محمدزین الدین · profiles:حانیه ماهرو |

**Nothing was merged.** Two of the three are the pairs mission control section 6 explicitly
reserves for the owner, so they are listed and left alone. The third is the owner's own number
appearing on a real supplier record, a test record and a visitor record.

**5. Persian and Arabic-Indic digits in phone columns: none.** The profile query tags
`[۰-۹]` and `[٠-٩]` explicitly and both buckets are empty across all twelve columns.
Normalization must still handle them — the Asan workbook and any future paste-in are outside
this database's constraints — but no existing row needs converting.

**6. Matching the 488 Asan persons against AfraKala's 70.**

| strategy | matched |
|---|---|
| by Asan code (`accounting_code` to `کد حساب`) | **5** of 11 AfraKala codes |
| by normalized mobile | **4** of 28 AfraKala mobiles (Asan offers 326 usable mobiles of 342 populated) |
| by normalized name (`display_name` to `نام حساب`) | **3** of 63 AfraKala names |

Mobile matching found one person the code strategy missed — `محمدرضا افرا` = Asan `2063` — and
one **probable but unconfirmed** pairing worth the owner's eye:

| mobile | AfraKala | Asan | note |
|---|---|---|---|
| `09022270261` | پروین رضایی | `2574` دفتر(افرا کالا) | a person matched to an *office* account — same number, different kind of entity |

Name matching is weakest because Asan names carry qualifiers AfraKala does not
(`کریم خان محمدی(شاهرود)` vs `خان محمدی`).

### UNKNOWN

- **Why six AfraKala `accounting_code` values are absent from `اشخاص.xlsx`.** Settled by the
  owner confirming whether the export covers all Asan accounts or only one group, or by a
  fuller export.
- **Whether `پروین رضایی` and `دفتر(افرا کالا)` are the same account.** Settled only by the
  owner.
- **Asan's `کد ملی` column is 0 % populated** across all 488 rows, so national id cannot serve
  as a match key from this export. Whether Asan holds national ids at all is unknown.

### Implications for build

1. **Phone normalization is a formatting concern, not a data-repair project.** Everything is
   already `09XXXXXXXXX`. M3's normalizer needs to handle Persian/Arabic digits, `+98`, `0098`
   and separators for *incoming* Asan data and future input, but there is no backfill to do
   and no collision queue to clear beyond the three listed above.
2. **The Asan person code goes in `person_identifiers` as `kind='asan_person_code'`**, one
   migration that extends the CHECK and adds a partial unique index.
   `customers.accounting_code` stays and is backfilled from it.
3. **Person matching is far more tractable than product matching.** Between code, mobile and
   name, 7 of 70 persons resolve automatically with cross-validation available; the rest need
   the same human-review queue as products, but the volume is 70, not 7 256.
4. **The three phone collisions must be surfaced, never auto-merged** — and two of them are
   explicitly the owner's to decide.

---

## R3 — Existing import machinery

### Findings

**1. Excel parsing already exists, and the library is already a dependency.**
`xlsx` (SheetJS) `^0.18.5` — `package.json:84`. No `exceljs`, no `papaparse`, no server-side
parser. Every hit:

| path | direction | purpose |
|---|---|---|
| `src/components/persons/PersonImportForm.tsx:130` | **read** | `XLSX.read(buf,{type:"array"})` then `sheet_to_json` — imports persons |
| `src/shared/components/CustomerImportForm.tsx:92` | **read** | same shape — imports customers |
| `src/lib/export/sale-price-list-excel.ts:91-101` | write | sale price list |
| `src/routes/_app.accounting.receipts.tsx:229-238` | write | payment receipts |

All four are **client-side**: the file never reaches the server, and `XLSX.writeFile` triggers
the browser download directly. This matters for M3/M4 — there is no server-side Excel path to
extend, and building one would be a parallel system.

**2. There is a bulk-import UI, and it is the pattern to reuse.**
`PersonImportForm.tsx` (511 lines) is a complete three-step importer: choose file → map each
target field to a spreadsheet header → preview → import. It is the closest existing thing to
what M3 needs and it already handles the hard parts:

- header-driven mapping, so RTL column *order* never matters (exactly what the brief requires
  of the Asan workbooks)
- per-row validation with row numbers (`rowNum = i + 2`, header occupies row 1)
- errors collected per row rather than aborting the batch
- identifiers written best-effort so one bad phone does not discard the person that was
  already created
- a single `audit_logs` row summarising the run (`action:'persons_imported'`, with success,
  failed, total, warning count and file name)

`didar_import_log` exists — `(id, entity_type, didar_id, action, imported_at, error_message,
raw_data)` — but holds **0 rows**. It is the right *shape* for an external-id mapping table
(see R7.2) but it is not a working importer to extend.

**3. `identifiers-normalize.ts` is the normalizer M3 should extend, not replace.**
`src/lib/persons/identifiers-normalize.ts:98` exports
`normalizeIdentifier(kind, raw): NormalizeResult`, a pure client-safe module that deliberately
mirrors the `person_identifiers_kind_check` CHECK. It already provides:

- `toAsciiDigits()` — Persian `۰۱۲۳۴۵۶۷۸۹` and Arabic-Indic `٠١٢٣٤٥٦٧٨٩` to ASCII, idempotent
- Iranian national-id checksum, IBAN mod-97 checksum
- a discriminated `{ok:true,value_normalized} | {ok:false,error_code,message_fa}` result that
  never throws, with Persian messages ready for the UI

R2.5 asked whether Persian digits must be part of normalization: the answer is yes in
principle, and **this module already does it**.

**4. There is NO staging-then-approve pattern.** `PersonImportForm.handleImport()` loops the
rows and calls `createPersonFn` / `createIdentifierFn` one row at a time, committing as it
goes. The only review step is a **5-row preview** (`previewRows = rows.slice(0,5)`), which is a
mapping sanity check, not an approval gate. A failed row is reported after the fact; rows
before it are already committed.

**5. Storage buckets.** Seven, all private:

| bucket | size limit | MIME types |
|---|---|---|
| `delivery-receipts` | **100 MB** | jpeg, png, webp, pdf, **mp4, quicktime, webm** |
| `messenger-attachments` | 50 MB | 19 types |
| `documents` | 25 MB | 4 |
| `feedback-attachments` | 25 MB | 14 |
| `purchase-receipts` | 25 MB | 4 |
| `payment-receipt-documents` | 20 MB | 15, **including both Excel MIME types** (`application/vnd.ms-excel`, `…spreadsheetml.sheet`) |
| `product-images` | 5 MB | 4 |

`payment-receipt-documents` is the only bucket that already accepts `.xls`/`.xlsx`. But since
all existing Excel handling is client-side, **no bucket is needed for the Asan import at all** —
the file can be read in the browser exactly as `PersonImportForm` reads it today.

### UNKNOWN

- Nothing material. The import path is fully readable in source.

### Implications for build

1. **M3 extends `PersonImportForm`'s pattern; it does not invent one.** Header-driven mapping
   is already the right answer for RTL workbooks.
2. **M3 must add the staging-then-approve step that does not exist**, because R1 established
   that 352 of 355 products need a human decision. A row-by-row committing loop cannot express
   "propose 352 matches, let a human accept some". This is the single largest new piece of
   machinery in M3.
3. **Extend `normalizeIdentifier` with `asan_person_code`** rather than writing a second
   normalizer — the module is explicitly built to mirror the DB CHECK, so the CHECK migration
   and this file change together.
4. **No new storage bucket, no server-side parser.** Client-side `XLSX.read` is the established
   path and it works for both workbooks.

---

## R4 — Existing export machinery

### Findings

**1. Exactly two Excel exports exist, both client-side, both via SheetJS.**

| export | path | delivery |
|---|---|---|
| payment receipts | `src/routes/_app.accounting.receipts.tsx:229-240` | `XLSX.writeFile(wb, \`payment-receipts-${ts}.xlsx\`)` — browser download |
| sale price list | `src/lib/export/sale-price-list-excel.ts:91-101` | `XLSX.writeFile(wb, fileName)` — browser download |

Neither generates on the server; neither writes to storage; neither emails. `!cols` widths are
set from the header text length.

**2. The Asan seam already exists and is deliberately inert.**
`src/lib/export/export-modes.ts` (128 lines) defines:

- `ExportMode = "standard" | "asan"` and `ExportOptions = { mode, includeLineDetail }`,
  with `DEFAULT_EXPORT_OPTIONS = { mode:"standard", includeLineDetail:false }`
- `ExportRow = Record<string, string|number|boolean|null>` — "an ordered map of Persian header
  to cell value", which is exactly the shape `XLSX.utils.json_to_sheet` consumes
- `interface AsanExportAdapter { documentKind, label, isConfigured, buildRows(records, options) }`
- `AsanLayoutNotConfiguredError`, carrying a Persian message written for the accountant
- `ASAN_ADAPTERS` — **five** adapters, all `isConfigured:false`, all throwing:
  `sales_invoice`, `purchase_invoice`, `accounting_voucher`, `bank_receipt`, `bank_payment`

Those five map one-to-one onto the five deliverables in the kickoff README. `receipt-export-rows.ts`
(167 lines) supplies `buildStandardReceiptRows` and `buildLineDetailReceiptRows`; the route
picks between them on `includeLineDetail`.

**What "asan mode" does today: it refuses.** The module's own comment explains why — no
verified layout existed, and "a wrong layout that silently imports into the owner's accounting
software is worse than no feature". **That blocker is now resolved**: the M2 appendix carries
four layouts the owner captured personally and marked VERIFIED. M4's job is to fill in
`buildRows` for each adapter and flip `isConfigured`.

**3. There is no pre-invoice export. Confirmed.** No `XLSX` reference in
`_app.sales.quotes.index.tsx`, `_app.sales.quotes.tsx`, or any quote route. The only
quote-shaped export is the *line detail* variant of the receipts export, which reaches quote
items through `payment_receipt_links` and reports `sku_snapshot` / `title_snapshot`.

**4. Row selection already exists on the receipts export, and the export honours it.**
`_app.accounting.receipts.tsx` holds `statusFilter`, `dateFrom`, `dateTo`, `customerId` and
`page` (`filterKey`, line 265). The export builder re-applies the same predicates
(`q.gte("payment_date", dateFrom)` at line 145 mirrors line 284 in the list query), so the file
contains what the screen shows. There is no per-row checkbox selection anywhere.

### UNKNOWN

- **Column K on the Asan sales tab.** The appendix records it blank on the sales screen while
  the purchase screen has `پرداخت چک` in the same position. Settled only by the owner looking
  at the sales dialog. Until then it must stay empty and be recorded in
  `docs/asan/UNVERIFIED-LAYOUTS.md`.

### Implications for build

1. **M4 fills in the existing five adapters. It must not create a parallel export system** —
   the seam, the row type, the error type and the mode selector are all already there and
   already wired into the receipts route.
2. **The pre-invoice export is genuinely new**, but it should reuse `ExportRow` +
   `XLSX.writeFile` and the receipts page's filter-then-export shape rather than inventing a
   delivery mechanism.
3. **Date-range selection is already the established idiom** and matches Asan's own
   `از تاریخ` / `تا تاریخ` header controls, so the two line up naturally.
4. `AsanLayoutNotConfiguredError` should remain the behaviour for any layout that is still
   unverified — notably column K — rather than being deleted once the others are configured.

---

## R5 — Bank accounts, account codes, and the double case

### Findings

**1. `bank_accounts` — full structure and every row.**

Columns: `id, title, bank_name, iban, account_no, card_no, currency, opening_balance,
is_active, notes, created_at, updated_at, accounting_code, account_type`.

**The table holds exactly one row:**

| field | value |
|---|---|
| `id` | `32a4c282-85a3-485c-bbb4-dae3bb4febd6` |
| `bank_name` | ملت |
| `accounting_code` | **`TEMP-CHANGE-ME`** |
| `iban` | `1234567890-0-098765` |
| `account_no` | `123456789` |
| `is_active` | true |

So the placeholder the brief describes is the *only* bank account code in the system. Every
`account_kind='bank'` line in an Asan export would carry `TEMP-CHANGE-ME` today.

**2. What AfraKala can supply per `account_kind`.** The CHECK is
`journal_lines_account_kind_chk CHECK (account_kind = ANY (ARRAY['customer_credit','bank',
'external_party','invoice_ar','clearing','other']))`.

| `account_kind` | source of the Asan `کد حساب` | resolvable today? |
|---|---|---|
| `customer_credit` | `customers.accounting_code` via `account_ref_id` | **yes** — 11 of 14 customers have one (R2.1) |
| `bank` | `bank_accounts.accounting_code` | **structurally yes, practically no** — the single row holds `TEMP-CHANGE-ME` |
| `external_party` | **`external_parties.accounting_code` — the field EXISTS** | **no data** — 1 row, 0 with a code |
| `invoice_ar` | nothing | **no** — no receivables control-account code exists anywhere |
| `clearing` | nothing | **no** |
| `other` | nothing | **no** |

The brief asks explicitly whether `external_parties` has an accounting code field. **It does** —
`external_parties (id, full_name, national_id, phone, accounting_code, notes, is_active,
created_at, updated_at, person_id)`. M3 does **not** need to add it; it needs to populate it.

`invoice_ar`, `clearing` and `other` have no code source at all. They are control accounts, not
parties, so their codes are properties of the Asan chart of accounts rather than of any
AfraKala row — the owner must supply them, or those line kinds must be excluded from export.

**3. Asan models banks as persons, in the same `کد حساب` namespace. Evidence found.**

`اشخاص.xlsx` contains an account whose `نام حساب` is exactly **`ملت`**, with
**`کد حساب` = `3064`**, no mobile and no address — the shape of a ledger account rather than a
human. Fifteen accounts in the export are bank-like or cash-like:

| code | name |
|---|---|
| `3064` | **ملت** |
| `253` | چک نقد کن |
| `601295` | صراف حاجی سامان |
| `600949` | عسگری(تهران )نقدی |
| `998001`–`998010` | ten `… صندوق سرمایه` capital-fund accounts |

All 488 codes are numeric, 3–7 digits, ranging `127`–`1739003`. There is one namespace, not
two: a bank account and a customer are both just `کد حساب`.

**`3064` is therefore the strong candidate for the `TEMP-CHANGE-ME` placeholder** — same bank
name, correct shape, no competing `ملت` row. **It is not applied and not assumed**: the brief
lists the real Bank Mellat code as something the owner will supply, and posting a bank line
against a guessed control account is precisely the silent financial error §5.2 forbids.
Recorded here as evidence for the owner to confirm or correct.

**4. The double case (دوبل) is already representable — `payment_receipts` carries three party
codes, not two.**

```
payer_name, payer_phone, payer_accounting_code
receiver_name, receiver_phone, receiver_accounting_code
beneficiary_accounting_code
receiver_party_id -> external_parties, receiver_party_person_id -> persons
source_bank_account_id, destination_bank_account_id
```

That third code is the whole double case: money moves from the payer, into the *receiver's*
account, to settle the *beneficiary's* balance. "I owe A, and A tells me to pay into B's
account" is `beneficiary = A`, `receiver = B`. The reverse — handing a customer's bank account
to someone who owes me — is the same row with the roles swapped.

`receipt_type` CHECK: `invoice_payment | debt_payment | prepayment | positive_credit`
(live: 3 / 2 / 0 / 1). `document_channel` CHECK:
`card_to_card | paya | pol | satna | cash | cheque | other`.
`payment_receipt_links (id, receipt_id, invoice_id, amount, created_at, quote_id)` splits one
receipt across several documents, so a partial settlement is representable too.

**What is missing is not structure but data**: `external_parties` has 1 row with no
`accounting_code`, so the third party in a real دوبل document currently has no Asan code to
export. That is a backfill problem for M3, not a schema problem.

**5. `journal_entries`: 1 entry, and it balances.**

| entry | debit | credit | verdict |
|---|---|---|---|
| `6d6b1896-…` | 10 100 000 000.00 | 10 100 000 000.00 | **balanced** |

Its two lines:

| line | kind | ref | debit | credit | description |
|---|---|---|---|---|---|
| 1 | `bank` | `32a4c282…` (the ملت account) | 10 100 000 000 | 0 | واریز به حساب بانکی شرکت |
| 2 | `customer_credit` | `d05bbd0b…` | 0 | 10 100 000 000 | افزایش اعتبار/کاهش بدهی مشتری |

Zero unbalanced entries, so "how big is that problem" has the best possible answer: it does not
exist yet. `journal_lines_one_side` already forbids a line with both sides populated or
neither, and `journal_lines_debit_nonneg` / `_credit_nonneg` forbid negatives — the schema
prevents the classic malformed line by construction.

Note both descriptions above are values this program repaired in M1.1; before migration 279
they were `?` runs.

### UNKNOWN

- **The real Asan code for Bank Mellat.** `3064` is strongly indicated but unconfirmed. Settled
  by the owner reading it off the Asan account list. Until then `TEMP-CHANGE-ME` must make the
  export *fail loudly*, never silently emit the placeholder.
- **Asan codes for `invoice_ar`, `clearing` and `other`.** No evidence exists anywhere in
  AfraKala or in the export. Settled only by the owner naming the control accounts.
- **The correct title for the account called "12".** AfraKala has a supplier literally named
  `12` (mobile `09903858654`). That mobile appears in **no** Asan account, so the export cannot
  resolve it. This is also one of the two person matches mission control section 6 reserves for
  the owner, so it is reported and left alone.
- **Whether the ten `998001`–`998010` `صندوق سرمایه` accounts correspond to AfraKala staff
  cash boxes.** Their names match staff names seen elsewhere in this database, but nothing in
  AfraKala references them.

### Implications for build

1. **`TEMP-CHANGE-ME` must be a hard export blocker.** Any Asan file containing a `bank` line
   whose `accounting_code` is still the placeholder must refuse to generate, with a Persian
   message naming the account — the same discipline `AsanLayoutNotConfiguredError` already
   applies to layouts.
2. **M3 does not add `external_parties.accounting_code`; it backfills it.** The column exists.
3. **`invoice_ar` / `clearing` / `other` need an owner-supplied code map.** M3 should provide a
   place to record them (a settings row or a small mapping table) and M4 must refuse to export
   a line whose kind has no code, rather than emitting a blank `کد حساب`.
4. **The double case needs no schema work.** `beneficiary_accounting_code` plus
   `receiver_party_id` already express it. M4's `accounting_voucher` adapter maps
   payer/receiver/beneficiary onto Asan's `کد حساب` + `بدهکار` / `بستانکار` columns.
5. **Balance must be asserted at export time even though nothing is unbalanced today.** One
   entry is not a sample; the check costs nothing and an unbalanced document cannot be imported.

---

## R6 — Product video chain

### Findings

**0. Correction to the brief before anything else: `mandatory_category_services` does not
exist.** Migration `20260804190000_276` created **three** differently-named tables:

| table | rows | purpose |
|---|---|---|
| `product_service_types` | **1** | the catalogue of services |
| `category_required_services` | **1** | which service a category requires |
| `sales_quote_item_services` | **0** | the service attached to an actual quote line |

M5 must build against these names. Anything written against
`mandatory_category_services` would fail at once.

**1. What migration 276 actually does today.**

`product_service_types (id, code, name_fa, is_active, sort_order, created_at)` — one row:

| code | name_fa |
|---|---|
| `packaging` | بسته‌بندی |

`category_required_services (id, category_id, service_type_id, is_mandatory, display_text,
is_active, created_at, updated_at)` — one row:

| category | service | mandatory | display_text |
|---|---|---|---|
| `1a738b6c…` = **تلویزیون** (`slug='tv'`) | `packaging` | **true** | این کالا حتماً باید بسته‌بندی شود. |

The TV category holds **16 products**, matching the brief. `sales_quote_item_services
(id, quote_item_id, service_type_id, is_mandatory, display_text, source, created_at,
created_by)` is the per-line record — and it has **zero rows**, so the chain has never run
end to end.

So the service model is **already generic**: a service *type* joined to a *category* with an
`is_mandatory` flag. "Video" is a second row in `product_service_types`, not a new mechanism.

**2. `tasks` — and the capability is already there, unwired.**

```
id, title, description, assigned_to, status, priority, due_date,
reference_type, reference_id, created_by, created_at, updated_at,
completed_at, assigned_queue, proof_requirement
```

| constraint | allowed values |
|---|---|
| `tasks_status_check` | `pending, in_progress, done, blocked, canceled, expired` |
| `tasks_priority_check` | `low, normal, high, urgent` |
| `tasks_assigned_queue_check` | `sales, shipping, store, accounting, marketing` |
| `tasks_proof_requirement_check` | `none, receipt, carrier_waybill_photo, **product_video**` |

**`proof_requirement` already has a `product_video` value.** The exact capability M5 is asked
to build is already modelled in the schema — and `tasks` holds **0 rows**. This is mission
control section 3's pattern verbatim, and section 3 even names this table as the example.

Creation functions exist: `generate_marketing_tasks(date)` and `complete_marketing_task(uuid)`.

**Can a task be linked to a specific sales quote line?** Yes, by convention rather than by
constraint: `reference_type text` has **no CHECK**, and `reference_id uuid` is unconstrained,
so `('sales_quote_item', <quote_item_id>)` is representable immediately. There is no foreign
key, so nothing enforces that the referenced row exists — a trade-off M5 should state rather
than discover.

**3. The delivery-receipt flow.**

`delivery_receipts (id, type, invoice_id, customer_id, uploaded_by, storage_path, file_name,
file_size, mime_type, status, notes, review_deadline, reviewed_by, reviewed_at, created_at,
updated_at, customer_person_id)` — **0 rows**.

| constraint | values |
|---|---|
| `delivery_receipts_type_check` | `shipping_receipt`, `delivery_receipt` — **no video type** |
| `delivery_receipts_status_check` | `pending_review`, `confirmed`, `rejected`, `expired` |

RLS, read live from `pg_policies`:

| policy | cmd | rule |
|---|---|---|
| uploader sees own receipts | SELECT | `uploaded_by = uid()` |
| managers see all receipts | SELECT | admin or manager |
| sales sees pending review | SELECT | `status='pending_review'` and sales |
| **manager and sales can upload** | INSERT | admin **or manager or sales** |
| reviewer can update | UPDATE | admin or manager or sales |

**Bucket state confirms migration 263's fix is live.** `delivery-receipts` is private, limit
**104 857 600 bytes (100 MB)**, MIME allow-list:
`image/jpeg, image/png, image/webp, application/pdf, **video/mp4, video/quicktime, video/webm**`.
Video is permitted today, at 100 MB — the largest limit of any bucket in the system.

**4. Who should upload the video — the data cannot say, so the recommendation follows the
brief's own fallback.** `delivery_receipts` has **0 rows**, so there is no upload history to
infer from. What *is* established is that the INSERT policy already grants
admin / manager / **sales**, and that `assigned_queue` offers `shipping` and `store` for
whoever physically handles goods.

**Recommendation: the `sales` role uploads, exactly as it already may for delivery receipts**,
because that is the role that already owns this bucket and this table, and adding a new
uploading role would widen access with no evidence to justify it. If the owner says the store
or shipping staff film the TV, the change is one `assigned_queue` value plus one RLS role —
small, and better made on the owner's word than on a guess.

**5. Scope: any category with a mandatory service, not `slug='tv'`.**
`category_required_services` is already keyed by `category_id` + `service_type_id` +
`is_mandatory`. Hard-coding `slug='tv'` would create a second, narrower rule beside a general
one that already exists — and it would have to be reopened the first time the owner wants a
video for, say, refrigerators. The TV row is data, not design.

**6. Notification mechanisms — four exist; one is actually in use.**

| table | rows | verdict |
|---|---|---|
| **`notification_events`** | **3 024** | **live and working** — `(id, event_type, user_id, channel, payload, status, created_at, processed_at)` |
| `notification_queue` | — | present |
| `dashboard_ticker_events` | — | present |
| `price_alert_notifications` | — | present |

`notification_events` carries real traffic across nine event types, dominated by the purchase
chain (`purchase_request_unassigned` 2 779, `purchase_status_changed` 203,
`purchase_request_new` 103, `purchase_request_purchased` 87 …).

**M5 should emit a `notification_events` row.** It is the only one of the four with a
demonstrated write path, it already carries `user_id` and a JSON `payload`, and it already has
a `status`/`processed_at` lifecycle for delivery.

### UNKNOWN

- **Who physically films the product.** No `delivery_receipts` row has ever been created, so
  the question cannot be answered from data. Settled by the owner naming the role.
- **Whether the video should be a `delivery_receipts` row or a `tasks` proof.** Both are
  modelled: `delivery_receipts` has the bucket and the review lifecycle;
  `tasks.proof_requirement='product_video'` has the requirement flag. Nothing in the data
  indicates which the owner intends as the record of truth.
- **What `sales_quote_item_services.source` is meant to hold.** The column exists with no CHECK
  and no rows.

### Implications for build

1. **Use the real table names.** `product_service_types`, `category_required_services`,
   `sales_quote_item_services` — not `mandatory_category_services`.
2. **Adding "video" is a data row, not a schema change**: one `product_service_types` row
   (`code='product_video'`) and one `category_required_services` row for the TV category. The
   generic path then covers every future category for free.
3. **`tasks.proof_requirement='product_video'` already exists — wire it, do not re-invent it.**
   The task chain is built and has never been used; M5's real work is the call sites, not the
   schema.
4. **`delivery_receipts.type` needs a third value** if the video is stored there
   (`product_video`), since its CHECK currently allows only two. That is the one genuine schema
   change R6 identifies.
5. **The bucket needs nothing.** 100 MB and three video MIME types are already allowed.
6. **Notify through `notification_events`.**

---

## R7 — Document numbering for Asan

### Findings

**1. How documents are numbered today.**

`sales_quotes.quote_number` comes from `public.next_sales_quote_number(_year integer)`, the same
counter pattern as product SKUs:

```sql
INSERT INTO public.sales_quote_counters (year, last_value, updated_at) VALUES (_year, 1, now())
ON CONFLICT (year) DO UPDATE SET last_value = sales_quote_counters.last_value + 1 …
RETURNING last_value INTO _next;
RETURN 'SQ-' || _year::text || '-' || lpad(_next::text, 6, '0');
```

Live: `SQ-2026-000144`, `SQ-2026-000143`, … — **6** digits, zero-padded (product SKUs use 5).

Purchases are different: `purchases.number` exists but there is **no counter table and no
generator function** for it. The only sequence in the whole schema that looks like document
numbering is `payment_voucher_number_seq` (`last_value = 20`, already called). The five
sequences in `public` are `audit_logs_id_seq`, `score_snapshots_id_seq`,
`bot_api_usage_logs_id_seq`, `employee_score_events_id_seq`, `payment_voucher_number_seq`.

**2. Mapping an internal document to an external system's identifier — two partial precedents,
neither sufficient.**

- `didar_import_log (id, entity_type, didar_id, action, imported_at, error_message, raw_data)`
  is the right *shape*: an entity type, the foreign system's id, an action and the raw payload.
  It holds **0 rows**.
- `sales_quotes` and `invoices` each carry `accounting_sent_at`, `accounting_sent_by`,
  `accounting_registered_at`, `accounting_registered_by`. These are **in use**: of 50 quotes,
  **36 are marked registered** and **3 marked sent**. So the project already tracks *that* a
  document reached accounting — but it records no number, so it cannot answer "which Asan
  invoice number is this quote?".

**Neither stores an assigned external number.** M3 must add that mapping; nothing existing can
be extended to hold it without changing its meaning.

**3. Size of the first export batch.**

| scope | count | date range |
|---|---|---|
| `sales_quotes` **accepted** | **4** | 2026-07-19 → 2026-08-02 |
| `sales_quotes` all statuses | 50 | draft 35, canceled 9, accepted 4, rejected 1, sent 1 |
| `payment_receipts` **approved** | **1** (of 6) | 2026-07-25 → 2026-08-02 |
| `purchases` | **261** | 2026-07-13 → 2026-08-04 |
| `journal_entries` | **1** | 2026-07-25 |

The first batch is small on every axis except purchases. Only **4** sales documents are
export-eligible under `status='accepted'` — worth confirming with the owner, because 35 drafts
suggest the working definition of "finalized" may not be `accepted`.

**4. Reading of the Asan import controls.**

| control | reading |
|---|---|
| `شماره فاکتور اتوماتیک` (checkbox) | when ticked, Asan assigns invoice numbers itself and ignores column A; when unticked, column A is authoritative |
| `گروه کدهای کالای جدید` = 101 | the account/item **group** under which Asan creates codes for products it does not recognise — i.e. Asan *can* mint product codes on import |
| `گروه کدهای حسابهای جدید` = 101 | the same for unknown persons |
| `شماره سند` (accounting-document screen) | one voucher number for the whole document, not per line |
| `فقط تست شود ذخیره انجام نشود` | dry run — import is validated but nothing is saved |
| `محدودیت تاریخ` + `از تاریخ` / `تا تاریخ` | restricts which rows are accepted by date |

**Recommendation: supply numbers explicitly, starting at 1, and leave
`شماره فاکتور اتوماتیک` unticked.** The owner's requirement — "a document exported once keeps
its number forever, and re-exporting must never renumber it" — cannot be satisfied by letting
Asan assign numbers, because Asan would assign a *new* number on a re-import and AfraKala would
never learn what it was. Explicit numbering is the only option that makes the mapping durable
and re-export idempotent. No evidence was found against it.

`فقط تست شود` is worth surfacing in the UI as the recommended first step for any new layout.

**5. `journal_entries` → `journal_lines` maps cleanly onto `شماره سند`.**

One `journal_entries` row = one Asan document = one `شماره سند`. Its `journal_lines` rows are
the document's lines, each becoming one spreadsheet row with `کد حساب`, `شرح`, and its amount
in **either** `بدهکار` **or** `بستانکار` — never both, which the database already guarantees
via `journal_lines_one_side`. `line_no` gives the row order.

**One Excel file should contain ONE document.** The Layout 3 screen has a single `شماره سند`
field, so the number is a property of the import run rather than of a row; there is no column
in which a second document's number could live. Emitting several documents into one file would
silently merge them under one voucher number.

### UNKNOWN

- **Which `sales_quotes.status` counts as "finalized" for export.** `accepted` gives 4
  documents; `sent` gives 1. Settled by the owner.
- **How `purchases.number` is generated**, since no function or counter exists for it.
- **Whether `payment_voucher_number_seq` (at 20) is already feeding an Asan-facing number.**

### Implications for build

1. **M3 must add an export-number mapping table** — internal document id ↔ Asan document
   number ↔ document kind ↔ when it was first exported. `didar_import_log` shows the shape but
   must not be overloaded; it belongs to the Didar integration.
2. **Numbers are allocated once, at first export, and never recomputed.** The allocation must
   be transactional (the `ON CONFLICT … RETURNING` counter pattern already used twice in this
   schema is the proven local idiom).
3. **One document per file for the accounting voucher.** Sales and purchase invoice layouts do
   carry a per-row `شماره فاکتور`, so those may batch.
4. **Asan can mint codes for unknown products and persons** (`گروه کدهای … جدید = 101`), which
   materially softens R1's finding: 352 unmatched products do not block a first export, they
   just arrive in Asan as new items under group 101. Whether the owner *wants* that is a
   business decision, not a technical one.

---

## R8 — Persian calendar dates and number formats

### Findings

**1. Every Jalali utility in the codebase.** One library, `moment-jalaali ^0.10.4`
(`package.json:67`, types at `:91`). No `date-fns-jalali`, no `dayjs`, no hand-rolled
converter. Call sites:

| path | what it produces |
|---|---|
| `src/lib/messenger/format.ts:15` | `jYYYY/jMM/jDD HH:mm` |
| `src/lib/messenger/format.ts:32-33` | `jYYYY-jMM-jDD` for a same-day test, else `jYYYY/jMM/jDD` |
| `src/components/dashboard/DashboardHeader.tsx:13` | `dddd jD jMMMM jYYYY` (long, human) |
| `src/hooks/dashboard/useDashboardChart.ts:70` | chart axis labels |
| `src/components/common/PersianDatePicker.tsx` | the input control |
| `src/lib/marketing/tehran-date.ts` | **Gregorian** `YYYY-MM-DD` in Asia/Tehran, via `Intl`, not Jalali |

**2. The exact format Asan wants already exists — but with the wrong digits, and there is a
trap.**

`format("jYYYY/jMM/jDD")` produces four-digit year, slash, zero-padded month, slash,
zero-padded day: structurally identical to Asan's `1405/05/12`.

**However, all three formatting modules call**

```js
moment.loadPersian({ usePersianDigits: true, dialect: "persian-modern" });
```

`loadPersian` mutates the **shared module-level moment instance**. So once
`messenger/format.ts`, `DashboardHeader.tsx` or `useDashboardChart.ts` has been imported
anywhere in the bundle, every later `format("jYYYY/jMM/jDD")` anywhere in the app emits
**Persian digits** — `۱۴۰۵/۰۵/۱۲`, not `1405/05/12`.

**M4 therefore needs its own formatter**, and it must not depend on module import order. The
safe implementation is to format and then fold Persian/Arabic-Indic digits back to ASCII — the
codebase already has exactly that function, `toAsciiDigits()` in
`src/lib/persons/identifiers-normalize.ts:41`, which is pure and idempotent.

**3. Timezone.** The server is UTC and the database is the authority:

```sql
CREATE OR REPLACE FUNCTION public.tehran_today() RETURNS date LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE 'Asia/Tehran')::date $$;
```

The client mirror is `src/lib/marketing/tehran-date.ts`, built on
`Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tehran' })` — deliberately not a fixed +03:30
offset, and its own comment explains why: a UTC-derived day is wrong in Tehran every evening
from 20:30 to midnight, and a hard-coded offset would break if Iran restored DST.

A `timestamptz` becomes the correct Tehran calendar day by `AT TIME ZONE 'Asia/Tehran'` first,
`::date` second, and only then Jalali conversion. Converting before shifting is the classic
off-by-one-day bug.

**4. Currency unit — AfraKala is Toman, proven; Asan is probably Toman, NOT proven.**

**AfraKala side — explicit unit labels stored beside the amounts, not inferred:**

| evidence | value |
|---|---|
| `products.base_currency` | `DEFAULT 'toman'`; live split **toman 214, usd 140, aed 1** |
| `purchases.cash_price_currency` | literal `'toman'` on a real row with `cash_price = 10 000 000 000` |
| `market_indicators.unit` | `'toman'` for every currency/gold/coin indicator |
| `market_rate_ticks.unit` | `'toman'` |

**Asan side — inference only.** `اشخاص.xlsx` carries balance columns; 486 of 488 accounts have
a non-zero `مانده حساب`:

| | value |
|---|---|
| largest | 101 676 374 980 — `[601643] خضری دلاری تومانی` |
| median | **6 000 000** |
| smallest non-zero | 1 |

A median customer balance of 6 000 000 reads naturally as **6 million Toman** (~$100 for a
home-appliance customer). Read as Rial it would be 600 000 Toman, about one dollar, which is
implausible as a typical outstanding balance. The magnitudes therefore favour Toman — but
magnitude is not a unit label, and the workbook contains no unit anywhere.

**Verdict: UNKNOWN for Asan.** Per the brief, M4 must make the unit **explicit and
configurable** rather than assume parity.

### UNKNOWN

- **The unit Asan expects on import.** Nothing in `اشخاص.xlsx`, `کالا.xlsx` or the four
  captured screens states it. Settled by the owner reading one known invoice total in Asan and
  comparing it to the same figure in AfraKala — a single data point ends this permanently.
- Whether `market_rate_ticks`'s single row (`AED_TEHRAN = 68 789 797`, unit `toman`) is real or
  test data. The value is far outside any plausible AED rate, so it is treated as test data and
  excluded from the currency argument above.

### Implications for build

1. **M4 needs a dedicated `formatJalaliForAsan(date)`** returning `YYYY/MM/DD` in **Latin**
   digits, implemented as `moment(...).format("jYYYY/jMM/jDD")` piped through
   `toAsciiDigits()`. It must never rely on `loadPersian` not having run — it will have.
2. **Convert timezone before calendar.** `AT TIME ZONE 'Asia/Tehran'` → `::date` → Jalali.
3. **The currency unit must be an explicit, visible setting with no silent default.** Given
   §5.2 — "wrong data entering the live accounting software is worse than no feature" — the
   export should show the chosen unit in the UI, record it in the generated file's metadata or
   filename, and refuse to run until the owner has confirmed it once.
4. A ×10 error is the single most damaging outcome in this program. The conversion factor
   belongs in one place, applied at one point, and asserted by a test that fails loudly if the
   default ever changes silently.

---

## Blocking issues for the build missions

Ordered by how much damage they cause if ignored. The first three are the ones that could put
wrong numbers into the owner's live accounting system.

### 1. The currency unit Asan expects is UNKNOWN — and this is the ×10 risk

AfraKala is provably Toman (explicit `base_currency`, `cash_price_currency`, `unit` labels).
Asan's side is inferred from balance magnitudes only; no artefact states a unit.

**Effect on M4:** an amount column cannot be emitted on an assumption. M4 must make the unit an
explicit setting, show it in the export UI, and refuse to produce a file until the owner has
confirmed it once. **Not blocking the build — blocking a silent default.**

**What ends it:** the owner reads one known invoice total in Asan and compares it to the same
figure in AfraKala. One data point.

### 2. `bank_accounts.accounting_code` is `TEMP-CHANGE-ME` — the only bank account there is

Every `account_kind='bank'` line would carry the placeholder. Asan `3064` (named `ملت`) is the
strong candidate and is **not** assumed.

**Effect on M4:** any file containing a bank line with an unresolved code must refuse to
generate, naming the account, exactly as `AsanLayoutNotConfiguredError` already refuses an
unverified layout.

### 3. Three `account_kind` values have no code source anywhere

`invoice_ar`, `clearing` and `other` are control accounts of the Asan chart, not AfraKala
parties. Nothing in the database or either workbook can supply their `کد حساب`.

**Effect on M3/M4:** M3 needs somewhere to record an owner-supplied code map; M4 must refuse a
line whose kind has no code rather than emit a blank `کد حساب`. Also `external_parties` has 1
row and **0** codes, so a real دوبل document has no third-party code to export yet — a
backfill, not a schema gap.

### 4. The brief names a table that does not exist

M6 work is specified against `mandatory_category_services`. Migration 276 actually created
`product_service_types`, `category_required_services` and `sales_quote_item_services`.
**M5 must use the real names or it will fail on its first statement.**

### 5. Column K of the Asan sales tab is unverified

Purchase has `پرداخت چک` in position K; sales appeared blank. M4 must leave K empty and record
it in `docs/asan/UNVERIFIED-LAYOUTS.md`. Not blocking — but it must not be guessed.

### 6. 352 of 355 products have no Asan code, and fuzzy matching is unsafe

Barcode matching is impossible (0 % on both sides), exact name matches 0, normalized name
matches 3. Similarity ≥ 0.90 demonstrably pairs *different* products.

**Softened by R7.4:** `گروه کدهای کالای جدید = 101` means Asan mints codes for unrecognised
items on import, so this does not block a first export — unmatched products simply arrive as
new items under group 101. Whether the owner wants that is a business decision. What is *not*
acceptable is auto-accepting a fuzzy match.

### 7. "Finalized" is undefined for sales quotes

Only **4** of 50 quotes are `accepted`; 35 are `draft`. If `accepted` is the export gate, the
first batch is four documents. Needs one word from the owner.

### 8. There is no staging-then-approve machinery to extend

`PersonImportForm` commits row by row with a 5-row preview. Given 352 product decisions, M3 has
to build the review queue rather than extend one. This is the largest genuinely new piece of
work the research identified.

---

## Summary for the owner — what I need from you

1. **Currency unit**: does Asan expect Toman or Rial? (One invoice total settles it.)
2. **Bank Mellat's real Asan code** — is it `3064`? And the correct title for account `12`.
3. **Column K on the sales tab** — blank, or `پرداخت چک` as on the purchase tab?
4. **Asan codes for the control accounts**: receivables (`invoice_ar`), clearing.
5. **Which quote status means "finalized"** for export — `accepted`, or something else?
6. **Who films the product video** — sales, store, or shipping?
7. Confirmation that unmatched products may arrive in Asan as new items under group `101`.

Items 1–4 are the ones that affect financial correctness. The rest affect scope.
