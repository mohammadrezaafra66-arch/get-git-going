# ممیزی کامل موارد 211 تا 218

تاریخ ممیزی: 2026-07-29  
محیط بررسی: LAN تست `http://192.168.170.8:3100` و سرویس واتساپ `http://192.168.170.8:3002` / API داخلی `http://192.168.170.8:8002`  
نوع مأموریت: Read-only audit. هیچ اصلاح، migration، تغییر داده، commit یا push انجام نشده است.

## خلاصه مدیریتی

| شماره | عنوان | وضعیت | فرانت | Backend | Database | Permission | تست واقعی | مهم‌ترین نقص | مدرک |
|---|---|---|---|---|---|---|---|---|---|
| 211 | رد پیش‌فاکتور و اطلاع‌رسانی فروشنده | ساخته شده ولی تست کامل مرورگر/سناریوی نوشتنی نشده | دارد | دارد | دارد | دارد | Read-only فقط | اعلان دیده‌شد از مسیر عمومی notification است، نه popup اختصاصی اجباری در صفحه اصلی | `src/routes/_app.sales.quotes.$quoteId.tsx:618`, `supabase/migrations/20260729143000_224_quote_rejection_notification.sql:94` |
| 212-A | کنترل اعتبار پایه | ساخته شده ولی نیازمند تست کنترل‌شده | دارد | دارد | دارد | دارد | Read-only فقط | اعتبارسنجی write واقعی انجام نشد | `src/routes/_app.sales.quotes.new.tsx:416`, `supabase/migrations/20260729170000_212_quote_credit_commitment_and_stock_guard.sql:285` |
| 212-B | معوق با تعهد فروشنده | ناقص و نیازمند اصلاح | popup و ذخیره متن دارد | مسیر ثبت دارد | snapshot دارد | دارد | Read-only فقط | پیگیری deadline، اتصال فیش و workflow عدم ایفای تعهد کامل نیست | `QuoteCreationBlockDialog.tsx:55`, migration `:296` |
| 212-C | بیش از اعتبار با تعهد کسری | ناقص و نیازمند اصلاح | popup دارد | مسیر ثبت دارد | snapshot دارد | دارد | Read-only فقط | deadline پایان روز و پیگیری ایفای تعهد کامل نیست | `QuoteCreationBlockDialog.tsx:60`, migration `:330` |
| 212.9 | بدون اعتبار با تأیید حسابداری | تعارض نیازمندی دارد | popup دارد | self-attestation را ذخیره می‌کند | snapshot دارد | دارد | Read-only فقط | تأیید حسابداری واقعی نیست؛ ادعای فروشنده است | `QuoteCreationBlockDialog.tsx:65`, migration `:309` |
| 212.8 | کنترل موجودی | ساخته شده ولی نیازمند تست کنترل‌شده | هنگام ثبت و قطعی‌سازی پیام دارد | هنگام ثبت enforce دارد؛ قطعی‌سازی از check استفاده می‌کند | `warehouse_stock` | دارد | Read-only فقط | race condition/finalize transactional از شواهد فعلی کامل اثبات نشد | `quotes.new.tsx:350`, migration `:250`, `quotes.$quoteId.tsx:455` |
| 213 | محاسبه امتیاز و اعتبار مشتری | ساخته شده ولی نیازمند تست کنترل‌شده | دارد | RPC/trigger دارد | داده دارد | دارد | Read-only فقط | با داده واقعی write نشد؛ صحت عددی کامل نیازمند سناریوی کنترل‌شده است | `useDynamicScoring.ts:136`, migration `20260729190000` |
| 214 | انتقال گزارش واتساپ | کامل و قابل استفاده در سطح read-only | دارد | proxy دارد | external API | نقش‌محور | API 8002 پاسخ داد | sync بر اساس polling 30 ثانیه است، نه لحظه‌ای واقعی WebSocket | `WhatsappTopProductsCard.tsx:43`, `whatsapp-top-products.functions.ts:146` |
| 214.1 | Purchase Advisor با فروشندگان واقعی | ساخته شده ولی خروجی AI تست نوشتنی/مدل نشده | دارد | prompt فروشندگان دارد | external API + DB | دارد | Read-only فقط | تضمین ضد hallucination فقط با prompt است؛ پاسخ واقعی AI تست نشد | `purchase-advisor.functions.ts:96`, `:184` |
| 215 | بدون شرح نیازمندی در فایل مأموریت | بدون شرح نیازمندی | - | migration مرتبط پیدا شد | - | - | - | نیازمندی رسمی در متن ممیزی وجود ندارد | `supabase/migrations/20260728190000_215_fix_price_notify_app_role_cast.sql` |
| 216 | بدون شرح نیازمندی در فایل مأموریت | بدون شرح نیازمندی | - | migration مرتبط پیدا شد | - | - | - | نیازمندی رسمی در متن ممیزی وجود ندارد | `supabase/migrations/20260728190500_216_fix_notification_queue_type_check.sql` |
| 217 | تعریف ویزیتور | کامل و قابل استفاده | دارد | جدول و RLS دارد | دارد | admin/manager write | Runtime 200 + DB table | import/search پیشرفته ندارد، ولی در نیاز اصلی اجباری نبود | `src/routes/_app.admin.visitors.tsx:51`, migration `20260728203000:12` |
| 217.1 | انتخاب ویزیتور دیگر در پیش‌فاکتور | کامل و قابل استفاده | دارد | RPC ذخیره می‌کند | `sales_quotes.visitor_id` | active-only | Runtime 307/guard + DB active=1 | فیلد فقط وقتی ویزیتور فعال هست دیده می‌شود | `quotes.new.tsx:619`, migration `:48` |
| 218 | نوع رسید اسکرین‌شات همراه بانک | ساخته شده ولی تست ثبت write انجام نشد | دارد | insert payload دارد | ستون دارد | دارد | Read-only فقط | فیلتر لیست اختصاصی ندارد؛ upload/preview همان سیستم عمومی است | `PaymentReceiptForm.tsx:1958`, migration `20260729193000:14` |

