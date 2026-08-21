# SUB-AGENT A — Frontend layer map of `/accounting/receipts/create`

Research-only. Nothing was modified. All paths are absolute-relative to `D:\AfraKalaTest\app`.

Date of survey: 2026-08-16 · branch `staging` · HEAD `99f6bd58`

---

## A1 — Route entry and component tree

| Item | Value | file:line |
|---|---|---|
| Route file | `src/routes/_app.accounting.receipts.create.tsx` | `src/routes/_app.accounting.receipts.create.tsx:9` |
| Route id | `/_app/accounting/receipts/create` | `src/routes/_app.accounting.receipts.create.tsx:9` |
| Route guard | `beforeLoad: async () => { await requireAnyRole(["admin", "accountant"]); }` | `src/routes/_app.accounting.receipts.create.tsx:10-12` |
| Guard implementation | redirects to `/login` when no user, to `/unauthorized` when roles do not intersect | `src/lib/rbac/route-guards.ts:77-91` |
| Page component | `CreateReceiptPage` | `src/routes/_app.accounting.receipts.create.tsx:16` |
| Header | `<PageHeader title="ثبت فیش واریزی" description="ثبت فیش واریزی جدید برای مشتری" …/>` | `src/routes/_app.accounting.receipts.create.tsx:19-30` |
| Header action | `<Button variant="outline" asChild><Link to="/accounting/receipts">بازگشت به لیست</Link></Button>` | `src/routes/_app.accounting.receipts.create.tsx:23-28` |
| Real form | `<PaymentReceiptForm />` — no props at all | `src/routes/_app.accounting.receipts.create.tsx:31` |
| Form component | `export function PaymentReceiptForm()` — 2205 lines total in file | `src/shared/components/PaymentReceiptForm.tsx:289` |

### Component tree (every child the form actually renders)

| Component | Source file | Rendered at | Role on the page |
|---|---|---|---|
| `PageHeader` | `src/components/common/PageHeader.tsx` | `src/routes/_app.accounting.receipts.create.tsx:19` | title bar |
| `PaymentReceiptForm` | `src/shared/components/PaymentReceiptForm.tsx:289` | route `:31` | the whole form |
| `PartyLookup` (module-local, not exported) | `src/shared/components/PaymentReceiptForm.tsx:90-161` | `:1525` (payer) and `:1564` (receiver) | debounced searchable party picker |
| `JalaliDateInput` | `src/shared/components/JalaliDateInput.tsx:40` | `:1816` (تاریخ روی فیش), `:1981` (سررسید چک) | Jalali calendar; stores ISO Gregorian |
| `ReceiptDocumentPicker` | `src/components/accounting/PaymentReceiptDocuments.tsx:426-527` | `:2036-2040` | staged file picker (pre-insert) |
| `uploadReceiptDocuments` (function, not component) | `src/components/accounting/PaymentReceiptDocuments.tsx:359-417` | called at `:1093` | post-insert Storage upload |
| `WaybillCustomFieldsInput` | `src/shared/components/WaybillCustomFieldsInput.tsx:58-126` | `:2050-2055` | admin-defined dynamic fields |
| `PersianDatePicker` | `src/components/common/PersianDatePicker.tsx:26` | `WaybillCustomFieldsInput.tsx:101` | thin wrapper over `JalaliDateInput` for `field_type === "date"` |
| shadcn primitives | `Button, Input, Label, Textarea, Card, CardContent, Checkbox, Popover*, Command*, Select*, AlertDialog*` | `:16-79` | — |

### Non-component modules the form depends on

| Module | file:line | What it provides |
|---|---|---|
| `supabase` client | `:10` → `src/integrations/supabase/client` | all data access |
| `useAuth` | `:11` → `src/lib/auth/AuthProvider` | `user`, `session` (`:290`) |
| `useDebounce` | `:12` → `src/hooks/use-debounce` | 350 ms debounce on both searches (`:93`, `:550`) |
| `toFaDigits`, `formatNumber` | `:14` → `src/lib/i18n/formatters.ts:3,7` | Persian digits / thousand separators |
| `extractReceiptFromBytes` | `:26` → `src/lib/receipt-ocr-bytes.functions.ts` | TanStack server fn, OCR on raw bytes |
| `parseReceiptText` | `:27` → `src/lib/accounting/receipt-extraction` | legacy free-text fallback parser |
| `toHtmlTimeValue` | `:28` → `src/lib/accounting/receipt-ocr-structured` | normalises OCR time to `HH:MM` |
| `RECEIPT_TYPES`, `RECEIPT_TYPE_FA`, `RECEIPT_TYPE_HINT_FA`, `requiresInvoiceLinks` | `:29-35` → `src/lib/receipts/receipt-types.ts:10,19,26,43` | the four receipt types |
| `parseDateToGregorianIso`, `isoToJalaliDisplay` | `:36` → `src/lib/i18n/jalali.ts:108` | date conversions |
| `evaluateReceiptSecurityWarnings` | `:44-47` → `src/lib/accounting/receipt-security.ts:56` | the 6 manual warning rules |
| `fetchValidationRules`, `evaluateRules`, `splitViolations` | `:48-53` → `src/lib/validation/rules.ts:21,34,58` | DB-driven validation rules |

---

## A2 — Every input the user can fill

`useForm` is at `:318-355`, `mode: "onBlur"`, `resolver: zodResolver(schema)`; the zod schema is `:200-263`.

**Convention below:** "required" is decided *only* from the zod schema, never from the red `*` in the label.

