-- 422-down.sql — reverse migration 422 (v_documents_unified).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction.
--
-- WHAT 422 ADDED: one view, public.v_documents_unified, plus its comment and its SELECT grant to
-- authenticated. It creates no table, alters no column, and changes no existing object, so dropping
-- the view restores the previous state exactly — the view did not exist before 422.
--
-- READ THIS BEFORE RUNNING IT. Dropping the view breaks /accounting/documents, which is its only
-- reader. The page will fail its query; no data is lost, because the view owns no rows — every row
-- it serves lives in payment_receipts, payment_vouchers and dual_documents and is untouched.
--
-- This file is also the G1 disturbance: it is what proves a dual document VANISHES from the
-- register when the view is reverted, and reappears when 422 is re-applied.

SET client_encoding = 'UTF8';

DO $$
DECLARE _n bigint;
BEGIN
  IF to_regclass('public.v_documents_unified') IS NULL THEN
    RAISE NOTICE '422-down: v_documents_unified does not exist; nothing to do.';
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*) FROM public.v_documents_unified' INTO _n;
  RAISE NOTICE '422-down: dropping v_documents_unified, which currently serves % row(s). The underlying receipts, payments and dual documents are NOT touched.', _n;
END $$;

DROP VIEW IF EXISTS public.v_documents_unified;
