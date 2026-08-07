# ممیزی جامع حسابداری و اشخاص — AfraKala

**تاریخ:** ۲۰۲۶-۰۸-۰۷ · **مبنا:** `HEAD = 738aad69` · **دیتابیس:** `afrakala` روی `afrakala-lan-db`
**نوع:** فقط‌خواندنی. هیچ کد، مهاجرت یا داده‌ای تغییر نکرد.
**وضعیت:** موارد زمینه‌ای ۱–۵ **کامل**. دامنه‌های A–J **هنوز کامل نشده‌اند** —
`docs/audits/accounting-audit-progress.md` نقطهٔ دقیق ازسرگیری را دارد.

> هر ادعا در این سند یا `file:line` دارد یا کوئری SQL با نتیجهٔ زنده. هیچ ادعایی از حافظه نیست.

---

# بخش اول — پنج مورد زمینه‌ای

## ۱ — شخص واسط / پرداخت به ثالث

### آنچه وجود دارد

```sql
select string_agg(column_name,', ' order by ordinal_position)
  from information_schema.columns
 where table_schema='public' and table_name='external_parties';
```
```
id, full_name, national_id, phone, accounting_code, notes, is_active,
created_at, updated_at, person_id
```

جدول `external_parties` دقیقاً برای همین ساخته شده و شکلش با نیاز شما می‌خواند: نام،
کد ملی، تلفن، کد حسابداری، یادداشت — **بدون** پرونده و دفتر. یعنی «اطلاعاتش قابل
جست‌وجو باشد ولی پرونده نداشته باشد» از قبل مدل شده است.

`external_party` هم یکی از شش مقدار مجاز `journal_lines.account_kind` است:

```
CHECK (account_kind = ANY (ARRAY['customer_credit','bank','external_party',
                                 'invoice_ar','clearing','other']))
```

### ولی عملاً استفاده نمی‌شود

```sql
select 'rows='||count(*) from public.external_parties;   -- rows=1
select account_kind, count(*) from public.journal_lines group by account_kind;
```
```
customer_credit = 1
bank            = 1
```

**یک ردیف در جدول، و صفر خط دفتر با `account_kind='external_party'`.** سازوکار ساخته
شده ولی هرگز به کار نرفته — الگوی «ساخته شده، وصل نشده» که در این پروژه تکرار می‌شود.

**حکم:** بله، `external_party` دقیقاً برای سناریوی شماست. زیرساختش هست؛ مسیر نوشتن و
رابط کاربری‌اش نیست. برای «همهٔ آنچه به این شماره‌حساب/نام رفته» هم امروز هیچ کوئری‌ای
وجود ندارد چون هیچ داده‌ای ثبت نمی‌شود.

---

## ۲ — گروه و زیرگروه اشخاص

```sql
select string_agg(table_name,', ') from information_schema.tables
 where table_schema='public'
   and (table_name ilike '%group%' or table_name ilike '%categor%');
```
```
messenger_groups, messenger_group_members, categories,
category_required_services, category_product_attributes,
product_attribute_groups, product_category_attribute_values
```

هیچ‌کدام مربوط به اشخاص نیستند: دوتای اول گروه‌های **پیام‌رسان**‌اند، بقیه
**محصول‌محور**. هیچ `person_groups`، `groups` یا معادلی وجود ندارد.

**حکم: تأیید زنده — سامانهٔ گروه‌بندی اشخاص وجود ندارد.** ادعای دستیار دیگر شما درست بود.

نزدیک‌ترین چیز موجود `person_context_links` است که امروز نقش را مدل می‌کند
(`context_kind` = customer/supplier/staff/…). همان الگو می‌تواند مبنای گروه‌بندی شود —
پیشنهادهای معماری در بخش پایانی.

---

## ۳ — الزام کد آسان هنگام ساخت سند

هر تابعی که رشتهٔ `asan_person_code` را می‌شناسد:

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
   and pg_get_functiondef(p.oid) ilike '%asan_person_code%' order by 1;
