-- =====================================================================
-- 143 - Remove corrupted seeded knowledge documents
-- =====================================================================
--
-- WHY THIS MIGRATION EXISTS
--
-- All 42 rows in public.knowledge_documents were written by a seeding run whose
-- Persian text was transcoded to literal '?' before reaching Postgres. The text
-- is unrecoverable. Every row is corrupt, was created programmatically
-- (created_by IS NULL), and falls inside the corruption window established by
-- the Phase 1 audit: 2026-07-11 16:56 - 19:39 UTC, in three batches of 14
-- (16:56:58, 19:30:52, 19:39:34).
--
-- Deleting them clears the way for real documents to be entered, and prevents
-- the knowledge RAG feature from indexing meaningless '?????' vectors.
--
-- SCOPE GUARD: this migration deletes ONLY rows that are BOTH corrupt AND
-- inside the corruption window. Any row outside that window is human-authored
-- content and is preserved. The pre-check aborts if the two sets disagree.
--
-- CASCADE: knowledge_confirmations references knowledge_documents ON DELETE
-- CASCADE. That table currently holds 0 rows, so nothing cascades.
--
-- ---------------------------------------------------------------------
-- BACKUP (taken by this migration, before the delete):
--
--     CREATE TABLE IF NOT EXISTS public.knowledge_documents_backup_20260722 AS
--       SELECT * FROM public.knowledge_documents;
--
-- ---------------------------------------------------------------------
-- ROLLBACK
--
--     INSERT INTO public.knowledge_documents
--     SELECT * FROM public.knowledge_documents_backup_20260722
--      WHERE id NOT IN (SELECT id FROM public.knowledge_documents);
--
-- Note: rollback restores the rows exactly as they were - still corrupted.
-- The Persian text cannot be recovered by any means.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.knowledge_documents_backup_20260722 AS
  SELECT * FROM public.knowledge_documents;

DO $do$
DECLARE
  v_win_start CONSTANT timestamptz := timestamptz '2026-07-11 16:56:00+00';
  v_win_end   CONSTANT timestamptz := timestamptz '2026-07-11 19:40:00+00';
  v_total       int;
  v_backup      int;
  v_in_window   int;
  v_corrupt     int;
  v_target      int;
BEGIN
  SELECT count(*) INTO v_total  FROM public.knowledge_documents;
  SELECT count(*) INTO v_backup FROM public.knowledge_documents_backup_20260722;

  IF v_backup < v_total THEN
    RAISE EXCEPTION 'ABORT: backup holds % rows but the live table holds %.', v_backup, v_total;
  END IF;

  SELECT count(*) INTO v_in_window
    FROM public.knowledge_documents
   WHERE created_at >= v_win_start AND created_at < v_win_end;

  SELECT count(*) INTO v_corrupt
    FROM public.knowledge_documents
   WHERE title ~ '\?{3,}' OR content ~ '\?{3,}';

  SELECT count(*) INTO v_target
    FROM public.knowledge_documents
   WHERE created_at >= v_win_start AND created_at < v_win_end
     AND (title ~ '\?{3,}' OR content ~ '\?{3,}');

  RAISE NOTICE 'knowledge_documents: total=% backup=% in_window=% corrupt=% target=%',
    v_total, v_backup, v_in_window, v_corrupt, v_target;

  -- The authorization covers exactly the rows proven to be both corrupt and
  -- inside the window. If any row is corrupt but outside the window, or inside
  -- the window but clean, the data no longer matches the audit and a human must
  -- re-classify it.
  IF v_in_window <> v_corrupt OR v_target <> v_in_window THEN
    RAISE EXCEPTION
      'ABORT: corrupt/in-window sets disagree (in_window=%, corrupt=%, both=%). Re-audit before deleting.',
      v_in_window, v_corrupt, v_target;
  END IF;
END
$do$;

DELETE FROM public.knowledge_documents
 WHERE created_at >= timestamptz '2026-07-11 16:56:00+00'
   AND created_at <  timestamptz '2026-07-11 19:40:00+00'
   AND (title ~ '\?{3,}' OR content ~ '\?{3,}');

DO $do$
DECLARE
  v_remaining int;
  v_backup    int;
BEGIN
  SELECT count(*) INTO v_remaining FROM public.knowledge_documents;
  SELECT count(*) INTO v_backup    FROM public.knowledge_documents_backup_20260722;
  RAISE NOTICE 'Post-check: % document(s) remain, % preserved in backup.', v_remaining, v_backup;
END
$do$;

COMMIT;
