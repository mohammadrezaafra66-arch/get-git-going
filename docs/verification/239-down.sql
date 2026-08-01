SET client_encoding='UTF8';

-- =============================================================================
-- 239-down — rollback for Phase 8.1 (person merge RPC + merge log)
-- =============================================================================
--
-- NOT stored in supabase/migrations/ on purpose: it is a recovery script, not
-- part of the forward history.
--
-- ⚠️ WHAT THIS DOES *NOT* UNDO
--   Rolling back the schema does NOT un-merge anyone. If person_merge has
--   already run, the losing person's identifiers, aliases, links and every FK
--   reference have moved to the winner and the loser is deactivated. Dropping
--   person_merge_log destroys the only record of where that data went.
--   Before running this, export person_merge_log:
--       COPY (SELECT * FROM public.person_merge_log) TO '/tmp/merge_log.csv' CSV HEADER;
--   The pre-8.2 pg_dump backup is the real recovery path for executed merges.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.person_merge_dismiss(uuid, text);
DROP FUNCTION IF EXISTS public.person_merge(uuid, uuid, text);
DROP FUNCTION IF EXISTS public._person_merge_count_refs(text, text, uuid);
DROP FUNCTION IF EXISTS public._person_merge_repoint(text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public._person_merge_assert_person_fk(text, text);

REVOKE UPDATE (customer_person_id) ON public.sales_quotes FROM authenticated;

DROP POLICY IF EXISTS person_field_values_delete_admin_manager  ON public.person_field_values;
DROP POLICY IF EXISTS person_context_links_delete_admin_manager ON public.person_context_links;
DROP POLICY IF EXISTS person_aliases_delete_admin_manager       ON public.person_aliases;
DROP POLICY IF EXISTS person_identifiers_delete_admin_manager   ON public.person_identifiers;

DROP POLICY IF EXISTS person_merge_log_insert_privileged ON public.person_merge_log;
DROP POLICY IF EXISTS person_merge_log_select_privileged ON public.person_merge_log;
DROP TABLE IF EXISTS public.person_merge_log;

-- Restore migration 234's status CHECK. Fails if any row is already
-- 'dismissed'; resolve those rows first (set them to 'not_duplicate').
UPDATE public.person_merge_candidates SET status = 'not_duplicate' WHERE status = 'dismissed';
ALTER TABLE public.person_merge_candidates
  DROP CONSTRAINT IF EXISTS person_merge_candidates_status_check;
ALTER TABLE public.person_merge_candidates
  ADD CONSTRAINT person_merge_candidates_status_check
  CHECK (status = ANY (ARRAY['pending','merged','rejected','not_duplicate']));

NOTIFY pgrst, 'reload schema';
