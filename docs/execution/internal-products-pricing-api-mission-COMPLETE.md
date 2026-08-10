# internal-products-pricing-api — گزارش نهایی

**تاریخ:** ۲۰۲۶-۰۸-۱۰ · **ابزار:** Claude Code · **برنچ:** `feature/navigation-modernization`
**مهاجرت:** `334` · **ریسک:** 🟢 کم — فقط افزودنی، فقط‌خواندنی، هیچ داده‌ای نوشته نشد

> راهنمای استفادهٔ واقعی به‌صورت جدا نوشته شده:
> **`docs/asan/internal-products-pricing-api-guide.md`**

---

## ۰. خلاصهٔ یک‌خطی

دو view فقط‌خواندنی روی PostgREST موجود (Kong، پورت ۹۰۰۰) اضافه شد که هر محصول را با
همهٔ انواع قیمتش برمی‌گرداند، به‌علاوهٔ یک نقش تازهٔ Postgres (`products_api_readonly`)
که **فقط** همان دو view را می‌بیند و هیچ چیز دیگری را. سرور جدید، framework جدید، و
جدول جدید ساخته نشد.

---

## ۱. فاز ۱ — کشف کامل «قیمت» در این پروژه

روی دیتابیس زندهٔ `afrakala` (کانتینر `afrakala-lan-db`) گرفته شد، نه از روی کد.
۲۰ relation با نام قیمت‌دار و ۵۶ ستون قیمت‌دار پیدا شد. خلاصهٔ تصمیم‌گیرنده:

| نوع قیمت | جدول/منبع | ردیف زنده | لازم برای این API؟ |
|---|---|---|---|
| **قیمت فروش محاسبه‌شده** (نقدی/چکی/همکاری × تسویه) | `product_computed_prices` | **۲۵۳۸** (۳۱۶ محصول) | ✅ **بله — منبع اصلی «قیمت فعلی»** |
| **تاریخچهٔ قیمت فروش اعلام‌شده** | `product_sale_price_history` | **۳۹۸۵** (۲۹۵ محصول، ۴۹۹ جفت) | ✅ بله — `previous_price` و `last_updated_at` و کف قیمت |
| **قیمت خرید** | `purchase_prices` | **۳۵۵۶** کل / **۳۸۴ فعال** (۳۲۱ محصول) | ✅ بله |
| انواع قیمت فروش | `sale_price_types` | ۳ (نقدی، چکی، همکاری) | ✅ بله |
| انواع تسویه | `settlement_types` | ۱۰ (۶ فعال) | ✅ بله |
| قواعد قیمت‌گذاری | `pricing_rules` | ۱۱ | ✅ فقط شناسه (`pricing_rule_id`) |
| قواعد هزینهٔ حمل | `shipping_cost_rules` | ۴ | ✅ غیرمستقیم (`shipping_cost` در محاسبه) |
| نرخ ارز | `currency_rates` | ۲۰۲ | ✅ غیرمستقیم (`currency_rate_used`) |
| اسنپ‌شات محاسبات | `price_calculation_snapshots` | ۷۶۰۲ | ❌ لاگ داخلی موتور، نه قیمت جاری |
| صف بازمحاسبه | `pricing_recompute_queue` | ۴۱۷۷۶ | ❌ صف کار |
| لیست‌های فروش | `sale_lists` / `sale_list_items` | ۲۰ / ۱۸۳۷ | ❌ **هر ۲۰ لیست `draft` و هیچ‌کدام منتشر نشده‌اند؛ اسم‌ها هم آزمایشی‌اند («تست»، «3333333»). داده‌ی کاری نیست.** |
| **لیست قیمت (نسل قدیم)** | `price_lists` / `price_list_items` | **۰ / ۰** | ❌ **یتیم — کاملاً خالی** |
| هشدار قیمت | `price_alert_rules` / `_notifications` | ۱ / ۰ | ❌ تقریباً یتیم |
| کش قیمت استعلام | `inquiry_price_cache` | ۱ | ❌ تقریباً یتیم |
| برد قیمت‌گذاری | `pricing_board_*` | ۱ | ❌ تنظیمات UI |
| رصدخانه قیمت بازار | Dynamic Table (ترب/پورچیستا) | — | ❌ **قیمت رقبا است، نه قیمت ما** |

