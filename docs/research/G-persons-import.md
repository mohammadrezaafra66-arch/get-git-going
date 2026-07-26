# پکیج G — اشخاص، ایمپورت اکسل، خرید

**آیتم‌ها:** ۱۴۵، ۱۶۹، ۱۷۰، ۱۷۱، ۱۷۲
**برنچ سرور:** `feature/navigation-modernization` (HEAD `a9315e78`) — هر چه در working tree هست روی سرور است.

## خلاصهٔ پکیج (یک پاراگراف)

سه مدل موازی برای «شخص» در دیتابیس وجود دارد و هنوز یکپارچه نشده‌اند: `customers` (مشتری، دارای FK اختیاری `person_id`)، `suppliers` (تأمین‌کننده)، و `external_parties` (طرف حساب مالی/گیرندهٔ وجه). در کنار این‌ها یک مدل «پروندهٔ یکپارچهٔ شخص» به‌نام `persons` + جداول اقماری (`person_identifiers`، `person_context_links`، `person_field_values/definitions`) کاملاً ساخته و به UI وصل شده (مسیر `/persons`)، ولی این مدل فعلاً یک **لایهٔ پروفایلی مستقل** است: هیچ تراکنشی (خرید/فروش/فیش/پیش‌فاکتور) مستقیماً به `persons` FK ندارد و تنها پل عملیاتی‌اش (`customers.person_id` از طریق RPCهای `customer_set_person`/`customer_clear_person`) در بک‌اند موجود ولی **بدون هیچ UI** است. ایمپورت اکسل فقط برای **مشتریان** پیاده شده (`xlsx`/SheetJS، مسیر `/sales/customers/import`) و برای محصولات/اشخاص وجود ندارد. ثبت خرید از تأمین‌کننده کامل و کارکردی است (`/purchases/create` → جدول `purchases` + آینهٔ `purchase_items`). داده‌های واقعی: `persons=0`، `customers=6`، `customers_with_person=0`، `external_parties=1`، `suppliers=12`، `purchases=1`.

---

### آیتم ۱۶۹ — مدل «اشخاص»: تفاوت customers / external_parties / persons

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** یک مفهوم واحد «شخص» وجود ندارد؛ سه مدل موازی هستند (`customers`، `suppliers`، `external_parties`) به‌علاوهٔ یک مدل جدید یکپارچهٔ `persons` که فقط به‌عنوان لایهٔ پروفایل کنار مشتری می‌نشیند و هنوز به بقیهٔ تراکنش‌ها متصل نشده است. پل بین `customers` و `persons` در بک‌اند هست ولی UI ندارد.

**شواهد:**
- L3 (DB) — سه مدل مجزا:
  - `persons`: ستون‌های `id, kind(individual|organization), display_name, legal_name, visibility_scope, is_active, notes` (`\d persons`). دارای check constraint و RLS مبتنی بر `visibility_scope`.
  - `customers`: مدل مستقل با `name, phone, email, accounting_code, responsible_id …` و ستون **`person_id uuid`** با FK `customers_person_id_fkey → persons(id)` (اختیاری، nullable).
  - `external_parties`: مدل مستقل و کاملاً جدا (`full_name, national_id, phone, accounting_code, notes, is_active`) — **هیچ `person_id` ندارد**؛ فقط `payment_receipts.receiver_party_id` به آن ارجاع می‌دهد. یعنی «گیرندهٔ وجه» است، نه پروفایل عمومی.
  - `person_identifiers`: شناسه‌های نرمال‌شده (موبایل/کدملی/کداقتصادی/ایمیل/IBAN…) با یکتایی روی `(kind, value_normalized)`.
  - `person_context_links`: پل نرم بین یک شخص و «نقش»هایش؛ `context_kind` از یک enum ۱۸‌تایی (customer, supplier, driver, receiver, referrer, purchase_owner, sales_expert …) + جفت اختیاری `ref_table/ref_id`.
