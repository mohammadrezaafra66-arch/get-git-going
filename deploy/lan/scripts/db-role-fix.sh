#!/usr/bin/env bash
# db-role-fix.sh
# LAN-only one-shot role password fixer for the self-host Supabase stack.
# Safe logging only: never print environment variables or secrets.

set -euo pipefail

echo "[afrakala/db-role-fix] starting role password fix"

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

if [ "${#POSTGRES_PASSWORD}" -lt 8 ]; then
  echo "[afrakala/db-role-fix] POSTGRES_PASSWORD too short (<8). Refusing." >&2
  exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"
# UTF-8 client encoding برای جلوگیری از خراب شدن متن فارسی
export PGCLIENTENCODING="UTF8"

psql -q -v ON_ERROR_STOP=1 \
  -h db \
  -U supabase_admin \
  -d "$POSTGRES_DB" \
  --no-psqlrc \
  -v client_encoding=UTF8 \
  -v pgpass="$POSTGRES_PASSWORD" <<'EOSQL'
SELECT set_config('afrakala.final_role_password', :'pgpass', false) AS ignored
\gset

DO $$
DECLARE
  v_pass text := current_setting('afrakala.final_role_password', true);
BEGIN
  IF v_pass IS NULL OR length(v_pass) < 8 THEN
    RAISE EXCEPTION 'afrakala.final_role_password missing/too short';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE EXCEPTION 'Reserved role "anon" is missing. Fresh database initialization is broken; recreate the LAN DB volume after pulling the latest code.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Reserved role "authenticated" is missing. Fresh database initialization is broken; recreate the LAN DB volume after pulling the latest code.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'Reserved role "service_role" is missing. Fresh database initialization is broken; recreate the LAN DB volume after pulling the latest code.';
  END IF;

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

  BEGIN
    EXECUTE 'GRANT anon, authenticated, service_role TO authenticator';
  EXCEPTION WHEN insufficient_privilege OR reserved_name THEN
    RAISE NOTICE 'Skipping reserved role grants to authenticator because PostgreSQL refused the operation; LOGIN passwords were already assigned.';
  END;

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

SELECT set_config('afrakala.final_role_password', '', false) AS ignored
\gset
EOSQL

unset PGPASSWORD

echo "[afrakala/db-role-fix] role password fix complete"