SET client_encoding='UTF8';

-- =====================================================================
-- 267 — سقف اندازه و نوع فایل برای bucket «payment-receipt-documents» (فاز ۱.۳)
--
-- حفره (ممیزی ۲۲۰–۲۲۶): این تنها bucket پروژه است که **هر دو** مقدار
-- file_size_limit و allowed_mime_types در آن NULL است — یعنی هر فایلی، با هر
-- حجمی و هر نوعی، پذیرفته می‌شود. تأیید روی کاتالوگ زنده:
--
--   delivery-receipts          100MB  ۷ نوع
--   documents                   25MB  ۴ نوع
--   feedback-attachments        25MB  ۱۴ نوع
--   messenger-attachments       50MB  ۱۹ نوع
--   payment-receipt-documents   NULL  NULL   ← تنها مورد
--   product-images               5MB  ۴ نوع
--   purchase-receipts           25MB  ۴ نوع
--
-- ── مقادیر از روی وعدهٔ خودِ UI انتخاب شدند، نه سلیقه‌ای ───────────────
-- `PaymentReceiptDocuments.tsx` صریحاً به کاربر می‌گوید:
--   «حداکثر ۲۰ مگابایت برای هر فایل، تا ۱۰ فایل»
--   MAX_DOC_SIZE_BYTES = 20 * 1024 * 1024
-- و فهرست نوع‌ها از `ALLOWED_DOC_EXTENSIONS` / `ALLOWED_DOC_ACCEPT` می‌آید
-- (تصویر، PDF، متن، Word/Excel/PowerPoint، و آرشیو).
--
-- درس مهاجرت ۲۶۳: هر سه لایه — رشتهٔ accept، اعتبارسنجی کلاینت، و خودِ bucket —
-- باید هم‌راستا باشند. اگر bucket سخت‌گیرتر از UI باشد، کاربر فایلی را انتخاب
-- می‌کند که فرم می‌پذیرد ولی Storage رد می‌کند.
--
-- ── نکتهٔ application/octet-stream ────────────────────────────────────
-- کلاینت پیش از این با `contentType: file.type || 'application/octet-stream'`
-- آپلود می‌کرد. اگر octet-stream در فهرست مجاز می‌آمد، کل محدودیت نوع بی‌اثر
-- می‌شد (هر فایلی را می‌شد با همان نوع فرستاد). پس عمداً **مجاز نشد** و در عوض
-- کلاینت اصلاح شد تا نوع را از پسوند استخراج کند (همان commit).
--
-- bucket خصوصی می‌ماند: ستون `public` عمداً در DO UPDATE نیست.
-- =====================================================================

UPDATE storage.buckets
   SET file_size_limit    = 20971520,  -- 20 MB, exactly MAX_DOC_SIZE_BYTES
       allowed_mime_types = ARRAY[
         -- images: the UI's accept string uses image/*, so mirror that rather
         -- than enumerating and accidentally excluding heic/heif/bmp/tiff.
         'image/*',
         -- text: the client validator accepts any text/* too.
         'text/*',
         'application/pdf',
         'application/rtf',
         -- Office
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         -- archives (a customer may send several receipts together).
         -- zip spellings mirror the messenger-attachments bucket already in use.
         'application/zip',
         'application/x-zip-compressed',
         'application/vnd.rar',
         'application/x-rar-compressed',
         'application/x-7z-compressed'
       ]
 WHERE id = 'payment-receipt-documents';
