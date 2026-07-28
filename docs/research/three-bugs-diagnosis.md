# تشخیص سه اشکال: عکس محصول، خطای محاسبهٔ قیمت، فضای خرید

> **مأموریت فقط‌خواندنی.** هیچ کد/migration/نوشتن DB، هیچ build، هیچ تغییر کانتینر.
> **تاریخ:** 2026-07-28 · **برنچ:** `feature/navigation-modernization` · **DB:** `afrakala` (کانتینر `afrakala-lan-db`)
> **محصول نمونه:** `2b1b6385-d3b9-4c46-ad54-c6be5d560058` — «ماشين لباسشويى بوش مدل»، `base_currency = usd`
> هیچ کلید/رمزی چاپ نشده. همهٔ تست‌های DB داخل `BEGIN … ROLLBACK`.

---

## خلاصهٔ سه‌خطی

| مورد | ریشه | یک‌خطی |
|---|---|---|
| ۱ عکس | RLS | باکت `product-images` **هیچ policy از نوع SELECT ندارد** — تنها باکت پروژه که ندارد. پس امضای URL شکست می‌خورد و عکس هیچ‌جا رندر نمی‌شود. |
| ۲ قیمت | تریگر | `notify_accountants_on_sale_price_change()` خط `ur.role = 'accountant'::app_role` را دارد، ولی `user_roles.role` از نوع `text` است ⟹ `operator does not exist: text = app_role`. |
| ۳ فضای خرید | UI + RLS | «ویرایش» **اصلاً ساخته نشده**. «آپلود رسید» **کامل ساخته شده ولی در عمل غیرقابل‌دسترس** است، چون دکمهٔ تغییر وضعیت در `/purchase` رندر نمی‌شود. |

**رابطهٔ ۲↔۵:** مورد ۵ (قیمت دلاری در جستجو) **۱۰۰٪ معلول مورد ۲** است. یک رفع کافی است.

---

## مورد ۱ — عکس محصول ذخیره می‌شود ولی نمایش داده نمی‌شود

### ۱.۱ حکم کوتاه

> باکت خصوصی `product-images` روی `storage.objects` فقط policy‌های **INSERT** و **DELETE** دارد و **policy از نوع SELECT ندارد**. بدون SELECT، `createSignedUrls` نمی‌تواند فایل را ببیند، URL امضاشده تولید نمی‌شود، و هر پنج صفحه‌ای که عکس را رندر می‌کنند جای خالی نشان می‌دهند.

**نکتهٔ مهم: فرض بریف («باگ در خواندن است، نه آپلود») درست بود، ولی نه به دلیلی که حدس زده شده.** مشکل در کوئری جستجو یا نبودِ `<img>` نیست — هر دو کامل و درست‌اند. مشکل یک لایه پایین‌تر است: در RLSِ خودِ storage.

### ۱.۲ شواهد

**الف) داده کجاست؟**

```
storage.objects  bucket_id='product-images'  → 13 فایل (همه برای همین محصول)
public.product_images                        → 0 ردیف
storage.buckets  'product-images'.public     → f  (خصوصی)
```

ستون‌های واقعی `product_images`: `id, product_id, url, sort_order, is_primary, alt_text, created_at`
(بریف `image_url`/`storage_path` فرض کرده بود؛ نام واقعی ستون **`url`** است و **`is_primary` از قبل وجود دارد**.)

**ب) آیا درج در جدول شکست خورده بود؟ نه.** لاگ Kong امروز:

```
10:34:16  POST   /rest/v1/product_images  → 201
10:34:23  POST   → 201        10:36:19  POST → 201        10:40:35  POST → 201
10:34:26  POST   → 201        10:36:23  POST → 201        10:40:45  POST → 201
...   مجموعاً 11 عدد POST با کد 201
...   مجموعاً 13 عدد DELETE با کد 204
```

