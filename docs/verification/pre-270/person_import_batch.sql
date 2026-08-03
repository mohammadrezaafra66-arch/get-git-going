Pager usage is off.
Output format is unaligned.
CREATE OR REPLACE FUNCTION public.person_import_batch(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid        uuid := auth.uid();
  _row        jsonb;
  _idents     jsonb;
  _match      jsonb;
  _person_id  uuid;
  _legacy_id  uuid;
  _ctx        text;
  _legacy_tbl text;
  _name       text;
  _created    int := 0;
  _linked     int := 0;
  _rejected   int := 0;
  _results    jsonb := '[]'::jsonb;
  _err        text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'ورودی باید یک آرایه از ردیف‌ها باشد.' USING ERRCODE = '22023';
  END IF;

  FOR _row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    _name       := btrim(COALESCE(_row->>'display_name', ''));
    _ctx        := _row->>'context_kind';
    _idents     := COALESCE(_row->'identifiers', '[]'::jsonb);
    _person_id  := NULL;
    _legacy_id  := NULL;
    _legacy_tbl := NULL;

    BEGIN
      IF _name = '' THEN
        RAISE EXCEPTION 'نام نمایشی الزامی است.' USING ERRCODE = '22023';
      END IF;
      IF _ctx IS NULL OR btrim(_ctx) = '' THEN
        RAISE EXCEPTION 'زمینهٔ ردیف الزامی است.' USING ERRCODE = '22023';
      END IF;

      _match := public.person_find_by_identifiers(_idents);

      IF (_match->>'conflict')::boolean THEN
        RAISE EXCEPTION 'این ردیف به بیش از یک شخص موجود اشاره می‌کند؛ ادغام دستی لازم است.'
          USING ERRCODE = '22023';
      END IF;

      _person_id := (_match->>'person_id')::uuid;

      IF _person_id IS NULL THEN
        ---------------------------------------------------------------------
        -- Unknown party: create person + legacy row together.
        ---------------------------------------------------------------------
        _legacy_id := (public.person_create_inline(
                         p_display_name   => _name,
                         p_context_kind   => _ctx,
                         p_kind           => COALESCE(_row->>'kind', 'individual'),
                         p_identifiers    => _idents,
                         p_city           => _row->>'city',
                         p_notes          => _row->>'notes',
                         p_accounting_code=> _row->>'accounting_code'
                       )->>'legacy_id')::uuid;
        _person_id := (public.person_find_by_identifiers(_idents)->>'person_id')::uuid;
        -- person_create_inline already returned the id; re-derive only if the
        -- row carried no identifiers to match on.
        IF _person_id IS NULL THEN
          SELECT person_id INTO _person_id
          FROM public.person_context_links
          WHERE ref_table IS NOT NULL AND ref_id = _legacy_id
          ORDER BY created_at DESC LIMIT 1;
        END IF;
        _created := _created + 1;
        _results := _results || jsonb_build_object(
          'display_name', _name, 'person_id', _person_id,
          'legacy_id', _legacy_id, 'action', 'created');

      ELSE
        ---------------------------------------------------------------------
        -- Known party. Reuse the person, and make sure a legacy row exists for
        -- THIS context — otherwise importing an existing customer as a supplier
        -- would silently produce no supplier at all.
        ---------------------------------------------------------------------
        _legacy_tbl := CASE _ctx WHEN 'supplier' THEN 'suppliers'
                                 WHEN 'customer' THEN 'customers'
                                 ELSE NULL END;

        IF _legacy_tbl = 'suppliers' THEN
          SELECT id INTO _legacy_id FROM public.suppliers WHERE person_id = _person_id LIMIT 1;
          IF _legacy_id IS NULL THEN
            INSERT INTO public.suppliers (name, phone, city, notes, person_id, created_by)
            VALUES (_name,
                    (SELECT e->>'value_raw' FROM jsonb_array_elements(_idents) e
                      WHERE e->>'kind' IN ('mobile_e164','landline') LIMIT 1),
                    NULLIF(btrim(COALESCE(_row->>'city','')),''),
                    NULLIF(btrim(COALESCE(_row->>'notes','')),''),
                    _person_id, _uid)
            RETURNING id INTO _legacy_id;
          END IF;
        ELSIF _legacy_tbl = 'customers' THEN
          SELECT id INTO _legacy_id FROM public.customers WHERE person_id = _person_id LIMIT 1;
          IF _legacy_id IS NULL THEN
            INSERT INTO public.customers (name, phone, accounting_code, city, notes, person_id)
            VALUES (_name,
                    (SELECT e->>'value_raw' FROM jsonb_array_elements(_idents) e
                      WHERE e->>'kind' IN ('mobile_e164','landline') LIMIT 1),
                    NULLIF(btrim(COALESCE(_row->>'accounting_code','')),''),
                    NULLIF(btrim(COALESCE(_row->>'city','')),''),
                    NULLIF(btrim(COALESCE(_row->>'notes','')),''),
                    _person_id)
            RETURNING id INTO _legacy_id;
          END IF;
        END IF;

        -- Provenance, idempotent.
        IF NOT EXISTS (
          SELECT 1 FROM public.person_context_links
          WHERE person_id = _person_id AND context_kind = _ctx
            AND ref_table IS NOT DISTINCT FROM _legacy_tbl
            AND ref_id IS NOT DISTINCT FROM _legacy_id
            AND ended_at IS NULL
        ) THEN
          INSERT INTO public.person_context_links
            (person_id, context_kind, ref_table, ref_id, started_at, created_by)
          VALUES (_person_id, _ctx, _legacy_tbl, _legacy_id, now(), _uid);
        END IF;

        _linked := _linked + 1;
        _results := _results || jsonb_build_object(
          'display_name', _name, 'person_id', _person_id,
          'legacy_id', _legacy_id, 'action', 'linked',
          'matched_on', _match->>'matched_on');
      END IF;

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS _err = MESSAGE_TEXT;
      _rejected := _rejected + 1;
      _results := _results || jsonb_build_object(
        'display_name', _name, 'action', 'rejected', 'reason', _err);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'created', _created, 'linked', _linked, 'rejected', _rejected,
    'total', jsonb_array_length(p_rows), 'rows', _results);
END;
$function$

