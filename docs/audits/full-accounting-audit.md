# ممیزی جامع حسابداری و اشخاص — AfraKala

**تاریخ:** ۲۰۲۶-۰۸-۰۷ · **مبنا:** `HEAD = 738aad69` · **دیتابیس:** `afrakala` روی `afrakala-lan-db`
**نوع:** فقط‌خواندنی. هیچ کد، مهاجرت یا داده‌ای تغییر نکرد.
**وضعیت:** موارد زمینه‌ای ۱–۵ **کامل**. دامنه‌های A–J **هر ده‌تا کامل‌اند** —
A · C · E · F · G در همین فایل؛ B · D · H · I · J در
`docs/audits/full-accounting-audit-part2-codex.md` (Codex).
`docs/audits/accounting-audit-progress.md` وضعیت مشترک را نگه می‌دارد.

> هر ادعا در این سند یا `file:line` دارد یا کوئری SQL با نتیجهٔ زنده. هیچ ادعایی از حافظه نیست.

---

# بخش صفر — بازبینی فوری: آیا «شخص ثالث» از قبل حل شده است؟

> به درخواست مالک، پیش از ادامهٔ دامنه‌ها. همهٔ شواهد زنده‌اند.
> **این بخش یافتهٔ مورد زمینه‌ای ۱ را به‌طور اساسی اصلاح می‌کند.**

## حکم کوتاه

**نیمی حل شده — و آن نیم، بسیار کامل‌تر از آن است که تصور می‌شد.**

| نیاز مالک | وضعیت |
|---|---|
| ثبت اطلاعات شخص ثالث بدون ساختن پروندهٔ کامل | ✅ **حل شده** روی سمت دریافت، و **در حال استفادهٔ واقعی** |
| قابل جست‌وجو بودن بعدی («هرچه به این نام/حساب رفته») | ✅ **پشتیبانی می‌شود** — FK و کد حسابداری هر دو ذخیره می‌شوند |
| ثبت به‌صورت سند دوطرفهٔ متوازن در دفتر | ❌ **اصلاً حل نشده** |
| همان قابلیت روی سمت پرداخت | ❌ **در فرم و RPC نیست** (هرچند جدول آماده است) |

---

## ۱ — «طرف‌های حساب» چیست؟

مسیر `_app.accounting.external-parties.tsx`، پشتوانه‌اش جدول `external_parties`:

```
id, full_name, national_id, phone, accounting_code, notes, is_active,
created_at, updated_at, person_id
```

**CRUD کامل دارد:** دیالوگ افزودن/ویرایش، فعال/غیرفعال‌کردن، و ثبت در `audit_logs`.

**این دقیقاً همان «رکورد سبک» است که مالک خواسته:** نام، کد ملی، تلفن، کد حسابداری،
یادداشت — و **هیچ دفتر، اعتبار یا پرونده‌ای ندارد**. یک `person_id` اختیاری هم دارد که
اگر لازم شد می‌تواند به شخص واقعی وصل شود، ولی الزامی نیست.

---

## ۲ — حالت «طرف خارجی» در فرم دریافت چه می‌نویسد؟

`PaymentReceiptForm.tsx:251` دو حالت را **به‌صورت XOR** الزام می‌کند:

```ts
.refine((v) => Boolean(v.destination_bank_account_id) !== Boolean(v.receiver_party_id), ...)
```

یعنی دقیقاً یکی از این دو: حساب بانکی خودمان، **یا** یک طرف خارجی. هرگز هر دو، هرگز هیچ‌کدام.

و `receiver_party_id` یک **UUID با کلید خارجی واقعی** است:

```
payment_receipts_receiver_party_id_fkey
  FOREIGN KEY (receiver_party_id) REFERENCES external_parties(id)
```

**پس متن آزاد نیست — به یک رکورد واقعی اشاره می‌کند.**

**مهم:** فرم دریافت هیچ‌وقت طرف خارجی **نمی‌سازد**؛ هر سه استفاده‌اش از
`external_parties` فقط `select` است (خطوط ۵۸۴، ۶۵۴، ۸۷۲). ساخت فقط از صفحهٔ
«طرف‌های حساب» انجام می‌شود.

---

## ۳ — «ذی‌نفع حسابداری» چه فرقی دارد؟

`beneficiary_accounting_code` یک ستون **جداگانه و مستقل** روی `payment_receipts` است
(`PaymentReceiptForm.tsx:210`، رشتهٔ حداکثر ۵۰ کاراکتر). ربطی به FK بالا ندارد.

شواهد زنده که نشان می‌دهد این دو واقعاً مستقل‌اند:

| receipt | `receiver_name` | طرف خارجیِ متصل | `beneficiary_accounting_code` |
|---|---|---|---|
| 88674a45 | همان طرف | یک رکورد مشترک | `601505` |
| f7f54d58 | **نام دیگری** | همان رکورد مشترک | `601505` |
| 461d9f6b | همان طرف | همان رکورد مشترک | `601505` |
| e7cd5107 | **نام دیگری** | همان رکورد مشترک | `119041` |

سه چیز مستقل هم‌زمان ثبت می‌شوند: **نام دریافت‌کننده** (متن آزاد)، **طرف خارجیِ متصل**
(FK)، و **کد ذی‌نفع حسابداری** (متن). دو ردیف با همان طرف خارجی، کد ذی‌نفع متفاوت دارند —
یعنی طراحی عمداً اجازه می‌دهد «کسی که پول گرفت» با «کسی که حسابداری به پایش می‌نویسد»
فرق کند. **این دقیقاً سناریوی مالک است.**

**و این فرضی نیست:** از ۶ فیش موجود، **۴ تا** مسیر طرف خارجی را استفاده کرده‌اند و
**۴ تا** کد ذی‌نفع دارند.

---

## ۴ — سمت پرداخت: عدم‌تقارن واقعی، در سه لایه

سه لایه، هر کدام باریک‌تر از لایهٔ زیرش:

**جدول `payment_vouchers` — غنی است:**
```
payee_type, payee_party_id, payee_supplier_id, payee_customer_id, payee_person_id,
payee_name, tracking_number, cheque_number, cheque_due_date, source_bank_account_id
```
و کلید خارجی‌اش دقیقاً همان مسیر است:
```
payment_vouchers_payee_party_id_fkey
  FOREIGN KEY (payee_party_id) REFERENCES external_parties(id)
```

**تابع `pay_purchase_with_voucher` — باریک‌تر:**
```
_purchase_id, _source_bank_account_id, _payment_date, _document_channel,
_amount, _tracking_number, _cheque_number, _cheque_due_date, _description
```
شمارهٔ پیگیری و چک را **می‌پذیرد**، ولی **هیچ پارامتری برای هویت گیرنده ندارد** —
نه `payee_party_id`، نه `payee_name`، نه `payee_person_id`.

**صفحهٔ `_app.accounting.purchase-payments.tsx` — باریک‌ترین:** ۵۷۹ خط، و جست‌وجو برای
`payer|payee|tracking|external_part|beneficiary|receiver` **هیچ نتیجه‌ای ندارد**.

**پس پاسخ سؤال ۴:** عدم‌تقارن **ساختاری نیست** — جدول کاملاً آماده است. ولی صرفاً «فرم
نازک روی جدول غنی» هم نیست: **خودِ RPC هم پارامترهایش را ندارد**. برای رساندن سمت پرداخت
به سطح سمت دریافت، هم فرم و هم امضای RPC باید گسترش یابند.

---

## ۵ — آیا دفتر روزنامه درگیر است؟ **خیر، اصلاً**

```sql
select count(*) from public.journal_lines where account_kind='external_party';
-- 0
```

`account_kind='external_party'` یکی از شش مقدار مجاز است ولی **صفر بار** استفاده شده.

