## مشکل

قیمت‌ها در «لیست‌های فروش» (و PDF خروجی آن‌ها) به‌صورت snapshot روی ستون `sale_list_items.current_price` ذخیره می‌شوند. هرچند یک تریگر روی `product_sale_price_history` وجود دارد که هنگام درج رکورد جدید، snapshot لیست‌ها را به‌روزرسانی می‌کند، اما در عمل:

- PDF از همان snapshot لحظه‌ی ساخت لیست خوانده می‌شود و اگر بعداً قیمت در «کارگاه قیمت» تغییر کند ولی به history اضافه نشود (یا کاربر «نسخه جدید» نسازد)، PDF قدیمی می‌ماند.
- صفحه‌ی جزئیات لیست هیچ realtime/refresh خودکاری ندارد.
- هنگام تولید PDF هیچ همگام‌سازی اجباری انجام نمی‌شود.

## هدف

وقتی قیمت یک محصول از هر مسیری (کارگاه قیمت، تابلوی امین حضور، تنظیمات قیمت و …) تغییر می‌کند، تمام لیست‌های فروشی که آن محصول را با همان `sale_price_type` دارند بدون نیاز به ساخت نسخه‌ی جدید، و چه در نمایش UI، چه در صفحه‌ی عمومی و چه در PDF خروجی، به آخرین قیمت برسند.

## راهکار

سه لایه‌ی همگام‌سازی روی هم:

### ۱. لایه‌ی دیتابیس — تابع همگام‌سازی صریح + پوشش بهتر تریگر

- ساخت تابع `public.refresh_sale_list_prices(p_list_id uuid)` (security definer) که برای یک لیست مشخص، تمام `sale_list_items` آن را از آخرین `product_sale_price_history` همان `sale_price_type` به‌روزرسانی می‌کند (current_price/previous_price/change_amount/change_percent).
- ساخت تابع `public.refresh_all_sale_list_prices()` برای همگام‌سازی کل لیست‌ها (برای cron یا دکمه‌ی ادمین).
- بازنویسی تریگر `sync_sale_list_items_from_history` تا علاوه بر `INSERT/UPDATE` روی `product_sale_price_history`، روی درج در `price_calculation_snapshots` هم فعال شود (در صورت مسیر مستقیم workshop)، و همچنین وقتی `sale_list_items` جدید درج می‌شود، خودش از آخرین history مقداردهی شود (تا آیتم‌های تازه اضافه‌شده هم درست شروع کنند).
- اعطای `EXECUTE` به `authenticated` و `anon` (برای صفحه‌ی عمومی).

### ۲. لایه‌ی Read — اجرای refresh قبل از خواندن

- در `src/lib/public/get-public-sale-list.ts` قبل از کوئری `sale_list_items`، یک `supabase.rpc("refresh_sale_list_prices", { p_list_id })` صدا زده شود تا صفحه‌ی عمومی همیشه آخرین قیمت‌ها را بدهد.
- در `src/routes/_app.pricing.sale-lists_.$listId.tsx` همان rpc قبل از واکشی آیتم‌ها فراخوانی شود؛ یک دکمه‌ی «به‌روزرسانی قیمت‌ها از منبع» هم برای ادمین اضافه شود.
- در تابع تولید PDF (`src/lib/pdf/sale-list-pdf.ts` یا محل فراخوانی آن در صفحه‌ی لیست)، درست قبل از ساخت PDF همان rpc اجرا و سپس آیتم‌ها مجدداً خوانده شوند تا PDF با تازه‌ترین قیمت‌ها رندر شود.

### ۳. لایه‌ی Realtime — به‌روزرسانی لحظه‌ای UI

- فعال‌سازی realtime روی جدول `sale_list_items` (اضافه‌کردن به `supabase_realtime` publication).
- در صفحه‌ی جزئیات لیست، subscription روی تغییرات `sale_list_items` با `sale_list_id = listId` تا جدول و کارت‌های قیمت به محض تغییر (از تریگر دیتابیس) فوراً refresh شوند، بدون نیاز به reload.

### نکات سازگار با قانون مادر

- migration فقط افزودنی (تابع جدید + بازنویسی idempotent تریگر موجود)، بدون DROP COLUMN.
- تابع `SECURITY DEFINER` با `search_path = public` و grant محدود.
- بدون secret جدید، بدون وابستگی خارجی، self-host-friendly.
- realtime publication فقط روی همان جدول، بدون publicاکردن داده‌ی حساس (RLS موجود حفظ می‌شود).
- منطق نسخه‌بندی (`version_number`/`snapshot_data`) دست نمی‌خورد؛ نسخه‌ها همچنان immutable باقی می‌مانند و فقط «نمای جاری لیست منتشرشده» live می‌شود.

## فایل‌های تغییر

- جدید: `supabase/migrations/<timestamp>_refresh_sale_list_prices.sql`
- ویرایش: `src/lib/public/get-public-sale-list.ts`
- ویرایش: `src/routes/_app.pricing.sale-lists_.$listId.tsx` (rpc قبل از fetch + realtime + دکمه‌ی refresh)
- ویرایش: `src/lib/pdf/sale-list-pdf.ts` یا محل فراخوانی آن (refresh قبل از تولید)
- بدون تغییر: `src/integrations/supabase/{client,types}.ts` (auto-regen)

## تأیید

- تغییر قیمت یک محصول در «کارگاه قیمت» → بدون reload، صفحه‌ی جزئیات لیست همان قیمت جدید را نشان می‌دهد.
- دانلود PDF بلافاصله بعد از تغییر قیمت → PDF با قیمت جدید تولید می‌شود.
- باز کردن لینک عمومی لیست → آخرین قیمت دیده می‌شود.
