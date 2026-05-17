# PERSONS_SCHEMA_DESIGN — AFRA-20260517-PERSONS-U01-S02

| فیلد | مقدار |
|---|---|
| Task ID | AFRA-20260517-PERSONS-U01-S02 |
| Builder | محمدرضا افرا |
| Builder ID | U01 |
| Phase | Phase 2 — Persons Core and Unified Person Record |
| Status | **Draft — در انتظار تأیید U01** |
| Mode | Documentation only (هیچ کد/SQL/RLS/UI تغییر نمی‌کند) |
| مراجع | `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`, `docs/PERSONS_INVENTORY.md`, `.lovable/plan.md` |

> این سند فقط طراحی پیشنهادی است. هیچ migration، policy، route، component، hook، service یا dependency در این Step ایجاد یا تغییر نکرده است. اجرای واقعی پس از تأیید U01 و در Stepهای S03+ انجام خواهد شد.

---

## 1. اصول طراحی (Design Principles)

1. **یک هویت یکپارچه**: هر شخص (انسان یا شرکت) دقیقاً یک ردیف در `persons` دارد. هیچ جدول هویتی موازی (driver, complainant, referrer, marketer, representative, returner, …) ساخته نمی‌شود.
2. **Context links به‌جای جدول جدید**: نقش‌های کسب‌وکاری (مشتری، تأمین‌کننده، راننده، فرستنده، گیرنده، معرف، شاکی، …) به‌صورت لینک در `person_context_links` ثبت می‌شوند.
3. **نقش‌های سیستمی (RBAC) روی person ذخیره نمی‌شوند**. نقش‌های دسترسی نرم‌افزار همچنان فقط در `public.user_roles` با تابع `has_role()` بررسی می‌شوند.
4. **بدون auto-merge**: ادغام دو person خودکار اتفاق نمی‌افتد. حتی اگر شناسه‌ها مشابه باشند، حداکثر هشدار/پیشنهاد به ادمین داده می‌شود.
5. **بدون migration مخرب**: هیچ DROP/RENAME/مهاجرت داده‌ی اجباری روی `customers`, `suppliers`, `profiles`, `waybills`, `sales_quotes` انجام نمی‌شود.
6. **حفظ snapshotهای متنی موجود**: ستون‌های متنی مثل `waybills.sender_name/phone`, `sales_quotes.customer_name/phone/note` حذف یا تغییر نام داده نمی‌شوند؛ صرفاً ستون `*_person_id` nullable در کنارشان اضافه می‌شود.
7. **سازگاری Self-host**: تمام تصمیم‌ها با Linux + Docker + Supabase Self-host و backup/restore Postgres سازگار است. هیچ وابستگی CDN/خارجی/cloud-only اضافه نمی‌شود.
8. **امنیت با لایه‌های چندگانه**: UI guard + route/server guard + RLS/RBAC در DB. مخفی‌سازی صرفاً در فرانت ممنوع است.
9. **Phase 1 قفل است**: اصلاح suppliers/product_suppliers/purchases/purchase_prices RLS leaks **پیش‌نیاز سخت** ساخت persons core است (S03 قبل از S04).

---

## 2. خلاصه‌ی پیاده‌سازی موجود (بر اساس PERSONS_INVENTORY)

| دامنه | وضعیت فعلی | اشکال موجود |
|---|---|---|
| `customers` | FK ساختاریافته با RLS صحیح | تنها هویت رسمی مشتری؛ ولی موازی با suppliers برای افراد دو-نقشی |
| `suppliers` | FK ساختاریافته اما با policyهای نشتی (`all authenticated read suppliers`, `suppliers_select_authed`) | افشای supplier_id به نقش‌های غیرمجاز |
| `product_suppliers` | `ps_select_authed` نشتی | افشای رابطه‌ی محصول↔تأمین‌کننده |
| `purchases`, `purchase_prices` | `all authenticated read purchases`, `owners_select_purchase_prices` با OR sales | افشای supplier_id و قیمت خرید |
| `profiles` | mirror کاربران auth، RLS سالم | مفهومی با person همپوشانی دارد ولی فعلاً جدا نگه داشته می‌شود |
| `profile_field_definitions` / `profile_field_values` + RPC `set_profile_field_value` | الگوی سالم فیلد پویا با security definer | الگوی مرجع برای person fields |
| `waybills.sender_*/receiver_*` | text آزاد بدون FK | کثیف‌ترین منبع داده‌ی person |
| `sales_quotes.customer_name/phone/note` | text آزاد بدون customer_id | تکثیر هویت مشتری |
| `audit_logs` | RLS صحیح، INSERT از system | الگوی مرجع برای audit person |
| `user_roles` + `has_role` / `has_any_role` / `has_dynamic_permission` | پایدار | باید برای RLS person بدون تغییر استفاده شود |

