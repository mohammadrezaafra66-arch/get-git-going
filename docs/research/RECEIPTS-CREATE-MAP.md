# Receipts/Create — full two-layer map — 2026-08-17

**Code HEAD:** `99f6bd58` (`99f6bd589f308f131402499f09cfdcc73fdbf819`)
**Live `APP_GIT_SHA`:** `bfcc723a`
**Match: NO — the running build is 3 commits behind.**
**Branch:** `staging` (working tree is exactly `origin/staging`: 0 ahead, 0 behind)
**git status:** 4 changed files before this mission (all untracked, pre-existing) — unchanged by this mission except for the report files it wrote.

### About the build mismatch

`git log --oneline bfcc723a..99f6bd58` returns three commits:

```
99f6bd58 Merge pull request #294 from mohammadrezaafra66-arch/staging
f2d9b5ab Merge pull request #293 from mohammadrezaafra66-arch/docs/WPC-progress-2026-08-15
cf26b420 docs(progress): record the 2026-08-15 work and refresh the stale status block
```

`git diff --name-only bfcc723a..99f6bd58` returns exactly one file: **`PROGRESS.md`**.

**Therefore the page the user sees at `http://192.168.170.8:3100/accounting/receipts/create` is byte-identical to the code mapped here.** The lag is documentation-only. This is recorded because the mission required the comparison, not because it affects the map.

### Deviations from the mission text

1. **`git pull` was not run.** Section 2 prescribed it, but `git rev-list --count HEAD..origin/staging` returned `0`, so a pull would have been a no-op merge, and Section 0 forbids merges. The tree was already current. No merge, no stash, no checkout was performed.
2. **The temp SQL did not go to `C:\afrakala-backups\`.** That directory does not exist on this host and creating it would have been an extra host write. Sub-agents B and C wrote their ASCII-only SQL to the session scratchpad and `docker cp`'d it into `afrakala-lan-db:/tmp/`. Host copies were deleted; container `/tmp` copies were deliberately left in place, since deleting them would be a container write.

### Method and provenance

Three sub-agents worked on disjoint areas, then their findings were merged here.

| Agent | Scope | Scratch report |
|---|---|---|
| A | `src/` only, never touched the database | `docs/research/_a_frontend.md` |
| B | live DB catalog via read-only `psql`, never read `src/` | `docs/research/_b_database.md` |
| C | wiring, ran after A and B | `docs/research/_c_wiring.md` |

All database facts come from live `pg_catalog` / `information_schema` / `pg_policies` / `pg_get_functiondef` output against `afrakala-lan-db`, database `afrakala`, as `supabase_admin`. `supabase/schema_full_export.sql` was not used. No function on the posting path was executed (`auth.uid()` is NULL in `psql`; those functions are role-gated and would raise `42501`) — their bodies were read and their effects corroborated against the live `journal_entries` / `journal_lines` rows.

Query ids below (`B6i`, `C-Q16`, …) refer to the `\qecho` section markers in the sub-agents' SQL files, cited in their scratch reports.

---

## 1. INPUT FIELDS (what the user fills)

The route file is `src/routes/_app.accounting.receipts.create.tsx`; it renders `<PaymentReceiptForm />` with **no props** (`:31`). The form is `src/shared/components/PaymentReceiptForm.tsx:289`, a 2205-line component. `useForm` at `:318-355`, `mode: "onBlur"`, `resolver: zodResolver(schema)`; the zod schema is `:200-263`.

**33 user-fillable control groups.** "Required" below is taken from the zod schema, never from the red `*` in the label. All `file:line` references are `PaymentReceiptForm.tsx` unless stated.

| # | Persian label | form key | type | required (zod) | default | conditional visibility | client validation / transform | file:line |
|---|---|---|---|---|---|---|---|---|
| 1 | مشتری | `customer_id` | searchable-select | **yes** — `z.string().uuid(…)` (`:202`) | `""` | always | `setValue(…,{shouldValidate:true})`; search debounced 350 ms | `:1212-1274` |
| 2 | نوع فیش | `receipt_type` | select (4) | **yes** — `z.enum(RECEIPT_TYPES)` (`:203`) | `"invoice_payment"` | always | changing it resets `allocations` (`:687-694`) | `:1277-1299` |
| 3 | اتصال به پیش‌فاکتورها + مبلغ تخصیص | `allocations` — **not in zod**, React state (`:308`) | repeatable number inputs | conditionally, enforced imperatively (`:928-943`) | `[]` | **`requiresInvoiceLinks(watchedReceiptType)`** (`:1324`) | row `min={1} max={a.remaining}`; submit disabled if `length===0 \|\| overAllocated` (`:2073-2077`) | `:1324-1519` |
| 4 | جستجو و تکمیل خودکار (واریزکننده) | — (writes 5/6/7) | popover helper | n/a | — | always | query gated on `≥2` chars | `:1525-1534` |
| 5 | نام و نام‌خانوادگی (واریزکننده) | `payer_name` | text | **yes** — `.min(2).max(150)` (`:204`) | `""` | always | `.trim()` | `:1537-1545` |
| 6 | شماره موبایل (واریزکننده) | `payer_phone` | text | no (`:205`) | `""` | always | none client-side | `:1546-1549` |
| 7 | کد حسابداری (واریزکننده) | `payer_accounting_code` | text | no (`:206`) | `""` | always | **onBlur** resolver fills empty name/phone (`:565-608`) | `:1550-1556` |
| 8 | جستجو و تکمیل خودکار (گیرنده) | — (writes 11/12/13) | popover helper | n/a | — | always | — | `:1564-1573` |
| 9 | حالت ۱: حساب بانکی خودِ ما | `destination_bank_account_id` | select | **conditional (XOR refine `:251-254`)** | `""` | always rendered, `disabled` when mode 2 set (`:1589`) | clears `receiver_party_id`; back-fills `destination_bank` + `bank_name` when empty (`:1596-1605`) | `:1583-1620` |
| 10 | حالت ۲: شخص/طرف حساب خارجی | `receiver_party_id` | select | **conditional (same refine)** | `""` | always rendered, `disabled` when mode 1 set (`:1627`) | clears mode 1; **overwrites** `receiver_name` (`:1636-1644`) | `:1621-1660` |
| 11 | نام گیرنده | `receiver_name` | text | **yes** — `.min(2).max(150)` (`:207`) | `""` | always | may be overwritten by #10 | `:1667-1675` |
| 12 | شماره موبایل (گیرنده) | `receiver_phone` | text | no (`:208`) | `""` | always | none | `:1676-1679` |
| 13 | کد حسابداری (گیرنده) | `receiver_accounting_code` | text | no (`:209`) | `""` | always | **onBlur** resolver (`:609-620`) | `:1680-1688` |
| 14 | کد آسان ذینفع | `beneficiary_accounting_code` | text | no (`:210`) | `""` | always | **onBlur** resolver sets `beneficiaryName` (`:623-637`) | `:1703-1712` |
| 15 | مبلغ (تومان) | `amount` | number | **yes** — `.positive().max(1e12)` (`:211-214`) | `undefined` | always | `valueAsNumber` | `:1772-1786` |
| 16 | شماره پیگیری | `tracking_number` | text | **yes** — `.min(1).max(100)` (`:220-224`) | `""` | always | part of the duplicate key (`:950`) | `:1788-1796` |
| 17 | تاریخ روی فیش واریزی | `payment_date` | `JalaliDateInput` | **yes** — `.min(1)` + `<= today` refine (`:215-218`) | `""` | always | `max={today}`; OCR fills only when empty | `:1812-1836` |
| 18 | ساعت واریز | `payment_time` | `<input type="time">` | **yes** — `/^\d{2}:\d{2}$/` (`:219`) | `""` | always | OCR copies `receipt_time` in when empty | `:1838-1849` |
| 19 | توضیحات | `description` | textarea | no (`:246`) | `""` | always | OCR fills when empty | `:1852-1855` |
| 20 | حساب مبدأ ما (اختیاری) | `source_bank_account_id` | select | no (`:247`) | `""` | always | fills `source_bank` when empty (`:1892-1894`) | `:1881-1908` |
| 21 | *(no label)* `نام بانک مبدأ (متن)` | `source_bank` | text | no (`:226`) | `""` | always | OCR fills when empty | `:1909-1913` |
| 22 | نام بانک مقصد (متن) | `destination_bank` | text | no (`:227`) | `""` | always | OCR fills when empty; back-filled by #9 | `:1916-1919` |
| 23 | ساعت روی فیش | `receipt_time` | `<input type="time">` | no, format-checked (`:232-237`) | `""` | always | OCR via `toHtmlTimeValue` | `:1921-1927` |
| 24 | روش انتقال | `document_channel` | select (7) | **no** — `""` is a legal union member (`:238-241`) | `""` | always | on change ≠ cheque, clears #25/#26 (`:1948-1951`) | `:1929-1965` |
| 25 | شمارهٔ چک | `cheque_number` | text | **conditional** — required when channel = cheque (`:260-262`), forbidden otherwise (`:256-259`) | `""` | **`document_channel === "cheque"`** (`:1968`) | nulled in payload off-channel (`:1005`) | `:1970-1978` |
| 26 | تاریخ سررسید چک | `cheque_due_date` | `JalaliDateInput` (no `max`) | forbidden off-cheque (`:256-259`) | `""` | same wrapper (`:1968`) | nulled in payload off-channel (`:1006-1007`) | `:1979-1988` |
| 27 | نام واریزکننده روی فیش | `payer_name_on_receipt` | text | no (`:228`) | `""` | always | OCR fills; blank ⇒ medium client warning | `:1992-1995` |
| 28 | نام گیرنده روی فیش | `receiver_name_on_receipt` | text | no (`:229`) | `""` | always | OCR fills when empty | `:1997-2000` |
| 29 | پرفراژ دارد؟ | `has_perforation` | checkbox | boolean (`:230`) | `false` | always | `false` ⇒ medium client warning | `:2003-2011` |
| 30 | فیش تایپی است؟ | `is_typed_receipt` | checkbox | boolean (`:244`) | `false` | always | `true` ⇒ **high** client warning | `:2012-2020` |
| 31 | رسید اسکرین‌شات از همراه بانک است؟ | `is_mobile_bank_screenshot` | checkbox | boolean (`:231`) | `false` | always | passed to evaluator but **never read** — see §7 | `:2021-2031` |
| 32 | مستندات فیش (آپلود) | `stagedFiles` — **not in zod** (`:310`) | `<input type="file" multiple>` | no | `[]` | always | 20 MB/file, ≤10 files, extension+MIME allowlist, exe/bat/js blocked; picking a file **triggers OCR** | `:2036-2040`; picker `PaymentReceiptDocuments.tsx:426-527` |
| 33 | اطلاعات تکمیلی (dynamic) | `customData` — **not in zod** (`:311`) | select/date/number/text per `field_type` | per-field from the DB row | `{}` | **`customFields.length > 0`** (`:2048`) | `validateCustomData` runs first and aborts submit (`:1123-1128`) | `:2048-2057`; `WaybillCustomFieldsInput.tsx:58-126` |

### Zod keys with no rendered input — rebuild trap

| zod key | how it gets a value | sent to DB? |
|---|---|---|
| `bank_name` (`:225`) | **only** programmatically, from the mode-1 bank select when empty (`:1602-1604`). No input exists anywhere in the file. | Yes (`:994`) — and it is part of the duplicate-detection key (`:950-958`) |
| `receipt_image_url` (`:245`) | **never set anywhere.** Only schema, default, and payload reference it. | Yes, always `null` (`:1009`) |

---

## 2. DISPLAY-ONLY ELEMENTS (what the user reads)

30 elements. The full enumeration is in `_a_frontend.md` §A3; the ones that matter for a rebuild:

| What it shows | Where the value comes from | file:line |
|---|---|---|
| Receipt-type hint sentence | `RECEIPT_TYPE_HINT_FA[watchedReceiptType]` | `:1300-1302` |
| «پیشنهاد اتصال به پیش‌فاکتور» panel (invoice no., confidence badge, remaining, reason) | client-side `suggestions` memo; rank `= (exact?0:1)*1000 + closeness*100 + min(dateProximity,365)*0.05`, `.slice(0,3)` | `:784-843`, panel `:1326-1395` |
| «مجموع تخصیص: X از Y» + مازاد/باقی‌مانده/برابر | `totalAllocated` (`:754`), `overAllocated` (`:755`), `allocationDiff` (`:756`) | `:1499-1515` |
| «نام ذینفع (خودکار)» readOnly input | `beneficiaryName` state, set **only** by `handleBeneficiaryCodeBlur` | `:1713-1716`, `:623-637` |
| **«پیش‌نمایش سند حسابداری خودکار»** | see below | `:1720-1768` |
| «تاریخ ثبت فیش» readOnly | `isoToJalaliDisplay(today)` where `const today` is **module-level** (`:174`) — computed once at import, does not roll over at midnight | `:1798-1810` |
| Amber OCR banner + up to 6 OCR warnings | `ocrAssistNotice` (`:314`), `ocrReviewWarnings` (`:315`) | `:1865-1877` |
| Duplicate dialog «احتمال ثبت فیش تکراری» | `duplicateCount` from the `head:true` count query | `:2096-2130` |
| Security-warning dialog «هشدارهای امنیتی فیش» | `pendingWarnings` + `pendingRuleWarnings` | `:2132-2183` |
| Blocking dialog «ثبت ممکن نیست» | `blockingViolations` = `splitViolations(…).blocking` | `:2185-2202` |
| Per-field zod errors | `form.formState.errors` — **rendered for only 11 keys.** No error paragraph exists for `payer_phone`, `payer_accounting_code`, `receiver_phone`, `receiver_accounting_code`, `beneficiary_accounting_code`, `description`, `source_bank`, `destination_bank`, `*_name_on_receipt`, `destination_bank_account_id` — a `.max()` violation on those is silent | `:1271` … `:1987` |

### 2a. The «پیش‌نمایش سند حسابداری خودکار» block, verbatim

An IIFE inside JSX at `:1721-1768`. Visibility gate (`:1722-1726`):

```tsx
const payerCode = form.watch("payer_accounting_code");
const benefCode =
  form.watch("beneficiary_accounting_code") || form.watch("receiver_accounting_code");
