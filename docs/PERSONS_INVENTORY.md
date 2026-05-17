# PERSONS_INVENTORY — AFRA-20260517-PERSONS-U01-S02

سند فقط مستندسازی. این فایل تنها خروجی مجاز این Step است. هیچ تغییر کد/DB/UI انجام نشده.

مرجع پلن مرتبط: `.lovable/plan.md` (AFRA-20260517-PERSONS-U01-S01).
مرجع پذیرش: `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`.

---

## 1. جداول DB مرتبط (public schema)

| جدول | هدف کسب‌وکار | ستون‌های کلیدی | FK مرئی | شبه‌person؟ | ریسک parallel-path | وضعیت RLS |
|---|---|---|---|---|---|---|
| `customers` | هویت مشتریان فروش | name, phone, email, address, city, tax_id, accounting_code, link_group, responsible_id, birth_date, notes, is_active | responsible_id → auth user | بله (هسته‌ی person فعلی برای مشتری) | بالا — موازی با suppliers و profiles | RLS فعال — `manage customers by role` (ALL), `read customers by role` (SELECT) |
| `suppliers` | هویت تأمین‌کنندگان | name, phone, email, address, city, contact_name, trust_level, status, created_by, is_active | created_by → auth user | بله | **بحرانی** — دو policy افزونه‌ی permissive به همه‌ی authenticated اجازه‌ی SELECT می‌دهند (طبق گزارش STEP-00) | RLS فعال اما نشتی: `all authenticated read suppliers`, `suppliers_select_authed`, کنار `suppliers_select_dynamic` |
| `product_suppliers` | نگاشت N:N محصول↔تأمین‌کننده | product_id, supplier_id | به products/suppliers | غیرمستقیم (لو می‌دهد supplier_id) | بالا — `ps_select_authed` به sales/viewer نشت می‌دهد | RLS فعال نشتی |
| `profiles` | mirror کاربران سیستم (auth) | full_name, phone, status, position, avatar_url, registered_at, birth_date | id ↔ auth.users.id | بله، اما فقط برای کاربران داخلی | متوسط — overlap مفهومی با persons، اما تغییر آن خطرناک برای auth | RLS فعال: read/update own + admin all |
| `profile_field_definitions` | تعریف فیلدهای پویای پروفایل کاربر | name, label, field_type, options, is_required, is_active, show_on_register, sort_order, help_text | — | الگوی قابل بازاستفاده برای persons | کم — جدا از person، فقط الگوست | RLS فعال (نیاز به تأیید policy نام دقیق در فاز ۱) |
| `profile_field_values` | مقادیر فیلدهای پویای کاربر | user_id, field_name, value (jsonb) | user_id → auth.users | — | کم | RLS فعال + RPC `set_profile_field_value` security definer |
| `user_roles` | تخصیص نقش RBAC | user_id, role (app_role enum), assigned_by, assigned_at | user_id → auth.users | خیر | — | RLS فعال: `admins manage roles` (ALL), `admins read all roles`, `users read own roles` |
| `audit_logs` | لاگ تغییرات حساس | actor_id, entity_type, entity_id, diff | actor_id → auth.users | خیر | — | RLS فعال: `admins read audit logs` (SELECT), `system inserts audit logs` (INSERT) |
| `waybills` | بارنامه/ارسال | sender_name, sender_phone, receiver_name, receiver_phone, customer_accounting_code, shipping_company, destination_*, status | invoice_id → invoices | **بله ولی text آزاد** — sender/receiver/driver به‌جای person FK | **بحرانی** — مهم‌ترین منبع DB کثیف، تکثیر شخص بدون شناسه | RLS باید در فاز ۱ صریحاً audit شود |
| `invoices` | پیش‌فاکتور/فاکتور فروش | customer_id, sale_price_type_id, settlement_type_id | customer_id → customers | از طریق customer | کم — به‌درستی FK دارد | RLS فعال (نیاز به تأیید policyها در فاز ۱) |
| `sales_quotes` | پیش‌فاکتورهای فروش | **customer_name (text), customer_phone (text), customer_note**, salesperson_id | salesperson_id → auth.users | **بله ولی text آزاد** — هیچ customer_id ندارد | **بحرانی** — تکثیر مشتری بدون لینک به `customers` | RLS فعال (نیاز به audit policyها در فاز ۱) |
| `purchases` | خرید از تأمین‌کننده | supplier_id, product_id, payment_term_id | supplier_id → suppliers | از طریق supplier | بالا — policy `all authenticated read purchases` نشتی است (طبق STEP-00) | RLS فعال نشتی |
| `purchase_prices` | قیمت خرید معتبر | supplier_id, product_id, reason_id | به suppliers/products | — | بالا — `owners_select_purchase_prices` صریحاً sales را OR می‌کند (نشت supplier_id) | RLS فعال نشتی |
| `customer_credit_profile` | پروفایل اعتبار مشتری | customer_id (PK)، total_paid | customer_id → customers | از طریق customer | کم | RLS فعال (نیاز به audit در فاز ۱) |
| `customer_credit_balance` | مانده اعتبار | customer_id | customer_id → customers | — | کم | RLS فعال |
| `customer_credit_ledger` | تراکنش‌های اعتبار | customer_id, reference_id | customer_id → customers | — | کم | RLS فعال |
| `customer_capital_allocations` | تخصیص سرمایه به مشتری | customer_id, salesperson_id, salesperson_allocation_id, capital_snapshot_id, customer_score, total_customer_score | customer_id, salesperson_id | — | کم | RLS فعال |
| `salesperson_capital_allocations` | تخصیص سرمایه به فروشنده | salesperson_id, capital_snapshot_id | salesperson_id → auth.users/profiles | — | کم — اما اگر روزی salesperson_id باید به person لینک شود، در فاز ۸ بررسی | RLS فعال |