> **تصحیح از دامنهٔ G (همین فایل، پایین‌تر):** «صفر بار استفاده‌شده» درست است، ولی
> نتیجه‌گیریِ ضمنیِ «پس در دفتر بیان‌شدنی نیست» **نادرست است**. سمت بدهکارِ
> `post_receipt_accounting` شاخه دارد و برای فیشِ دارای طرف خارجی دقیقاً
> `account_kind='external_party'` می‌نویسد. آمار صفر است چون تنها فیش ثبت‌شده از شاخهٔ
> بانک آمده و هر ۴ فیشِ دارای طرف خارجی هنوز `pending_review`اند. مسیر **اجرانشده** است،
> نه **ناموجود**. آنچه واقعاً بیان‌شدنی نیست، سمت بستانکارِ ثابت است.

و مسیر پرداخت اصلاً سند نمی‌زند:
```
pay_purchase_with_voucher -> NO journal entry
```

تنها نویسندهٔ دفتر همچنان `post_receipt_accounting` است که دو خط ثابت با
`customer_credit` هاردکد می‌نویسد (بخش اول، مورد ۴).

**نتیجه: ثبت شخص ثالث امروز کاملاً «فراداده روی سند» است، نه یک موضع در دفتر.**

---

## ۶ — حکم نهایی

**نیمهٔ حل‌شده — ثبت هویت.** سمت دریافت آنچه مالک خواسته را دارد و از آن استفاده می‌شود:
دو حالت صریح با الزام XOR، ارجاع واقعی به یک رکورد سبک بدون پرونده، تفکیک عمدی
«دریافت‌کننده» از «ذی‌نفع حسابداری»، و CRUD کامل برای مدیریت طرف‌ها.
**این نیاز عملاً برآورده شده است و ساختن دوباره‌اش اشتباه خواهد بود.**

> **قید مهم از دامنهٔ E (بند ۷-الف):** «ثبت» بله، ولی «رساندن به سند» نه.
> `beneficiary_accounting_code` تنها ستونی است که در `post_receipt_accounting` **اصلاً
> خوانده نمی‌شود**؛ تنها مصرف‌کننده‌اش شرط نگهبانِ تریگر خنثی‌شدهٔ `trg_post_receipt_on_approve`
> است. پس تفکیک عمدی «دریافت‌کننده» از «ذی‌نفع حسابداری» در لحظهٔ ثبت سند از بین می‌رود.
> داده ذخیره و قابل جست‌وجو می‌ماند — ولی به دفتر نمی‌رسد.

**نیمهٔ حل‌نشده — بیان حسابداری.** سناریوی مالک یک سند متوازن می‌خواهد که بدهکاری یک
شخص را با بستانکاری شخص دیگر تسویه کند. آن هنوز غیرممکن است: `supplier_payable` وجود
ندارد، هیچ RPC سند چندخطی نمی‌سازد، پرداخت‌ها اصلاً سند نمی‌زنند، و
`account_kind='external_party'` هرگز استفاده نشده.

**پس آنچه باقی مانده کار روی «ثبت شخص ثالث» نیست — کار روی خودِ دفتر است.**

**و یک شکاف عملی:** همان قابلیت روی سمت پرداخت در دسترس کاربر نیست، در حالی که جدولش
آماده است. این ارزان‌ترین بهبود در این حوزه است.

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

## C — خرید ✅ (بخش مسیرهای ثبت خرید کامل)

> بخش سوم دستور مالک: «دو مسیر خرید یا سه؟» پاسخ با شواهد زیر.

### حکم: **یک پیاده‌سازی، سه نقطهٔ ورود** — و دکمه‌ای که مالک به یاد داشت واقعاً وجود دارد

مالک درست به یاد داشت. دکمهٔ «خرید انجام شد» **وجود دارد، ساخته شده، و کار می‌کند** —
ولی مسیر سومِ جداگانه‌ای نیست؛ ورودی دیگری به همان مسیر است.

### شواهد

**تنها یک کامپوننت فرم خرید در کل مخزن رندر می‌شود:**

```
src/routes/_app.purchases_.create.tsx:33          <PurchaseForm />
src/components/purchase/PurchaseForRequestDrawer.tsx:63   <PurchaseForm ... />
```

و کامنت خودِ drawer (خط ۲۱) صریح است:

> *It renders the SHARED PurchaseForm — the very same component `/purchases/create` [uses]*

**تنها یک RPC ثبت خرید:** `useCreatePurchase.ts:134` → `supabase.rpc("create_purchase", …)`.
هیچ مسیر دیگری `create_purchase` را صدا نمی‌زند.

**دکمهٔ «خرید انجام شد»** در `PurchaseStatusActions.tsx:37` تعریف شده و طبق کامنت خودش:

> *Issue 219 / C3 — «خرید انجام شد» now opens the real purchase form.*

و در خط ۹۴ توضیح می‌دهد که **قبلاً** یک مسیر جداگانه و ناسالم بود:

> *«خرید انجام شد» used to open a dialog that typed in a final price and flipped the
> status, so a request could read "purchased" while no purchase document existed
> anywhere. It opens the real purchase form instead, and the status moves only because
> a document was committed.*

**پس مسیر سومی که مالک به یاد دارد واقعاً وجود داشت — و عمداً حذف و به مسیر اصلی متصل شد.**
حافظهٔ مالک درست بود؛ فقط آن مسیر دیگر جدا نیست.

### سه نقطهٔ ورود

| # | نقطهٔ ورود | مسیر | به `create_purchase` می‌رسد؟ |
|---|---|---|---|
| ۱ | فرم مستقل | `/purchases/create` | ✅ مستقیم |
| ۲ | دکمهٔ «خرید انجام شد» روی کارت درخواست | `PurchaseRequestCard.tsx:166` | ✅ از طریق drawer |
| ۳ | همان دکمه در پنل مدیریت خرید | `_app.admin.purchase.tsx:270` | ✅ از طریق drawer |

نقاط ۲ و ۳ **همان کامپوننت** `PurchaseStatusActions` هستند که در دو جا رندر شده — نه دو
پیاده‌سازی.

### پاسخ بند به بند

**۱ — چند نقطهٔ ورود؟** سه نقطهٔ ورود، **یک پیاده‌سازی**. جست‌وجوی گسترده برای
«خرید انجام شد» و `create_purchase` هیچ مسیر مستقل دیگری پیدا نکرد.

**۲ — کدام به `stock_movements` می‌نویسد؟ هر سه، چون یکی‌اند.** زنجیره:
`create_purchase` → درج در `purchase_items` → تریگر `trg_purchase_items_stock_in`
(مهاجرت ۲۱۰، خط ۲۲۸-۲۲۹) → `stock_movements`.
موجودی از نقطهٔ ورود مستقل است.

**۳ — کدام کامل‌تر است؟** پرسش بی‌موضوع می‌شود: یک فرم، یک RPC، یک مسیر موجودی. آنچه
فرق می‌کند فقط **زمینه** است — نقطهٔ ۱ خرید مستقل، نقاط ۲ و ۳ خرید در پاسخ به یک درخواست
(که `purchase_request_fulfillments` هم می‌سازد).

**۴ — آیا به هم وصل‌اند؟** بله، کاملاً. یک کامپوننت مشترک و یک RPC مشترک.

**۵ — حکم: دو جریان نیست، سه جریان هم نیست — یک جریان با سه در ورودی.**
دکمهٔ «خرید انجام شد» ساخته شده و کار می‌کند. آنچه دیگر وجود ندارد، دیالوگ قدیمی و
جداگانه‌ای است که اجازه می‌داد وضعیت «خریداری‌شده» بدون هیچ سندی ثبت شود — و حذفش عمدی بود.

### نکتهٔ مرتبط با تلهٔ وضعیت مشتق

