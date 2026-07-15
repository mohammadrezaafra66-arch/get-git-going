## ساخت صفحهٔ گزارش حضور و غیاب

### هدف
یک صفحهٔ جدید در `/presence` که لاگ‌های جدول `presence_logs` (ورود/خروج ثبت‌شده توسط `ClockInOutButton`) را نمایش دهد.

### دسترسی
- کاربر عادی: فقط لاگ‌های خودش.
- ادمین (`has_role(auth.uid(),'admin')`): لاگ همه پرسنل + فیلتر بر اساس کاربر.
- گارد route زیر `_authenticated/` تا SSR 401 نگیرد.

### UI (فارسی، RTL، mobile-first)
- فیلتر بازهٔ تاریخی (پیش‌فرض ۳۰ روز اخیر) + فیلتر کاربر (فقط ادمین).
- جدول ستون‌ها: تاریخ، نام کاربر (ادمین)، ساعت ورود، ساعت خروج، مدت (ساعت:دقیقه)، یادداشت.
- جمع کل ساعات در بازه.
- حالت‌های loading / empty / error فارسی.
- pagination ساده (limit 50 + بارگذاری بیشتر).

### فایل‌های جدید
- `src/routes/_authenticated/presence.tsx` — route + component با TanStack Query.
- `src/lib/presence.functions.ts` — `createServerFn` با `requireSupabaseAuth`:
  - `listPresenceLogs({ from, to, userId? })` — اگر ادمین نبود، `userId` اجباراً `auth.uid()`.
- لینک منو در sidebar/nav موجود (فقط اگر جای طبیعی وجود دارد).

### دیتا
جدول `presence_logs` از قبل موجود است و RLS دارد؛ نیازی به migration نیست. server function روی `context.supabase` کوئری می‌زند تا RLS اعمال شود. برای نمایش نام کاربر، join با `profiles` (یا کوئری دوم `.in('id', userIds)`).

### الزامات پروژه (self-host)
- بدون CDN/فونت خارجی، بدون secret جدید.
- limit + pagination برای جلوگیری از کوئری unbounded.
- TypeScript strict، بدون `any`.

بعد از تأیید، پیاده می‌کنم و build/lint را اجرا می‌کنم.