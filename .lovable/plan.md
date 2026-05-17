## 1. Summary

نشت محرمانگی تأمین‌کنندگان تأیید شد و دامنه‌ی آن از یک جدول فراتر می‌رود. علاوه بر دو policy افزونه‌ی PERMISSIVE روی `public.suppliers` که به هر کاربر authenticated اجازه‌ی SELECT می‌دهند، چندین جدول مرتبط (`product_suppliers`, `purchases`, `purchase_prices`) و یک view (`vw_supplier_payables`) `supplier_id` و حتی `supplier_name` را به نقش‌های غیرمجاز (sales/viewer) قابل دسترس می‌کنند. خبر خوب اینکه `role_permissions` از قبل برای ماژول `suppliers` به‌درستی فقط admin/manager/accountant را با `can_view=true` ست کرده، پس فیکس از سمت RLS «حذف policyهای زائد + اتکا به موجود» است و نیازی به مدل grant جدید در این فاز نیست.

این پلن فقط فیکس امنیتی غیر-تخریبی پیشنهاد می‌دهد. unified persons در این مرحله ساخته نمی‌شود.

## 2. Confirmed current RLS/policy state (live DB)

**`public.suppliers` — ۷ policy:**

| نام | type | cmd | شرط |
|---|---|---|---|
| `all authenticated read suppliers` | PERMISSIVE | SELECT | `auth.role() = 'authenticated'` 🔴 |
| `suppliers_select_authed` | PERMISSIVE | SELECT | `auth.role() = 'authenticated'` 🔴 |
| `suppliers_select_dynamic` | PERMISSIVE | SELECT | `has_dynamic_permission(uid,'suppliers','view')` ✅ |
| `manager admin write suppliers` | PERMISSIVE | ALL | `has_any_role(uid, [admin,manager])` |
| `suppliers_insert_privileged` | PERMISSIVE | INSERT | `has_any_role(uid, [admin,manager,accountant])` |
| `suppliers_update_privileged` | PERMISSIVE | UPDATE | همان |
| `suppliers_delete_privileged` | PERMISSIVE | DELETE | همان |

چون policyهای PERMISSIVE با OR ترکیب می‌شوند، حضور دو policy نخست هر بررسی دیگری را خنثی می‌کند → هر کاربر لاگین می‌تواند کل suppliers را بخواند.

**`role_permissions` برای ماژول `suppliers` (فعلی، تأیید شد):**

```
admin       can_view = t
manager     can_view = t
accountant  can_view = t
sales       can_view = f
viewer      can_view = f
```

یعنی به‌محض حذف دو policy نشتی، `suppliers_select_dynamic` خودش به‌درستی sales/viewer را رد می‌کند.

**جداول و view مرتبط:**

- `product_suppliers` — policy `ps_select_authed` با `auth.role()='authenticated'` 🔴 (نشت `supplier_id` به sales).
- `purchases` — policy `all authenticated read purchases` با همان شرط 🔴 (نشت `supplier_id` + داده‌ی خرید به sales).
- `purchase_prices` — policy `owners_select_purchase_prices` صریحاً نقش `sales` را OR می‌کند 🔴 (نشت `supplier_id` به sales).
- `vw_supplier_payables` — `security_invoker = true` ✅ (پس از قفل `suppliers`، JOIN آن برای کاربر بدون دسترسی NULL برمی‌گرداند → `supplier_name` نشت نمی‌کند).
- `vw_purchase_float` — `security_invoker = true` ✅ اما `supplier_id` دارد و به جدول `purchases` متکی است که نشت دارد.
- `v_latest_active_purchase_prices` — `security_invoker` ست نشده ⚠️ باید بررسی شود اگر `supplier_id` را expose می‌کند.

## 3. Confirmed leak paths