`PurchaseStatusActions.tsx:44-56` رفتار ردیف‌های `legacy_no_fulfillment` را توضیح می‌دهد:
فقط‌خواندنی می‌شوند چون سند ندارند. این همان پرچمی است که مهاجرت ۳۰۶ (P0.3b) با آن
سروکار داشت — بک‌اند از هر سه جهت (RPC، PostgREST، UPDATE مستقیم) وضعیت دستی
«خریداری‌شده» را رد می‌کند.

### بقیهٔ چک‌لیست هشت‌بندی — C

**۱ — مسیرها و ناوبری.** `_app.purchases_.create.tsx` (فرم مستقل)،
`_app.purchases.tsx` (۳۳ خط، پوستهٔ فهرست)، `_app.purchase.tsx` (۱۲۷ خط، پنل)،
`_app.admin.purchase.tsx` (۲۷۹ خط، خط لولهٔ تأیید). ماژول ناوبری `purchases`.

**۲ — اسکیما و اندازهٔ واقعی.** شمارش زنده — **اعداد گزارش فرانت‌اند کهنه‌اند**:

| جدول | گزارش فرانت‌اند | زنده امروز |
|---|---|---|
| `purchase_requests` pending | ۳۳۹ | **۳۵۹** |
| approved | ۱۳۰ | **۱۳۷** |
| purchased | ۱۲ | **۱۶** |
| `purchases` | — | **۵۹** |
| `purchase_items` | — | **۵۹** |
| `purchase_request_fulfillments` | — | **۲۵** |

(اعداد به‌خاطر اجراهای e2e و مهاجرت ۳۰۶ که ۱۲۱ درخواست یتیم را حذف کرد جابه‌جا شده‌اند.)

**۳ — تریگرها.** یازده عدد روی چهار جدول:
`purchases` → audit_insert, updated_at, `trg_asan_burn_purchase_number`,
`trg_award_accountant_payment_score`, `trg_award_buyer_purchase_score`,
`trg_guard_accountant_purchase_update`, `trg_purchases_derive_person` ·
`purchase_items` → `trg_purchase_items_stock_in` (مسیر موجودی) ·
`purchase_requests` → `trg_purchase_request_status_derived` (همان تریگر وضعیت مشتق
که مهاجرت ۳۰۶ با آن سروکار داشت), updated_at ·
`purchase_request_fulfillments` → `trg_prf_validate_allocation`.

**۴ — محدودیت‌ها.** `quantity >= 1` · ارز فقط `toman/usd/aed` (هم برای `currency` هم
`cash_price_currency`) · `purchases_supplier_person_requires_supplier_chk`
(شخص تأمین‌کننده بدون ردیف تأمین‌کننده ممنوع) · `number` یکتا ·
`purchase_requests.status` محدود به شش مقدار.

**۵ — ساخته‌شده ولی بی‌مصرف.** `purchase_receipts` = **۰ ردیف**. جدول و FK دارد
(`purchase_receipts.request_id` با CASCADE) ولی هرگز استفاده نشده — نامزد جدی
«ساخته شد، وصل نشد».

**۶ — تکرار.** در این دور موردی پیدا نشد. برخلاف تصور اولیهٔ گزارش فرانت‌اند، دو «جریان
خرید» در واقع یک پیاده‌سازی‌اند (بالا).

**۷ — نقص/شکاف: مجوز ثبت خرید در سه لایه یکسان نیست.**

| لایه | چه کسی می‌تواند خرید ثبت کند |
|---|---|
| `role_permissions` ماژول `purchases` | فقط `admin` و `manager` (`create=true`) |
| RLS روی `purchases` | فقط `admin` و `manager` («manager admin write purchases») |
| RPC `create_purchase` | admin/manager **به‌علاوهٔ مسئولِ اختصاص‌یافتهٔ درخواست** |

خودِ کد این را می‌داند و علامت‌گذاری کرده است:

> *⚠️ This is the one place where the RPC is broader than the RLS policy on purchases
> (admin/manager). It has to be: the whole feature is that the assigned buyer registers
> the purchase. In practice nothing changes today — create_purchase_request assigns every
> request to the first active manager, so every assignee already holds manager. Aligning
> RLS and role_permissions with this rule is the separate permission-unification phase.*

**ادعای «هر مسئول، مدیر است» زنده بررسی شد و درست است:**

```
assigned_requests = 238 | assignees_who_are_admin_or_manager = 238
                        | assignees_who_are_NOT = 0
```

پس شکاف **امروز خفته است**، نه فعال. ولی اگر روزی درخواستی به کسی غیر از admin/manager
اختصاص یابد، آن شخص می‌تواند خرید ثبت کند در حالی که هر دو لایهٔ دیگر می‌گویند نمی‌تواند.
این یک نقص نیست — یک تصمیم مستند با بدهی فنی اعلام‌شده است.

**نکتهٔ فرعی:** `purchase_specialist` — نقشی که نامش برای خرید است — در
`role_permissions` روی ماژول `purchases` فقط `view=true` دارد. با قاعدهٔ بالا، این نقش
فقط از راه درخواستِ اختصاص‌یافته می‌تواند خرید ثبت کند، هرگز مستقل.

**۸ — پوشش `role_permissions`.** ✅ کامل برای ماژول `purchases` — هر هفت نقش ردیف صریح
دارند.

---

## F — پرداخت ✅ کامل

### حکم کوتاه

**جدول به‌طرز چشمگیری کامل است؛ RPC و فرم تقریباً هیچ‌کدام از آن را در دسترس نمی‌گذارند.
و هیچ پرداختی هرگز وارد دفتر روزنامه نمی‌شود.**

**۱ — مسیرها و ناوبری.** `_app.accounting.purchase-payments.tsx` (۵۷۹ خط).
در registry ثبت است (`registry.ts:463-467`، ماژول `accounting`، گروه `finance`).
گارد مسیر: `requireAnyRole(["admin","manager","accountant"])` — **فهرست نقش ثابت، نه
`requirePermission`**.

**۲ — اسکیما.** ۲۲ ستون، شامل هرچه برای ثبت شخص ثالث لازم است:
`payee_type, payee_party_id, payee_supplier_id, payee_customer_id, payee_person_id,
payee_name, tracking_number, cheque_number, cheque_due_date, source_bank_account_id`.

**۳ — منطق کسب‌وکار.** `pay_purchase_with_voucher` تنها نویسنده است. امضایش:
```
_purchase_id, _source_bank_account_id, _payment_date, _document_channel,
_amount, _tracking_number, _cheque_number, _cheque_due_date, _description
```
سه تریگر: `trg_payment_vouchers_updated_at`, `trg_payment_vouchers_number`
(شماره‌گذاری), `trg_payment_vouchers_derive_person`.

**۴ — محدودیت‌ها. این بهترین بخش این دامنه است.**
`payment_vouchers_payee_matches_type_chk` یک XOR کامل چهارطرفه است: برای هر
`payee_type` دقیقاً یک FK باید پر باشد و بقیه NULL؛ و برای `other` نام غیرخالی الزامی است.
همچنین فیلدهای چک فقط وقتی مجازند که `document_channel='cheque'` باشد، و در آن حالت
شمارهٔ چک الزامی است. کانال‌های مجاز: `card_to_card, paya, pol, satna, cash, cheque, other`.

**یعنی مدل دادهٔ سمت پرداخت برای ثبت شخص ثالث از سمت دریافت هم کامل‌تر است** — چهار نوع
گیرندهٔ صریح با CHECK سخت‌گیرانه، در برابر XOR دوحالتهٔ سمت دریافت.

**۵ — ساخته‌شده ولی بی‌مصرف. این کل دامنه است.**
`payment_vouchers` = **۰ ردیف**. هیچ پرداختی تا امروز ثبت نشده. تمام آن مدل‌سازی دقیق
بالا هرگز به کار نرفته.

