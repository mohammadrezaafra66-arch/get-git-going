
# پلن — تفکیک رویدادها و سیستم نامزدی روزانهٔ فروش

Task ID: MKT-EVENTS+NOMINATION
Classification: PLAN ONLY — File edits allowed: No

## ۱) وضعیت فعلی (خلاصهٔ خواندنِ کد/DB)

- **`v_promotion_suggestions`**: view است که برای هر جفت `(product × marketing_channel)` امتیاز می‌سازد:
  `score = label_weight_sum × channel.weight × stock_factor × recency_factor(ln(1+qty_90d)/5, سقف 3)`.
  ستون‌های کمکی: `daily_quota, used_today (از audit_logs با action='promotion_suggestion_used'), remaining_today`.
  **هیچ ورودی‌ای از رویدادهای تعامل ندارد** و ورودی «نامزدی» ندارد.
- **`compute_promotion_scores(_channel_id, _min_score, _limit)`**: فقط SELECT از view با فیلتر سهمیه و مرتب‌سازی؛ ورودی boost/نامزدی ندارد.
- **CHECK فعلی روی `product_interaction_events.event_type`**:
  `('search_result_viewed','price_checked','chart_opened','product_details_opened','board_price_viewed')`.
  CHECK `source` هم شامل `sales_search, live_price_list, amin_hozoor_board, product_details, management_dashboard`.
- **`trackProductInteractionFn`** (server): `event_type` را با enum ثابت zod و CHECK دیتابیس اعتبارسنجی می‌کند؛ `user_id` سمت سرور ست می‌شود؛ درج با `supabaseAdmin`. کلاینت هیچ ستون sessionی نمی‌فرستد.
- **وزن‌های فعلی در توابع mi**:
  - `mi_get_demand_growth`: price_checked=4, board=3, chart=2, product_details_opened=2, search_result_viewed=1.
  - `mi_get_emerging_products`: همان وزن‌ها، آستانه `min_score=6`.
  - `mi_get_trending_products`: search×3, price×4, chart×2, board×1 (متفاوت با بقیه؛ نویز `search` بالاست).
  - `mi_get_top_checked_today`: فقط `price_checked+board_price_viewed` را می‌شمرد ولی برای انتخاب aggregate بقیه را هم می‌خواند.
  - `mi_get_seller_top_products`: `IN (price_checked, chart_opened, product_details_opened, search_result_viewed)`.
  - `mi_get_hot_brands / hot_categories`: بدون وزن — فقط `COUNT(*)`.
  - `mi_get_market_index / price_movers`: مبتنی بر `product_sale_price_history` — رویدادی نیستند، دست نمی‌خورند.
- **`src/routes/_app.sales.search.tsx`** — نقاط شلیک فعلی:
  - خط ۳۳۶: پس از موفقیت `get_sales_search_products` برای **هر ردیفِ نتیجه** یک `search_result_viewed` شلیک می‌شود → منبع اصلی نویز.
  - خط ۸۲۷: در دکمهٔ نمودار `chart_opened`.
  - خط ۱۰۰۲/۱۲۲۳: دکمهٔ «کپی متن فروش» — **فعلاً هیچ رویدادی شلیک نمی‌شود**.
  - کپیِ `price_checked` جای دیگری (خارج از این فایل) روی «انتخاب نوع قیمت / نمایش قیمت کامل» شلیک می‌شود.

## ۲) اهداف

- **الف** رویدادهای تقاضا فقط از عمل کاربر شکل بگیرند (نه از ظاهرشدن در نتایج). حذف نویز `search_result_viewed` بدون شکستن سازگاری داده‌های قبلی.
- **ب** سیستم نامزدی روزانهٔ کارشناس فروش که امتیاز نهاییِ پیشنهاد تبلیغ را **کران‌دار** بالا ببرد، از «تقاضای بازار» جدا باشد، سهمیه/سقف قابل‌تنظیم داشته باشد، auditable و RLS-safe.

## ۳) قیدها

- self-host؛ فقط migration جدید در `supabase/migrations/` (اعمال دستی با PowerShell).
- عدد سهمیه/بوست/سقف در **جدول policy** (نه enum، نه هاردکد).
- بدون تغییرِ نام/حذفِ ستون‌های موجود؛ افزودنی و backward-compatible.
- بدون گسترش صورت‌مسئله به ماژول‌های خارج از این طرح.

## ۴) فایل‌ها/آبجکت‌های تحت تأثیر (به‌صورت پیش‌نگری)

