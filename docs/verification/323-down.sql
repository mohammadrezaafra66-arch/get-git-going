SET client_encoding='UTF8';

-- Down-script for migration 323.
--
-- IMPORTANT: this restores STRUCTURE and the two rewritten objects. It does not restore
-- rows, because there were none — invoice_items, waybills and waybill_items were all
-- verified at 0 rows before the drop. If that ever stops being true, restore from
-- D:\AfraKalaTest\backups\invoices-subsystem-20260808.sql (pg_dump, 7 tables) instead.
--
-- The table DDL below is intentionally NOT reproduced by hand. Restore it from the dump:
--   docker cp <dump> afrakala-lan-db:/tmp/restore.sql
--   docker exec -e PGPASSWORD=... afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/restore.sql
-- then re-apply the function/view snapshots in docs/verification/pre-323/:
--   pre-323-functions.sql              (all six pre-323 definitions)
--   pre-323-v_promotion_suggestions.sql (the pre-323 view, with its invoice_items CTE)
--
-- Applying those two snapshot files after restoring the tables returns the database to
-- its exact pre-323 state.
