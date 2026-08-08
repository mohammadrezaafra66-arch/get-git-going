SET client_encoding='UTF8';

-- Down-script for migration 327.
--
-- 327 only rewrote one function and wrote no data, so reverting is a single step:
-- re-apply the pre-327 definition captured straight from the live database.
--
--   docker cp docs/verification/pre-327/pre-327-post_receipt_accounting.sql \
--     afrakala-lan-db:/tmp/down327.sql
--   docker exec -e PGPASSWORD=... afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/down327.sql
--   docker restart afrakala-lan-rest
--
-- That file is the verbatim pg_get_functiondef output from before the change, so it
-- restores the invoice allocation loop and the four locals exactly as they were.
--
-- WARNING: reverting only makes sense while the invoices table still exists. Once the
-- table is dropped (the remaining phase-4 follow-up), the pre-327 body would reference a
-- missing table and fail at runtime, not at restore time.