## وضعیت Git و Runtime

- Branch: `feature/navigation-modernization`
- HEAD: `0201160e9f411d1fd344e9ec68a15fdbbbb893a5`
- آخرین commit: `0201160e feat(accounting): mark mobile bank screenshot receipts`
- Working tree قبل/حین ممیزی فقط untrackedهای قبلی و فایل مأموریت را نشان می‌داد؛ بعد از ممیزی فقط سه فایل گزارش جدید اضافه می‌شوند.
- کانتینرهای LAN: `afrakala-lan-web` healthy، `afrakala-lan-kong` healthy، `afrakala-lan-db` healthy.
- `APP_GIT_SHA=0201160e`
- `APP_BUILD_TIME=2026-07-29T16:24:29Z`
- `WHATSAPP_PLATFORM_BASE_URL=http://192.168.170.8:8002`
- هیچ migration اجرا نشد، هیچ restart انجام نشد، هیچ داده‌ای write/update/delete نشد.

## روش و محدودیت ممیزی

روش:
- خواندن `AfraKala-audit-211-218-codex.md`
- خواندن `PROGRESS.md`
- ثبت branch/status/log
- trace کد از Route تا Component/Hook/RPC/DB
- SELECT read-only روی catalog و شمارش داده‌ها
- HTTP smoke test بدون login برای SSR routeها و API واتساپ

محدودیت:
- سناریوهای واقعی ثبت/رد/تأیید/acknowledge چون write روی داده واقعی می‌خواستند، اجرا نشدند.
- Browser automation با کاربر login‌شده اجرا نشد؛ بنابراین موارد نیازمند کلیک واقعی «در فرانت با login تأیید نشده» علامت خورده‌اند.
- پاسخ HTTP 200 فقط نشانه بالا بودن route است، نه تکمیل قابلیت.

## شواهد Runtime و دیتابیس

### HTTP/Runtime