---

## 3. ERD مفهومی پیشنهادی

```text
                    ┌─────────────────────┐
                    │      persons        │  (هسته‌ی هویت)
                    │ id (uuid PK)        │
                    │ kind (individual|   │
                    │       organization) │
                    │ display_name        │
                    │ visibility_scope    │
                    │ is_active           │
                    │ created_by/at, …    │
                    └─────────┬───────────┘
                              │ 1
        ┌─────────────────────┼──────────────────────┬───────────────────────┐
        │ N                   │ N                    │ N                     │ N
┌───────▼────────────┐ ┌──────▼─────────────┐ ┌──────▼────────────────┐ ┌────▼────────────────┐
│ person_identifiers │ │ person_field_values│ │ person_context_links  │ │ (links nullable از  │
│ id, person_id      │ │ id, person_id      │ │ id, person_id         │ │ جداول موجود)        │
│ kind (enum)        │ │ field_definition_id│ │ context_kind (enum)   │ │ customers.person_id │
│ value_raw          │ │ value (jsonb)      │ │ ref_table, ref_id     │ │ suppliers.person_id │
│ value_normalized   │ └──────┬─────────────┘ │ started_at, ended_at  │ │ waybills.sender_..  │
│ status (enum)      │        │               │ note                  │ │ waybills.receiver.. │
│ verified_at/by     │        │               └───────────────────────┘ │ waybills.driver_..  │
└────────────────────┘        │                                         │ sales_quotes        │
                              │                                         │      .customer_..   │
                       ┌──────▼────────────────┐                        └─────────────────────┘
                       │ person_field_         │
                       │ definitions           │
                       │ name, label, type,    │
                       │ options, is_required, │
                       │ is_active, sort_order │
                       └───────────────────────┘
```

**نکته‌ی صریح**: هیچ ستون متنی موجود حذف یا rename نمی‌شود. ستون‌های `*_person_id` همگی **nullable** اضافه خواهند شد (در Stepهای S09–S11) و backfill اختیاری و idempotent خواهد بود.

---

## 4. جداول و ستون‌های پیشنهادی

### 4.1 `persons`
- **هدف**: هسته‌ی واحد هویت برای هر فرد/سازمان.
- **ستون‌های مهم**:
  - `id uuid PK default gen_random_uuid()`
  - `kind text NOT NULL` — enum-like: `individual` | `organization`
  - `display_name text NOT NULL`
  - `legal_name text NULL` (برای organization)
  - `visibility_scope text NOT NULL DEFAULT 'internal_general'`
  - `is_active boolean NOT NULL DEFAULT true`
  - `notes text NULL`
  - `created_by uuid NULL REFERENCES auth.users(id)`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
- **ایندکس**: `(is_active)`, `(visibility_scope)`, `(kind)`, trigram روی `display_name` در صورت نیاز جست‌وجو (تصمیم آن در S04).
- **RLS**: enable. SELECT بر اساس `visibility_scope` + `has_any_role()`. write فقط برای admin/manager.
- **Audit**: `person.create`, `person.update`, `person.visibility_change`.

### 4.2 `person_identifiers`
- **هدف**: شناسه‌های قابل اعتبارسنجی (موبایل، ملی، اقتصادی، ثبت شرکت، ایمیل، …).
- **ستون‌های مهم**:
  - `id uuid PK`
  - `person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE`
  - `kind text NOT NULL` (enum: mobile_e164, landline, national_id_ir, tax_id_ir, company_reg_id_ir, email, iban, custom)
  - `value_raw text NOT NULL`
  - `value_normalized text NOT NULL`
  - `status text NOT NULL DEFAULT 'provisional'` (provisional | confirmed | revoked)
  - `is_primary boolean NOT NULL DEFAULT false`
  - `verified_at timestamptz NULL`, `verified_by uuid NULL`
  - `created_at/by`, `updated_at`