**۶ — تکرار.** موردی پیدا نشد.

**۷ — نقص‌ها. سه مورد، به ترتیب اهمیت:**

**(الف) پرداخت‌ها هیچ سند حسابداری تولید نمی‌کنند.** بررسی زنده: تنها تابعی که در
`journal_entries` درج می‌کند `post_receipt_accounting` است. `pay_purchase_with_voucher`
هیچ سطری نمی‌زند. یعنی **خروج پول از خزانه در دفتر دوطرفه نامرئی است**. امروز بی‌اثر
(۰ ردیف) ولی اولین پرداخت واقعی این شکاف را فعال می‌کند.

**(ب) RPC هویت گیرنده را نمی‌پذیرد.** جدول `payee_party_id` با FK به `external_parties`
دارد، ولی امضای RPC هیچ پارامتری برایش ندارد — نه `payee_party_id`، نه `payee_name`، نه
`payee_type`. **پاسخ صریح به پرسش مالک: تغییر امضای RPC کافی نیست.** چون
`payment_vouchers_payee_matches_type_chk` الزام می‌کند `payee_type` و دقیقاً یکی از FKها
با هم ست شوند، RPC باید **هر دو** را بگیرد و هم‌زمان بنویسد. یعنی: امضا + بدنهٔ درج +
فرم. سه لایه، نه یکی.

**(ج) ماژول `accounting` هیچ ردیفی در `role_permissions` ندارد.** فهرست ۲۴ ماژول دارای
ردیف، `accounting` را شامل نمی‌شود. مسیر پرداخت با فهرست نقش ثابت محافظت می‌شود، پس
عملاً باز نیست؛ ولی هر جزئی که به‌صورت پویا مجوز `accounting` را بپرسد از این شکاف
آسیب می‌بیند. این همان هشدار بند ۸ چک‌لیست است.

**۸ — پوشش `role_permissions`.** ❌ **صفر ردیف برای ماژول `accounting`.**

### `external_party` در دفتر — بازتأیید

```
journal_lines_total = 2   |   external_party_lines = 0
```
هنوز صفر. مسیر ثبت شخص ثالث در سمت پرداخت نه در فرم هست، نه در RPC، و نه در دفتر.

---

## E — دریافت ✅ کامل

### حکم کوتاه

**بهترین‌ساخته‌شدهٔ دامنه‌های مالی — و تنها دامنه‌ای که هر سه لایهٔ مجوزش با هم می‌خوانند.**
ولی «تأیید» فیش آن را وارد دفتر **نمی‌کند**، و فیلد «کد ذی‌نفع حسابداری» که بخش صفر آن را
دقیقاً پاسخ سناریوی مالک دانست **هرگز به سند نمی‌رسد**.

**۱ — مسیرها و ناوبری.** چهار مسیر، همه ماژول `accounting` گروه `finance`:

| فایل | خطوط | گارد |
|---|---|---|
| `_app.accounting.receipts.tsx` (فهرست) | ۵۶۶ | `requireAnyRole(["admin","manager","accountant"])` |
| `_app.accounting.receipts.$receiptId.tsx` (جزئیات) | — | همان سه نقش |
| `_app.accounting.receipts.create.tsx` | — | `requireAnyRole(["admin","accountant"])` |
| `_app.accounting.receipts_.training.tsx` | ۱۲ | همان سه نقش (پوستهٔ `PaymentReceiptGuide`) |

ثبت در registry: `registry.ts:435` (فیش‌های واریزی) و `:442` (آموزش)؛ وزن جست‌وجو `:1221`،
نقش پیشنهادی `:1231` = `["accountant"]`، مترادف‌ها `:1237`.

**و این اولین دامنه‌ای است که گارد مسیر با RLS دقیقاً می‌خواند** — برخلاف دامنهٔ A:

| عمل | گارد مسیر | سیاست RLS |
|---|---|---|
| دیدن | admin, manager, accountant | `pr_select_privileged` → همان سه |
| ساختن | admin, accountant | `pr_insert_admin_accountant` → همان دو |

**۲ — اسکیما.** `payment_receipts` = **۴۲ ستون**، **۶ ردیف**. سرشماری استفادهٔ زنده:

| ستون | پرشده از ۶ |
|---|---|
| `payer_name` · `tracking_number` · `receiver_name` | ۶ |
| `payer_accounting_code` · `receiver_accounting_code` | ۶ |
| `payer_phone` | ۵ |
| `receiver_party_id` · `beneficiary_accounting_code` · `receiver_party_person_id` | ۴ |
| `destination_bank_account_id` | ۲ |
| `source_bank_account_id` · `cheque_number` · `cheque_due_date` · `receipt_image_url` · `custom_data` | **۰** |

توزیع وضعیت: ۵ `pending_review` + ۱ `approved`. توزیع `posting_status`: ۵ `unposted` + ۱ `posted`
— و **همان ردیف تأییدشده همان ردیف ثبت‌شده است** (`fd8194a5`)، پس امروز رانشی وجود ندارد.

**۳ — منطق کسب‌وکار. شش تریگر، و یکی‌شان عمداً بی‌اثر است:**

```
trg_normalize_phone                                → tg_normalize_phone_columns(payer_phone, receiver_phone)
trg_payment_receipts_derive_person                 → tg_payment_receipts_derive_person
trg_payment_receipts_enforce_allocation_on_approve → enforce_receipt_approval_allocation_limits
trg_payment_receipts_post_journal                  → trg_post_receipt_on_approve   ← بی‌اثر
trg_payment_receipts_recompute_employee_score      → recompute_employee_scores_on_receipt
trg_payment_receipts_updated_at                    → set_updated_at_now
```

**زنجیرهٔ چهارمی به بن‌بست می‌رسد.** `trg_post_receipt_on_approve` در نهایت
`post_receipt_journal` را صدا می‌زند، و بدنهٔ آن تابع امروز این است:

```sql
-- NEUTRALIZED (migration 149). Model B (post_receipt_accounting) is the
-- authoritative ledger path. ... it now does nothing, so the approve UPDATE
-- succeeds and only Path B posts.
RETURN NULL;
```

**پس تأییدکردن یک فیش هیچ سندی نمی‌زند.** ثبت واقعی فقط با فراخوانی صریح RPC
`post_receipt_accounting` از صفحهٔ جزئیات انجام می‌شود
(`_app.accounting.receipts.$receiptId.tsx:335`). فیش می‌تواند برای همیشه
`status='approved'` و `posting_status='unposted'` بماند.

**۴ — محدودیت‌ها. XOR در سه لایه، و پایگاه‌داده شل‌ترینِ آنهاست:**

```sql
payment_receipts_receiver_exclusive_chk CHECK (
     (destination_bank_account_id IS NOT NULL AND receiver_party_id IS NULL)
  OR (destination_bank_account_id IS NULL AND receiver_party_id IS NOT NULL)
  OR (status = 'pending_review' AND destination_bank_account_id IS NULL
      AND receiver_party_id IS NULL))
```

شاخهٔ سوم یعنی **در حالت پیش‌نویس هر دو می‌توانند NULL باشند** — در حالی که فرم
(`PaymentReceiptForm.tsx:251`) XOR سخت‌گیرانه می‌خواهد و `post_receipt_accounting` هنگام
ثبت دوباره XOR سخت‌گیرانه را الزام می‌کند. **این نقص نیست، طراحی سه‌مرحله‌ای است:** فرم
سخت، پایگاه‌داده برای پیش‌نویس شل، ثبت دوباره سخت.