const amt = form.watch("amount") || 0;
if (!payerCode || !benefCode || amt <= 0) return null;
```

Caption (`:1730-1732`): «پس از تأیید این فیش، سند زیر به‌صورت خودکار ثبت می‌شود.»

| Row | شرح | کد آسان | بدهکار | بستانکار | lines |
|---|---|---|---|---|---|
| 1 (debit) | `ذینفع (طلبکار) {beneficiaryName ? "- …" : ""}` | `toFaDigits(benefCode)` = `beneficiary_accounting_code \|\| receiver_accounting_code` | `formatNumber(amt)` — the full amount | `—` | `:1743-1752` |
| 2 (credit) | `پرداخت‌کننده {payer_name}` | `toFaDigits(payerCode)` = `payer_accounting_code` | `—` | `formatNumber(amt)` — the full amount | `:1753-1763` |

**Mechanically:** a pure client-side hardcoded two-line table. It issues **no query and no RPC** — nothing in the file could confirm what the database would actually post. It ignores `receipt_type` (all four values render identically), `document_channel`, the receiver mode (bank vs external party), and the invoice allocations. When `benefCode` falls back to the receiver code, the row's label still reads `beneficiaryName`, which is cleared only on an *empty blur* of the beneficiary field — so a stale name can display.

**This preview does not describe the entry the database writes.** See §7 and §10.

---

## 3. DATA SOURCES ON LOAD

12 sources. Six fire on mount (#2, #3, #6, #8, #9, #10); #1 needs ≥2 chars + an open popover; #7 needs a customer *and* `invoice_payment`; #4, #5, #11 are event-driven.

| # | Trigger / queryKey | Table or RPC | Columns | Filters / order / limit | Feeds | file:line |
|---|---|---|---|---|---|---|
| 1 | `["party-lookup", debounced]`, enabled ≥2 chars | `customers` | `id, name, phone, accounting_code` | `.or(name/phone/accounting_code ilike)`, `.order(name)`, `.limit(20)`; `%`/`_` stripped | both «جستجو و تکمیل خودکار» popovers | `:95-111` |
| 2 | `["validation-rules","receipt"]` | `validation_rules` | `id, scope, field_key, rule_type, enabled, severity, message` | `.eq("scope","receipt")` | submit-time rule dialogs | `:553-557` |
| 3 | `["validation-rules","journal_entry"]` | `validation_rules` | same | `.eq("scope","journal_entry")` | same; one rule dropped in mode 2 (`:1139-1148`) | `:558-562` |
| 4 | `resolveByAccountingCode(code)` — 3 onBlur handlers | `customers`, then `external_parties` | `id,name,phone` / `id,full_name,phone` | `.eq("accounting_code", c).maybeSingle()` | auto-fill + `beneficiaryName` | `:565-595` |
| 5 | `buildValidCodesSet(values)` — once per submit | `customers`, then `external_parties` | `accounting_code` | `.in("accounting_code", codes)`; returns empty Set without querying when both blank | the `accounting_code_valid` rule | `:639-662` |
| 6 | `["receipt-form-customers", debouncedCustomer]` | `customers` | `id, name, phone` | `.order(name).limit(20)`; **no `accounting_code`**, unlike #1 | مشتری combobox | `:664-679` |
| 7 | `["receipt-form-invoices", customerId]`, gated | **two queries**: `sales_quotes`, then `payment_receipt_links` | `id,quote_number,final_amount,status,created_at,expires_at`; `quote_id,amount,receipt:payment_receipts!inner(status)` | `.eq(customer_id).eq(status,'accepted').order(created_at desc).limit(50)`; then `.in("quote_id", ids)`. Client-side: `paid` counts only `receipt.status==='approved'`; `remaining>0.001` | invoice picker + suggestions | `:697-752` |
| 8 | `["receipt-form-bank-accounts"]` | `bank_accounts` | `id, title, bank_name, is_active` | `.eq(is_active,true).order(title)` — **no `.limit()`** | fields #9 and #20 | `:854-866` |
| 9 | `["receipt-form-external-parties"]` | `external_parties` | `id, full_name, phone, accounting_code, is_active` | `.eq(is_active,true).order(full_name)` — **no `.limit()`** | field #10 | `:868-886` |
| 10 | `["payment-receipt-custom-fields","active"]` | `payment_receipt_custom_fields` | `id, field_key, field_label, field_type, field_options, is_required, is_active, sort_order` | `.eq(is_active,true).order(sort_order).limit(200)` | `WaybillCustomFieldsInput` | `:889-904` |
| 11 | `extractReceiptFromBytes(...)` on each newly staged file | TanStack **server function**, not a table | returns `{raw_text, method, warnings, structured, engine_confidence, ok, disabled, reason}` | dedup by `name\|size\|lastModified`; server enforces admin/accountant + 20 MB | auto-fills 9 fields + description | `:386-393`; `src/lib/receipt-ocr-bytes.functions.ts` |
| 12 | `useAuth()` | AuthProvider context | `user`, `session` | — | `created_by`, audit rows, OCR bearer token | `:290` |

Sources 8 and 9 have no `.limit()`, contrary to CLAUDE.md rule 11. Both are filtered to `is_active = true`.

---

## 4. SUBMIT PATH

### Button and validation gate

`<Button type="submit" disabled={mutation.isPending || (requiresInvoiceLinks(...) && (allocations.length === 0 || overAllocated))}>ثبت فیش</Button>` (`:2071-2081`).

`form.handleSubmit(onValid, onInvalid)` (`:1121-1205`):

- **`onInvalid`** (`:1182-1204`) — toasts `فیلدهای ناقص: …` using a 9-key Persian dict, then `document.querySelector('[name="…"]')` → scroll + focus. Fields set via `setValue` (both receiver selects, `payment_date`, `document_channel`) have **no `name` attribute**, so the scroll silently no-ops for them.
- **`onValid`** (`:1122-1181`), in order:
  1. `validateCustomData(customFields, customData)` → abort on any error (`:1123-1128`)
  2. `buildValidCodesSet(v)` (`:1131`)
  3. In mode 2, drop the `journal_entry / receiver_accounting_code / required` rule (`:1139-1148`)
  4. `evaluateRules` over **only four** field values: `receiver_name`, `payer_name`, `payer_accounting_code`, `receiver_accounting_code` (`:1149-1155`)
  5. blocking violations → dialog + return (`:1157-1161`)
  6. `evaluateFormWarnings(...)` → warnings dialog + return (`:1162-1178`)
  7. otherwise `mutation.mutate({ values, allocations, securityWarnings: [], customData })` (`:1179`)

### `mutationFn` (`:907-1100`) — order of operations

| # | Action | Target | file:line |
|---|---|---|---|
| 1 | `if (!user?.id) throw` | — | `:921` |
| 2 | Allocation guards (≥1, sum>0, sum ≤ amount+0.001, each >0, each ≤ remaining) | client | `:928-943` |
| 3 | **Duplicate probe** (unless `bypassDuplicate`): `count:"exact", head:true` on `tracking_number` + `amount` + `payment_date` + (`bank_name` eq or is-null), `.neq("status","rejected")` | `payment_receipts` (read) | `:946-959` |
| 4 | If count > 0: audit `duplicate_receipt_warning`, `return {duplicate:true,count}` — **no receipt written** | `audit_logs` | `:962-977` |
| 5 | Build `payload` — **34 keys** | — | `:980-1018` |
| 6 | `.insert(payload).select("id").single()` | **`payment_receipts` INSERT** | `:1019-1025` |
| 7 | If `invoice_payment` + allocations: bulk insert `{receipt_id, quote_id, amount}` | **`payment_receipt_links` INSERT** | `:1028-1036` |
| 8 | On failure: `.delete().eq("id", receiptId)` then throw — **this rollback does not work, see §8/H8** | `payment_receipts` DELETE | `:1037-1041` |
| 9 | Audit `payment_receipt_created` (carries linked invoices + suggestion provenance) | `audit_logs` | `:1044-1078` |
| 10 | If `securityWarnings.length > 0`: audit `receipt_security_warning_confirmed` | `audit_logs` | `:1080-1089` |
| 11 | If staged files: `uploadReceiptDocuments(receiptId, user.id, stagedFiles)` | Storage + 2 tables | `:1091-1097` |
| 12 | `return {duplicate:false, receiptId}` | — | `:1099` |

**File upload** (`PaymentReceiptDocuments.tsx:359-417`) runs **after** the receipt row exists, per file, best-effort — it never throws; a per-file failure only toasts. Path `${receiptId}/${uuid}-${safeFileName}`, bucket `payment-receipt-documents`, then an insert into `payment_receipt_documents`, then an audit row. On insert failure it removes the storage object.

### Payload keys (34)

`customer_id`, `receipt_type`, `payer_name`, `payer_phone`, `payer_accounting_code`, `receiver_name`, `receiver_phone`, `receiver_accounting_code`, `beneficiary_accounting_code`, `amount`, `payment_date`, `payment_time`, `tracking_number`, `bank_name`, `source_bank`, `destination_bank`, `payer_name_on_receipt`, `receiver_name_on_receipt`, `has_perforation`, `is_mobile_bank_screenshot`, `receipt_time`, `document_channel`, `cheque_number`, `cheque_due_date`, `is_typed_receipt`, `receipt_image_url`, `description`, `source_bank_account_id`, `destination_bank_account_id`, `receiver_party_id`, `security_warnings`, `custom_data`, `status` (hardcoded `"pending_review"`, `:1016`), `created_by` (`user.id`, `:1017`).

### Success / error

| Callback | Behaviour | file:line |
|---|---|---|
| `onSuccess` | if `duplicate`: stash `{values, allocations}` into `pendingValues`, open dialog, **no navigation**. Else toast `فیش واریزی ثبت شد`, invalidate `["payment-receipts"]`, navigate to `/accounting/receipts` | `:1101-1111` |
| `onError` | `toast.error("ثبت فیش ناموفق بود: …")` only; form keeps its values | `:1112-1115` |
| Reset | **There is no `form.reset()` anywhere in the file.** The page relies on navigating away. | — |

### Everything written per successful submit

| Target | Op | Count |
|---|---|---|
| `payment_receipts` | INSERT | 1 |
| `payment_receipt_links` | INSERT | 0 or 1 statement, N rows |
| `audit_logs` | INSERT | 1 + 1 per file (+1 if warnings confirmed); or exactly 1 on the duplicate short-circuit |
| `payment_receipt_documents` | INSERT | 1 per file |
| Storage `payment-receipt-documents` | upload | 1 per file |

**No RPC is called on the submit path.** Every write is a plain PostgREST call, so server-side enforcement rests entirely on RLS, CHECKs and triggers.

---

## 5. DATABASE LAYER

### 5a. `payment_receipts` columns + constraints

**42 columns.** The NOT-NULL-with-no-default set a client INSERT must supply:

`customer_id`, `payer_name`, `receiver_name`, `amount`, `payment_date`, `payment_time`, `tracking_number`, `created_by`.

Server-defaulted or server-derived: `id` (`gen_random_uuid()`), `created_at`/`updated_at` (`now()`), `status` (`'pending_review'`), `receipt_type` (`'invoice_payment'`), `has_perforation`/`is_typed_receipt`/`is_mobile_bank_screenshot` (`false`), `security_warnings` (`'[]'::jsonb`), `custom_data` (`'{}'::jsonb`), `posting_status` (`'unposted'`), `customer_person_id` (**NOT NULL, trigger-derived**), `receiver_party_person_id` (nullable, trigger-derived).

**Two separate time columns exist:** `payment_time` (`time`, NOT NULL, no default) and `receipt_time` (`text`, nullable, format CHECK). The create page writes **both** — `payment_time` from «ساعت واریز» (`:992`), `receipt_time` from «ساعت روی فیش» (`:1001`).

**The receiver CHECK is not a strict XOR:**

```sql
payment_receipts_receiver_exclusive_chk CHECK (
     (destination_bank_account_id IS NOT NULL AND receiver_party_id IS NULL)
  OR (destination_bank_account_id IS NULL     AND receiver_party_id IS NOT NULL)
  OR (status = 'pending_review' AND destination_bank_account_id IS NULL
                                AND receiver_party_id IS NULL))