```
```
asan_classify_person_batch      asan_commit_person_batch
asan_list_bank_deposit_export   asan_list_journal_export
asan_list_purchase_export       asan_list_sales_export
normalize_identifier            search_visible_persons
trg_mirror_pull_asan_code       trg_person_identifiers_propagate_asan_code
```

ده تابع: چهارتا **خروجی** آسان، دوتا **ورود/طبقه‌بندی** آسان، یک نرمال‌ساز، یک جست‌وجو،
و دو تریگر آینه که خودم در مهاجرت ۳۰۸/۳۰۹ ساختم.

**هیچ‌کدام تابع ساخت سند نیست.** بررسی مستقیم:

```
create_purchase           -> no asan check
post_receipt_accounting   -> no asan check
```

**حکم: هیچ الزامی وجود ندارد — نه در پایگاه‌داده، نه در RPC، برای هیچ‌یک از چهار نوع
سند.** پیش‌بینی شما درست بود: فقط خروجی مسدود می‌شود، نه ساخت سند. این هم برای
تأمین‌کننده و هم مشتری صادق است.

> **نکتهٔ امنیتی:** چون هیچ گاردی سمت پایگاه‌داده نیست، حتی اگر رابط کاربری دیالوگ
> درون‌خطی بگذارد، نوشتن مستقیم به PostgREST آن را دور می‌زند. این دقیقاً همان تله‌ای
> است که نگرانش بودید و قاعدهٔ ۶ و ۷ `CLAUDE.md` منع می‌کند.

---

## ۴ — سند دوطرفهٔ بین دو شخص متفاوت

تنها تابعی که در `journal_entries` درج می‌کند:

```sql
select p.proname from pg_proc p ...
 where pg_get_functiondef(p.oid) ilike '%insert into public.journal_entries%';
```
```
post_receipt_accounting
```

و بدنه‌اش خطوط را **ثابت** می‌نویسد:

```sql
INSERT INTO public.journal_lines(journal_entry_id, line_no, account_kind,
                                 account_ref_id, debit, credit, description)
VALUES
  (v_journal_id, 1, v_debit_kind, v_debit_ref, v_receipt.amount, 0, v_debit_desc),
  (v_journal_id, 2, 'customer_credit', v_receipt.customer_id, 0, v_receipt.amount,
   'افزایش اعتبار/کاهش بدهی مشتری');
