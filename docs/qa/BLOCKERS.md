# BLOCKERS — صفحات بدون guard سطح-route (یافته‌های امنیتی)

> 🔴 **این فایل باید پیش از توزیع محیط تست به صفر برسد** (هر ردیف یا با افزودن guard رفع شود، یا توسط توسعه‌دهنده «عمدی» تأیید و بسته شود).
>
> **زمینه:** این صفحات در منو با پرچم `adminOnly` مخفی‌اند و «قصد» طراحی این بوده که فقط admin/manager ببیند، اما **هیچ guard سطح-route ندارند** — فقط لاگین لازم است (`_app.tsx`). یعنی اگر کاربر نقش‌پایین آدرس را مستقیم در مرورگر تایپ کند، صفحه بارگذاری می‌شود و تنها خط دفاع باقی‌مانده **RLS** است.
>
> **روش ارزیابی (grounded از `pg_policies`):** برای هر صفحه، سیاست RLS جدولِ زیرین خوانده شد.
> - اگر `SELECT` = `true` (هر کاربر لاگین‌شده) → **کاربر نقش‌پایین پیکربندی/داده را می‌بیند** = یافتهٔ واقعی (نشت خواندنی).
> - اگر `SELECT` محدود به نقش/مالکیت است → کاربر نقش‌پایین **ردیف خالی یا فقط مال خودش** می‌گیرد = RLS محافظت می‌کند (شدت پایین).
> - **نوشتن:** در همهٔ موارد زیر، سیاست نوشتن admin/accountant/manager را می‌طلبد → **هیچ نقش‌پایینی نمی‌تواند پیکربندی را تغییر دهد** (تشدید-امتیاز برای نوشتن یافت نشد). یافته‌ها همگی «نشت خواندنیِ پیکربندی»اند، نه «نوشتن غیرمجاز».

**واژگان شدت:** `بالا` (نشت دادهٔ حساس/یکپارچگی ناسازگار) · `متوسط` (نشت خواندنیِ پیکربندی به هر کاربر لاگین‌شده) · `پایین` (RLS کامل محافظت می‌کند؛ فقط نبود guard به‌عنوان بدهی defense-in-depth).

---

## دستهٔ الف — نشت خواندنیِ پیکربندی (SELECT=true) → شدت متوسط
کاربر نقش‌پایین (sales/viewer) با تایپ مستقیم آدرس، پیکربندی را **می‌بیند** (ولی نمی‌تواند تغییر دهد).

| مسیر route | فایل | جدول زیرین | RLS برای نقش‌پایین | شدت |
|---|---|---|---|---|
| `/admin/marketing-channels` | `_app.admin.marketing-channels.tsx` | `marketing_channels` | SELECT=`true` → **می‌بیند**؛ نوشتن=admin/accountant → مسدود | متوسط |
| `/admin/payment-terms` | `_app.admin.payment-terms.tsx` | `payment_terms` | SELECT=`true` → **می‌بیند**؛ نوشتن=admin/accountant → مسدود | متوسط |
| `/admin/receipt-fields` | `_app.admin.receipt-fields.tsx` | `payment_receipt_custom_fields` | SELECT=`true` → **می‌بیند**؛ نوشتن=admin/accountant → مسدود | متوسط |
| `/admin/waybill-fields` | `_app.admin.waybill-fields.tsx` | `waybill_custom_fields` | SELECT=`true` → **می‌بیند**؛ نوشتن=admin/accountant → مسدود | متوسط |
| `/admin/workflow-stages` | `_app.admin.workflow-stages.tsx` | `invoice_workflow_stages` | SELECT=`true` → **می‌بیند**؛ نوشتن=admin/accountant → مسدود | متوسط |
| `/pricing/settlement-types` | `_app.pricing.settlement-types.tsx` | `settlement_types` | SELECT=authenticated → **می‌بیند**؛ نوشتن=admin/manager → مسدود | متوسط |

> توجه: `/admin/workflow-settings` guard دارد (admin/manager) پس اینجا نیست؛ اما جدول `workflow_settings` هم SELECT=`true` است — اگر صفحهٔ دیگری بدون guard آن را بخواند همین وضع را دارد.

