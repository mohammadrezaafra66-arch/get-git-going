## هدف

درج رکورد اولیه `version_number=1` در `public.sale_list_versions` هنگام ایجاد لیست فروش جدید، تا صفحه جزئیات که به `snapshot_data` متکی است از همان لحظه ایجاد به‌درستی رندر شود.

## فایل‌های تغییرکرده (دقیقاً ۲ فایل)

1. `src/routes/_app.pricing.sale-lists_.new.tsx` — یک بلاک منطق در `handleSave` بعد از insert موفق `sale_list_items` و قبل از `toast.success`.
2. `docs/lovable-change-reports/2026-05-24-sale-list-initial-version-insert.md` — گزارش جدید.

هیچ فایل دیگری تغییر نمی‌کند. هیچ migration جدید، هیچ تغییر در RLS/Auth/Storage/Docker/env/package.json/routeTree.gen.ts/$listId.tsx/PDF.

## منطق دقیقی که افزوده می‌شود

بعد از `sale_list_items.insert` موفق:

1. **جمع‌آوری اطلاعات محصولات برای snapshot:**
  - ابتدا از `productsQ.data?.rows` (محصولات صفحه فعلی) یک `Map` بساز.
  - برای `selectedIds`ای که در این Map نیستند (محصولات از صفحات دیگر)، یک fetch سبک از `products` با `select id, name, sku, product_type, stock_status, brand:brands(id,name), category:categories(id,name)` انجام بده.
  - اگر این fetch خطا داد → rollback (delete items + delete list) → throw.
2. **ساخت `snapItems` با همان شکل جریان ویرایش** (`_app.pricing.sale-lists_.$listId.tsx` خط 1610):
  - `product_id, product_name, sku, brand_name, category_name, current_price, previous_price, change_amount, change_percent, stock_status, sort_order`
  - مقادیر قیمت از `priceMap` که قبلاً ساخته شده (بدون query جدید).
3. **ساخت `snapshot**` شامل: `id, name, description, terms_text, seller_info, status: "draft", sale_price_type_id, settlement_type_id, selected_columns, items`.
4. **Insert در `sale_list_versions**` با `sale_list_id=listData.id, version_number=1, snapshot_data=snapshot, created_by=userData.user.id`.
5. **Rollback اگر version insert خطا داد:**
  - `delete from sale_list_items where sale_list_id = listData.id`
  - `delete from sale_lists where id = listData.id`
  - throw error → toast خطا نمایش داده شود.

## محتوای گزارش

بخش‌ها: Summary, Files Changed, DB/Migration/RLS/Storage = none, Manual Test Checklist (۷ مورد بالا)، Rollback Plan (`git revert`).

## نکته درباره migration

فایل `supabase/migrations/20260523105325_c6fbd8c4-068c-4f52-901e-0aca4a7fa18f.sql` فقط POLICY روی `currency_rate_fetches` است و ربطی به `sale_list_versions` ندارد. جدول از قبل وجود دارد و schema آن صحیح است؛ هیچ migration جدید لازم نیست و این فایل دست‌نخورده می‌ماند.

## ریسک

LOW — یک insert اضافه با rollback تمیز، بدون تغییر UI/wizard/منطق step.

## Sync GitHub

پس از اتمام تغییر، لطفاً دقیقاً اعلام کن تغییر روی کدام branch و commit hash ثبت شده است. اگر روی main sync شده، آخرین commit hash روی main را اعلام کن. اگر هنوز روی branch داخلی/feature است، نام branch را اعلام کن و بگو چه اقدام UI لازم است تا به main منتقل شود.