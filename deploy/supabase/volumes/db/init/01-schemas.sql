-- AfraKala — Supabase self-host bootstrap (idempotent)
-- 01-schemas.sql
--
-- Creates baseline schemas, extensions, and privileges required before internal
-- GoTrue / Storage migrations run. Safe to execute more than once.

CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION supabase_admin;
CREATE SCHEMA IF NOT EXISTS graphql_public AUTHORIZATION supabase_admin;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA graphql_public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO authenticator, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO authenticator, anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

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
