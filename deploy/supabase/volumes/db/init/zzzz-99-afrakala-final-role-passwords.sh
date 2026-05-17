#!/usr/bin/env bash
# AfraKala — Supabase self-host final role password bootstrap (idempotent)
# zzzz-99-afrakala-final-role-passwords.sh
#
# Runs last alphabetically in /docker-entrypoint-initdb.d/ for LAN/self-host
# fresh volumes. This is a final safety pass after the Supabase/Postgres init
# chain to ensure service LOGIN roles definitely have POSTGRES_PASSWORD set.
#
# The password is passed to psql as a variable, stored only in a session GUC,
# consumed inside the DO block via current_setting(), and then cleared. The
# value is never printed.

set -euo pipefail

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

if [ "${#POSTGRES_PASSWORD}" -lt 8 ]; then
  echo "[afrakala/zzzz-99-final-role-passwords] POSTGRES_PASSWORD too short (<8). Refusing." >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
     --host "/var/run/postgresql" \
     --username "postgres" \
     --dbname "$POSTGRES_DB" \
     --no-psqlrc \
     -v pgpass="$POSTGRES_PASSWORD" <<'EOSQL'
SELECT set_config('afrakala.final_role_password', :'pgpass', false);

DO $$
DECLARE
  v_pass text := current_setting('afrakala.final_role_password', true);
BEGIN
  IF v_pass IS NULL OR length(v_pass) < 8 THEN
    RAISE EXCEPTION 'afrakala.final_role_password missing/too short';
  END IF;

  -- Required NOLOGIN roles used by RLS/PostgREST JWT role switching.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon NOLOGIN NOINHERIT';
  ELSE
    EXECUTE 'ALTER ROLE anon WITH NOLOGIN NOINHERIT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN NOINHERIT';
  ELSE
    EXECUTE 'ALTER ROLE authenticated WITH NOLOGIN NOINHERIT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE service_role WITH NOLOGIN NOINHERIT BYPASSRLS';
  END IF;

  -- Required LOGIN roles. Each role is explicitly assigned POSTGRES_PASSWORD.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE format('CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD %L', v_pass);
  END IF;
  EXECUTE format('ALTER ROLE authenticator WITH LOGIN NOINHERIT PASSWORD %L', v_pass);

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE format('CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE PASSWORD %L', v_pass);
  END IF;
  EXECUTE format('ALTER ROLE supabase_auth_admin WITH LOGIN NOINHERIT CREATEROLE PASSWORD %L', v_pass);

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    EXECUTE format('CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE PASSWORD %L', v_pass);
  END IF;
  EXECUTE format('ALTER ROLE supabase_storage_admin WITH LOGIN NOINHERIT CREATEROLE PASSWORD %L', v_pass);

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE format('CREATE ROLE supabase_admin LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS PASSWORD %L', v_pass);
  END IF;
  EXECUTE format('ALTER ROLE supabase_admin WITH LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS PASSWORD %L', v_pass);

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN
    EXECUTE format('CREATE ROLE dashboard_user LOGIN CREATEDB CREATEROLE REPLICATION PASSWORD %L', v_pass);
  END IF;
  EXECUTE format('ALTER ROLE dashboard_user WITH LOGIN CREATEDB CREATEROLE REPLICATION PASSWORD %L', v_pass);

  EXECUTE 'GRANT anon, authenticated, service_role TO authenticator';

  EXECUTE format('GRANT CREATE ON DATABASE %I TO supabase_auth_admin', current_database());
  EXECUTE format('GRANT CREATE ON DATABASE %I TO supabase_storage_admin', current_database());

  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    EXECUTE 'GRANT ALL PRIVILEGES ON SCHEMA auth TO supabase_auth_admin';
    EXECUTE 'ALTER SCHEMA auth OWNER TO supabase_auth_admin';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    EXECUTE 'GRANT ALL PRIVILEGES ON SCHEMA storage TO supabase_storage_admin';
    EXECUTE 'ALTER SCHEMA storage OWNER TO supabase_storage_admin';
  END IF;
END
$$;

SELECT set_config('afrakala.final_role_password', '', false);
EOSQL

echo "[afrakala/zzzz-99-final-role-passwords] final role password bootstrap complete"