- L3 (DB) — توابع پیوند: `customer_set_person(p_customer_id, p_person_id, p_note)` و `customer_clear_person(p_customer_id, p_note)` (`pg_get_functiondef`). `customer_set_person` هم `customers.person_id` را ست می‌کند و **هم** یک ردیف فعال در `person_context_links` با `context_kind='customer', ref_table='customers', ref_id=<customer>` باز می‌کند؛ لینک‌های فعال قبلی را می‌بندد (invariant «هر مشتری ↔ یک شخص فعال»). `customer_clear_person` معکوسش را انجام می‌دهد.
- L2 (front) — این RPCها در `src/lib/customers/functions.ts:214,237` داخل server functionهای `linkCustomerToPerson` / `unlinkCustomerFromPerson` صدا زده می‌شوند، ولی **هیچ کامپوننت/مسیری این دو server function را import/صدا نمی‌زند** (grep روی `linkCustomerToPerson|unlinkCustomerFromPerson` در `*.tsx` = صفر؛ فرم ویرایش مشتری `_app.sales_.customers_.$customerId.edit.tsx` هیچ اشاره‌ای به `person_id`/PersonPicker ندارد). طبق قانون ۱ (کامپوننت/تابع بدون مصرف زنده = وجود ندارد) ⟹ پل customer↔person عملاً فقط بک‌اند است.
- L1 (UI) — مدل `persons` خودش کاملاً به UI وصل است: `/persons` فهرست (`_app.persons.tsx:83` کوئری روی جدول `persons`)، ساخت (`_app.persons_.create.tsx` → `createPerson`)، ویرایش (`_app.persons_.$personId.edit.tsx` که `PersonForm` + `PersonIdentifiersForm` + `PersonContextLinksForm` را mount می‌کند، خطوط ۲۰۱ و ۲۱۵).
- L4 (access) — `persons` در `role_permissions` seed شده: admin/manager (view+create+update)، sales/viewer/accountant فقط view. RLS جدول `persons`: insert/update فقط admin+manager، select بر اساس `visibility_scope`. هم‌راستا با UI (`canManage = hasAnyRole(['admin','manager'])`).

**شکاف نسبت به نیازمندی:** مفهوم «شخص» یکپارچه نیست؛ ۳ جدول موازی هستند. جدول `persons` هرچند به‌عنوان مدل یکپارچه طراحی شده، عملاً جزیره است: نه به UI مشتری/تأمین‌کننده/طرف‌حساب لینک می‌شود و نه هیچ تراکنشی به آن FK دارد. `external_parties` کاملاً خارج از این مدل مانده. داده هم صفر است (`persons=0`، `customers_with_person=0`).

**برنچ:** بله — همه روی سرور/nav هست.

**وابستگی‌ها:** آیتم ۱۷۲ مستقیماً بر این تحلیل سوار است.

**برای رفع چه لازم است:** یک UI برای اتصال مشتری به پروفایل شخص (فراخوانی `linkCustomerToPerson`/`unlinkCustomerFromPerson` که بک‌اندش آماده است) در فرم مشتری؛ تصمیم صریح دربارهٔ اینکه `suppliers` و `external_parties` هم باید به `persons` گره بخورند یا نه (فعلاً هیچ پلی ندارند)؛ و مهاجرت داده برای پرکردن `persons`.

**ریسک/پیچیدگی:** متوسط — بک‌اند پل آماده است ولی یکپارچه‌سازی کامل سه مدل و مهاجرت داده کار سنگینی است.

---

### آیتم ۱۴۵ / ۱۷۰ — ایمپورت اکسل

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** قابلیت ایمپورت اکسل فقط برای **مشتریان** وجود دارد و کامل و کارکردی است (SheetJS، نگاشت ستون، پیش‌نمایش، درج دسته‌ای، لاگ)؛ برای محصولات یا اشخاص/تأمین‌کننده هیچ ایمپورتی وجود ندارد.

**شواهد:**
- L3 (کتابخانه) — `package.json`: `"xlsx": "^0.18.5"` (همان SheetJS). تنها مصرف‌کننده: `src/shared/components/CustomerImportForm.tsx:91` با `const XLSX = await import("xlsx")` و `XLSX.read(...)` + `XLSX.utils.sheet_to_json(sheet, {header:1,…})` (خطوط ۹۲–۱۰۴).
- L1 (UI) — مسیر `/sales/customers/import` (`_app.sales.customers_.import.tsx:9`) که `CustomerImportForm` را mount می‌کند. فرم سه‌مرحله‌ای: انتخاب فایل `.xlsx/.xls` → نگاشت ستون‌ها (name*, phone, city, accounting_code, notes) با auto-guess بر اساس نام هدر → پیش‌نمایش ۵ ردیف → درج. سقف ۱۰۰۰ ردیف، دسته‌های ۵۰‌تایی.
- L2 (front) — درج مستقیم در جدول `customers` سطر‌به‌سطر: `supabase.from("customers").insert(payload)` (`CustomerImportForm.tsx:205`)؛ اعتبارسنجی نام/تلفن (`^09\d{9}$`)/کد حسابداری؛ سپس یک `audit_logs` با `action:"customers_imported"` (خط ۲۲۱). داده واقعی است، mock نیست.
- L4 (access) — `beforeLoad: requireAnyRole(["admin","accountant"])` (`_app.sales.customers_.import.tsx:11`). چون از role مستقیم استفاده می‌کند به seed ماژول وابسته نیست.
- جستجوی نبود: grep روی `ProductImport|product.*import`, و `ls src/routes | grep import` ⟹ تنها یک مسیر import کل پروژه: همان `_app.sales.customers_.import.tsx`. هیچ ایمپورت محصول/شخص/تأمین‌کننده وجود ندارد.