بقیه: `amount > 0` · `payment_receipts_cheque_fields_chk` (فیلدهای چک فقط با
`document_channel='cheque'`) · `receipt_time` با regex `^\d{2}:\d{2}$` ·
`receiver_party_person_id` بدون `receiver_party_id` ممنوع · فهرست‌های بستهٔ `status`
(۳ مقدار)، `receipt_type` (۴ مقدار)، `posting_status` (۲ مقدار)، `document_channel` (۷ مقدار).
پنج کلید خارجی واقعی، از جمله `receiver_party_id → external_parties(id)`.

**۵ — ساخته‌شده ولی بی‌مصرف. یک صفحهٔ کامل روی جدولی که وجود ندارد:**

`_app.operations.receipts.tsx` — **۳۹۱ خط** رابط کامل بازبینی «فیش‌های OCR» با تب‌های
در‌انتظار/تأییدشده/ردشده و دیالوگ بازبینی. جدولش `ocr_receipts` است و:

```sql
select table_schema, table_name from information_schema.tables where table_name ilike '%ocr%';
-- (0 rows)   ← در هیچ اسکیمایی وجود ندارد
```

مسیر **در registry ثبت نشده** (جست‌وجو در `registry.ts` و `primary-modules.ts` بی‌نتیجه)،
پس فقط با URL مستقیم قابل دسترسی است. خودِ کد می‌داند جدول نیست و با ظرافت تسلیم می‌شود
(`_app.operations.receipts.tsx:86` — کدهای `42P01` و `PGRST205` را می‌گیرد و
`tableMissing: true` برمی‌گرداند). یعنی **رابط بازبینی برای خط‌لولهٔ OCR ساخته شد، خط‌لوله
هرگز نیامد، و صفحه برای همان روز مقاوم‌سازی شد.**

به‌علاوه پنج ستون با صفر استفاده در جدول اصلی (بند ۲) — به‌ویژه `cheque_number` و
`cheque_due_date` که با CHECK کامل محافظت می‌شوند ولی هرگز نوشته نشده‌اند.

**۶ — تکرار.** در لایهٔ رابط **هیچ**: `PaymentReceiptForm` تنها یک مصرف‌کننده دارد
(`receipts.create.tsx:31`). ولی در لایهٔ پایگاه‌داده **دو مسیر ثبت** وجود دارد:

| مسیر | تابع | وضعیت |
|---|---|---|
| A | `post_receipt_journal` | خنثی‌شده (مهاجرت ۱۴۹)، ولی **تریگرش هنوز وصل است** |
| B | `post_receipt_accounting` | مرجع؛ تنها نویسندهٔ واقعی دفتر |

تریگر مسیر A روی هر INSERT و هر تغییر `status` شلیک می‌شود و به تابعی می‌رسد که
`RETURN NULL` است. تصمیم مستند و عمدی است، ولی وزن مرده‌ای است که هنوز اجرا می‌شود.

**۷ — نقص‌ها. سه مورد، به ترتیب اهمیت:**

**(الف) «کد ذی‌نفع حسابداری» هرگز به سند نمی‌رسد.** بخش صفر نشان داد این ستون دقیقاً
سناریوی مالک را ممکن می‌کند و ۴ فیش از ۶ آن را پر کرده‌اند. ولی بررسی زنده:

```
post_receipt_accounting      mentions beneficiary_accounting_code = false
post_receipt_journal         mentions beneficiary_accounting_code = false
trg_post_receipt_on_approve  mentions beneficiary_accounting_code = TRUE
```

تنها جایی که این ستون خوانده می‌شود **شرط نگهبان تریگر خنثی‌شده** است. زنجیرهٔ واقعی
تعیین کد گیرنده در `post_receipt_accounting` این است و `beneficiary_accounting_code` در آن
اصلاً نیست:

```
receiver_accounting_code  →  external_parties.accounting_code  →  bank_accounts.accounting_code
```

**یعنی نیمهٔ «حل‌شده»ای که بخش صفر اعلام کرد، در لحظهٔ ثبت سند دور ریخته می‌شود.**
هر ۴ فیشی که کد ذی‌نفع دارند هنوز `unposted`اند، پس این شکاف تا امروز **خفته** است — ولی
اولین ثبت یکی از آنها کد ذی‌نفع را از دست می‌دهد و به‌جایش کد خودِ طرف خارجی را می‌نویسد.

**(ب) تخصیص هنگام ثبت فقط فاکتور را می‌شناسد، نه پیش‌فاکتور.** حلقهٔ تخصیص در
`post_receipt_accounting` چنین است:

```sql
FROM public.payment_receipt_links prl
JOIN public.invoices i ON i.id = prl.invoice_id
```

ولی هر سه پیوند زندهٔ موجود به پیش‌فاکتور اشاره می‌کنند، نه فاکتور:

```
payment_receipt_links: to_invoice = 0 | to_quote = 3
```

و خودِ جدول هر دو را مجاز می‌داند (`payment_receipt_links_one_target`:
`(invoice_id IS NOT NULL) <> (quote_id IS NOT NULL)`). **عدم‌تقارن:** تریگر تأیید
(`enforce_receipt_approval_allocation_limits`) **هر دو شاخه** را کامل پیاده کرده — سقف
پرداخت را هم برای `sales_quotes.final_amount` و هم برای `invoices.total_amount - deposit_amount`
بررسی می‌کند — ولی تابع ثبت فقط شاخهٔ فاکتور را دارد. پس فیشِ متصل به پیش‌فاکتور موقع تأیید
کنترل سقف می‌شود ولی موقع ثبت **هیچ سندی را به‌روز نمی‌کند**؛ حلقه روی صفر ردیف می‌چرخد.

**(ج) ماژول `accounting` هیچ ردیفی در `role_permissions` ندارد.** همان یافتهٔ دامنهٔ F،
اینجا هم صادق است — هر چهار مسیر این دامنه ماژول `accounting` دارند.

**۸ — پوشش `role_permissions`.** ❌ **صفر ردیف برای ماژول `accounting`.** فهرست زندهٔ
۲۴ ماژول دارای ردیف، `accounting` را ندارد. محافظت عملی این دامنه کاملاً بر دوش
`requireAnyRole` و RLS است — که خوشبختانه (بند ۱) با هم می‌خوانند.

---

## G — سند دوبل / دفتر روزنامه ✅ کامل

### حکم کوتاه

**دفتر روزنامه یک جدول است، نه یک سامانه.** هیچ صفحه‌ای ندارد، هیچ الزام توازنی ندارد،
و کل محتوایش یک سند دوخطی است که محصول جانبی تنها فیش ثبت‌شدهٔ تاریخ سیستم است.

**۱ — مسیرها و ناوبری. هیچ.**

جست‌وجوی زنده در `src/routes/` و `registry.ts` برای `journal|ledger`: **هیچ مسیری وجود ندارد.**
دفتر دقیقاً از دو نقطه قابل خواندن است:

| نقطه | دامنهٔ دید |
|---|---|
| `_app.accounting.receipts.$receiptId.tsx:279,296` | فقط سند **همان فیش** (`journal_entries` سپس `journal_lines`) |
| `src/lib/asan/export-journal.ts:34` → `asan_list_journal_export(_from, _to, _filter)` | خروجی آسان، فقط‌خواندنی |

**نه فهرست اسناد، نه جست‌وجو، نه تراز آزمایشی، نه دفتر معین بر حسب حساب.** برای دیدن یک
سند باید از راه فیشِ سازنده‌اش وارد شوید.

**۲ — اسکیما.** `journal_entries` ۱۱ ستون / **۱ ردیف** · `journal_lines` ۹ ستون / **۲ ردیف**.

سرآیند سند `payer_accounting_code` و `receiver_accounting_code` را هم نگه می‌دارد
(عکس‌برداری از فیش در لحظهٔ ثبت). ایندکس‌ها سالم‌اند: `entry_date`، `(source_type, source_id)`،
و روی خطوط `(account_kind, account_ref_id)` و `journal_entry_id`.