```

خط دوم `'customer_credit'` **هاردکد** است و مرجعش همیشه `v_receipt.customer_id`.

**حکم: قابل بیان نیست.** نه فقط برای دو شخص متفاوت — این تابع اصلاً فقط یک شکل سند
می‌سازد: «پول وارد شد → اعتبار یک مشتری». برای سناریوی شما دو مانع هست:

1. هیچ RPC ای سند دلخواه چندخطی نمی‌سازد.
2. `account_kind` اصلاً مفهوم **بدهی به تأمین‌کننده** ندارد
   (`supplier_payable` جزو شش مقدار مجاز نیست).

ابعاد واقعی دفتر امروز: `journal_entries` = **۱**، `journal_lines` = **۲**.
یعنی دفتر روزنامه عملاً بلااستفاده است.

`journal_lines.account_ref_id` هم **هیچ کلید خارجی ندارد** — تنها FK این جدول
`journal_entry_id` است. پس مرجع خط چندریختی و بدون گارد است، همان الگوی خطرناکی که در
`stock_movements` هم هست.

---

## ۵ — سازوکار بازخورد کارکنان

### ساختار سالم است

```
id, title, type, description, where_occurred, impact, suggestion,
attachment_urls, status, submitted_by, assigned_to, response,
responded_by, responded_at, converted_task_id, created_at, updated_at
```

### RLS دقیقاً همان است که صفحهٔ فهرست فرض می‌کند

```
fi_insert_own                  [INSERT]
fi_select_own_or_admin_manager [SELECT]
fi_update_admin_manager        [UPDATE]
fi_delete_admin                [DELETE]
```

فرستنده فقط مال خودش را می‌بیند؛ admin/manager همه را. مطابق انتظار.

### ولی هرگز استفاده نشده و اتصال نهایی وجود ندارد

```sql
select 'rows='||count(*) from public.feedback_items;   -- rows=0
```

و مهم‌تر:

```sql
select ... from pg_proc where pg_get_functiondef(p.oid) ilike '%converted_task_id%';
```
```
NO FUNCTION WRITES IT
```

**حکم قطعی: «converted_to_task» وصل نشده است.** ستون `converted_task_id` وجود دارد،
وضعیت در گردش‌کار هست، ولی **هیچ تابعی در پایگاه‌داده آن را نمی‌نویسد** و هیچ ردیفی در
`tasks` ساخته نمی‌شود. حدس شما درست بود — همان الگوی «ساخته شده، وصل نشده».

با صفر ردیف، مسیر `/feedback/create` هم عملاً هرگز اجرا نشده؛ صحت نوشتنش نیازمند آزمون
زنده است که در محدودهٔ فقط‌خواندنی این ممیزی نمی‌گنجد.

---

# بخش دوم — دامنه‌ها A تا J

> **این بخش هنوز کامل نشده.** آنچه در جریان بررسی موارد زمینه‌ای ثابت شد اینجا ثبت است
> تا دوباره کشف نشود. چک‌لیست هشت‌بندی برای هیچ دامنه‌ای هنوز کامل اجرا نشده.

## A — تأمین‌کنندگان ✅ کامل

**۱ — مسیرها و ناوبری.** `_app.suppliers.tsx` (فهرست) و `_app.suppliers_.$supplierId.tsx`
(جزئیات/ساخت). در registry ثبت است — `registry.ts:257-260`، برچسب «تأمین‌کنندگان»،
ماژول `suppliers`. یتیم نیست. گارد مسیر: `_app.suppliers.tsx:51`
`requirePermission("suppliers","view")`.

**۲ — اسکیما.** ۱۶ ستون. نکتهٔ مهم: `person_id` هم `NOT NULL` است و هم
`uq_suppliers_person_id` روی آن UNIQUE است — پس **هر تأمین‌کننده دقیقاً یک شخص دارد و هر
شخص حداکثر یک ردیف تأمین‌کننده**. این توضیح می‌دهد چرا شمارش «تأمین‌کنندهٔ بی‌شخص» صفر است.

**۳ — تریگرها.** شش عدد:
`suppliers_audit_insert`, `suppliers_audit_update`, `suppliers_set_updated_at`,
`suppliers_updated_at`, `trg_normalize_phone`, `trg_suppliers_pull_asan_code`.

**۴ — محدودیت‌ها.** `status IN (pending,active,rejected)` ·
`trust_level IN (low,medium,high)` · `accounting_code ~ '^[A-Za-z0-9_-]{1,30}$'` ·
FK به `persons` و `profiles` · UNIQUE روی `person_id`.

**۵ — ساخته‌شده ولی بی‌مصرف.** `trust_level` (پایین‌تر). `dynamic_entity_scores` هم
تأمین‌کنندگان را حذف می‌کند:
```
CHECK (entity_type = ANY (ARRAY['customer','salesperson']))
```
**یافتهٔ تحقیق قبلی پس از مهاجرت‌های ۳۰۳–۳۱۰ بازتأیید شد.**

**۶ — تکرار. دو مورد واقعی:**
- **دو تریگر `updated_at` روی یک جدول** — `suppliers_set_updated_at` و
  `suppliers_updated_at`. یکی کافی است؛ هر دو روی هر نوشتن اجرا می‌شوند.
- **دو سیاست SELECT** — `suppliers_select_dynamic` و `suppliers_select_role_scoped`.
  در RLS سیاست‌های SELECT با OR ترکیب می‌شوند، پس سیاست بازتر عملاً حاکم است و وجود
  دومی می‌تواند این توهم را بسازد که محدودیت سخت‌گیرانه‌تری برقرار است.

**۷ — نقص واقعی: رابط از مجوزها سخت‌گیرتر است.**

| نقش | `role_permissions` می‌گوید | رابط اجازه می‌دهد |
|---|---|---|
| `sales` | `can_create=t`, `can_update=t` | ❌ خیر |
| `purchase_specialist` | `can_create=t`, `can_update=t` | ❌ خیر |

`SupplierForm.tsx:133` و `_app.suppliers.tsx:93` هر دو
`hasAnyRole(roles, ["admin","accountant"])` را می‌گیرند. پس دو نقشی که پایگاه‌داده
اجازهٔ ساخت و ویرایش می‌دهد، در رابط دکمه‌ای نمی‌بینند.

این «خطر امنیتی» نیست (رابط بسته‌تر است، نه بازتر) ولی یعنی جدول مجوزها **دروغ می‌گوید** —
اگر مالک نقشی را روی این ماژول تنظیم کند، اثری نخواهد داشت. یکی از این دو باید اصلاح شود؛
کدام‌یک، تصمیم مالک است.

**نکتهٔ جانبی:** `sales` روی تأمین‌کنندگان `can_approve=t` دارد. اینکه فروش بتواند
تأمین‌کننده را تأیید کند، احتمالاً عمدی نیست.

**۸ — پوشش `role_permissions`.** ✅ کامل. هر هفت نقش موجود
(`accountant, admin, manager, purchase_specialist, sales, site, viewer`) ردیف صریح دارند.
هیچ شکافی نیست — پس `has_dynamic_permission` بی‌صدا این ماژول را باز نمی‌کند.

### آیا `trust_level` چیزی را هدایت می‌کند؟ **خیر — کاملاً تزئینی**

۲۲ ارجاع در `src/`، همه از این سه دسته:
- تعریف نوع در `types.ts` (تولیدشده)
- رندر نشان: `trustBadge()` در `_app.suppliers.tsx` و
  `ProductSupplierManager.tsx:189,234`
- مقدار پیش‌فرض `'medium'` در `SupplierReferralModal.tsx:77`

**هیچ‌جا در `WHERE`، `ORDER BY`، فیلتر، امتیازدهی یا هر منطق تصمیمی ظاهر نمی‌شود.**
توزیع فعلی: ۱۱ `medium`، ۲ `high`، صفر `low` — یعنی عملاً همه روی پیش‌فرض مانده‌اند،
که خودش نشانهٔ بی‌استفاده بودن است.

### E — دریافت (شواهد جزئی)

`post_receipt_accounting` تنها نویسندهٔ دفتر است. `payment_receipts` = ۶ ردیف و ستون‌های
`payer_name`، `payer_phone`، `tracking_number`، `receiver_name`،
`beneficiary_accounting_code`، `receiver_party_person_id` دارد — چند تای اینها **دقیقاً**
شبیه نیاز ثبت شخص ثالث در مورد ۱ هستند و باید در تکمیل این دامنه دقیق بررسی شوند.

### F — پرداخت (شواهد جزئی)

```
payment_vouchers rows = 0
triggers: trg_payment_vouchers_updated_at, trg_payment_vouchers_number,
          trg_payment_vouchers_derive_person
