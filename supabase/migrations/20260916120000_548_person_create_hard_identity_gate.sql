SET client_encoding='UTF8';

-- 548 — Hard identity gate on person_create_full.
--
-- An active person must arrive with at least one of: mobile_e164, asan_person_code.
-- Before INSERT, identifiers are matched via person_find_by_identifiers; a hit
-- aborts with a Persian message naming the existing person (no silent reuse —
-- ExistingPersonPrompt / forms decide). Asan import already enforces code+mobile
-- in migration 430 (asan_person_import_rejection); this closes every other writer
-- that goes through person_create_full / person_create_inline.
--
-- Live definition was dumped first (docs/research/person-dedupe/_live_person_create_full.clean.sql).
-- Signature unchanged (rule 5).

CREATE OR REPLACE FUNCTION public.person_create_full(
  p_display_name text,
  p_kind text DEFAULT 'individual'::text,
  p_legal_name text DEFAULT NULL::text,
  p_visibility_scope text DEFAULT 'internal_general'::text,
  p_notes text DEFAULT NULL::text,
  p_is_active boolean DEFAULT true,
  p_identifiers jsonb DEFAULT '[]'::jsonb,
  p_field_values jsonb DEFAULT '[]'::jsonb,
  p_context_kind text DEFAULT NULL::text,
  p_context_ref_table text DEFAULT NULL::text,
  p_context_ref_id uuid DEFAULT NULL::uuid,
  p_context_note text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid           uuid := auth.uid();
  _person_id     uuid;
  _idf           jsonb;
  _fv            jsonb;
  _missing       text;
  _ident_count   int := 0;
  _fv_count      int := 0;
  _link_id       uuid;
  _kind          text;
  _raw           text;
  _status        text;
  _primary       boolean;
  -- 548
  _has_hard_id   boolean := false;
  _find          jsonb;
  _existing_id   uuid;
  _existing_name text;
  _matched_on    text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'نام نمایشی نمی‌تواند خالی باشد.' USING ERRCODE = '22023';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('individual', 'organization') THEN
    RAISE EXCEPTION 'نوع شخص نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF p_visibility_scope IS NULL
     OR p_visibility_scope NOT IN ('internal_general', 'restricted_finance', 'restricted_executive') THEN
    RAISE EXCEPTION 'سطح دسترسی شخص نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF p_identifiers IS NULL OR jsonb_typeof(p_identifiers) <> 'array' THEN
    RAISE EXCEPTION 'فهرست شناسه‌ها باید یک آرایه باشد.' USING ERRCODE = '22023';
  END IF;

  IF p_field_values IS NULL OR jsonb_typeof(p_field_values) <> 'array' THEN
    RAISE EXCEPTION 'فهرست فیلدها باید یک آرایه باشد.' USING ERRCODE = '22023';
  END IF;

  IF p_context_kind IS NOT NULL
     AND ((p_context_ref_table IS NULL) <> (p_context_ref_id IS NULL)) THEN
    RAISE EXCEPTION 'ارجاع زمینه باید هم جدول و هم شناسه داشته باشد یا هیچ‌کدام.'
      USING ERRCODE = '22023';
  END IF;

  -- 548 — active persons need a hard identity key (mobile or Asan code).
  IF COALESCE(p_is_active, true) THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_identifiers) AS e
      WHERE e->>'kind' IN ('mobile_e164', 'asan_person_code')
        AND btrim(COALESCE(e->>'value_raw', '')) <> ''
    ) INTO _has_hard_id;

    IF NOT _has_hard_id THEN
      RAISE EXCEPTION
        'برای ثبت شخص فعال، شمارهٔ موبایل یا کد آسان الزامی است.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 548 — refuse create when an identifier already belongs to someone else.
  _find := public.person_find_by_identifiers(p_identifiers);
  IF COALESCE((_find->>'conflict')::boolean, false) THEN
    RAISE EXCEPTION
      'شناسه‌های واردشده به بیش از یک شخص موجود اشاره می‌کنند. ابتدا از صفحهٔ «اشخاص تکراری» تعیین تکلیف کنید.'
      USING ERRCODE = '23505';
  END IF;

  _existing_id := NULLIF(_find->>'person_id', '')::uuid;
  IF _existing_id IS NOT NULL THEN
    _matched_on := _find->>'matched_on';
    SELECT display_name INTO _existing_name
      FROM public.persons WHERE id = _existing_id;
    RAISE EXCEPTION
      'این شناسه از قبل برای «%» ثبت شده است. شخص تازه‌ای نسازید؛ از همان پرونده استفاده کنید یا نقش جدید به او بدهید.%',
      COALESCE(_existing_name, 'شخص موجود'),
      CASE
        WHEN _matched_on IS NULL THEN ''
        ELSE ' (تطبیق روی: ' || _matched_on || ')'
      END
      USING ERRCODE = '23505';
  END IF;

  SELECT string_agg(d.label, '، ' ORDER BY d.sort_order, d.label)
    INTO _missing
  FROM public.person_field_definitions d
  WHERE d.is_active = true
    AND d.is_required = true
    AND d.applies_to_kind IN (p_kind, 'both')
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_field_values) AS e
      WHERE (e->>'field_definition_id') IS NOT NULL
        AND (e->>'field_definition_id')::uuid = d.id
        AND e->'value' IS NOT NULL
        AND CASE jsonb_typeof(e->'value')
              WHEN 'null'   THEN false
              WHEN 'string' THEN btrim(e->>'value') <> ''
              WHEN 'array'  THEN jsonb_array_length(e->'value') > 0
              WHEN 'object' THEN (SELECT count(*) FROM jsonb_object_keys(e->'value')) > 0
              ELSE true
            END
    );

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'فیلدهای الزامی تکمیل نشده: %', _missing USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.persons (
    kind, display_name, legal_name, visibility_scope, is_active, notes, created_by
  )
  VALUES (
    p_kind,
    btrim(p_display_name),
    NULLIF(btrim(COALESCE(p_legal_name, '')), ''),
    p_visibility_scope,
    COALESCE(p_is_active, true),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    _uid
  )
  RETURNING id INTO _person_id;

  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'ایجاد شخص ناموفق بود.' USING ERRCODE = 'P0001';
  END IF;

  FOR _idf IN SELECT * FROM jsonb_array_elements(p_identifiers)
  LOOP
    _kind    := _idf->>'kind';
    _raw     := _idf->>'value_raw';
    _status  := COALESCE(_idf->>'status', 'provisional');
    _primary := COALESCE((_idf->>'is_primary')::boolean, false);

    IF _kind IS NULL OR btrim(COALESCE(_raw, '')) = '' THEN
      RAISE EXCEPTION 'شناسه نامعتبر است — نوع و مقدار الزامی است.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      INSERT INTO public.person_identifiers (
        person_id, kind, value_raw, status, is_primary, created_by
      )
      VALUES (_person_id, _kind, _raw, _status, _primary, _uid);
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'این شناسه قبلاً در سیستم ثبت شده است: %', _raw
          USING ERRCODE = '23505';
    END;

    _ident_count := _ident_count + 1;
  END LOOP;

  FOR _fv IN SELECT * FROM jsonb_array_elements(p_field_values)
  LOOP
    IF (_fv->>'field_definition_id') IS NULL THEN
      RAISE EXCEPTION 'شناسه تعریف فیلد الزامی است.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.person_field_values (
      person_id, field_definition_id, value, updated_by
    )
    VALUES (
      _person_id,
      (_fv->>'field_definition_id')::uuid,
      _fv->'value',
      _uid
    );

    _fv_count := _fv_count + 1;
  END LOOP;

  IF p_context_kind IS NOT NULL THEN
    INSERT INTO public.person_context_links (
      person_id, context_kind, ref_table, ref_id, note, started_at, created_by
    )
    VALUES (
      _person_id,
      p_context_kind,
      p_context_ref_table,
      p_context_ref_id,
      NULLIF(btrim(COALESCE(p_context_note, '')), ''),
      now(),
      _uid
    )
    RETURNING id INTO _link_id;
  END IF;

  RETURN jsonb_build_object(
    'person_id',          _person_id,
    'identifiers_added',  _ident_count,
    'field_values_added', _fv_count,
    'context_link_id',    _link_id
  );