کل محتوای زندهٔ دفتر:

```
source_type=payment_receipt  entry_date=2026-07-25  status=posted
  line 1  bank             10,100,000,000  بدهکار
  line 2  customer_credit  10,100,000,000  بستانکار
```

**۳ — منطق کسب‌وکار. یک نویسنده، و یک تصحیح مهم نسبت به بخش صفر.**

بررسی زنده روی همهٔ توابع: تنها `post_receipt_accounting` در `journal_entries` و
`journal_lines` درج می‌کند. ثبتش idempotent است — هم `journal_entries_source_unique`
روی `(source_type, source_id)` و هم بررسی صریح وجود سند پیش از درج.

**ولی برخلاف آنچه در بخش صفر و مورد ۴ نوشته شد، هر دو خط ثابت نیستند.** بدنهٔ واقعی:

```sql
IF v_receipt.destination_bank_account_id IS NOT NULL THEN
  v_debit_kind := 'bank';            v_debit_ref := v_receipt.destination_bank_account_id;
ELSE
  v_debit_kind := 'external_party';  v_debit_ref := v_receipt.receiver_party_id;
END IF;
```

**سمت بدهکار شاخه دارد و `external_party` را می‌نویسد.** یعنی این ادعا که «طرف خارجی در
دفتر بیان‌شدنی نیست» **نادرست است** — مسیرش ساخته و وصل شده است. علت صفر بودن آمار چیز
دیگری است: تنها فیش ثبت‌شده (`fd8194a5`) از شاخهٔ بانک آمده، و **هر ۴ فیش دارای طرف خارجی
هنوز `pending_review`اند**. پس مسیر **اجرانشده** است، نه **ناموجود**.

آنچه واقعاً ثابت است سمت بستانکار است: همیشه `customer_credit` با
`account_ref_id = v_receipt.customer_id`. سناریوی مالک (تسویهٔ بدهی یک شخص با بستانکاری
شخص دیگر) همچنان بیان‌شدنی نیست — ولی به‌خاطر **سمت بستانکار و دوخطی‌بودن ثابت**، نه به‌خاطر
نبودن `external_party`.

**۴ — محدودیت‌ها. مهم‌ترین یافتهٔ این دامنه: توازن دوطرفه هیچ‌جا الزام نشده است.**

کل محدودیت‌های `journal_lines`:

```
journal_lines_account_kind_chk  CHECK (account_kind IN (customer_credit, bank,
                                       external_party, invoice_ar, clearing, other))
journal_lines_debit_nonneg      CHECK (debit  >= 0)
journal_lines_credit_nonneg     CHECK (credit >= 0)
journal_lines_one_side          CHECK (NOT(debit>0 AND credit>0) AND NOT(debit=0 AND credit=0))
journal_lines_journal_entry_id_fkey  FK → journal_entries(id) ON DELETE CASCADE
```

**هیچ‌کدام مجموع بدهکار و بستانکار را مقایسه نمی‌کنند** — و چنین کاری از CHECK سطری هم
برنمی‌آید. پس باید تریگر باشد؛ نیست:

```
triggers on journal_lines   → صفر
triggers on journal_entries → یکی: trg_asan_burn_journal_entry_number (AFTER DELETE، سوزاندن شمارهٔ آسان)
```

**توازن امروز فقط به این دلیل برقرار است که تنها نویسنده، هر دو خط را از یک متغیر
(`v_receipt.amount`) می‌سازد.** ولی RLS به `admin` و `accountant` اجازهٔ INSERT مستقیم روی
هر دو جدول را می‌دهد (`journal_entries_insert_admin_accountant`،
`journal_lines_insert_admin_accountant`) و این جدول‌ها از PostgREST در دسترس‌اند. یعنی
**یک سند نامتوازن امروز قابل درج است و هیچ لایه‌ای آن را رد نمی‌کند.**

دو ضعف ساختاری دیگر:
- **`account_ref_id` هیچ کلید خارجی ندارد.** چندریخت است و بسته به `account_kind` به
  `bank_accounts` یا `external_parties` یا `customers` اشاره می‌کند — بدون هیچ اعتبارسنجی.
  (همان الگویی که Codex برای `stock_movements` در دامنهٔ I یافت.)
- **`(journal_entry_id, line_no)` یکتا نیست.** فهرست ایندکس‌ها فقط PK و دو ایندکس غیریکتا
  دارد؛ دو خط با `line_no = 1` در یک سند مجاز است.

**۵ — ساخته‌شده ولی بی‌مصرف. نگهبان توازن نوشته شده و هرگز نصب نشده است.**

```sql
CREATE OR REPLACE FUNCTION public.validate_journal_entry_balance(p_journal_entry_id uuid)
 RETURNS TABLE(total_debit numeric, total_credit numeric, is_balanced boolean)
 LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0),
             COALESCE(SUM(debit),0) = COALESCE(SUM(credit),0)
               AND COALESCE(SUM(debit),0) > 0
     FROM public.journal_lines WHERE journal_entry_id = p_journal_entry_id; $$
```

پیاده‌سازی‌اش درست است (حتی سند صفر-به-صفر را نامتوازن می‌شمارد). و بررسی سه‌طرفهٔ زنده:

| آیا جایی وصل است؟ | نتیجه |
|---|---|
| به تریگری وصل است؟ | **۰ تریگر** |
| از داخل تابع دیگری صدا زده می‌شود؟ | **۰ تابع** |
| از فرانت‌اند فراخوانی می‌شود؟ | **۰ مورد** — تنها ارجاع در `types.ts:12839` است که فایل تولیدشده است |

**دقیقاً همان بررسی‌ای که بند ۴ نبودش را نقص اصلی این دامنه دانست، نوشته شده و بلااستفاده
مانده است.** ارزان‌ترین اصلاح کل این ممیزی همین است.

موارد دیگر این بند:
- `journal_entries_status_chk` مقادیر `draft` و `void` را مجاز می‌کند ولی **فقط `posted`
  تا امروز نوشته شده**، و جست‌وجوی زنده **هیچ تابع ابطال یا برگشت سند** پیدا نکرد.
- تریگر `trg_asan_burn_journal_entry_number` روی AFTER DELETE است، در حالی که **هیچ سیاست
  DELETE روی این جدول‌ها وجود ندارد** — حذفی پیش‌بینی شده که RLS اجازه‌اش را نمی‌دهد.

**۶ — تکرار.** دو مورد، هر دو مستند و عمدی:
- **مسیر A/B ثبت فیش** — `post_receipt_journal` خنثی در برابر `post_receipt_accounting`
  مرجع (جزئیات در بند ۶ دامنهٔ E).
- **کدهای حسابداری روی سرآیند سند** تکرار همان ستون‌ها روی `payment_receipts`اند. این
  عکس‌برداری عمدی و از نظر حسابداری درست است (سند نباید با ویرایش بعدی فیش تغییر کند)،
  ولی نسخهٔ دوم داده است و باید آگاهانه نگه داشته شود.

**۷ — نقص‌ها:**

**(الف) بدون الزام توازن** (بند ۴) — جدی‌ترین. سامانه‌ای که خودش را «دفتر دوطرفه»
می‌نامد، تنها ویژگی تعریف‌کنندهٔ دوطرفه‌بودن را الزام نمی‌کند.

**(ب) نگهبانِ آماده و وصل‌نشده** (بند ۵).

**(ج) بدون هیچ رابط کاربری** (بند ۱). حسابدار نمی‌تواند دفتر را ببیند، فقط می‌تواند
صادرش کند.

**(د) `account_ref_id` بدون FK و `line_no` بدون یکتایی** (بند ۴).

