SET client_encoding='UTF8';

-- =============================================================================
-- 230 — Phase 4: Unified import + backfill of existing suppliers/customers
-- =============================================================================
--
-- TWO functions, deliberately separate, because they must NOT behave alike:
--
--   person_import_batch()      — for NEW data arriving from a spreadsheet.
--                                CREATES the legacy suppliers/customers row.
--   person_backfill_existing() — for rows that ALREADY exist in the DB.
--                                UPDATES their person_id. NEVER inserts.
--
-- Why this separation is not optional:
--   The obvious implementation reuses person_create_inline() for the backfill.
--   person_create_inline INSERTS a suppliers row. Pointing it at the existing
--   13 suppliers would produce 26 suppliers, and undoing that needs DELETE on a
--   table holding data, which repo rule 3 forbids. The backfill therefore has
--   its own code path that can only UPDATE.
--
-- MATCHING RULES (see person_find_by_identifiers)
--   strong ids  national_id_ir | tax_id_ir | company_reg_id_ir | iban
--               -> definitive match, highest precedence
--   weak ids    mobile_e164 | landline | email
--               -> secondary match
--   name        -> NEVER a match key. Two distinct people legitimately share a
--                  name (proved by 228's test P8), and this database already
--                  contains one name collision between customers and suppliers.
--
--   If a single input row matches TWO DIFFERENT persons (e.g. its phone points
--   at person X and its national ID at person Y) the row is REJECTED, not
--   merged. Silently merging two real people is not recoverable.
--
-- MEASURED DATA AT WRITE TIME
--   suppliers 13 (2 with a phone, 11 without), customers 12 (all with phones,
--   all normalizing cleanly), zero phone collisions, zero duplicate names
--   within either table. The 11 phone-less suppliers cannot be deduplicated by
--   anything and are created blind — acceptable only because their names are
--   unique.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. person_find_by_identifiers — shared matching logic
--
--    Returns {person_id, conflict, matched_on}. person_id is NULL when nothing
--    matched. conflict=true means the row pointed at more than one person.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.person_find_by_identifiers(jsonb);

CREATE FUNCTION public.person_find_by_identifiers(p_identifiers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _e            jsonb;
  _kind         text;
  _norm         text;
  _hit          uuid;
  _strong_hit   uuid := NULL;
  _weak_hit     uuid := NULL;
  _matched_on   text := NULL;
  _all_hits     uuid[] := '{}';
BEGIN
  IF p_identifiers IS NULL OR jsonb_typeof(p_identifiers) <> 'array' THEN
    RETURN jsonb_build_object('person_id', NULL, 'conflict', false, 'matched_on', NULL);
  END IF;

  FOR _e IN SELECT * FROM jsonb_array_elements(p_identifiers)
  LOOP
    _kind := _e->>'kind';
    CONTINUE WHEN _kind IS NULL;

    -- strict=false: an unparseable value simply does not match anything,
    -- rather than aborting the whole import.
    _norm := public.normalize_identifier(_kind, _e->>'value_raw', false);
    CONTINUE WHEN _norm IS NULL;

    SELECT pi.person_id INTO _hit
    FROM public.person_identifiers pi
    WHERE pi.kind = _kind
      AND pi.value_normalized = _norm
      AND pi.status <> 'revoked'
    LIMIT 1;

    IF _hit IS NOT NULL THEN
      _all_hits := _all_hits || _hit;
      IF _kind IN ('national_id_ir', 'tax_id_ir', 'company_reg_id_ir', 'iban') THEN
        IF _strong_hit IS NULL THEN
          _strong_hit := _hit;
          _matched_on := _kind;
        END IF;
      ELSE
        IF _weak_hit IS NULL THEN
          _weak_hit := _hit;
          IF _matched_on IS NULL THEN _matched_on := _kind; END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- More than one distinct person referenced by a single input row.
  IF (SELECT count(DISTINCT h) FROM unnest(_all_hits) AS h) > 1 THEN
    RETURN jsonb_build_object('person_id', NULL, 'conflict', true, 'matched_on', _matched_on);
  END IF;

  RETURN jsonb_build_object(
    'person_id', COALESCE(_strong_hit, _weak_hit),
    'conflict',  false,
    'matched_on', _matched_on
  );
END;
$function$;

COMMENT ON FUNCTION public.person_find_by_identifiers(jsonb) IS
'Identity matching for import/backfill (item 230). Strong government IDs take '
'precedence over phone/email. Never matches on name. Returns conflict=true when '
'one input row points at two different persons.';


-- -----------------------------------------------------------------------------
-- 2. person_import_batch — NEW rows from a spreadsheet
--
--    Per-row subtransaction: one bad row is reported and skipped instead of
--    destroying the whole batch. Wrap the CALL in BEGIN..ROLLBACK for a dry run.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.person_import_batch(jsonb);

CREATE FUNCTION public.person_import_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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
$function$;

COMMENT ON FUNCTION public.person_import_batch(jsonb) IS
'Unified spreadsheet import (item 230). Creates or links persons and their '
'legacy suppliers/customers rows. Per-row subtransactions: a bad row is '
'reported as rejected instead of failing the batch. Wrap the call in '
'BEGIN..ROLLBACK for a dry run.';


-- -----------------------------------------------------------------------------
-- 3. person_backfill_existing — EXISTING rows only. Never inserts.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.person_backfill_existing(text, text, integer);

CREATE FUNCTION public.person_backfill_existing(
  p_table        text,
  p_default_kind text    DEFAULT NULL,
  p_limit        integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid       uuid := auth.uid();
  _rec       record;
  _kind      text;
  _ctx       text;
  _idents    jsonb;
  _norm      text;
  _ikind     text;
  _match     jsonb;
  _person_id uuid;
  _created   int := 0;
  _linked    int := 0;
  _rejected  int := 0;
  _results   jsonb := '[]'::jsonb;
  _err       text;
  _n         int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF p_table NOT IN ('suppliers', 'customers') THEN
    RAISE EXCEPTION 'جدول پشتیبانی‌نشده برای پرکردن: %', p_table USING ERRCODE = '22023';
  END IF;

  -- Suppliers are overwhelmingly companies, customers overwhelmingly people.
  -- This is a HEURISTIC, overridable via p_default_kind, and it only sets
  -- persons.kind — nothing depends on it for correctness.
  _kind := COALESCE(p_default_kind,
                    CASE p_table WHEN 'suppliers' THEN 'organization'
                                 ELSE 'individual' END);
  _ctx  := CASE p_table WHEN 'suppliers' THEN 'supplier' ELSE 'customer' END;

  FOR _rec IN
    SELECT * FROM (
      SELECT s.id, s.name, s.phone, s.city, s.is_active, NULL::text AS accounting_code
      FROM public.suppliers s
      WHERE p_table = 'suppliers' AND s.person_id IS NULL
      UNION ALL
      SELECT c.id, c.name, c.phone, c.city, c.is_active, c.accounting_code
      FROM public.customers c
      WHERE p_table = 'customers' AND c.person_id IS NULL
    ) q
    ORDER BY q.name
  LOOP
    EXIT WHEN p_limit IS NOT NULL AND _n >= p_limit;
    _n := _n + 1;

    BEGIN
      ---------------------------------------------------------------------
      -- Build identifiers from the legacy phone, if it parses at all.
      -- An unparseable phone must not block the backfill: the person is
      -- still created, just without that identifier.
      ---------------------------------------------------------------------
      _idents := '[]'::jsonb;
      _ikind  := NULL;
      IF NULLIF(btrim(COALESCE(_rec.phone, '')), '') IS NOT NULL THEN
        _norm := public.normalize_identifier('mobile_e164', _rec.phone, false);
        IF _norm IS NOT NULL THEN
          _ikind := 'mobile_e164';
        ELSE
          _norm := public.normalize_identifier('landline', _rec.phone, false);
          IF _norm IS NOT NULL THEN _ikind := 'landline'; END IF;
        END IF;
        IF _ikind IS NOT NULL THEN
          _idents := jsonb_build_array(jsonb_build_object(
            'kind', _ikind, 'value_raw', btrim(_rec.phone), 'is_primary', true));
        END IF;
      END IF;

      _match := public.person_find_by_identifiers(_idents);
      IF (_match->>'conflict')::boolean THEN
        RAISE EXCEPTION 'ارجاع به بیش از یک شخص؛ ادغام دستی لازم است.' USING ERRCODE = '22023';
      END IF;
      _person_id := (_match->>'person_id')::uuid;

      IF _person_id IS NULL THEN
        -- person_create_full, NOT person_create_inline: no new legacy row.
        _person_id := (public.person_create_full(
                         p_display_name  => _rec.name,
                         p_kind          => _kind,
                         p_visibility_scope => 'internal_general',
                         p_is_active     => COALESCE(_rec.is_active, true),
                         p_identifiers   => _idents
                       )->>'person_id')::uuid;
        _created := _created + 1;
      ELSE
        _linked := _linked + 1;
      END IF;

      -- UPDATE the existing row. This is the only write to the legacy table.
      IF p_table = 'suppliers' THEN
        UPDATE public.suppliers SET person_id = _person_id WHERE id = _rec.id;
      ELSE
        UPDATE public.customers SET person_id = _person_id WHERE id = _rec.id;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.person_context_links
        WHERE person_id = _person_id AND context_kind = _ctx
          AND ref_table = p_table AND ref_id = _rec.id AND ended_at IS NULL
      ) THEN
        INSERT INTO public.person_context_links
          (person_id, context_kind, ref_table, ref_id, note, started_at, created_by)
        VALUES (_person_id, _ctx, p_table, _rec.id,
                'backfill 230', now(), _uid);
      END IF;

      _results := _results || jsonb_build_object(
        'legacy_id', _rec.id, 'display_name', _rec.name, 'person_id', _person_id,
        'action', CASE WHEN (_match->>'person_id') IS NULL THEN 'created' ELSE 'linked' END,
        'identifier_kind', _ikind);

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS _err = MESSAGE_TEXT;
      _rejected := _rejected + 1;
      _results := _results || jsonb_build_object(
        'legacy_id', _rec.id, 'display_name', _rec.name,
        'action', 'rejected', 'reason', _err);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'table', p_table, 'processed', _n,
    'created', _created, 'linked', _linked, 'rejected', _rejected,
    'rows', _results);
END;
$function$;

COMMENT ON FUNCTION public.person_backfill_existing(text, text, integer) IS
'Backfills person_id onto EXISTING suppliers/customers rows (item 230). Only '
'ever UPDATEs the legacy table — it can never insert one, which is why it does '
'not reuse person_create_inline. Idempotent: only rows with person_id IS NULL '
'are considered.';


REVOKE ALL ON FUNCTION public.person_import_batch(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.person_backfill_existing(text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.person_find_by_identifiers(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_import_batch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.person_backfill_existing(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.person_find_by_identifiers(jsonb) TO authenticated;