**شکاف نسبت به نیازمندی:** ایمپورت فقط مشتری را پوشش می‌دهد. اگر نیازمندی ایمپورت محصولات یا اشخاص (`persons`) بوده، وجود ندارد. همچنین ایمپورت مشتری، `person_id` را پر نمی‌کند (فقط ردیف `customers` می‌سازد).

**برنچ:** بله.

**وابستگی‌ها:** به مدل `customers` و ستون `accounting_code` (یکتا) وابسته است.

**برای رفع چه لازم است:** اگر نیاز به ایمپورت اشخاص/محصولات است، یک فرم مشابه با نگاشت ستون و درج در جدول هدف ساخته شود (زیرساخت SheetJS و الگوی UI موجود قابل استفادهٔ مجدد است).

**ریسک/پیچیدگی:** پایین — الگوی کامل و آماده برای تکرار روی موجودیت دیگر.

---

### آیتم ۱۷۱ — ثبت خرید از تأمین‌کننده

**وضعیت:** ✅ کامل

**پاسخ کوتاه:** ثبت خرید تک‌محصولی از تأمین‌کننده کامل و کارکردی است: مسیر `/purchases/create`، فرم کامل، درج در جدول `purchases` و آینه‌شدن در `purchase_items`.

**شواهد:**
- L3 (DB) — جداول موجود: `purchases` (ستون‌های `supplier_id → suppliers`, `product_id`, `purchase_price`, `currency`, `quantity`, `purchase_date`, `payment_term_id`, `cash_price`, `total_amount`, `status`, `paid_at/paid_by`)، `purchase_items` (FK `purchase_id → purchases ON DELETE CASCADE`)، و `purchase_requests` (جریان درخواست خرید مجزا با `inquiry_id`, `status`, ...). `information_schema.tables` هر سه را تأیید می‌کند.
- L1 (UI) — `_app.purchases_.create.tsx` → `PurchaseForm`. لیست خرید هنوز نیست (`_app.purchases.tsx` فقط EmptyState دارد: «لیست خریدها در فاز بعدی اضافه می‌شود»).
- L2 (front) — `PurchaseForm.tsx:165` مستقیماً `supabase.from("purchases").insert({...})` سپس `supabase.from("purchase_items").insert({...})` (خط ۱۸۷، کامنت «Mirror as a purchase_items line so existing reports keep working»). تأمین‌کننده از `suppliers` (فعال)، محصول از `products`، زمان تسویه از `payment_terms`. تأمین‌کننده اختیاری است (مقدار `__none__` → null). **توجه:** مسیر درج از طریق RPC `create_purchase_request` نیست — درج مستقیم دو جدولی است (بدون transaction اتمیک واحد؛ اگر درج دوم شکست بخورد، سطر `purchases` یتیم می‌ماند).
- L4 (access) — `beforeLoad: requirePermission("purchases","create")` (`_app.purchases_.create.tsx:11`). در `role_permissions`، create برای admin/manager/sales/purchasing_expert=true. **اما** دکمهٔ «ثبت خرید جدید» در `_app.purchases.tsx:17` داخل `RoleGuard roles={["admin","manager"]}` است و RLS جدول `purchases` (policy «manager admin write purchases») INSERT را فقط برای admin/manager می‌دهد ⟹ sales/purchasing_expert از گارد مسیر رد می‌شوند ولی در عمل نه دکمه می‌بینند نه RLS اجازهٔ درج می‌دهد. عدم‌تطابق ملایم، نه بلاک‌کننده برای admin/manager.

**شکاف نسبت به نیازمندی:** خودِ ثبت خرید کامل است. کمبودها: لیست/جستجوی خریدها نیست؛ درج غیراتمیک؛ عدم‌تطابق دسترسی sales/purchasing_expert بین `role_permissions` و RLS.

**برنچ:** بله.

**وابستگی‌ها:** `suppliers`, `products`, `payment_terms`. تریگرهای گیمیفیکیشن روی درج/پرداخت (`award_buyer_purchase_score`, `award_accountant_payment_score`).

**برای رفع چه لازم است:** افزودن صفحهٔ لیست خرید؛ در صورت نیاز، تبدیل درج دو جدولی به یک RPC اتمیک؛ هم‌سوکردن دسترسی create با RLS.

**ریسک/پیچیدگی:** پایین — مسیر اصلی کار می‌کند؛ اصلاحات تکمیلی جزئی‌اند.

---

### آیتم ۱۷۲ — ماتریس عملیات به‌ازای هر نوع شخص

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** هر «نوع شخص» فقط برای عملیاتی که جدول تراکنشش به آن FK دارد در دسترس است؛ هیچ نوعی همهٔ عملیات را ندارد و مدل یکپارچهٔ `persons` عملاً به هیچ تراکنشی مستقیماً وصل نیست.

