# UNIFY — طرح تصحیح‌شده بر پایهٔ واقعیت مخزن

**تاریخ:** ۲۰۲۶-۰۸-۰۷ · **مبنا:** `HEAD = a7776eff` · **دیتابیس:** `afrakala` روی `afrakala-lan-db`

این سند جایگزین ادعاهای فایل‌های `P1_DUAL_ROLE.md` تا `P5_MUTUAL_SETTLEMENT.md` است.
اهداف مالک دست‌نخورده مانده؛ فقط حقایق با آنچه واقعاً در مخزن و دیتابیس هست تطبیق داده شده.

هر ادعا زنده بررسی شد: `pg_proc`، `information_schema`، `pg_indexes`، `pg_constraint`،
`pg_trigger` و جست‌وجوی مستقیم در `src/`.

---

## خلاصهٔ مدیریتی — چه چیزی غلط بود

| # | ادعای فایل مأموریت | واقعیت | شدت |
|---|---|---|---|
| ۱ | `person_upsert_by_mobile` وجود دارد (P1.2) | **وجود ندارد.** هیچ تابعی با این نام نیست | 🔴 کل فاز بر آن بنا شده |
| ۲ | `mutual_settlement` و `supplier_payable` در `account_kind` هستند (P5.1) | **هیچ‌کدام نیستند.** مقادیر مجاز: `customer_credit, bank, external_party, invoice_ar, clearing, other` | 🔴 P5 فرض می‌کند دفتر آماده است؛ نیست |
| ۳ | `Sidebar.tsx` مرده را حذف کن (P3.1) | **چنین فایلی وجود ندارد** | 🔴 فاز بی‌موضوع |
| ۴ | صفحهٔ `/persons/all` (P1.3) | **وجود ندارد.** مسیر واقعی `/persons` است | 🟠 |
| ۵ | ۲۴ صفحهٔ یتیم بدون ورودی سایدبار (P3.2) | هر چهار نمونهٔ نام‌برده **در registry ثبت‌شده‌اند** | 🟠 عدد تأییدناپذیر |
| ۶ | «۳۰۰+ رسید قدیمی» (P4.2) | `payment_receipts` **۶ ردیف** دارد | 🟠 |
| ۷ | «۱۵ کد آسان تأمین‌کننده» (P2.3، P5.4) | زندهٔ امروز **۱۳** و متغیر | 🟠 |
| ۸ | افزودن مقدار به enum برگشت‌ناپذیر است (P5.1) | `account_kind` یک **CHECK** است نه enum | 🟡 |
| ۹ | ایندکس یکتای asan «یک کد برای هر شخص» را تضمین می‌کند (P1.5) | یکتایی **کد** را تضمین می‌کند، نه «یک کد برای هر شخص» | 🟡 نکتهٔ ظریف |

**و یک نکته دربارهٔ منشأ:** نام‌هایی مثل `e2e/unify/dual-role-trigger.spec.ts` که در گفت‌وگو
به‌عنوان «فایل موجود» مطرح شدند، از بخش MISSION GATE همین فایل‌ها می‌آیند (`P1_DUAL_ROLE.md:162`).
آن‌ها فهرست specهایی هستند که *قرار است ساخته شوند*، نه فایل‌های موجود.

---

## آنچه واقعاً وجود دارد — مرجع

قبل از هر فاز، این فهرست مبناست.

### توابع موجود در حوزهٔ اشخاص

```
person_backfill_existing        person_find_by_identifiers      person_merge
person_create_full              person_fk_drift_report          person_merge_candidates_overview
person_create_inline            person_import_batch             person_merge_dismiss
```

### توابع دیگر که فایل‌ها به آن‌ها تکیه دارند

| تابع | وضعیت |
|---|---|
| `asan_list_journal_export` | ✅ موجود |
| `detect_phone_collisions` | ✅ موجود (مهاجرت ۳۰۵ اصلاحش کرد) |
| `publish_platform_release` / `auto_publish_release` | ✅ موجود |
| `person_upsert_by_mobile` | ❌ **وجود ندارد** |
| `person_settlement_position` | ❌ وجود ندارد (P5.2 باید بسازد) |

### ستون `accounting_code` — کجا هست و کجا نیست

```
✅ customers.accounting_code          ✅ products.accounting_code
✅ external_parties.accounting_code   ✅ bank_accounts.accounting_code
✅ asan_control_accounts.accounting_code
❌ suppliers.accounting_code          ← این همان چیزی است که P2.1 باید اضافه کند
```

