SET client_encoding='UTF8';

-- Down script for migration 314 (UNIFY P1.1 — context_link mirror trigger).
--
-- Reverts the trigger and its function. It deliberately does NOT undo the
-- backfill: the rows it created are ordinary supplier/customer records that may
-- have acquired their own history by the time this runs, and rule 3 forbids
-- DELETE on a table holding data. If the backfill itself must be reversed, do
-- it by hand after checking each row for activity.
--
-- Rows created by the 2026-08-08 backfill on the LAN test database (for the
-- record, so a human can find them):
--   suppliers  — person_id 14bb7791-a338-4cf3-8d5e-d7f7c369c4a4 («روشناس»)
--   customers  — none
-- The matching person_context_links row 39f23ee0-1565-42f1-bb32-5ecb78b5a695
-- had ref_table/ref_id set from NULL; to undo just that:
--   UPDATE public.person_context_links
--      SET ref_table = NULL, ref_id = NULL
--    WHERE id = '39f23ee0-1565-42f1-bb32-5ecb78b5a695';

DROP TRIGGER IF EXISTS trg_pcl_ensure_mirror ON public.person_context_links;
DROP FUNCTION IF EXISTS public.person_context_link_ensure_mirror();
