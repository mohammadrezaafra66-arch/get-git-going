-- 346 -- GATE A phase 1 -- fixes for MAJOR defects M1, M2, M3, M4
--
-- Report: docs/execution/phase-1-GATE-A.md. Each fix below names the defect it closes.
--
-- ===========================================================================================
-- M1 -- require_asan_code was an RLS bypass
-- ===========================================================================================
-- 340 created it SECURITY DEFINER, granted to `authenticated`, with NO role gate, while every
-- other function in the phase has one. person_identifiers RLS deliberately withholds that table
-- from viewers. Gate A proved the bypass with a real viewer-only user:
--     direct SELECT on person_identifiers -> 0 rows
--     require_asan_code(<same person>)    -> an 8-character code
-- and the failure branch additionally disclosed persons.display_name.
--
-- FIX: SECURITY INVOKER, as the reviewer recommended. Better than bolting on a role gate: the
-- phase-2/3/4 create RPCs are themselves SECURITY DEFINER owned by supabase_admin, so the
-- function still resolves codes correctly inside them, while a direct caller gets exactly the
-- visibility person_identifiers RLS already grants. Least privilege by construction rather than
-- by an added check that could drift from the RLS it is meant to mirror.
--
-- ===========================================================================================
-- M2 -- a fabricated posted entry could be inserted straight through PostgREST
-- ===========================================================================================
-- audit-trigger-spec section 4 requires INSERT/UPDATE/DELETE = none on journal_entries and
-- journal_lines: "no policy at all, so a direct PostgREST write is impossible by construction".
-- Both tables still carried *_insert_admin_accountant and *_update_admin_accountant. Gate A ran
-- the spec's own section 6 test as an accountant and it SUCCEEDED - a fabricated status='posted'
-- entry, bypassing the document number, the Asan-code precondition, the balance invariant and
-- the mandatory audit row.
--
-- Task 1.6 gave us immutability without closing the INSERT path, which guards the wrong door:
-- you cannot edit a posted entry, but you can manufacture one.
--
-- FIX: drop the INSERT and UPDATE policies on both tables. The SECURITY DEFINER RPCs are
-- unaffected - they run as the table owner and RLS does not apply to them (neither table is
-- FORCE). SELECT policies are left exactly as they are.
--
-- ===========================================================================================
-- M3 -- the manager role could start a document it could not number
-- ===========================================================================================
-- audit-trigger-spec section 3 prescribes has_any_role(admin, accountant, manager) as the
-- canonical gate for the create RPCs, and section 4 puts manager on document_attachments. But
-- 338 gated assign_document_number on admin+accountant only. Gate A proved a manager passes the
-- canonical gate and the attachments policy, then gets 42501 from the numbering step - so a
-- phase-2 create_receipt would mint the source row and die mid-transaction.
--
-- FIX: admit manager to assign_document_number, so the whole chain admits the same set. The
-- document_numbers SELECT policy is deliberately NOT widened: manager may create a document but
-- has no business browsing the numbering ledger, which is what section 4 says.
--   >>> OG-13 (refined): confirm the boundary is admin+accountant+manager for CREATING a
--   document and admin+accountant for READING the numbering ledger.
--
-- ===========================================================================================
-- M4 -- document_attachments orphaned on parent delete
-- ===========================================================================================
-- No FK is possible (the column is polymorphic), but 338 gave document_numbers burn-on-delete
-- triggers on the same two tables, and the table this one mirrors (payment_receipt_documents)
-- has ON DELETE CASCADE. The existence trigger is BEFORE INSERT OR UPDATE, so it never revisits
-- a row. Gate A proved it: attachment inserted, parent receipt deleted, attachment still there.
-- Phase 7 would run OCR over rows whose document no longer exists, and the storage objects
-- behind them would never be reclaimed.
--
-- FIX: AFTER DELETE triggers on payment_receipts and payment_vouchers that remove the matching
-- attachment rows, mirroring the burn triggers 338 installs on the same two tables.
-- NOTE: this deletes the DATABASE rows. The storage objects behind them are reclaimed by the
-- application, not here; SQL cannot delete from the storage bucket.
--
-- ROLLBACK: docs/verification/346-down.sql

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() NOT IN ('afrakala','postgres') THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

