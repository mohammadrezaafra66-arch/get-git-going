# پکیج C — جستجوی سریع فروش (آیتم‌های ۱۴۲ و ۱۴۶)

**خلاصهٔ پکیج:** صفحهٔ «جستجوی سریع فروش» (`src/routes/_app.sales.search.tsx`, مسیر `/_app/sales/search`، گارد `requirePermission("sales","view")`) کاملاً ساخته و به بک‌اند وصل است. هستهٔ داده‌ای آن RPC ‏`get_sales_search_products(...)` است (SECURITY DEFINER, STABLE) که محصولات + قیمت‌ها (به تفکیک نوع قیمت و نوع تسویه) را برمی‌گرداند. «مسئول محصول» به‌صورت مرجع از جدول واسط `product_owner_assignments` (نه از برچسب) خوانده و در کارت نمایش داده می‌شود. مرتب‌سازی نتایج «موجود قبل از ناموجود» است و منطق پنهان‌سازی ناموجودها برای نقش‌های غیرممتاز وجود دارد. «کپی متن فروش» تک‌محصولی کامل کار می‌کند، اما هیچ زیرساخت انتخاب چندتایی/کپی گروهیِ نتایج وجود ندارد (فقط چک‌باکس‌های فیلتر و انتخاب برچسب هست). `SalesReminderPopup` روی همین صفحه mount شده است.

---

## یافته‌های تفصیلی (C1–C8)

### C1 (۱۴۲) — «مسئول محصول» چیست؟

**نتیجه:** از طریق **جدول واسط `product_owner_assignments`** است؛ نه ستون روی `products` و نه از برچسب.

**شواهد (L3 - DB):**
- روی `products` هیچ ستون owner/responsible/user وجود ندارد:
  `information_schema.columns` با فیلتر `%owner%/%responsible%/%user%` → **0 ردیف**.
- جدول `product_owner_assignments`:
  ```
  id uuid NOT NULL | product_id uuid NOT NULL | user_id uuid NOT NULL
  assigned_by uuid NULL | created_at timestamptz NOT NULL
  ```
  `SELECT count(*)` → **362 ردیف** (داده واقعی موجود است).
- تابع `is_product_owner(_user_id uuid, _product_id uuid)` → `EXISTS(SELECT 1 FROM product_owner_assignments WHERE user_id=_user_id AND product_id=_product_id)`.

**شواهد (L2/L1 - Front):**
- `src/lib/sales/product-owners.ts` → `fetchProductOwnersForProducts()` روی `product_owner_assignments` با embed ‏`profiles.full_name` (FK hint `product_owner_assignments_user_id_fkey`) و fallback جوین دستی.
- `_app.sales.search.tsx:415-423` → `ownersQuery` (سایدکار، batched، بدون N+1) → `ownersMap`.
- کارت محصول `_app.sales.search.tsx:1212-1226` → «مسئول: …» یا «بدون مسئول».

نتیجه: «مسئول» مرجع و مستقل از برچسبِ هم‌نام است (کامنت کد صراحتاً این را توضیح می‌دهد).

---

### C2 (۱۴۲) — آیا RPC مسئول محصول را برمی‌گرداند؟

**خیر.** ستون‌های خروجی تابع (`RETURNS TABLE(...)`) عبارت‌اند از:
`id, name, sku, product_type, stock_status, color, capacity, model, description, primary_spec, brand, category, labels, prices, is_unavailable_for_sales, has_purchase_price` — **هیچ فیلد مسئول/owner در آن نیست**.

اما داده **در دسترس است** و همین حالا از مسیر جداگانه (سایدکار `ownersQuery` → `fetchProductOwnersForProducts`) گرفته و در UI نمایش داده می‌شود (C1). یعنی «مسئول» عملاً روی صفحه هست، فقط از داخل RPC نمی‌آید. اگر بخواهند از خود RPC بیاید، افزودن یک زیرکوئری روی `product_owner_assignments`+`profiles` مشابه بلوک `labels` ساده است.

---

### C3 — `ORDER BY` نهایی تابع (نقل عین)

مرتب‌سازی داخل CTE ‏`base` (که `LIMIT/OFFSET` بعد از آن اعمال می‌شود) — **موجودها قبل از ناموجودها، سپس الفبایی بر اساس نام**:

```sql
ORDER BY
  CASE p.stock_status::text
    WHEN 'available' THEN 0
    WHEN 'limited' THEN 1
    WHEN 'unknown' THEN 2
    WHEN 'unavailable' THEN 3
    ELSE 4
  END,
  p.name ASC
LIMIT v_limit OFFSET v_offset
```