یافته‌ی اصلی: سه نوع «شخصیت ذخیره‌شده» همزمان وجود دارد —
(۱) FK ساختاریافته (`customers`, `suppliers`, `profiles`)،
(۲) text آزاد (`waybills.sender/receiver_*`, `sales_quotes.customer_*`)،
(۳) auth user mirror (`profiles`).
هرسه باید در آینده به یک `persons` متصل شوند، اما هیچ‌کدام در این Step تغییر نمی‌کند.

---

## 2. مسیرها/کامپوننت‌ها/هوک‌ها/سرویس‌های مرتبط

### مشتریان
- `src/routes/_app.sales_.customers.tsx`
- `src/routes/_app.sales_.customers_.create.tsx`
- `src/routes/_app.sales_.customers_.$customerId.edit.tsx`
- `src/routes/_app.sales_.customers_.$customerId.credit.tsx`
- `src/routes/_app.sales.customers_.import.tsx`
- `src/routes/_app.sales.credit-customers.tsx`
- `src/routes/_app.accounting.customer-capital-allocations.tsx`
- `src/shared/components/CustomerForm.tsx`
- `src/shared/components/CustomerImportForm.tsx`
- `src/shared/components/QuickAddCustomerDialog.tsx`

### تأمین‌کنندگان
- `src/routes/_app.suppliers.tsx`
- `src/routes/_app.suppliers_.$supplierId.tsx`
- `src/shared/components/SupplierForm.tsx`
- `src/shared/components/SupplierReferralModal.tsx`
- `src/shared/components/ProductSupplierManager.tsx`

### فیلدهای پویای پروفایل (الگوی قابل بازاستفاده)
- `src/lib/profile-fields/queries.ts`
- `src/lib/profile-fields/types.ts`
- `src/components/profile/DynamicProfileFields.tsx`

### فرم‌های اسناد عملیاتی
- `src/shared/components/WaybillForm.tsx` (gateway کثیف‌ترین داده)
- `src/shared/components/WaybillCustomFieldsInput.tsx`
- `src/shared/components/InvoiceForm.tsx`
- `src/shared/components/PurchaseForm.tsx`
- `src/shared/components/PaymentReceiptForm.tsx`
- `src/shared/components/AdvancePaymentSection.tsx`
- `src/components/accounting/PaymentReceiptDocuments.tsx`

### پیش‌فاکتورها/سهمیه‌ها
- `src/lib/sales/quotes.ts`, `quote-pdf.ts`, `quote-send-queue.ts`, `quote-share.ts`
- `src/components/sales/quotes/*`

### RBAC و دسترسی
- `src/lib/rbac/roles.ts`
- `src/lib/rbac/route-guards.ts`
- `src/lib/rbac/dynamic-permissions.ts`
- `src/lib/rbac/permissions-cache.ts`
- `src/components/rbac/RoleGuard.tsx`
- `src/lib/auth/AuthProvider.tsx`, `session.ts`, `diagnostics.ts`