```

The third branch permits a receipt with **no receiver at all** while `status='pending_review'` — which is the default. The zod refine (`:251-254`) is strictly stricter than the database. The constraint bites at approval, and `post_receipt_accounting` re-checks it independently.

**`tracking_number` is `text NOT NULL` with no default, no CHECK, no UNIQUE.** Nothing in the database prevents duplicates. `idx_payment_receipts_duplicate_check(tracking_number, amount, payment_date, bank_name) WHERE status <> 'rejected'` is a *supporting index for the application-side probe*, not a constraint. Live data: **7 rows, only 3 distinct values** — duplicates already exist.

Other CHECKs: `amount > 0`; `status IN (pending_review, approved, rejected)`; `posting_status IN (unposted, posted)`; `receipt_type IN (invoice_payment, debt_payment, prepayment, positive_credit)`; `document_channel IS NULL OR IN (card_to_card, paya, pol, satna, cash, cheque, other)`; `payment_receipts_cheque_fields_chk` = `document_channel='cheque' OR (cheque_number IS NULL AND cheque_due_date IS NULL)`; `receipt_time IS NULL OR receipt_time ~ '^\d{2}:\d{2}$'`; `receiver_party_person_id IS NULL OR receiver_party_id IS NOT NULL`.

FKs: `customer_id → customers RESTRICT`, `customer_person_id → persons RESTRICT`, `receiver_party_person_id → persons RESTRICT`, `destination_bank_account_id → bank_accounts`, `source_bank_account_id → bank_accounts`, `receiver_party_id → external_parties`. **No UNIQUE constraint on the table at all.**

**Children.** `payment_receipt_links`: real XOR `((invoice_id IS NOT NULL) <> (quote_id IS NOT NULL))`, `amount > 0`, UNIQUE `(receipt_id, invoice_id)` and `(receipt_id, quote_id)`, FK `receipt_id → payment_receipts ON DELETE CASCADE`, `quote_id → sales_quotes RESTRICT`; **no FK on `invoice_id`** (invoices subsystem retired). `payment_receipt_documents`: FK CASCADE, CHECKs on `extraction_status`, `file_size >= 0`, `extraction_confidence ∈ [0,1]`. `payment_receipt_custom_fields` is a **definition** table (UNIQUE `field_key`, key regex, `field_type IN (text,number,date,select)`); the per-receipt values live in `payment_receipts.custom_data`.

**Ledger tables.** `journal_entries`: PK, **UNIQUE `(source_type, source_id)`** — the mechanism that makes posting idempotent — and `status IN (draft, posted, void)`. `journal_entries.source_id` is **not** an FK, so deleting a receipt would orphan its entry. `journal_lines`: FK CASCADE, `debit >= 0`, `credit >= 0`, `journal_lines_one_side` (exactly one non-zero side), and:

```sql
CHECK (account_kind = ANY (ARRAY[
  'customer_credit','bank','external_party','invoice_ar','clearing','other','supplier_payable']))
