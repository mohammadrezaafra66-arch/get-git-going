SET client_encoding='UTF8';

-- =============================================================================
-- 232 — Phase 6.1: person_create_inline accepts legacy-row fields
-- =============================================================================
--
-- WHY
--   SupplierForm, SupplierReferralModal and CustomerForm still INSERT into
--   suppliers/customers directly, so they create rows with person_id = NULL.
--   Two such rows exist today ('api' and 'تست دستی من'). They are what blocks
--   NOT NULL on suppliers.person_id / customers.person_id.
--
--   Those forms collect fields person_create_inline does not currently persist:
--     suppliers : contact_name, trust_level, status
--     customers : responsible_id, link_group, birth_date
--   Routing them through the RPC as-is would silently drop that data.
--
-- DECISION: extend the RPC (option (a)), do not patch afterwards.
--   The alternative — call the RPC, then UPDATE the returned legacy_id from the
--   client — reopens exactly the partial-write window Phase 1 (migration 226)
--   closed: the person and legacy row would be committed while the second
--   round-trip could still fail, leaving a half-configured supplier. Keeping it
--   inside the function keeps creation atomic and keeps the RPC the single
--   source of truth for person creation.
--
-- SAFETY: p_legacy_fields is applied through an explicit per-table WHITELIST.
--   Unknown keys are ignored rather than trusted, so a compromised or careless
--   caller cannot set person_id, id, created_by or any column the whitelist
--   does not name.
--
-- RULE 5 COMPLIANCE
--   Adding a defaulted parameter OVERLOADS rather than replaces. The previous
--   8-argument signature is dropped in this same migration so existing calls
--   cannot become ambiguous at runtime.
--
-- The body below is the live definition read with pg_get_functiondef, with only
-- the legacy-fields handling added.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.person_create_inline(text, text, text, jsonb, text, text, text, text);

CREATE OR REPLACE FUNCTION public.person_create_inline(
  p_display_name     text,
  p_context_kind     text,
  p_kind             text  DEFAULT 'individual'::text,
  p_identifiers      jsonb DEFAULT '[]'::jsonb,
  p_visibility_scope text  DEFAULT 'internal_general'::text,
  p_city             text  DEFAULT NULL::text,
  p_notes            text  DEFAULT NULL::text,
  p_accounting_code  text  DEFAULT NULL::text,
  p_legacy_fields    jsonb DEFAULT '{}'::jsonb
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
  _fields       jsonb := COALESCE(p_legacy_fields, '{}'::jsonb);
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF p_context_kind IS NULL OR btrim(p_context_kind) = '' THEN
    RAISE EXCEPTION 'زمینهٔ ایجاد شخص الزامی است.' USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- Person + identifiers. Reuses the Phase 1 RPC so there is exactly ONE
  -- person-creation code path. value_normalized is computed by the Phase 2
  -- trigger, not supplied here.
  ---------------------------------------------------------------------------
  _res := public.person_create_full(
    p_display_name,
    p_kind,
    NULL,                 -- legal_name
    p_visibility_scope,
    p_notes,
    true,                 -- is_active
    p_identifiers,
    '[]'::jsonb,          -- field_values: inline creation never requires them
    NULL, NULL, NULL, NULL
  );

  _person_id := (_res->>'person_id')::uuid;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'ایجاد شخص ناموفق بود.' USING ERRCODE = 'P0001';
  END IF;

  ---------------------------------------------------------------------------
  -- Legacy mirror row.
  --
  -- The phone column on the legacy tables keeps the value AS TYPED, matching
  -- how those tables already store phones. The canonical normalized form lives
  -- in person_identifiers. These are different representations on purpose.
  ---------------------------------------------------------------------------
  SELECT e->>'value_raw'
    INTO _phone
  FROM jsonb_array_elements(COALESCE(p_identifiers, '[]'::jsonb)) AS e
  WHERE e->>'kind' IN ('mobile_e164', 'landline')
  LIMIT 1;

  IF p_context_kind = 'supplier' THEN
    -- Whitelist: only these keys of p_legacy_fields reach the suppliers row.
    INSERT INTO public.suppliers (
      name, phone, city, notes, person_id, created_by,
      contact_name, trust_level, status
    )
    VALUES (
      btrim(p_display_name),
      _phone,
      NULLIF(btrim(COALESCE(p_city, '')), ''),
      NULLIF(btrim(COALESCE(p_notes, '')), ''),
      _person_id,
      _uid,
      NULLIF(btrim(COALESCE(_fields->>'contact_name', '')), ''),
      COALESCE(NULLIF(btrim(COALESCE(_fields->>'trust_level', '')), ''), 'medium'),
      COALESCE(NULLIF(btrim(COALESCE(_fields->>'status', '')), ''), 'pending')
    )
    RETURNING id INTO _legacy_id;
    _legacy_table := 'suppliers';

  ELSIF p_context_kind = 'customer' THEN
    -- Whitelist: only these keys of p_legacy_fields reach the customers row.
    INSERT INTO public.customers (
      name, phone, accounting_code, city, notes, person_id,
      responsible_id, link_group, birth_date
    )
    VALUES (
      btrim(p_display_name),
      _phone,
      NULLIF(btrim(COALESCE(p_accounting_code, '')), ''),
      NULLIF(btrim(COALESCE(p_city, '')), ''),
      NULLIF(btrim(COALESCE(p_notes, '')), ''),
      _person_id,
      NULLIF(btrim(COALESCE(_fields->>'responsible_id', '')), '')::uuid,
      NULLIF(btrim(COALESCE(_fields->>'link_group', '')), ''),
      NULLIF(btrim(COALESCE(_fields->>'birth_date', '')), '')::date
    )
    RETURNING id INTO _legacy_id;
    _legacy_table := 'customers';
  END IF;
  -- Any other context_kind creates the person only. That is correct: not every
  -- context has (or needs) a legacy mirror table.

  ---------------------------------------------------------------------------
  -- Provenance. Fails loudly if context_kind is not one of the 18 permitted
  -- values (person_context_links_context_kind_check).
  ---------------------------------------------------------------------------
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

COMMENT ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text, jsonb) IS
  'Phase 3 (229), extended in Phase 6.1 (232). Atomically creates a person, its identifiers, the legacy supplier/customer mirror row and the context link. p_legacy_fields carries form fields that live only on the legacy row (suppliers: contact_name/trust_level/status; customers: responsible_id/link_group/birth_date) and is applied through a per-table whitelist - unknown keys are ignored.';

REVOKE ALL ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