### کلاینت Supabase
- `src/integrations/supabase/client.ts` (browser)
- `src/integrations/supabase/client.server.ts` (service role — server only)
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/auth-attacher.ts`

### Audit — utility مستقل ندارد
لاگ audit امروز با INSERT مستقیم/تریگر در سطح DB انجام می‌شود؛ helper سراسری فرانت برای آن یافت نشد. این موضوع در فاز ۱ باید مستند شود.

---

## 3. Migrations مرتبط

نام فایل migrationها در این پروژه با hash تولید می‌شود و keyword دامنه‌ای ندارد، بنابراین گروه‌بندی بر اساس بازه‌ی تاریخ ارائه می‌شود. مرور دقیق محتوای هر فایل در فاز ۱ پیش از طراحی schema لازم است.

- بنیادی (customers, suppliers, profiles, user_roles, RLSهای اولیه): مهاجرت‌های با timestamp `20260424*`, `20260426*`, `20260427*`.
- audit_logs و policyهای حساس: `20260429*`.
- توسعه‌ی purchases, purchase_prices, recent_purchase: `20260430*`, `20260501*`, `20260506*`.
- credit/customer finance (customer_credit_*, capital_allocations): در بازه‌ی `20260427*` و `20260430*` پراکنده‌اند.
- آخرین migration مرتبط شناسایی‌شده در ریشه: `20260506200000_batch_recent_purchase_labels.sql`.

در فاز ۱، فهرست دقیق فایل‌به‌فایل با grep ساختارهای `CREATE TABLE customers/suppliers/profiles/...` تولید و به این سند پیوست می‌شود. **در این Step فقط فهرست‌بندی شد، محتوا تحلیل نشد.**

---

## 4. RLS / policies / functions موجود

### توابع امنیتی هسته (security definer)
- `public.has_role(_user_id uuid, _role app_role) returns bool`
- `public.has_any_role(_user_id uuid, _roles app_role[]) returns bool`
- `public.has_dynamic_permission(_user_id uuid, _module text, _action text) returns bool`
- `public.set_profile_field_value(_user_id uuid, _field_name text, _value jsonb)` — RPC مصرف‌شده در فرانت

### Policies تأیید‌شده (نمونه‌گیری از pg_policies)
- `customers`: `manage customers by role` (ALL), `read customers by role` (SELECT)
- `suppliers`: `manager admin write suppliers` (ALL), `suppliers_insert_privileged`, `suppliers_update_privileged`, `suppliers_delete_privileged`, `suppliers_select_dynamic` (✅), `suppliers_select_authed` (🔴 نشت), `all authenticated read suppliers` (🔴 نشت)
- `product_suppliers`: `ps_write_privileged` (ALL), `ps_select_authed` (🔴 نشت)
- `profiles`: `users read own profile`, `users update own profile`, `admins read all profiles`, `admins update all profiles`
- `user_roles`: `admins manage roles` (ALL), `admins read all roles`, `users read own roles`
- `audit_logs`: `admins read audit logs` (SELECT), `system inserts audit logs` (INSERT)

### Audit triggers/functions
در نمونه‌برداری این Step تابع تریگر سراسری «log_audit» یافت نشد؛ احتمال INSERT دستی از داخل RPCهای دیگر بالاست. تأیید قطعی به فاز ۱ موکول می‌شود.

---

## 5. Collision map

| تصادم | source of truth فعلی | لینک هدف به persons | ریسک | migrate ایمن؟ | بازبینی دستی؟ |
|---|---|---|---|---|---|
| `customers` ↔ `suppliers` (یک نهاد ممکن است هم خریدار هم فروشنده باشد) | دو ردیف مستقل بدون پل | یک `persons.id` با دو `person_context_links` (customer, supplier) | بالا | بله، با backfill idempotent و عدم auto-merge | بله — merge باید با تأیید ادمین انجام شود |
| `customers`/`suppliers` ↔ `profiles` (یک کارمند که هم کاربر سیستم است هم در فاکتور خریدار) | جزیره‌های جدا | اختیاری: `profiles.person_id` در فاز ۸ | متوسط | بله، nullable | بله — تأثیر روی auth |
| `waybills.sender_name/phone`, `receiver_name/phone` | text آزاد | `sender_person_id`, `receiver_person_id`, `driver_person_id` با حفظ snapshot text | بالا (داده‌ی تاریخی نویزی) | بله، nullable + opt-in | بله — backfill باید با dry-run باشد |
| `sales_quotes.customer_name/phone/note` | text آزاد، بدون customer_id | افزودن `customer_id` (یا مستقیم `person_id`) با حفظ text snapshot | بالا | بله، nullable | بله — تأیید محصولی |
| `invoices.customer_id` | FK به customers | غیرمستقیم از طریق `customers.person_id` | کم | بله، تغییر نمی‌خواهد | خیر |
| `purchases.supplier_id`, `purchase_prices.supplier_id` | FK به suppliers | غیرمستقیم از طریق `suppliers.person_id` | کم در ساختار، **بالا در RLS** (موارد STEP-00) | بله، اما اول باید RLS قفل شود | بله |
| `product_suppliers.supplier_id` | FK به suppliers | غیرمستقیم | بالا در RLS | بله | بله |
| `customer_credit_*`, `customer_capital_allocations` | FK به customers | غیرمستقیم | کم | بله، تغییر نمی‌خواهد | خیر |
| `salesperson_capital_allocations.salesperson_id` | FK به auth user/profiles | اختیاری در فاز ۸ | کم | بله | خیر |

منبع نشت محرمانگی (مطابق پلن STEP-00) همچنان معتبر است و **پیش‌نیاز** هر گام persons محسوب می‌شود.

---

## 6. Non-goals (صریح)

این سند به‌هیچ‌وجه موارد زیر را تأیید یا فعال نمی‌کند:
- ساخت جدول `persons` یا هر جدول مرتبط (`person_context_links`, `person_field_*`, `person_identifiers`).
- افزودن ستون `person_id` به `customers`, `suppliers`, `profiles`, `waybills`, `sales_quotes` یا هر جدول دیگر.
- merge یا dedupe خودکار میان `customers` و `suppliers`.
- هیچ تغییر RLS، policy، function، یا trigger.
- هیچ تغییر UI، route، component، hook، یا فرم.
- نصب هیچ dependency جدید (از جمله libphonenumber-js یا مشابه).
- هیچ تغییر کانفیگ self-host، Docker، یا Supabase config.
- هیچ تغییر RBAC یا helper نقش‌ها.

---

## 7. چک‌لیست پذیرش پیش‌نیاز برای فاز ۱ (schema design)

قبل از اجرای فاز ۱ از پلن S01 (ساخت `persons` + `person_context_links` + RLS)، موارد زیر باید مستندسازی شده و توسط ذی‌نفع تأیید شوند:

- [ ] **RLS matrix کامل نوشته شود** برای persons و person_context_links: ماتریس نقش×عمل (admin/manager/accountant/sales/viewer × SELECT/INSERT/UPDATE/DELETE) با شرط دقیق هر سلول.
- [ ] **رفتار audit مشخص شود**: کدام عملیات (create/update/delete/merge/link/unlink/field_value_change) چه entity_type/diff/severity تولید می‌کند و آیا از تریگر یا RPC.
- [ ] **rollback plan صریح**: هر migration یا CREATEای که اضافه می‌شود باید DROP معکوس idempotent داشته باشد و backfill قابل برگشت بماند.
- [ ] **هیچ امنیت فرانت-only**: تأیید مکتوب که هر visibility از طریق RLS سرور پیاده می‌شود.
- [ ] **هیچ وابستگی بحرانی خارجی**: اگر normalize تلفن لازم شد، یا از regex داخلی یا از پکیج local-bundleable استفاده شود (بدون CDN/خدمات خارجی).
- [ ] **self-host acceptance همچنان معتبر**: تأیید با `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`، شامل سازگاری با backup/restore و Docker.
- [ ] **عدم ذخیره‌ی نقش در `profiles`/`users`**: تأیید رسمی که هیچ ستون نقشی روی persons یا person_context_links اضافه نمی‌شود؛ نقش فقط در `user_roles` با `has_role()`.
- [ ] **پیش‌نیاز امنیتی STEP-00 اجرا شده باشد**: قبل از فاز ۱، فیکس RLS suppliers/product_suppliers/purchases/purchase_prices باید روی staging سبز شده باشد؛ در غیر این صورت ساخت persons می‌تواند نشت supplier را تشدید کند.
- [ ] **استراتژی dedupe (warn/block) توسط محصول تأیید شده باشد** (سؤال F-4 از پلن S01).
- [ ] **partial unique indexes پیشنهادی** فقط روی شناسه‌های قطعی (national_id/e164 phone) و فقط برای status='confirmed' مستند شوند.
- [ ] **بازنگری دقیق فهرست migrations فاز ۳ این سند** (نگاشت hash→دامنه) قبل از طراحی schema.

---

## خلاصه برای تحویل

- **Summary**: تمام جداول، فایل‌ها، migrations (به‌صورت بازه‌ای)، policyها و توابع امنیتی مرتبط با مفهوم person فهرست شدند؛ collision map شامل سه نوع تصادم (FK، text آزاد، auth mirror) ساخته شد؛ non-goals صریح و چک‌لیست پیش‌نیاز فاز ۱ نوشته شد.
- **فایل تغییر یافته**: فقط `docs/PERSONS_INVENTORY.md` (ایجاد جدید).
- **تأیید**: هیچ فایل DB، migration، route، component، hook، RLS، یا UI تغییر نکرده. هیچ dependency نصب نشده.
- **Blocker شناسایی‌شده**: تا زمانی که فیکس امنیتی STEP-00 روی staging سبز نشده، فاز ۱ persons نباید آغاز شود.

## Self-host acceptance check

- بدون وابستگی CDN/خارجی ✅
- بدون secret ✅
- بدون تغییر Docker/Supabase config ✅
- بدون migration ✅
- بدون تغییر RLS/RBAC ✅
- سازگار با backup/restore (فقط فایل docs) ✅