-- 342 -- task 1.5 -- document_attachments (polymorphic) + RLS
--
-- Implements ledger-decisions A3: ONE attachments table for all three document kinds, rather
-- than one table per kind. The existing payment_receipt_documents stays where it is; this table
-- serves the new RPC-created documents.
--
-- RLS is exactly the matrix in docs/security/audit-trigger-spec.md section 4:
--   SELECT  admin, accountant, manager
--   INSERT  admin, accountant, manager   (and uploaded_by must be the caller)
--   UPDATE  none  -- no policy at all, so it is impossible, not merely forbidden
--   DELETE  admin only
-- Three policies total, which is what the task's acceptance asserts.
--
-- NOTE on the missing fourth policy: sibling tables carry a RESTRICTIVE `viewer_restricted`
-- policy (NOT is_viewer_only(uid())). It is deliberately absent here and is not a gap: SELECT is
-- already restricted to admin/accountant/manager, and a viewer-only user holds none of those, so
-- the restrictive policy would exclude nobody who is not already excluded. Adding it would also
-- break the acceptance count of 3.
--
-- OCR columns (ocr_payload, ocr_status) are created now but written only in phase 7. They exist
-- here so phase 7 adds no migration to a table the ledger already depends on.
--
-- ROLLBACK: docs/verification/342-down.sql

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() NOT IN ('afrakala','postgres') THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.document_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text        NOT NULL,
  document_id   uuid        NOT NULL,
  storage_path  text        NOT NULL,
  mime_type     text,
  ocr_payload   jsonb,
  ocr_status    text        NOT NULL DEFAULT 'pending',
  uploaded_by   uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_attachments_document_type_check
    CHECK (document_type = ANY (ARRAY['receipt'::text, 'payment'::text, 'dual'::text])),
  CONSTRAINT document_attachments_ocr_status_check
    CHECK (ocr_status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])),
  CONSTRAINT document_attachments_storage_path_not_blank
    CHECK (btrim(storage_path) <> ''),
  CONSTRAINT document_attachments_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_document_attachments_document
  ON public.document_attachments (document_type, document_id);

-- ------------------------------------------------- existence validation ----
-- There is no FK, because document_id points into a different table per document_type. The
-- trigger is what stops an attachment being hung on a document that does not exist.
CREATE OR REPLACE FUNCTION public.validate_document_attachment_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _target text;
  _ok     boolean;
BEGIN
  _target := CASE NEW.document_type
    WHEN 'receipt' THEN 'payment_receipts'
    WHEN 'payment' THEN 'payment_vouchers'
    ELSE NULL
  END;

  IF _target IS NULL THEN
    -- 'dual' is the only remaining value. Its source table is chosen in task 4.2
    -- (decisions.md D10), so there is nothing to validate against yet. Refuse loudly rather
    -- than accept an attachment pointing at nothing: a silently accepted orphan is worse than
    -- a blocked upload, and phase 4 must replace this function anyway.
    RAISE EXCEPTION 'نوع سند «%» هنوز پشتیبانی نمی‌شود؛ جدول مرجع آن در فاز ۴ تعیین می‌شود', NEW.document_type
      USING ERRCODE = '0A000';
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', _target)
    INTO _ok USING NEW.document_id;

  IF NOT _ok THEN
    RAISE EXCEPTION 'سند مرجع پیوست یافت نشد: شناسهٔ % در «%»', NEW.document_id, _target
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_document_attachment_ref ON public.document_attachments;
CREATE TRIGGER trg_validate_document_attachment_ref
  BEFORE INSERT OR UPDATE OF document_type, document_id ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_attachment_ref();

-- ------------------------------------------------------------------ RLS ----
ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_attachments_select ON public.document_attachments;
CREATE POLICY document_attachments_select ON public.document_attachments
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]));

DROP POLICY IF EXISTS document_attachments_insert ON public.document_attachments;
CREATE POLICY document_attachments_insert ON public.document_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(),
              ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role])
              AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS document_attachments_delete_admin ON public.document_attachments;
CREATE POLICY document_attachments_delete_admin ON public.document_attachments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No UPDATE policy on purpose (audit-trigger-spec section 4).

DO $verify$
DECLARE _n int;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'document_attachments') THEN
    RAISE EXCEPTION '342: RLS is not enabled on document_attachments';
  END IF;

  SELECT count(*) INTO _n FROM pg_policies WHERE tablename = 'document_attachments';
  IF _n <> 3 THEN
    RAISE EXCEPTION '342: expected exactly 3 policies on document_attachments, found %', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE tablename = 'document_attachments' AND cmd = 'UPDATE') THEN
    RAISE EXCEPTION '342: an UPDATE policy exists; posted attachments must not be editable';
  END IF;
END
$verify$;