1. **مستقیم:** `select * from suppliers` با هر JWT authenticated.
2. **PostgREST query از فرانت:** `supabase.from('suppliers').select(...)` بدون filter — همان نشت.
3. **`product_suppliers`:** sales/viewer می‌تواند نگاشت `product_id ↔ supplier_id` را بخواند. حتی بدون نام، enumeration و pivot به purchase_prices ممکن است.
4. **`purchases`:** کل تاریخچه خرید با `supplier_id` و مبالغ برای هر authenticated قابل خواندن است.
5. **`purchase_prices`:** policy صریحاً sales را مجاز کرده — `supplier_id` لو می‌رود.
6. **`vw_supplier_payables`:** پس از قفل suppliers، چون security_invoker است، `supplier_name` برای sales = NULL خواهد بود — leak مهار می‌شود ولی همچنان `supplier_id` از طریق `purchases` لو می‌رود.
7. **Autocomplete/Search UI:** صفحات `_app.suppliers.tsx`, `ProductSupplierManager.tsx`, `SupplierReferralModal.tsx`, `PurchaseForm.tsx`, `_app.pricing.purchase-prices.tsx`, `src/lib/pricing/queries.ts` همگی روی همین queryها متکی هستند. هیچ‌کدام guard سرور-ساید مستقل ندارند.

## 4. Minimal safe fix plan

این فاز فقط RLS را اصلاح می‌کند؛ هیچ داده‌ای حذف یا تغییر داده نمی‌شود.

**۴.۱ `public.suppliers`**

- DROP POLICY `all authenticated read suppliers`.
- DROP POLICY `suppliers_select_authed`.
- نگه داشتن `suppliers_select_dynamic` (که از `has_dynamic_permission` استفاده می‌کند) به‌عنوان مسیر SELECT.
- **افزودن یک policy ایمن مکمل** (defense-in-depth) `suppliers_select_privileged_roles` با `has_any_role(uid, [admin, manager, accountant])` تا در صورت خراب‌شدن جدول `role_permissions` یا حذف اشتباهی ردیف‌های آن، باز هم نقش‌های مجاز قطع نشوند. این policy و dynamic با OR کار می‌کنند، بنابراین دسترسی نقش‌های مجاز را پایدار نگه می‌دارند و sales/viewer را همچنان رد می‌کنند.
- بقیه‌ی policyهای write/delete دست‌نخورده می‌مانند.

**۴.۲ `public.product_suppliers`**

- DROP POLICY `ps_select_authed`.
- جایگزینی با `ps_select_privileged` که شرطش `has_any_role(uid, [admin, manager, accountant]) OR has_dynamic_permission(uid,'suppliers','view')` باشد.
- نتیجه: نگاشت `product_id ↔ supplier_id` دیگر برای sales قابل خواندن نیست. صفحات قیمت‌گذاری/فروش که فقط محصول را نیاز دارند آسیب نمی‌بینند چون `product_suppliers` ماهیتاً داده‌ی محرمانه‌ی تأمین‌کننده است.

**۴.۳ `public.purchases`**

- DROP POLICY `all authenticated read purchases`.
- جایگزینی با `purchases_select_privileged` با همان شرط admin/manager/accountant (نقش‌هایی که امروز ماژول purchases برایشان فعال است).
- این تغییر روی sales/viewer اثری مثبت دارد (طبق `role_permissions` این دو نقش از قبل برای purchases نباید can_view داشته باشند — باید قبل از merge با یک SELECT تأیید شود).

**۴.۴ `public.purchase_prices`**

- اصلاح `owners_select_purchase_prices`: حذف `'sales'::app_role` از لیست role-ها. (sales به قیمت خرید نباید دسترسی داشته باشد طبق نام policy رقیب `purchase_prices_select_dynamic_sensitive` که از قبل با مجوز `pricing.view_sensitive` کنترل می‌شود.)
- اگر تیم فروش نیاز عملیاتی به دیدن قیمت خرید دارد، این به admin به‌صورت دستی از طریق `role_permissions.pricing.view_sensitive = true` قابل اعطاست — بدون نشت `supplier_id`.

**۴.۵ Viewهای supplier-bearing**