```

### 5b. Triggers

Six on `payment_receipts`, **all `tgenabled='O'` (live)**:

| trigger | function | timing | events | condition |
|---|---|---|---|---|
| `trg_normalize_phone` | `tg_normalize_phone_columns('payer_phone','receiver_phone')` | BEFORE | INSERT, UPDATE | — |
| `trg_payment_receipts_derive_person` | `tg_payment_receipts_derive_person` | BEFORE | INSERT, UPDATE OF `customer_id`, `receiver_party_id` | — |
| `trg_payment_receipts_enforce_allocation_on_approve` | `enforce_receipt_approval_allocation_limits` | BEFORE | UPDATE OF `status` | `WHEN new.status='approved' AND old.status IS DISTINCT FROM 'approved'` |
| `trg_payment_receipts_post_journal` | `trg_post_receipt_on_approve` | **AFTER** | INSERT, UPDATE OF `status` | — |
| `trg_payment_receipts_recompute_employee_score` | `recompute_employee_scores_on_receipt` | AFTER | INSERT, DELETE, UPDATE OF `status` | — |
| `trg_payment_receipts_updated_at` | `set_updated_at_now` | BEFORE | UPDATE | — |

Elsewhere: `payment_receipt_links` has `enforce_payment_receipt_link_limits` (BEFORE) and `recompute_employee_scores_on_receipt_link` (AFTER INSERT/DELETE/UPDATE); `journal_lines` has `validate_journal_line_ref` (BEFORE); `journal_entries` has `tg_asan_burn_journal_entry_number` (AFTER DELETE).

**No trigger on `payment_receipts` assigns a receipt number, and none writes to the ledger.**

### 5c. Functions that fire — real vs no-op

**`post_receipt_journal(_receipt_id uuid)` — NO-OP.** Live body:

```sql
BEGIN
  -- NEUTRALIZED (migration 149). Model B (post_receipt_accounting) is the
  -- authoritative ledger path. … it now does nothing,
  -- so the approve UPDATE succeeds and only Path B posts.
  RETURN NULL;
END;
```

`trg_post_receipt_on_approve` is a real body, but its only action is `PERFORM public.post_receipt_journal(NEW.id)` under the condition

```sql
NEW.status = 'approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved')
AND NEW.payer_accounting_code IS NOT NULL
AND COALESCE(NEW.beneficiary_accounting_code, NEW.receiver_accounting_code) IS NOT NULL
```

**So the whole chain `trg_payment_receipts_post_journal → trg_post_receipt_on_approve → post_receipt_journal` terminates in `RETURN NULL` and writes nothing.** A plain `UPDATE payment_receipts SET status='approved'` produces no ledger row. Anyone reading the trigger list alone would conclude the opposite.

**`post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)` — real body, the only ledger writer.** `SECURITY DEFINER`, returns `jsonb`. Sequence: role gate `has_any_role(auth.uid(),['admin','accountant'])` → `SELECT … FOR UPDATE` → idempotency on `posting_status='posted'` → **refuses anything not already `status='approved'`** → re-checks the receiver XOR → resolves `v_receiver_code` → two configurable blocking gates from `validation_rules` → `UPDATE posting_status='posted', posted_at=now()` → `increase_credit(...)` → the journal entry.

Receiver-code resolution order:

```sql
IF receiver_accounting_code IS NOT NULL AND length(trim(...)) > 0 THEN v_receiver_code := receiver_accounting_code;
ELSIF receiver_party_id IS NOT NULL THEN SELECT accounting_code FROM external_parties …;
ELSIF destination_bank_account_id IS NOT NULL THEN SELECT accounting_code, title FROM bank_accounts …;
     IF blank THEN RAISE EXCEPTION 'کد حسابداری برای حساب بانکی «%» ثبت نشده است. …' ERRCODE 23514;