### `person_identifiers`

انواع در استفادهٔ فعلی: `asan_person_code`، `mobile_e164`.

ایندکس‌های یکتای مرتبط:

| ایندکس | چه چیزی را تضمین می‌کند |
|---|---|
| `uq_person_identifiers_asan_code_active` | `(kind, value_normalized)` وقتی `status<>'revoked'` — یعنی **دو شخص نمی‌توانند یک کد داشته باشند** |
| `uq_person_identifiers_primary_active` | `(person_id, kind)` وقتی `is_primary AND status<>'revoked'` — یعنی **هر شخص فقط یک کد اصلی** دارد |

### `journal_lines`

```
ستون‌ها: id, journal_entry_id, line_no, account_kind, account_ref_id,
         description, debit, credit, created_at

CHECK account_kind IN ('customer_credit','bank','external_party',
                       'invoice_ar','clearing','other')
```

### `person_context_links`

```
ستون‌ها: id, person_id, context_kind, ref_table, ref_id, note,
         started_at, ended_at, created_by, created_at, updated_at
تریگرها: trg_pcl_audit_insert, trg_pcl_audit_update, trg_pcl_set_updated_at
```

**هیچ تریگری mirror نمی‌سازد** — فرض P1.1 درست است.

### ناوبری

منبع حقیقت **`src/lib/navigation/registry.ts`** است، نه یک کامپوننت سایدبار:

```
NAVIGATION_SEEDS  →  NAVIGATION_REGISTRY  →  nav-items.ts (NAV_ITEMS)
                                          →  AppSidebar.tsx
                                          →  MobileBottomNav.tsx
                                          →  NavigationCommandPalette.tsx
```

- **۱۲۳** ورودی در seed · **۴** با `hiddenFromMenu`
- **۱۸۳** فایل `_app*.tsx` — ولی بسیاری مسیر پارامتری/جزئیات‌اند که اصلاً نباید در منو باشند
- registry یک گارد تکرار دارد: `throw new Error("Duplicate navigation route: ...")`
- کامنت خط ۳۵۵ می‌گوید registry به `role_permissions` هم seed می‌دهد و **این دو باید بخوانند**

---

## P1 — نقش دوگانه (تصحیح‌شده)

هدف مالک بی‌تغییر: یک شخص هم مشتری باشد هم تأمین‌کننده، تلفن کلید هویت، و هر دو dropdown کار کنند.

### P1.1 — تریگر ساخت خودکار mirror ✅ فرض درست بود

`person_context_links` هیچ تریگر mirror-ساز ندارد. فاز همان‌طور که نوشته شده معتبر است.

**تنها اصلاح:** متن فاز می‌گوید «از طریق `person_context_links.insert`» و بعد در تست
`PATCH` می‌گوید. برای درج ردیف تازه فعل درست `POST` است؛ `PATCH` به‌روزرسانی است.

### P1.2 — 🔴 بازنویسی کامل لازم است

**فرض غلط:** «`person_upsert_by_mobile` وجود دارد. هیچ فرمی صدایش نمی‌زند.»

هیچ تابعی با این نام وجود ندارد. ولی **هدف کاملاً قابل دستیابی است** با آنچه هست:

| نیاز | تابع موجود |
|---|---|
| «آیا شخصی با این تلفن هست؟» | `person_find_by_identifiers` |
| «اگر نبود بساز» | `person_create_inline` |

دو مسیر ممکن — انتخاب با مالک:

**الف) بدون مهاجرت (پیشنهاد):** فرم اول `person_find_by_identifiers` را صدا می‌زند؛ اگر
شخصی برگشت، تأیید کاربر را می‌گیرد و فقط `person_context_links` را درج می‌کند؛ وگرنه
`person_create_inline`. منطق در لایهٔ فرم می‌ماند و هیچ سطح API تازه‌ای باز نمی‌شود.

**ب) تابع تازه:** یک `person_upsert_by_mobile` واقعی نوشته شود که این دو را می‌پیچد.
اتمی‌تر است ولی سطح تازه‌ای اضافه می‌کند و با قاعدهٔ ۱۴ باید توجیه شود.

**فرم‌هایی که باید تغییر کنند — بررسی‌شده:**