-- ------------------------------------------------------------------- M1 ----
CREATE OR REPLACE FUNCTION public.require_asan_code(p_person_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _code text;
  _name text;
BEGIN
  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ شخص برای بررسی کد آسان الزامی است'
      USING ERRCODE = '22023';
  END IF;

  SELECT NULLIF(btrim(pi.value_normalized), '')
    INTO _code
    FROM public.person_identifiers pi
   WHERE pi.person_id = p_person_id
     AND pi.kind = 'asan_person_code'
   LIMIT 1;

  IF _code IS NOT NULL THEN
    RETURN _code;
  END IF;

  SELECT p.display_name INTO _name FROM public.persons p WHERE p.id = p_person_id;

  IF _name IS NULL THEN
    RAISE EXCEPTION 'شخص یافت نشد؛ بدون کد آسان نمی‌توان سند ثبت کرد'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE EXCEPTION 'کد آسان برای «%» ثبت نشده است؛ ابتدا کد آسان او را وارد کنید، سپس سند را ثبت کنید', _name
    USING ERRCODE = 'P0001';
END;
$function$;

-- ------------------------------------------------------------------- M2 ----
DROP POLICY IF EXISTS journal_entries_insert_admin_accountant ON public.journal_entries;
DROP POLICY IF EXISTS journal_entries_update_admin_accountant ON public.journal_entries;
DROP POLICY IF EXISTS journal_lines_insert_admin_accountant   ON public.journal_lines;
DROP POLICY IF EXISTS journal_lines_update_admin_accountant   ON public.journal_lines;

-- ------------------------------------------------------------------- M3 ----
CREATE OR REPLACE FUNCTION public.assign_document_number(_doc_type text, _source_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid    uuid := auth.uid();
  _number text;
  _serial integer;
  _jyear  integer;
  _prefix text;
BEGIN
  IF _doc_type IS NULL OR _doc_type NOT IN ('receipt', 'payment', 'dual') THEN
    RAISE EXCEPTION 'نوع سند برای شماره‌گذاری معتبر نیست' USING ERRCODE = '22023';
  END IF;

  IF _source_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ سند برای شماره‌گذاری الزامی است' USING ERRCODE = '22023';
  END IF;

  -- 346/M3: manager admitted, matching audit-trigger-spec section 3's canonical gate, so the
  -- create RPCs cannot admit a caller the numbering step then refuses mid-transaction.
  IF NOT public.has_any_role(_uid,
        ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ شماره‌گذاری سند را ندارید' USING ERRCODE = '42501';
  END IF;

  SELECT document_number INTO _number
    FROM public.document_numbers
   WHERE doc_type = _doc_type AND source_id = _source_id;
  IF FOUND THEN
    RETURN _number;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('document_numbers:' || _doc_type));

  SELECT document_number INTO _number
    FROM public.document_numbers
   WHERE doc_type = _doc_type AND source_id = _source_id;
  IF FOUND THEN
    RETURN _number;
  END IF;

  SELECT COALESCE(MAX(serial), 0) + 1 INTO _serial
    FROM public.document_numbers
   WHERE doc_type = _doc_type;

  _jyear  := public.jalali_year(public.tehran_today());
  _prefix := CASE _doc_type
               WHEN 'receipt' THEN 'RCP'
               WHEN 'payment' THEN 'PAY'
               WHEN 'dual'    THEN 'DUAL'
             END;
  _number := _prefix || '-' || _jyear::text || '-' || lpad(_serial::text, 6, '0');

  INSERT INTO public.document_numbers
    (doc_type, source_id, serial, jalali_year, document_number, assigned_by)
  VALUES (_doc_type, _source_id, _serial, _jyear, _number, _uid);

  RETURN _number;
END;
$function$;

-- ------------------------------------------------------------------- M4 ----
CREATE OR REPLACE FUNCTION public.tg_cleanup_receipt_attachments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.document_attachments
   WHERE document_type = 'receipt' AND document_id = OLD.id;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_cleanup_payment_attachments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.document_attachments
   WHERE document_type = 'payment' AND document_id = OLD.id;
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_cleanup_receipt_attachments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_cleanup_payment_attachments() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_cleanup_receipt_attachments ON public.payment_receipts;
CREATE TRIGGER trg_cleanup_receipt_attachments
  AFTER DELETE ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.tg_cleanup_receipt_attachments();

DROP TRIGGER IF EXISTS trg_cleanup_payment_attachments ON public.payment_vouchers;
CREATE TRIGGER trg_cleanup_payment_attachments
  AFTER DELETE ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.tg_cleanup_payment_attachments();

-- ---------------------------------------------------------------- verify ----
DO $verify$
DECLARE _n int;
BEGIN
  -- M1
  IF (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='require_asan_code') THEN
    RAISE EXCEPTION '346/M1: require_asan_code is still SECURITY DEFINER';
  END IF;

  -- M2
  SELECT count(*) INTO _n FROM pg_policies
   WHERE tablename IN ('journal_entries','journal_lines') AND cmd IN ('INSERT','UPDATE');
  IF _n <> 0 THEN
    RAISE EXCEPTION '346/M2: % INSERT/UPDATE policies remain on the ledger tables', _n;
  END IF;

  -- M3
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='assign_document_number'))
     NOT LIKE '%manager%' THEN
    RAISE EXCEPTION '346/M3: assign_document_number still excludes manager';
  END IF;

  -- M4
  SELECT count(*) INTO _n FROM pg_trigger
   WHERE tgname IN ('trg_cleanup_receipt_attachments','trg_cleanup_payment_attachments');
  IF _n <> 2 THEN
    RAISE EXCEPTION '346/M4: expected 2 attachment cleanup triggers, found %', _n;
  END IF;
END
$verify$;
