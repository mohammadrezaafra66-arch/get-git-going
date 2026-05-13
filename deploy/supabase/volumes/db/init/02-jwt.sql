-- AfraKala — Supabase self-host bootstrap (idempotent)
-- 02-jwt.sql
--
-- Stores JWT settings at database level for Supabase-compatible helpers such as
-- auth.uid(), auth.role(), and auth.jwt(). Values are read from runtime env only.

\set jwt_secret `echo "$JWT_SECRET"`
\set jwt_exp `echo "${JWT_EXPIRY:-3600}"`

DO $$
DECLARE
  v_db text := current_database();
  v_sec text := :'jwt_secret';
  v_exp text := :'jwt_exp';
BEGIN
  IF v_sec IS NULL OR length(v_sec) < 32 THEN
    RAISE EXCEPTION 'JWT_SECRET is missing or too short (need >=32 chars). Refusing to bootstrap.';
  END IF;

  EXECUTE format('ALTER DATABASE %I SET app.settings.jwt_secret TO %L', v_db, v_sec);
  EXECUTE format('ALTER DATABASE %I SET app.settings.jwt_exp TO %L', v_db, v_exp);
END
$$;
