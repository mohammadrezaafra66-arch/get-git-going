SET client_encoding='UTF8';

-- Rollback for migration 263 (delivery-receipts video support).
-- Restores the pre-263 bucket limits captured from the live catalog on 2026-08-03:
--   file_size_limit    = 26214400  (25 MB)
--   allowed_mime_types = image/jpeg, image/png, image/webp, application/pdf
--
-- WARNING: any video already uploaded to delivery-receipts stays in storage and
-- keeps working; this only stops NEW video uploads. Reverting therefore leaves
-- the UI promising mp4/mov/webm again while the bucket refuses it — i.e. it
-- restores the original contradiction on purpose. Only run this if 263 caused a
-- real problem, and re-align DeliveryReceiptUploadForm if it stays reverted.

UPDATE storage.buckets
   SET file_size_limit    = 26214400,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf']
 WHERE id = 'delivery-receipts';