| # | Persian label on screen | form key (zod key) | control type | required? — zod line quoted | default value | conditional visibility (exact condition, line) | client-side validation / transform / onBlur | file:line |
|---|---|---|---|---|---|---|---|---|
| 1 | مشتری | `customer_id` | searchable-select (Popover + Command, remote query) | **required** — `customer_id: z.string().uuid("انتخاب مشتری الزامی است"),` (`:202`) | `""` (`:321`) | always visible | set via `form.setValue("customer_id", c.id, { shouldValidate: true })`; search debounced 350 ms (`:550`) | `:1212-1274` |
| 2 | نوع فیش | `receipt_type` | select (4 options from `RECEIPT_TYPES`) | **required** — `receipt_type: z.enum(RECEIPT_TYPES),` (`:203`) | `"invoice_payment"` (`:322`) | always visible | `form.setValue(..., { shouldValidate: true })`; changing it resets `allocations` via `allocResetKey` effect (`:687-694`) | `:1277-1299` |
| 3 | اتصال به پیش‌فاکتورها — «افزودن پیش‌فاکتور» + per-invoice «مبلغ تخصیص» | **not in zod** — React state `allocations` (`:308`) | repeatable list; each row a `type="number"` input | **conditionally required, enforced imperatively** — `if (requiresInvoiceLinks(values.receipt_type)) { if (allocs.length === 0) throw new Error("برای پرداخت پیش‌فاکتور، حداقل یک پیش‌فاکتور انتخاب کنید"); …}` (`:928-943`) | `[]` (`:308`) | **`{requiresInvoiceLinks(watchedReceiptType) && (` (`:1324`)** — i.e. only when `receipt_type === "invoice_payment"` (`src/lib/receipts/receipt-types.ts:43-45`) | row input `min={1} max={a.remaining}`, `onChange={(e) => setAllocationAmount(a.quote_id, Number(e.target.value) \|\| 0)}` (`:1475-1485`); add-button `disabled={!watchedCustomerId}` (`:1405`); submit button disabled when `allocations.length === 0 \|\| overAllocated` (`:2073-2077`) | `:1324-1519` |
| 4 | جستجو و تکمیل خودکار (واریزکننده) | none — writes into `payer_name` / `payer_phone` / `payer_accounting_code` | searchable-select popover | n/a (helper) | — | always visible | on pick: three `setValue(..., {shouldValidate:true})` (`:1527-1533`); query enabled only `open && debounced.trim().length >= 2` (`:97`) | `:1525-1534`, component `:90-161` |
| 5 | نام و نام‌خانوادگی (واریزکننده) | `payer_name` | text | **required** — `payer_name: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(150, "حداکثر ۱۵۰ کاراکتر"),` (`:204`) | `""` (`:323`) | always visible | zod `.trim()` only | `:1537-1545` |
| 6 | شماره موبایل (واریزکننده) | `payer_phone` | text, `dir="ltr"` | optional — `payer_phone: z.string().trim().max(30).optional().or(z.literal("")),` (`:205`) | `""` (`:324`) | always visible | none | `:1546-1549` |
| 7 | کد حسابداری (واریزکننده) | `payer_accounting_code` | text, `dir="ltr"` | optional — `payer_accounting_code: z.string().trim().max(50).optional().or(z.literal("")),` (`:206`) | `""` (`:325`) | always visible | **onBlur `handlePayerCodeBlur`** (`:1554`) → `resolveByAccountingCode` (`:565-595`) hits `customers` then `external_parties`; fills `payer_name`/`payer_phone` **only when empty**, toasts `واریزکننده شناسایی شد` (`:597-608`) | `:1550-1556` |
| 8 | جستجو و تکمیل خودکار (گیرنده) | none — writes `receiver_name` / `receiver_phone` / `receiver_accounting_code` | searchable-select popover | n/a (helper) | — | always visible | on pick: three `setValue(..., {shouldValidate:true})` (`:1566-1572`) | `:1564-1573` |
| 9 | حالت ۱: حساب بانکی خودِ ما | `destination_bank_account_id` | select (from `bank_accounts`) | **conditionally required (XOR)** — `.refine((v) => Boolean(v.destination_bank_account_id) !== Boolean(v.receiver_party_id), { message: "گیرنده باید دقیقاً یکی باشد: «بانک ما» یا «طرف خارجی» (نه هر دو، نه هیچ‌کدام).", path: ["receiver_party_id"] })` (`:251-254`); field itself `destination_bank_account_id: z.string().uuid().optional().or(z.literal("")),` (`:248`) | `""` (`:351`) | always rendered, but **`disabled={Boolean(form.watch("receiver_party_id"))}`** (`:1589`) | on pick: clears `receiver_party_id` (`:1596`); back-fills `destination_bank` and `bank_name` from the account's `bank_name` **only if currently empty** (`:1597-1605`); `"__none"` sentinel resets to `""` (`:1591-1594`) | `:1583-1620` |
| 10 | حالت ۲: شخص/طرف حساب خارجی | `receiver_party_id` | select (from `external_parties`) | **conditionally required (same XOR refine)** — `.refine((v) => Boolean(v.destination_bank_account_id) !== Boolean(v.receiver_party_id), …path: ["receiver_party_id"])` (`:251-254`); field `receiver_party_id: z.string().uuid().optional().or(z.literal("")),` (`:249`) | `""` (`:352`) | always rendered, but **`disabled={Boolean(form.watch("destination_bank_account_id"))}`** (`:1627`) | on pick: clears `destination_bank_account_id` (`:1634`); **overwrites** `receiver_name` unconditionally and fills `receiver_phone`/`receiver_accounting_code` when the party has them (`:1636-1644`); also drops the `journal_entry / receiver_accounting_code / required` rule at submit time (`:1139-1148`) | `:1621-1660` |
| 11 | نام گیرنده | `receiver_name` | text | **required** — `receiver_name: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(150, "حداکثر ۱۵۰ کاراکتر"),` (`:207`) | `""` (`:326`) | always visible | may be overwritten by mode-2 select (`:1637`) | `:1667-1675` |
| 12 | شماره موبایل (گیرنده) | `receiver_phone` | text, `dir="ltr"` | optional — `receiver_phone: z.string().trim().max(30).optional().or(z.literal("")),` (`:208`) | `""` (`:327`) | always visible | none | `:1676-1679` |
| 13 | کد حسابداری (گیرنده) | `receiver_accounting_code` | text, `dir="ltr"` | optional — `receiver_accounting_code: z.string().trim().max(50).optional().or(z.literal("")),` (`:209`) | `""` (`:328`) | always visible | **onBlur `handleReceiverCodeBlur`** (`:1684-1686`) → same resolver, fills empty `receiver_name`/`receiver_phone` (`:609-620`). Also participates in `validation_rules` evaluation at submit (`:1153`) | `:1680-1688` |
| 14 | کد آسان ذینفع | `beneficiary_accounting_code` | text, `dir="ltr"`, placeholder `کد حسابداری طلبکار` | optional — `beneficiary_accounting_code: z.string().trim().max(50).optional().or(z.literal("")),` (`:210`) | `""` (`:329`) | always visible | **onBlur `handleBeneficiaryCodeBlur`** (`:1708-1710`) → `resolveByAccountingCode`; on hit sets `beneficiaryName` state + toast; on miss clears it and toasts `کد آسان ذینفع پیدا نشد. می‌توانید همچنان ثبت کنید.` (`:623-637`) | `:1703-1712` |
| 15 | مبلغ (تومان) | `amount` | number, `inputMode="numeric"`, `min={1}`, `step="1"` | **required** — `amount: z.number({ message: "مبلغ الزامی است" }).positive("مبلغ باید مثبت باشد").max(1e12, "مبلغ نامعتبر است (حداکثر ۱۰۰۰ میلیارد تومان)"),` (`:211-214`) | `undefined as unknown as number` (`:330`) | always visible | `{ valueAsNumber: true }` (`:1781`); drives `overAllocated` / suggestions | `:1772-1786` |
| 16 | شماره پیگیری | `tracking_number` | text, `dir="ltr"` | **required** — `tracking_number: z.string().trim().min(1, "شماره پیگیری الزامی است").max(100, "حداکثر ۱۰۰ کاراکتر"),` (`:220-224`) | `""` (`:335`) | always visible | part of the duplicate-detection key (`:950`) | `:1788-1796` |
| 17 | تاریخ روی فیش واریزی | `payment_date` | `JalaliDateInput` (Jalali calendar, stores ISO Gregorian) | **required** — `payment_date: z.string().min(1, "تاریخ الزامی است").refine((d) => d <= today, "تاریخ نمی‌تواند در آینده باشد"),` (`:215-218`) | `""` (`:332`) — comment at `:331` says "never default to today" | always visible | `max={today}` (`:1821`); `invalid={!watchedPaymentDate \|\| Boolean(errors.payment_date)}` (`:1823`); on change `setValue(..., {shouldValidate:true, shouldDirty:true})` (`:1818-1820`); OCR fills it only when empty and `iso <= today` (`:466-472`) | `:1812-1836` |
| 18 | ساعت واریز | `payment_time` | `<Input type="time">` | **required** — `payment_time: z.string().regex(/^\d{2}:\d{2}$/, "فرمت ساعت HH:MM"),` (`:219`) | `""` (`:334`) | always visible | OCR assistively copies `receipt_time` into it when empty (`:482-485`) | `:1838-1849` |
| 19 | توضیحات | `description` | textarea, `rows={3}` | optional — `description: z.string().trim().max(1000).optional().or(z.literal("")),` (`:246`) | `""` (`:349`) | always visible | OCR fills when empty with `شماره تراکنش / وضعیت تراکنش روی فیش / description` joined by ` \| ` (`:517-528`) | `:1852-1855` |
| 20 | حساب مبدأ ما (اختیاری) | `source_bank_account_id` | select (from `bank_accounts`) | optional — `source_bank_account_id: z.string().uuid().optional().or(z.literal("")),` (`:247`) | `""` (`:350`) | always visible | on pick fills `source_bank` from the account's `bank_name` **only when empty** (`:1892-1894`); `"__none"` sentinel (`:1886-1889`) | `:1881-1908` |
| 21 | (no `<Label>` of its own — sits under «حساب مبدأ ما») placeholder `نام بانک مبدأ (متن)` | `source_bank` | text | optional — `source_bank: z.string().trim().max(100).optional().or(z.literal("")),` (`:226`) | `""` (`:337`) | always visible | OCR fills when empty (`:488-491`) | `:1909-1913` |
| 22 | نام بانک مقصد (متن) | `destination_bank` | text, placeholder `مثلاً: بانک ملت` | optional — `destination_bank: z.string().trim().max(100).optional().or(z.literal("")),` (`:227`) | `""` (`:338`) | always visible | OCR fills when empty (`:492-495`); back-filled by mode-1 bank select (`:1599-1601`) | `:1916-1919` |
| 23 | ساعت روی فیش | `receipt_time` | `<Input type="time" dir="ltr">` | optional — `receipt_time: z.string().trim().regex(/^\d{2}:\d{2}$/, "فرمت ساعت HH:MM").optional().or(z.literal("")),` (`:232-237`) | `""` (`:343`) | always visible | OCR fills when empty via `toHtmlTimeValue` (`:474-487`) | `:1921-1927` |
| 24 | روش انتقال | `document_channel` | select — 7 options from `DOCUMENT_CHANNELS` (`:163-172`): `card_to_card, paya, pol, satna, cash, cheque, other` | optional-ish — `document_channel: z.union([z.enum(["card_to_card","paya","pol","satna","cash","cheque","other"]), z.literal("")]),` (`:238-241`) — the empty string is a legal value, so the field is **not** required | `""` (`:344`) | always visible | **on change, if `v !== "cheque"` it clears `cheque_number` and `cheque_due_date`** (`:1948-1951`); value `pol` raises a high-severity security warning (`src/lib/accounting/receipt-security.ts:82-89`) | `:1929-1965` |
| 25 | شمارهٔ چک | `cheque_number` | text, `dir="ltr"`, `className="text-left"` | **conditionally required** — `.refine((v) => v.document_channel !== "cheque" \|\| Boolean(v.cheque_number), { message: "برای روش انتقال «چک»، شمارهٔ چک الزامی است.", path: ["cheque_number"] })` (`:260-262`); and forbidden otherwise — `.refine((v) => v.document_channel === "cheque" \|\| (!v.cheque_number && !v.cheque_due_date), { message: "شماره و سررسید چک فقط وقتی روش انتقال «چک» است قابل ثبت‌اند.", path: ["cheque_number"] })` (`:256-259`); field itself `cheque_number: z.string().trim().max(50).optional().or(z.literal("")),` (`:242`) | `""` (`:345`) | **`{form.watch("document_channel") === "cheque" && (` (`:1968`)** | nulled defensively in the payload when channel ≠ cheque (`:1005`) | `:1970-1978` |
| 26 | تاریخ سررسید چک | `cheque_due_date` | `JalaliDateInput` (no `max`, so a future date is allowed) | optional but forbidden off-cheque — `cheque_due_date: z.string().trim().optional().or(z.literal("")),` (`:243`) + the forbidding refine at `:256-259` | `""` (`:346`) | **`{form.watch("document_channel") === "cheque" && (` (`:1968`)** — same wrapper as #25 | nulled defensively in the payload when channel ≠ cheque (`:1006-1007`) | `:1979-1988` |
| 27 | نام واریزکننده روی فیش | `payer_name_on_receipt` | text | optional — `payer_name_on_receipt: z.string().trim().max(150).optional().or(z.literal("")),` (`:228`) | `""` (`:339`) | always visible | OCR fills when empty (`:496-501`); **blank value raises a medium security warning** `payer_name_missing` (`receipt-security.ts:91-98`) | `:1992-1995` |
| 28 | نام گیرنده روی فیش | `receiver_name_on_receipt` | text | optional — `receiver_name_on_receipt: z.string().trim().max(150).optional().or(z.literal("")),` (`:229`) | `""` (`:340`) | always visible | OCR fills when empty (`:502-507`) | `:1997-2000` |
| 29 | پرفراژ دارد؟ | `has_perforation` | checkbox | boolean, always present — `has_perforation: z.boolean(),` (`:230`) | `false` (`:341`) | always visible | `onCheckedChange={(c) => form.setValue("has_perforation", c === true, {shouldDirty:true})}` (`:2006-2008`); **`false` raises a medium warning** `no_perforation` (`receipt-security.ts:100-107`) | `:2003-2011` |
| 30 | فیش تایپی است؟ | `is_typed_receipt` | checkbox | boolean — `is_typed_receipt: z.boolean(),` (`:244`) | `false` (`:347`) | always visible | `true` raises a **high** warning `typed_receipt` (`receipt-security.ts:109-116`) | `:2012-2020` |
| 31 | رسید اسکرین‌شات از همراه بانک است؟ | `is_mobile_bank_screenshot` | checkbox | boolean — `is_mobile_bank_screenshot: z.boolean(),` (`:231`) | `false` (`:342`) | always visible | passed to `evaluateFormWarnings` (`:1170`) but **`receipt-security.ts` never reads it** — see "Findings" | `:2021-2031` |
| 32 | مستندات فیش → «آپلود تصویر یا فایل» | **not in zod** — React state `stagedFiles` (`:310`) | `<input type="file" multiple accept={ALLOWED_DOC_ACCEPT}>` | optional | `[]` (`:310`) | always visible | `validateReceiptFile` per file — max 20 MB (`PaymentReceiptDocuments.tsx:113,326-328`), extension/MIME allowlist (`:64-92, 329-344`), explicit block on `exe\|bat\|cmd\|sh\|msi\|apk\|dll\|js\|jar` (`:341`); max 10 files (`:114,441-444`); de-dup by name+size (`:451`). **Picking a file also triggers OCR auto-fill** (`PaymentReceiptForm.tsx:360-545`) | `:2036-2040`; picker `PaymentReceiptDocuments.tsx:426-527` |
| 33 | اطلاعات تکمیلی (dynamic, admin-defined) | **not in zod** — React state `customData` (`:311`) | one control per row: `select` / `PersianDatePicker` / `number` / `text` depending on `field_type` (`WaybillCustomFieldsInput.tsx:87-118`) | **per-field, from the DB row** — `if (f.is_required && empty) { errs[f.field_key] = "این فیلد الزامی است"; }` (`WaybillCustomFieldsInput.tsx:47-50`) | `{}` (`:311`) | **`{customFields.length > 0 && (` (`:2048`)**, and inside, `fields.filter((f) => f.is_active)` (`WaybillCustomFieldsInput.tsx:69`), returning `null` when none (`:70`) | `validateCustomData(customFields, customData)` runs **first** in the submit handler and aborts on any error (`:1123-1128`); number fields also checked with `Number.isNaN(Number(v))` (`WaybillCustomFieldsInput.tsx:51-53`); text maxLength 500 (`:115`) | `:2048-2057`; component `WaybillCustomFieldsInput.tsx:58-126` |