- تأیید: `vw_supplier_payables` و `vw_purchase_float` هر دو `security_invoker=true` — کاری لازم نیست.
- بررسی `v_latest_active_purchase_prices`: اگر `supplier_id` را expose می‌کند، در همین migration به `security_invoker=true` تبدیل شود (تغییر options، غیر-تخریبی).

**۴.۶ Migration shape (مفهومی، بدون نوشتن کد)**

یک migration timestamped تنها شامل `DROP POLICY IF EXISTS ...` و `CREATE POLICY ...` و در صورت لزوم `ALTER VIEW ... SET (security_invoker=true)`. هیچ `DROP TABLE`/`ALTER COLUMN`/`DELETE` ندارد. مطابق `docs/MIGRATION_SAFETY_POLICY.md` در دسته‌ی low-risk قرار می‌گیرد ولی به دلیل اثر روی RLS، روی staging باید قبل از prod اجرا و verify شود.

## 5. Files / migrations likely affected

- **Migration جدید (در فاز بعدی):** `supabase/migrations/<timestamp>_supplier_confidentiality_hardening.sql` — تنها فایل DB.
- **کد فرانت — هیچ تغییر اجباری ندارد** (به اصرار درخواست). اما این موارد باید دستی verify شوند که پس از قفل RLS، خطای UX خوب می‌دهند (نه white screen):
  - `src/routes/_app.suppliers.tsx`, `_app.suppliers_.$supplierId.tsx`
  - `src/shared/components/SupplierForm.tsx`, `ProductSupplierManager.tsx`, `SupplierReferralModal.tsx`, `PurchaseForm.tsx`
  - `src/lib/pricing/queries.ts`, `src/routes/_app.pricing.purchase-prices.tsx`
  - هر autocomplete که از `from('suppliers')` یا `from('product_suppliers')` استفاده می‌کند.
- **RBAC هیچ تغییر نمی‌خواهد** — `role_permissions` از قبل سازگار است. `src/lib/rbac/route-guards.ts` و `roles.ts` دست‌نخورده.

## 6. RLS test plan (سرور-ساید، قبل از merge، روی staging)

با impersonation از طریق `SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub = '<user-uuid>';` (یا با JWT واقعی هر نقش) موارد زیر اجرا و خروجی صفر/غیرصفر تأیید شود:

| سناریو | SQL | انتظار |
|---|---|---|
| admin می‌بیند | `select count(*) from suppliers` | > 0 |
| accountant می‌بیند | همان | > 0 |
| manager می‌بیند | همان | > 0 |
| sales نمی‌بیند | همان | 0 |
| viewer نمی‌بیند | همان | 0 |
| sales جستجو نمی‌تواند | `select id from suppliers where name ilike '%a%'` | 0 |
| sales product_suppliers نمی‌بیند | `select supplier_id from product_suppliers` | 0 |
| sales purchases نمی‌بیند | `select supplier_id from purchases` | 0 |
| sales purchase_prices نمی‌بیند | `select supplier_id from purchase_prices` | 0 |
| sales از view نام تأمین‌کننده نمی‌گیرد | `select supplier_name from vw_supplier_payables` | همه NULL یا صفر سطر |
| admin از view می‌بیند | همان | با مقدار |
| اعطای صریح فعلاً وجود ندارد و خارج از scope | — | — |

## 7. UI / query regression test plan

پس از اعمال migration روی staging:

- ورود با admin → صفحات `/suppliers`, `/suppliers/<id>`, فرم تأمین‌کننده، purchase form، purchase-prices: همه کار می‌کنند.
- ورود با accountant → همان.
- ورود با manager → همان (مطابق `role_permissions`).
- ورود با sales → صفحه `/suppliers` باید EmptyState یا 403 صریح بدهد؛ هیچ نام تأمین‌کننده‌ای در autocomplete/select نباشد؛ فرم خرید (اگر برای sales باز است) باید تأمین‌کننده را نشان ندهد یا «نیاز به دسترسی» پیام بدهد.
- ورود با viewer → همان sales.
- بررسی PurchaseForm: اگر تنها مسیر sales برای ثبت خرید است و به انتخاب supplier نیاز دارد، باید یا دسترسی sales به این فرم برداشته شود یا یک workflow «درخواست» پیشنهاد گردد (خارج از scope این فاز — صرفاً پرچم).