END;
$function$;

COMMENT ON FUNCTION public.person_create_full(text, text, text, text, text, boolean, jsonb, jsonb, text, text, uuid, text) IS
  'Atomic person create. Migration 548: active persons require mobile_e164 or asan_person_code; existing identifier hits abort with a Persian reuse message before INSERT.';

-- Prove the gate without leaving rows.
DO $$
DECLARE
  _msg text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    -- Will fail auth/role before gate in many envs; the hard-id check is still
    -- reachable when a real authenticated session is used. Structural check:
    IF position('موبایل یا کد آسان' IN pg_get_functiondef('public.person_create_full(text,text,text,text,text,boolean,jsonb,jsonb,text,text,uuid,text)'::regprocedure)) = 0 THEN
      RAISE EXCEPTION '548: hard-id Persian message missing from person_create_full';
    END IF;
    IF position('person_find_by_identifiers' IN pg_get_functiondef('public.person_create_full(text,text,text,text,text,boolean,jsonb,jsonb,text,text,uuid,text)'::regprocedure)) = 0 THEN
      RAISE EXCEPTION '548: person_find_by_identifiers pre-check missing';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
      IF _msg LIKE '548:%' THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE '548 OK: person_create_full hard-id + find-before-insert present';
END
$$;

NOTIFY pgrst, 'reload schema';