| فرم مورد ادعا | وضعیت واقعی |
|---|---|
| `/suppliers` → تأمین‌کنندهٔ جدید | ✅ `SupplierForm.tsx` |
| `/customers` → مشتری جدید | ✅ `CustomerForm.tsx` |
| `/persons/create` | ✅ `_app.persons_.create.tsx` |
| مودال درون `/purchases/create` | ✅ `SupplierReferralModal.tsx` (از قبل `person_create_inline` را صدا می‌زند) |
| مودال درون `/sales/quote/create` | ⚠️ چنین مسیری نیست؛ مسیر واقعی `_app.sales.quotes.$quoteId.tsx` — باید جداگانه بررسی شود |

### P1.3 — 🟠 مسیر اشتباه نام‌گذاری شده

`/persons/all` وجود ندارد. صفحهٔ واقعی `_app.persons.tsx` روی `/persons` است.
بقیهٔ فاز (بررسی drift بین context link و mirror، نمایش هر دو badge) معتبر است.

### P1.4 — 🟠 نیمی از مسیرها باید بازبینی شود

| مسیر مورد ادعا | وضعیت |
|---|---|
| `/persons/$personId` | ✅ `_app.persons_.$personId.tsx` |
| `/suppliers/$supplierId` | ✅ `_app.suppliers_.$supplierId.tsx` |
| صفحهٔ جزئیات مشتری | ⚠️ تنها چیز موجود `_app.sales_.customers_.$customerId.credit.tsx` است — یک زیرصفحهٔ **اعتبار**، نه صفحهٔ جزئیات عمومی. لینک متقابل «این شخص تأمین‌کننده هم هست» جایی برای نشستن ندارد مگر اول صفحهٔ جزئیات مشتری ساخته شود |

### P1.5 — 🟡 ادعا نادقیق است، نه غلط

فاز می‌گوید ایندکس را بررسی کن و «اگر یک-کد-برای-هر-شخص را تضمین نمی‌کند سفتش کن».

واقعیت دقیق‌تر: `uq_person_identifiers_asan_code_active` تضمین می‌کند **دو شخص یک کد
نداشته باشند**. «یک کد برای هر شخص» فقط برای ردیف‌های `is_primary` تضمین شده
(`uq_person_identifiers_primary_active`). یک شخص می‌تواند چند `asan_person_code`
غیراصلی داشته باشد.

**تصمیم لازم از مالک:** آیا این نقص است یا طراحی؟ اگر واقعاً باید هر شخص فقط یک کد
داشته باشد، ایندکس جزئی تازه‌ای روی `(person_id)` با شرط `kind='asan_person_code' AND
status<>'revoked'` لازم است.

همچنین بند ۳ می‌گوید کد را به `suppliers.accounting_code` تکثیر کن «اگر ستون موجود باشد» —
موجود نیست. تا P2.1 فقط `customers.accounting_code` هدف است.

---

## P2 — کد آسان تأمین‌کننده (تصحیح‌شده)

### P2.1 — ✅ فرض درست است

`suppliers.accounting_code` واقعاً وجود ندارد و `customers.accounting_code` هست. فاز معتبر.

### P2.2 — ✅ دقیق‌ترین فاز کل برنامه

ادعای «`CustomerForm:42`» **دقیقاً درست است** — خط ۴۲ همان `accounting_code` است.
`SupplierForm` هم در `src/shared/components/SupplierForm.tsx` است.

### P2.3 — 🟡 یک تناقض که خودم وارد کردم

تصحیح قبلی من در `P2_ASAN_CODE.md` نوشته `WHERE asan_code IS NULL` ولی ستونی که P2.1
اضافه می‌کند `accounting_code` نام دارد. **پرس‌وجوی درست:**

```sql
SELECT count(*) FROM public.suppliers;                            -- کل
SELECT count(*) FROM public.suppliers WHERE accounting_code IS NULL;  -- بدون کد
```

عدد ۱۵ در متن اصلی غلط بود؛ ۱۳ هم که من نوشتم فقط عکس امروز است. هیچ عددی نباید ثابت نوشته شود.

---

## P3 — سایدبار (تصحیح‌شده) — 🔴 بیشترین بازنویسی

### P3.1 — فاز باید حذف شود

`Sidebar.tsx` **وجود ندارد**. تنها فایل‌های مرتبط:

```
src/components/layout/AppSidebar.tsx        ← سایدبار واقعی و زنده
src/components/messenger/ConversationsSidebar.tsx  ← مربوط به پیام‌رسان
src/components/ui/sidebar.tsx               ← primitive شادcn
```

هیچ‌کدام مرده نیستند. **چیزی برای حذف نیست.**

### P3.2 — عدد ۲۴ تأییدناپذیر و نمونه‌ها غلط‌اند

