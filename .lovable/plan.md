## هدف
وقتی drawer تاریخچه قیمت یک محصول باز است، هر تغییر جدید در جدول `product_sale_price_history` بلافاصله روی نمودار و لیست «آخرین تغییرات» ظاهر شود — بدون نیاز به بستن/باز کردن یا refresh.

## رویکرد
استفاده از Supabase Realtime (postgres_changes) با فیلتر روی `product_id` و `sale_price_type_id`، و invalidate کردن React Query فقط برای queryKey همان محصول. بدون تغییر در business logic یا UI.

## مراحل

### 1) Migration: فعال‌سازی Realtime روی جدول
فایل migration جدید با timestamp:
```sql
-- REPLICA IDENTITY FULL برای دریافت کامل payload (شامل old/new)
ALTER TABLE public.product_sale_price_history REPLICA IDENTITY FULL;

-- اضافه کردن جدول به publication realtime (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'product_sale_price_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_sale_price_history;
  END IF;
END $$;
```
- reversible، idempotent، سازگار با backup/restore.
- RLS موجود روی جدول دست‌نخورده باقی می‌ماند (Realtime به RLS احترام می‌گذارد).

### 2) Hook جدید: `useProductPriceHistoryRealtime`
فایل: `src/hooks/pricing/useProductPriceHistoryRealtime.ts`
- ورودی: `productId`, `salePriceTypeId`, `enabled`.
- ساخت یک `supabase.channel(...)` یکتا برای ترکیب این دو id.
- اشتراک روی `postgres_changes` با:
  - `event: 'INSERT'` (هر تغییر قیمت = یک ردیف جدید)
  - `schema: 'public'`, `table: 'product_sale_price_history'`
  - `filter: product_id=eq.<id>` (Realtime فقط یک فیلتر postgres را پشتیبانی می‌کند؛ فیلتر دوم روی `sale_price_type_id` در callback انجام می‌شود)
- در callback:
  - اگر `payload.new.sale_price_type_id !== salePriceTypeId` → نادیده.
  - در غیر این صورت: `queryClient.invalidateQueries({ queryKey: ['product-price-history', productId, salePriceTypeId] })`.
- پاکسازی: `supabase.removeChannel(channel)` در cleanup.
- `enabled=false` ⇒ هیچ subscription ساخته نشود.

### 3) اتصال در drawer
در `ProductPriceHistoryDrawer.tsx`:
- فراخوانی hook جدید با `enabled = open && !!productId && !!salePriceTypeId`.
- بدون تغییر در UI/کنترل‌ها.

### 4) بهبود UX (کوچک، اختیاری ولی توصیه‌شده)
- نشانگر کوچک «زنده» کنار عنوان drawer (نقطه سبز چشمک‌زن) فقط وقتی channel متصل است (`status === 'SUBSCRIBED'`). از طریق state داخل hook export می‌شود.

## فایل‌های تحت تاثیر
- جدید: `supabase/migrations/<timestamp>_realtime_product_sale_price_history.sql`
- جدید: `src/hooks/pricing/useProductPriceHistoryRealtime.ts`
- ویرایش جزئی: `src/components/pricing/price-history/ProductPriceHistoryDrawer.tsx` (فراخوانی hook + نشانگر زنده)

## ملاحظات امنیتی و عملکردی
- بدون secret یا CDN خارجی؛ کاملاً self-host سازگار.
- RLS جدول دست‌نخورده؛ Realtime همان policy ها را اعمال می‌کند.
- subscription فقط زمان باز بودن drawer فعال است → بار شبکه/سرور حداقل.
- queryKey دقیقاً همان hook موجود است؛ فقط invalidate می‌کنیم تا React Query refetch کند (به جای دستکاری دستی cache) — ساده، قابل اطمینان، و سازگار با range-های مختلف.
- چون از invalidate استفاده می‌کنیم، می‌توان `staleTime` فعلی (60s) را نگه داشت بدون هیچ تأخیری در نمایش تغییرات.

## معیار پذیرش
- باز بودن drawer برای محصول X و درج یک ردیف جدید در `product_sale_price_history` برای همان محصول → نمودار stepAfter یک پله جدید نشان دهد و لیست «آخرین تغییرات» به‌روز شود، بدون اقدام کاربر.
- درج برای محصول دیگر → هیچ refetch بی‌مورد رخ ندهد.
- بستن drawer → channel آزاد شود (بدون memory leak).