- `SELECT` بیرونی نهایی خودش `ORDER BY` ندارد؛ ترتیب از `base` می‌آید.
- منشأ: مهاجرت `20260722111653_130_sales_search_stock_sort.sql` (تنها تغییرش همین `ORDER BY` نسبت به نسخهٔ قبلی `ORDER BY p.name ASC` است).
- فرانت هم همین ترتیب را به‌عنوان guard دوباره اعمال می‌کند: `_app.sales.search.tsx:358-371` (`stockRank`: available=0، limited=1، unknown=2، unavailable=3، سپس `localeCompare(..., "fa")`).

پاسخ سوال باز: **بله، موجودها قبل از ناموجودها می‌آیند** (نه صرفاً الفبایی)؛ الفبا فقط تعیین‌کنندهٔ ترتیب درون هر گروه موجودی است.

---

### C4 — پنهان‌سازی ناموجودها برای نقش‌های غیرممتاز

**شرط دقیق** در `WHERE` همان CTE ‏`base`:
```sql
AND (
  v_is_privileged
  OR p.stock_status::text <> 'unavailable'
  OR EXISTS (SELECT 1 FROM product_computed_prices pcp WHERE pcp.product_id = p.id)
)
```
- `v_is_privileged := has_any_role(v_uid, ARRAY['admin','manager','accountant'])`.
- پس برای کاربر **غیرممتاز (نقش `sales`)** محصولِ `unavailable` **پنهان می‌شود، مگر** اینکه حداقل یک ردیف در `product_computed_prices` داشته باشد.
- علاوه بر این، در ساخت `prices` هم قیمتِ محصول ناموجود برای غیرممتاز حذف می‌شود:
  `AND (NOT (b.stock_status = 'unavailable' AND NOT v_is_privileged))` (در هر دو شاخهٔ baseline و per-settlement).
- گیت دسترسی کلی: ابتدا اگر کاربر نقش `sales`/ممتاز نداشته باشد `RAISE EXCEPTION 'forbidden'`.

---

### C5 (۱۴۶) — «کپی متن فروش»: کجا و چطور ساخته می‌شود

**فایل:** `src/routes/_app.sales.search.tsx` — تابع `handleCopySalesText` (خطوط **1086-1122**)، دکمهٔ «کپی متن فروش» در خط **1435-1437** (`<Copy/> کپی متن فروش`). فقط **تک‌محصولی** است.

منطق ساخت متن (آرایهٔ `lines` که با `\n` join و به `navigator.clipboard.writeText` داده می‌شود):
```
1) نام نمایشی محصول (formatProductDisplayNameWithFallback)
2) «کد: {sku}»            (اگر sku باشد)
3) «برند: {brand.name}»
4) «دسته: {category.name}»
5) «نوع کالا: خارجی/ایرانی»
6) مشخصات فنی specChips (به‌جز برند/دسته/نوع) با جداکنندهٔ «  •  »
7) «وضعیت: {STOCK_LABEL}»
8) خط خالی
9) اگر قیمت دارد: «قیمت‌ها:» و برای هر price:
     label = settlement_type_id==null ? title : «{title} ({settlement_title})»
     «• {label}: {formatNumber(current_price)} تومان»  یا  «• {label}: قیمت ثبت نشده»
   اگر هیچ قیمتی نیست: «قیمت: {noPriceReason ?? "ثبت نشده"}»
```
موفقیت → `toast.success("متن فروش کپی شد")`، خطا → `toast.error("کپی انجام نشد")`.
هر ردیف قیمت شامل هر دو بُعد است: انواع قیمت فروش (baseline) و ترکیب با انواع تسویه (per-settlement).

---

### C6 (۱۴۶) — حالت‌های قیمت: از کجا می‌آیند (فهرست کامل از DB)

قیمت‌ها از **ترکیب دو جدول** ساخته می‌شوند (نه enum):

**۱) `sale_price_types` (نوع قیمت فروش) — همه ۳ ردیف فعال:**
| code | title | sort_order | فعال |
|---|---|---|---|
| cash_price | نقدی | 10 | t |
| cheque_price | چکی | 20 | t |
| partner_price | همکاری | 30 | t |