و GETهای بلافاصله بعد از هر POST، بدنهٔ ۱۷۸ / ۳۴۹ / ۵۱۹ بایت برگرداندند — یعنی ردیف‌ها **واقعاً ساخته و خوانده شدند**. جدول امروز خالی است چون کاربر بعداً همه را حذف کرد (۱۳ DELETE).

پس **درج و RLSِ جدول سالم‌اند.** با JWT شبیه‌سازی‌شدهٔ admin هم تأیید شد:

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<admin-uid>","role":"authenticated"}';
INSERT INTO public.product_images (product_id, url, sort_order, is_primary) VALUES (...);
-- INSERT 0 1     (سپس ROLLBACK)
```

**ج) 🔴 ریشه — نبودِ policy از نوع SELECT روی storage.objects:**

| باکت | INSERT | SELECT | DELETE |
|---|---|---|---|
| `delivery-receipts` | ✅ | ✅ | — |
| `documents` | ✅ | ✅ | — |
| `feedback-attachments` | ✅ | ✅ | ✅ |
| `messenger-attachments` | ✅ | ✅ | ✅ |
| `payment-receipt-documents` | ✅ | ✅ | ✅ |
| `purchase-receipts` | ✅ | ✅ | ✅ |
| **`product-images`** | ✅ | **❌ ندارد** | ✅ |

policy‌های موجود فقط این دو هستند:

```
product_images_storage_write  | INSERT | bucket_id='product-images' AND (has_role(...,'admin'::app_role) OR has_role(...,'manager'::app_role))
product_images_storage_delete | DELETE | bucket_id='product-images' AND (has_role(...,'admin'::app_role) OR has_role(...,'manager'::app_role))
```

**اثبات قطعی** — یک کاربر admin واقعی هیچ‌کدام از ۱۳ فایل را نمی‌بیند:

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<admin-uid>","role":"authenticated"}';
SELECT has_role(auth.uid(),'admin'::app_role);              -- true
SELECT count(*) FROM storage.objects WHERE bucket_id='product-images';
-- 0        ← در حالی که با نقش postgres عدد 13 است
```

**د) عارضهٔ جانبی: ۱۳ فایل یتیم.** همین نبودِ SELECT باعث می‌شود `storage.remove()` هم شکست بخورد. و در `ProductImagesSection.tsx:65` خطای حذف از storage **بررسی نمی‌شود**:

```ts
await supabase.storage.from(BUCKET).remove([img.path]);   // ← خروجی دور ریخته می‌شود
const { error } = await supabase.from("product_images").delete().eq("id", img.id);
if (error) throw error;
```

نتیجه: ردیف DB حذف شد، فایل ماند. هر ۱۳ فایل الان بدون ردیف متناظر در storage باقی‌اند.
(برای مقایسه، `useUploadPurchaseReceipt` در `usePurchase.ts:232` این را درست انجام می‌دهد: در صورت خطای درج، فایل را پاک می‌کند.)

### ۱.۳ دامنه

**همهٔ محصولات و همهٔ صفحات** — نه فقط این محصول. مسیر امضای URL برای این باکت به‌کل مسدود است.

پنج سطحی که عکس را رندر می‌کنند و همگی خالی می‌مانند:

| صفحه | نحوهٔ دریافت |
|---|---|
| «محصولات» `/products` | queryKey `product-thumbnails` |
| **«جستجوی سریع فروش»** `/sales/search` | `useProductThumbnails` (خط ۳۹۸) → `<img>` (خط ۱۳۳۶) |
| «پیش‌فاکتور جدید» `/sales/quotes/new` | `useProductThumbnails` (خط ۷۶۹) |
| «لیست قیمت زنده» `/pricing/live-price-list` | `useProductThumbnails` (خط ۲۵۴) |
| پیشنهاد محصولات فروش | `SalesProductRecommendations.tsx:38` |
| «تابلو قیمت زنده» | ❌ اصلاً عکس ندارد |

### ۱.۴ پاسخ به پرسش‌های بریف

