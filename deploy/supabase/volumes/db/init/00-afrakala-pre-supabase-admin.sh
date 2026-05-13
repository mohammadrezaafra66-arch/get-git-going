#!/usr/bin/env bash
# AfraKala — Supabase self-host pre-migrate role bootstrap (idempotent)
# 00-afrakala-pre-supabase-admin.sh
#
# Runs BEFORE the official supabase/postgres migrate.sh. That script connects
# with `psql -U supabase_admin`, so this file creates/updates ONLY that role.
# Do not create anon/authenticated/service_role/authenticator or service admin
# roles here; official Supabase migrations own those baseline roles.
#
# No psql `:'var'` is used inside any DO $$ block. The password is passed to
# psql via -v at the top level, stashed into a session GUC with set_config(),
# and read inside the DO block via current_setting().

set -euo pipefail

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

if [ "${#POSTGRES_PASSWORD}" -lt 8 ]; then
  echo "[afrakala/00-pre-supabase-admin] POSTGRES_PASSWORD too short (<8). Refusing." >&2
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
  v_pass text := current_setting('afrakala.bootstrap_pass', true);
BEGIN
  IF v_pass IS NULL OR length(v_pass) < 8 THEN
    RAISE EXCEPTION 'afrakala.bootstrap_pass missing/too short';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE format(
      'CREATE ROLE supabase_admin LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS PASSWORD %L',
      v_pass
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE supabase_admin WITH LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS PASSWORD %L',
      v_pass
    );
  END IF;
END
$$;

SELECT set_config('afrakala.bootstrap_pass', '', false);
EOSQL

echo "[afrakala/00-pre-supabase-admin] supabase_admin ready for migrate.sh"