**۲) `settlement_types` (نوع تسویه) — ۱۰ ردیف:**
| code | title | sort_order | فعال |
|---|---|---|---|
| cash | پیش واریز(نقدی) | 10 | **t** |
| cheque | چکی | 20 | f |
| partner | همکاری | 30 | f |
| credit | اعتباری / مدت‌دار | 40 | f |
| short_term | کوتاه‌مدت | 50 | f |
| st_eodfsl | تسویه یک روزه | 100 | **t** |
| st_nxc3qn | نصف نقد نصف یک روزه | 100 | **t** |
| st_5iqz0y | تسویه 2روزه | 100 | **t** |
| st_15g85o | تسویه3روزه | 100 | **t** |
| st_dasecy | سایت | 100 | **t** |

پس حالت‌های «نقدی، تسویه ۱ تا چند روزه، سایت، چکی، همکاری…» = ضربدر این دو جدول. در RPC:
- ردیف‌های **baseline** (`settlement_type_id = NULL`) برای هر `sale_price_types` فعال.
- ردیف‌های **per-settlement** فقط وقتی که قیمت محاسبه‌شده در `product_computed_prices` وجود دارد (join روی `settlement_types` فعال).

**۳) `payment_terms`** جدولی مجزاست (`name, days, is_active, sort_order`) با ۳ ردیف (days = 0 / 30 / 45، sort 1/2/5). این جدول **در RPC جستجوی فروش استفاده نمی‌شود** و به مکانیزم نمایش قیمت این صفحه ربطی ندارد. (نام‌های فارسی در خروجی به‌خاطر encoding کنسول `????` نمایش داده شد، ولی مقادیر days گویاست.)

---

### C7 (۱۴۶) — زیرساخت انتخاب چندتایی در صفحه؟

**در صفحهٔ جستجوی فروش، انتخاب چندتاییِ نتایج (bulk) وجود ندارد.** چک‌باکس‌ها فقط برای موارد زیرند:
- فیلترِ برند/دسته/برچسب در `FiltersPanel` (تابع `toggle` خط 1622-1624؛ `Checkbox` خطوط 1706/1744/1782) — یعنی انتخاب معیار فیلتر، نه انتخاب ردیف محصول.
- «فقط دارای قیمت معتبر» (`onlyWithPrice`, خط 1675).
- انتخاب برچسب در Popover حالت برچسب‌دار (`labelPickerDraft`, خطوط 575-598).

هیچ state ای مثل `selectedProductIds`/`Set<string>` روی کارت‌های نتیجه، «انتخاب همه»، یا «کپی گروهی چند محصول» نیست. `handleCopySalesText` فقط یک محصول را کپی می‌کند.

**الگوی قابل‌کپی برای bulk در پروژه (برای پیاده‌سازی آتی):**
- `src/components/products/ProductLabelsQuickDialog.tsx:34` → `useState<Set<string>>(new Set())`، toggle با `next.has(id)?delete:add` (خطوط 78-83)، `selected.has(l.id)` روی چک‌باکس (خط 165). الگوی تمیز و قابل‌استفادهٔ مجدد.
- سایر نمونه‌ها: `_app.pricing.product-recommendations.tsx` (`existingRecIds: Set<string>`)، `_app.products.categories.tsx`، `_app.pricing.sale-lists_.$listId.tsx`.

---

### C8 — وضعیت `SalesReminderPopup` روی برنچ سرور

**mount شده است.** grep در کل `src` فقط ۳ نتیجه:
- تعریف: `src/components/sales/SalesReminderPopup.tsx:18` (`export function SalesReminderPopup()`).
- import: `_app.sales.search.tsx:72`.
- **render واقعی: `_app.sales.search.tsx:476`** — بالای return صفحهٔ `SalesSearchPage` (`<SalesReminderPopup />`).

تنها محل رندر همین صفحه است. چون درخت کاری فعلی = سرور، پس روی سرور فعال است (قاعدهٔ ۱ رعایت شد: کامپوننت واقعاً رندر می‌شود).

---

## آیتم‌ها طبق فرمت خروجی

### آیتم ۱۴۲ — نمایش «مسئول محصول» + مرتب‌سازی/پنهان‌سازی موجودی در جستجوی فروش

**وضعیت:** ✅ کامل

**پاسخ کوتاه:** «مسئول محصول» به‌صورت مرجع از `product_owner_assignments` (نه برچسب) گرفته و در کارت نمایش داده می‌شود؛ نتایج «موجود قبل از ناموجود» مرتب می‌شوند و ناموجودها برای نقش‌های غیرممتاز (به‌جز حالت دارای قیمت محاسبه‌شده) پنهان می‌شوند.