- **آیا تابع جستجو عکس را select نمی‌کند؟** درست است که `get_sales_search_products` هیچ ستون عکسی برنمی‌گرداند (خروجی‌اش: `id, name, sku, product_type, stock_status, color, capacity, model, description, primary_spec, brand, category, labels, prices, is_unavailable_for_sales, has_purchase_price`) — **ولی این باگ نیست.** عکس عمداً جداگانه و با `useProductThumbnails` گرفته می‌شود تا URL امضاشده تولید شود. این طراحی درست است.
- **آیا مفهوم «عکس اصلی» وجود ندارد؟** وجود **دارد**: ستون `is_primary`، مرتب‌سازی `is_primary DESC, sort_order ASC`، انتخاب اولین ردیف به‌عنوان thumbnail، و برچسب «اصلی» در UI (`ProductImagesSection.tsx:190`).
- **آیا هیچ صفحه‌ای `<img>` ندارد؟** دارند — پنج سطح بالا.

### ۱.۵ آنچه برای خواستهٔ کاربر («۱۵ عکس + عکس اصلی همه‌جا») کم است

| نیاز | وضعیت | کار لازم |
|---|---|---|
| ذخیرهٔ چند عکس | ✅ هست | — |
| ستون «عکس اصلی» | ✅ `is_primary` هست | — |
| کوئری‌ها عکس را می‌گیرند | ✅ هست | — |
| کامپوننت‌ها `<img>` دارند | ✅ در ۵ سطح | افزودن به «تابلو قیمت زنده» در صورت نیاز |
| **دیدن عکس** | ❌ **مسدود** | **policy از نوع SELECT برای `product-images`** ← تنها رفع واقعی |
| **سقف ۱۵ عکس** | ❌ نیست | هیچ محدودیت تعدادی در `handleFile` وجود ندارد (فقط سقف ۵ مگابایت). افزودن شمارش. |
| **تغییر عکس اصلی** | ❌ نیست | `is_primary` فقط برای **اولین** عکس `true` می‌شود (`isFirst`، خط ۹۲) و هیچ دکمه‌ای برای تغییرش نیست. اگر کاربر عکس اصلی را حذف کند، **هیچ عکسی primary نمی‌ماند**. نیاز به: دکمهٔ «انتخاب به‌عنوان اصلی» + یکتاسازی + جانشینی خودکار پس از حذف. |
| **مرتب‌سازی گالری** | 🔶 نیمه | `sort_order` نوشته می‌شود ولی UI جابه‌جایی ندارد. |
| ۱۳ فایل یتیم | — | پاک‌سازی + بررسی خطای `remove()` در خط ۶۵ |

### ۱.۶ مسیر رفع پیشنهادی (فقط توصیف)

1. **یک policy از نوع SELECT روی `storage.objects` برای `bucket_id='product-images'`.** چون عکس محصول باید برای همهٔ کاربران فروش دیده شود، دامنه‌اش باید بازتر از INSERT/DELETE باشد — الگوی `prd_storage_select_privileged` نمونهٔ خوبی است، ولی برای عکس محصول احتمالاً «هر کاربر authenticated» درست‌تر است. **این یک رفع، به‌تنهایی هر پنج صفحه را درست می‌کند.**
2. بررسی خطای `storage.remove()` در `ProductImagesSection.tsx:65` تا دیگر فایل یتیم تولید نشود.
3. پاک‌سازی ۱۳ فایل یتیم فعلی.
4. برای خواستهٔ کامل کاربر: سقف ۱۵ عکس، دکمهٔ «تعیین عکس اصلی»، و جانشینی primary پس از حذف.

> ⚠️ **گزینهٔ «باکت را public کن» را توصیه نمی‌کنم** — عکس محصول به قیمت خرید گره خورده و باکت عمومی یعنی هر کسی با حدس‌زدن URL به آن دسترسی دارد. مسیر URL امضاشده که الان پیاده شده درست است؛ فقط policy کم دارد.

---

## مورد ۲ — `operator does not exist: text = app_role`

