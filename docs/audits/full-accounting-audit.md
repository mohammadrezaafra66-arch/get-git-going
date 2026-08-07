# ممیزی جامع حسابداری و اشخاص — AfraKala

**تاریخ:** ۲۰۲۶-۰۸-۰۷ · **مبنا:** `HEAD = 738aad69` · **دیتابیس:** `afrakala` روی `afrakala-lan-db`
**نوع:** فقط‌خواندنی. هیچ کد، مهاجرت یا داده‌ای تغییر نکرد.
**وضعیت:** موارد زمینه‌ای ۱–۵ **کامل**. دامنه‌های A–J **هنوز کامل نشده‌اند** —
`docs/audits/accounting-audit-progress.md` نقطهٔ دقیق ازسرگیری را دارد.

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

### بندهای باقی‌ماندهٔ چک‌لیست برای C

اسکیمای کامل `purchases`/`purchase_requests`/`purchase_items`، محدودیت‌ها، RLS، و پوشش
`role_permissions` هنوز اجرا نشده‌اند. فقط پرسش مسیرهای ثبت خرید (بخش سوم دستور مالک)
در این دور کامل شد.

---

### B, D, H, I, J

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
