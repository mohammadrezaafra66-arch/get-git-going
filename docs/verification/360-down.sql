-- 360-down.sql — reverse migration 360 (the dual_documents source table and its delete guard).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (Gate A M7).
--
-- WHAT 360 ADDED, and therefore what this removes, innermost dependency first:
--   1. trigger  trg_dual_documents_block_delete_when_posted   on public.dual_documents
--   2. trigger  trg_dual_documents_burn_document_number       on public.dual_documents
--   3. trigger  trg_dual_documents_updated_at                 on public.dual_documents
--   4. function tg_dual_documents_block_delete_when_posted()
--   5. function tg_dual_documents_burn_document_number()
--   6. the four policies, then the table itself
--
-- PRE-FLIGHT GATE — this is the important part of the file.
--
-- Dropping the table destroys business documents. A dual document that has posted also owns a
-- journal entry that is IMMUTABLE (343) and whose source_id is NOT a foreign key (ground-truth §5),
-- so dropping the table would leave every such entry orphaned and permanently unremovable — the
-- exact failure migrations 353 and 357 exist to prevent, caused by the rollback rather than by a
-- delete. This file therefore REFUSES while any row exists, rather than cascading.
--
-- If you genuinely need to reverse 360 after documents exist, the entries have to be dealt with
-- first, deliberately, by a human who has decided what happens to them.

SET client_encoding = 'UTF8';

DO $$
DECLARE _rows int; _entries int;
BEGIN
  IF to_regclass('public.dual_documents') IS NULL THEN
    RAISE NOTICE '360-down: dual_documents does not exist; nothing to do.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.dual_documents' INTO _rows;
  SELECT count(*) INTO _entries
    FROM public.journal_entries WHERE source_type = 'dual_document';

  IF _rows > 0 OR _entries > 0 THEN
    RAISE EXCEPTION
      '360-down refuses: % dual_documents row(s) and % posted journal entr(ies) exist. Dropping the table would orphan every entry permanently — journal_entries.source_id is not a foreign key and a posted entry is immutable (343). Decide what happens to those entries first.',
      _rows, _entries
      USING ERRCODE = 'P0001';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_dual_documents_block_delete_when_posted ON public.dual_documents;
DROP TRIGGER IF EXISTS trg_dual_documents_burn_document_number     ON public.dual_documents;
DROP TRIGGER IF EXISTS trg_dual_documents_updated_at               ON public.dual_documents;

DROP FUNCTION IF EXISTS public.tg_dual_documents_block_delete_when_posted();
DROP FUNCTION IF EXISTS public.tg_dual_documents_burn_document_number();

DROP TABLE IF EXISTS public.dual_documents;
