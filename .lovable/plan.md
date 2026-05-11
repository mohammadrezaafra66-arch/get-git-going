## هدف
افزودن یک آیکون راهنما کنار دکمه «شروع محاسبه و انتشار» در صفحه `/pricing/recompute-prices` که با hover/focus/click متن راهنما را در یک Popover نشان دهد.

## فایل‌های تغییر یافته
- `src/routes/_app.pricing.recompute-prices.tsx` (تنها فایل)

## پیاده‌سازی
1. import کردن `Popover, PopoverTrigger, PopoverContent` از `@/components/ui/popover` (موجود) و آیکون `HelpCircle` از `lucide-react`.
2. کنار دکمه «شروع محاسبه و انتشار» (داخل همان `flex` که `ms-auto` دارد) یک `Popover` با `Button` آیکون-only (`variant="ghost"`, `size="icon"`) قرار دهیم.
   - `aria-label="راهنمای استفاده از انتشار دسته‌ای قیمت فروش"`
   - آیکون: `<HelpCircle className="h-4 w-4" />`
3. `PopoverContent` با `align="end"` و `className="w-80 text-sm"` شامل:
   - عنوان bold: «چه زمانی از این دکمه استفاده کنم؟»
   - توضیح کوتاه + لیست «استفاده کن وقتی…» و «استفاده نکن وقتی…» با `<ul className="list-disc ps-4 space-y-1">`.
   - یک پاراگراف پایانی توضیح‌دهنده.
4. Popover هم با click (موبایل/کیبورد) و هم به‌صورت طبیعی با focus کار می‌کند؛ برای تجربه desktop دکمه trigger روی hover هم می‌تواند یک `title` attribute بگیرد.

## محدودیت‌ها (طبق درخواست)
- بدون تغییر در منطق pricing، database، migration، RPC، permission.
- بدون تغییر در `publishAllProductsPrices` / `publishProductPrices`.
- بدون نصب package جدید (Popover و lucide از قبل موجود است).
- بدون فایل UI جدید.

## Verification
- باز کردن صفحه و کلیک روی آیکون راهنما → نمایش Popover با متن مشخص‌شده.
- دکمه اصلی همچنان عمل publish را انجام دهد.