**آیا قیمت‌ها وابسته به نرخ ارز هستند؟ بله، ولی نه لحظه‌ای.**
۱۴۰ محصول ارز پایه‌شان `usd` است و ۱۳۰ قیمت خرید فعال به دلار ثبت شده.
`product_computed_prices` نرخ استفاده‌شده را در ستون `currency_rate` **منجمد** می‌کند،
یعنی قیمت تا اجرای بعدی موتور بازمحاسبه، با نرخ قدیمی می‌ماند. این نکته در راهنما هم
صریح نوشته شد تا مالک عدد را اشتباه تفسیر نکند.

### چیزی که از قبل بود و **نتوانستیم** استفاده کنیم — و چرا

طبق قانون «قبل از ساختن بگرد»، سه چیز مرتبط پیدا شد:

1. **`v_latest_active_purchase_prices`** — دقیقاً همان «آخرین قیمت خرید فعال» را حساب
   می‌کند. اول از همین استفاده شد، ولی **dry-run زنده رد کرد**:
   این view عمداً `security_invoker=true` است، پس `purchase_prices` را با حقوق
   *فراخوان* می‌خواند و نقش تازه با خطای `permission denied for table purchase_prices`
   می‌خورد. تغییر آن flag یعنی تضعیف یک تضمین امنیتی موجود اپ — پس **دست نخورد** و
   همان `DISTINCT ON` (۶ خط) با کامنت توضیحی در view جدید تکرار شد.
2. **`product_computed_prices_public`** — به `is_viewer_only(uid())` وابسته است،
   یعنی به کاربر لاگین‌شدهٔ اپ. این API کاربر ندارد. استفاده نشد.
3. **`get_sales_search_products()`** — منطق درست را دارد ولی `auth.uid()` را اجباری
   می‌کند و RBAC اپ را چک می‌کند. قابل استفادهٔ مستقیم نبود؛ **شکل قیمتش عیناً تقلید شد**
   و بعد با تست برابری اثبات شد (بخش ۵).

**چیزی که از قبل بود و استفاده شد:** تابع `get_product_price_bounds()` برای کف/سقف قیمت
دوباره نوشته نشد — view مستقیماً همان تابع را صدا می‌زند، پس کف قیمتی که API گزارش می‌کند
و کفی که گارد پیش‌فاکتور اعمال می‌کند هرگز از هم جدا نمی‌شوند.

---

## ۲. فاز ۲ — شکل خروجی

دو view، هر دو `public`، هر دو مالکیت `supabase_admin`:

**`api_products_pricing`** — یک ردیف به‌ازای هر محصول (۳۵۵ ردیف).
مشخصات محصول + `brand`/`category` + `purchase_price` (jsonb) +
`price_bounds` (jsonb، از تابع مشترک) + `sale_prices` (آرایهٔ jsonb مرتب‌شده).

**`api_product_price_rows`** — یک ردیف به‌ازای هر (محصول × نوع قیمت × نوع تسویه)
= ۳۰۲۷ ردیف، که ۲۵۳۸ تای آن قیمت واقعی دارد. برای اکسل/CSV.

قواعد شکل‌دهی، عیناً مثل اپ:
- ردیف‌های پایه (`settlement_type_id IS NULL`) برای **هر سه نوع قیمت فعال** ساخته می‌شوند
  حتی وقتی قیمتی وجود ندارد (`has_price=false`).