**شواهد:**
- L1 (UI): `_app.sales.search.tsx:1212-1226` (مسئول/بدون مسئول)، `:855-898` (کارت‌ها)، مرتب‌سازی guard `:358-371`.
- L2 (front): `ownersQuery` `_app.sales.search.tsx:415-423` → `fetchProductOwnersForProducts` (`src/lib/sales/product-owners.ts`) → `product_owner_assignments` + `profiles.full_name`.
- L3 (DB): RPC `get_sales_search_products` — مسئول را برنمی‌گرداند (C2) ولی جدول `product_owner_assignments` (۳۶۲ ردیف) و تابع `is_product_owner` موجودند؛ ستون owner روی `products` نیست. `ORDER BY` = CASE موجودی سپس `p.name` (مهاجرت 130).
- L4 (access): گارد صفحه `requirePermission("sales","view")` (`:85-87`)؛ خود RPC `has_any_role(sales/admin/manager/accountant)` وگرنه `forbidden`؛ RLS جدول assignments دسترسی خواندن مسئول را تعیین می‌کند.

**شکاف نسبت به نیازمندی:** هیچ شکاف کارکردی؛ فقط اگر لازم شد مسئول از داخل خود RPC بیاید (نه سایدکار)، افزودنی ساده است.

**برنچ:** بله؛ سرور = برنچ nav، فایل‌ها و تابع موجودند.

**وابستگی‌ها:** `product_owner_assignments`, `profiles`, `product_computed_prices`, `has_any_role`.

**برای رفع چه لازم است:** چیزی لازم نیست؛ اختیاری: انتقال محاسبهٔ مسئول به داخل RPC برای حذف کوئری سایدکار.

**ریسک/پیچیدگی:** پایین — همه‌چیز وصل و دارای دادهٔ واقعی است.

---

### آیتم ۱۴۶ — «کپی متن فروش» و حالت‌های قیمت / انتخاب چندتایی

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** کپی متن فروشِ **تک‌محصولی** با تمام حالت‌های قیمت (نوع قیمت × نوع تسویه از دو جدول واقعی) کامل کار می‌کند؛ اما **انتخاب چندتایی/کپی گروهیِ چند محصول** به‌هیچ‌وجه وجود ندارد.

**شواهد:**
- L1 (UI): دکمهٔ «کپی متن فروش» `_app.sales.search.tsx:1435-1437`؛ تابع `handleCopySalesText` `:1086-1122`. هیچ state انتخاب ردیف/«انتخاب همه» در صفحه نیست (grep منفی برای `selectedIds`/`Set<string>` روی نتایج).
- L2 (front): متن از فیلدهای `ProductRow` + آرایهٔ `prices` ساخته و با `navigator.clipboard.writeText` کپی می‌شود؛ الگوی bulk فقط جای دیگر هست (`ProductLabelsQuickDialog.tsx:34,78-83,165`).
- L3 (DB): حالت‌های قیمت از `sale_price_types` (۳ ردیف فعال: نقدی/چکی/همکاری) و `settlement_types` (۶ ردیف فعال شامل «پیش واریز(نقدی)»، «تسویه یک/۲/۳ روزه»، «نصف نقد نصف یک روزه»، «سایت») می‌آیند؛ RPC ردیف‌های baseline + per-settlement می‌سازد. `payment_terms` جدا و بی‌ارتباط است.
- L4 (access): تحت همان گارد `sales:view` صفحه؛ کپی سمت کلاینت است و دسترسی خاصی ندارد.

**شکاف نسبت به نیازمندی:** اگر نیازمندی فقط «کپی متن فروش یک محصول» باشد → کامل. اما بخش «انتخاب چند محصول و کپی/اقدام گروهی» ساخته نشده است (زیرساخت multi-select روی نتایج وجود ندارد).

**برنچ:** بله؛ همه روی برنچ سرور موجود است.

**وابستگی‌ها:** `sale_price_types`, `settlement_types`, `product_computed_prices` (برای قیمت‌ها)؛ برای bulk آتی: الگوی `Set<string>` موجود در پروژه.

**برای رفع چه لازم است:** افزودن state انتخاب چندتایی روی کارت‌های نتیجه (چک‌باکس + «انتخاب همه») و یک اکشن «کپی گروهی» که `handleCopySalesText` را روی محصولات انتخابی حلقه بزند؛ می‌توان الگوی `Set<string>` از `ProductLabelsQuickDialog` را کپی کرد.

**ریسک/پیچیدگی:** متوسط — تک‌محصولی آماده است؛ افزودن multi-select نیازمند state جدید و بازآرایی UI کارت‌ها بدون شکستن رفتار «مشاهده کامل» فعلی.