### Zod keys with **no** rendered input (rebuild trap)

| zod key | zod line | How it gets a value | Sent to DB? |
|---|---|---|---|
| `bank_name` | `bank_name: z.string().trim().max(100).optional().or(z.literal("")),` (`:225`); default `""` (`:336`) | **Only** programmatically, from the mode-1 bank-account select when currently empty: `form.setValue("bank_name", b.bank_name, { shouldDirty: true })` (`:1602-1604`). There is no input for it anywhere in the file (verified by grep — all other hits are schema/payload/query). | Yes — `bank_name: values.bank_name \|\| null` (`:994`), and it is part of the duplicate key (`:954-958`) |
| `receipt_image_url` | `receipt_image_url: z.string().trim().max(500).optional().or(z.literal("")),` (`:245`); default `""` (`:348`) | **Never set anywhere.** Grep over the file shows only schema (`:245`), default (`:348`) and payload (`:1009`). It is dead on the create page. | Yes, always `null` — `receipt_image_url: values.receipt_image_url \|\| null` (`:1009`) |

### Search inputs (state, not form fields)

| Control | State | Debounce | file:line |
|---|---|---|---|
| `CommandInput` inside مشتری combobox | `customerSearch` (`:549`) | `useDebounce(customerSearch, 350)` (`:550`) | `:1235-1239` |
| `CommandInput` inside PartyLookup (×2 instances) | local `search` (`:92`) | `useDebounce(search, 350)` (`:93`); query gated on `debounced.trim().length >= 2` (`:97`) | `:1122-1126` |
| `CommandInput` inside the invoice picker | none (client-side `Command` filter — `shouldFilter` not disabled here, unlike the other two) | — | `:1413` |