**شواهد (FKهای واقعی):**
- خرید ⟵ `purchases.supplier_id → suppliers` (فقط تأمین‌کننده).
- فروش/فاکتور ⟵ `invoices.customer_id → customers` (فقط مشتری).
- دریافت/فیش واریزی ⟵ `payment_receipts.customer_id → customers` (پرداخت‌کننده) و `payment_receipts.receiver_party_id → external_parties` (گیرندهٔ وجه).
- پرداخت ⟵ `purchases.paid_at/paid_by` (تسویهٔ خرید تأمین‌کننده)؛ رکورد پرداخت مستقلِ عمومی وجود ندارد.
- پیش‌فاکتور ⟵ `sales_quotes.customer_id → customers` (فقط مشتری).
- `persons`: هیچ‌کدام از جداول بالا به `persons` FK ندارند؛ تنها ارتباط، `customers.person_id` و لینک نرم `person_context_links(ref_table, ref_id)` است — توصیفی، نه محرک تراکنش.

**ماتریس:**

| نوع شخص | خرید | فروش/فاکتور | دریافت (فیش واریزی) | پرداخت | پیش‌فاکتور |
|---|---|---|---|---|---|
| **customer** (مشتری) | ❌ (در `purchases` FK ندارد) | ✅ `invoices.customer_id` | ✅ `payment_receipts.customer_id` (پرداخت‌کننده) | ❌ | ✅ `sales_quotes.customer_id` |
| **supplier** (تأمین‌کننده) | ✅ `purchases.supplier_id` | ❌ | ❌ (هیچ FK فیش) | ✅ `purchases.paid_at/paid_by` (تسویهٔ خرید) | ❌ |
| **external_party** (طرف حساب) | ❌ | ❌ | ✅ `payment_receipts.receiver_party_id` (فقط به‌عنوان گیرنده) | ❌ (رکورد پرداخت خروجی مجزا ندارد) | ❌ |
| **person** (پروفایل یکپارچه) | ❌ مستقیم | ❌ مستقیم | ❌ مستقیم | ❌ مستقیم | ❌ مستقیم |

نکته دربارهٔ ردیف person: تنها مسیر غیرمستقیم، `customers.person_id` است (اگر پر شود، شخص = مشتری و ستون‌های customer را می‌گیرد)، ولی UI پرکردن این لینک وجود ندارد (آیتم ۱۶۹، L2). پس در عمل تمام سلول‌های ردیف person «❌ مستقیم» هستند.

**شکاف نسبت به نیازمندی:** اگر انتظار این بوده که یک «شخص» واحد بتواند هم‌زمان مشتری/تأمین‌کننده/طرف‌حساب باشد و همهٔ عملیات را انجام دهد، این یکپارچگی وجود ندارد؛ هر عملیات به جدول مخصوص خودش قفل است.

**برنچ:** بله.

**وابستگی‌ها:** کاملاً بر آیتم ۱۶۹ سوار است.

**برای رفع چه لازم است:** اگر هدف «شخص یکپارچهٔ قابل‌تراکنش» است، جداول تراکنشی (`purchases`, `invoices`, `sales_quotes`, `payment_receipts`) باید به `persons` (یا از طریق `person_context_links`) گره بخورند و UI اتصال ساخته شود؛ کار معماری بزرگ است.

**ریسک/پیچیدگی:** بالا — نیازمند بازطراحی مدل ارتباط اشخاص با تراکنش‌ها و مهاجرت داده.

---

## روش جستجو (برای شفافیت)

- وجود جداول: `information_schema.tables` روی مجموعهٔ ۱۹ جدول؛ `\d` روی `persons, customers, external_parties, person_context_links, person_identifiers, purchases, purchase_requests, suppliers`.
- توابع: `pg_proc` + `pg_get_functiondef` برای `customer_set_person`, `customer_clear_person`.
- ستون‌های `payment_receipts`, `sales_quotes`, `invoices` از `information_schema.columns`.
- کتابخانهٔ ایمپورت: grep روی `xlsx|SheetJS|sheet_to_json` در `src` + `package.json`؛ `ls src/routes | grep import`.
- مصرف UI: Grep روی `linkCustomerToPerson|unlinkCustomerFromPerson|person_id|PersonPicker|searchPersons` در `*.tsx` (برای اثبات نبود پل customer↔person در UI).
- دسترسی: `role_permissions` برای ماژول‌های `persons`, `purchases`؛ RLS از خروجی `\d`.
- شمارش داده: `SELECT count(*)` روی persons/customers/external_parties/suppliers/purchases و customers با person_id غیرnull.