DB (migrationهای جدید):
- `product_interaction_events`: افزودن ستون `search_session_id uuid null`، افزودن مقدار مجاز `sales_text_copied` به CHECK `event_type` (drop+add same-name)، یونیک‌ایندکسِ **partial** روی `(user_id, product_id, search_session_id, event_type)` where `search_session_id IS NOT NULL`.
- `promotion_nominations` (جدید): `id, product_id fk, nominated_by uuid=auth.users, channel_id uuid null fk marketing_channels, reason_code text, nominated_on date default (now() AT TIME ZONE 'Asia/Tehran')::date, created_at, cancelled_at nullable, cancelled_by nullable`. GRANTs مطابق قواعد. RLS: SELECT برای manager/admin/sales خودش؛ INSERT/UPDATE فقط از RPC (revoke direct).
- `promotion_nomination_policy` (جدید، تک‌ردیفهٔ کلید-مقدار یا per-role): `role app_role, daily_quota_per_user int, per_product_daily_cap int, boost_per_nomination numeric, boost_cap_per_product numeric, is_active bool, updated_at`. seed پیش‌فرض غیرفعال یا با اعداد محافظه‌کار.
- RPCها (SECURITY DEFINER، `search_path=public`):
  - `nominate_product_for_promotion(_product_id, _channel_id, _reason_code) returns jsonb` — enforce سهمیهٔ روزانهٔ per user + per product cap + policy.is_active + role check با `has_role(auth.uid(),'sales')`.
  - `cancel_promotion_nomination(_nomination_id) returns jsonb` — همان‌روز، توسط nominated_by، برگرداندن سهمیه.
  - `get_promotion_nomination_quota() returns jsonb` — remaining_today per کاربر.
- `v_promotion_suggestions` (تغییر): افزودن CTE `noms_today` و ستون‌های جدید `sales_nomination_count`, `sales_nomination_boost` (کران‌دار به `boost_cap_per_product`)، ستون `market_score` (نامِ جدید برای score فعلی)، `final_score = market_score + sales_nomination_boost`. ستون `score` را برای سازگاری برابر `final_score` نگه می‌داریم.
- `compute_promotion_scores`: مرتب‌سازی و فیلترها بر اساس `final_score` (سیگنیچر پایدار).
- وزنِ واحد در توابع mi: تمام وزن‌ها به این جدول یکسان می‌شوند →
  `sales_text_copied=5, price_checked=4, board_price_viewed=3, chart_opened=2, product_details_opened=2, search_result_viewed=1` (search باقی می‌ماند برای تاریخِ داده‌های قدیمی، اما در آینده تولید نمی‌شود).
- `mi_get_trending_products`: تفکیک ستون جدید `sales_copy_count`، وزنِ اصلاح‌شده `search×1, details×2, chart×2, price×4, board×3, sales_text_copied×5`.
- `mi_get_hot_brands / hot_categories`: بازنویسیِ COUNT به SUM(weight) با همان جدول وزن.
- `mi_get_top_checked_today`: افزودن `sales_text_copied` به شمارش خرید-محور (اختیاری).
- `mi_get_seller_top_products`: افزودن `sales_text_copied` و `board_price_viewed` به IN لیست.

UI:
- `src/routes/_app.sales.search.tsx`:
  - افزودن `useRef<string>` برای `searchSessionId` که هنگام هر submit جست‌وجو `crypto.randomUUID()` می‌شود.
  - **حذف کامل شلیک `search_result_viewed`** (خط ۳۳۶).
  - در انتخاب/بزرگ‌کردن کارت → شلیک `product_details_opened` با `search_session_id`.
  - در «کپی متن فروش» → شلیک `sales_text_copied` با `search_session_id`.
  - `chart_opened` باقی می‌ماند، فقط `search_session_id` اضافه می‌شود.
- `src/lib/analytics/product-interactions.ts` و `product-interactions.functions.ts`: افزودن `sales_text_copied` به `InteractionEventType`/zod enum؛ افزودن پارامتر اختیاری `searchSessionId` و پاس‌دادن به سرور. سرور در insert `on conflict do nothing` استفاده کند وقتی session داده شده.
- UI نامزدی: دکمهٔ «پیشنهاد برای تبلیغ» فقط برای نقش `sales` روی کارتِ **انتخاب‌شده** در `_app.sales.search.tsx` با dialog کوچک انتخاب `channel` (اختیاری) و `reason_code` و نمایش «سهمیهٔ باقی‌مانده». دکمهٔ لغو برای نامزدیِ همان‌روز.
- `src/routes/_app.marketing.suggestions.tsx` (یا اسم فعلیِ صفحه): نمایش ستون‌های `market_score`, `sales_nomination_boost`, `final_score` جدا از هم.

## ۵) فازبندی

### فاز A — DB: تفکیک رویدادها + session dedup
- migration: افزودن `search_session_id`، توسعهٔ CHECK با `sales_text_copied`، یونیک‌ایندکسِ partial، به‌روزرسانی توابع mi (وزنِ واحد + gates جدید).
- وابستگی: هیچ. باید قبل از هر UI اعمال شود.
- تست پذیرش: `\d product_interaction_events` نشان‌دهندهٔ ستون و ایندکس؛ CHECK جدید مقدارِ `sales_text_copied` را می‌پذیرد؛ توابع `mi_get_demand_growth`/`trending`/`top_checked_today` قابل فراخوانی و بدون خطا.

