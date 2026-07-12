<<<<<<< HEAD

# پاکسازی داده‌های محصولات از Lovable Cloud

=======
>>>>>>> origin/feat/phase-0-automation-ui
## هدف
حذف داده‌های تراکنشی/کاربری وارد شده روی Cloud (فقط شاخه محصولات و وابسته‌های آن + `audit_logs` + همه Storage buckets) — بدون دست‌کاری ساختار جدول‌ها، RLS، توابع، نقش‌ها، پیکربندی و کاربران auth.

<<<<<<< HEAD
## گام ۱ — Export امن (قبل از هر کار — دستی توسط شما)
1. در بالای چت روی نام پروژه → **Settings**.
2. تب **Cloud** (یا از نوار More → Cloud) را باز کنید.
3. **Advanced settings → Export data** → دانلود فایل ZIP.
4. فایل را حداقل در دو جای مختلف (لپ‌تاپ + درایو خارجی/سرور LAN) نگه دارید.
5. بعد از تأیید اینکه فایل export سالم دانلود شد، به من پیام بدهید «Export گرفتم، ادامه بده».

بدون این گام هیچ migration/truncate اجرا نمی‌شود.

## گام ۲ — پاکسازی جدول‌های شاخه محصولات (یک migration)
اجرا در یک transaction با `session_replication_role = replica` تا FKها/triggerها موقتاً غیرفعال شوند و ترتیب اهمیت نداشته باشد.

جدول‌هایی که TRUNCATE می‌شوند:

**هسته محصول:**
`products`, `product_images`, `product_label_links`, `product_labels`, `product_owner_assignments`, `product_suppliers`, `product_computed_prices`, `product_sale_price_history`, `product_recommendation_overrides`, `product_interaction_events`, `product_sku_counters`, `product_category_attribute_values`, `product_attributes`, `product_attribute_groups`, `category_product_attributes`, `categories`, `brands`

**قیمت‌گذاری/خرید مرتبط با محصول:**
`purchase_prices`, `purchases`, `purchase_items`, `purchase_receipts`, `purchase_requests`, `purchase_request_status_history`, `suppliers`, `price_lists`, `price_list_items`, `pricing_rules`, `price_calculation_snapshots`, `price_alert_rules`, `price_alert_notifications`, `inquiry_price_cache`, `pricing_recompute_queue`, `stock_alert_requests`

**اسناد فروش وابسته به محصول (چون بدون محصول بی‌معنی می‌شوند و FK دارند):**
`sales_quotes`, `sales_quote_items`, `sales_quote_send_queue`, `sales_quote_share_logs`, `sales_quote_counters`, `sale_lists`, `sale_list_items`, `sale_list_versions`, `invoices`, `invoice_items`, `inquiries`, `inquiry_replies`, `inquiry_status_history`, `inquiry_transfers`, `delivery_receipts`, `delivery_receipt_status_history`, `waybills`, `waybill_items`, `waybill_number_counter`, `payment_receipts`, `payment_receipt_links`, `payment_receipt_documents`, `payment_receipt_custom_fields`

**بازار / تطبیق محصولات:**
`market_product_matches`, `market_product_match_events`, `market_rate_ticks`, `market_rate_ingestion_runs`, `currency_rate_fetches`, `currency_rates`

**+ به درخواست شما:** `audit_logs`
=======
سرعت دو نقطه‌ای که کند است را بدون تغییر backend/DB بالا ببریم:
1. **جابجایی بین ماژول‌ها** در ساید‌بار (الان روی هر کلیک، چانک مقصد تازه دانلود می‌شود).
2. **کارگاه قیمت من** که چند کوئری متوالی دارد و هر بار از صفر اجرا می‌شود.

تغییرات صرفاً frontend است؛ هیچ migration/RLS/سرور تغییر نمی‌کند.

## تغییرات

### ۱) Router: preload روی hover/intent
فایل: `src/router.tsx`
- افزودن `defaultPreload: "intent"` تا با hover روی Link چانک مقصد از قبل دانلود شود.
- افزایش `defaultPreloadStaleTime` به مثلاً `30_000` تا بعد از preload دوباره fetch نشود (طبق گاید TanStack Query وقتی Query استفاده می‌شود این مقدار می‌تواند >0 باشد چون کش روتر فقط برای loaderهاست و کوئری‌های ما همگی از TanStack Query هستند).
- نگه‌داشتن `scrollRestoration` و `defaultErrorComponent`.

اثر: کلیک روی آیکن ماژول تقریباً آنی می‌شود چون JS مقصد قبل از کلیک آماده است.

### ۲) Sidebar: prefetch ماژول‌ها هنگام hover روی ریل
فایل: `src/components/layout/AppSidebar.tsx`
- روی دکمه هر ماژول در ریل، `onMouseEnter` / `onFocus` فراخوانی `router.preloadRoute({ to: m.defaultTo })` (یا معادل از `useRouter`) اضافه کنیم. این مکمل گام ۱ است برای دکمه‌های `<button>` که Link نیستند.

### ۳) Lookupها: افزایش staleTime
فایل: `src/routes/_app.pricing.my-workbench.tsx`
- `brands-lite` / `categories-lite` / `labels-lite` / `product-owners-lite`: staleTime از `60_000` به `5 * 60_000` و `gcTime: 30 * 60_000`. این داده‌ها تقریباً ثابت‌اند.
- staleTime کوئری اصلی `workbench-rows-v2` از `15_000` به `30_000` تا تب‌برگشت/refocus refetch نکند.