| URL | نتیجه |
|---|---|
| `/api/version` | 200، commit `0201160e` |
| `/sales/quotes/new` | 307 redirect، route محافظت‌شده |
| `/sales/quotes` | 200 |
| `/my-rejected-quotes` | 200 |
| `/notifications` | 200 |
| `/accounting/dynamic-capital` | 200 |
| `/pricing/market-intelligence` | 200 |
| `/operations/purchase-advisor` | 200 |
| `/admin/visitors` | 200 |
| `/accounting/receipts/create` | 200 |
| `http://192.168.170.8:8002/api/v1/reporting/top-products?range=30&limit=5` | 200، JSON واقعی برگشت |
| `http://192.168.170.8:3002/reporting` | 200 |

### Database catalog

جدول‌های موجود:
- `sales_quotes`
- `sales_quote_items`
- `visitors`
- `payment_receipts`
- `notification_queue`
- `dynamic_entity_scores`
- `customer_capital_allocations_dynamic`
- `salesperson_capital_allocations_dynamic`

ستون‌های کلیدی موجود:
- `sales_quotes.reject_reason`
- `sales_quotes.quote_exception_type`
- `sales_quotes.quote_exception_text`
- `sales_quotes.quote_exception_snapshot`
- `sales_quotes.visitor_id`
- `sales_quotes.warehouse_id`
- `payment_receipts.is_mobile_bank_screenshot`
- `payment_receipts.receipt_image_url`
- `payment_receipts.has_perforation`
- `payment_receipts.is_typed_receipt`

RPCهای موجود:
- `create_sales_quote_with_items(text, text, text, timestamp with time zone, numeric, numeric, numeric, jsonb, uuid, uuid, boolean, numeric, boolean, uuid, uuid, text, integer, numeric, text)`
- `update_sales_quote_status(uuid, sales_quote_status, text)`
- `mark_notification_read(uuid)`
- `get_my_rejected_quotes(integer)`
- `calculate_dynamic_score(text, uuid, date)`
- `calculate_customer_realtime_credit(uuid)`
- `run_daily_capital_allocation(date, numeric, text)`

Constraintهای کلیدی موجود:
- `notification_queue_type_check`
- `sales_quotes_exception_type_check`

RLSهای دیده‌شده:
- `notification_queue`: `nq_select_own_or_admin`, `nq_update_own`
- `sales_quotes`: `sales_quotes_select`, `sales_quotes_insert`, `sales_quotes_update_privileged`, `sales_quotes_update_sales_own`
- `visitors`: `visitors_read`, `visitors_write`
- `payment_receipts`: `pr_select_privileged`, `pr_insert_admin_accountant`, `pr_update_admin_accountant`

داده‌های خوانده‌شده:
- `sales_quotes`: 39
- `visitors_active`: 1
- `payment_receipts`: 3
- `notification_queue where type='quote_rejected'`: 0
- `dynamic_entity_scores where entity_type='customer'`: 38
- `customer_capital_allocations_dynamic`: 1
- آخرین quote: `2026-07-29 14:40:11+00`
- آخرین receipt: `2026-07-27 10:28:45+00`
- آخرین score: `2026-07-29 12:33:55+00`

## گزارش موردی

### 211 — رد پیش‌فاکتور و اطلاع‌رسانی

وضعیت: ساخته شده ولی تست کامل مرورگر/سناریوی نوشتنی نشده.

شواهد:
- دکمه رد برای `sent` و نقش‌های مدیریتی/حسابدار/مالک: `src/routes/_app.sales.quotes.$quoteId.tsx:492-496`, `560-571`
- textarea دلیل رد با maxLength 2000 و توضیح نمایش به فروشنده: `src/routes/_app.sales.quotes.$quoteId.tsx:618-636`
- دکمه تأیید بدون reason غیرفعال می‌شود: `src/routes/_app.sales.quotes.$quoteId.tsx:674-688`
- RPC دلیل رد را اجباری می‌کند: `supabase/migrations/20260729143000_224_quote_rejection_notification.sql:94-95`
- دلیل در `sales_quotes.reject_reason` ذخیره می‌شود: `:103-107`
- notification برای `salesperson_id` همان quote ساخته می‌شود: `:109-129`
- صفحه اعلان‌ها `quote_rejected` را می‌شناسد و `mark_notification_read` دارد: `src/routes/_app.notifications.tsx:52`, `78`, `120`
- صفحه rejected quotes دلیل را از RPC می‌خواند: `src/routes/_app.my-rejected-quotes.tsx:30-40`, `89`

