-- AfraKala — Supabase self-host bootstrap (idempotent)
-- 00-roles.sql
--
-- Creates the baseline roles expected by GoTrue, PostgREST, Storage, and Studio.
-- Runs only during the official Postgres image first boot on an empty volume.
-- No real secret is committed; passwords are read from POSTGRES_PASSWORD at runtime.

\set pgpass `echo "$POSTGRES_PASSWORD"`

DO $$
DECLARE
  v_pass text := :'pgpass';
BEGIN
  IF v_pass IS NULL OR length(v_pass) < 8 THEN
    RAISE EXCEPTION 'POSTGRES_PASSWORD is missing or too short. Refusing to bootstrap roles.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE format('CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD %L', v_pass);
  ELSE
    EXECUTE format('ALTER ROLE authenticator WITH LOGIN NOINHERIT PASSWORD %L', v_pass);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE format('CREATE ROLE supabase_admin LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS PASSWORD %L', v_pass);
  ELSE
    EXECUTE format('ALTER ROLE supabase_admin WITH LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS PASSWORD %L', v_pass);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE format('CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE PASSWORD %L', v_pass);
  ELSE
    EXECUTE format('ALTER ROLE supabase_auth_admin WITH LOGIN NOINHERIT CREATEROLE PASSWORD %L', v_pass);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    EXECUTE format('CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE PASSWORD %L', v_pass);
  ELSE
    EXECUTE format('ALTER ROLE supabase_storage_admin WITH LOGIN NOINHERIT CREATEROLE PASSWORD %L', v_pass);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN
    EXECUTE format('CREATE ROLE dashboard_user LOGIN CREATEDB CREATEROLE REPLICATION PASSWORD %L', v_pass);
  ELSE
    EXECUTE format('ALTER ROLE dashboard_user WITH LOGIN CREATEDB CREATEROLE REPLICATION PASSWORD %L', v_pass);
  END IF;
END
$$;

GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;

GRANT anon, authenticated, service_role,
      authenticator, supabase_auth_admin, supabase_storage_admin,
      dashboard_user
  TO supabase_admin;