### ۴) `fetchWorkbenchRowsV2`: موازی کردن pre-filterها
فایل: `src/lib/pricing/workbench-queries.ts`
- در حال حاضر pre-filterها (owner, label, sale price, category) به‌صورت متوالی `await` می‌شوند. آن‌ها مستقل‌اند → جمع‌آوری در یک `Promise.all` و سپس ترکیب نتایج. (منطق early-return در صورت خالی بودن restrict حفظ می‌شود ولی بعد از resolve).
- این کار latency اولیه را تا حدود ۲۰۰–۵۰۰ms کم می‌کند.

### ۵) Memoize ردیف‌های جدول
فایل: `src/routes/_app.pricing.my-workbench.tsx`
- پیچیدن `DesktopRow` و `MobileCard` در `React.memo` با مقایسه سطحی روی `row.id`, `dirty`, `saving`, `publishError`, `stepPct`. اگر کاربر تنها یک ردیف را ویرایش کند، بقیه ۲۴ ردیف re-render نمی‌شوند.

### ۶) جلوگیری از invalidate اضافه پس از save
فایل: `src/routes/_app.pricing.my-workbench.tsx`
- بعد از ذخیره، `invalidateQueries` با key `["workbench-rows"]` و `["workbench-rows-v2"]` هر دو فراخوانی می‌شوند و سپس `refetchQueries` هم. کلید قدیمی `workbench-rows` بلا‌استفاده است → حذف. `refetchQueries` کافی است و invalidate جدا‌گانه حذف شود (یک round-trip به DB کمتر).
>>>>>>> origin/feat/phase-0-automation-ui

## گام ۳ — جدول‌هایی که دست نمی‌خورند (تأیید شما)
مشتریان، persons، کارمندان، نقش‌ها، پیکربندی، academy، gamification، messenger، notifications، ai_*، bank_accounts، knowledge_*، daily_mood_*، automation_*، seed دستمزد/جریمه/کاپیتال، `currencies/currency_sources`, `price_change_reasons`, `settlement_types`, `payment_terms`, `shipping_cost_rules`, `marketing_channels`, `sale_price_types`, `validation_rules`, `workflow_settings`, `invoice_workflow_stages`, `role_permissions`, `custom_roles`, `user_roles`, `profiles`, `auth.users`.

<<<<<<< HEAD
## گام ۴ — خالی کردن Storage buckets
با ابزار Storage:
1. لیست همه bucketها را می‌گیرم (`storage.buckets`).
2. برای هر bucket: `DELETE FROM storage.objects WHERE bucket_id = '<name>'` (فقط فایل‌ها، خود bucket و پیکربندی‌اش می‌ماند).
3. تأیید با `SELECT bucket_id, COUNT(*) FROM storage.objects GROUP BY bucket_id`.

اگر می‌خواهید bucket خاصی (مثلاً `avatars` یا لوگو) دست نخورد، قبل از اجرا نامش را بگویید.

## گام ۵ — تأیید نهایی
- `SELECT COUNT(*)` روی ~۱۰ جدول گروه پاک‌شده → باید همه صفر باشند.
- `SELECT COUNT(*)` روی `profiles`, `user_roles`, `role_permissions`, `currencies` → باید بدون تغییر.
- در مرورگر hard-reload (Ctrl+Shift+R) تا React Query cache پاک شود.

## ریسک‌های باقی‌مانده
- **برگشت‌ناپذیر است** — تنها راه برگشت، import فایل export گام ۱ است.
- شماره‌گذارهای فاکتور/کوت (`sales_quote_counters`, `waybill_number_counter`, `product_sku_counters`) reset می‌شوند → شماره‌های بعدی از ۱ شروع می‌شوند.
- اگر migrationای در آینده به این جدول‌ها seed دیتای واقعی اضافه کرده باشد، پاک می‌شود. (بررسی: هیچ seed دیتای واقعی در migrationهای فعلی برای این جدول‌ها نیست.)
- Storage: لینک‌های عمومی به تصاویر قبلی 404 می‌دهند.
- بعد از پاکسازی، اگر کاربر با نقش sales/viewer وارد شود و صفحه محصولات را باز کند، لیست خالی است — این طبیعی است.

## تحویل نهایی گزارش
- فایل migration ایجادشده
- خروجی `COUNT(*)` قبل و بعد
- لیست bucketهای پاک‌شده و تعداد فایل حذف‌شده
- تأیید سلامت auth/roles

---
**اقدام شما الان:** گام ۱ (Export) را انجام دهید و «Export گرفتم، ادامه بده» بنویسید. اگر می‌خواهید bucket یا جدول خاصی از لیست حذف/اضافه شود، همین حالا بگویید.
=======
- LOW. فقط UI/data-fetching layer. هیچ تغییر schema/RLS/API.
- preload با hover ممکن است مصرف داده را کمی بالا ببرد؛ ولی فقط چانک‌های کوچک JS مسیرهای ماژول است (نه داده DB).

## بررسی self-host

- بدون CDN جدید، بدون secret، بدون dependency جدید.
- اپ همچنان روی Linux+Docker+Supabase self-host بدون تغییر کار می‌کند.

## تأیید پس از اجرا

- `npm run build` و `npm run lint`.
- مسیر دستی: ورود → ساید‌بار → hover روی ماژول‌های مختلف → کلیک. باید تقریباً بدون تأخیر باز شوند.
- «کارگاه قیمت من»: بارگذاری اولیه باید نسبت به قبل سریع‌تر باشد؛ ویرایش یک ردیف نباید بقیه را re-render کند (DevTools Profiler).
>>>>>>> origin/feat/phase-0-automation-ui