- **ایندکس و constraint**:
  - `UNIQUE (kind, value_normalized) WHERE status = 'confirmed'` (partial unique — جلوگیری از تکرار قطعی)
  - `INDEX (person_id)`, `INDEX (kind, value_normalized)`
- **RLS**: enable. SELECT همراه با person قابل دیدن. write privileged.
- **Audit**: `person.identifier.add/update/revoke`.

### 4.3 `person_field_definitions`
- **هدف**: تعریف فیلدهای پویای person (مشابه `profile_field_definitions`).
- **ستون‌های مهم**: `id`, `name (unique)`, `label`, `field_type` (text|number|date|bool|select|multiselect|jsonb), `options jsonb`, `is_required bool`, `is_active bool`, `sort_order int`, `help_text`, `validation_regex text NULL`, `applies_to_kind text NULL` (individual/organization/both).
- **RLS**: read برای authenticated، write فقط admin.
- **Audit**: `person.field_definition.create/update/deactivate/required_field.change`.

### 4.4 `person_field_values`
- **هدف**: مقادیر فیلدهای پویا برای هر person.
- **ستون‌های مهم**: `id`, `person_id`, `field_definition_id`, `value jsonb`, `updated_by`, `updated_at`.
- **Constraint**: `UNIQUE (person_id, field_definition_id)`.
- **RLS**: enable. SELECT همراه با person. write privileged + اعتبارسنجی نوع از طریق RPC مشابه `set_profile_field_value` (security definer + `SET search_path = public`).
- **Audit**: ضمن update person ثبت می‌شود.

### 4.5 `person_context_links`
- **هدف**: نگاشت person به نقش‌های کسب‌وکاری بدون تکثیر هویت.
- **ستون‌های مهم**: `id`, `person_id`, `context_kind text NOT NULL` (customer, supplier, driver, sender, receiver, referrer, marketer, representative, complainant, returner, staff_link, credit_party, other), `ref_table text NULL`, `ref_id uuid NULL`, `started_at`, `ended_at`, `note`, `created_by/at`.
- **Constraint**: `UNIQUE (person_id, context_kind, ref_table, ref_id) WHERE ended_at IS NULL`.
- **RLS**: enable. شرط ترکیبی person.visibility + RBAC.
- **Audit**: `person.context_link.add/remove`.

### 4.6 لینک‌های nullable در جداول موجود (S09–S11، نه اکنون)
- `customers.person_id uuid NULL` + index
- `suppliers.person_id uuid NULL` + index
- `waybills.sender_person_id`, `receiver_person_id`, `driver_person_id` همگی nullable
- `sales_quotes.customer_person_id uuid NULL`

تمام این ستون‌ها nullable، بدون backfill اجباری، و ستون‌های متنی فعلی دست‌نخورده باقی می‌مانند.

---

## 5. Enumها (Draft — نیاز به تأیید U01)

### 5.1 `person_visibility_scope`
- `internal_general` — اطلاعات عمومی داخلی (نام، نقش کسب‌وکاری) قابل دیدن برای sales/viewer.
- `restricted_finance` — قابل دیدن فقط برای accountant/manager/admin (مانند tax_id، iban، supplier حساس).
- `restricted_executive` — فقط manager/admin.

### 5.2 `person_identifier_kind`
`mobile_e164`, `landline`, `national_id_ir`, `tax_id_ir`, `company_reg_id_ir`, `email`, `iban`, `custom`.

### 5.3 `person_identifier_status`
`provisional`, `confirmed`, `revoked`.

### 5.4 `person_context_kind`
`customer`, `supplier`, `driver`, `sender`, `receiver`, `referrer`, `marketer`, `representative`, `complainant`, `returner`, `staff_link`, `credit_party`, `other`.

> پیاده‌سازی به‌صورت `text + CHECK constraint` پیشنهاد می‌شود تا تغییر آینده ساده باشد (به‌جای `CREATE TYPE` که در self-host migration دشوارتر است). تصمیم نهایی با U01.

---

## 6. سیاست جلوگیری از تکرار (Duplicate Prevention)

