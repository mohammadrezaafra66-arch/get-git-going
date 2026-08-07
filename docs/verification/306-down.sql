-- Down script for migration 306 (P0.3b - delete orphaned e2e purchase_requests).
--
-- Restores the 121 purchase_requests and their 385 status-history rows from
-- docs/verification/P0.3b-request-cleanup-backup.sql (337,473 bytes), a
-- pg_dump --data-only of purchase_requests, purchase_receipts and
-- purchase_request_status_history taken immediately before 306 was applied.
--
-- The dump holds ALL rows of those tables, including the 458 that survived, so
-- loading it directly would duplicate-key against them. Stage it in a scratch
-- schema and re-insert only what is missing, exactly as 304-down.sql does.
--
-- NOTE: restoring these requests re-creates the condition that
-- e2e/purchase/c5-permissions.spec.ts:277 (E2E-8) fails on - 121 requests
-- claiming a derived status with no fulfillment behind them. That is expected:
-- the fulfillments themselves were deleted by migration 304, so a full return
-- to a consistent pre-304 state also needs docs/verification/304-down.sql.
--
-- NO BEGIN / COMMIT here - transaction control belongs to the caller
-- (apply with psql --single-transaction -v ON_ERROR_STOP=1).
SET client_encoding='UTF8';

-- Step 1 (run OUTSIDE this file, before it):
--   docker cp docs/verification/P0.3b-request-cleanup-backup.sql \
--     afrakala-lan-db:/tmp/p03b-backup.sql
--   create schema p03b_restore, create the three tables with
--   CREATE TABLE p03b_restore.<t> (LIKE public.<t> INCLUDING ALL), then load the
--   dump with search_path=p03b_restore so its COPY blocks land there.

-- Step 2: this file. Parents before children.

INSERT INTO public.purchase_requests
SELECT r.* FROM p03b_restore.purchase_requests r
 WHERE NOT EXISTS (SELECT 1 FROM public.purchase_requests p WHERE p.id = r.id);

INSERT INTO public.purchase_receipts
SELECT r.* FROM p03b_restore.purchase_receipts r
 WHERE NOT EXISTS (SELECT 1 FROM public.purchase_receipts p WHERE p.id = r.id);

INSERT INTO public.purchase_request_status_history
SELECT r.* FROM p03b_restore.purchase_request_status_history r
 WHERE NOT EXISTS (SELECT 1 FROM public.purchase_request_status_history p WHERE p.id = r.id);

-- Verify before dropping the scratch schema.
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.purchase_requests;
  IF _n < 579 THEN
    RAISE EXCEPTION 'Restore incomplete: % purchase_requests present, expected at least 579.', _n;
  END IF;
END $$;

-- Step 3 (after verifying): DROP SCHEMA p03b_restore CASCADE;