### ۲.۱ حکم کوتاه

> تریگر `trg_notify_accountants_sale_price_change` روی جدول `product_sale_price_history` هنگام درج، `ur.role` (نوع **text**) را با `'accountant'::app_role` (نوع **app_role**) مقایسه می‌کند. چون هیچ operator‌ای برای `text = app_role` وجود ندارد، درج تاریخچه شکست می‌خورد و کل انتشار قیمت با آن می‌افتد.

### ۲.۲ خط دقیق باگ

**فایل:** `supabase/migrations/20260716162000_126_notify_accountants_sale_price_change.sql:66`

```sql
FOR r_recipient IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'accountant'::app_role     -- ← 🔴 خط معیوب
LOOP
```

- سمت چپ — `ur.role` — نوع **`text`** است:
  ```
  SELECT format_type(atttypid, atttypmod) FROM pg_attribute
   WHERE attrelid='public.user_roles'::regclass AND attname='role';
  →  text
  ```
- سمت راست — `'accountant'::app_role` — نوع **`app_role`** (enum) است.

**بازتولید قطعی:**

```sql
DO $$ BEGIN
  PERFORM 1 FROM public.user_roles ur WHERE ur.role = 'accountant'::app_role;
EXCEPTION WHEN others THEN RAISE NOTICE 'REPRODUCED -> SQLSTATE %: %', SQLSTATE, SQLERRM;
END $$;

NOTICE:  REPRODUCED -> SQLSTATE 42883: operator does not exist: text = app_role
```

### ۲.۳ زنجیرهٔ فراخوانی

```
دکمهٔ «محاسبه و انتشار قیمت‌ها»
  └─ publishProductPrices()            src/lib/pricing/publish-prices.ts:33
      └─ calculateSalePrice({ force_snapshot: true })     ← تاریخچه را می‌نویسد
          └─ INSERT INTO product_sale_price_history
              └─ TRIGGER trg_notify_accountants_sale_price_change
                  └─ notify_accountants_on_sale_price_change()
                      └─ 💥 ur.role = 'accountant'::app_role
```

نکتهٔ مهم: **این باگ در خودِ تابع قیمت نیست** — همان‌طور که بریف حدس زده بود، در یک تابع جانبی (تریگر اعلان) است که در انتهای زنجیره فراخوانده می‌شود. موتور قیمت‌گذاری (`src/lib/pricing/engine.ts`) اصلاً RPC ندارد و تماماً سمت کلاینت است.

تریگر یک نگهبان دارد:
```sql
IF NEW.old_sale_price IS NOT DISTINCT FROM NEW.new_sale_price THEN RETURN NEW; END IF;
```
یعنی فقط وقتی قیمت **واقعاً عوض شود** به خط معیوب می‌رسد — و اولین محاسبهٔ هر محصول همیشه تغییر محسوب می‌شود. به همین دلیل **برای همهٔ محصولات و همهٔ نوع‌قیمت‌ها** می‌افتد، دقیقاً مطابق مشاهدهٔ کاربر.

### ۲.۴ دامنه

**سراسری**، و اثرش در داده دیده می‌شود:

```
product_computed_prices    : 1627 ردیف، 315 محصول، آخرین محاسبه 2026-07-21
product_sale_price_history : 3786 ردیف، آخرین درج      2026-07-13
محصول نمونه (ساخته‌شده امروز): 0 ردیف قیمت محاسبه‌شده
```

migration معیوب تاریخ **2026-07-16** دارد و تاریخچه از **2026-07-13** متوقف شده — سازگار.

**فقط یک نقطهٔ معیوب در کل دیتابیس.** جست‌وجوی همهٔ توابع برای الگوی «مقایسهٔ ستون با `::app_role` بدون cast»:

```
notify_accountants_on_sale_price_change()          ← 🔴 واقعاً معیوب
recompute_employee_scores_on_receipt_link()        ← ✅ قبلاً رفع شده
```