1. **Normalize موبایل ایران**: تبدیل ارقام فارسی/عربی به ASCII، حذف فاصله و خط تیره، تبدیل `09xx` و `+989xx` و `00989xx` به فرم E.164 `+989xxxxxxxxx`. تابع normalize در سرور (serverFn) + تابع DB تریگری.
2. **National ID ایران**: حذف رقم‌های فارسی، اعتبارسنجی الگوریتم چک‌سام ۱۰ رقمی. ذخیره به‌صورت ۱۰ رقم padded با صفر چپ.
3. **Tax ID و Company Registration ID**: حذف کاراکترهای غیر عددی، اعتبارسنجی طول و الگو، lowercase اعمال نمی‌شود.
4. **Email**: trim + lowercase + RFC-light validation.
5. **Provisional vs Confirmed**: شناسه‌ای که هنوز تأیید نشده `provisional`. فقط `confirmed` در unique index قطعی شرکت می‌کند.
6. **Partial unique index**: `UNIQUE (kind, value_normalized) WHERE status='confirmed'` — اجازه می‌دهد چند provisional موازی وجود داشته باشد ولی دو confirmed تکراری ممنوع.
7. **Conflict handling**: در صورت تلاش برای confirm یک شناسه که قبلاً برای person دیگر confirmed است → خطای DB → سرور پاسخ ۴۰۹ + پیشنهاد merge برای ادمین.
8. **No auto-merge**: هرگز خودکار merge نمی‌شود؛ صرفاً لاگ `person.merge_request` در آینده.
9. **Warn vs Block** (تصمیم U01): پیشنهاد پیش‌فرض = **block** برای shenase های قطعی (mobile/national_id/tax_id) و **warn** برای email/landline/custom. منتظر تأیید U01.

---

## 7. سیاست فیلدهای پویا (Configurable Fields)

- استفاده از الگوی موجود `profile_field_*` بدون تغییر آن جدول.
- جداول جدید `person_field_definitions` و `person_field_values` به‌صورت مستقل ایجاد می‌شوند.
- نوع فیلدها: `text`, `number`, `date`, `bool`, `select`, `multiselect`, `jsonb`.
- `is_required` در سطح DB با تریگر بررسی می‌شود (نه فقط فرانت).
- `is_active=false` → ویرایش جدید مسدود، اما داده‌ی موجود حفظ می‌شود (هیچ DELETE).
- `sort_order int` برای ترتیب UI.
- **اعتبارسنجی سه‌لایه**:
  1. فرانت: UX سریع.
  2. serverFn: نوع، طول، regex، authorization.
  3. DB: تریگر برای enforce نوع/required + RLS برای enforce دسترسی.
- **چرا فرانت کافی نیست**: کاربر می‌تواند درخواست HTTP مستقیم بفرستد، فرانت قابل bypass است، و نیازمندی self-host با چندین client بالقوه (LAN UI، اسکریپت‌های داخلی) به enforcement سمت DB نیاز دارد.

---

## 8. مدل امنیتی RLS/RBAC

### 8.1 ماتریس نقش × visibility_scope × عملیات (پیشنهاد اولیه — نیاز به تأیید U01)

| Operation | Scope | admin | manager | accountant | sales | viewer |
|---|---|---|---|---|---|---|
| SELECT | internal_general | ✅ | ✅ | ✅ | ✅ | ✅ |
| SELECT | restricted_finance | ✅ | ✅ | ✅ | ❌ | ❌ |
| SELECT | restricted_executive | ✅ | ✅ | ❌ | ❌ | ❌ |
| INSERT person | any | ✅ | ✅ | ⚠️ (به تأیید) | ⚠️ (به تأیید) | ❌ |
| UPDATE person | internal_general | ✅ | ✅ | ❌ | ❌ | ❌ |
| UPDATE person | restricted_* | ✅ | ✅ | ❌ | ❌ | ❌ |
| DELETE/Deactivate | any | ✅ | ✅ | ❌ | ❌ | ❌ |
| add identifier | any | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |
| change visibility | any | ✅ | ✅ | ❌ | ❌ | ❌ |
| add context_link | any | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |

سلول‌های ⚠️ نیازمند تصمیم U01.

### 8.2 پیش‌نیاز سخت (Blocker)
اصلاح RLS leaks زیر **باید قبل از S04** کامل و در staging سبز شوند:
- `suppliers`: حذف `all authenticated read suppliers` و `suppliers_select_authed`؛ نگه‌داشتن `suppliers_select_dynamic`.
- `product_suppliers`: جایگزینی `ps_select_authed` با policy نقش‌محور.
- `purchases`: حذف `all authenticated read purchases`.
- `purchase_prices`: جایگزینی `owners_select_purchase_prices` با شرط بدون OR sales.
در غیر این صورت ساخت `persons` نشت supplier را تشدید می‌کند.

