#!/usr/bin/env bash
# AfraKala — Supabase self-host bootstrap (idempotent)
# 00-roles.sh
#
# Creates baseline roles expected by GoTrue, PostgREST, Storage, and Studio.
# Runs only on first boot of the official Postgres image (empty volume).
# No secret is committed; password is read from POSTGRES_PASSWORD at runtime.
#
# Strategy: avoid psql `:'var'` substitution inside DO $$ blocks (which is
# parsed as a syntax error). Instead, push the password into a session-scoped
# custom GUC via `set_config()`, then read it inside the DO block with
# `current_setting()`. The GUC is session-local and never persisted.

set -euo pipefail

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required for AfraKala role bootstrap}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

if [ "${#POSTGRES_PASSWORD}" -lt 8 ]; then
  echo "[afrakala/00-roles] POSTGRES_PASSWORD is too short (<8 chars). Refusing." >&2
  exit 1
fi

# Pass the password to psql via -v (client-side variable). We use `:'pgpass'`
# ONLY at the TOP LEVEL (outside any DO $$ block) to feed it into set_config().
# Inside the DO block we read it back with current_setting() — this is the
# safe pattern that avoids the "syntax error at or near :" failure.
psql -v ON_ERROR_STOP=1 \
     --username "postgres" \
     --dbname "$POSTGRES_DB" \
     --no-psqlrc \
     -v pgpass="$POSTGRES_PASSWORD" <<'EOSQL'
-- Stash the password into a session GUC. `set_config(name, value, is_local)`
-- with is_local=false keeps it for the rest of this psql session only.
SELECT set_config('afrakala.bootstrap_pass', :'pgpass', false);

DO $$
DECLARE
  v_pass text := current_setting('afrakala.bootstrap_pass', true);
BEGIN
  IF v_pass IS NULL OR length(v_pass) < 8 THEN
    RAISE EXCEPTION 'afrakala.bootstrap_pass missing or too short. Refusing to bootstrap roles.';
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

-- Wipe the GUC so the password is not readable by later SQL in this session.
SELECT set_config('afrakala.bootstrap_pass', '', false);

GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;

GRANT anon, authenticated, service_role,
      authenticator, supabase_auth_admin, supabase_storage_admin,
      dashboard_user
  TO supabase_admin;
EOSQL

echo "[afrakala/00-roles] role bootstrap complete"