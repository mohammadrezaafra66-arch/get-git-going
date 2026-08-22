-- 377-down.sql — reverse migration 377 (the two public surfaces migrations 374/376 missed).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (M7).
--
-- WHAT 377 DID. Recorded two more `anon` surfaces that the OG-25 mission's own enumeration missed
-- and an independent review found:
--
--   GRANT SELECT  ON public.shop_settings                       TO anon;   -- /api/healthz
--   GRANT EXECUTE ON public.get_recent_purchase_label(uuid)     TO anon;   -- public sale-list page
--   GRANT EXECUTE ON public.get_recent_purchase_labels(uuid[])  TO anon;   -- public sale-list page
--
-- All three privileges were ALREADY held before 377 — `shop_settings` through the schema default
-- that 373 closed, and the two functions through explicit `anon=X` grants plus PostgreSQL's default
-- `PUBLIC` grant. So 377 was a catalogue no-op, like 374 and 376. Its purpose is the record.
--
-- THE SAME ASYMMETRY AS 374-down AND 376-down. Running this file narrows these objects BELOW their
-- pre-mission state:
--
--   * `shop_settings` loses SELECT for anon, so `/api/healthz` gets HTTP 401 from PostgREST, reports
--     `"database": {"state":"down"}`, and returns 503. The container healthcheck then restarts every
--     web container on the box. This is not a theoretical consequence — it is why the surface had to
--     be recorded in the first place.
--   * The two functions keep working anyway, because PostgreSQL grants functions EXECUTE to PUBLIC
--     by default and `proacl` here begins `=X/supabase_admin`. Revoking from `anon` alone does not
--     remove anon's ability. To actually close them, PUBLIC must be revoked too — which is a
--     behaviour change and belongs to the Owner-Gate, not to a rollback.
--
-- To roll this mission back, run `373-down` and leave 374-down, 376-down and this file alone.
--
-- Pre-mission state, read from the live catalogue 2026-08-22:
--   shop_settings               anon: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   get_recent_purchase_label   proacl {=X/supabase_admin, ..., anon=X/supabase_admin, ...}
--   get_recent_purchase_labels  proacl {=X/supabase_admin, ..., anon=X/supabase_admin, ...}

SET client_encoding = 'UTF8';

REVOKE SELECT ON TABLE public.shop_settings FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_recent_purchase_label(uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_recent_purchase_labels(uuid[]) FROM anon;
