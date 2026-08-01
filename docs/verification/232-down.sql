SET client_encoding='UTF8';

-- =============================================================================
-- 232-down — rollback for migration 232 (person_create_inline legacy fields)
-- =============================================================================
--
-- Restores the 8-argument signature exactly as it was before Phase 6.1, and
-- drops the 9-argument version. No data is touched: this only swaps a function
-- definition back.
--
-- WARNING: run this only after reverting the application code from Phase 6.1
-- and 6.2. SupplierForm / SupplierReferralModal / CustomerForm pass
-- p_legacy_fields; against the restored 8-argument function those calls fail
-- with "function does not exist", and supplier/customer creation stops working.
--
-- HOW TO RUN:
--   docker cp docs\verification\232-down.sql afrakala-lan-db:/tmp/232-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/232-down.sql
--   docker restart afrakala-lan-rest
-- =============================================================================

DROP FUNCTION IF EXISTS public.person_create_inline(text, text, text, jsonb, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.person_create_inline(
  p_display_name     text,
  p_context_kind     text,
  p_kind             text  DEFAULT 'individual'::text,
  p_identifiers      jsonb DEFAULT '[]'::jsonb,
  p_visibility_scope text  DEFAULT 'internal_general'::text,
  p_city             text  DEFAULT NULL::text,
  p_notes            text  DEFAULT NULL::text,
  p_accounting_code  text  DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _uid          uuid := auth.uid();
  _res          jsonb;
  _person_id    uuid;
  _legacy_table text := NULL;
  _legacy_id    uuid  := NULL;
  _link_id      uuid;
  _phone        text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF p_context_kind IS NULL OR btrim(p_context_kind) = '' THEN
    RAISE EXCEPTION 'زمینهٔ ایجاد شخص الزامی است.' USING ERRCODE = '22023';
  END IF;

  _res := public.person_create_full(
    p_display_name,
    p_kind,
    NULL,
    p_visibility_scope,
    p_notes,
    true,
    p_identifiers,
    '[]'::jsonb,
    NULL, NULL, NULL, NULL
  );

  _person_id := (_res->>'person_id')::uuid;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'ایجاد شخص ناموفق بود.' USING ERRCODE = 'P0001';
  END IF;

  SELECT e->>'value_raw'
    INTO _phone
  FROM jsonb_array_elements(COALESCE(p_identifiers, '[]'::jsonb)) AS e
  WHERE e->>'kind' IN ('mobile_e164', 'landline')
  LIMIT 1;

  IF p_context_kind = 'supplier' THEN
    INSERT INTO public.suppliers (name, phone, city, notes, person_id, created_by)
    VALUES (
      btrim(p_display_name),
      _phone,
      NULLIF(btrim(COALESCE(p_city, '')), ''),
      NULLIF(btrim(COALESCE(p_notes, '')), ''),
      _person_id,
      _uid
    )
    RETURNING id INTO _legacy_id;
    _legacy_table := 'suppliers';

  ELSIF p_context_kind = 'customer' THEN
    INSERT INTO public.customers (name, phone, accounting_code, city, notes, person_id)
    VALUES (
      btrim(p_display_name),
      _phone,
      NULLIF(btrim(COALESCE(p_accounting_code, '')), ''),
      NULLIF(btrim(COALESCE(p_city, '')), ''),
      NULLIF(btrim(COALESCE(p_notes, '')), ''),
      _person_id
    )
    RETURNING id INTO _legacy_id;
    _legacy_table := 'customers';
  END IF;

  INSERT INTO public.person_context_links (
    person_id, context_kind, ref_table, ref_id, started_at, created_by
  )
  VALUES (_person_id, p_context_kind, _legacy_table, _legacy_id, now(), _uid)
  RETURNING id INTO _link_id;

  RETURN jsonb_build_object(
    'person_id',         _person_id,
    'legacy_table',      _legacy_table,
    'legacy_id',         _legacy_id,
    'identifiers_added', COALESCE((_res->>'identifiers_added')::int, 0),
    'context_link_id',   _link_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
