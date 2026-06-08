## مسئله واقعی
صفحه روی «در حال بررسی جلسه کاربری...» می‌ماند، در حالی‌که لاگ‌ها نشان می‌دهند session معتبر وجود دارد. همزمان خطای runtime زیر ثبت شده است:

```text
Failed to fetch dynamically imported module: /@id/virtual:tanstack-start-client-entry
```

این یعنی مشکل فقط auth نیست؛ dev/preview نمی‌تواند entry مجازی TanStack Start را پایدار بارگذاری کند و صفحه قبل از تکمیل hydrate/auth دوباره در وضعیت pending می‌افتد.

## برنامه رفع

1. **پایدارسازی بارگذاری اولیه preview**
   - `src/lib/cache-buster.ts` را اصلاح می‌کنم تا خطاهای dynamic import را فقط reload نکند، بلکه در محیط preview/dev Lovable از loop بی‌پایان جلوگیری کند و بعد از سقف تلاش، یک پیام قابل‌فهم/اقدام‌پذیر فارسی نمایش داده شود.
   - اگر لازم باشد `BUILD_TAG` را bump می‌کنم تا cache قدیمی مرورگر کنار گذاشته شود.

2. **رفع race در auth loading**
   - در `src/lib/auth/session.ts` ترتیب `initializeAuthSession` و `ensureAuthReady` را کم‌ریسک‌تر می‌کنم تا `INITIAL_SESSION`/`SIGNED_IN` تکراری نتوانند `loading=true` را بی‌دلیل نگه دارند.
   - از `onAuthStateChange` برای کار سنگین await نمی‌کنم؛ فقط fire-and-forget می‌ماند.
   - حالت «همان کاربر قبلاً identity کامل دارد» باید بدون نمایش loading کلی، فقط session را به‌روزرسانی کند.

3. **عدم اجرای زودهنگام queryهای صفحه پیشنهادها**
   - در `src/routes/_app.marketing.suggestions.tsx` queryها را علاوه بر role، به آماده‌بودن auth/profile هم وابسته می‌کنم تا قبل از آماده‌شدن session و roles اجرا نشوند.
   - اگر نقش‌ها هنوز آماده نیستند، صفحه پیام لودینگ کوتاه/واضح نشان می‌دهد، نه redirect اشتباه یا صفحه قفل‌شده.

4. **بازبینی route guard اصلی**
   - در `src/routes/_app.tsx` بررسی می‌کنم که guard در حالت خطای موقت auth وارد چرخه pending نشود.
   - تغییرات محدود به loading/retry خواهد بود؛ RBAC، schema و RLS دست نمی‌خورد.

5. **اعتبارسنجی بعد از اجرا**
   - preview را روی `/marketing/suggestions` بررسی می‌کنم.
   - console/runtime را برای نبودن loop `INITIAL_SESSION`/`SIGNED_IN` و خطای `virtual:tanstack-start-client-entry` چک می‌کنم.
   - اگر خطای مجازی TanStack همچنان از خود dev server باشد، dev server را restart می‌کنم و نتیجه را گزارش می‌دهم.

## فایل‌های احتمالی تغییر
- `src/lib/cache-buster.ts`
- `src/lib/build-info.ts` در صورت نیاز برای invalidation cache
- `src/lib/auth/session.ts`
- `src/routes/_app.tsx`
- `src/routes/_app.marketing.suggestions.tsx`

## اثرات امنیتی و self-host
- Migration ندارد.
- RLS/RBAC تغییر نمی‌کند.
- Audit log تغییر نمی‌کند.
- وابستگی خارجی/CDN اضافه نمی‌شود.
- با Linux/Docker/self-host سازگار می‌ماند.