- ردیف‌های تسویه فقط وقتی ساخته می‌شوند که موتور واقعاً قیمت تولید کرده باشد.
- `current_price` = `product_computed_prices.rounded_sale_price`
- `previous_price` / `announced_price` / `last_updated_at` از `product_sale_price_history`

---

## ۳. فاز ۳ — امنیت و دسترسی

**نقش:** `products_api_readonly` — `NOLOGIN`، `NOINHERIT`، بدون superuser، بدون bypassrls.
عضو **هیچ** نقش دیگری نیست (نه `anon`، نه `authenticated`، نه نقش‌های اپ).
تنها عضوِ آن `authenticator` است، چون PostgREST باید بتواند `SET ROLE` کند.

**دسترسی (تأیید زنده روی دیتابیس):**

| بررسی | نتیجه |
|---|---|
| relation هایی که می‌تواند `SELECT` کند | **دقیقاً ۲** — همان دو view |
| هر privilege نوشتنی (INSERT/UPDATE/DELETE/TRUNCATE) در کل دیتابیس | **۰** |
| عضویت در نقش دیگر | **۰** |
| تفاوت سطح دسترسی RPC با `anon` | **۰ تابع** (دقیقاً برابر، نه بیشتر) |
| هر دو view auto-updatable هستند؟ | **NO / NO** (UNION و چند-جدولی‌اند، ذاتاً نوشتنی نیستند) |

**RLS:** هر ۴ جدول مبدأ (`products`, `product_computed_prices`,
`product_sale_price_history`, `purchase_prices`) RLS فعال دارند. **policy تازه‌ای نوشته
نشد و عمداً هم نباید نوشته شود.** دلیل: مرز دسترسی این API «GRANT روی view» است نه RLS.
view مالکیت `supabase_admin` دارد، پس جدول‌های زیرین را با حقوق مالک می‌خواند و RLS
*داخل view* دور زده می‌شود. راه جایگزین — دادن `SELECT` روی جدول‌های خام به نقش + نوشتن
policy — دقیقاً همان چیزی است که خواستهٔ «هیچ دسترسی به جدول‌های خام» را نقض می‌کند.

**⚠️ یک تلهٔ واقعی که گرفته شد:** `supabase_admin` یک `ALTER DEFAULT PRIVILEGES` دارد که
روی **هر relation تازه** به `postgres, anon, authenticated, service_role` حقوق کامل
(`arwdDxt`) می‌دهد. یعنی بدون کار اضافه، هر کاربر لاگین‌شدهٔ اپ می‌توانست از این view
**قیمت خرید** را بخواند. مهاجرت صریحاً بعد از `CREATE VIEW` آن‌ها را `REVOKE` می‌کند.
**آن دو خط REVOKE را حذف نکنید.**

**Credential:** یک JWT با امضای HS256 روی همان `JWT_SECRET` استک، با claim
`"role": "products_api_readonly"`. با اسکریپت
`deploy/lan/scripts/issue-products-api-credential.ps1` ساخته می‌شود که دقیقاً همان تابع
`New-SupabaseJwt` موجود در `init-lan.ps1` را دنبال می‌کند.

**توکن واقعی در هیچ فایل commit‌شده‌ای نیست.** اسکریپت آن را می‌نویسد در:

```
%USERPROFILE%\.afrakala\products-api-credential.txt
```

که خارج از هر working tree گیت است و با `icacls` فقط برای کاربر جاری قابل خواندن شد.
اسکریپت خودِ توکن را چاپ نمی‌کند (فقط ۱۲ کاراکتر اول + تاریخ انقضا + مسیر فایل).

---

## ۴. فاز ۴ — فعال‌سازی و تست واقعی

مهاجرت با `docker cp` + `psql -f` + `--single-transaction -v ON_ERROR_STOP=1` اعمال شد
(خروجی: `EXIT=0`)، سپس `docker restart afrakala-lan-rest`.

### تست‌های زنده از بیرون (`curl` مستقل، شبیه یک اسکریپت خارجی)