نتیجه:
- ذخیره دلیل و اعلان فروشنده در Backend ساخته شده است.
- popup اختصاصی ماندگار روی صفحه اصلی تا «دیده شد» به‌صورت جداگانه اثبات نشد؛ سیستم از notification_queue عمومی استفاده می‌کند.
- چون `notification_quote_rejected=0` بود، نمونه واقعی برای مشاهده بعد از reload وجود نداشت.

### 212 — اعتبار، معوق، تعهد و موجودی

وضعیت کلی: ساخته شده، اما برای استفاده عملی هنوز تست کنترل‌شده write و تکمیل workflowهای پیگیری تعهد لازم دارد.

#### 212-A اعتبار پایه

شواهد:
- فرانت credit را با `get_customer_dynamic_credit` می‌خواند: `src/routes/_app.sales.quotes.new.tsx:168-188`
- اگر معوق، بدون اعتبار، بدون customer یا کسری اعتبار باشد blocker می‌سازد: `:416-455`
- popup زمانی باز می‌شود که exception با blocker match نباشد: `:471-488`
- Backend با `get_customer_dynamic_credit` اعتبار را enforce می‌کند: `supabase/migrations/20260729170000_212_quote_credit_commitment_and_stock_guard.sql:285-343`

نتیجه: مسیر پایه ساخته شده؛ تست واقعی ایجاد پیش‌فاکتور به‌دلیل read-only بودن انجام نشد.

#### 212-B معوق با تعهد فروشنده

شواهد:
- متن تعهد معوق با `N دقیقه`: `src/components/sales/quotes/QuoteCreationBlockDialog.tsx:55-58`
- input دقیقه 1 تا 240: `:134-144`
- دکمه «ثبت با تعهد کارشناس فروش»: `:188-200`
- Backend نوع `overdue_salesperson_commitment` را enforce می‌کند: migration `20260729170000:296-308`
- snapshot تعهد ذخیره می‌شود: `:346-387`

نقص:
- جدول/فرآیند مستقل برای پیگیری deadline، اتصال فیش واریزی به تعهد، تشخیص عدم ایفای تعهد، و workflow 10 روزه فروش کالا در شواهد فعلی وجود ندارد.

#### 212-C بیش از اعتبار با تعهد کسری

شواهد:
- متن تعهد کسری: `QuoteCreationBlockDialog.tsx:60-63`
- نمایش اعتبار، مبلغ، کسری: `:153-168`
- دکمه «تعهد واریز کسری تا پایان روز»: `:202-214`
- Backend مسیر `credit_shortfall_salesperson_commitment` را enforce و snapshot کسری را ثبت می‌کند: migration `20260729170000:329-342`, `346-387`

نقص:
- deadline پایان روز کاری، timezone/تقویم کاری، پیگیری ایفای تعهد و اتصال فیش به تعهد کامل نیست.

#### 212.9 فاقد اعتبار با تأیید حسابداری

شواهد:
- متن تعهد «تأییدیه از خانم ماهرو گرفته‌ام»: `QuoteCreationBlockDialog.tsx:65-66`
- دکمه «ثبت با تأیید حسابداری»: `:216-227`
- Backend برای guest/no credit فقط `accounting_approval` را قبول می‌کند: migration `20260729170000:286-321`

نتیجه:
- این یک self-attestation است، نه approval واقعی خانم ماهرو. در گزارش نیازمندی باید به‌عنوان ریسک ثبت شود.

#### 212.8 موجودی

