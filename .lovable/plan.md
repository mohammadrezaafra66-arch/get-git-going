## هدف
رفع سه مشکل صفحه اسناد `/documents` و `/admin/documents`:

1. خطای `crypto.randomUUID is not a function` هنگام آپلود PDF/تصویر.
2. سقف حجم فایل باید ۲۵ مگابایت باشد (الان ۲۰ مگابایت).
3. اطمینان از اینکه پنل تأیید/رد و RBAC (فقط حسابدار/مدیر/ادمین) درست کار می‌کند.

## تحلیل

- `useCreateDocument` از `safeRandomUUID` استفاده می‌کند، اما خطا از **داخل supabase-js** می‌آید (کلاینت realtime/storage هنگام init یا upload به `crypto.randomUUID` نیاز دارد). در LAN self-host با HTTP (غیر secure context)، این API در مرورگر موجود نیست.
- پلی‌فیل در `src/start.ts` و `src/routes/__root.tsx` هست ولی چون ماژول `@/integrations/supabase/client` از خیلی جاها import می‌شود، ممکن است init آن قبل از اجرای پلی‌فیل رخ دهد. مطمئن‌ترین نقطه، ابتدای `src/router.tsx` است که پیش از هر route module بارگذاری می‌شود.
- سقف فعلی در دو جا: `MAX_SIZE` در `useCreateDocument` (۲۰MB) و `DocumentUploadForm` (۲۰MB) و متن UI.
- RLS اسناد از قبل درست است: INSERT فقط برای accountant/manager/admin، UPDATE (تأیید/رد) فقط manager/admin، SELECT برای uploader یا مدیر. نیازی به migration نیست.

## تغییرات

**۱. پلی‌فیل قبل از هر چیز**
- در `src/router.tsx` بالاترین خط: `import "@/lib/polyfills/crypto-uuid";`
- (importهای موجود در `start.ts` و `__root.tsx` حفظ می‌شوند به‌عنوان لایه دوم.)

**۲. سقف ۲۵ مگابایت**
- `src/hooks/documents/useDocuments.ts`: `MAX_SIZE = 25 * 1024 * 1024` و پیام خطا «حجم فایل بیش از ۲۵ مگابایت است».
- `src/components/documents/DocumentUploadForm.tsx`: همان مقدار و متن راهنمای زیر drop zone «jpg، png، pdf — حداکثر ۲۵ مگابایت».

**۳. بدون تغییر backend/RLS**
- پنل «در انتظار تأیید» و دکمه‌های آمد/نیامد در `PendingDocumentsPanel` و `DocumentReviewActions` از قبل هست و طبق RLS فقط برای manager/admin کار می‌کند.

## سناریوهای تست بعد از اعمال
- با حساب حسابدار: آپلود PDF ۵MB → موفق، بدون خطای crypto.
- آپلود PNG ۳MB → موفق.
- آپلود فایل ۳۰MB → پیام «حجم فایل بیش از ۲۵ مگابایت است»، عملیات upload اجرا نشود.
- با حساب فروش (بدون نقش حسابدار): دکمه/فرم آپلود قابل استفاده نباشد.
- با حساب مدیر: تب «در انتظار تأیید» ببیند، «آمد»/«نیامد» با یادداشت ثبت شود.
