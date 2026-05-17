#!/usr/bin/env bash
# AfraKala — Supabase self-host post-init role bootstrap (idempotent)
# zz-10-afrakala-roles.sh
#
# Runs AFTER the official supabase/postgres image's migrate.sh and init
# scripts (files in /docker-entrypoint-initdb.d/ run alphabetically; the
# `zz-` prefix guarantees we run last).
#
# Behavior:
#   - For LAN/self-host stacks where the official Supabase migrations may
#     NOT have created the baseline role set (anon, authenticated,
#     service_role, authenticator, supabase_auth_admin,
#     supabase_storage_admin), we create any missing role with the correct
#     attributes. This is safe and idempotent — `CREATE ROLE IF EXISTS`
#     guards prevent duplicate-create failures on a hot volume.
#   - Then we normalize the password of every LOGIN role to POSTGRES_PASSWORD
#     so GoTrue / PostgREST / Storage / Meta can authenticate against `db`.
#   - dashboard_user is created when missing.
#
# We connect as the `postgres` superuser via the Unix socket of the temporary
# initdb server. supautils is not yet loaded during initdb, so creating /
# altering reserved Supabase roles from `postgres` is permitted here. On
# fresh volumes this script runs exactly once; on existing volumes the
# CREATE IF NOT EXISTS / ALTER ROLE statements are idempotent.
#
# No psql `:'var'` is used inside any DO $$ block. The password is passed
# to psql via -v at the top level, stashed into a session GUC via
# set_config(), and read inside the DO block via current_setting(). The
# GUC is wiped at the end of the session so the secret is not retained.

set -euo pipefail

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

if [ "${#POSTGRES_PASSWORD}" -lt 8 ]; then
  echo "[afrakala/zz-10-roles] POSTGRES_PASSWORD too short (<8). Refusing." >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
     --host "/var/run/postgresql" \
     --username "postgres" \
     --dbname "$POSTGRES_DB" \
     --no-psqlrc \
     -v pgpass="$POSTGRES_PASSWORD" <<'EOSQL'
SELECT set_config('afrakala.bootstrap_pass', :'pgpass', false);

DO $$
DECLARE
  v_pass text := current_setting('afrakala.bootstrap_pass', true);
BEGIN
  IF v_pass IS NULL OR length(v_pass) < 8 THEN
    RAISE EXCEPTION 'afrakala.bootstrap_pass missing/too short';
  END IF;

  -- ----- NOLOGIN baseline roles (RLS / PostgREST role discrimination) -----
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon NOLOGIN NOINHERIT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN NOINHERIT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS';
  END IF;

  -- ----- LOGIN roles used by the Supabase service stack ------------------
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE format(
      'CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD %L', v_pass);
  ELSE
    EXECUTE format('ALTER ROLE authenticator WITH LOGIN PASSWORD %L', v_pass);
  END IF;

  -- authenticator must be able to switch into the three NOLOGIN roles for
  -- PostgREST's JWT role-claim handoff to work.
  EXECUTE 'GRANT anon, authenticated, service_role TO authenticator';

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE format(
      'CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE PASSWORD %L',
      v_pass);
  ELSE
    EXECUTE format(
      'ALTER ROLE supabase_auth_admin WITH LOGIN PASSWORD %L', v_pass);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    EXECUTE format(
      'CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE PASSWORD %L',
      v_pass);
  ELSE
    EXECUTE format(
      'ALTER ROLE supabase_storage_admin WITH LOGIN PASSWORD %L', v_pass);
  END IF;

  -- supabase_admin was created by 00-afrakala-pre-supabase-admin.sh, but
  -- normalize attributes/password here for completeness.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE format(
      'CREATE ROLE supabase_admin LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS PASSWORD %L',
      v_pass);
  ELSE
    EXECUTE format(
      'ALTER ROLE supabase_admin WITH LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS PASSWORD %L',
      v_pass);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN
    EXECUTE format(
      'CREATE ROLE dashboard_user LOGIN CREATEDB CREATEROLE REPLICATION PASSWORD %L',
      v_pass);
  ELSE
    EXECUTE format(
      'ALTER ROLE dashboard_user WITH LOGIN PASSWORD %L', v_pass);
  END IF;

  -- ----- Grants required by GoTrue / Storage for their own schemas ------
  -- (the schemas themselves are created by zz-20-afrakala-schemas.sql)
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

SELECT set_config('afrakala.bootstrap_pass', '', false);
EOSQL

echo "[afrakala/zz-10-roles] role bootstrap complete"