**(ه) مقیاس.** یک سند، در برابر ۶ فیش، ۵۹ خرید، ۵۰ پیش‌فاکتور و ۰ سند پرداخت. دفتر
سرریزِ یک عملیات است، نه ثبت سامانمند رویدادهای مالی. (پرداخت‌ها اصلاً سند نمی‌زنند —
دامنهٔ F بند ۷-الف.)

**۸ — پوشش `role_permissions`.** ❌ **دفتر ماژول مجوز ندارد.** نه `accounting` ردیفی دارد
و نه ماژولی به نام `journal` وجود دارد. تنها دروازهٔ واقعی RLS است
(`*_select_finance` = admin/manager/accountant · `*_insert|update_admin_accountant` = admin/accountant
· `viewer_restricted`). تنها دسترسی مجوزدارِ واقعی به دفتر از راه ماژول `asan-export`
است که هر ۷ نقش ردیف دارد — یعنی **صادرکردن دفتر مجوز دارد، دیدنش ندارد.**

---

### B, D, H, I, J

سهم Codex. گزارش کامل با همین چک‌لیست هشت‌بندی در
`docs/audits/full-accounting-audit-part2-codex.md`. خلاصهٔ حکم هر دامنه در فایل HANDOFF.

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

۶. **`external_party` دقیقاً برای نیاز شماست و — برخلاف برداشت اولیه — مرده نیست، فقط
   اجرا نشده.** ۱ ردیف و صفر خط در دفتر، ولی مسیر نوشتنش در `post_receipt_accounting`
   ساخته و وصل است؛ هر ۴ فیشِ دارای طرف خارجی هنوز ثبت نشده‌اند (دامنهٔ G، بند ۳).

۷. **بازخورد کارکنان وصل نشده** — `converted_task_id` را هیچ تابعی نمی‌نویسد.

۸. **`journal_lines.account_ref_id` هیچ FK ندارد** — مرجع چندریختی بدون گارد، همان
   الگویی که در `stock_movements` به مهاجرت ۳۰۴ آسیب زد.

۹. **دفتر «دوطرفه» توازن را الزام نمی‌کند.** هیچ CHECK، هیچ تریگر، هیچ لایه‌ای مجموع
   بدهکار و بستانکار را مقایسه نمی‌کند؛ و RLS به admin/accountant اجازهٔ درج مستقیم
   می‌دهد. توازن امروز فقط محصول جانبیِ تک‌نویسنده‌بودن است (دامنهٔ G، بند ۴).

۱۰. **نگهبان توازن نوشته شده و نصب نشده.** `validate_journal_entry_balance` وجود دارد،
    درست است، و به صفر تریگر / صفر تابع / صفر فراخوانی فرانت‌اند وصل است.
    **ارزان‌ترین اصلاح کل این ممیزی** (دامنهٔ G، بند ۵).

۱۱. **«کد ذی‌نفع حسابداری» به سند نمی‌رسد.** ستونی که بخش صفر آن را پاسخ سناریوی شما
    دانست، در تابع ثبت اصلاً خوانده نمی‌شود (دامنهٔ E، بند ۷-الف).

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

---

# چک‌لیست رسمی هشت‌بندی — دامنه‌های E و G (Agent 7 · ۲۰۲۶-۰۸-۰۸)

> **هدف این بخش:** همان فرمت هشت‌بندی رسمی که دامنه‌های A–D / F / H–J گرفتند، اینجا
> به‌صورت صریح برای E (دریافت) و G (سند دوبل/دفتر) بسته شود.
>
> **روش:** محتوای تفصیلی از قبل در بخش‌های «E — دریافت» و «G — سند دوبل» همین فایل
> (حدود خطوط ۷۰۱–۱۰۲۲) با شواهد زنده نوشته شده بود. این بخش **دوباره‌کاری نمی‌کند** —
> هر بند را با ارجاع به همان متن جمع می‌بندد، و فقط یافته‌هایی که در بازبینی زندهٔ
> ۲۰۲۶-۰۸-۰۸ نسبت به آن متن تغییر کرده‌اند را تازه علامت می‌زند.

## بازبینی زنده (۲۰۲۶-۰۸-۰۸) — دلتا نسبت به متن اصلی

| ادعا در متن اصلی | وضعیت زندهٔ امروز | حکم |
|---|---|---|
| `payment_receipts` = ۶ · لینک‌ها = ۳ (همه به quote) · `journal_entries`=۱ · `journal_lines`=۲ | همان اعداد | بدون تغییر |
| ۵ `pending_review/unposted` + ۱ `approved/posted` | همان توزیع | بدون تغییر |
| `beneficiary_accounting_code` پرشده در ۴ فیش | ۴ | بدون تغییر |
| `ocr_receipts` در هیچ اسکیمایی نیست | ۰ جدول `%ocr%` | بدون تغییر |
| `validate_journal_entry_balance` صفر caller (تابع/تریگر/`pg_depend`) | ۰ | بدون تغییر |
| `journal_lines_account_kind_chk` شش مقدار | **هفت مقدار** — `supplier_payable` اضافه شده | **دلتا** (مهاجرت ledger / ۳۱۲) |
| ماژول `accounting` صفر ردیف در `role_permissions` | **۷ ردیف** (هر نقش یک ردیف؛ `created_at=2026-08-08 00:51:44+00`) | **دلتا** |

جزئیات بندبه‌بند زیر، بر پایهٔ متن اصلی + این دلتاهاست.

---

## E — دریافت (Payment Receipts) — چک‌لیست رسمی

### 1. Routes/pages

| Route | File · guard | Nav |
|---|---|---|
| `/accounting/receipts` | `_app.accounting.receipts.tsx:73` · `requireAnyRole(["admin","manager","accountant"])` | ✅ `registry.ts:436` · `primary-modules.ts` finance |
| `/accounting/receipts/$receiptId` | `_app.accounting.receipts.$receiptId.tsx:59` · همان سه نقش | از فهرست |
| `/accounting/receipts/create` | `_app.accounting.receipts.create.tsx:11` · `requireAnyRole(["admin","accountant"])` | دکمهٔ فهرست؛ seed سطح‌بالا ندارد |
| `/accounting/receipts/training` | `_app.accounting.receipts_.training.tsx:9` · سه نقش | ✅ `registry.ts:443` |
| `/operations/receipts` | `_app.operations.receipts.tsx:32` · صفحهٔ OCR | ❌ **نه در registry نه در primary-modules** |

گارد مسیر با RLS هم‌خوان است (ادعا و جدول تطبیق در بخش E بند ۱، خطوط ۷۲۱–۷۲۶).

### 2. Schema

زنده‌بازبینی‌شده: `payment_receipts` **۴۲ ستون / ۶ ردیف** · `payment_receipt_links` **۳ ردیف**
(`to_invoice=0`, `to_quote=3`) · `external_parties` **۱ ردیف**. سرشماری پرشدگی ستون‌ها و
توزیع وضعیت/ثبت در بخش E بند ۲ (خطوط ۷۲۸–۷۴۰).

### 3. Business logic

شش تریگر روی `payment_receipts` زنده تأیید شد (۲۰۲۶-۰۸-۰۸)، از جمله
`trg_payment_receipts_post_journal → trg_post_receipt_on_approve` که به
`post_receipt_journal` خنثی‌شده می‌رسد. نویسندهٔ واقعی دفتر فقط
`post_receipt_accounting` است؛ فراخوانی UI در
`_app.accounting.receipts.$receiptId.tsx:335`. نقل‌قول بدنه و خنثی‌سازی مهاجرت ۱۴۹ در
بخش E بند ۳ (خطوط ۷۴۲–۷۶۶) — از حافظه بازنویسی نشد.

### 4. Constraints

