-- Down script for migration 304 (P0.3 - delete e2e purchase residue).
--
-- Restores the 322 e2e purchases and their 1,122 dependent rows from
-- docs/verification/P0.3-purchase-cleanup-backup.sql.
--
-- That backup is a pg_dump --data-only of the FIVE affected tables in full, so
-- it contains the surviving rows as well as the deleted ones. Loading it
-- directly would duplicate-key against the survivors. This script therefore
-- stages it in a scratch schema and re-inserts only the rows that are missing.
--
-- NO BEGIN / COMMIT here - transaction control belongs to the caller
-- (apply with psql --single-transaction -v ON_ERROR_STOP=1).
SET client_encoding='UTF8';

-- Step 1 (run OUTSIDE this file, before it):
--   docker cp docs/verification/P0.3-purchase-cleanup-backup.sql \
--     afrakala-lan-db:/tmp/p03-backup.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS p03_restore;" \
--     -c "SET search_path=p03_restore,public;" \
--     -c "CREATE TABLE p03_restore.purchases (LIKE public.purchases INCLUDING ALL);" \
--     -c "CREATE TABLE p03_restore.purchase_items (LIKE public.purchase_items INCLUDING ALL);" \
--     -c "CREATE TABLE p03_restore.stock_movements (LIKE public.stock_movements INCLUDING ALL);" \
--     -c "CREATE TABLE p03_restore.purchase_idempotency (LIKE public.purchase_idempotency INCLUDING ALL);" \
--     -c "CREATE TABLE p03_restore.purchase_request_fulfillments (LIKE public.purchase_request_fulfillments INCLUDING ALL);"
--   then load the dump with search_path=p03_restore so its COPY blocks land in
--   the scratch schema rather than public.
--
-- Step 2: this file. Re-insert only what is missing, parents before children.

INSERT INTO public.purchases
SELECT r.* FROM p03_restore.purchases r
 WHERE NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = r.id);

INSERT INTO public.purchase_items
SELECT r.* FROM p03_restore.purchase_items r
 WHERE NOT EXISTS (SELECT 1 FROM public.purchase_items p WHERE p.id = r.id);

INSERT INTO public.purchase_idempotency
SELECT r.* FROM p03_restore.purchase_idempotency r
 WHERE NOT EXISTS (SELECT 1 FROM public.purchase_idempotency p WHERE p.id = r.id);

INSERT INTO public.purchase_request_fulfillments
SELECT r.* FROM p03_restore.purchase_request_fulfillments r
 WHERE NOT EXISTS (SELECT 1 FROM public.purchase_request_fulfillments p WHERE p.id = r.id);

INSERT INTO public.stock_movements
SELECT r.* FROM p03_restore.stock_movements r
 WHERE NOT EXISTS (SELECT 1 FROM public.stock_movements p WHERE p.id = r.id);

-- Verify the restore before dropping the scratch schema.
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.purchases WHERE notes LIKE 'E2E%';
  IF _n <> 322 THEN
    RAISE EXCEPTION 'Restore incomplete: % e2e purchases present, expected 322.', _n;
  END IF;
END $$;

-- Step 3 (run after verifying): DROP SCHEMA p03_restore CASCADE;
