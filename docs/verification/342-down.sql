-- 342-down.sql -- rollback for migration 342 (task 1.5)
-- Destroys any attachment rows. Safe while nothing has uploaded yet.
SET client_encoding='UTF8';
BEGIN;
DROP TRIGGER IF EXISTS trg_validate_document_attachment_ref ON public.document_attachments;
DROP FUNCTION IF EXISTS public.validate_document_attachment_ref();
DROP TABLE IF EXISTS public.document_attachments;
COMMIT;
