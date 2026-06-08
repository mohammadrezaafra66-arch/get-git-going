## مشکل گزارش‌شده
صفحه روی پیام «در حال بررسی جلسه کاربری...» باقی می‌ماند و رد نمی‌شود.

## یافته‌ها از بررسی لاگ و کد
- در `client-console` رویدادهای `SIGNED_IN` و `INITIAL_SESSION` با `hasSession: true` به‌درستی ثبت شده‌اند — یعنی توکن سشن سالم است.
- بلافاصله بعد از هر `SIGNED_IN`، پیام `[vite] server connection lost. Polling for restart...` می‌آید و چند ثانیه بعد چرخه تکرار می‌شود. این یعنی preview در حال reload شدن مداوم است و فرصت کامل‌شدن `loadIdentity` (واکشی `profiles` + `user_roles`) را پیدا نمی‌کند، پس صفحه روی pendingComponent (`AuthLoadingScreen`) قفل می‌ماند.
- داده‌های کاربر در دیتابیس سالم است: profile با `status=active`، نقش `admin` در `user_roles` موجود است. پس مشکل از RLS یا داده نیست.
- در `src/routes/_app.tsx` خط ۷۰: `pendingMs: 0` باعث می‌شود حتی برای کوتاه‌ترین تأخیر beforeLoad، pendingComponent فوراً نمایش داده شود. در ترکیب با reloadهای پی‌درپی preview، کاربر فقط لودینگ می‌بیند.
- آستانه «stuckLoading» داخل `AppLayout` روی ۱۲ ثانیه است؛ تا قبل از آن هیچ دکمه «تلاش دوباره» نمایش داده نمی‌شود.

## فرضیه‌های اصلی (به ترتیب احتمال)
1. حلقهٔ reload preview (dev server): تغییرات اخیر فایل‌ها (migration + ویرایش `_app.admin.marketing-channels.tsx` و `_app.marketing.suggestions.tsx`) باعث HMR ناپایدار شده. این مهم‌ترین گزینه است چون لاگ کنسول دقیقاً همین را نشان می‌دهد.
2. کندی یک کوئری وابسته (مثلاً `role_permissions` در `loadRolePermissions` یا view جدید `v_promotion_suggestions`) که هر بار از نو روی همان session اجرا می‌شود و قبل از تمام شدن، صفحه reload می‌شود.
3. باگ منطقی در `ensureAuthReady` بعید است چون لاگ‌های `session.loadIdentity.*` در کنسول دیده نمی‌شوند.

## برنامه تشخیص و رفع (در حالت build اجرا می‌شود)
گام‌ها به ترتیب، هر کدام کوچک و قابل بازگشت:

1. تأیید پایداری dev server
   - اجرای `code--restart_dev_server` برای شکستن چرخهٔ reload فعلی.
   - سپس مشاهدهٔ preview در `/admin/marketing-channels` و بررسی اینکه آیا پیام «vite server connection lost» همچنان تکرار می‌شود.

2. بررسی سلامت کوئری‌های auth
   - گرفتن `client-console` تازه و دیدن لاگ‌های `[auth-diagnostic][session.loadIdentity.*]`.
   - در صورت دیدن `timeout`/`slow`/`retry`، اجرای همان کوئری‌ها مستقیماً روی DB با `supabase--read_query` برای اطمینان از سرعت.

3. کاهش حساسیت UI به تأخیرهای کوتاه (اگر مرحلهٔ ۱ کافی نبود)
   - در `src/routes/_app.tsx`: تغییر `pendingMs: 0` به مقدار کوچک ولی غیرصفر (مثلاً `300`) تا برای انتقال‌های زیر ۳۰۰ms اصلاً pendingComponent نمایش داده نشود و چشمک «در حال بررسی...» کمتر شود.
   - کاهش آستانهٔ `stuckLoading` از ۱۲s به ۶s تا اگر واقعاً گیر کرد، دکمهٔ «تلاش دوباره» زودتر دیده شود.
   - این تغییرات فقط در لایهٔ presentation هستند و منطق auth را دست نمی‌زنند.

4. اگر علت، کوئری خاصی بود (مرحلهٔ ۲ تشخیص داد)
   - فقط همان کوئری/view بهینه می‌شود (افزودن index یا limit). بدون تغییر گسترده.

## فایل‌های احتمالی مورد ویرایش
- `src/routes/_app.tsx` (فقط دو ثابت عددی — `pendingMs` و timeout داخل `useEffect`).
- در صورت نیاز: migration کوچک برای ایندکس روی کوئری کند (فقط بعد از تأیید مرحلهٔ ۲).

## ریسک و تطبیق با قواعد پروژه
- بدون refactor، بدون تغییر schema/RBAC، بدون حذف کد.
- بدون وابستگی به CDN یا سرویس خارجی — کاملاً سازگار با self-host.
- بدون دست‌کاری در فایل‌های auto-generated یا فایل‌های Supabase client.

## تأییدیه قبل از اجرا
لطفاً تأیید کنید که با مراحل ۱ تا ۳ شروع کنم؛ مرحلهٔ ۴ فقط در صورت لزوم و با گزارش جداگانه انجام می‌شود.