شواهد:
- فرانت قبل از submit موجودی را از `warehouse_stock` بررسی می‌کند: `src/routes/_app.sales.quotes.new.tsx:350-413`
- Backend هنگام ایجاد، موجودی را enforce و نام کالا/تعداد/موجودی را در exception می‌آورد: migration `20260729170000:250-281`
- هنگام قطعی‌سازی، فرانت `checkQuoteStockAvailability` را اجرا می‌کند: `src/routes/_app.sales.quotes.$quoteId.tsx:455-462`
- اگر کسری باشد، دکمه تأیید غیرفعال است و پیام نام/نیاز/موجودی می‌دهد: `:659-681`

نقص:
- شواهد کافی برای transactional deduction، race condition و جلوگیری از دوبار کم‌شدن موجودی در سطح DB در این ممیزی استخراج نشد.

### 213 — محاسبه امتیاز و اعتبار مشتری

وضعیت: ساخته شده ولی نیازمند تست کنترل‌شده.

شواهد:
- UI امتیازها را از `dynamic_entity_scores` می‌خواند و upsert می‌کند: `src/hooks/credit/useDynamicScoring.ts:105-183`
- محاسبه read-only از RPC `calculate_dynamic_score`: `:126-143`
- UI realtime credit از `calculate_customer_realtime_credit` می‌خواند: `:344-357`
- UI با تغییر وزن/پارامتر/تخصیص invalidate realtime می‌کند: `src/components/credit/DynamicScoringSection.tsx:108-135`
- migration 213 توضیح root cause قبلی را ثبت کرده: snapshot سرمایه بعد از تغییر score refresh نمی‌شد و سقف صفر می‌ماند: `supabase/migrations/20260729190000_213_refresh_dynamic_capital_after_score_change.sql:5-10`
- recompute جدید امتیاز salesperson و customer را دوباره محاسبه و allocationها را upsert می‌کند: `:114-120`, `:205-214`, `:288-301`
- اگر ledger مصرف سرمایه داشته باشد overwrite نمی‌کند و audit می‌زند: `:61-101`

Runtime DB:
- `dynamic_entity_scores` برای customer: 38 ردیف
- `customer_capital_allocations_dynamic`: 1 ردیف

نتیجه:
- root cause قبلی در migration توضیح داده و سازوکار refresh ساخته شده است.
- برای اعلام کامل، باید یک مشتری تستی با score تغییر کند، recompute/trigger اجرا شود، credit جدید در UI بعد از reload دیده شود. این تست write بود و انجام نشد.

### 214 — انتقال گزارش واتساپ

وضعیت: کامل و قابل استفاده در سطح read-only، با sync از نوع polling.

شواهد:
- مقصد کارت واتساپ را render می‌کند: `src/routes/_app.pricing.market-intelligence.tsx:25`, `147-153`
- کارت با `fetchWhatsappTopProducts` کار می‌کند و هر 30 ثانیه refetch دارد: `WhatsappTopProductsCard.tsx:38-45`
- endpoint دقیق source mirror شده: `src/lib/management/whatsapp-top-products.functions.ts:142-153`
- base URL از env سروری و default به 8002 است: `:14-15`
- timeout 5s و error state دارد: `:68-81`, `WhatsappTopProductsCard.tsx:73-76`
- جدول مقصد rank/name/status/mention/group/sender/source/last mention و دکمه فروشندگان را نشان می‌دهد: `WhatsappTopProductsCard.tsx:97-154`
- Runtime: `http://192.168.170.8:8002/api/v1/reporting/top-products?range=30&limit=5` با status 200 و JSON واقعی پاسخ داد.

نتیجه:
- داده از سرویس واتساپ خوانده می‌شود و mock/snapshot نیست.
- sync لحظه‌ای واقعی نیست؛ هر 30 ثانیه polling/refetch انجام می‌شود.

### 214.1 — Purchase Advisor و فروشندگان واقعی

وضعیت: ساخته شده ولی تست خروجی AI با write/interaction انجام نشد.

