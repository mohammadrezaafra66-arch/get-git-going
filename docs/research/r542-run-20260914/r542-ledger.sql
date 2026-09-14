-- r542 phase 6: record the ledger row for 542. One transaction; prints count before and after.
BEGIN;
SELECT 'r542_ledger_before|rows=' || count(*)
    || '|row_542=' || count(*) FILTER (WHERE version = '20260914130000') AS line
  FROM supabase_migrations.schema_migrations;
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260914130000')
  ON CONFLICT (version) DO NOTHING;
SELECT 'r542_ledger_after|rows=' || count(*)
    || '|row_542=' || count(*) FILTER (WHERE version = '20260914130000')
    || '|max=' || max(version) AS line
  FROM supabase_migrations.schema_migrations;
COMMIT;
