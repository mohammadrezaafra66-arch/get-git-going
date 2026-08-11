Pager usage is off.
Output format is unaligned.
CREATE OR REPLACE FUNCTION public.person_create_inline(p_display_name text, p_context_kind text, p_kind text DEFAULT 'individual'::text, p_identifiers jsonb DEFAULT '[]'::jsonb, p_visibility_scope text DEFAULT 'internal_general'::text, p_city text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_accounting_code text DEFAULT NULL::text, p_legacy_fields jsonb DEFAULT '{}'::jsonb)
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
  _reused       boolean := false;
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
    _legacy_table := 'suppliers';
    SELECT id INTO _legacy_id FROM public.suppliers WHERE person_id = _person_id;

    IF _legacy_id IS NULL THEN
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
    ELSE
      _reused := true;
    END IF;

  ELSIF p_context_kind = 'customer' THEN
    _legacy_table := 'customers';
    SELECT id INTO _legacy_id FROM public.customers WHERE person_id = _person_id;

    IF _legacy_id IS NULL THEN
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
    ELSE
      _reused := true;
    END IF;

  ELSIF p_context_kind = 'accounting_party' THEN
    -- Phase 8.5: external accounting counterparties.
    -- Whitelist: only these keys of p_legacy_fields reach the row.
    _legacy_table := 'external_parties';
    INSERT INTO public.external_parties (
      full_name, national_id, phone, accounting_code, notes, person_id
    )
    VALUES (
      btrim(p_display_name),
      NULLIF(btrim(COALESCE(_fields->>'national_id', '')), ''),
      COALESCE(_phone, NULLIF(btrim(COALESCE(_fields->>'phone', '')), '')),
      COALESCE(
        NULLIF(btrim(COALESCE(p_accounting_code, '')), ''),
        NULLIF(btrim(COALESCE(_fields->>'accounting_code', '')), '')
      ),
      NULLIF(btrim(COALESCE(p_notes, '')), ''),
      _person_id
    )
    RETURNING id INTO _legacy_id;
  END IF;
  -- Any other context_kind creates the person only. That is correct: not every
  -- context has (or needs) a legacy mirror table.

  INSERT INTO public.person_context_links (
    person_id, context_kind, ref_table, ref_id, started_at, created_by
  )
  VALUES (_person_id, p_context_kind, _legacy_table, _legacy_id, now(), _uid)
  ON CONFLICT DO NOTHING
  RETURNING id INTO _link_id;

  IF _link_id IS NULL THEN
    SELECT id INTO _link_id FROM public.person_context_links
    WHERE person_id = _person_id
      AND context_kind = p_context_kind
      AND ref_table IS NOT DISTINCT FROM _legacy_table
      AND ref_id IS NOT DISTINCT FROM _legacy_id
      AND ended_at IS NULL
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'person_id',         _person_id,
    'legacy_table',      _legacy_table,
    'legacy_id',         _legacy_id,
    'legacy_reused',     _reused,
    'identifiers_added', COALESCE((_res->>'identifiers_added')::int, 0),
    'context_link_id',   _link_id
  );
END;
$function$