شواهد:
- صفحه فرم محصول/تعداد/فوریت را دارد: `src/routes/_app.operations.purchase-advisor.tsx:37-66`, `84-140`
- Backend محصول، قیمت خرید، تامین‌کننده و نرخ ارز را می‌خواند: `purchase-advisor.functions.ts:45-83`
- گزارش واتساپ top-products را می‌خواند: `:96`
- matching با `product_id`، نام برابر و includes انجام می‌شود: `:97-108`
- فروشندگان/فرستندگان اخیر محصول را از `getWhatsappProductSellersSnapshot` می‌گیرد: `:111-117`
- prompt شامل تقاضای واتساپ و فروشندگان/فرستندگان است: `:181-185`
- prompt از AI می‌خواهد فروشندگان واقعی را نام ببرد: `:187-193`
- AI call با `usageKey: "purchase_advisor.chat"` انجام می‌شود: `:195-202`

نتیجه:
- داده فروشندگان وارد prompt می‌شود.
- تضمین قطعی ضد hallucination و تطابق پاسخ UI با منبع بدون اجرای سناریوی واقعی و مشاهده پاسخ مدل کامل تأیید نشد.

### 215 و 216

وضعیت: بدون شرح نیازمندی در فایل مأموریت.

شواهد:
- فایل مأموریت فقط می‌گوید شرحی ندارند.
- دو migration مرتبط پیدا شد:
  - `supabase/migrations/20260728190000_215_fix_price_notify_app_role_cast.sql`
  - `supabase/migrations/20260728190500_216_fix_notification_queue_type_check.sql`

نتیجه: بدون متن پذیرش رسمی، وارد scope کامل/ناقص اعلام نمی‌شوند.

### 217 — تعریف ویزیتور

وضعیت: کامل و قابل استفاده.

شواهد:
- route `/admin/visitors` با guard admin/manager: `src/routes/_app.admin.visitors.tsx:51-55`
- صفحه list/create/edit/toggle دارد: `:76-90`, `:141-222`, `:224-260`
- audit برای create/update/status change دارد: `:130-139`, `:167-193`, `:219`
- جدول visitors با `full_name`, `code`, `phone`, `is_active`, `sort_order`, `notes`, `created_by`: migration `20260728203000:12-24`
- RLS: همه authenticated می‌خوانند، فقط admin/manager می‌نویسند: `:29-41`
- Runtime DB: `visitors_active=1`

نقص جزئی:
- import/search پیشرفته برای visitors پیدا نشد، اما در متن اصلی 217 الزام نبود.

### 217.1 — انتخاب ویزیتور دیگر در پیش‌فاکتور

وضعیت: کامل و قابل استفاده.

شواهد:
- فهرست فقط active visitors را می‌خواند: `src/routes/_app.sales.quotes.new.tsx:130-145`
- فیلد فقط وقتی `visitors.length > 0` باشد نمایش داده می‌شود و اختیاری است: `:619-642`
- مقدار در RPC ارسال می‌شود: `src/routes/_app.sales.quotes.new.tsx:320-321`
- Backend `p_visitor_id` را فقط اگر active باشد قبول می‌کند: migration `20260729170000:157-159`
- DB ستون `sales_quotes.visitor_id` و FK به `visitors`: migration `20260728203000:48-55`
- جزئیات quote visitor name را resolve و نمایش می‌دهد: `src/routes/_app.sales.quotes.$quoteId.tsx:125-139`, `226`
- PDF هم visitor_name می‌گیرد: `src/routes/_app.sales.quotes.$quoteId.tsx:517-523`

نتیجه: ثبت‌کننده می‌تواند visitor متفاوت از خودش را انتخاب کند؛ `salesperson_id` و `visitor_id` جدا هستند.

### 218 — نوع رسید اسکرین‌شات همراه بانک

وضعیت: ساخته شده ولی تست ثبت write انجام نشد.