مورد دوم **سالم است** — کد فعلی‌اش از `public.has_role(i.created_by, 'sales'::public.app_role)` استفاده می‌کند (overload امن). فقط در **کامنت** خودش به باگ قبلی اشاره کرده و همان کامنت در جست‌وجوی من match شد. هیچ policy از RLS هم این الگو را ندارد (۰ مورد).

### ۲.۵ چرا `has_role(...)` سالم است ولی این خط نه

هر چهار overload به‌درستی cast می‌کنند:

```sql
has_role(uuid, text)      → SELECT EXISTS(... WHERE user_id=_user_id AND role::text = _role)
has_role(uuid, app_role)  → SELECT public.has_role(_user_id, _role::text)      -- به نسخهٔ text واگذار می‌کند
has_any_role(uuid, text[])    → ... role::text = ANY(_roles)
has_any_role(uuid, app_role[])→ ... _roles::text[] ...
```

پس صدها استفاده از `has_any_role(auth.uid(), ARRAY['admin'::app_role, ...])` در migrationها **بی‌خطرند**. تنها جایی که ستون به‌طور مستقیم و بدون cast مقایسه شده همان خط ۶۶ است.

### ۲.۶ مسیر رفع پیشنهادی

بازتعریف تابع تریگر با یکی از این دو شکل:
- `WHERE ur.role::text = 'accountant'` — هم‌راستا با بقیهٔ کد؛ یا
- `WHERE public.has_role(ur.user_id, 'accountant'::text)` — استفاده از همان overload امن.

⚠️ به دلیل حروف فارسی داخل بدنهٔ تابع، تغییر باید با روش امنِ UTF-8 اعمال شود (`docker cp` + `psql -f`)، نه از طریق pipe در PowerShell — همان درسی که در اصلاح `payment_terms` گرفته شد.

پس از رفع، انتشار مجدد قیمت لازم است تا ۳۱۵ محصول به‌روز شوند (پیش‌نیازها فراهم‌اند: ۳ نوع‌قیمت فعال، ۶ ترم تسویه فعال، ۱۱ قانون قیمت‌گذاری).

---

## مورد ۵ — قیمت دلاری در جستجو (حکم رابطه)

### حکم: **۱۰۰٪ معلول مورد ۲. رفع مورد ۲ به‌تنهایی کافی است.**

منطق نمایش دلاری کامل و درست پیاده شده — یک **مشتق** از قیمت تومانی است:

```ts
// src/routes/_app.sales.search.tsx:1245
const usdRate = effectiveCurrencies?.find((c) => c.code === "usd")?.latest_rate ?? null;
const toUsd = (tomanPrice: number | null): number | null =>
  tomanPrice != null && usdRate && usdRate > 0 ? Math.round(tomanPrice / usdRate) : null;
```

و در سه نقطه رندر می‌شود (خطوط ۱۴۵۲، ۱۵۱۶، ۱۵۷۱):
```tsx
{toUsd(c) !== null && (<span>≈ {formatNumber(toUsd(c)!)} دلار</span>)}
```
به‌علاوهٔ نوار «نرخ لحظه‌ای دلار» در بالای صفحه (خط ۵۵۲).

**دو ورودی لازم است:**

| ورودی | وضعیت |
|---|---|
| نرخ فعال `usd` | ✅ **هست** — `currency_rates` یک ردیف `is_active` دارد (`effective_at = 2026-07-28`) |
| قیمت تومانی محاسبه‌شده | ❌ **نیست** — محصول نمونه ۰ ردیف در `product_computed_prices` دارد |

چون `toUsd(null)` برابر `null` است، شرط `toUsd(c) !== null` رد می‌شود و **هیچ چیزی رندر نمی‌شود** — نه دلاری و نه تومانی. مشاهدهٔ کاربر («قیمت دلاری نشان داده نمی‌شود») در واقع نشانهٔ نبودِ **هر** قیمتی است.

