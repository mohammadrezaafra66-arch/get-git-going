-- r526-preflight.sql -- READ ONLY. Identity of the target before anything else.
-- Runbook: docs/runbooks/526-repair-20260914.md, Block 1. ASCII only.
SET default_transaction_read_only = on;
\pset format unaligned
\pset tuples_only on
SELECT 'r526_preflight'
    || '|db=' || current_database()
    || '|replica=' || pg_is_in_recovery()
    || '|ledger_rows=' || (SELECT count(*) FROM supabase_migrations.schema_migrations)
    || '|ledger_max=' || (SELECT max(version) FROM supabase_migrations.schema_migrations)
    || '|row_526=' || (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260913090000')
    || '|row_539=' || (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260913111000');
