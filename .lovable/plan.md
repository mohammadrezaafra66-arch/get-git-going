## تغییر

افزودن prop `connectNulls` به کامپوننت `<Line>` در `src/components/pricing/price-history/ProductPriceChart.tsx` تا اگر در دیتای نمودار نقطه‌ای null یا missing بود (مثلاً وقتی نرخ دلار برای بخشی از بازه موجود نیست)، خط بین دایره‌ها قطع نشود و همه نقاط به‌هم وصل بمانند.

## فایل‌های تغییریافته

- `src/components/pricing/price-history/ProductPriceChart.tsx` — افزودن `connectNulls` به `<Line>`.

## ریسک

ندارد. صرفاً رفتار بصری نمودار را روی نقاط null تغییر می‌دهد. منطق داده، query، RLS، self-host و bundle بدون تغییر.

## معیار پذیرش

- در نمودار قیمت محصول، اگر بین نقاط، دیتاپوینت null وجود داشته باشد، دایره‌ها همچنان با خط منحنی به هم وصل نمایش داده می‌شوند.