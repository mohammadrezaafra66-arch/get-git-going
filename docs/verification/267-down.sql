SET client_encoding='UTF8';

-- Rollback for migration 267 (payment-receipt-documents bucket limits).
--
-- Restores the pre-267 state captured from the live catalog on 2026-08-03:
--   file_size_limit    = NULL
--   allowed_mime_types = NULL
--
-- ⚠️ WARNING — WHAT RUNNING THIS COSTS YOU
-- NULL/NULL means the bucket accepts ANY file, of ANY size, of ANY type --
-- which is precisely the hole the audit flagged. It was the only bucket in the
-- project in that state. Verified after 267 with real uploads through the
-- Storage API: an executable (application/x-msdownload), an application/
-- octet-stream body, and a 21MB file are all refused with HTTP 400, while
-- image/*, application/pdf and text/* are accepted. Reverting re-opens all of
-- that.
--
-- If this is kept reverted, also revert resolveUploadContentType() in
-- src/components/accounting/PaymentReceiptDocuments.tsx -- it exists to stop
-- the client uploading as application/octet-stream, which only matters while
-- the allowlist is in force.

UPDATE storage.buckets
   SET file_size_limit    = NULL,
       allowed_mime_types = NULL
 WHERE id = 'payment-receipt-documents';
