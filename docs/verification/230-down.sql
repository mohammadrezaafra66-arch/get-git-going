SET client_encoding='UTF8';

-- =============================================================================
-- DOWN script for migration 230 (Phase 4 — import + backfill)
-- =============================================================================
-- Deliberately NOT in supabase/migrations/ so it is never auto-applied.
--
-- TWO SEPARATE THINGS CAN BE REVERTED, and they are not the same decision:
--
--   (a) the FUNCTIONS  — pure code, safe to drop, no data lost.
--   (b) the BACKFILL   — 25 persons + 25 provenance links + person_id on
--                        13 suppliers and 12 customers. Reverting this
--                        DESTROYS the person records.
--
-- Section (a) runs by default. Section (b) is commented out and guarded,
-- because in almost every situation you want to keep the persons and simply
-- stop using them.
--
-- CODE MUST BE REVERTED TOO:
--   src/routes/api.persons.import.ts            (delete)
--   src/shared/components/CustomerImportForm.tsx(restore direct customers insert)
--   src/integrations/supabase/types.ts          (remove the 3 RPC entries)
-- =============================================================================

-- --- (a) functions ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.person_import_batch(jsonb);
DROP FUNCTION IF EXISTS public.person_backfill_existing(text, text, integer);
DROP FUNCTION IF EXISTS public.person_find_by_identifiers(jsonb);


-- --- (b) THE BACKFILL — destructive. Read before uncommenting. --------------
--
-- Un-bridging is reversible (just re-run the backfill). DELETING the persons is
-- not: their ids are referenced by person_identifiers, person_context_links and
-- person_aliases, and anything created since. Repo rule 3 forbids DELETE on
-- tables holding data, so this stays commented out and is a deliberate,
-- manual, reviewed act if it is ever needed.
--
-- Step 1 — detach, keeping every person row intact (SAFE, re-runnable):
--
--   UPDATE public.suppliers SET person_id = NULL WHERE person_id IS NOT NULL;
--   UPDATE public.customers SET person_id = NULL WHERE person_id IS NOT NULL;
--   UPDATE public.person_context_links SET ended_at = now()
--    WHERE note = 'backfill 230' AND ended_at IS NULL;
--
-- Step 2 — remove the generated persons (DESTRUCTIVE, do not automate):
--   Identify them first; only rows created by the backfill actor with no other
--   activity should ever be considered.
--
--   SELECT p.id, p.display_name, p.created_at
--     FROM public.persons p
--     JOIN public.person_context_links l ON l.person_id = p.id
--    WHERE l.note = 'backfill 230';
--
--   Deleting them cascades to person_identifiers / person_context_links /
--   person_aliases (all ON DELETE CASCADE). Verify nothing else references the
--   id first. This project's rules say: prefer deactivation over deletion —
--   UPDATE public.persons SET is_active = false WHERE id IN (...);

DO $$
BEGIN
  RAISE NOTICE 'Functions dropped. The backfill data was NOT touched — see section (b).';
END $$;
