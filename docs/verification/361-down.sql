-- 361-down.sql — reverse migration 361 (create_dual_document).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (Gate A M7).
--
-- WHAT 361 ADDED: exactly one object, public.create_dual_document(...). It creates no table, alters
-- no column and changes no existing function, so dropping it restores the previous state completely.
-- The dual_documents table and its guards belong to migration 360 and are reversed by 360-down.
--
-- CLAUDE.md rule 5. The signature is spelled out in full. A DROP naming only the function name is
-- ambiguous the moment a second overload exists, and adding a defaulted parameter later creates
-- exactly such an overload rather than replacing this one.
--
-- PRE-FLIGHT REPORT, not a gate. Dropping the function does not remove the documents, journal
-- entries or document numbers it created — those are business documents and a posted entry is
-- immutable (343). This file reports what will be left behind rather than pretending a clean
-- reversal, and does not refuse: leaving posted documents in place is the correct outcome, and the
-- operator needs the count, not a block. 360-down is the file that refuses while rows exist.

SET client_encoding = 'UTF8';

DO $$
DECLARE _d int; _e int; _n int;
BEGIN
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
