-- Down script for migration 307 (auto_publish_release).
--
-- 307 only ADDED a function; it altered no table, no column and no existing
-- function. publish_platform_release, archive_platform_release and the
-- protect-published trigger were left byte-for-byte untouched, so dropping this
-- function returns the schema exactly to its pre-307 state.
--
-- NOTE ON DATA. Releases already published by the deploy hook are NOT removed.
-- They are real published history, and trg_platform_releases_protect_published
-- deliberately forbids editing published rows. If a specific auto-published
-- release must be withdrawn, archive it through the normal admin path
-- (archive_platform_release) rather than deleting it here.
--
-- To find what the hook published:
--   SELECT release_number, git_sha, title_fa, published_at
--     FROM public.platform_releases
--    WHERE id IN (SELECT entity_id FROM public.audit_logs
--                  WHERE action = 'platform_release_auto_published')
--    ORDER BY release_number;
--
-- NO BEGIN / COMMIT here - transaction control belongs to the caller
-- (apply with psql --single-transaction -v ON_ERROR_STOP=1).
SET client_encoding='UTF8';

DROP FUNCTION IF EXISTS public.auto_publish_release(
  text, timestamptz, text, text, text, text, jsonb);

-- Confirm the manual admin path is still intact after the drop.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'publish_platform_release'
  ) THEN
    RAISE EXCEPTION 'Rollback error: publish_platform_release is missing - the manual path must survive.';
  END IF;
END $$;