هر چهار مسیری که فاز به‌عنوان یتیم نام برده، **در registry ثبت‌شده‌اند**:
`/admin/asan-export`، `/admin/asan-import`، `/admin/phone-collisions`، `/sales/product-videos`.

اختلاف ۱۲۳ ورودی در برابر ۱۸۳ فایل مسیر، «۶۰ صفحهٔ یتیم» نیست — بیشترشان مسیرهای
پارامتری و جزئیات‌اند که اصلاً نباید ورودی منو داشته باشند.

**بازنویسی پیشنهادی:** اول یک گزارش واقعی از یتیم‌ها تولید شود (مسیرهای بدون پارامتر که در
registry نیستند)، به مالک نشان داده شود، بعد تصمیم گرفته شود کدام‌ها واقعاً باید در منو
بیایند. عدد از داده بیاید، نه از گزارش قدیمی.

### P3.3 — هدف معتبر، ولی محل ویرایش عوض می‌شود

ساختار هدف مالک (کالا/فروش/خرید/حسابداری/اشخاص/عملیات/مدیریت) دست‌نخورده می‌ماند.

**دو نکته که فاز نمی‌داند:**
1. تغییر گروه‌بندی یعنی ویرایش `src/lib/navigation/registry.ts`، نه `AppSidebar.tsx`.
   سایدبار فقط مصرف‌کنندهٔ registry است — همراه با `MobileBottomNav`،
   `NavigationCommandPalette` و `NavigationBreadcrumbs` که همگی از همان منبع می‌خوانند.
2. registry به `role_permissions` هم seed می‌دهد و کامنت خط ۳۵۵ صریح می‌گوید این دو باید
   بخوانند («درس M3.3»). پس هر جابه‌جایی گروه ممکن است دسترسی نقش‌ها را هم جابه‌جا کند —
   این را فاز اصلاً ذکر نکرده و مهم‌ترین ریسک P3 است.

گروه‌های فعلی registry: `main, purchasing, finance, operations, reports, admin` — که با
نام‌های فارسی هدف یک‌به‌یک منطبق نیستند و نگاشت لازم دارند.

---

## P4 — غنی‌سازی شرح دفتر (تصحیح‌شده)

### P4.1 — ✅ فرض‌ها درست‌اند

| ادعا | وضعیت |
|---|---|
| `asan_list_journal_export` موجود است | ✅ |
| `payment_receipts.payer_name` | ✅ |
| `payment_receipts.tracking_number` | ✅ |
| `journal_lines.journal_entry_id → journal_entries.source_id` | ✅ ستون‌ها موجودند |
| `journal_entries.source_type='payment_receipt'` | ✅ تنها مقدار موجود |

مسیر join معتبر است. فاز می‌تواند همان‌طور که نوشته شده اجرا شود.

### P4.2 — 🟠 مقیاس غلط است

فاز می‌گوید «۳۰۰+ رسید قدیمی». `payment_receipts` **۶ ردیف** دارد و `journal_entries`
**۱ ردیف**. تصمیم مالک (بازنویسی نکردن گذشته) معتبر می‌ماند، ولی توجیه «۳۰۰+ ردیف» نیست.

با این حجم، badge «شرح ساده» احتمالاً ارزش پیاده‌سازی ندارد — **تصمیم با مالک**.

---

## P5 — تسویهٔ متقابل (تصحیح‌شده) — 🔴 فرض بنیادی غلط

### P5.1 — دفتر **نمی‌تواند** تسویهٔ متقابل را بیان کند

فاز می‌گوید طرح معماری ادعا می‌کند `mutual_settlement` و `supplier_payable` هر دو
`account_kind` هستند و «هر دو را زنده تأیید کن».

تأیید شد — **هیچ‌کدام وجود ندارند**:

```
CHECK (account_kind IN ('customer_credit','bank','external_party',
                        'invoice_ar','clearing','other'))
```

یعنی نه‌تنها `mutual_settlement` نیست، بلکه **هیچ مفهوم بدهی به تأمین‌کننده در دفتر نیست**.
جملهٔ فاز که «موتور حسابداری از قبل می‌تواند بیانش کند؛ فقط UI کم است» **غلط** است.

**اصلاح خوش‌بینانه:** `account_kind` یک **CHECK** است نه enum. پس افزودن مقدار یعنی
`DROP CONSTRAINT` + `ADD CONSTRAINT` — ساده، اتمی و کاملاً برگشت‌پذیر. هشدار فاز دربارهٔ
«افزودن مقدار به enum زنده برگشت‌ناپذیر است» بی‌مورد است.

