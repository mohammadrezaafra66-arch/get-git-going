-- Down script for migration 311 (item-shape validation in auto_publish_release).
--
-- 311 only replaced the function body to add validation. It changed no table,
-- column, index or grant, and touched no data.
--
-- REVERTING RE-OPENS THE HOLE. Without this validation the RPC accepts any
-- non-empty JSON array as p_items, which is exactly how the malformed
-- `{text, sha}` payload reached releases 13, 14 and 15 and rendered as blank
-- bullets on /updates. The TypeScript validator (validate.ts:19-43) guards only
-- the manual admin draft path, so nothing else checks the deploy path.
--
-- The pre-311 body is snapshotted at
-- docs/verification/pre-311/auto_publish_release.live.sql. Restore from there
-- if the previous behaviour is genuinely wanted back.
--
-- NO BEGIN / COMMIT here - transaction control belongs to the caller
-- (apply with psql --single-transaction -v ON_ERROR_STOP=1).
SET client_encoding='UTF8';

DO $$
BEGIN
  RAISE NOTICE 'To revert, load the snapshot at';
  RAISE NOTICE '  docs/verification/pre-311/auto_publish_release.live.sql';
  RAISE NOTICE 'then re-apply the grants: REVOKE from PUBLIC/anon/authenticated,';
  RAISE NOTICE 'GRANT EXECUTE to service_role. CREATE OR REPLACE does not';
  RAISE NOTICE 'reset grants, but a DROP + CREATE would.';
END $$;

-- Guard: the manual publish path must still exist after any rollback here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'publish_platform_release'
  ) THEN
    RAISE EXCEPTION 'Rollback error: publish_platform_release is missing.';
  END IF;
END $$;