> **دقت لازم در بیان:** بریف پرسیده بود «آیا مورد ۵ باگ جدایی است؟» — پاسخ: **نه.** هیچ کد جداگانه‌ای برای رفع لازم نیست. ولی این ادعا صرفاً از خواندن کد استنتاج شده؛ تأیید نهایی وقتی ممکن است که پس از رفع مورد ۲، انتشار قیمت اجرا و صفحه در مرورگر دیده شود.

### جدول رابطهٔ باگ‌ها

| رابطه | حکم | نتیجه |
|---|---|---|
| ۵ ← ۲ | **معلول** | یک رفع (مورد ۲) هر دو را حل می‌کند |
| ۱ ← ۲ | **مستقل** | عکس ربطی به قیمت ندارد؛ رفع جدا لازم است |
| ۳ ← ۱ یا ۲ | **مستقل** | رفع جدا لازم است |
| ۱ ↔ ۳ | **الگوی مشترک، نه علت مشترک** | هر دو دربارهٔ storage خصوصی + URL امضاشده‌اند، ولی `purchase-receipts` policy از نوع SELECT **دارد** و سالم است |

---

## مورد ۳ — فضای خرید: ویرایش و آپلود رسید

### ۳.۱ حکم کوتاه

> **ویرایش:** ساخته نشده — نه فرانت، نه اجازهٔ RLS برای درخواست‌دهنده.
> **آپلود رسید:** کامل ساخته شده و mount هم شده، ولی به‌خاطر دو گارد پشت‌سرهم در عمل **هرگز ظاهر نمی‌شود**.

### ۳.۲ جدول سه‌حالته (قانون ضدخوش‌بینی)

| قابلیت | ساخته نشده | ساخته ولی mount نشده | ساخته ولی در عمل غیرقابل‌دسترس | شاهد |
|---|:---:|:---:|:---:|---|
| **ویرایش درخواست (فرانت)** | ✅ | | | جست‌وجوی `edit\|ویرایش\|update\|EditDialog` در `src/components/purchase`, `src/hooks/purchase`, `src/lib/purchase` → **هیچ نتیجه‌ای** |
| **ویرایش درخواست (بک‌اند)** | 🔶 نیمه | | | policy `UPDATE` هست ولی **درخواست‌دهنده را شامل نمی‌شود** |
| **آپلود رسید** | | | ✅ | `PurchaseReceiptUploader` در `PurchaseRequestCard.tsx:103` mount شده؛ گارد خط ۳۲ آن را پنهان می‌کند |

### ۳.۳ ویرایش — جزئیات

**فرانت:** `/purchase` فقط دو کامپوننت رندر می‌کند (`_app.purchase.tsx:92,101`):
```
PurchaseRequestCard      ← نمایش
PurchaseRequestForm      ← ساخت درخواست جدید
```
و `PurchaseRequestCard.tsx` (کل ۱۰۸ خط، خوانده شد) هیچ دکمه/دیالوگ/میوتیشن ویرایشی ندارد. **هیچ کدی برای ویرایش نوشته نشده.**

**بک‌اند — RLS روی `purchase_requests`:**

```
sales and manager can insert   | INSERT | requested_by = auth.uid() AND (sales OR manager OR admin)
requester sees own requests    | SELECT | requested_by = auth.uid()
assignee sees assigned requests| SELECT | assigned_to  = auth.uid()
managers see all requests      | SELECT | admin OR manager
update by assignee or manager  | UPDATE | assigned_to = auth.uid() OR manager OR admin
```

🔴 **دو ناسازگاری با خواستهٔ کاربر:**
1. خواسته: «کاربر بتواند درخواست خودش را ویرایش کند». ولی policy مربوط به UPDATE **`requested_by = auth.uid()` را ندارد** — یعنی درخواست‌دهنده حتی اگر دکمه ساخته شود، از سمت DB رد می‌شود (مگر خودش assignee یا مدیر باشد؛ در هر ۴ ردیف موجود `requested_by ≠ assigned_to` است).
2. خواسته: «فقط **قبل از تأیید**». ولی policy **هیچ قید وضعیتی ندارد** — یک مدیر می‌تواند درخواست `purchased` یا `delivered` را هم تغییر دهد.