شواهد:
- UI کنار پرفراژ و فیش تایپی checkbox دارد: `src/shared/components/PaymentReceiptForm.tsx:1939-1968`
- form state و payload آن را ارسال می‌کند: `:940-963`
- schema/default/types در کد وجود دارد: `PaymentReceiptForm.tsx:183-230`, `src/integrations/supabase/types.ts:5331`
- DB ستون دارد: `supabase/migrations/20260729193000_218_mobile_bank_screenshot_receipt.sql:14`
- جزئیات فیش آن را نشان می‌دهد: `src/routes/_app.accounting.receipts.$receiptId.tsx:557-559`
- خروجی اکسل آن را select و map می‌کند: `src/routes/_app.accounting.receipts.tsx:112-120`, `218`
- اسناد آپلود/preview از سیستم عمومی `ReceiptDocumentPicker` و `PaymentReceiptDocuments` استفاده می‌کند؛ ستون جدید در recompute warning لحاظ شده است: `src/components/accounting/PaymentReceiptDocuments.tsx:884-927`

نتیجه:
- label تنها نیست؛ form state، payload، DB، detail و export وصل هستند.
- filter اختصاصی در لیست برای این نوع رسید دیده نشد.
- تست واقعی ثبت و reload به دلیل read-only بودن انجام نشد.

## پاسخ‌های صریح نهایی

1. آیا دلیل رد پیش‌فاکتور ذخیره می‌شود؟ بله، در `sales_quotes.reject_reason`.
2. آیا برای فروشنده صحیح نمایش داده می‌شود؟ Backend notification برای `salesperson_id` می‌سازد؛ نمایش در notification عمومی ساخته شده، اما با داده واقعی تست نشد.
3. آیا اعلان تا «دیده شد» باقی می‌ماند؟ notification_queue با `mark_notification_read` وجود دارد؛ popup اختصاصی اجباری صفحه اصلی اثبات نشد.
4. آیا پیش‌فاکتور خلاف قوانین در Backend مسدود می‌شود؟ برای اعتبار/معوق/موجودی در `create_sales_quote_with_items` بله؛ race/finalize کامل نیازمند تست بیشتر است.
5. آیا کنترل اعتبار کار می‌کند؟ کد و RPC وجود دارد؛ تست write انجام نشد.
6. آیا تعهد معوق ذخیره و پیگیری می‌شود؟ ذخیره snapshot بله؛ پیگیری deadline/فیش/عدم ایفای تعهد ناقص است.
7. آیا تعهد بیش از اعتبار ذخیره و پیگیری می‌شود؟ ذخیره snapshot بله؛ پیگیری deadline/ایفا ناقص است.
8. تأیید حسابداری واقعی است یا Self-attestation؟ Self-attestation.
9. موجودی هنگام ثبت کنترل می‌شود؟ بله در UI و Backend.
10. هنگام قطعی‌سازی مجدد کنترل می‌شود؟ UI کنترل می‌کند؛ enforce کامل transactional از شواهد فعلی کامل اثبات نشد.
11. موجودی منفی و Race Condition کنترل است؟ تأیید نشده.
12. امتیاز و اعتبار مشتری محاسبه می‌شود؟ RPC/trigger/UI ساخته شده؛ صحت end-to-end نیازمند تست کنترل‌شده است.
13. Root Cause خرابی چیست؟ snapshot سرمایه بعد از تغییر score refresh نمی‌شد و allocation صفر می‌ماند؛ در migration 213 ثبت شده است.
14. گزارش واتساپ از پورت 3002 خوانده می‌شود؟ UI از API پلتفرم در 8002 می‌خواند که همان backend سرویس reporting است؛ صفحه 3002 هم بالا است.
15. تغییر مبدأ در مقصد دیده می‌شود؟ با polling هر 30 ثانیه باید دیده شود؛ تغییر زنده مبدأ تست نشد.
16. تأخیر Sync چقدر است؟ 30 ثانیه refetch interval، staleTime 15 ثانیه.
17. Purchase Advisor از فروشندگان واقعی استفاده می‌کند؟ داده فروشندگان واتساپ را وارد prompt می‌کند.
18. فروشندگان واقعی در پاسخ دیده می‌شوند؟ بدون اجرای AI با سناریوی واقعی تأیید نشده.
19. ویزیتور قابل تعریف است؟ بله.
20. ثبت‌کننده می‌تواند ویزیتور دیگری انتخاب کند؟ بله، اگر ویزیتور active وجود داشته باشد.
21. نوع رسید اسکرین‌شات در فرانت وجود دارد؟ بله.
22. در Backend و Database ذخیره می‌شود؟ payload و ستون DB وجود دارد؛ ثبت واقعی read-only تست نشد.
23. چه مواردی کامل‌اند؟ 214 read-only mirror، 217، 217.1.
24. چه مواردی ناقص‌اند؟ 212-B، 212-C، 212.9، بخش‌هایی از 212.8، 214.1 از نظر ضد hallucination، 218 از نظر تست write/filter.
25. چه مواردی فقط ظاهر دارند؟ هیچ موردی فقط label تنها نیست؛ 218 فراتر از label است.
26. چه مواردی ساخته نشده‌اند؟ برای 215/216 شرح نیازمندی نداریم؛ workflow کامل پیگیری تعهدات 212 ساخته نشده است.
27. کدام‌ها در مرورگر تست شده‌اند؟ فقط SSR/HTTP route smoke بدون login؛ تست login واقعی انجام نشد.
28. قبل از استفاده عملی چه اصلاحاتی ضروری است؟ تکمیل workflow تعهدات 212، تست write کنترل‌شده 211/212/218، اثبات transactional stock finalize، و تست AI purchase advisor با محصول دارای فروشنده.