### فاز B — UI: session id + حذف search_result_viewed + رویداد کپی
- تغییر `_app.sales.search.tsx`، `product-interactions.{ts,functions.ts}`.
- وابسته به فاز A.
- تست پذیرش: باز کردن صفحه، جست‌وجو، هیچ ردیفی از `search_result_viewed` در `product_interaction_events` برای این نشست وارد نمی‌شود؛ انتخاب کارت → یک ردیف `product_details_opened`؛ باز کردن نمودار → `chart_opened`؛ کپی متن → `sales_text_copied`؛ تکرارِ همان عملِ همان کارت در همان نشست ردیف دومی درج نمی‌کند (تست dedup).

### فاز C — DB: جدول نامزدی + policy + RPCها + توسعهٔ view/compute
- migration جداگانه.
- وابسته به فاز A (تنها ترتیب نه محتوا).
- تست پذیرش: با کاربرِ `sales` صدا زدن `nominate_product_for_promotion` سهمیه را کم می‌کند و ردیف می‌سازد؛ فراخوانی مجدد پس از سقف با پیام مناسب رد می‌شود؛ `cancel_...` همان‌روز سهمیه را برمی‌گرداند؛ `v_promotion_suggestions` ستون‌های `market_score, sales_nomination_boost, final_score` را برمی‌گرداند و boost کران‌دار است؛ نقش‌های غیرsales رد می‌شوند.

### فاز D — UI: دکمهٔ نامزدی در کارت انتخاب‌شده + نمایش سهمیه + لغو
- تغییر `_app.sales.search.tsx` (فقط بخش کارتِ انتخاب‌شده) + یک هوک کوچک برای فراخوانی RPCها.
- وابسته به فاز C.
- تست پذیرش: کاربر sales دکمه را می‌بیند، dialog باز می‌شود، انتخاب دلیل، ثبت موفق، تُست موفق، سهمیه به‌روز؛ کاربر غیرsales دکمه را نمی‌بیند؛ لغو در همان روز کار می‌کند.

### فاز E — UI: نمایش تفکیک در `/marketing/suggestions`
- نمایش سه ستون `market_score`, `sales_nomination_boost`, `final_score` + tooltip توضیح.
- وابسته به فاز C.
- تست پذیرش: ردیف‌ها با ترتیب `final_score` مرتب‌اند و boost فقط از نامزدی می‌آید.

## ۶) اثر migration/RLS/RBAC/audit

- migration: افزودنی، بدون drop ستون/جدول؛ ایندکس partial و CHECK re-create.
- RLS: `promotion_nominations` — SELECT برای manager/admin و nominated_by؛ INSERT/UPDATE از کلاینت revoke، فقط RPCها.
- RBAC: RPC نامزدی فقط برای `has_role(auth.uid(),'sales')` یا بالاتر (طبق policy).
- audit: هر nominate/cancel یک ردیف در `audit_logs` (action = `promotion_nominated` / `promotion_nomination_cancelled`).

## ۷) خطرها و stop-conditions

- خطر شکستنِ صفحه‌های موجود اگر `score` را از view حذف کنیم → **حفظ می‌شود** (alias به `final_score`).
- خطر ترتیبِ اعمال migrations دستی → پلن با شمارهٔ فاز و README کوتاه ارائه شود.
- Stop: اگر در فاز A تستِ CHECK یا ایندکس شکست خورد، به فاز B/C نروید.
- Stop: اگر policy با اعداد پیش‌فرض ریسک انفجارِ boost دارد، `is_active=false` seed شود تا تیم عدد بدهد.

## ۸) دستورهای بررسی

- `bun run build`، `bun run lint` (پس از هر فاز UI).
- SQL smoke: `select * from mi_get_demand_growth(1); select * from v_promotion_suggestions limit 5;`.

## ۹) کوچک‌ترین اسلایسِ ایمنِ بعدی

فقط **فاز A** به‌صورت یک migration مستقل و بدون هیچ تغییر UI.

## ۱۰) پرامپت پیشنهادی برای SAFE AGENT CHANGE بعدی

> «فاز A را اجرا کن: یک migration جدید در `supabase/migrations/` بساز که (۱) ستون `search_session_id uuid null` به `product_interaction_events` اضافه کند، (۲) CHECK `event_type` را drop و با افزودن `sales_text_copied` دوباره create کند، (۳) یونیک‌ایندکسِ partial روی `(user_id, product_id, search_session_id, event_type) where search_session_id is not null` بسازد، (۴) وزنِ واحد در توابع `mi_get_demand_growth`, `mi_get_emerging_products`, `mi_get_trending_products`, `mi_get_hot_brands`, `mi_get_hot_categories`, `mi_get_top_checked_today`, `mi_get_seller_top_products` را با جدول وزن {sales_text_copied=5, price_checked=4, board=3, chart=2, product_details_opened=2, search=1} همسان کند. بدون UI، بدون تغییر جدول‌های دیگر، بدون drop ستون. فقط فایل migration.»