---

## A3 — Every display-only element

| # | What it shows (Persian) | Where the value comes from | file:line |
|---|---|---|---|
| 1 | `ثبت فیش واریزی` / `ثبت فیش واریزی جدید برای مشتری` | hardcoded props on `PageHeader` | `src/routes/_app.accounting.receipts.create.tsx:20-21` |
| 2 | `بازگشت به لیست` link | hardcoded `<Link to="/accounting/receipts">` | route `:23-28` |
| 3 | Receipt-type hint sentence | `RECEIPT_TYPE_HINT_FA[watchedReceiptType]` — table at `src/lib/receipts/receipt-types.ts:26-31` | `:1300-1302` |
| 4 | Info box `دریافت بدون پیش‌فاکتور: …اعتبار/طلب مشتری…` | rendered when `!requiresInvoiceLinks(watchedReceiptType)` | `:1308-1314` |
| 5 | Muted box `اگر مشتری بدون بدهی و بدون پیش‌فاکتور…` | the `else` branch of #4 | `:1316-1319` |
| 6 | `پیشنهاد اتصال به پیش‌فاکتور` panel: invoice number, confidence badge (`اطمینان بالا/متوسط/پایین`), `مانده: … • تخصیص پیشنهادی: …`, reason sentence | computed client-side by the `suggestions` `useMemo` — scoring at `:803-842`, ranked `rank = (exact ? 0 : 1) * 1000 + closeness * 100 + Math.min(dateProximity, 365) * 0.05` (`:836`), `.slice(0, 3)` (`:842`). Inputs: `customerInvoices` query + `watchedAmount` + `watchedPaymentDate` | `:1326-1395`; memo `:784-843` |
| 7 | `ابتدا مشتری را انتخاب کنید.` | `!watchedCustomerId` | `:1442-1444` |
| 8 | `این مشتری پیش‌فاکتور پذیرفته‌شده با ماندهٔ باز ندارد؛ امکان اتصال وجود ندارد.` | `watchedCustomerId && requiresInvoiceLinks(...) && customerInvoices.length === 0` | `:1446-1452` |
| 9 | `هنوز پیش‌فاکتوری انتخاب نشده است.` | `watchedCustomerId && customerInvoices.length > 0 && allocations.length === 0` | `:1454-1456` |
| 10 | Per-allocation row: invoice number, `مبلغ کل: … • مانده: …` | `allocations` state, seeded from the `receipt-form-invoices` query | `:1466-1472` |
| 11 | `مجموع تخصیص: X از Y` plus one of `مازاد: …` / `باقی‌مانده: …` / `برابر` | `totalAllocated = allocations.reduce(...)` (`:754`), `overAllocated = totalAllocated > watchedAmount` (`:755`), `allocationDiff = watchedAmount - totalAllocated` (`:756`) | `:1499-1515` |
| 12 | `نام ذینفع (خودکار)` — `readOnly disabled` Input | `beneficiaryName` state (`:622`), populated only by `handleBeneficiaryCodeBlur` (`:623-637`) which resolves `customers` then `external_parties` by `accounting_code` | `:1713-1716` |
| 13 | **`پیش‌نمایش سند حسابداری خودکار`** — 2-row debit/credit table | see the dedicated section below | `:1720-1768` |
| 14 | `تاریخ ثبت فیش` — `readOnly disabled` Input | `isoToJalaliDisplay(today)` where `const today = new Date().toISOString().slice(0, 10);` (`:174`). **Module-level constant, computed once at import — it does not roll over at midnight in a long-lived tab.** | `:1798-1810`; `today` `:174`; helper `src/lib/i18n/jalali.ts:108` |
| 15 | `به‌صورت خودکار با تاریخ امروز پر می‌شود.` | hardcoded hint under #14 | `:1807-1809` |
| 16 | `تاریخ از روی فیش استخراج نشد — لطفاً دستی وارد کنید (اجباری).` | `!watchedPaymentDate && !errors.payment_date` | `:1825-1829` |
| 17 | `در صورت آپلود فیش، به‌صورت خودکار از فیش استخراج می‌شود.` | hardcoded | `:1833-1835` |
| 18 | `در صورت OCR، از «ساعت روی فیش» پر می‌شود — نه از ساعت آپلود/سیستم.` | hardcoded | `:1846-1848` |
| 19 | Amber banner `اطلاعات زیر به‌صورت خودکار از روی تصویر فیش استخراج شده‌اند…` | `ocrAssistNotice` state (`:314`), set `true` on any OCR result (`:442`) | `:1865-1870` |
| 20 | Bulleted OCR warnings (max 6) | `ocrReviewWarnings` state (`:315`), set from `parsed.warnings` when `parsed.warnings.length > 0 \|\| parsed.structured?.needs_manual_review` (`:443-445`) | `:1871-1877` |
| 21 | `جزئیات تکمیلی فیش` intro paragraph | hardcoded | `:1861-1864` |
| 22 | `در حال استخراج خودکار اطلاعات از فایل آپلودشده…` + spinner | `autoFilling` state (`:313`), toggled around the OCR loop (`:370`, `:537`) | `:2041-2046` |
| 23 | Staged-file list: file name, size (`formatBytes`), image-vs-document icon; empty state `هیچ مستندی انتخاب نشده است.`; limits sentence | `files` prop = `stagedFiles`; sizes computed by `formatBytes` | `PaymentReceiptDocuments.tsx:487-524`, `:419-423` |
| 24 | `برای پرداخت پیش‌فاکتور، حداقل یک پیش‌فاکتور انتخاب کنید.` (under the submit button) | `requiresInvoiceLinks(watchedReceiptType) && allocations.length === 0` | `:2082-2086` |
| 25 | `مجموع تخصیص بیشتر از مبلغ فیش است.` (under the submit button) | `requiresInvoiceLinks(...) && allocations.length > 0 && overAllocated` | `:2087-2091` |
| 26 | Duplicate dialog `احتمال ثبت فیش تکراری` + `… ${toFaDigits(String(duplicateCount))} فیش مشابه قبلاً ثبت شده است…` | `duplicateCount` from the `head:true, count:"exact"` query on `payment_receipts` (`:947-959`) | `:2096-2130` |
| 27 | Security-warning dialog `هشدارهای امنیتی فیش` with `[مهم]/[متوسط]/[کم]` prefixes and `[استاندارد]` for DB rules | `pendingWarnings` (from `evaluateReceiptSecurityWarnings`) + `pendingRuleWarnings` (from `validation_rules`) | `:2132-2183`; evaluator `src/lib/accounting/receipt-security.ts:56-170` |
| 28 | Blocking dialog `ثبت ممکن نیست` | `blockingViolations` = `splitViolations(...).blocking` (`:1156-1159`) | `:2185-2202` |
| 29 | Per-field zod error `<p className="text-xs text-destructive">` | `form.formState.errors` (`:357`) — rendered for `customer_id, payer_name, receiver_party_id, receiver_name, amount, tracking_number, payment_date, payment_time, receipt_time, cheque_number, cheque_due_date`. **No error is rendered for `payer_phone`, `payer_accounting_code`, `receiver_phone`, `receiver_accounting_code`, `beneficiary_accounting_code`, `description`, `source_bank`, `destination_bank`, `*_name_on_receipt`, `destination_bank_account_id`** — a max-length violation on those is silent in the UI | `:1271-1273, 1542-1544, 1662-1664, 1672-1674, 1783-1785, 1793-1795, 1830-1832, 1843-1845, 1924-1926, 1975-1977, 1985-1987` |
| 30 | Toasts (sonner) | ~14 distinct call sites, e.g. `به‌صورت خودکار از فیش پر شد: …` (`:531`), `فیش واریزی ثبت شد` (`:1108`), `ثبت فیش ناموفق بود: …` (`:1114`) | throughout |

