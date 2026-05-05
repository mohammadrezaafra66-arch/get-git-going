علت خطا مشخص است: درخواست OCR به مسیر `_serverFn/...extractReceiptFromBytes...` با وضعیت 401 برمی‌گردد و متن پاسخ هم می‌گوید: `Unauthorized: No authorization header provided`. یعنی تابع سمت سرور `requireSupabaseAuth` دارد، اما هنگام فراخوانی از فرم ثبت فیش، هدر `Authorization: Bearer <token>` ارسال نمی‌شود. نتیجه این می‌شود که پاسخ 401 به شکل خطای runtime/blank screen دیده می‌شود.

برنامه اصلاح:

1. افزودن ارسال هدر احراز هویت در OCR هنگام انتخاب فایل
   - در `PaymentReceiptForm.tsx` از `session` موجود در `useAuth()` استفاده می‌کنم.
   - قبل از فراخوانی `extractReceiptFromBytes` بررسی می‌شود کاربر session و `access_token` دارد.
   - فراخوانی server function به این شکل اصلاح می‌شود:
     - `headers: { Authorization: `Bearer ${session.access_token}` }`
   - اگر session موجود نبود، به جای crash، پیام فارسی نمایش داده می‌شود و استخراج خودکار رد می‌شود.

2. اصلاح مسیر OCR مستندات ذخیره‌شده فیش‌ها
   - در `PaymentReceiptDocuments.tsx` نیز همین مشکل بالقوه وجود دارد، چون `extractReceiptDocumentOcr` هم از همان middleware احراز هویت استفاده می‌کند.
   - `session` را از `useAuth()` می‌گیرم و هدر Authorization را هنگام فراخوانی `extractReceiptDocumentOcr` ارسال می‌کنم.
   - این کار باعث می‌شود هم OCR قبل از ثبت فیش و هم OCR بعد از ذخیره مستندات درست کار کند.

3. بهبود مدیریت خطای server function برای جلوگیری از blank screen
   - پیام‌های 401/403/500 از OCR به toast فارسی قابل فهم تبدیل می‌شوند.
   - اگر خطا از نوع `Response`، `Error`، یا متن خام بود، به شکل امن استخراج و نمایش داده می‌شود.
   - هدف این است که OCR یک قابلیت کمکی بماند؛ اگر OCR ناموفق بود، فرم ثبت فیش همچنان دستی قابل تکمیل باشد.

4. حفظ الزامات امنیتی و self-host
   - هیچ secret جدیدی اضافه نمی‌شود.
   - هیچ توکنی در frontend hardcode نمی‌شود؛ فقط access token جلسه فعلی کاربر در همان درخواست ارسال می‌شود.
   - هیچ migration یا تغییر دیتابیس لازم نیست.
   - فایل‌های auto-generated مثل `src/integrations/supabase/client.ts` و `types.ts` تغییر داده نمی‌شوند.
   - وابستگی خارجی جدید اضافه نمی‌شود؛ OCR همچنان optional/fallback دستی دارد.

5. بررسی پس از تغییر
   - مسیر `/accounting/receipts/create` را از نظر فراخوانی OCR بررسی می‌کنم.
   - مطمئن می‌شوم درخواست `_serverFn` دیگر بدون Authorization ارسال نمی‌شود.
   - اگر OCR همچنان به دلیل role یا تنظیمات سرور رد شود، پیام فارسی مناسب نمایش داده شود و صفحه blank نشود.

Self-Host Acceptance Check طبق `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`:
- Secret در frontend/commit اضافه نمی‌شود: پاس
- وابستگی حیاتی خارجی جدید اضافه نمی‌شود: پاس
- OCR مسیر کمکی است و fallback دستی حفظ می‌شود: پاس
- RLS/RBAC دور زده نمی‌شود؛ احراز هویت و role check سمت سرور باقی می‌ماند: پاس
- migration لازم نیست چون schema تغییر نمی‌کند: پاس
- سازگار با Linux/Docker/self-host باقی می‌ماند: پاس