## تأیید پایان ممیزی

- اصلاح کد انجام نشد.
- migration ایجاد یا اجرا نشد.
- داده زنده تغییر نکرد.
- runtime نامرتبط restart نشد.
- commit/push انجام نشد.
- فایل نامرتبط دست‌کاری نشد.

## E2E Browser Validation Addendum

تاریخ مرحله دوم: 2026-07-29  
گزارش کامل: `docs/audits/211-218-e2e-browser-validation.md`  
مسیر شواهد تصویری: `docs/audits/evidence/211-218-e2e/`

نتیجه مرحله دوم:

- محیط LAN تأیید شد: `afrakala-lan-web`, `afrakala-lan-db`, DB=`afrakala`, `APP_GIT_SHA=0201160e`.
- مرورگر واقعی باز شد، اما session معتبر با نقش عملیاتی وجود نداشت. کاربر در UI به‌صورت `بدون نقش` دیده شد و `/sales/quotes/new` به `/login` رفت.
- credential تستی یا `storageState` قابل استفاده پیدا نشد؛ هیچ password/token چاپ یا تغییر داده نشد.
- به همین دلیل، تست‌های نوشتنی واقعی برای 211، 212، 213، 217، 217.1 و 218 از نظر E2E مرورگر `BLOCKED` شدند.
- هیچ رکوردی با prefix `E2E_AUDIT_20260729_` ساخته نشد و شمارش DB قبل/بعد یکسان ماند.
- سرویس واتساپ در `3002` و API در `8002` قابل دسترسی بود. API از host و از داخل کانتینر web پاسخ 200 داد.
- صفحه مقصد 214 در مرورگر عنوان کارت واتساپ را نشان داد، اما چون server function آن نقش `admin/manager/accountant` می‌خواهد و session فعلی `بدون نقش` بود، داده جدول در UI با نقش مجاز E2E تأیید نشد.
- برای 214.1 محصول واقعی واتساپ با فروشنده/فرستنده از API پیدا شد، اما اجرای AI در Purchase Advisor به‌دلیل نبود session نقش‌دار تأیید نشد.

جدول وضعیت مرحله دوم:

| شماره | نتیجه E2E |
|---|---|
| 211 | BLOCKED |
| 212-A | BLOCKED |
| 212-B | BLOCKED |
| 212-C | BLOCKED |
| 212.8 | BLOCKED |
| 212.9 | BLOCKED |
| 213 | BLOCKED |
| 214 | IMPLEMENTED — E2E NOT VERIFIED |
| 214.1 | IMPLEMENTED — E2E NOT VERIFIED |
| 215 | REQUIREMENT CONFLICT |
| 216 | REQUIREMENT CONFLICT |
| 217 | BLOCKED |
| 217.1 | BLOCKED |
| 218 | IMPLEMENTED — E2E NOT VERIFIED |
