SET client_encoding='UTF8';

-- =====================================================================
-- 263 — bucket «delivery-receipts» با چیزی که فرم آپلود از قبل وعده می‌دهد
--        هم‌راستا می‌شود.
--
-- DeliveryReceiptUploadForm از ابتدا mp4/mov/webm تا ۱۰۰MB را می‌پذیرد و
-- invoices.product_video_required هم برای همین ساخته شده، ولی bucket فقط
-- تصویر و pdf تا ۲۵MB را قبول می‌کرد — پس آپلود ویدیو همیشه در Storage رد
-- می‌شد، با خطایی که برای کاربر معنا نداشت.
--
-- این مهاجرت فقط سقف حجم و فهرست فرمت را اصلاح می‌کند. هیچ ردیف داده‌ای
-- لمس نمی‌شود و هیچ policy‌ای تغییر نمی‌کند.
--
-- mkv عمداً اضافه نشده: پیام خطای خود فرم هم mkv را نام نمی‌برد و در همین
-- تغییر از UI حذف می‌شود تا هر سه فهرست (accept، ALLOWED_EXT، bucket) یکی باشند.
--
-- الگو از 20260712120000_create_missing_storage_buckets.sql گرفته شده تا
-- اجرای دوباره بی‌خطر (idempotent) بماند.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('delivery-receipts', 'delivery-receipts', false, 104857600, ARRAY[
     'image/jpeg','image/png','image/webp','application/pdf',
     'video/mp4','video/quicktime','video/webm'
   ])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
-- توجه: `public` عمداً در DO UPDATE نیست تا خصوصی‌بودن bucket به‌هیچ‌وجه دست نخورد.