| # | درخواست | نتیجه | انتظار |
|---|---|---|---|
| ۱ | credential درست → `api_products_pricing` | **200**، دادهٔ واقعی | ✅ |
| ۲ | بدون هیچ credential | **401** `No API key found in request` | ✅ رد شد |
| ۳ | فقط `apikey` (نقش `anon`) | **401** `permission denied for view api_products_pricing` | ✅ رد شد |
| ۴ | توکن جعلی/امضای غلط | **401** `JWSError` | ✅ رد شد |
| ۵ | credential درست → جدول خام `products` | **403** `permission denied for table products` | ✅ رد شد |
| ۶ | credential درست → جدول خام `purchase_prices` | **403** `permission denied for table purchase_prices` | ✅ رد شد |
| ۷ | credential درست → `POST` (تلاش نوشتن) | **رد** — `cannot insert into view` | ✅ نوشتن ممکن نیست |
| ۸ | credential درست → `POST /rpc/get_sales_search_products` | **400** `unauthenticated` | ✅ رد شد |

### سرعت و حجم (اندازه‌گیری واقعی، شبکهٔ LAN)

| درخواست | حجم | زمان |
|---|---|---|
| یک محصول (`?sku=eq....`) | ۲٫۸ KB | **۷ میلی‌ثانیه** |
| همهٔ ۳۵۵ محصول با همهٔ قیمت‌ها | ۲٫۳۵ MB | **۰٫۱۰–۰٫۱۲ ثانیه** (۳ اجرا) |
| جدول تخت، ۳۰۲۷ ردیف | ۳٫۱۸ MB | **۰٫۰۷ ثانیه** |

محدودیت نرخ اعمال نشد (طبق مأموریت، استفادهٔ شخصی و کم‌حجم).

---

## ۵. گیت‌های درستی داده

| گیت | نتیجه |
|---|---|
| تعداد ردیف قیمت‌دار view برابر تعداد ردیف واقعی موتور | **۲۵۳۸ = ۲۵۳۸** |
| `price_bounds` برابر خروجی مستقیم `get_product_price_bounds()` برای هر ۳۵۵ محصول | **۰ مغایرت** |
| تعداد محصولات دارای قیمت خرید برابر `v_latest_active_purchase_prices` | **۳۲۱ = ۳۲۱** |
| **برابری با اپ:** خروجی `get_sales_search_products()` با JWT شبیه‌سازی‌شدهٔ ادمین، مقایسهٔ `current_price` + `previous_price` + `last_updated_at` روی همهٔ جفت‌های (محصول × نوع قیمت × تسویه) | **۷۹۲ ردیف، ۰ مغایرت مقداری، ۰ ردیف جاافتاده** |

همهٔ این تست‌ها داخل `BEGIN … ROLLBACK` اجرا شدند.

---

## ۶. گزارش تحویل استاندارد (طبق AGENTS.md)

### فایل‌های بررسی‌شده
`AGENTS.md`, `CLAUDE.md`, `PROGRESS.md`, `deploy/lan/docker-compose.yml`,
`deploy/lan/.env.lan` (فقط نام کلیدها)، `deploy/supabase/volumes/api/kong.yml`,
`deploy/lan/scripts/init-lan.ps1`, `docs/FINAL_HANDOFF_PRODUCT_PRICE_OBSERVATORY.md`,
`docs/BOT_HANDOFF_PRODUCT_PRICE_OBSERVATORY.md`,
و روی دیتابیس زنده: تعریف `get_sales_search_products`, `get_product_sale_price`,
`get_product_price_bounds`, `calculate_adjusted_price`,
`v_latest_active_purchase_prices`, `product_computed_prices_public`، به‌همراه
schema/شمارش ردیف/RLS/گرنت‌های ۱۳ جدول قیمتی.

### فایل‌های تغییریافته