> ### 🔄 به‌روزرسانی پس از اسکن سیستمی (تأییدشده در سورس)
> از این ۶ ردیف، فقط **۲ ردیف نشت واقعیِ config** بودند و در migration `20260719120000_rls_permissive_select_fix.sql` به admin/manager/accountant بسته شدند:
> - `payment_receipt_custom_fields` (`/admin/receipt-fields`) و `invoice_workflow_stages` (`/admin/workflow-stages`) — هیچ نقش‌پایینی آن‌ها را در runtime نمی‌خواند (تنها خوانندهٔ frontend صفحهٔ ادمین است).
>
> **۴ ردیف دیگر «نشت» نیستند** — داده‌شان عمداً توسط `sales` در runtime خوانده می‌شود، پس REFERENCE طبقه‌بندی شد و **تغییر داده نشد**:
> - `marketing_channels` → `src/components/sales/PromotionNominateButton.tsx` (نامزدی پروموشن توسط sales).
> - `waybill_custom_fields` → `_app.sales_.invoices_.$invoiceId.waybill(.create).tsx` (ساخت بیجک توسط sales).
> - `payment_terms` و `settlement_types` → ساخت پیش‌فاکتور/فاکتور توسط sales.
>
> برای این چهار، فقط **نبود guard صفحهٔ ادمین** به‌عنوان بدهی defense-in-depth با شدت **پایین** باقی می‌ماند (نه نشت داده). جزئیات کامل در بخش «الگوی سیستمی» انتهای فایل.

## دستهٔ ب — یکپارچگی ناسازگار (نبود guard در صفحات یکپارچه‌سازی)

| مسیر route | فایل | جدول(های) زیرین که صفحه واقعاً می‌خواند | RLS برای نقش‌پایین | شدت |
|---|---|---|---|---|
| `/integrations/didar` | `_app.integrations.didar.tsx` | `bot_api_keys`، `didar_import_log` | هر دو محدود به admin/manager → **ردیف خالی می‌گیرد** | **پایین** (فقط نبود guard؛ داده نشت نمی‌کند — سند اصلاح شدت پایین‌تر) — ⚠️ **ناسازگاری:** `/operations/didar` نیازمند `requireAdmin()` است ولی این مسیر هیچ guard ندارد |
| `/market-matches` | `_app.market-matches.tsx` | `market_product_matches` | SELECT=admin/manager → **ردیف خالی می‌گیرد** (RLS محافظت می‌کند) | پایین (فقط نبود guard؛ داده نشت نمی‌کند) |

> ### 📌 سند تغییر شدت `/integrations/didar` (از «بالا» به «پایین»)
> نسخهٔ قبلی این فایل جدولِ زیرین را اشتباه `didar_activities` (با `SELECT=true`) نوشته بود و شدت را «بالا» زده بود. بررسی سورس نشان داد صفحه **اصلاً `didar_activities` را نمی‌خواند**. اصلاح مستند:
>
> **۱) دقیقاً چه فیلدهایی افشا می‌شود (نام به نام):**
> صفحه فقط سه کوئری می‌زند (`src/routes/_app.integrations.didar.tsx`):
> - `bot_api_keys` → فقط ستون‌های `id`، `name`، `is_active` انتخاب می‌شوند (خطوط ۶۰–۶۴). **`key_hash` هرگز select نمی‌شود.**
> - `didar_import_log` (آمار) → فقط `count` و `imported_at` (خطوط ۷۶–۸۶).
> - `didar_import_log` (تاریخچه) → فقط `id`، `entity_type`، `didar_id`، `action`، `imported_at`، `error_message` (خطوط ۱۰۱–۱۰۸). **ستون `raw_data` هرگز select نمی‌شود.**
> - **برای کاربر نقش‌پایین (sales/viewer): صفر فیلد.** هر دو جدول RLS محدود به admin/manager دارند، پس کوئری‌ها ردیف خالی برمی‌گردانند و صفحه «متصل نیست ❌ / تعداد صفر / تاریخچهٔ خالی» نشان می‌دهد.
>
> **۲) چرا credential افشا نمی‌شود — کدام فایل/policy ثابت می‌کند:**
> - ستون اعتبارنامه در جدول `bot_api_keys` نامش `key_hash` است و **هَش** است نه کلید خام (کلید خام هرگز ذخیره نمی‌شود) — تعریف در `supabase/migrations/20260426053202_…sql:91`.
> - صفحه در فهرست select خود (`_app.integrations.didar.tsx:60-64`) فقط `id, name, is_active` را می‌خواهد؛ `key_hash` نه. پس حتی برای admin هم مقدار کلید از این صفحه بیرون نمی‌آید.
> - علاوه بر آن، policyٔ `bot_api_keys_admin_manager_all` (همان migration، خط ۲۹۵) کل SELECT جدول را به admin/manager محدود می‌کند. نتیجه: **نه توکن، نه api key، نه هیچ credential.**
>
> **۳) ریسک باقی‌مانده:**
> - نبود guard سطح-route → بدهی defense-in-depth و ناسازگاری با `/operations/didar` (که `requireAdmin()` دارد). چون RLS داده را کامل می‌بندد، شدت **پایین** است. اصلاح پیشنهادی: افزودن `beforeLoad` با `requireAnyRole(['admin','manager'])` برای هم‌راستایی.
> - ریسک واقعیِ مرتبط با «دیدار» در جدول `didar_activities` است، **نه این صفحه** — به **دستهٔ د** پایین مراجعه کن.