### 8.3 ضوابط الزامی
- مخفی‌سازی صرفاً در فرانت ممنوع.
- هر JOIN/FK که از person به جدول حساس می‌رود باید با RLS هدف هم سازگار باشد (Stepهای S09+ این را بررسی می‌کنند).
- توابع security definer **باید** `SET search_path = public` داشته باشند.
- استفاده از `has_role` / `has_any_role` موجود؛ ساخت helper موازی ممنوع.
- ذخیره‌ی نقش روی person یا context_link مطلقاً ممنوع — نقش‌ها فقط در `user_roles`.

---

## 9. نقشه‌ی Audit

رویدادهای حداقلی که باید در `audit_logs` ثبت شوند:
- `person.create`
- `person.update`
- `person.identifier.add`
- `person.identifier.update`
- `person.identifier.revoke`
- `person.field_definition.create`
- `person.field_definition.update`
- `person.field_definition.deactivate`
- `person.required_field.change`
- `person.visibility_change`
- `person.context_link.add`
- `person.context_link.remove`

اختیاری/آینده:
- `person.access.sensitive_view` (لاگ خواندن visibility=restricted_*) — تصمیم U01.
- `person.merge_request` — هنگام تلاش conflict identifier.

مکانیزم: ترجیحاً trigger روی هر جدول core (مشابه الگوی موجود)، با `actor_id = auth.uid()`. INSERT با policy `system inserts audit logs` موجود.

---

## 10. توالی Migration (آینده — اجرا نشده)

| Step | هدف | Scope مجاز | Scope ممنوع | Acceptance | Tests |
|---|---|---|---|---|---|
| **S03** | فیکس RLS leaks suppliers/product_suppliers/purchases/purchase_prices | DROP/CREATE POLICY در ۴ جدول | تغییر schema، تغییر persons، UI | sales/viewer نتواند supplier_id ببیند؛ accountant/manager بتواند | RLS role matrix تست |
| **S04** | ایجاد `persons` فقط | CREATE TABLE persons + RLS + audit trigger | شناسه‌ها، فیلدها، لینک‌ها، UI | جدول خالی ساخته شود؛ RLS فعال؛ بدون اثر روی customers/suppliers | migration up/down، linter |
| **S05** | `person_field_definitions` + `person_field_values` + RPC | CREATE TABLE + RPC security definer | UI | required/active enforce در DB | unit RPC، RLS |
| **S06** | `person_identifiers` + `person_context_links` | CREATE TABLE + partial unique + RLS | UI، wiring | conflict در confirmed بلاک شود | dedupe tests |
| **S07** | سرور: `src/lib/persons/*` (queries, normalizers, serverFns) | فقط فایل‌های جدید | تغییر customers/suppliers | typecheck pass | unit |
| **S08** | UI حداقلی `/persons` فهرست+ایجاد | route + components جدید | تغییر صفحات موجود | RTL، mobile-first | manual |
| **S09** | افزودن `customers.person_id NULL` + backfill اختیاری | ALTER ADD COLUMN، script اختیاری | حذف ستون قدیمی | regression customers سبز | regression |
| **S10** | افزودن `suppliers.person_id NULL` | همانند S09 | — | regression suppliers سبز | regression |
| **S11** | افزودن `waybills.{sender,receiver,driver}_person_id` و `sales_quotes.customer_person_id` همگی NULL | ALTER ADD | حذف text موجود | regression waybills/quotes سبز | regression |
| **S12** | Timeline فقط-خواندنی شخص | route جدید | write | read-only، RLS رعایت | manual |

---

## 11. استراتژی Rollback / DOWN

- هر migration **idempotent**: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `CREATE POLICY` بعد از drop ایمن.
- **هیچ تغییر مخرب** روی داده‌ی موجود (DROP COLUMN/TABLE روی جداول قدیمی ممنوع).
- ستون‌های جدید روی جداول موجود همگی **nullable** بدون default سنگین.
- **هیچ backfill خودکار**؛ backfillهای پیشنهادی باید جداگانه، dry-run-able و reversible باشند.
- جداول جدید فقط زمانی drop‌پذیرند که خالی باشند یا backup قبلی موجود است.
- قبل از هر migration روی staging: `deploy/backups/scripts/backup-postgres.sh` اجرا شود (مطابق سیاست موجود).
- DOWN هر S0x باید با یک فایل/بلوک مستندِ معکوس همراه باشد (در همان Step که UP نوشته می‌شود).