| فایل | چرا |
|---|---|
| `supabase/migrations/20260810120000_334_internal_products_pricing_api.sql` | **جدید** — دو view، نقش، گرنت‌ها و REVOKE های محافظ |
| `docs/verification/334-down.sql` | **جدید** — اسکریپت برگشت (و مسیر ابطال فوری credential) |
| `deploy/lan/scripts/issue-products-api-credential.ps1` | **جدید** — صدور/تعویض credential بدون چاپ یا commit کردن آن |
| `docs/asan/internal-products-pricing-api-guide.md` | **جدید** — راهنمای فارسی سادهٔ استفاده |
| `docs/execution/internal-products-pricing-api-mission.md` | **جدید** — متن مأموریت برای بایگانی |
| `docs/execution/internal-products-pricing-api-mission-COMPLETE.md` | **جدید** — همین گزارش |
| `PROGRESS.md` | ثبت ردیف مأموریت |

### تأثیر مهاجرت
فقط افزودنی. **هیچ** جدولی ساخته/تغییر/حذف نشد، هیچ تابعی `CREATE OR REPLACE` نشد،
هیچ ردیفی نوشته/به‌روز/حذف نشد. گیت رجیستری FK اشخاص (مهاجرت ۳۲۸) اصلاً فعال نمی‌شود
چون روی `CREATE/ALTER/DROP TABLE` است و اینجا فقط `CREATE VIEW` داریم.
`docs/verification/334-down.sql` نوشته و بازبینی شد (dry-run کامل مهاجرت داخل
`BEGIN…ROLLBACK` سه بار اجرا شد، پس مسیر «ساخت و برگشت» عملاً تست شده است).

### تأثیر RLS/RBAC
- RLS هیچ جدولی تغییر نکرد، هیچ policy ای اضافه/حذف/ویرایش نشد.
- نقش‌های اپ (`admin`, `manager`, `sales`, `accountant`, `viewer`) اصلاً لمس نشدند.
  این API با سیستم مجوز کاربران اپ قاطی نیست — یک نقش دیتابیسی جدا با یک credential جدا.
- تنها تغییر RBAC: نقش تازهٔ `products_api_readonly` + عضویت `authenticator` در آن.

### تأثیر لاگ حسابرسی
هیچ. این مسیر چیزی نمی‌نویسد، پس تریگرهای audit اصلاً فعال نمی‌شوند.
**PostgREST درخواست‌های موفق را جایی در دیتابیس ثبت نمی‌کند** — اگر بعداً ردگیری
استفاده لازم شد، باید جداگانه اضافه شود (بخش ۸).

### نتایج build/lint/typecheck/test

| فرمان | نتیجه |
|---|---|
| `npm run typecheck` | **۷۰ خطا — دقیقاً همان baseline، بدون افزایش** |
| `npm run lint` | اجرا نشد — این مأموریت هیچ فایل TS/TSX ای لمس نکرد |
| `npm run build` | اجرا نشد — به همان دلیل؛ فرانت‌اند تغییری نکرد |
| tests | **این پروژه اصلاً script تست ندارد** — چیزی اجرا نشد و ادعا هم نمی‌شود |

### مسیر تست دستی
```powershell
# ۱) صدور credential (اگر هنوز نساخته‌ای)
pwsh deploy\lan\scripts\issue-products-api-credential.ps1

# ۲) مقادیر را از فایل بیرون‌ریپو بردار
$c = Get-Content "$env:USERPROFILE\.afrakala\products-api-credential.txt"
$k = ($c | ? { $_ -like 'APIKEY=*' }) -replace '^APIKEY=',''
$t = ($c | ? { $_ -like 'TOKEN=*'  }) -replace '^TOKEN=',''

# ۳) باید ۲۰۰ و دادهٔ واقعی بدهد
curl.exe -s "http://192.168.170.8:9000/rest/v1/api_products_pricing?limit=1" `
  -H "apikey: $k" -H "Authorization: Bearer $t"