### A3-bis — The `پیش‌نمایش سند حسابداری خودکار` block, verbatim

Rendered as an IIFE inside JSX at `:1721-1768`. Visibility gate (`:1722-1726`):

```tsx
const payerCode = form.watch("payer_accounting_code");
const benefCode =
  form.watch("beneficiary_accounting_code") || form.watch("receiver_accounting_code");
const amt = form.watch("amount") || 0;
if (!payerCode || !benefCode || amt <= 0) return null;
```

Header row (`:1735-1740`): `شرح` | `کد آسان` | `بدهکار` | `بستانکار`.

**Row 1 — the debit line** (`:1743-1752`):

| cell | exact expression | line |
|---|---|---|
| شرح | `ذینفع (طلبکار) {beneficiaryName ? `- ${beneficiaryName}` : ""}` | `:1744-1746` |
| کد آسان | `{toFaDigits(benefCode)}` — i.e. `beneficiary_accounting_code \|\| receiver_accounting_code` | `:1747-1749` |
| **بدهکار** | `{formatNumber(amt)}` — i.e. the full `amount`, unconditionally | `:1750` |
| بستانکار | literal `—` | `:1751` |

**Row 2 — the credit line** (`:1753-1763`):

| cell | exact expression | line |
|---|---|---|
| شرح | `پرداخت‌کننده{" "}{form.watch("payer_name") ? `- ${form.watch("payer_name")}` : ""}` | `:1754-1757` |
| کد آسان | `{toFaDigits(payerCode)}` — i.e. `payer_accounting_code` | `:1758-1760` |
| بدهکار | literal `—` | `:1761` |
| **بستانکار** | `{formatNumber(amt)}` — i.e. the full `amount`, unconditionally | `:1762` |

Caption above the table (`:1730-1732`): `پس از تأیید این فیش، سند زیر به‌صورت خودکار ثبت می‌شود.`

**What this block is, mechanically:** a pure client-side, hardcoded two-line entry. Debit is *always* the beneficiary code for the full amount; credit is *always* the payer code for the full amount. It reads **nothing** from the server — there is no query, no RPC, no preview call anywhere in the file that could confirm what `post_receipt_accounting` would actually post. Cross-check against the DB function is Agent B/C's scope; from the frontend side the following are facts:

- The preview ignores `receipt_type` entirely — `invoice_payment`, `debt_payment`, `prepayment` and `positive_credit` all render the identical two lines.
- It ignores `document_channel`, so cash/cheque/pol produce the same preview as a card transfer.
- It ignores the receiver mode: whether گیرنده is «حساب بانکی خودِ ما» (`destination_bank_account_id`) or «طرف حساب خارجی» (`receiver_party_id`) has no effect on either leg, even though the two modes are what the XOR refine at `:251-254` exists to distinguish.
- It ignores `allocations` — a receipt split across three invoices still previews as one line.
- `benefCode` falls back to `receiver_accounting_code` (`:1723-1724`) but the شرح label uses `beneficiaryName`, which is set **only** by `handleBeneficiaryCodeBlur` on the *beneficiary* field (`:623-637`). So when the fallback is in play the row reads `ذینفع (طلبکار)` with either no name or a **stale name left over from a beneficiary code the user has since cleared** — `handleBeneficiaryCodeBlur` clears `beneficiaryName` only when the field is blurred empty (`:625-628`), not when its value merely changes without a blur.
- `amt` uses `form.watch("amount") || 0`, so a `0` or `NaN` amount hides the block rather than showing a zero entry.

---

## A4 — Every data source read by the page

Firing on mount (no user interaction): #2, #3, #6, #8, #9, #10. Gated: #1 (needs ≥2 chars + open popover), #7 (needs a customer *and* `invoice_payment`). Event-driven: #4, #5, #11.

