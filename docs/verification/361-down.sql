-- 361-down.sql — reverse migration 361 (create_dual_document).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (Gate A M7).
--
-- WHAT 361 ADDED: exactly one object, public.create_dual_document (18 arguments, including
-- p_intermediary_id, p_intermediary_fee, p_fee_borne_by). It creates no table. The dual_documents
-- table and its guards belong to 360-down.
--
-- ORDERING — READ THIS BEFORE RUNNING. These three files are not equally current.
--
--   1. 362-down.sql FIRST  — restores the fee columns and the 18-arg function that 361 installed.
--   2. THIS FILE          — drops that 18-arg function.
--   3. 360-down.sql LAST  — drops the table (refuses while any row exists).
--
-- CORRECTION 2026-08-19 (phase-4 Gate A M1). Migration 362 replaced the 18-arg function with a
-- 15-arg one. DROP FUNCTION IF EXISTS of the 18-arg list against the live 15-arg object is a
-- silent no-op (NOTICE: function does not exist, skipping) and leaves the RPC standing. An
-- operator who trusted this file would believe create_dual_document was gone. Same class as
-- phase-2 Gate A M7.
--
-- Chosen shape: a pre-flight GATE that refuses while the 15-arg form is live, plus the original
-- 18-arg DROP after it. Rewriting this file to drop the 15-arg signature would invert the defect:
-- after a real 362-down the 18-arg function is back and a 15-arg DROP would no-op.
--
-- CLAUDE.md rule 5. The 18-arg signature is spelled out in full.
--
-- PRE-FLIGHT REPORT (after the gate). Dropping the function does not remove documents, journal
-- entries or document numbers. Posted entries are immutable (343). 360-down refuses while rows
-- exist.

SET client_encoding = 'UTF8';

DO $$
DECLARE
  _args text;
  _d int;
  _e int;
  _n int;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid) INTO _args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_dual_document'
   LIMIT 1;

  -- 362's live signature has no p_intermediary_fee. pg_get_function_identity_arguments includes
  -- parameter names, so a type-only LIKE is not enough.
  IF _args IS NOT NULL AND _args NOT LIKE '%p_intermediary_fee%' THEN
    RAISE EXCEPTION
      '361-down refuses: migration 362 is still applied (create_dual_document is %, not the 18-argument form). Run docs/verification/362-down.sql first, then this file, then 360-down.sql. Dropping the 18-argument signature now is a no-op and would leave the live RPC standing (phase-4 Gate A M1).',
      _args
      USING ERRCODE = 'P0001';
  END IF;

  IF to_regclass('public.dual_documents') IS NULL THEN
    _d := 0;
  ELSE
    EXECUTE 'SELECT count(*) FROM public.dual_documents' INTO _d;
  END IF;

  SELECT count(*) INTO _e FROM public.journal_entries
   WHERE source_type = 'dual_document' AND doc_kind = 'dual';
  SELECT count(*) INTO _n FROM public.document_numbers WHERE doc_type = 'dual';

  RAISE NOTICE '361-down: dropping create_dual_document. Left in place: % dual document(s), % posted dual entr(ies), % dual document number(s). Posted entries are immutable (343) and are not removed by this file.',
    _d, _e, _n;
END $$;

DROP FUNCTION IF EXISTS public.create_dual_document(
  text,      -- p_payer_type
  uuid,      -- p_payer_id
  text,      -- p_beneficiary_type
  uuid,      -- p_beneficiary_id
  numeric,   -- p_amount
  date,      -- p_document_date
  text,      -- p_tracking_number
  text,      -- p_description
  text,      -- p_source_bank
  text,      -- p_destination_bank
  text,      -- p_transferrer_name
  text,      -- p_transferrer_account_no
  text,      -- p_recipient_name
  text,      -- p_recipient_account_no
  uuid,      -- p_intermediary_id
  numeric,   -- p_intermediary_fee
  text,      -- p_fee_borne_by
  uuid[]     -- p_attachment_ids
);