```

هیچ‌یک از سه تریگر سند حسابداری نمی‌زند، و `post_receipt_accounting` تنها نویسندهٔ
`journal_entries` است.

**یافتهٔ تحقیق قبلی بازتأیید شد: پرداخت‌ها هیچ سند دوطرفه‌ای تولید نمی‌کنند.** با صفر
ردیف فعلی، اثر عملی ندارد — ولی به‌محض اولین پرداخت واقعی، خروجی نقدی از دفتر نامرئی است.

### G — سند دوبل (شواهد جزئی)

مقادیر مجاز `account_kind` امروز: `customer_credit, bank, external_party, invoice_ar,
clearing, other`. **نه `supplier_payable` و نه `mutual_settlement` وجود ندارند** — همان
یافته‌ای که در `docs/execution/unify-plan-corrected.md` برای P5 ثبت شد.

سایر محدودیت‌های `journal_lines`: `debit>=0`، `credit>=0`، و
`one_side` که هم‌زمان بودن یا صفر بودن هر دو را ممنوع می‌کند.

### B, C, D, H, I, J

شروع نشده. جزئیات در فایل HANDOFF.

---

# خلاصهٔ مدیریتی — مقدماتی

> نهایی نیست؛ پس از تکمیل دامنه‌ها بازنویسی می‌شود. ولی این پنج مورد از شواهد کامل‌اند.

۱. **دفتر روزنامه عملاً وجود ندارد.** یک سند، دو خط، در کل پایگاه‌داده. هر برنامه‌ای که
   فرض کند «موتور حسابداری آماده است و فقط رابط کم دارد» بر پایهٔ فرض غلط است.

۲. **پرداخت‌ها از دفتر نامرئی‌اند.** `payment_vouchers` هیچ سندی نمی‌زند. امروز بی‌اثر
   است (۰ ردیف) ولی یک بمب ساعتی است.

۳. **مفهوم بدهی به تأمین‌کننده در دفتر وجود ندارد.** بدون `supplier_payable`، تسویهٔ
   متقابل و سناریوی شخص ثالث شما هیچ‌کدام قابل ثبت نیستند.

۴. **کد آسان هیچ‌جا هنگام ساخت سند الزام نمی‌شود** — و چون گارد پایگاه‌داده‌ای نیست، هر
   راه‌حل صرفاً رابطی قابل دور زدن است.

۵. **گروه‌بندی اشخاص صفر است.** هیچ جدولی، هیچ ستونی. کاملاً از صفر.

۶. **`external_party` دقیقاً برای نیاز شماست ولی مرده است** — ۱ ردیف، صفر استفاده در دفتر.

۷. **بازخورد کارکنان وصل نشده** — `converted_task_id` را هیچ تابعی نمی‌نویسد.

۸. **`journal_lines.account_ref_id` هیچ FK ندارد** — مرجع چندریختی بدون گارد، همان
   الگویی که در `stock_movements` به مهاجرت ۳۰۴ آسیب زد.

---

# پیشنهاد معماری

> برای موارد ۱ تا ۴. **فقط پیشنهاد — هیچ‌چیز پیاده نشده.** پس از تکمیل دامنه‌ها بازبینی شود.

## مورد ۱ — ثبت شخص ثالث

**گزینهٔ الف — استفاده از آنچه هست (کم‌ریسک‌ترین).** `external_parties` را زنده کنید:
مسیر نوشتن هنگام ثبت سند، و خط دفتر با `account_kind='external_party'` و
`account_ref_id = external_parties.id`. هیچ تغییر اسکیمایی لازم نیست. کوئری «همهٔ آنچه به
این نام/حساب رفته» مستقیم روی همین جدول جواب می‌دهد.

**گزینهٔ ب — ثبت روی خود سند.** ستون‌های ثالث را به `payment_vouchers`/`payment_receipts`
اضافه کنید (چند تایش مثل `beneficiary_accounting_code` از قبل هست). ساده‌تر ولی
جست‌وجوپذیری متمرکز را از دست می‌دهد — دقیقاً چیزی که خواسته‌اید.

**گزینهٔ ج — شخصِ سبک.** `persons` با یک `visibility_scope` تازه که پرونده نمی‌سازد.
یکپارچه‌تر ولی با هدف صریح شما («پرونده نمی‌خواهم») در تنش است.

**پیشنهاد: الف.** جدول دقیقاً برای همین طراحی شده و بلااستفاده مانده.

## مورد ۲ — گروه و زیرگروه

**گزینهٔ الف — تخت با والد (پیشنهاد).** `person_groups(id, name, parent_id, kind)` +
`person_group_links(person_id, group_id)`. سلسله‌مراتب با `parent_id`، عضویت چندگانه با
جدول رابط. دقیقاً همان الگوی `person_context_links` که امروز کار می‌کند، با همان
قراردادهای RLS و تریگر audit.

**گزینهٔ ب — برچسب.** بازاستفاده از الگوی `product_labels`/`product_label_links` که در
مخزن هست و آزموده شده. ساده‌تر ولی سلسله‌مراتب ندارد — «آذرشهر زیرمجموعهٔ آذربایجان»
قابل بیان نیست.

**گزینهٔ ج — نوع زمینهٔ تازه در `person_context_links`.** بدون جدول جدید، ولی معنای
`context_kind` را که امروز «نقش» است با «گروه» قاطی می‌کند. توصیه نمی‌شود.

## مورد ۳ — الزام کد آسان هنگام ساخت سند

**گزینهٔ الف — گارد در RPC (پیشنهاد).** هر تابع ساخت سند در ابتدا بررسی کند که شخص کد
آسان فعال دارد، وگرنه `RAISE EXCEPTION` با `HINT` مشخص تا رابط بتواند دیالوگ درون‌خطی
باز کند. غیرقابل دور زدن، چون نوشتن مستقیم PostgREST هم از همین RPC می‌گذرد.

**گزینهٔ ب — تریگر روی جدول‌های سند.** پوشش کامل‌تر (حتی INSERT مستقیم) ولی پیام خطا
دورتر از رابط است و اتصال UX سخت‌تر می‌شود.

**گزینهٔ ج — هر دو.** RPC برای UX، تریگر برای تضمین. مطابق قاعدهٔ ۷ که سه لایه می‌خواهد.

## مورد ۴ — سند دوطرفهٔ بین دو شخص

پیش‌نیاز اجتناب‌ناپذیر: افزودن `supplier_payable` به `account_kind`. چون **CHECK** است نه
enum، تغییرش اتمیک و برگشت‌پذیر است.

سپس یک RPC عمومی مثل `create_journal_entry(p_lines jsonb)` که سند چندخطی دلخواه می‌سازد و
تراز بودن را تضمین می‌کند. تابع فعلی شکل ثابت دارد و قابل گسترش نیست.

**این تصمیم مدل مالی است، نه تغییر فنی** — و در حوزهٔ دادهٔ مالی قرار می‌گیرد، پس
نیازمند تأیید صریح شماست.