---

## 12. استراتژی تست

- `npm run build` (Vite + TanStack)
- `npm run lint` (eslint)
- typecheck: در صورت وجود script مستقل اجرا شود؛ در غیر این صورت اعلام عدم وجود.
- **Supabase linter** پس از هر migration.
- تست apply/rollback روی DB موقت.
- **ماتریس RLS**: تست خودکار برای هر نقش × scope × عملیات (به‌صورت SQL با `SET LOCAL ROLE` یا session با JWT تستی).
- تست‌های dedupe: تلاش confirm شناسه‌ی تکراری → 409.
- تست required-field پویا: ارسال بدون فیلد required → DB reject.
- Regression روی صفحات: `_app.sales_.customers*`, `_app.suppliers*`, فرم `WaybillForm`, `sales_quotes`.
- در Stepهای UI: تست RTL، mobile-first (≤375px)، حالت loading/empty/error به فارسی.

---

## 13. Self-Host Acceptance Check

- ✅ Linux + Docker: تمام تغییرات SQL خالص؛ بدون نیاز به ابزار خارجی.
- ✅ Supabase Self-host: بدون استفاده از API/قابلیت cloud-only.
- ✅ Postgres backup/restore: تمام جداول جدید توسط `pg_dump` پوشش می‌شوند؛ هیچ extension جدید لازم نیست (فقط `pgcrypto` که از قبل برای `gen_random_uuid` موجود است).
- ✅ بدون وابستگی critical به CDN، Google Fonts، یا اسکریپت‌های خارجی production.
- ✅ بدون secret در repo/frontend/chat. هیچ متغیر جدید `VITE_*` سرور-سکرت اضافه نمی‌شود.
- ✅ بدون فرض cloud-only (مثل Edge Functions اختصاصی Supabase Cloud یا Realtime مدیریت‌شده).
- ✅ Internet-resilient: عملکرد در شبکه‌ی local-only کامل است؛ normalization تلفن/ملی محلی است و نیاز به API خارجی ندارد.

---

## 14. چک‌لیست تصمیم U01

قبل از شروع S03/S04، U01 باید روی موارد زیر تأیید مکتوب بدهد:

- [ ] مقادیر دقیق `person_visibility_scope` (سه مقدار پیشنهادی کفایت می‌کند؟)
- [ ] ماتریس دقیق نقش × scope × عملیات بخش 8.1 (سلول‌های ⚠️)
- [ ] فهرست `person_context_kind` (کم/زیاد کردن مقادیر)
- [ ] فهرست `person_identifier_kind` (افزودن iban_sheba? card_pan?)
- [ ] رفتار dedupe: **block** یا **warn** برای هر kind
- [ ] اجازه‌ی accountant روی INSERT person و افزودن identifier برای supplier حساس
- [ ] فعال‌سازی `person.access.sensitive_view` از همان S04 یا موکول به آینده
- [ ] Scope دقیق S03 RLS fix (آیا فقط ۴ جدول یا گسترش به جداول مرتبط؟)
- [ ] تأیید استفاده از `text + CHECK` به‌جای `CREATE TYPE` برای enumها
- [ ] تأیید عدم backfill خودکار در Stepهای S09–S11

---

## گزارش پایان Step

- **Files inspected**: `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`, `docs/PERSONS_INVENTORY.md`, `.lovable/plan.md` (در context)، خلاصه‌ی schema/policy/RBAC موجود طبق inventory.
- **Files changed**: فقط `docs/PERSONS_SCHEMA_DESIGN.md` (ایجاد جدید).
- **چرا**: تأمین خروجی مجاز Step S02 جهت بررسی و تأیید U01 قبل از هر migration یا کد.
- **No migrations created** ✅
- **No application code changed** ✅
- **No RLS/policy changed** ✅
- **Build**: اجرا نشد — تغییر فقط markdown است.
- **Lint**: اجرا نشد — تغییر فقط markdown است.
- **Typecheck**: اجرا نشد — تغییر فقط markdown است.
- **Self-Host Acceptance**: بدون CDN، بدون secret، بدون وابستگی خارجی، سازگار با Docker/Linux/Supabase self-host و backup/restore.
- **Remaining U01 decisions**: مطابق بخش 14.
- **Agent mode confined to documentation only** ✅