## دستهٔ د — نشت سطح-جدول از طریق API مستقیم (مستقل از هر صفحه) → شدت بالا
این ردیف به هیچ صفحه‌ای گره نخورده: هر کاربر لاگین‌شده با توکن خودش می‌تواند مستقیماً PostgREST را صدا بزند (`GET /rest/v1/<table>`) بدون نیاز به UI. اگر RLSِ جدول `SELECT=true` باشد، همهٔ ردیف‌ها برمی‌گردند.

| جدول | policy | ستون‌های حساس در معرض | RLS برای نقش‌پایین | شدت |
|---|---|---|---|---|
| `didar_activities` | ~~`didar_activities_read` = `true`~~ → نقش‌محور | `activity_type`، `subject`، `description`، `customer_id`، `created_by_name`، `occurred_at`، `raw_data` | **بود** `SELECT=true`؛ اکنون policy نقش‌محور است | ✅ **بسته‌شده** (تأییدشده در live `afrakala`) — SELECT اکنون admin/manager؛ دادهٔ CRM دیگر به نقش‌پایین نمی‌رسد |
| `inquiry_price_cache` | ~~`inquiry_price_cache_select` = `true`~~ → نقش‌محور | `product_id`، `price`، `valid_until`، `created_by` | **بود** `SELECT=true`؛ اکنون policy نقش‌محور است | ✅ **بسته‌شده** (تأییدشده در live `afrakala`؛ بود 🔴 P0) — SELECT اکنون admin/manager/accountant؛ قیمت خرید مذاکره‌شده دیگر به نقش‌پایین نمی‌رسد. یافتهٔ ماژول ۱۷ (MSG-N07) |
| `academy_lessons` + `academy_quizzes` | `al_select_authed` / `aq_select_authed` (`FOR SELECT USING (auth.role()='authenticated')`) — `supabase/migrations/20260427155716_…sql:86-93` (نهایی: `schema_full_export.sql:19928,19933`) | `title`، `content`، `video_url`، `attachment_url` (درس) و متادیتای کوییز | **هر کاربر لاگین‌شده کل محتوای درس‌ها را می‌خواند — بدون فیلتر `is_published`** روی دورهٔ والد. مغایر مدل `is_published` که برای `academy_courses` (`ac_select_authed`) اعمال شده | **پایین** (تأییدشده از live afrakala) — شرط `auth.role()='authenticated'` است **نه `true`** (پس در دامنهٔ ۳۸‌تاییِ qual=true نیست)؛ فقط کاربر لاگین‌شده، محتوای آموزشی داخلی. **کلید پاسخ‌ها (`academy_quiz_questions`) قفل admin/manager است** → نشت حساس نیست. از migration خارج (کم‌اولویت) |

> **تست:** با توکن `test.viewer` یک `GET /rest/v1/<table>?select=*` بزن (یا از کلاینت supabase در کنسول). اگر ردیف برگشت = یافتهٔ امنیتی تأییدشده.
> **اصلاح:** هر سه در migration واحد «الگوی سیستمی» پایین رفع می‌شوند — `didar_activities`/`inquiry_price_cache` به نقش‌های privileged همان ماژول، و `academy_lessons`/`academy_quizzes` با join به `academy_courses.is_published` (مطابق `ac_select_authed`).

