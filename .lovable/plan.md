# Phase PW.1 + PW.2 — پلن اجرا

## ۱) نتیجه inspect

**Route صفحه:** `src/routes/_app.pricing.my-workbench.tsx` (768 خط — صفحه فعلی کارگاه قیمت من).
**Query/types:** `src/lib/pricing/workbench.ts` (`fetchMyWorkbenchRows`، `WorkbenchRow`، `StockStatus`).
**Helpers برند/دسته/برچسب:** `src/lib/products/queries.ts` (`fetchBrandsLite`, `fetchCategoriesLite`, `fetchLabelsLite`).
**Permissions:** RLS روی همه جدول‌های موردنیاز برای authenticated باز است — read access نیازی به migration ندارد.

## ۲) Mapping فیلدهای واقعی دیتابیس

| نیاز | فیلد/جدول واقعی |
|---|---|
| نام محصول | `products.name`, `products.sku`, `products.model` |
| برند | `products.brand_id` → `brands.name` |
| دسته / زیر‌دسته | `products.category_id` → `categories(id, parent_id, name)` (سلسله‌مراتبی) |
| نوع خرید | `products.product_type` enum `iranian` / `foreign` |
| ارز | `products.base_currency` و `purchase_prices.currency` enum `toman` / `usd` / `aed` |
| وضعیت موجودی | `products.stock_status` enum `available` / `limited` / `unavailable` / `unknown` |
| فعال/غیرفعال | `products.status` enum `active` / `inactive` / `discontinued` (+`is_active` boolean) |
| قیمت فروش | `product_computed_prices.rounded_sale_price` (latest per product+sale_price_type) |
| مسئول محصول | `product_owner_assignments(product_id, user_id)` → `profiles` |
| برچسب‌ها | `product_label_links(product_id, label_id)` → `product_labels(title, color)` |

«دارای قیمت فروش» = حداقل یک ردیف در `product_computed_prices` با `rounded_sale_price > 0` برای آن محصول.

## ۳) ساختار پیاده‌سازی

### فایل‌های جدید
- `src/lib/pricing/workbench-filters.ts` — types و helperهای محض (`hasValidSalePrice`, `getProductPricingIssues`, `getTaggedProductRiskPriority`, `normalizeInventoryStatus`).
- `src/lib/pricing/workbench-queries.ts` — query جدید `fetchWorkbenchRowsV2` با فیلترهای کامل + pagination، و `fetchWorkbenchHealthReport` برای دو گزارش (single fetch با limit بالا و paginate سمت client روی dataset مشکل‌دار).
- `src/lib/pricing/workbench-csv.ts` — export ساده CSV با هدر فارسی.
- `src/components/pricing/workbench/WorkbenchFiltersBar.tsx` — UI فیلترها (collapsible grid).
- `src/components/pricing/workbench/HealthReportTab.tsx` — تب گزارش‌ها (خلاصه + دو جدول + breakdown مسئول).

### فایل‌های ویرایش‌شده
- `src/routes/_app.pricing.my-workbench.tsx` — افزودن Tabs (`کارگاه` | `گزارش سلامت`)، نصب فیلتربار جدید، استفاده از `fetchWorkbenchRowsV2`، sync با URL query params، ستون‌های جدید (برچسب‌ها، مسئول، قیمت فروش، badge غیرفعال/بدون قیمت/بدون مسئول).
- `src/lib/pricing/workbench.ts` — افزودن فیلدهای جدید به `WorkbenchRow` (`status`, `product_type`, `category_id`, `tags[]`, `owners[]`, `sale_price`).

### Query استراتژی (server-side تا حد ممکن)
1. base: `products` با `.in/.eq` برای brand/category/subcategory/status/stock/product_type/base_currency و `.range` برای pagination.
2. اگر subcategory انتخاب شد → `category_id = subId`، در غیر این صورت اگر category انتخاب شد → `category_id IN (cat + childrenIds)`.
3. برای فیلتر «مسئول»: pre-fetch `product_owner_assignments` با `user_id = X` یا `NOT IN` برای «بدون مسئول» (محدودیت: روی dataset بزرگ ممکن است محدود به اولین 10k باشد — comment).
4. برای فیلتر «برچسب»: pre-fetch `product_label_links` با `label_id = X` یا `IN`/`NOT IN` برای «دارای/بدون برچسب».
5. برای فیلتر «دارای/بدون قیمت فروش»: pre-fetch distinct `product_id` از `product_computed_prices` با `rounded_sale_price > 0`، سپس `IN`/`NOT IN`.
6. پس از گرفتن productIds صفحه، latest sale_price + tags + owners را با queryهای کوچک batch.

### فیلترها (state داخلی + sync با search params)
search, brand, category, subcategory, currencyType (`all|toman|foreign`), currency (`all|toman|usd|aed`), inventory, productStatus, salePriceStatus (`all|has|missing`), ownerId (`all|none|<uuid>`), labelId (`all|none|any|<uuid>`), stepPct. هر تغییر → `setPage(0)`.

### گزارش سلامت
تب جدا. fetch با `fetchWorkbenchHealthReport` (تا 2000 ردیف مشکل‌دار با limit). دو جدول:
- **محصولات ناقص**: where `status != active` OR `bad_price` OR `no_owner`.
- **محصولات برچسب‌دار مشکل‌دار**: where `tags.length > 0` AND (unavailable OR inactive OR bad_price OR no_owner).
خلاصه‌کارت‌ها از `summarize(rows)` در helper.
ستون «اولویت اصلاح» با `getTaggedProductRiskPriority` (فوری/بالا/متوسط/پایین) و sort.
breakdown مسئول: `groupBy(owners[0]?.id || 'none')` روی همان dataset.
دو دکمه CSV export client-side از همان data.

## ۴) محدودیت‌ها و یادداشت‌ها

- هیچ migration. روی dataset >10k، فیلترهای ترکیبی tag+owner+salePrice ممکن است نیاز به view/RPC داشته باشند — در همین فاز صرفاً comment + TODO.
- realtime اضافه نمی‌شود.
- هیچ تغییری در: auth/RBAC/RLS، migrations، Caddy/Docker/LAN، deploy، edge functions، OCR/AI.
- صفحه‌بندی همچنان 25 رکورد. گزارش سلامت تا 2000 محصول مشکل‌دار را نشان می‌دهد (با Note بالای جدول).

## ۵) تست‌های انجام‌شدنی

build + typecheck + smoke (باز کردن صفحه، تست هر فیلتر، گزارش، CSV). تست‌های نیازمند داده واقعی صریحاً گزارش می‌شوند.

## ۶) خروجی نهایی

پس از تأیید این پلن، فایل‌ها را با حداقل تماس‌های ابزاری می‌سازم و در پایان دقیقاً طبق ساختار 22-بندی شما گزارش می‌دهم.
