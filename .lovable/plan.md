## مشکل
خطای `crypto.randomUUID is not a function` هنگام آپلود تصویر محصول.

- `ProductImagesSection` خودش از `safeRandomUUID` استفاده می‌کند و امن است.
- خطا از داخل کتابخانه‌ی `@supabase/supabase-js` می‌آید (بخش storage/realtime که در زمان upload به `crypto.randomUUID` نیاز دارد).
- پلی‌فیل موجود در `src/lib/polyfills/crypto-uuid.ts` فقط زمانی کار می‌کند که شیء `crypto` روی `globalThis` تعریف شده باشد و `getRandomValues` وجود داشته باشد. در سناریوی self-host روی LAN با HTTP (origin غیرِ Secure) در برخی مرورگرها یا Web Contextهای خاص، این شرط برقرار نیست و پلی‌فیل ساکت رد می‌شود.
- ضمناً پلی‌فیل هم‌اکنون از `router.tsx` و `start.ts` وارد می‌شود، ولی اگر ماژول supabase client زودتر از این دو در گراف import اجرا شود (که در HMR/dev ممکن است)، assignment دیر انجام می‌شود.

## راه‌حل (کوچک و بدون تغییر معماری)

### ۱) تقویت پلی‌فیل `src/lib/polyfills/crypto-uuid.ts`
- اگر `globalThis.crypto` اصلاً وجود ندارد، یک شیء minimal بساز شامل `randomUUID` و `getRandomValues` با fallback به `Math.random` (فقط برای IDهای غیرحساس؛ رمز نگاری اینجا در کار نیست).
- Assignment داخل `try/catch` قرار گیرد تا در صورت frozen بودن property، خطا نخوریم و نسخه‌ی wrapper روی `globalThis` قرار گیرد.
- اگر `randomUUID` موجود ولی از throw می‌کند (Insecure Context خاص)، آن را با نسخه‌ی safe بازنویسی کنیم.

### ۲) تضمین بارگذاری زودهنگام پلی‌فیل در کلاینت
- import پلی‌فیل به‌عنوان اولین خط `src/routes/__root.tsx` اضافه شود. `__root.tsx` قطعاً قبل از هر مسیر و درنتیجه قبل از هر فراخوانی supabase در component ها اجرا می‌شود.
- importهای موجود در `router.tsx` و `start.ts` هم دست‌نخورده می‌مانند (idempotent است).

### ۳) بدون تغییر UI/بیزنس‌لاجیک
- منطق آپلود (اعتبارسنجی ۵MB، فرمت‌های image/jpeg|png|webp، حذف، لیست، signedUrl، is_primary) دست‌نخورده باقی می‌ماند.

## فایل‌های تغییر
- `src/lib/polyfills/crypto-uuid.ts` — بازنویسی defensive.
- `src/routes/__root.tsx` — افزودن `import "@/lib/polyfills/crypto-uuid";` در ابتدای فایل.

## مسیر تست
1. `/products/new` → یک محصول جدید بساز و ذخیره کن → به `/products/:id` منتقل می‌شوی.
2. در همان صفحه، بخش «تصاویر محصول» → کلیک روی «افزودن تصویر» → یک JPG/PNG/WebP کوچک‌تر از ۵MB آپلود کن → باید بدون ارور موفق شود، thumbnail نمایش داده شود، اولین تصویر برچسب «اصلی» بگیرد.
3. دو تصویر دیگر آپلود کن → هر سه دیده شوند، فقط اولی «اصلی».
4. آپلود فایل PDF → toast خطا («خطا در بارگذاری» از سمت storage) — اگرچه فیلتر `accept` مانع انتخاب می‌شود، از طریق drag می‌توان تست کرد.
5. آپلود فایل > ۵MB → toast «حجم فایل باید کمتر از ۵ مگابایت باشد».
6. کلیک روی آیکون سطل زباله روی یک تصویر → حذف موفق و ناپدید شدن ردیف.
7. `/products` (لیست) → thumbnail محصول به‌درستی دیده شود (کش `product-thumbnails`).
8. تست روی self-host LAN با HTTP (origin مثل `http://192.168.x.x`) → آپلود باید کار کند (بدون خطای `crypto.randomUUID`).

## Self-Host Acceptance
- بدون وابستگی خارجی/CDN.
- بدون تغییر schema/RLS/RBAC/audit.
- بدون secret جدید.
- سازگار با HTTP LAN (هدف اصلی این fix).