مشکل را در preview بازتولید کردم: صفحه `/` روی «در حال بارگذاری…» می‌ماند و hydration کامل نمی‌شود. در Network هم ده‌ها درخواست route با `net::ERR_ABORTED` دیده می‌شود؛ یعنی زنجیره بارگذاری route tree قبل از اجرای کامل کامپوننت اصلی قطع می‌شود. علت محتمل، ترکیب route tree بسیار بزرگ با importهای سنگین/ناسازگار اخیر است؛ مخصوصاً `isomorphic-dompurify` که `jsdom` را هم وارد dependency graph می‌کند و برای runtime/browser preview مناسب نیست.

برنامه اصلاح:

1. سبک‌سازی و امن‌سازی sanitization
   - `isomorphic-dompurify` را از routeهای `knowledge` و `academy` حذف می‌کنم.
   - به‌جایش یک helper داخلی سبک می‌سازم که فقط در مرورگر از `DOMParser` و allowlist محدود HTML استفاده کند و در SSR هم بدون وابستگی Node-only/سنگین کار کند.
   - `marked` حفظ می‌شود، اما خروجی HTML قبل از `dangerouslySetInnerHTML` با allowlist پاکسازی می‌شود.
   - در صورت امکان وابستگی `isomorphic-dompurify` را از `package.json` حذف می‌کنم تا `jsdom` وارد bundle/SSR نشود.

2. رفع گیر کردن صفحه اصلی
   - route `/` را از redirect صرفاً داخل `useEffect` به یک مسیر مقاوم‌تر تبدیل می‌کنم: در `beforeLoad` سمت client وضعیت auth بررسی شود و به `/dashboard` یا `/login` redirect کند.
   - کامپوننت fallback فقط برای لحظه کوتاه hydration باقی می‌ماند، نه اینکه اگر effect اجرا نشد برای همیشه گیر کند.
   - اگر auth check خطا داد، redirect امن به `/login` انجام می‌شود و صفحه سفید/لودینگ دائمی نمی‌ماند.

3. بهبود fallback خطاهای root
   - برای root route یک `errorComponent` فارسی/RTL اضافه می‌کنم تا اگر خطای render/hydration رخ داد، کاربر صفحه قابل فهم با «تلاش دوباره» و «رفتن به ورود/خانه» ببیند.
   - `console.error(error)` خام حفظ می‌شود تا خطا در لاگ‌ها قابل ردیابی بماند.

4. کنترل regression روی دکمه ثبت فیش
   - چون قبل از این مشکل، دکمه ثبت فیش هم اصلاح شده بود، فایل `PaymentReceiptForm.tsx` را فقط در حد بررسی نگه می‌دارم و تغییر غیرضروری نمی‌دهم.
   - اگر بعد از باز شدن برنامه هنوز ثبت فیش مشکل داشت، علت را جداگانه از مسیر form/validation/RLS بررسی می‌کنم.

5. اعتبارسنجی پس از اعمال
   - preview را روی `/` تست می‌کنم تا دیگر روی «در حال بارگذاری…» نماند و به login/dashboard برسد.
   - console و network را چک می‌کنم تا خطای dynamic import/route abort تکرار نشود.
   - مسیرهای مرتبط با markdown (`/knowledge/...` و `/academy/...`) از نظر import و sanitization بررسی می‌شوند تا dependency سنگین جدیدی وارد نشود.

Self-Host Acceptance Check برنامه‌ریزی‌شده:
- بدون secret در frontend یا repo.
- بدون CDN/API خارجی جدید.
- سازگار با Linux + Docker + self-host؛ حذف `jsdom/isomorphic-dompurify` حتی سازگاری Worker/Docker را بهتر می‌کند.
- بدون migration دیتابیس، چون اصلاح فعلی کد/وابستگی است.
- RBAC/RLS دور زده نمی‌شود؛ guardهای موجود حفظ می‌شوند.
- UI فارسی، RTL و mobile-first حفظ می‌شود.