**وضعیت‌های مجاز** (از `purchase_requests_status_check`): `pending, approved, purchased, delivered, cancelled` — **پنج** وضعیت، نه سه.
گذارها (`labels.ts:45`): `pending → approved|cancelled` · `approved → purchased|cancelled` · `purchased → delivered` · بقیه نهایی.
پس «قبل از تأیید» یعنی **فقط `pending`**.

### ۳.۴ آپلود رسید — چرا دیده نمی‌شود

همه‌چیزِ زیرساخت **هست و درست است**:

| جزء | وضعیت |
|---|---|
| `PurchaseReceiptUploader.tsx` | ✅ کامل — آپلود، فهرست، دانلود با URL امضاشده |
| `useUploadPurchaseReceipt` (`usePurchase.ts:203`) | ✅ اعتبارسنجی پسوند/حجم (۱۰MB)، و **پاک‌سازی فایل در صورت خطای درج** |
| جدول `purchase_receipts` | ✅ موجود (۰ ردیف) |
| باکت `purchase-receipts` | ✅ موجود |
| RLS storage | ✅ **هم INSERT و هم SELECT دارد** (برخلاف `product-images`) |
| mount | ✅ `PurchaseRequestCard.tsx:103` |

مسیر فایل `{request_id}/{uuid}.{ext}` دقیقاً با شرط RLS (`split_part(objects.name,'/',1) = pr.id`) می‌خواند. **پس اگر دکمه ظاهر شود، کار می‌کند.**

🔴 **ولی دکمه هرگز ظاهر نمی‌شود** — `PurchaseRequestCard.tsx:31`:

```ts
const canUpload =
  request.status === "purchased" && !!user && request.assigned_to === user.id;
```

دو شرط هم‌زمان لازم است، و **زنجیره در گام اول قطع است:**

**`/purchase` هیچ راهی برای رساندن وضعیت به `purchased` ندارد.** تنها کامپوننت تغییر وضعیت، `PurchaseStatusActions`، فقط در یک جا mount شده:

```
src/routes/_app.admin.purchase.tsx:292   ← «مدیریت خرید» (adminOnly)
```

و در `_app.purchase.tsx` **اصلاً import نشده**.

**تأیید با داده:**
```
وضعیت‌های موجود: pending(2) · approved(1) · cancelled(1)
تعداد ردیف با وضعیت 'purchased' : 0
purchase_receipts               : 0 ردیف
```

پس دکمهٔ «آپلود رسید» تا امروز **در هیچ لحظه‌ای نمی‌توانسته دیده شود**.

### ۳.۵ دامنه

- «ویرایش»: همهٔ کاربران، همهٔ درخواست‌ها.
- «آپلود رسید»: همهٔ کاربران — ولی به‌خاطر گارد، نه یک باگ در خودِ آپلود.
- توجه: قابلیت‌ها در `/admin/purchase` («مدیریت خرید»، adminOnly) در دسترس‌اند. مشکل، **جداافتادگی دو صفحه** است، نه نبودِ قابلیت.

### ۳.۶ مسیر رفع پیشنهادی (فقط توصیف)

**برای آپلود رسید** (کم‌هزینه‌ترین — هیچ کد جدیدی لازم نیست):
1. `PurchaseStatusActions` را در `/purchase` هم رندر کن (خودش گارد `isManager || isAssignee` دارد، پس امن است).
2. اگر باید فقط مسئولِ خرید رسید بگذارد، گارد فعلی درست است؛ ولی اگر درخواست‌دهنده هم باید ببیند، شرط `request.assigned_to === user.id` باید بازتر شود.

