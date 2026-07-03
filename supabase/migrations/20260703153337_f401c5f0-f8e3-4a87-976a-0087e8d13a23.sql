-- Column-level revoke: block reading the plaintext api_key via PostgREST for
-- app users. Row-level policy still allows admin+accountant to see other
-- columns; server-side code using service_role continues to work.
REVOKE SELECT (api_key) ON public.currency_sources FROM authenticated;
REVOKE SELECT (api_key) ON public.currency_sources FROM anon;

-- Keep write privileges on api_key so admins/accountants can rotate the key
-- through the existing UI (which never reads it back).
GRANT INSERT (api_key), UPDATE (api_key) ON public.currency_sources TO authenticated;

-- Explicitly re-grant SELECT on all non-sensitive columns to authenticated
-- so PostgREST list queries continue to work.
GRANT SELECT (id, name, url, is_active, created_at, updated_at)
  ON public.currency_sources TO authenticated;