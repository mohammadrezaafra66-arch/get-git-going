#!/usr/bin/env bash
# AfraKala — Supabase self-host post-init role hardening (idempotent)
# zz-10-afrakala-roles.sh
#
# Runs AFTER the official supabase/postgres image's migrate.sh and its
# init-scripts (e.g. 00000000000000-initial-schema.sql), because files in
# /docker-entrypoint-initdb.d/ are executed in alphabetical order and the
# `zz-` prefix guarantees we run last.
#
# Why: pre-creating roles like `anon`, `authenticated`, `service_role`,
# `authenticator`, `supabase_admin`, `supabase_auth_admin`,
# `supabase_storage_admin`, `dashboard_user` BEFORE migrate.sh causes the
# official init script to fail with: ERROR: role "anon" already exists.
# So this script does NOT create those baseline roles — the image already
# does. It only:
#   1) verifies all expected roles exist (fails fast otherwise),
#   2) normalizes the password of every LOGIN role to POSTGRES_PASSWORD so
#      GoTrue / PostgREST / Storage can authenticate against `db`,
#   3) creates `dashboard_user` only if the image variant did not.
#
# No psql `:'var'` is used inside any DO $$ block. The password is passed to
# psql via -v at the top level, stashed into a session GUC with set_config(),
# and read inside the DO block via current_setting(). The GUC is wiped at
# the end of the session.

set -euo pipefail

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

if [ "${#POSTGRES_PASSWORD}" -lt 8 ]; then
  echo "[afrakala/zz-10-roles] POSTGRES_PASSWORD too short (<8). Refusing." >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
     --username "postgres" \
     --dbname "$POSTGRES_DB" \
     --no-psqlrc \
     -v pgpass="$POSTGRES_PASSWORD" <<'EOSQL'
SELECT set_config('afrakala.bootstrap_pass', :'pgpass', false);

DO $$
DECLARE
  v_pass     text := current_setting('afrakala.bootstrap_pass', true);
  v_required text[] := ARRAY[
    'anon','authenticated','service_role','authenticator',
    'supabase_admin','supabase_auth_admin','supabase_storage_admin'
  ];
  v_login    text[] := ARRAY[
    'authenticator','supabase_admin','supabase_auth_admin',
    'supabase_storage_admin','dashboard_user'
  ];
  v_role     text;
BEGIN
  IF v_pass IS NULL OR length(v_pass) < 8 THEN
    RAISE EXCEPTION 'afrakala.bootstrap_pass missing/too short';
  END IF;

  -- 1) baseline roles MUST already exist (created by official image init).
  FOREACH v_role IN ARRAY v_required LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      RAISE EXCEPTION
        'expected baseline role % missing — official supabase/postgres init did not run',
        v_role;
    END IF;
  END LOOP;

  -- 2) ensure dashboard_user exists (some image variants omit it).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN
    EXECUTE format(
      'CREATE ROLE dashboard_user LOGIN CREATEDB CREATEROLE REPLICATION PASSWORD %L',
      v_pass);
  END IF;

  -- 3) normalize passwords on every LOGIN role so the app stack can connect.
  FOREACH v_role IN ARRAY v_login LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', v_role, v_pass);
    END IF;
  END LOOP;
END
$$;

SELECT set_config('afrakala.bootstrap_pass', '', false);
EOSQL

echo "[afrakala/zz-10-roles] role hardening complete"