**برای ویرایش** (نیاز به ساخت):
1. **فرانت:** دیالوگ ویرایش (محصول، تعداد، واحد، قیمت تخمینی، یادداشت) + میوتیشن، فعال فقط وقتی `status === "pending"` و کاربر درخواست‌دهنده است.
2. **بک‌اند:** policy مربوط به UPDATE باید بازنویسی شود تا هم درخواست‌دهنده را در وضعیت `pending` مجاز کند و هم قید وضعیت را اعمال کند. توجه: در حالت `FOR UPDATE` هم بند `USING` و هم `WITH CHECK` لازم است، وگرنه کاربر می‌تواند وضعیت را خودش عوض کند و از قید فرار کند.
3. تصمیم لازم: آیا ویرایشِ **قیمت نهایی** و **وضعیت** باید در همان دیالوگ باشد یا جدا بماند (توصیه: جدا، چون گذار وضعیت منطق خودش را دارد).

---

## اصلاح گزارش قبلی

در `docs/research/capability-inventory.md` نوشته بودم قابلیت #۱۶ («دستور خرید از پیام‌رسان») اتصالی به `purchase_requests` ندارد. **این نادرست بود:** جدول `purchase_requests` ستون **`inquiry_id`** دارد و `PurchaseRequestCard.tsx:75` دکمهٔ «استعلام مرتبط» را بر همان اساس نمایش می‌دهد. اتصال وجود دارد.

همچنین در آن گزارش وضعیت‌های خرید را سه‌تا نوشته بودم (`pending/approved/purchased`)؛ در واقع **پنج** وضعیت است (`delivered` و `cancelled` هم هستند).

---

## تأیید سلامت

```
$ git branch --show-current
feature/navigation-modernization

$ git status --porcelain --untracked-files=no
(خالی — هیچ فایل tracked تغییر نکرد)

$ git status --short
?? docs/research/three-bugs-diagnosis.md      ← همین گزارش
?? docs/AfraKala-three-bugs-research.md       ← بریف ورودی
?? (بقیه: بریف‌ها و گزارش‌های مأموریت‌های قبلی)
```

- **هیچ نوشتنی روی DB.** فقط `SELECT`، introspection و `pg_get_functiondef`. دو تست نوشتنی (`INSERT` روی `product_images` و بازتولید خطای تریگر) داخل `BEGIN … ROLLBACK` اجرا شدند؛ شمارش ردیف‌ها پس از آن بدون تغییر ماند.
- **هیچ build، هیچ migration، هیچ `docker up/down/restart`.** تنها دستورهای داکر: `docker exec … psql` (خواندن)، `docker logs` (خواندن)، `docker ps/inspect`، و `printenv` برای رمز اتصال (چاپ نشد).
- درخواست‌های HTTP به PostgREST فقط `GET` بودند.
- **هیچ رفعی اعمال نشد** — طبق بخش ۵ بریف، این گزارش فقط تشخیص است.

### محدودیت‌های صادقانه

1. **هیچ صفحه‌ای در مرورگر باز نشد.** همهٔ احکام از کد، RLS، لاگ و داده‌اند.
2. **مورد ۱** با شبیه‌سازی JWT در سطح SQL اثبات شد، نه با فراخوانی واقعی `createSignedUrls` از مرورگر. سرویس storage لایهٔ مجوز خودش را هم دارد؛ ولی چون همان RLS را اعمال می‌کند و `product-images` تنها باکتی است که policy از نوع SELECT ندارد، نتیجه‌گیری محکم است.
3. **مورد ۲** خطا مستقیماً بازتولید شد (SQLSTATE 42883) و مسیر تریگر از روی کد دنبال شد؛ ولی خودِ `publishProductPrices` سرتاسر اجرا نشد چون نوشتن واقعی لازم داشت.
4. **مورد ۵**: استنتاج از کد است. تأیید نهایی پس از رفع مورد ۲ و اجرای انتشار قیمت ممکن می‌شود.
5. ۱۳ فایل یتیم در `product-images` دست‌نخورده باقی ماندند (پاک‌سازی، نوشتن است).