END IF;
```

**Which receipt columns decide the accounts:**

| side | account_kind | account_ref_id | decided by |
|---|---|---|---|
| DEBIT (line 1) | `'bank'` if `destination_bank_account_id IS NOT NULL`, else `'external_party'` | `destination_bank_account_id` **or** `receiver_party_id` | **`destination_bank_account_id` — the only branch selector** |
| CREDIT (line 2) | always `'customer_credit'` | `customer_id` | fixed |

Amount on both sides is `amount`; `entry_date` is `payment_date`; the description is `'سند فیش واریزی شماره ' || tracking_number`.

**It never varies by `receipt_type`** — all four values produce an identical two-line entry.

**The complete set of `payment_receipts` columns this function reads** (query `C-Q16`, extracted from the live body): `amount`, `customer_id`, `destination_bank_account_id`, `id`, `payer_accounting_code`, `payment_date`, `posted_at`, `posting_status`, `receiver_accounting_code`, `receiver_party_id`, `status`, `tracking_number` — **12 columns, 4 of which are its own control fields.**

Other real-but-non-ledger functions: `tg_payment_receipts_derive_person` (fills `customer_person_id`/`receiver_party_person_id`); `enforce_receipt_approval_allocation_limits` and `enforce_payment_receipt_link_limits` (allocation caps, both raise `23514`, both raise unconditionally on the retired `invoice_id` branch); `recompute_employee_scores_on_receipt_link` (live quote branch); `validate_journal_line_ref` (maps `account_kind` → target table and raises `23503` on a bad ref — **the only function in the set that is `SECURITY INVOKER`**); `tg_normalize_phone_columns`; `set_updated_at_now`.

**`recompute_employee_scores_on_receipt` is real but inert** — its only lookup path was removed by migration 330; its own comment says it has never awarded a point.

### 5d. RLS per command

`relrowsecurity = true` on all seven tables; none is `FORCE`.

| table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `payment_receipts` | admin/manager/accountant | admin/accountant **AND `created_by = uid()`** | admin/accountant | **NO POLICY — silent no-op** |
| `payment_receipt_links` | admin/manager/accountant | via `cmd=ALL` admin/accountant | ✔ | ✔ (via ALL) |
| `payment_receipt_documents` | admin/manager/accountant | admin/accountant **AND `uploaded_by = uid()`** | **NO POLICY** | admin/accountant |
| `payment_receipt_custom_fields` | **any authenticated** (`true`) | via `cmd=ALL` admin/accountant | ✔ | ✔ |
| `journal_entries` | admin/manager/accountant | admin/accountant | admin/accountant | **NO POLICY** |
| `journal_lines` | admin/manager/accountant | admin/accountant | admin/accountant | **NO POLICY** |
| `payment_receipts_backup_20260722` | admin only | — | — | — |

A RESTRICTIVE `viewer_restricted` policy (`NOT is_viewer_only(uid())`) covers all of these except `payment_receipt_custom_fields`, which lacks it — so a viewer-only user can read the custom-field *definitions* (no receipt data).

Three consequences that matter:

- **`payment_receipts` cannot be deleted through the API.** A PostgREST `DELETE` as `authenticated` matches 0 rows and **returns success**.
- **The ledger is append-only via the API.** That also makes `tg_asan_burn_journal_entry_number` (AFTER DELETE) unreachable in normal traffic.
- **`payment_receipt_documents` has no UPDATE policy**, so OCR write-back columns (`extraction_status`, `extracted_data`, `extraction_confidence`) can never be updated by an `authenticated` caller. The create page's OCR runs on raw bytes through a server function and does not attempt this write; whether any other path does is `UNCERTAIN`.

Also note the ledger tables use `has_role(uid(),'admin')` while the receipt tables use `has_any_role(uid(), ARRAY[…])` — two different helpers guarding one journey.

### 5e. What a posted receipt produces in the ledger (real data)

> **Sample size: the entire `journal_entries` table holds 1 row and `journal_lines` holds 2 rows.** Every number below describes a single document. Nothing here supports a statistical conclusion.

`payment_receipts`: **7 rows** — 1 `approved`/`posted`, 6 `pending_review`/`unposted`. **0 rows** approved-but-unposted, **0 rows** posted-but-not-approved, **0 rows** rejected. By type: `debt_payment` 3, `invoice_payment` 3, `positive_credit` 1, `prepayment` **0 rows**.

`journal_entries` by source: `payment_receipt` / `posted` / **1**. That is the whole table — no other document type has ever written to this ledger.

`journal_lines` by `account_kind`:

| account_kind | lines | entries | debit | credit |
|---|---|---|---|---|
| `bank` | 1 | 1 | 10,100,000,000.00 | 0 |
| `customer_credit` | 1 | 1 | 0 | 10,100,000,000.00 |

**Five of the seven allowed `account_kind` values have never been used**, including `external_party` — so the `external_party` debit branch of `post_receipt_accounting` has **0 rows** of production evidence.

The one posted example, receipt `fd8194a5-…`, `amount` 10,100,000,000.00, `destination_bank_account_id` set, `receiver_party_id` NULL, `beneficiary_accounting_code` **NULL**, `payer_accounting_code` `002`, `receiver_accounting_code` `cust-123`; posted 14 seconds after creation. Its entry `6d6b1896-…` carries `payer_accounting_code='002'`, `receiver_accounting_code='cust-123'`, description `سند فیش واریزی شماره 123456`, lines:

| line | account_kind | account_ref_id | debit | credit |
|---|---|---|---|---|
| 1 | `bank` | = `destination_bank_account_id` | 10,100,000,000.00 | 0 |
| 2 | `customer_credit` | = `customers.id` | 0 | 10,100,000,000.00 |

This matches the function body exactly. Recorded without interpretation: the entry's `receiver_accounting_code` is a **customer** code while line 1 debits a **bank**, because the receipt already carried `receiver_accounting_code` and the first resolution branch won before the bank's own code was consulted.

### 5f. Receipt-number mechanism — there is none

Four independent checks:

1. **No column.** None of the 42 columns is a receipt/voucher/serial/document number. The nearest is `tracking_number`, which is the **bank's** reference typed off the slip.
2. **No sequence.** `pg_sequences` in `public` holds 6 sequences; a query for `column_default ILIKE '%nextval%'` over all `payment_receipt*` and `journal_*` tables returned **0 rows**. `payment_voucher_number_seq` exists but is not wired to `payment_receipts`; what consumes it is `UNCERTAIN` (likely the payment-voucher module, out of scope).
3. **No counter table.** Counter tables exist for quotes, SKUs, waybills and dynamic tables — **not for receipts**.
4. **No trigger sets one.**

A receipt's identity is its uuid or its **client-typed, non-unique** `tracking_number`. There is a downstream `asan_burn_document_number('accounting_document', …)` call on journal-entry DELETE, implying a separate ASAN numbering subsystem for accounting documents — how numbers are *issued* there is `UNCERTAIN`; only the burn path touches these tables.

---

## 6. WIRING CHAIN (each field end-to-end)

Reading key: **[create]** = at the create page's INSERT · **[approve]** = only when `status → 'approved'` · **[post]** = only inside `post_receipt_accounting`.

| # | Persian label | form key | → column / table | → constraint or trigger | → read by | → effect on ledger / elsewhere |
|---|---|---|---|---|---|---|
| 1 | مشتری | `customer_id` | `payment_receipts.customer_id` NOT NULL | FK RESTRICT; **BEFORE `trg_payment_receipts_derive_person`** derives `customer_person_id` **[create]** | `post_receipt_accounting`, `increase_credit` | **[post]** credit line `customer_credit` / ref = `customer_id` / credit = `amount`; plus `customer_credit_balance` UPDATE + `customer_credit_ledger` INSERT + its own audit row |
| 2 | نوع فیش | `receipt_type` | `.receipt_type` NOT NULL | CHECK (4 values) **[create]** | **ZERO functions in `public` mention it** (query `C-Q3` → 0 rows) | **No ledger effect ever.** Gates the allocation block client-side; picks the audit action string on the detail page **[approve]** |
| 3 | اتصال به پیش‌فاکتورها | `allocations` (state) | **`payment_receipt_links`** rows | XOR CHECK, `amount>0`, UNIQUE; **BEFORE `enforce_payment_receipt_link_limits`** caps vs `amount` and vs quote remaining **[create]**; **AFTER `recompute_employee_scores_on_receipt_link`** **[create]**; re-checked **[approve]** | **not read by `post_receipt_accounting`** | **No ledger effect.** Moves `vw_customer_receivables.confirmed_paid_amount` **[approve]**; writes `employee_score_events` **[create]** |
| 5 | نام واریزکننده | `payer_name` | `.payer_name` **NOT NULL** | none | **none** | Stored only — mandatory but inert |
| 6 | موبایل واریزکننده | `payer_phone` | `.payer_phone` | **BEFORE `trg_normalize_phone`** rewrites it **[create]** | none | Stored only; **the stored value is not necessarily the typed value** |
| 7 | کد حسابداری واریزکننده | `payer_accounting_code` | `.payer_accounting_code` | none in SQL | `post_receipt_accounting` | **[post]** written verbatim to `journal_entries.payer_accounting_code`; also a configurable **blocking gate** via `validation_rules`. **Does not choose an account** — a text label on the entry header |
| 9 | حالت ۱: حساب بانکی ما | `destination_bank_account_id` | `.destination_bank_account_id` | FK; branch 1 of the receiver CHECK **[create, weakly]** | `post_receipt_accounting` | **The single most consequential field.** **[post]** non-NULL ⇒ debit `account_kind='bank'`, ref = this column. Third fallback for the receiver code, and **the RPC raises `23514` if that bank account has no `accounting_code`**. Separately **[approve]** `vw_account_balances.total_in` starts counting — *independent of `posting_status`* |
| 10 | حالت ۲: طرف خارجی | `receiver_party_id` | `.receiver_party_id` | FK; branch 2 of the receiver CHECK; **BEFORE derive-person** fills `receiver_party_person_id` **[create]** | `post_receipt_accounting` | **[post]** when mode 1 is NULL: debit `external_party` / ref = this column. Second fallback for the receiver code. **This branch has 0 rows of production evidence** |
| 11 | نام گیرنده | `receiver_name` | `.receiver_name` **NOT NULL** | none | **none** | Stored only — mandatory but inert |
| 12 | موبایل گیرنده | `receiver_phone` | `.receiver_phone` | **BEFORE `trg_normalize_phone`** **[create]** | none | Stored only, normalised |
| 13 | کد حسابداری گیرنده | `receiver_accounting_code` | `.receiver_accounting_code` | none in SQL | `post_receipt_accounting` — **first branch** of receiver-code resolution | **[post]** if non-blank it wins outright and the bank's / party's own code is never consulted → `journal_entries.receiver_accounting_code`. Also a blocking gate |
| 14 | **کد آسان ذینفع** | `beneficiary_accounting_code` | `.beneficiary_accounting_code` | none | only `trg_post_receipt_on_approve` (as a firing condition) and `pay_purchase_with_voucher` (**different subsystem**) | **DEAD WIRE — permanently.** See §7 |
| 15 | مبلغ | `amount` | `.amount` numeric(15,2) NOT NULL | CHECK `> 0`; read as the cap by the link-limit trigger **[create]** | `post_receipt_accounting`, `increase_credit` | **[post]** debit and credit on both lines; the credit-ledger amount |
| 16 | شماره پیگیری | `tracking_number` | `.tracking_number` NOT NULL | **no UNIQUE, no format CHECK** — only supporting indexes | `post_receipt_accounting` | **[post]** concatenated into `journal_entries.description`. That is its only ledger use |
| 17 | تاریخ روی فیش | `payment_date` | `.payment_date` date NOT NULL | none in SQL (`<= today` is zod-only) | `post_receipt_accounting` | **[post]** becomes `journal_entries.entry_date`, overriding that column's `CURRENT_DATE` default |
| 18 | ساعت واریز | `payment_time` | `.payment_time` `time` **NOT NULL, no default** | none | **none** | Stored only. A rebuilt form **must** send it or the INSERT fails |
| 19 | توضیحات | `description` | `.description` | none | **none** — the token matches only the two INSERT column lists | Stored only; the ledger writes its own hardcoded description |
| 20 | حساب مبدأ ما | `source_bank_account_id` | `.source_bank_account_id` | FK | `get_account_ledger`, `pay_purchase_with_voucher` — **neither on this path** | **No ledger effect from a receipt.** Money leaving our own account is never recorded against it |
| 21 | نام بانک مبدأ | `source_bank` | `.source_bank` | none | none | Stored only |
| 22 | نام بانک مقصد | `destination_bank` | `.destination_bank` | none | none | Stored only |
| 23 | ساعت روی فیش | `receipt_time` | `.receipt_time` — **`text`, not `time`** | format CHECK `^\d{2}:\d{2}$` **[create]** | none | Stored only |
| 24 | روش انتقال | `document_channel` | `.document_channel` | CHECK (7 values); **governing side of the cheque CHECK** | not `post_receipt_accounting` | **No ledger effect.** `cash`, `cheque`, `satna`, `card_to_card` all post identically |
| 25 | شمارهٔ چک | `cheque_number` | `.cheque_number` | **CHECK `payment_receipts_cheque_fields_chk`** **[create]** | none | No ledger effect. The CHECK is one-directional: it forbids cheque fields off-channel but does **not** require the number when the channel *is* cheque — that is zod-only |
| 26 | سررسید چک | `cheque_due_date` | `.cheque_due_date` | same CHECK **[create]** | none | No ledger effect. **No maturity or clearing logic exists anywhere** — a post-dated cheque posts on `payment_date` like cash |
| 27 | نام واریزکننده روی فیش | `payer_name_on_receipt` | `.payer_name_on_receipt` | none | **none in any function** | Stored only; blank raises a client-side warning enforced nowhere on the server |
| 28 | نام گیرنده روی فیش | `receiver_name_on_receipt` | `.receiver_name_on_receipt` | none | **none in any function** | Stored only |
| 29 | پرفراژ دارد؟ | `has_perforation` | `.has_perforation` | none | **none in any function** | Stored only; client-side dialog only |
| 30 | فیش تایپی است؟ | `is_typed_receipt` | `.is_typed_receipt` | none | **none in any function** | Stored only; client-side dialog only |
| 31 | اسکرین‌شات همراه بانک؟ | `is_mobile_bank_screenshot` | `.is_mobile_bank_screenshot` | none | **none in any function** | **DEAD WIRE — permanently.** See §7 |
| 32 | مستندات فیش | `stagedFiles` (state) | Storage bucket (private, 20 MiB server limit) + `payment_receipt_documents` + `audit_logs` | FK CASCADE; RLS requires **`uploaded_by = uid()`**; storage policies for a/r/d | none | **No ledger effect.** Best-effort and non-atomic — `uploadReceiptDocuments` never throws |
| 33 | اطلاعات تکمیلی | `customData` (state) | `.custom_data` jsonb | **no CHECK validates it against `payment_receipt_custom_fields`** | **none in any function** | Stored only; `is_required` is a **client-side promise** that a direct PostgREST insert bypasses |
| — | *(no input)* | `bank_name` | `.bank_name` | none | none | No ledger effect, but the 4th column of the duplicate-detection key |
| — | *(no input)* | `receipt_image_url` | `.receipt_image_url` | none | none | **Always `null`.** Dead in every sense |
| — | *(not a field)* | `security_warnings` | `.security_warnings` jsonb | none | **none in any function** | Audit artefact only — and §7 documents the path that destroys it |
| — | *(not a field)* | `status` | `.status` (hardcoded `"pending_review"`) | CHECK; **branch 3 of the receiver CHECK depends on it**; two trigger `WHEN` clauses | `post_receipt_accounting` — refuses anything not `'approved'` | The gate between stage 1 and stage 2 |
| — | *(not a field)* | `created_by` | `.created_by` NOT NULL | **RLS `WITH CHECK` requires `created_by = auth.uid()`** | — | Wrong value ⇒ rejected as a **policy violation (`42501`)**, not a validation error |

**Of the 33 inputs, exactly 8 reach the ledger:** rows 1, 7, 9, 10, 13, 15, 16, 17. Rows 2 and 3 reach other tables or views but never the ledger. **The remaining 23 land in a column and stop there.**

---

## 7. DEAD WIRES

Each verified against the **live** function bodies, not against git.

### 1. `beneficiary_accounting_code` («کد آسان ذینفع») — DEAD, PERMANENTLY

Collected at `:1703-1712`, resolver `:623-637`, sent at `:989`.

The complete list of `payment_receipts` columns `post_receipt_accounting` reads (query `C-Q16`) **does not include it**, and an independent token search of the live body reports it absent. The credit-side code the ledger actually uses resolves `receiver_accounting_code` → `external_parties.accounting_code` → `bank_accounts.accounting_code`; the beneficiary field is consulted at none of the three steps.

Its only two readers in the entire schema are `pay_purchase_with_voucher` (a **different subsystem** — purchase payments — which never touches `payment_receipts`) and `trg_post_receipt_on_approve`, where it appears solely as the firing condition `COALESCE(NEW.beneficiary_accounting_code, NEW.receiver_accounting_code) IS NOT NULL` whose only action is `PERFORM post_receipt_journal(NEW.id)` — a `RETURN NULL` function.

**So the one place in the database that reads this column feeds a no-op.** Dead at create time **and** after approval and posting.

**The journal preview built on it is decorative and materially wrong.** It renders debit = beneficiary code, credit = payer code. The real entry is debit = a **bank account or external party uuid**, credit = **`customer_credit` by `customer_id`**. The two share only the amount. The caption «پس از تأیید این فیش، سند زیر به‌صورت خودکار ثبت می‌شود.» (`:1730-1732`) is false in two ways: the entry it describes is not the entry that gets written, and approval alone does not write any entry.

### 2. `is_mobile_bank_screenshot` — DEAD, PERMANENTLY

Collected at `:2021-2031`, forwarded to `evaluateFormWarnings` at `:1170`, persisted at `:1000`.

Client side: declared in the evaluator's parameter type at `receipt-security.ts:28` and referenced **nowhere** in the body `:56-170` — it produces no warning. Server side: a search of every function in `public` found **0 functions** mentioning it; no CHECK, no trigger, no index. The column is NOT NULL default `false` and is written on every insert. Nothing ever reads it.

### 3. `receipt_type` — DEAD FOR THE LEDGER, ALIVE ELSEWHERE (suspicion refuted as stated)

**Does any of the four values change what the ledger records? No.** A search of every function in `public` for `receipt_type` returned **0 rows** — not one function reads it, and all four values produce a byte-identical two-line entry.

But it is **not** a dead wire, because it has three real non-ledger effects: `requiresInvoiceLinks(receipt_type)` gates the entire allocation block and the submit button **[create, client]**; the CHECK constraint rejects other values **[create, server]**; and the detail page branches the audit action string on `prepayment` **[approve, client]**.

**A rebuilt page must keep it, but must not imply it changes the accounting.**

### 4a. `bank_name` — DEAD FOR THE LEDGER, LIVE FOR DEDUPLICATION

No function mentions it, no CHECK, no trigger. But it is the 4th column of the duplicate probe (`:950-958`) and of `idx_payment_receipts_duplicate_check`. Two receipts with identical tracking number, amount and date are treated as **distinct** if one has `bank_name` set and the other `null`, because the probe branches on `.eq("bank_name", …)` vs `.is("bank_name", null)`. **A rebuilt form that stops back-filling `bank_name` silently changes duplicate detection.**

### 4b. `receipt_image_url` — DEAD, WITH NO PRODUCER AT ALL

Schema `:245`, default `:348`, payload `:1009`; nothing else references it, so `values.receipt_image_url || null` always evaluates to `null`. No function, CHECK, trigger or index mentions it. The real attachment mechanism is `payment_receipt_documents` + the storage bucket, which this column predates and duplicates.

### 5. The security-warnings drop path (`:2116-2121`) — CONFIRMED, real data loss

The duplicate-dialog re-entry is:

```tsx
mutation.mutate({
  values: pendingValues.values,
  allocations: pendingValues.allocations,
  bypassDuplicate: true,
  customData,
});
```

There is **no `securityWarnings` key**, so the mutation's default `[]` (`:918`) applies. The chain: the warnings dialog mutates *with* `securityWarnings: pendingWarnings` (`:2172`) → the duplicate probe short-circuits and returns before any row is written (`:962-977`) → `onSuccess` stashes only `{values, allocations}` (`:1103`) → the user clicks «ادامه و ثبت» and the warnings are gone.

**Both consequences are permanent:** `security_warnings` persists as `[]`, and the `receipt_security_warning_confirmed` audit row (`:1080-1089`) is never written — even though an accountant explicitly acknowledged high-severity warnings. Compounding it, `security_warnings` is read by no database function, so nothing downstream can notice.

### 6. Additional dead wires

`payer_name` and `receiver_name` (NOT NULL, so always supplied, yet read by no function — the entry's only human label is the tracking-number string); `payment_time` (NOT NULL with no default, read by nothing); `receipt_time`; `description`; `source_bank`; `destination_bank`; `source_bank_account_id` (read by `get_account_ledger` and `pay_purchase_with_voucher` but **absent from `post_receipt_accounting`** — the receipt never credits our own source account); the four "anti-fraud" attributes `payer_name_on_receipt`, `receiver_name_on_receipt`, `has_perforation`, `is_typed_receipt` (**no function reads any of them**; their entire effect is a client-side confirm dialog that any direct PostgREST insert bypasses); `custom_data`; `cheque_number` and `cheque_due_date`. All dead at both stages.

---

## 8. HIDDEN LOGIC (backend behaviour with no frontend field)

**H1 — `customer_person_id` is NOT NULL, server-derived, and can abort your insert.** No client sends it; `trg_payment_receipts_derive_person` fills it from `customers.person_id`. **If the chosen customer has `person_id IS NULL`, the trigger leaves NULL and the INSERT dies on the NOT NULL with a raw Postgres error**, surfaced only as `ثبت فیش ناموفق بود: …` (`:1113`). A rebuilt frontend cannot fix this by sending the column (the trigger overwrites it) — it must filter the customer picker to customers that have a `person_id`, or translate `23502` on `customer_person_id` into Persian.

**H2 — The receiver CHECK is looser than the form.** Because `status` defaults to `'pending_review'`, the third branch permits a receipt with no receiver at all at create time. The zod XOR is strictly stricter than the database. A rebuilt page *may* relax the client rule without any DDL — but the receipt then becomes unapprovable, which is arguably worse than refusing it up front.

**H3 — Creating an allocation immediately awards employee-score points.** `payment_receipt_links` carries an AFTER INSERT trigger whose body has **no status guard**: for any link with a non-null `quote_id` it resolves `sales_quotes.salesperson_id`, calls `calculate_employee_score`, and inserts an `employee_score_events` row. **This fires at create time, on a `pending_review` receipt, before anyone has approved anything.** Both calls are wrapped in `EXCEPTION WHEN OTHERS THEN NULL`, so failures are invisible.

**H4 — Allocations are money-capped server-side at create time.** `enforce_payment_receipt_link_limits` locks the receipt `FOR UPDATE` and enforces sum ≤ `amount` and allocation ≤ the quote's remaining (counting **approved** receipts only), raising `23514`. The client-side over-allocation guard is a nicety; the real cap is in the database.

**H5 — Columns applied entirely in SQL that no client sends:** `id`, `created_at`, `updated_at`, `posting_status`, `posted_at`, `rejection_reason`, `customer_person_id`, `receiver_party_person_id`. Note `status`, `receipt_type`, the three booleans, `security_warnings` and `custom_data` also have SQL defaults — the form sends them anyway, so a rebuilt form may legally omit any of them.

**H6 — The RLS contract a rebuilt form must satisfy:** `created_by = auth.uid()` (a `WITH CHECK`, so a wrong value fails as `42501`, not as validation); caller holds `admin` or `accountant` and is not `is_viewer_only`; `payment_receipt_documents` requires `uploaded_by = uid()`; **`audit_logs` requires `actor_id = uid()`** and has `entity_type`/`entity_id`/`action` NOT NULL — all four client audit inserts satisfy this today, and a rebuilt page must keep it or the audit row is silently rejected. The storage bucket is **private** with a 20 MiB server-side limit matching the client's check, so an oversized file fails twice but only the client failure has a Persian message.

**H7 — The NOT NULL set a rebuilt form must always supply:** `customer_id`, `payer_name`, `receiver_name`, `amount`, `payment_date`, `payment_time`, `tracking_number`, `created_by`. **Four of these eight are never read by any function** — mandatory but inert.

**H8 — The create page's rollback is fictional.** There is no DELETE policy on `payment_receipts`, so the link-failure rollback at `:1037-1041` matches 0 rows and **returns success**. When a link insert fails (e.g. H4's cap), the code believes it cleaned up, throws a Persian error, and **leaves an orphan `pending_review` receipt with no links** — and because the `payment_receipt_created` audit row is written *after* the link insert, the orphan has no audit trail either. *(Neither sub-agent A nor B could see this alone: A found the `.delete()` call, B found the missing policy.)*

**H9 — The ledger is append-only and the auto-post trigger is a decoy.** No DELETE policy on `journal_entries`/`journal_lines`; combined with UNIQUE `(source_type, source_id)`, posting is idempotent and irreversible through the API. Meanwhile `trg_payment_receipts_post_journal` is enabled and fires on every insert and status change — and terminates in `RETURN NULL`.

**H10 — Two views react to `status='approved'`, ahead of and independently of posting.** `vw_account_balances.total_in` sums `amount` where `destination_bank_account_id IS NOT NULL AND status='approved'`; `vw_customer_receivables.confirmed_paid_amount` sums link amounts where the parent's `status IN ('approved','verified','confirmed','posted')`. Both key on **`status`**, not `posting_status` — so an approved-but-unposted receipt already moves bank balances and receivables while the journal is still empty. Today that window is empty (0 such rows) only because the detail page calls the RPC immediately. Note `vw_customer_receivables` accepts three status values the CHECK constraint does not allow (`verified`, `confirmed`, `posted`) — dead branches.

**H11 — There is no receipt number.** A rebuilt page must not promise the user one, and must not assume `tracking_number` is unique.

---

## 9. OTHER CALLERS OF THE FORM COMPONENT (rebuild blast radius)

**Exactly one caller.** `git grep PaymentReceiptForm` over `src server scripts`:

| file:line | kind |
|---|---|
| `src/routes/_app.accounting.receipts.create.tsx:7` | **real import** |
| `src/routes/_app.accounting.receipts.create.tsx:31` | **real usage** — `<PaymentReceiptForm />`, no props |
| `src/shared/components/PaymentReceiptForm.tsx:289` | the definition |
| `src/lib/navigation/registry.ts:892` | comment only |
| `src/lib/receipt-ocr-bytes.functions.ts:155` | comment only |
| `src/lib/treasury/queries.ts:228` | comment only |

Rebuilding `PaymentReceiptForm` touches no other route. **Its children are shared and must not be rewritten in place:**

| shared child | other consumers |
|---|---|
| `JalaliDateInput` | **13 other files** — `PersianDatePicker`, `EmployeeProfileCard`, `_app.accounting.dynamic-capital`, `.mutual-settlement`, `.payment-vouchers` (×4), `.purchase-payments`, `.receipts` (×2), `.treasury` (×2), `_app.admin.audit` (×2), `.penalties` (×2), `_app.gamification.admin.manual-metrics`, `_app.pricing.purchase-prices` (×2), `_app.warehouses_.kardex` (×2), `PurchaseForm` |
| `WaybillCustomFieldsInput` | only this form imports it, but `registry.ts:891-892` explicitly flags it as must-not-delete |
| `PaymentReceiptDocuments.tsx` | `ReceiptDocumentPicker` + `uploadReceiptDocuments` used here; `ReceiptDocumentsList` in the same file is used by the receipt **detail** page — `UNCERTAIN` which route exactly; not surveyed |

Note also that the route `/accounting/receipts/create` is **not itself an entry in `src/lib/navigation/registry.ts`**. The registry has `/accounting/receipts` (`:431`) and `/accounting/receipts/training` (`:438`). The create page is reached only by in-page links from `_app.accounting.receipts.tsx:344` and `PaymentReceiptGuide.tsx:137`.

---

## 10. CONTRADICTIONS between working-tree code and live database

1. **The journal preview describes an entry the database never writes.** The preview (`:1720-1768`) shows debit = «کد آسان ذینفع» / credit = «کد آسان پرداخت‌کننده». `post_receipt_accounting` writes debit = bank-account-or-external-party **uuid** / credit = `customer_credit` by **`customer_id`**. They share only the amount. Stated as fact, not judgement.

2. **The preview's caption promises automatic posting on approval; approval alone posts nothing.** «پس از تأیید این فیش، سند زیر به‌صورت خودکار ثبت می‌شود.» (`:1731`). The trigger that would do that terminates in `RETURN NULL`. Posting requires a separate explicit RPC call, which happens on a **different page**.

3. **The trigger list is misleading in isolation.** `trg_payment_receipts_post_journal` is enabled (`tgenabled='O'`) and fires on every insert and status change, but its terminal function is a no-op. Any future reader inspecting `pg_trigger` alone will conclude the ledger auto-posts.

4. **The frontend XOR is stricter than the database.** zod requires exactly one receiver (`:251-254`); the CHECK permits neither while `pending_review`. Both are correct; the database catches up at approval. (See H2.)

5. **The create page's rollback contradicts RLS.** `:1037-1041` calls `DELETE` on a table with no DELETE policy. The code assumes it worked. (See H8.)

6. **`vw_customer_receivables` filters on three `status` values the CHECK constraint forbids** (`verified`, `confirmed`, `posted`) — permanently dead branches in the view.

7. **Internal slip inside sub-agent A's own report** (not a code/DB contradiction): A5 step 5 says "Build `payload` (27 keys)" while its payload table and closing sentence say 34. The literal object at `:980-1018` was counted independently: **34 keys**.

Nothing else in the working tree contradicts the live database. In particular, `post_receipt_journal`'s live body matches migration 149's stated intent exactly, and the one posted receipt in the database matches `post_receipt_accounting`'s body line for line.

---

## 11. OPEN QUESTIONS for human review before any rebuild

1. **Is «کد آسان ذینفع» supposed to reach the ledger, or should the field and its preview be removed?** Both are one-line changes in opposite directions, and this is a business decision. Note 4 of the 7 live receipts carry a beneficiary code that differs from the receiver code — this is not hypothetical.
2. **Should the journal preview be deleted, corrected, or replaced by a server-side preview?** As it stands it teaches accountants an accounting model the system does not implement. Correcting it means showing a bank/party uuid and a customer credit line, which may not be meaningful to the user.
3. **Should approving a receipt post automatically?** Today approval and posting are two statements the detail page happens to run back to back. Repointing `trg_post_receipt_on_approve` at `post_receipt_accounting` is not a drop-in: that function needs `auth.uid()` and a `p_user_id`, and its role gate would need re-examination inside a trigger context.
4. **Is `receipt_type` supposed to change the accounting?** It reads as a meaningful accounting distinction (`prepayment` vs `debt_payment` vs `positive_credit`) and produces an identical entry in all four cases. `prepayment` has **0 rows** in live data.
5. **Should the create page keep writing directly to four tables, or move to a single RPC?** The current design cannot be atomic — H8's rollback is fictional, and the file upload is best-effort — and no amount of frontend work fixes that. This decision shapes the rebuild.
6. **Should `security_warnings` be enforced anywhere, or is it purely an audit artefact?** No database function reads it. If it is meant to matter, the drop path at `:2116-2121` must be fixed *and* something must consume the column.
7. **Should the customer picker exclude customers without a `person_id`?** Today they produce a raw `23502` the user sees as an untranslated failure (H1).
8. **Should `tracking_number` be unique?** It is the only human-facing identifier, it is client-typed, and the live data already holds 7 rows with 3 distinct values. The duplicate probe is application-side and defeated by a `bank_name` mismatch (§7 4a).
9. **Is the `external_party` receiver branch correct?** It has **0 rows** of production evidence. `UNCERTAIN` — it cannot be validated from data.
10. **What consumes `payment_voucher_number_seq`, and is there meant to be a receipt number at all?** `UNCERTAIN`; out of scope here.
11. **Does anything attempt to write back OCR results to `payment_receipt_documents`?** That table has no UPDATE policy, so such a write would be a silent no-op. The create page's OCR path does not attempt it; other paths were not surveyed. `UNCERTAIN`.
12. **Are the four "anti-fraud" attributes meant to be enforced server-side?** Today they are client-side dialogs only, bypassed entirely by a direct PostgREST insert.

---

## BLOCKED

Nothing. No forbidden write was required by any of the three sub-agents or by the lead.

Two deliberate non-actions, both per the mission rules, and one documented deviation:

- **`post_receipt_accounting`, `post_receipt_journal`, `person_settlement_position` and `list_mutual_settlement_candidates` were not called.** `auth.uid()` is NULL in `psql` and they are role-gated. Their bodies were read with `pg_get_functiondef` and their effects corroborated against the live `journal_entries` / `journal_lines` rows.
- **`git pull` was not run** — the tree was already exactly `origin/staging`, so it would have been a no-op merge, and Section 0 forbids merges.
- **The temp SQL went to the session scratchpad, not `C:\afrakala-backups\`**, which does not exist on this host.

---

```
=== HANDOFF STATE ===
Sub-agent A (frontend): done — A1..A6 complete; 33 inputs, 30 display-only, 12 data sources, 34-key payload
Sub-agent B (database): done — B0..B7 complete; A3-equivalent catalog query re-run with prokind filter
Sub-agent C (wiring):   done — C0..C4 complete; 17 supplementary read-only queries (C-Q1..C-Q17)
Code == live build:     no — live build is 3 commits behind (bfcc723a vs 99f6bd58),
                        but the diff is PROGRESS.md only, so the page code is identical
Writes performed:       NONE
Container restarted:    NO
Files produced:         docs/research/RECEIPTS-CREATE-MAP.md (+ _a_frontend.md, _b_database.md, _c_wiring.md)
Next phase:             PHASE 2 — human review of the map. Do not start a rebuild.
```