## 8. Self-host acceptance check

- بدون CDN/خدمات خارجی ✅
- بدون secret جدید ✅
- بدون افزونه‌ی Postgres جدید ✅
- migration فقط DDL غیر-تخریبی، reversible (با re-create policyهای قدیمی) ✅
- backup/restore متأثر نمی‌شود — تنها metadata پلیسی تغییر می‌کند که در `pg_dump` معمول می‌آید ✅
- سازگار با Supabase self-host (PostgREST + GoTrue) ✅
- audit_logs: تغییر RLS خود توسط جدول `audit_logs` لاگ نمی‌شود (لاگ سطح اپ است نه DDL). برای رکورد رسمی، توصیه می‌شود ورودی دستی در `audit_logs` با `entity_type='security_policy'` و diff شامل نام policyهای قبل/بعد، توسط migration درج شود (یک INSERT ساده، غیر-تخریبی) ✅

## 9. Risks and stop conditions

**ریسک‌ها:**

- **R1 — قطع ناخواسته دسترسی نقش مجاز:** اگر `role_permissions.suppliers.can_view` برای admin/manager/accountant خراب باشد، اتکای صرف به dynamic permission آن‌ها را قطع می‌کند. mitigated با policy مکمل static role-based (بند ۴.۱).
- **R2 — قطع ناخواسته فرم خرید برای sales:** اگر امروز sales عملاً supplier را در purchase انتخاب می‌کند، پس از فیکس قادر نخواهد بود. باید قبل از merge، با محصول روشن شود.
- **R3 — view بدون security_invoker:** اگر هنگام بررسی `v_latest_active_purchase_prices` معلوم شد definer اجرا می‌شود و `supplier_id` را برمی‌گرداند، نشت ادامه دارد. باید همان migration ALTER شود.
- **R4 — قابلیت rollback:** rollback یعنی re-create دو policy نشتی — کاملاً ممکن و idempotent، اما در همان لحظه نشت برمی‌گردد. به همین دلیل deploy باید با اعلام پنجره و verify انجام شود.

**Stop conditions (پیاده‌سازی اجرا نشود اگر):**

- نتایج RLS test plan (بند ۶) برای حتی یک سناریو fail شود.
- ثابت شود process یا cron task موجود تحت کاربر service_role نیست و بعد از این تغییر می‌شکند بدون جایگزین.
- مشخص شود sales عملاً به purchase_prices/purchases برای کار روزانه نیاز دارد و حذف آن workflow کسب‌وکار را قطع می‌کند (در آن صورت ابتدا باید alternative تعریف شود).
- viewی پیدا شود که supplier را به sales لو می‌دهد و security_invoker‌سازی آن باعث رگرسیون در گزارش‌های موجود admin شود.
- backup قبل از اجرا روی prod گرفته نشده باشد.

## 10. Final recommendation

**Proceed — با شرط رعایت ترتیب زیر:**

1. اجرای migration روی staging، اجرای کامل بند ۶ و بند ۷، گرفتن تأیید کتبی محصول برای R2.
2. بررسی `v_latest_active_purchase_prices` و افزودن `security_invoker=true` در همان migration در صورت نیاز.
3. backup کامل prod.
4. اجرا روی prod در پنجره‌ی low-traffic.
5. smoke test سریع روی نقش‌های admin/accountant/sales.
6. ثبت یک ردیف در `audit_logs` با خلاصه‌ی تغییر policy.

این فاز هیچ‌گونه ایجاد جدول `persons`، تغییر کد فرانت، یا refactor در ماژول‌های دیگر ندارد و کاملاً مقدم بر فاز AFRA-PERSONS-MR-20260517-STEP-02 اجرا می‌شود.