| # | Trigger / queryKey | Table or RPC | Columns selected | Filters / order / limit | UI element it feeds | file:line |
|---|---|---|---|---|---|---|
| 1 | `["party-lookup", debounced]` — `enabled: open && debounced.trim().length >= 2`, `staleTime: 30_000` | `customers` | `id, name, phone, accounting_code` | `.or(\`name.ilike.%${term}%,phone.ilike.%${term}%,accounting_code.ilike.%${term}%\`)`, `.order("name", {ascending:true})`, `.limit(20)`; term sanitised with `.replace(/[%_]/g, "")` (`:100`) | both «جستجو و تکمیل خودکار» popovers (payer `:1525`, receiver `:1564`) | `:95-111` |
| 2 | `["validation-rules","receipt"]`, `staleTime: 5*60_000` | `validation_rules` | `id, scope, field_key, rule_type, enabled, severity, message` | `.eq("scope", "receipt")` | submit-time rule evaluation → warning/blocking dialogs | `:553-557` → `src/lib/validation/rules.ts:21-28` |
| 3 | `["validation-rules","journal_entry"]`, `staleTime: 5*60_000` | `validation_rules` | same | `.eq("scope", "journal_entry")` | same; one rule is filtered out at submit when mode 2 is active (`:1139-1148`) | `:558-562` |
| 4 | `resolveByAccountingCode(code)` — called from the three `onBlur` handlers | `customers`, then `external_parties` | `id, name, phone` / `id, full_name, phone` | `.eq("accounting_code", c).maybeSingle()` on each | auto-fills payer/receiver name+phone; sets `beneficiaryName` | `:565-595` |
| 5 | `buildValidCodesSet(values)` — called once per submit | `customers`, then `external_parties` | `accounting_code` (both) | `.in("accounting_code", codes)` where `codes = [payer_accounting_code, receiver_accounting_code]` filtered non-empty (`:640-643`); returns `new Set()` without querying when both are blank | the `accounting_code_valid` rule type in `evaluateRules` | `:639-662` |
| 6 | `["receipt-form-customers", debouncedCustomer]`, `staleTime: 30_000` | `customers` | `id, name, phone` | `.order("name", {ascending:true}).limit(20)`; when a term exists also `.or(\`name.ilike.%${term}%,phone.ilike.%${term}%\`)` (note: **no** `accounting_code` here, unlike #1) | the مشتری combobox; also `selectedCustomer` for the trigger label (`:681`) | `:664-679` |
| 7 | `["receipt-form-invoices", watchedCustomerId]` — `enabled: !!watchedCustomerId && requiresInvoiceLinks(watchedReceiptType)` (`:699`), `staleTime: 30_000` | **two queries.** (a) `sales_quotes`; (b) `payment_receipt_links` with an embedded join | (a) `id, quote_number, final_amount, status, created_at, expires_at`; (b) `quote_id, amount, receipt:payment_receipts!inner(status)` | (a) `.eq("customer_id", watchedCustomerId).eq("status","accepted").order("created_at",{ascending:false}).limit(50)`; (b) `.in("quote_id", ids)`. Then client-side: `paid` sums only links whose `receipt.status === "approved"` (`:731-733`), `remaining = max(0, final_amount - paid)`, `.filter(o => o.remaining > 0.001)` (`:736-749`) | the «افزودن پیش‌فاکتور» picker and the `suggestions` panel | `:697-752` |
| 8 | `["receipt-form-bank-accounts"]`, `staleTime: 60_000` | `bank_accounts` | `id, title, bank_name, is_active` | `.eq("is_active", true).order("title", {ascending:true})` — **no limit** | «حالت ۱: حساب بانکی خودِ ما» (`:1613`) **and** «حساب مبدأ ما» (`:1902`) | `:854-866` |
| 9 | `["receipt-form-external-parties"]`, `staleTime: 60_000` | `external_parties` | `id, full_name, phone, accounting_code, is_active` | `.eq("is_active", true).order("full_name", {ascending:true})` — **no limit** | «حالت ۲: شخص/طرف حساب خارجی» (`:1652`) | `:868-886` |
| 10 | `["payment-receipt-custom-fields","active"]`, `staleTime: 60_000` | `payment_receipt_custom_fields` | `id, field_key, field_label, field_type, field_options, is_required, is_active, sort_order` | `.eq("is_active", true).order("sort_order",{ascending:true}).limit(200)` | `WaybillCustomFieldsInput` (`:2050`) | `:889-904` |
| 11 | `extractReceiptFromBytes({data:{file_name, mime, base64}, headers:{Authorization: Bearer <session.access_token>}})` — fires from a `useEffect` on every newly staged file (`:360-545`) | TanStack **server function**, not a table | returns `{raw_text, method, warnings, structured, engine_confidence, ok, disabled, reason}` | dedup key `` `${f.name}|${f.size}|${f.lastModified}` `` in `autoExtractedRef` (`:364-369`); server enforces `admin\|accountant` and a 20 MB cap | auto-fills 9 form fields + `description`; sets `ocrAssistNotice`, `ocrReviewWarnings`, `autoFilling` | `:386-393`; server fn `src/lib/receipt-ocr-bytes.functions.ts:1-40` |
| 12 | `useAuth()` | AuthProvider context, not a query | `user`, `session` | — | `user.id` for `created_by` + audit rows; `session.access_token` for the OCR call | `:290` |

Note on the duplicate check (`:947-959`): it is a *query* too, but it runs inside `mutationFn`, not on load — it is listed under A5.

---

## A5 — The submit path

### Step 0 — the button

```tsx
<Button type="submit" disabled={ mutation.isPending ||
  (requiresInvoiceLinks(watchedReceiptType) && (allocations.length === 0 || overAllocated)) }>
  ثبت فیش
</Button>
```
`:2071-2081`. Label `ثبت فیش` (`:2080`). Cancel button navigates to `/accounting/receipts` without confirmation (`:2062-2069`).

### Step 1 — `form.handleSubmit(onValid, onInvalid)` — `:1121-1205`

**`onInvalid`** (`:1182-1204`): `console.warn("[receipt-form] validation failed", errors)`; maps error keys through a Persian `labels` dict (`:1184-1194`) and toasts `فیلدهای ناقص: …`; then `document.querySelector(\`[name="${first}"]\`)` → `scrollIntoView` + `focus()` (`:1199-1203`). The dict covers only 9 keys; anything else is shown by raw key name (`:1196`), and fields set via `setValue` (the two receiver selects, `payment_date`, `document_channel`) have **no `name` attribute in the DOM**, so the scroll-to-field silently no-ops for them.

**`onValid`** (`:1122-1181`), in order:

1. `const cErrs = validateCustomData(customFields, customData);` → `setCustomErrors(cErrs)`; if non-empty, toast `لطفاً فیلدهای اطلاعات تکمیلی را تکمیل کنید` and **return** (`:1123-1128`).
2. Async IIFE (`:1130`):
   - `const validCodes = await buildValidCodesSet(v);` (`:1131`)
   - `const receiverIsExternalParty = Boolean(v.receiver_party_id);` (`:1139`) → `allRules` drops the `scope==="journal_entry" && field_key==="receiver_accounting_code" && rule_type==="required"` rule while mode 2 is selected (`:1140-1148`)
   - `fieldValues = { receiver_name, payer_name, payer_accounting_code, receiver_accounting_code }` (`:1149-1154`) — only these four are ever rule-checked
   - `evaluateRules(allRules, fieldValues, validCodes)` (`:1155`) → `splitViolations` (`:1156`)
   - blocking → `setBlockingViolations` + `setBlockingOpen(true)` + **return** (`:1157-1161`)
   - `evaluateFormWarnings({payment_date, tracking_number, amount, document_channel, payer_name_on_receipt, has_perforation, is_typed_receipt, is_mobile_bank_screenshot})` (`:1162-1171`)
   - warnings or rule-warnings → stash into `pendingWarnings` / `pendingRuleWarnings` / `pendingWarningContext` and open the confirm dialog + **return** (`:1172-1178`)
   - otherwise `mutation.mutate({ values: v, allocations, securityWarnings: [], customData })` (`:1179`)

Two dialog buttons re-enter the mutation:
- `ادامه و ثبت` on the duplicate dialog: `mutation.mutate({ values, allocations, bypassDuplicate: true, customData })` (`:2113-2121`)
- `ثبت با تأیید حسابدار` on the warnings dialog: `mutation.mutate({ values, allocations, securityWarnings: pendingWarnings, customData })` (`:2166-2175`)

### Step 2 — `mutation.mutationFn` — `:907-1100`

| Order | Action | Target | file:line |
|---|---|---|---|
| 1 | `if (!user?.id) throw new Error("کاربر شناسایی نشد")` | — | `:921` |
| 2 | Allocation guards (only when `requiresInvoiceLinks`): ≥1 allocation, sum > 0, `sum - values.amount <= 0.001`, each `amount > 0`, each `amount - a.remaining <= 0.001` | client-side | `:928-943` |
| 3 | **Duplicate probe** (skipped when `bypassDuplicate`): `supabase.from("payment_receipts").select("id", {count:"exact", head:true}).eq("tracking_number", …).eq("amount", …).eq("payment_date", …).neq("status","rejected")` plus `.eq("bank_name", …)` or `.is("bank_name", null)` | `payment_receipts` (read) | `:946-959` |
| 4 | If count > 0: **audit insert** `action: "duplicate_receipt_warning"` with `diff {tracking_number, amount, payment_date, bank_name, matches}` then `return {duplicate:true, count}` — **no receipt is written** | `audit_logs` (write #1) | `:962-977` |
| 5 | Build `payload` (27 keys, table below) | — | `:980-1018` |
| 6 | `await supabase.from("payment_receipts").insert(payload).select("id").single()` → `receiptId` | **`payment_receipts` (INSERT)** | `:1019-1025` |
| 7 | If `invoice_payment` and allocations exist: `insert` rows `{receipt_id, quote_id, amount}` | **`payment_receipt_links` (INSERT)** | `:1028-1036` |
| 8 | If that fails: `await supabase.from("payment_receipts").delete().eq("id", receiptId)` — a **manual, non-transactional rollback** — then throw `اتصال به پیش‌فاکتور ناموفق: …` | `payment_receipts` (DELETE) | `:1037-1041` |
| 9 | **Audit insert** `action: "payment_receipt_created"`, `diff` carries `customer_id, receipt_type, amount, tracking_number, bank_name, receipt_time, receiver{name,phone,accounting_code}, status:"pending_review", linked_invoices[]` (each with `quote_id, amount` and, when a suggestion was accepted, `matched_quote_id, suggested_confidence, suggested_reason, allocated_amount`) | `audit_logs` (write) | `:1044-1078` |
| 10 | If `securityWarnings.length > 0`: **audit insert** `action: "receipt_security_warning_confirmed"`, `diff {warnings}` | `audit_logs` (write) | `:1080-1089` |
| 11 | If `stagedFiles.length > 0`: `await uploadReceiptDocuments(receiptId, user.id, stagedFiles)`, then toast `N مستند پیوست شد` | Storage + 2 tables — see below | `:1091-1097` |
| 12 | `return { duplicate: false, receiptId }` | — | `:1099` |

**File-upload step (`uploadReceiptDocuments`, `PaymentReceiptDocuments.tsx:359-417`)** — happens **after** the receipt row exists, per file, best-effort (never throws; per-file failure only toasts and increments `failed`):
1. `path = \`${receiptId}/${safeRandomUUID()}-${safeFileName(file.name)}\`` (`:368`)
2. `supabase.storage.from("payment-receipt-documents").upload(path, file, {contentType, upsert:false})` — bucket constant `RECEIPT_DOCS_BUCKET` at `:56`; content type resolved by `resolveUploadContentType` (`:162-167`) (`:370-374`)
3. `insert` into **`payment_receipt_documents`**: `{receipt_id, storage_path, file_name, file_type: contentType, file_size, uploaded_by}` `.select("id").single()` (`:376-389`)
4. On insert failure: `storage.remove([path])` rollback, then throw into the per-file catch (`:390-394`)
5. **audit insert** `action: "receipt_document_uploaded"`, `diff {document_id, file_name, file_type, file_size, storage_path}` (`:396-408`)

### The payload object — every key and its origin (`:980-1018`)

| payload key | value expression | origin |
|---|---|---|
| `customer_id` | `values.customer_id` | مشتری combobox |
| `receipt_type` | `values.receipt_type` | نوع فیش select |
| `payer_name` | `values.payer_name` | text input / PartyLookup / code blur |
| `payer_phone` | `values.payer_phone \|\| null` | text input |
| `payer_accounting_code` | `values.payer_accounting_code \|\| null` | text input |
| `receiver_name` | `values.receiver_name` | text input / PartyLookup / mode-2 select |
| `receiver_phone` | `values.receiver_phone \|\| null` | text input |
| `receiver_accounting_code` | `values.receiver_accounting_code \|\| null` | text input / mode-2 select |
| `beneficiary_accounting_code` | `values.beneficiary_accounting_code \|\| null` | ذینفع input |
| `amount` | `values.amount` | number input (`valueAsNumber`) |
| `payment_date` | `values.payment_date` | JalaliDateInput (ISO) |
| `payment_time` | `values.payment_time` | `<input type="time">` |
| `tracking_number` | `values.tracking_number` | text input / OCR |
| `bank_name` | `values.bank_name \|\| null` | **no UI input** — only from mode-1 bank select (`:1603`) |
| `source_bank` | `values.source_bank \|\| null` | text input / OCR / source-account select |
| `destination_bank` | `values.destination_bank \|\| null` | text input / OCR / mode-1 select |
| `payer_name_on_receipt` | `values.payer_name_on_receipt \|\| null` | text input / OCR |
| `receiver_name_on_receipt` | `values.receiver_name_on_receipt \|\| null` | text input / OCR |
| `has_perforation` | `values.has_perforation` | checkbox |
| `is_mobile_bank_screenshot` | `values.is_mobile_bank_screenshot` | checkbox |
| `receipt_time` | `values.receipt_time \|\| null` | `<input type="time">` / OCR |
| `document_channel` | `values.document_channel \|\| null` | select / OCR |
| `cheque_number` | `values.document_channel === "cheque" ? values.cheque_number \|\| null : null` (`:1005`) | conditional input |
| `cheque_due_date` | `values.document_channel === "cheque" ? values.cheque_due_date \|\| null : null` (`:1006-1007`) | conditional input |
| `is_typed_receipt` | `values.is_typed_receipt` | checkbox |
| `receipt_image_url` | `values.receipt_image_url \|\| null` | **always `null`** — never set anywhere |
| `description` | `values.description \|\| null` | textarea / OCR |
| `source_bank_account_id` | `values.source_bank_account_id \|\| null` | select |
| `destination_bank_account_id` | `values.destination_bank_account_id \|\| null` | mode-1 select |
| `receiver_party_id` | `values.receiver_party_id \|\| null` | mode-2 select |
| `security_warnings` | `securityWarnings` (mutation arg, defaults `[]` at `:918`) | `evaluateReceiptSecurityWarnings` output, only when the user went through the warnings dialog |
| `custom_data` | `cData` (mutation arg, defaults `{}` at `:919`) | `customData` state |
| `status` | `"pending_review" as const` (`:1016`) | hardcoded |
| `created_by` | `user.id` (`:1017`) | AuthProvider |

That is **34 payload keys** (30 zod-derived + `security_warnings`, `custom_data`, `status`, `created_by`).

### Step 3 — success / error handling

| Callback | Behaviour | file:line |
|---|---|---|
| `onSuccess` | If `result.duplicate`: `setPendingValues({values, allocations})`, `setDuplicateCount(result.count)`, `setDuplicateOpen(true)`, return — **no navigation, no reset**. Otherwise: `toast.success("فیش واریزی ثبت شد")`, `queryClient.invalidateQueries({queryKey:["payment-receipts"]})`, `navigate({to:"/accounting/receipts"})` | `:1101-1111` |
| `onError` | `toast.error(\`ثبت فیش ناموفق بود: ${msg}\`)` — nothing else; the form keeps its values | `:1112-1115` |
| Form reset | **There is no `form.reset()` anywhere in the file.** The page relies on navigating away. | — |

### Everything written, by target

| Target | Operation | Count per successful submit | file:line |
|---|---|---|---|
| `payment_receipts` | INSERT (and DELETE only on the link-rollback path) | 1 (+1 delete on rollback) | `:1019-1023`, `:1039` |
| `payment_receipt_links` | INSERT (bulk) | 0 or 1 statement, N rows | `:1034-1036` |
| `audit_logs` | INSERT | 1 (`payment_receipt_created`) + 1 if warnings confirmed + 1 per uploaded file; or exactly 1 (`duplicate_receipt_warning`) on the duplicate short-circuit | `:963`, `:1045`, `:1082`, `PaymentReceiptDocuments.tsx:396` |
| `payment_receipt_documents` | INSERT | 1 per uploaded file | `PaymentReceiptDocuments.tsx:376-389` |
| Storage bucket `payment-receipt-documents` | `upload` (and `remove` on rollback) | 1 per file | `PaymentReceiptDocuments.tsx:370`, `:392` |

**No RPC is called on the submit path.** Every write is a plain PostgREST `.insert()` / `.update()` / `.delete()`. So the page depends entirely on RLS + DB triggers/CHECKs for server-side enforcement — verifying that is Agent B/C's job.

---

## A6 — Every import of `PaymentReceiptForm` (blast radius)

`git grep -n "PaymentReceiptForm" -- src server scripts`:

| file:line | Kind |
|---|---|
| `src/routes/_app.accounting.receipts.create.tsx:7` | **real import** — `import { PaymentReceiptForm } from "@/shared/components/PaymentReceiptForm";` |
| `src/routes/_app.accounting.receipts.create.tsx:31` | **real usage** — `<PaymentReceiptForm />`, no props |
| `src/shared/components/PaymentReceiptForm.tsx:289` | the definition |
| `src/lib/navigation/registry.ts:892` | comment only — warns that `WaybillCustomFieldsInput` must not be deleted because "the live PaymentReceiptForm renders it" |
| `src/lib/receipt-ocr-bytes.functions.ts:155` | comment only — "PaymentReceiptForm fills empty fields with it" |
| `src/lib/treasury/queries.ts:228` | comment only — notes it uses the same active-external-parties source |

**Blast radius: exactly one caller.** Rebuilding `PaymentReceiptForm` touches no other route. Its *children*, however, are shared and must not be rewritten in place:

| Shared child | Other consumers |
|---|---|
| `JalaliDateInput` | 13 other files — `PersianDatePicker.tsx:40`, `EmployeeProfileCard.tsx:195`, `_app.accounting.dynamic-capital.tsx:305`, `_app.accounting.mutual-settlement.tsx:342`, `_app.accounting.payment-vouchers.tsx:238,242,360,498`, `_app.accounting.purchase-payments.tsx:580`, `_app.accounting.receipts.tsx:445,455`, `_app.accounting.treasury.tsx:252,256`, `_app.admin.audit.tsx:170,178`, `_app.admin.penalties.tsx:183,194`, `_app.gamification.admin.manual-metrics.tsx:366`, `_app.pricing.purchase-prices.tsx:972,983`, `_app.warehouses_.kardex.tsx:169,173`, `PurchaseForm.tsx:612` |
| `WaybillCustomFieldsInput` | Only this form imports it (`:2050`), but `src/lib/navigation/registry.ts:891-892` explicitly flags it as must-not-delete |
| `PaymentReceiptDocuments.tsx` | `ReceiptDocumentPicker` + `uploadReceiptDocuments` used here; `ReceiptDocumentsList` (same file, `:530`) is used by the receipt **detail** page — UNCERTAIN which route exactly; not surveyed, outside this task's scope |

---

## Findings worth flagging

1. **Security warnings are lost when the duplicate dialog is used after the warnings dialog.** The warnings dialog mutates with `securityWarnings: pendingWarnings` (`:2172`). If the duplicate probe then fires and returns `duplicate:true`, `onSuccess` stashes only `{values, allocations}` into `pendingValues` (`:1103`) — the warnings are dropped. The subsequent `ادامه و ثبت` mutate (`:2116-2121`) passes **no** `securityWarnings`, so it defaults to `[]` (`:918`). Result: `security_warnings` is persisted as `[]` and the `receipt_security_warning_confirmed` audit row (`:1081`) is never written, even though the accountant explicitly confirmed the warnings.
2. **`is_mobile_bank_screenshot` is collected, passed to the evaluator, persisted — and never evaluated.** It is a checkbox (`:2021-2031`), part of `evaluateFormWarnings`'s parameter type (`:186`) and forwarded into `evaluateReceiptSecurityWarnings` (`:196`), but `src/lib/accounting/receipt-security.ts` reads `has_perforation`, `is_typed_receipt`, `document_channel`, `payer_name_on_receipt`, `tracking_number`, `payment_date` — and never `is_mobile_bank_screenshot` (declared at `receipt-security.ts:28`, referenced nowhere in the function body `:56-170`). The checkbox produces no warning.
3. **The auto-journal preview is decorative.** It never contacts the server, ignores `receipt_type`, `document_channel`, the receiver mode, and the invoice allocations, and hardcodes debit=beneficiary / credit=payer for the full amount. See A3-bis. Whether that matches `post_receipt_accounting` cannot be answered from `src/`.
4. **`receipt_image_url` is dead weight** — in the schema, in `defaultValues` and in the payload, but with no producer. Always inserted as `null`.
5. **`bank_name` is invisible but load-bearing.** It has no input, is set only as a side effect of picking a mode-1 bank account when empty (`:1602-1604`), yet it is one of the four columns in the duplicate-detection key (`:950-958`). Two receipts with the same tracking number/amount/date are treated as distinct if one happened to pick a bank account and the other did not.
6. **`const today` is module-level** (`:174`), evaluated once at import. It backs both the `payment_date <= today` zod refine (`:218`) and the read-only «تاریخ ثبت فیش» display (`:1801`). A tab left open across midnight shows and validates against yesterday.
7. **`bank_accounts` and `external_parties` are fetched with no `.limit()`** (`:854-866`, `:868-886`), against CLAUDE.md rule 11. Both are filtered to `is_active = true`, so the practical size is likely small, but the guard is absent.
8. **`overAllocated` blocks the button but under-allocation does not.** A 10,000,000 receipt with a single 1,000,000 allocation submits happily (`:2073-2077`, and the `mutationFn` check at `:934` only rejects *over*-allocation).
9. **Silent max-length failures.** Ten optional fields render no error paragraph (see A3 row 29), so a `.max()` violation on e.g. `description` fails validation with only the generic `فیلدهای ناقص` toast and a `scrollIntoView` that may not find the element.
10. **The link-insert rollback is not transactional** (`:1037-1041`). If the `payment_receipts` DELETE itself fails (RLS, or a trigger having already fired), an orphan receipt is left behind with no links and no audit row — `payment_receipt_created` is written *after* the link insert (`:1045`), so the orphan is also invisible in the audit trail.

## BLOCKED

Nothing. No forbidden write was required; the only file written was `docs/research/_a_frontend.md`.