## دستهٔ ه — واگرایی سیاست نوشتن (RLS گسترده‌تر از UI/ماتریس) → شدت متوسط
اینجا نشت خواندنی نیست؛ RLS **نوشتن** را به نقش‌هایی می‌دهد که UI/ماتریس آن دکمه را از آن‌ها پنهان می‌کند. یعنی نقش می‌تواند از طریق PostgREST مستقیم بنویسد/حذف کند هرچند در UI دکمه‌ای نمی‌بیند.

| جدول | UI/ماتریس (`src/lib/rbac/roles.ts`) | RLS واقعی | واگرایی | شدت |
|---|---|---|---|---|
| `suppliers` | ساخت/ویرایش=admin+accountant، حذف=admin‑only | `suppliers_insert/update/delete_privileged` = admin/manager/accountant (`20260505122501:18-22`, `20260427143147:59-66`) | **manager** می‌تواند بسازد/ویرایش/تأیید/رد و حتی **حذف** کند؛ **accountant** می‌تواند **حذف** کند — برخلاف UI | متوسط — تغییر/حذف دادهٔ مرجع تأمین‌کننده توسط نقشی که UI پنهانش کرده. یافتهٔ ماژول ۰۶ (PUR-…) |
| `brands` + `categories` | ایندکس نوشتن را admin/manager گفته | `manage brands/categories admin manager accountant` = admin/manager/**accountant** (`20260429121637:4-12`) — **UI هم همین است** | فقط **مستندسازی** ایندکس ناقص است؛ RLS و UI سازگارند. `accountant` مجاز به نوشتن دادهٔ مرجع | پایین — عمدی-ولی-مستندنشده. باید در `00-index.md` اصلاح شود، نه در کد. یافتهٔ ماژول ۰۲ (PRD-N09) |

> **توجه:** این دو در migration «الگوی سیستمی» **تغییر داده نمی‌شوند** (نشت خواندنی نیستند و ممکن است عمدی باشند). `suppliers` نیازمند تصمیم توسعه‌دهنده است: آیا UI باید گسترده شود یا RLS تنگ؟ `brands/categories` فقط اصلاح سند ایندکس می‌خواهد.

## دستهٔ ج — RLS کامل محافظت می‌کند (فقط بدهی نبود guard) → شدت پایین
این صفحات guard ندارند ولی RLS داده را به «مالِ خود کاربر» یا «هیچ» محدود می‌کند؛ باز شدن صفحه بی‌ضرر است.

| مسیر route | فایل | جدول زیرین | RLS برای نقش‌پایین | شدت |
|---|---|---|---|---|
| `/operations/tasks` | `_app.operations.tasks.tsx` | `tasks` | SELECT=فقط task خودِ کاربر (assigned/created) یا admin/manager/accountant | پایین |
| `/operations/daily-mood` | `_app.operations.daily-mood.tsx` | `daily_mood_entries` | SELECT=رکورد خودِ کاربر (بازبینی مدیریتی جداست) | پایین |
| `/operations/daily-mood/admin` | `_app.operations.daily-mood.admin.tsx` | `daily_mood_entries` | بدون guard route؛ ولی کامپوننت با `hasPermissionEx(hr,view)` گیت می‌کند | پایین |
| `/presence` | `_app.presence.tsx` | `presence_logs` | SELECT=مالِ خود کاربر یا admin/manager | پایین |
| `/my-penalties` | `_app.my-penalties.tsx` | `performance_penalties` | خواندن از طریق RPC `get_user_penalties` (مالِ خود) | پایین |
| `/popup-center` | `_app.popup-center.tsx` | `dashboard_ticker_events` | SELECT=`true` → رویدادهای تیکر عمومی (کم‌حساسیت) | پایین |
| `/notifications` | `_app.notifications.tsx` | `notification_events` | SELECT=مالِ خود کاربر | پایین |
| `/gamification` | `_app.gamification.tsx` | `employee_scores` و … | SELECT=امتیاز خودِ کاربر یا admin/manager | پایین |
| `/gamification/achievements` | `_app.gamification.achievements.tsx` | `employee_achievements` | مالِ خود کاربر | پایین |
| `/gamification/leaderboard` | `_app.gamification.leaderboard.tsx` | RPC لیدربورد | لیدربورد عمومی (طراحی‌شده برای همه) | پایین |
| `/pricing/attention` | `_app.pricing.attention.tsx` | `product_computed_prices` | SELECT=admin/manager/accountant → نقش‌پایین **خالی می‌گیرد** | پایین |
| `/pricing/my-workbench` | `_app.pricing.my-workbench.tsx` | `product_computed_prices` | بدون guard route؛ کامپوننت با `hasPermissionEx(pricing,view)` گیت می‌کند | پایین |
| `/pricing/quick-price` | `_app.pricing.quick-price.tsx` | موتور قیمت (RPC) | فقط auth؛ ⚠️ نیاز به تأیید محدودهٔ مورد انتظار | پایین |
| `/marketing/suggestions` | `_app.marketing.suggestions.tsx` | پیشنهادها (RPC/`audit_logs`) | ⚠️ نیاز به تأیید: آیا داده به نقش‌پایین نشت می‌کند؟ | متوسط تا وقتی تأیید نشده |
| `/marketing/suggestions-history` | `_app.marketing.suggestions-history.tsx` | `audit_logs`/marketing | ⚠️ همان بالا | متوسط تا وقتی تأیید نشده |

---

## جمع‌بندی و اقدام لازم

- **بحرانی‌ترین (اصلاح‌شده):** جدول `didar_activities` (دستهٔ د — `SELECT=true`، نشت کل دادهٔ CRM دیدار به هر کاربر لاگین‌شده از طریق API مستقیم) و شش صفحهٔ پیکربندی ادمین دستهٔ الف (نشت خواندنیِ config به هر کاربر لاگین‌شده).
- **اصلاح شدت:** صفحهٔ `/integrations/didar` از «بالا» به «پایین» تنزل یافت (سند کامل در دستهٔ ب) — این صفحه هیچ credential/داده‌ای به نقش‌پایین نشان نمی‌دهد؛ فقط نبود guard route باقی می‌ماند. در مقابل، جدول `didar_activities` به‌عنوان یافتهٔ جداگانهٔ «بالا» اضافه شد (دستهٔ د).
- **خبر خوب:** هیچ صفحه‌ای اجازهٔ **نوشتن/تغییر پیکربندی** به نقش‌پایین نمی‌دهد — RLS نوشتن را همه‌جا به admin/accountant/manager محدود کرده.
- **اقدام پیشنهادی (توسعه‌دهنده):** به صفحات دستهٔ الف و ب یک `beforeLoad` با `requireAnyRole([...])` یا `requireAdmin()` اضافه شود (هم‌راستا با پرچم `adminOnly` منو)، و سیاست `SELECT=true` جداول پیکربندی به admin/manager محدود شود.
- **⚠️ نیاز به تأیید توسعه‌دهنده:** برای `/marketing/suggestions*` و `/pricing/quick-price` باید بررسی شود چه داده‌ای به نقش‌پایین برمی‌گردد.

**وضعیت این فایل:** 🟠 در جریان — ✅ دو نشت P0 (`inquiry_price_cache`، `didar_activities`) در live بسته شدند. باقی‌مانده: ۲ ردیف CONFIG واقعی دستهٔ الف (`payment_receipt_custom_fields`، `invoice_workflow_stages`) + ۲ LEAK دیگر (`daily_capital_settings`، `dynamic_entity_scores`) در migration آماده، + ۵ ⚠️ نیازمند تصمیم + ریسک زیرساخت دستهٔ و.

> نحوهٔ تست هر ردیف در فایل ماژول مربوطه (بخش «تست‌های منفی») آمده: با `test.viewer` یا `test.sales` آدرس را مستقیم باز کن و ببین صفحه بارگذاری می‌شود و آیا داده‌ای نشان می‌دهد.

---

## الگوی سیستمی — policyهای SELECT باز (اسکن دیتابیس زندهٔ afrakala)

> **⚠️ تصحیح مرجع (مهم):** تحلیل اولیه روی دیتابیس اشتباه (`postgres`) و فایل کهنهٔ `schema_full_export.sql` انجام شده بود. مرجع درست = دیتابیس زندهٔ **`afrakala`** (سرویس auth به `postgres://…@db:5432/afrakala` وصل است). خروجی مستقیم در `docs/qa/rls-live-afrakala.txt`. وضعیت زنده: **۱۹۲ جدول، ۴۶۳ policy، ۰ جدول بدون RLS، و ۳۸ policy باز روی SELECT**. کل این بخش و migration با همین ۳۸ هماهنگ شده‌اند.

**زمینه و الگو:** جداولی که سیاست RLS برای `SELECT` آن‌ها permissive است (`USING (true)` یا `USING (auth.role() = 'authenticated')`) → **هر کاربر لاگین‌شده** می‌تواند مستقیماً از PostgREST بخواند (`GET /rest/v1/<table>?select=*`)، **مستقل از UI و هر guard سطح-route**. تنها خط دفاع RLS است و وقتی باز باشد هیچ حفاظتی نمی‌ماند.

**دامنهٔ اسکن:** ۳۸ policyٔ باز روی SELECT در دیتابیس زندهٔ `afrakala` (فهرست کامل در `docs/qa/rls-live-afrakala.txt`).

**نتیجهٔ بررسی RLS-enabled:** در دیتابیس زنده **صفر جدول بدون RLS** است (هر ۱۹۲ جدول RLS فعال دارند). ادعای قبلیِ «جدول بدون RLS» حذف شد — در دیتابیس واقعی صفر است.

**روش دسته‌بندی (grounded از سورس):** برای هر جدول، مخاطبِ واقعی از مکانیزم دسترسی همان ماژول استخراج شد — guardهای `src/routes/*`، ماتریس `src/lib/rbac/roles.ts`، policyٔ جداول خواهر در همان ماژول، و اینکه آیا نقش‌پایین در runtime واقعاً آن را می‌خواند یا خیر (خواندن از طریق RPC با `SECURITY DEFINER` مهم است چون RLS را دور می‌زند).

- **LEAK** = دادهٔ حساس؛ باید محدود شود.
- **CONFIG** = پیکربندی ادمین/مالی؛ **تأیید شد هیچ نقش‌پایینی در runtime نمی‌خواند**؛ امن برای محدودسازی.
- **REFERENCE** = دادهٔ کاتالوگ/قیمت/RBAC/محتوای عمومی که نقش‌پایین قانوناً می‌خواند → **دست‌نخورده بماند** (محدودسازی اپ را می‌شکند).
- **⚠️ UNSURE** = مخاطب موردنظر از سورس قابل‌قطعیت نیست → **تغییر داده نشد**، نیازمند تصمیم انسانی.

### شمارش
| دسته | تعداد |
|---|---|
| LEAK (محدود شد — Section A) | ۴ |
| CONFIG (محدود شد — Section B) | ۶ |
| ⚠️ UNSURE (کامنت‌شده — Section C) | ۵ |
| REFERENCE (نگه داشته شد) | ۲۳ |
| **جمع policyهای باز زنده** | **۳۸** |
| جدول بدون RLS | ۰ |
| DRIFT (در export باز / در live بسته) | ۳ |

### فهرست کامل جداول با SELECT ‑permissive

#### 🔴 LEAK — محدود شد (SECTION A در migration)
| جدول | policy نهایی (قبل) | verdict | اصلاح اعمال‌شده |
|---|---|---|---|
| `inquiry_price_cache` | ~~`true`~~ → نقش‌محور | ✅ **بسته‌شده** (بود 🔴P0) | **اعمال‌شده در live**: SELECT → admin/manager/accountant (⚠️ بدون `group_id`؛ مسیرهای سرور DEFINER) |
| `didar_activities` | ~~`true`~~ → نقش‌محور | ✅ **بسته‌شده** | **اعمال‌شده در live**: SELECT → admin OR manager (مطابق خواهر `didar_import_log`) |
| `daily_capital_settings` | `dcs_select_authenticated` = `true` | LEAK (مالی: `total_capital`) | SELECT → admin/manager/accountant (مطابق خواهرها `daily_capital_inputs`/`_snapshots`) |
| `dynamic_entity_scores` | `dyn_scores_read_authenticated` = `true` | LEAK (امتیاز اعتباری مشتری/عملکرد فروشنده) | SELECT → admin/manager/accountant (خوانندگان: مسیر اعتبار مشتری + مسیر ادمین) |

#### 🟠 CONFIG — محدود شد (SECTION B در migration)
| جدول | policy نهایی (قبل) | verdict | اصلاح اعمال‌شده |
|---|---|---|---|
| `invoice_workflow_stages` | `iws_select` = `true` | CONFIG | SELECT → admin/manager/accountant (فقط `/admin/workflow-stages` می‌خواند؛ write=admin/accountant) |
| `payment_receipt_custom_fields` | `prcf_select_authed` = `true` | CONFIG | SELECT → admin/manager/accountant (خواننده: فرم رسید حسابداری + `/admin/receipt-fields`) |
| `recent_purchase_settings` | `recent_purchase_settings read authenticated` = `true` | CONFIG | SELECT → admin/manager (label runtime از RPC `get_recent_purchase_label` که DEFINER است) |
| `workflow_settings` | `all authenticated can read settings` = `true` | CONFIG | SELECT → admin/manager (frontend مستقیم نمی‌خواند؛ RPCهای `get_workflow_setting[s]` DEFINER) |
| `dynamic_scoring_parameters` | `dyn_scoring_params_read_authenticated` = `true` | CONFIG (پیکربندی امتیازدهی) | SELECT → admin/manager/accountant |
| `dynamic_parameter_weights` | `dyn_param_weights_read_authenticated` = `true` | CONFIG (وزن‌های امتیازدهی) | SELECT → admin/manager/accountant |

#### ⚠️ UNSURE — تغییر داده نشد (SECTION C در migration، کامنت‌شده)
| جدول | policy فعلی | چرا نامطمئن |
|---|---|---|
| `employee_profiles` | `ep_select_auth` = `true` | ظاهراً «دفترچهٔ داخلی» عمدی (دپارتمان/bio/مدیر)؛ فقط مسیر ادمین می‌خواند ولی `ep_write_own` یعنی self-read هم موردانتظار است. کاندید: own یا admin/manager |
| `pricing_board_settings` | `pbs_select_auth` = `true` | «بورد قیمت» مدل عضویت درخواستی دارد (`BoardAccessRequestsCard`)؛ محدودسازی نقشی ممکن است اعضای مجاز را قفل کند |
| `shop_settings` | `shop_settings_read_authed` = `true` | نام کلاسیکِ config سراسری؛ خوانندگان تأییدشده همه privileged‌اند ولی ریسک بارگذاری در provider/layout سراسری بالاست |
| `currency_rate_fetches` | `crf_read` = `true` | فقط `/pricing/currency-rates` می‌خواند (pricing=admin/manager/accountant)؛ کم‌حساسیت (نرخ ارز محرمانه نیست) ولی اگر قصد pricing-only است باید تنگ شود |
| `promotion_nomination_policy` | `promo_policy_select_authed` = `true` | خوانندهٔ مستقیم frontend ندارد — احتمالاً از RPC (DEFINER) خوانده می‌شود؛ اگر sales باید قواعد نامزدی را ببیند باز بماند، وگرنه تنگ شود |

#### 🟢 REFERENCE — نگه داشته شد (۲۳ جدول؛ محدودسازی اپ را می‌شکند)
`brands`، `categories`، `category_product_attributes`، `product_attributes`، `product_attribute_groups`، `product_images`، `product_recommendation_overrides`، `currencies`، `sale_price_types`، `payment_terms`، `waybill_custom_fields` (فروشنده بارنامه می‌سازد)، `marketing_channels` (نامزدی پروموشن توسط فروشنده)، `custom_roles`، `role_permissions` (هر کاربر از کش permissions می‌خواند — بحرانی)، `employee_leagues`، `league_seasons`، `gamification_kpis`، `daily_mood_hafez_poems`، `daily_mood_questions`، `daily_mood_scenarios`، `validation_rules`، `dashboard_ticker_events` (تیکر عمومی داشبورد)، `sales_reminders` (پیام همگانی به فروشنده‌ها).

> **توجه:** جدول‌هایی مثل `settlement_types`، `price_lists`، `price_list_items`، `product_labels`، `product_label_links`، `product_owner_assignments` که در `schema_full_export.sql` باز (authenticated) بودند، **در دیتابیس زنده جزو ۳۸ policy باز نیستند** — یعنی در live محدودترند (به‌نفع امنیت). این هم نوعی drift است؛ نیازی به اقدام ندارد.

#### 🔀 DRIFT — ناسازگاری بین کد/export و دیتابیس زنده
| مورد | جهت | اقدام |
|---|---|---|
| `academy_lessons`، `academy_quizzes`، `knowledge_articles` | شرط `auth.role()='authenticated'` دارند نه `true` → **در دامنهٔ ۳۸‌تاییِ qual=true نیستند** (نه اینکه بسته باشند) | در live **باز**اند ولی شدت **پایین** (تأییدشده): فقط کاربر authenticated، و `academy_quiz_questions` قفل admin/manager. از migration خارج شدند چون کم‌اولویت‌اند، نه به‌خاطر regression. ⚠️ کلاس `auth.role()='authenticated'` جدا از این ۳۸ است و ممکن است جدول‌های دیگری هم داشته باشد |
| `daily_capital_settings`، `dashboard_ticker_events`، `didar_activities`، `dynamic_entity_scores`، `dynamic_parameter_weights`، `dynamic_scoring_parameters`، `employee_profiles`، `product_images`، `promotion_nomination_policy`، `sales_reminders` (۱۰ جدول) | در live هستند ولی در `schema_full_export.sql` **نیستند** (جدول‌های پساـاسنپ‌شات) | export کهنه است؛ تحلیل بر live انجام شد. این ۱۰ جدول در دسته‌بندی بالا لحاظ شده‌اند |

> **اصلاح:** همهٔ ردیف‌های LEAK و CONFIG در migration واحد `supabase/migrations/20260719120000_rls_permissive_select_fix.sql` (idempotent، `DROP ... IF EXISTS; CREATE ...`) رفع شده‌اند. پس از اعمال باید `docker restart afrakala-lan-rest` اجرا شود تا PostgREST اسکیمای policyها را دوباره بارگذاری کند. اتصال طبق قرارداد پروژه با `supabase_admin`.
> **تست هر ردیف:** با توکن `test.viewer` یک `GET /rest/v1/<table>?select=*` بزن؛ برای LEAK/CONFIG باید بعد از migration صفر ردیف برگردد و برای REFERENCE همچنان ردیف برگردد.

---

## دستهٔ و — ریسک زیرساخت دیتابیس (باید پیش از production تعیین‌تکلیف شود)

| مورد | شرح | شدت | اقدام |
|---|---|---|---|
| **دیتابیس دومِ `postgres`** | روی همان کانتینر `afrakala-lan-db`، علاوه بر دیتابیس اصلی `afrakala`، یک دیتابیس `postgres` با **schema قدیمی** (نقش هنوز از نوع `app_role` enum) و یک **کپی از دادهٔ کسب‌وکار** وجود دارد. | 🔴 **بالا** | این دیتابیس منبع سردرگمی و سطح‌حملهٔ اضافه است (دادهٔ واقعی در دو جا). پیش از production یا حذف شود یا صریحاً ایزوله/مستند شود. تحلیل RLS شب روی همین DB اشتباه انجام شده بود. |
| **drift انوم `app_role`** | نوع `app_role` هنوز در `afrakala` وجود دارد، ولی ستون نقش‌ها اکنون `text` است (مهاجرت enum→text ناتمام مانده). | متوسط | drift باقی‌مانده؛ ثبت شد. باید تصمیم گرفته شود انوم حذف شود یا ستون به انوم برگردد. توابع RLS (`has_role`/`has_any_role`) هنوز با cast `::app_role` کار می‌کنند — تا وقتی انوم هست مشکلی نیست، ولی بدهی است. |
| **fallback بازِ `has_dynamic_permission`** | دسترسی چند ماژول (products, suppliers, pricing, …) از `has_dynamic_permission(uid, module, action)` می‌آید (`20260429131128:70-81`). اگر **هیچ ردیفی** در `role_permissions` برای آن ماژول نباشد (`_exists=false`)، تابع به ماتریس قدیمی fallback می‌کند و برای `view` مقدار `admin/manager/accountant/sales/viewer` (**همه**) برمی‌گرداند. | 🟠 **متوسط** | **افزودن یک ماژول جدید بدون seed کردن ردیف‌های `role_permissions`، دسترسی view را ناخواسته به همه باز می‌کند.** توصیه: fallbackِ `view` به «بسته» تغییر کند، یا seed اجباری ردیف role_permissions برای هر ماژول جدید در چک‌لیست release. |

> **زمینه:** این یافته‌ها از تأیید مستقیم دیتابیس زندهٔ `afrakala` به‌دست آمدند (نه از migrationها). دیتابیس درست برای همهٔ عملیات: `afrakala` با کاربر `supabase_admin`.
> **نکتهٔ RBAC محصولات (تأییدشده عملی):** دسترسی *مشاهدهٔ* محصولات از `role_permissions` می‌آید نه نقشِ صرف. در live: `sales` → می‌بیند؛ `accountant` و `viewer` → `can_view=false` → از REST **آرایهٔ خالی** می‌گیرند (طبق طراحی، نه باگ). (توجه: seed migration `20260429124850` برای `sales` هم `false` داشت — یعنی `role_permissions` زنده دستی تغییر کرده؛ مبنا = وضعیت زنده.)
