-- =====================================================================
-- ساخت bucketهای گم‌شده storage
-- Lovable این‌ها را از داشبورد ابری ساخته بود، نه با migration.
-- policyهایشان در migrationها هست ولی خود bucket ساخته نمی‌شد.
-- همه خصوصی — کد فقط createSignedUrl استفاده می‌کند.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', false, 5242880, ARRAY[
     'image/jpeg','image/png','image/webp','image/gif'
   ]),

  ('documents', 'documents', false, 26214400, ARRAY[
     'image/jpeg','image/png','image/webp','application/pdf'
   ]),

  ('delivery-receipts', 'delivery-receipts', false, 26214400, ARRAY[
     'image/jpeg','image/png','image/webp','application/pdf'
   ]),

  ('purchase-receipts', 'purchase-receipts', false, 26214400, ARRAY[
     'image/jpeg','image/png','image/webp','application/pdf'
   ]),

  ('messenger-attachments', 'messenger-attachments', false, 52428800, ARRAY[
     'image/jpeg','image/png','image/webp','image/gif',
     'video/mp4','video/webm','video/quicktime',
     'audio/webm','audio/mpeg','audio/ogg','audio/wav','audio/mp4',
     'application/pdf',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/zip','application/x-zip-compressed'
   ])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public             = EXCLUDED.public;