# ۴) باید ۴۰۳ بدهد — اثبات اینکه به جدول خام نمی‌رسد
curl.exe -s -w "`n%{http_code}`n" "http://192.168.170.8:9000/rest/v1/purchase_prices?limit=1" `
  -H "apikey: $k" -H "Authorization: Bearer $t"
```

### Self-Host Acceptance Check
✅ هیچ وابستگی به CDN، فونت آنلاین، API بیرونی یا سرویس ابری اضافه نشد.
✅ روی همان استک Supabase self-hosted موجود (Postgres + PostgREST + Kong) ساخته شد؛
سرور، پورت، کانتینر، یا سرویس تازه‌ای اضافه نشد. `kong.yml` اصلاً دست نخورد.
✅ همه‌چیز داخل خودِ دیتابیس است، پس با هر بکاپ/ریستور معمولی منتقل می‌شود.
✅ هیچ secret ای commit نشد.

---

## ۷. ریسک‌های باقی‌مانده

1. **توکن ۱۰ ساله و بدون امکان ابطال نقطه‌ای است.** JWT بدون state است؛ تنها راه باطل‌کردن
   فوریِ یک توکن لو رفته، حذف نقش با `334-down.sql` است (که API را هم می‌خواباند تا
   دوباره اعمالش کنی). اگر مالک عمر کوتاه‌تر بخواهد: `-Years 1`.
2. **قیمت خرید در خروجی هست.** عمدی و طبق خواستهٔ مأموریت («همهٔ انواع قیمت»)، ولی یعنی
   این credential حساس‌ترین دادهٔ تجاری را نشان می‌دهد. در راهنما پررنگ نوشته شد.
3. **سطح RPC نقش برابر `anon` است** (۷۳۲ تابع `public` که EXECUTE شان به `PUBLIC` داده
   شده — وضعیت *از قبل موجودِ* این دیتابیس، نه چیزی که این مأموریت ساخته). تست ۸ نشان داد
   توابع اپ با `unauthenticated` رد می‌کنند. سفت‌کردن واقعی یعنی
   `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` که کل مدل دسترسی
   دیتابیس را عوض می‌کند — **عمداً انجام نشد**، چون خارج از دامنهٔ یک مأموریت ۱۰۰٪ افزودنی
   و کم‌ریسک است. اگر مالک بخواهد، یک مأموریت جداست.
4. **بدون ردگیری استفاده.** نمی‌شود فهمید این API کِی و چقدر استفاده شده.
5. **دو نکتهٔ نگهداری:**
   - `previous_price` با `array_agg(...)[2]` گرفته می‌شود؛ اگر دو ردیف تاریخچه دقیقاً
     یک `created_at` داشته باشند، ممکن است با اپ یکی نباشد. روی دادهٔ فعلی: ۰ مغایرت.
   - منطق «آخرین قیمت خرید فعال» حالا در **دو جا** است (view موجود و view جدید).
     دلیلش در بخش ۱ توضیح داده شد؛ کامنت هشدار داخل خود مهاجرت هم گذاشته شد.
6. **مانده برای مالک:** توکن باید در جای امن خودش (password manager) ذخیره شود.
   فایل `%USERPROFILE%\.afrakala\products-api-credential.txt` روی همین ماشین است.

---

## ۸. اگر بعداً خواستی

- **عمر کوتاه‌تر برای توکن:** `pwsh deploy\lan\scripts\issue-products-api-credential.ps1 -Years 1`
- **ابطال کامل:** `docs/verification/334-down.sql` را اعمال کن + `docker restart afrakala-lan-rest`
- **ردگیری استفاده:** یک تابع لاگ + فراخوانی از یک RPC wrapper — نه از داخل view
  (view نباید بنویسد).
- **فیلد تازه در خروجی:** فقط `CREATE OR REPLACE VIEW` در یک مهاجرت جدید؛ ستون‌ها باید
  به انتها اضافه شوند وگرنه `CREATE OR REPLACE` رد می‌کند.
