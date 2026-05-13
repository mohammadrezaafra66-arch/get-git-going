-- AfraKala — Supabase self-host post-init schema hardening (idempotent)
-- zz-20-afrakala-schemas.sql
--
-- Runs AFTER the official supabase/postgres image migrate.sh. The image
-- already creates auth/storage/extensions schemas and core extensions, so
-- everything here is `IF NOT EXISTS`. This file only ensures the extras the
-- AfraKala app expects are present and that public-schema default privileges
-- match our RLS-first policy.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS graphql_public;

GRANT USAGE ON SCHEMA public         TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions     TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA graphql_public TO anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- pgjwt is shipped by supabase/postgres but only when requested.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgjwt') THEN
    CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;
  END IF;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;