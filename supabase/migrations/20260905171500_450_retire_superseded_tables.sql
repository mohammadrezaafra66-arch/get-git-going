SET client_encoding='UTF8';

-- 450 (B-7 partial, B-8, B-9, B-10): retire superseded tables.
--
-- ============================================================================
-- B-7 -- DELIBERATE DEVIATION FROM THE BRIEF. READ THIS BEFORE CHANGING IT.
-- ============================================================================
-- The brief listed three backup tables as "All 0 rows" and instructed DROP.
-- Measured live on 2026-09-05, that premise is FALSE for two of the three:
--
--   dynamic_parameter_weights_backup_142        count(*) = 18   size = 8192 bytes
--   dynamic_parameter_weights_backup_20260722   count(*) = 18   size = 8192 bytes
--   payment_receipts_backup_20260722            count(*) =  0   size =    0 bytes
--
-- The "0 rows" reading came from pg_stat_user_tables.n_live_tup, which is 0 for
-- all three ONLY because last_autoanalyze is null -- these tables have never been
-- analysed, so the planner estimate was never populated. n_live_tup is an
-- estimate, not a count.
--
-- This matters beyond tidiness: the live public.dynamic_parameter_weights holds
-- 16 rows while both backups hold 18, so the backups contain 2 rows that no
-- longer exist anywhere else. Dropping them would destroy the only copy.
--
-- Dropping data is a stop condition for this role, so ONLY the genuinely empty
-- payment_receipts_backup_20260722 is dropped here. The two that hold data are
-- left completely untouched and returned to the owner as blocked.
-- ============================================================================

DROP TABLE public.payment_receipts_backup_20260722;

-- ============================================================================
-- B-8, B-9, B-10 -- RENAME, DO NOT DROP.
-- ============================================================================
-- Successors are live:
--   knowledge_articles -> knowledge_documents   (1 row live)
--   messages           -> messenger_messages    (16 rows live)
--   price_lists / price_list_items  have no successor; the /price-lists page was
--   a self-declared shell and the owner removed it from the menu.
--
-- All four measure 0 rows, but stats_reset = never and PG15 persists cumulative
-- stats only across a CLEAN shutdown, so "never written" is consistent with the
-- counters without being proved by them. A rename is reversible; a drop is not.
-- Re-measured independently on 2026-09-05 and the orchestrator's reading held.
--
-- None of these four carries a foreign key to public.persons (their FKs point at
-- users, products and price_lists), so the migration-328 person_fk_registry
-- event trigger sees an unchanged FK set and stays balanced.
-- price_list_items_price_list_id_fkey follows both tables automatically.

ALTER TABLE public.knowledge_articles RENAME TO zz_retired_knowledge_articles;
ALTER TABLE public.messages           RENAME TO zz_retired_messages;
ALTER TABLE public.price_list_items   RENAME TO zz_retired_price_list_items;
ALTER TABLE public.price_lists        RENAME TO zz_retired_price_lists;

DO $$
DECLARE n int; missing text;
BEGIN
  -- the dropped backup is gone
  IF to_regclass('public.payment_receipts_backup_20260722') IS NOT NULL THEN
    RAISE EXCEPTION '450: payment_receipts_backup_20260722 still present';
  END IF;

  -- the two data-holding backups are UNTOUCHED, with their rows intact
  SELECT count(*) INTO n FROM public.dynamic_parameter_weights_backup_142;
  IF n <> 18 THEN RAISE EXCEPTION '450: backup_142 expected 18 rows, found %', n; END IF;
  SELECT count(*) INTO n FROM public.dynamic_parameter_weights_backup_20260722;
  IF n <> 18 THEN RAISE EXCEPTION '450: backup_20260722 expected 18 rows, found %', n; END IF;

  -- old names gone
  SELECT string_agg(t, ', ') INTO missing FROM unnest(ARRAY[
    'public.knowledge_articles','public.messages','public.price_lists','public.price_list_items'
  ]) AS t WHERE to_regclass(t) IS NOT NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION '450: old names still present: %', missing; END IF;

  -- new names present
  SELECT string_agg(t, ', ') INTO missing FROM unnest(ARRAY[
    'public.zz_retired_knowledge_articles','public.zz_retired_messages',
    'public.zz_retired_price_lists','public.zz_retired_price_list_items'
  ]) AS t WHERE to_regclass(t) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION '450: renamed tables absent: %', missing; END IF;

  -- successors untouched
  SELECT count(*) INTO n FROM public.knowledge_documents;
  IF n <> 1 THEN RAISE EXCEPTION '450: knowledge_documents expected 1 row, found %', n; END IF;
  SELECT count(*) INTO n FROM public.messenger_messages;
  IF n <> 16 THEN RAISE EXCEPTION '450: messenger_messages expected 16 rows, found %', n; END IF;
END $$;
