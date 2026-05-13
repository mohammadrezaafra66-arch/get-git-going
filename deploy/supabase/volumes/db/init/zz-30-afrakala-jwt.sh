#!/usr/bin/env bash
# AfraKala — Supabase self-host post-init JWT settings (idempotent)
# zz-30-afrakala-jwt.sh
#
# Runs AFTER the official supabase/postgres init. Stores JWT settings at the
# database level for Supabase-compatible helpers (auth.uid(), auth.role(),
# auth.jwt()). Values come from runtime env only — never committed.
#
# Strategy: avoid `:'var'` substitution inside DO $$ blocks. Use psql -v at
# the TOP LEVEL only (in SELECT set_config), then read inside the DO block
# via current_setting().

set -euo pipefail

: "${JWT_SECRET:?JWT_SECRET is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
JWT_EXP_VALUE="${JWT_EXPIRY:-3600}"

if [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "[afrakala/zz-30-jwt] JWT_SECRET too short (<32). Refusing." >&2
  exit 1
fi

# Connect as supabase_admin via the Unix socket exposed by the temporary
# initdb server. ALTER DATABASE ... SET app.settings.* requires a privileged
# Supabase role; the plain `postgres` superuser is rejected by supautils with
# `permission denied to set parameter "app.settings.jwt_secret"`. TCP
# localhost is not guaranteed to be listening during initdb, so we use the
# Unix socket path /var/run/postgresql (same pattern as zz-10).
PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 \
     --host "/var/run/postgresql" \
     --username "supabase_admin" \
     --dbname "$POSTGRES_DB" \
     --no-psqlrc \
     -v jwt_secret="$JWT_SECRET" \
     -v jwt_exp="$JWT_EXP_VALUE" <<'EOSQL'
SELECT set_config('afrakala.bootstrap_jwt_secret', :'jwt_secret', false);
SELECT set_config('afrakala.bootstrap_jwt_exp',    :'jwt_exp',    false);

DO $$
DECLARE
  v_db  text := current_database();
  v_sec text := current_setting('afrakala.bootstrap_jwt_secret', true);
  v_exp text := current_setting('afrakala.bootstrap_jwt_exp', true);
BEGIN
  IF v_sec IS NULL OR length(v_sec) < 32 THEN
    RAISE EXCEPTION 'afrakala.bootstrap_jwt_secret missing/too short (need >=32)';
  END IF;

  EXECUTE format('ALTER DATABASE %I SET app.settings.jwt_secret TO %L', v_db, v_sec);
  EXECUTE format('ALTER DATABASE %I SET app.settings.jwt_exp    TO %L', v_db, v_exp);
END
$$;

SELECT set_config('afrakala.bootstrap_jwt_secret', '', false);
SELECT set_config('afrakala.bootstrap_jwt_exp',    '', false);
EOSQL

echo "[afrakala/zz-30-jwt] jwt bootstrap complete"