XOR گیرنده در سه لایه (CHECK شل برای پیش‌نویس + فرم سخت + RPC ثبت سخت)،
`amount > 0`، محدودیت فیلدهای چک، regex ساعت، FK به `external_parties` — جزئیات و تعریف
CHECK در بخش E بند ۴ (خطوط ۷۶۸–۷۸۷).

### 5. Built-but-unwired

- `/operations/receipts` (۳۹۱ خط) روی `ocr_receipts` که **وجود ندارد**؛ مقاوم به `42P01` /
  `PGRST205` (`_app.operations.receipts.tsx:86`). بدون ورودی ناوبری.
- ستون‌های چک با صفر استفادهٔ زنده + تریگر مسیر A که هنوز شلیک می‌شود ولی `RETURN NULL`
  است. جزئیات: بخش E بند ۵ (خطوط ۷۸۹–۸۰۶).

### 6. Duplication

یک فرم (`PaymentReceiptForm`)؛ دو مسیر ثبت دفتر A/B (`post_receipt_journal` خنثی در برابر
`post_receipt_accounting` مرجع). بخش E بند ۶ (خطوط ۸۰۸–۸۱۷).

### 7. Bugs/gaps

| # | شدت | خلاصه | شاهد |
|---|---|---|---|
| الف | 🔴 | `beneficiary_accounting_code` به سند نمی‌رسد — فقط شرط تریگر خنثی آن را می‌خواند | بخش E بند ۷-الف؛ ۴ فیش پرشده هنوز unposted |
| ب | 🟠 | حلقهٔ تخصیص در ثبت فقط `invoices` را JOIN می‌کند؛ هر ۳ پیوند زنده به quote است | بخش E بند ۷-ب |
| ج | 🟡→✅ | پوشش `role_permissions` برای `accounting` | **قبلاً صفر بود؛ امروز ۷ ردیف** (دلتا پایین) |

### 8. role_permissions coverage

**دلتا ۲۰۲۶-۰۸-۰۸:** ماژول `accounting` دیگر صفر نیست. هفت ردیف زنده:

| role_name | view | create | update | delete | approve | export | view_sensitive |
|---|---|---|---|---|---|---|---|
| admin | t | t | t | t | t | t | t |
| manager | t | t | t | f | t | t | t |
| accountant | t | t | t | f | f | t | t |
| sales / viewer / purchase_specialist / site | f | f | f | f | f | f | f |

گارد مسیر دریافت (`admin`/`manager`/`accountant` برای دیدن؛ `admin`/`accountant` برای
ساختن) با ردیف‌های دارای `can_view`/`can_create` هم‌راستاست. متن قدیمی بخش E بند ۸ که
«صفر ردیف» می‌گفت **منسوخ** است — این جدول جایگزین آن ادعاست.

---

## G — سند دوبل / دفتر روزنامه — چک‌لیست رسمی

### 1. Routes/pages

**هیچ route مستقلی برای دفتر نیست** (جست‌وجوی `journal|ledger` در `src/routes/` و
`registry.ts`). نقاط خواندن:

| نقطه | دامنه |
|---|---|
| `_app.accounting.receipts.$receiptId.tsx:279,296` | فقط سند همان فیش |
| `src/lib/asan/export-journal.ts:34` → `asan_list_journal_export` | خروجی آسان |

بدون فهرست اسناد / تراز آزمایشی / دفتر معین. بخش G بند ۱ (خطوط ۸۷۹–۸۹۰).

### 2. Schema

زنده‌بازبینی‌شده: `journal_entries` **۱۱ ستون / ۱ ردیف** · `journal_lines` **۹ ستون / ۲ ردیف**.
محتوای زنده همان سند `payment_receipt` با دو خط `bank` / `customer_credit` است
(بخش G بند ۲، خطوط ۸۹۲–۹۰۴).

### 3. Business logic

تنها نویسندهٔ درج: `post_receipt_accounting` (idempotent با
`journal_entries_source_unique`). سمت بدهکار شاخه دارد و `external_party` را می‌نویسد —
مسیر **اجرانشده** است نه ناموجود (۴ فیش طرف‌خارجی هنوز pending). سمت بستانکار همچنان
همیشه `customer_credit`. نقل‌قول SQL در بخش G بند ۳ (خطوط ۹۰۶–۹۳۰).

### 4. Constraints

زنده‌بازبینی‌شدهٔ `journal_lines` CHECKها:

```
account_kind IN (customer_credit, bank, external_party, invoice_ar, clearing, other,
                 supplier_payable)   -- دلتا: supplier_payable نسبت به متن اصلی اضافه شده
debit >= 0 · credit >= 0
one_side (نه هر دو مثبت، نه هر دو صفر)
FK journal_entry_id → journal_entries ON DELETE CASCADE
```

**هیچ CHECK/تریگری مجموع بدهکار=بستانکار را الزام نمی‌کند.** تریگر روی `journal_lines`:
صفر. روی `journal_entries`: فقط `trg_asan_burn_journal_entry_number` (AFTER DELETE).
`(journal_entry_id, line_no)` یکتا نیست؛ `account_ref_id` بدون FK. جزئیات: بخش G بند ۴
(خطوط ۹۳۲–۹۶۴) + دلتای `supplier_payable`.

### 5. Built-but-unwired

`validate_journal_entry_balance(p_journal_entry_id)` موجود و درست است؛ بازبینی
`pg_depend` امروز **۰ caller**. هیچ تریگر/تابع/فراخوان فرانت (جز `types.ts` تولیدی).
همچنین `draft`/`void` در CHECK وضعیت مجازند ولی فقط `posted` نوشته شده و تابع ابطال
یافت نشد. بخش G بند ۵ (خطوط ۹۶۶–۹۹۳).

### 6. Duplication

مسیر A/B ثبت فیش (همان دامنهٔ E) · کدهای حسابداری تکراری روی سرآیند سند به‌عنوان
عکس‌برداری عمدی. بخش G بند ۶ (خطوط ۹۹۵–۱۰۰۰).

### 7. Bugs/gaps

| # | شدت | خلاصه |
|---|---|---|
| الف | 🔴 | بدون الزام توازن دوطرفه با وجود INSERT مستقیم RLS برای admin/accountant |
| ب | 🟠 | نگهبان توازن نوشته‌شده و وصل‌نشده |
| ج | 🟠 | بدون UI دفتر |
| د | 🟡 | `account_ref_id` بدون FK · `line_no` بدون یکتایی |
| ه | 🟡 | مقیاس: ۱ سند در برابر ده‌ها رویداد مالی دیگر که اصلاً سند نمی‌زنند |

### 8. role_permissions coverage

ماژول مستقلی به نام `journal` وجود ندارد. دسترسی عملی از طریق ماژول `accounting` است که
اکنون ۷ ردیف دارد (جدول بالا). RLS همچنان دروازهٔ جدول است
(`*_select_finance` / `*_insert|update_admin_accountant`). خروجی آسان از مسیر
`asan-export` می‌گذرد. ادعای قدیم «دفتر ماژول مجوز ندارد» از نظر نبودن ماژول
`journal` درست می‌ماند؛ از نظر صفر بودن `accounting` **منسوخ** است.

---

## جمع‌بندی Agent 7

- چک‌لیست رسمی هشت‌بندی برای E و G **اکنون صریحاً بسته است** (این بخش + متن تفصیلی قبلی).
- دو دلتای واقعی نسبت به گزارش اصلی: (۱) `supplier_payable` وارد CHECK شده،
  (۲) `role_permissions.accounting` از صفر به هفت ردیف رسیده.
- نقص‌های ساختاری E/G (beneficiary به سند نمی‌رسد، تخصیص quote در ثبت، نبود الزام توازن،
  UI دفتر، `validate_journal_entry_balance` بی‌سیم) **همچنان برقرارند** و با شواهد زنده
  تأیید شدند.