**ولی این تصمیم مدل حسابداری است، نه یک تغییر فنی.** افزودن `supplier_payable` یعنی
تعریف اینکه بدهی به تأمین‌کننده کجای دفتر می‌نشیند و چطور با `purchases` موجود آشتی می‌کند.
**نیاز به تأیید صریح مالک دارد** و در حوزهٔ دادهٔ مالی است — یعنی طبق قاعدهٔ خودِ مالک،
نقطهٔ توقف.

### P5.2 — معتبر، با یک تصحیح

`person_settlement_position` وجود ندارد و باید ساخته شود. ✅

فاز می‌گوید «معنی unsettled را از محاسبهٔ اعتبار مشتری موجود بخوان، بازتعریف نکن» — درست
است و `customer_credit_balance` یک **جدول** است (نه view)، پس منبع خواندنی وجود دارد.

ولی تا وقتی `supplier_payable` تعریف نشده، `payable` قابل محاسبه نیست. **P5.2 به P5.1 وابسته است.**

### P5.3 — معتبر

`/accounting/mutual-settlement` وجود ندارد و باید ساخته شود. ✅
ثبت `source_type='mutual_settlement'` هم نیاز به همان تصمیم مدل در P5.1 دارد.

### P5.4 — دو عدد کهنه

- «۱۵ کد تأمین‌کننده» → زنده بخوان
- «۳۰۰+ رسید» → ۶ ردیف

---

## ترتیب اجرای پیشنهادی

فایل‌های اصلی ترتیب P1→P2→P3→P4→P5 را می‌گویند. با توجه به یافته‌ها پیشنهاد من متفاوت است:

| اولویت | فاز | چرا |
|---|---|---|
| ۱ | **P2.1 + P2.2** | فرض‌هایش کاملاً درست است، مستقل است، و انسداد خروجی آسان را باز می‌کند |
| ۲ | **P1.1** | فرض درست، پایهٔ نقش دوگانه، بدون وابستگی |
| ۳ | **P1.3 + P1.4** | با تصحیح نام مسیرها |
| ۴ | **P1.2** | بعد از تصمیم مالک بین مسیر الف و ب |
| ۵ | **P4.1** | مستقل و فرض‌هایش درست است |
| ۶ | **P3** | بعد از تولید گزارش واقعی یتیم‌ها و روشن شدن ریسک `role_permissions` |
| ۷ | **P5** | فقط بعد از تصمیم مالک دربارهٔ مدل حسابداری |

---

## تصمیم‌هایی که فقط مالک می‌تواند بگیرد

1. **P5.1 — مدل حسابداری.** آیا `supplier_payable` و `mutual_settlement` به دفتر اضافه شوند؟
   این تعریف تازه‌ای در مدل مالی است، نه یک مهاجرت ساده.
2. **P1.2 — مسیر الف (بدون تابع تازه) یا ب (تابع تازه)؟**
3. **P1.5 — آیا «چند کد آسان غیراصلی برای یک شخص» نقص است یا طراحی؟**
4. **P1.4 — آیا صفحهٔ جزئیات عمومی مشتری ساخته شود؟** امروز فقط زیرصفحهٔ اعتبار هست.
5. **P3.2 — کدام صفحات واقعاً باید در منو بیایند؟** بعد از دیدن گزارش واقعی.
6. **P4.2 — با ۶ رسید، آیا badge «شرح ساده» ارزش دارد؟**

## تصمیم‌های باز از P0 که هنوز منتظرند

- **P0.2** — ۹ ردیف از ۱۴ پشت حساب‌های واقعی‌اند (از جمله حساب مالک) و
  `profiles.person_id` روی `NO ACTION` است، پس حذف خطا می‌دهد نه cascade.
- **دو فایل xlsx مرجع آسان** — ورودی تست e2e هستند
  (`import-persons.spec.ts:23`، `import-products.spec.ts:28`).

---

## روش تأیید

هر ادعای این سند از این منابع آمده، نه از گزارش‌های قبلی:

```
pg_proc / pg_namespace          نام توابع
information_schema.columns      نام و وجود ستون‌ها
information_schema.tables       وجود جداول
pg_indexes                      تعریف ایندکس‌ها
pg_constraint                   CHECKها
pg_trigger                      تریگرها
ls src/routes/                  وجود مسیرها
grep در src/                    وجود کامپوننت‌ها و شماره خطوط
```

اگر ادعایی در این سند با واقعیت نخواند، همان روش را دوباره اجرا کنید — نه گزارش دیگری را.
