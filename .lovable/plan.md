
# افزودن آپلود فایل (عکس / ویدیو / ویس) به فرم بازخورد

در حال حاضر فرم بازخورد (`src/shared/components/FeedbackForm.tsx`) فقط امکان «چسباندن URL» را دارد و کاربر نمی‌تواند مستقیماً فایل آپلود کند. هدف: کاربر بتواند از داخل فرم، عکس، ویدیو یا ویس (حتی ضبط مستقیم) ضمیمه کند.

## تغییرات دیتابیس / استوریج

ایجاد یک bucket اختصاصی در Lovable Cloud برای پیوست‌های بازخورد:

- نام bucket: `feedback-attachments`
- نوع: **private** (نه public) — لینک‌ها از طریق signed URL ارائه می‌شوند تا فقط کاربران مجاز ببینند.
- ساختار مسیر: `{user_id}/{feedback_temp_id}/{timestamp}_{filename}`
- محدودیت‌ها در RLS و در کلاینت:
  - حداکثر حجم هر فایل: 25MB
  - فرمت‌های مجاز: `image/*`, `video/mp4`, `video/webm`, `video/quicktime`, `audio/*`
- RLS روی `storage.objects`:
  - INSERT: فقط کاربر authenticated می‌تواند داخل پوشه‌ای که نام آن برابر `auth.uid()` است آپلود کند.
  - SELECT: مالک فایل + نقش‌های `admin` و `feedback_reviewer` (با `has_role`).
  - DELETE: فقط مالک تا قبل از submit شدن بازخورد، و admin همیشه.

migration تحت `supabase/migrations/` ایجاد می‌شود (idempotent، reversible).

## تغییرات بک‌اند (Server Functions)

دو server function جدید در `src/server/feedback-attachments.functions.ts`:

1. `createFeedbackUploadUrl` — با `requireSupabaseAuth`، یک signed upload URL برمی‌گرداند (validation: نوع MIME، حجم، تعداد کل پیوست‌های همان session).
2. `getFeedbackAttachmentSignedUrl` — برای نمایش پیوست‌های قبلی در صفحه جزئیات بازخورد، signed URL کوتاه‌مدت تولید می‌کند.

> دلیل استفاده از signed URL: bucket private است؛ هیچ لینک دائمی عمومی منتشر نمی‌شود → سازگار با خط‌مشی self-host و امنیت.

## تغییرات UI — `FeedbackForm.tsx`

جایگزینی کامل بخش «پیوست‌ها (URL)» با کامپوننت جدید:

- دکمه‌های انتخاب:
  - «انتخاب عکس/ویدیو» (input file با `accept="image/*,video/*"`)
  - «انتخاب فایل صوتی» (`accept="audio/*"`)
  - «ضبط ویس» (با `MediaRecorder API` — ضبط mic و تولید Blob `audio/webm`)
- هنگام انتخاب فایل:
  1. اعتبارسنجی client (نوع + حجم) با پیام فارسی.
  2. درخواست signed upload URL از server function.
  3. آپلود مستقیم به Storage با progress bar (XHR برای پشتیبانی progress).
  4. اضافه شدن به لیست پیوست‌ها به‌صورت `{ path, mime_type, size, name }`.
- پیش‌نمایش هر پیوست بسته به نوع:
  - عکس → thumbnail
  - ویدیو → `<video controls>` کوچک
  - صدا → `<audio controls>`
- امکان حذف هر پیوست قبل از ثبت نهایی (هم از لیست و هم از Storage).
- حفظ سازگاری با field فعلی `attachment_urls` در جدول `feedback_items`: به‌جای URLهای خام، **مسیرهای داخلی Storage (path)** ذخیره می‌شوند تا signed URL در زمان نمایش ساخته شود. در صورت نیاز برای backward compatibility، اگر مقدار با `http` شروع شد همان رفتار قبلی اعمال می‌شود.

## تغییرات نمایش بازخورد

در `src/routes/_app.feedback_.$feedbackId.tsx` (و هرجا attachmentها نمایش داده می‌شود):
- برای هر path، با `getFeedbackAttachmentSignedUrl` لینک امضاشده گرفته می‌شود.
- رندر بر اساس MIME: image/video/audio inline؛ سایر موارد به‌صورت دکمه دانلود.

## رعایت قوانین مادر پروژه

- کاملاً self-host: از Lovable Cloud Storage (Supabase Storage) استفاده می‌شود، بدون CDN خارجی.
- bucket **private** + RLS سختگیرانه + signed URL.
- migration نوشته می‌شود؛ هیچ تغییر دستی روی schemaهای رزرو شده.
- audit log: هنگام افزودن/حذف پیوست رویداد در `audit_logs` ثبت می‌شود.
- فارسی، RTL، mobile-first؛ ضبط ویس با fallback پیام در صورت نبود مجوز mic.
- بدون secret در frontend؛ آپلود از طریق signed URL سمت سرور.

## فایل‌هایی که تغییر می‌کنند یا اضافه می‌شوند

- جدید: `supabase/migrations/{timestamp}_feedback_attachments_bucket.sql`
- جدید: `src/server/feedback-attachments.functions.ts`
- جدید: `src/shared/components/FeedbackAttachmentUploader.tsx` (استخراج منطق آپلود/ضبط)
- ویرایش: `src/shared/components/FeedbackForm.tsx` (جایگزینی بخش پیوست‌ها)
- ویرایش: `src/routes/_app.feedback_.$feedbackId.tsx` (نمایش پیوست‌ها با signed URL)
- ویرایش: `src/routes/_app.feedback_.create.tsx` (در صورت نیاز برای پاس دادن user id به آپلودر)

## نکته باز برای تأیید شما

محدودیت پیشنهادی: **حداکثر ۵ پیوست در هر بازخورد، هر فایل تا ۲۵MB**. اگر مقدار دیگری مدنظر دارید قبل از پیاده‌سازی اعلام کنید (مثلاً برای ویدیوهای طولانی‌تر تا ۱۰۰MB).
