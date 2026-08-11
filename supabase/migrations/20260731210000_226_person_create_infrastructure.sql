SET client_encoding='UTF8';

-- =============================================================================
-- 226 — Person Creation Infrastructure (Unified Persons, Phase 1)
-- =============================================================================
--
-- GOAL
--   Make `persons` creatable by every role that can already create *some*
--   identity today, and make that creation atomic.
--
-- WHY THIS IS NEEDED
--   `persons` INSERT was restricted to admin/manager, which is STRICTER than
--   the `customers` table it is meant to supersede (sales can create customers).
--   Adopting `persons` unchanged would have removed the sales role's ability to
--   introduce a counterparty — a regression. This migration removes that gate.
--
-- AUTHORIZATION PRINCIPLE — "no new capability"
--   The new INSERT set is the UNION of roles that can already create an
--   identity row somewhere today:
--     admin       — customers, suppliers, external_parties, visitors
--     manager     — customers, suppliers, visitors
--     sales       — customers
--     accountant  — suppliers, external_parties
--   No role gains the ability to create an identity it could not already
--   create. viewer / site / purchase_specialist remain denied (they can create
--   no identity today).
--
--   SCOPE CONSTRAINT: sales and accountant may only create persons at
--   visibility_scope='internal_general' — i.e. universally selectable. Only
--   admin/manager may mint a restricted-scope person. This keeps the
--   "usable in ALL contexts" guarantee true for everything a normal user
--   creates, and prevents a non-privileged user from creating a person they
--   themselves cannot then see.
--
-- ATOMICITY
--   `createPerson` in src/lib/persons/functions.ts documents that person +
--   field_value inserts are separate round trips and a partial failure leaves
--   an orphan person row. `person_create_full` collapses person + identifiers
--   + field values + context link into ONE function body = one transaction.
--
-- SECURITY INVOKER (deliberate)
--   The RPC is SECURITY INVOKER, not DEFINER. Atomicity comes from the single
--   function body, NOT from privilege elevation — so there is no reason to
--   bypass RLS. RLS therefore stays the single source of truth for who may
--   write, which is exactly the property the audit found missing elsewhere
--   (UI gate / role_permissions / RLS disagreeing about supplier creation).
--
-- NORMALIZATION (deliberate non-duplication)
--   `value_normalized` is computed by the single existing TypeScript
--   implementation (src/lib/persons/identifiers-normalize.ts, called from
--   identifiers.functions.ts) and passed in. This migration does NOT reimplement
--   Iranian mobile / national-id / IBAN normalization in plpgsql, because two
--   implementations of the same rules WILL diverge. The DB remains the source
--   of truth for *uniqueness* (the partial unique indexes from S06); TS remains
--   the source of truth for *normalization*.
--
-- AUDIT
--   No new audit code needed: persons, person_identifiers and
--   person_context_links already carry AFTER INSERT audit triggers writing to
--   public.audit_logs ('person.create', etc.).
--
-- NOT IN THIS MIGRATION (deferred, tracked)
--   - Identifier uniqueness semantics (blocker B3): the partial unique index
--     uq_person_identifiers_active_kind_value still treats *provisional* values
--     as globally unique, so a shared landline or a typo can block a real
--     owner. Addressed in Phase 2 (Person Aliases).
--   - person_field_definitions.is_required as a re-gating vector (blocker B4):
--     enforcement below intentionally MIRRORS the existing TS behaviour rather
--     than changing it. There are currently 0 field definitions, so this is a
--     no-op today. Policy decision still open.
--   - The 4 existing SELECT policies still inline the visibility_scope rule.
--     Consolidating them is a refactor, deliberately out of scope here.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. persons — INSERT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS persons_insert_admin_manager ON public.persons;

CREATE POLICY persons_insert_identity_authors
  ON public.persons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin', 'manager'])
    OR (
      has_any_role(auth.uid(), ARRAY['sales', 'accountant'])
      AND visibility_scope = 'internal_general'
    )
  );


-- -----------------------------------------------------------------------------
-- 2. person_identifiers — INSERT
--
--    The EXISTS() subquery is evaluated as the invoking user, so
--    persons_select_by_visibility_scope applies to it automatically. A caller
--    who cannot SEE the person cannot attach an identifier to it. Same trick
--    customer_set_person() already uses.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS person_identifiers_insert_admin_manager ON public.person_identifiers;

CREATE POLICY person_identifiers_insert_identity_authors
  ON public.person_identifiers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales', 'accountant'])
    AND EXISTS (SELECT 1 FROM public.persons p WHERE p.id = person_id)
  );


-- -----------------------------------------------------------------------------
-- 3. person_field_values — INSERT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS pfv_insert_admin_manager ON public.person_field_values;

CREATE POLICY pfv_insert_identity_authors
  ON public.person_field_values
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales', 'accountant'])
    AND EXISTS (SELECT 1 FROM public.persons p WHERE p.id = person_id)
  );


-- -----------------------------------------------------------------------------
-- 4. person_context_links — INSERT
--
--    Context links are OBSERVATIONS ("this person was introduced while
--    registering a purchase"). They are never consulted for authorization and
--    must never become a gate.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS person_context_links_insert_admin_manager ON public.person_context_links;

CREATE POLICY person_context_links_insert_identity_authors
  ON public.person_context_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales', 'accountant'])
    AND EXISTS (SELECT 1 FROM public.persons p WHERE p.id = person_id)
  );


-- -----------------------------------------------------------------------------
-- 5. person_create_full — atomic person creation
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.person_create_full(
  text, text, text, text, text, boolean, jsonb, jsonb, text, text, uuid, text
);

CREATE FUNCTION public.person_create_full(
  p_display_name      text,
  p_kind              text    DEFAULT 'individual',
  p_legal_name        text    DEFAULT NULL,
  p_visibility_scope  text    DEFAULT 'internal_general',
  p_notes             text    DEFAULT NULL,
  p_is_active         boolean DEFAULT true,
  p_identifiers       jsonb   DEFAULT '[]'::jsonb,
  p_field_values      jsonb   DEFAULT '[]'::jsonb,
  p_context_kind      text    DEFAULT NULL,
  p_context_ref_table text    DEFAULT NULL,
  p_context_ref_id    uuid    DEFAULT NULL,
  p_context_note      text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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
  _norm          text;
  _status        text;
  _primary       boolean;
BEGIN
  ---------------------------------------------------------------------------
  -- Auth
  ---------------------------------------------------------------------------
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  ---------------------------------------------------------------------------
  -- Input validation (clean Persian errors instead of raw CHECK violations)
  ---------------------------------------------------------------------------
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

  -- Context link needs either no ref pair at all, or a complete one.
  IF p_context_kind IS NOT NULL
     AND ((p_context_ref_table IS NULL) <> (p_context_ref_id IS NULL)) THEN
    RAISE EXCEPTION 'ارجاع زمینه باید هم جدول و هم شناسه داشته باشد یا هیچ‌کدام.'
      USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- Required-field enforcement.
  -- Mirrors validateRequiredPersonFields() in src/lib/persons/functions.ts.
  -- "Empty" = json null, blank string, empty array, or empty object.
  ---------------------------------------------------------------------------
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

  ---------------------------------------------------------------------------
  -- persons  (RLS: persons_insert_identity_authors)
  ---------------------------------------------------------------------------
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

  ---------------------------------------------------------------------------
  -- person_identifiers
  --
  -- value_normalized is supplied by the caller (normalized in TypeScript —
  -- see header note). We only guard against it being blank, which the table
  -- CHECK would reject anyway but with a much worse message.
  ---------------------------------------------------------------------------
  FOR _idf IN SELECT * FROM jsonb_array_elements(p_identifiers)
  LOOP
    _kind    := _idf->>'kind';
    _raw     := _idf->>'value_raw';
    _norm    := _idf->>'value_normalized';
    _status  := COALESCE(_idf->>'status', 'provisional');
    _primary := COALESCE((_idf->>'is_primary')::boolean, false);

    IF _kind IS NULL OR btrim(COALESCE(_raw, '')) = '' OR btrim(COALESCE(_norm, '')) = '' THEN
      RAISE EXCEPTION 'شناسه نامعتبر است — نوع و مقدار الزامی است.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      INSERT INTO public.person_identifiers (
        person_id, kind, value_raw, value_normalized, status, is_primary, created_by
      )
      VALUES (_person_id, _kind, _raw, _norm, _status, _primary, _uid);
    EXCEPTION
      WHEN unique_violation THEN
        -- Deliberately does NOT name the owning person: that would leak the
        -- existence of a person the caller may not be allowed to see.
        RAISE EXCEPTION 'این شناسه قبلاً در سیستم ثبت شده است: %', _raw
          USING ERRCODE = '23505';
    END;

    _ident_count := _ident_count + 1;
  END LOOP;

  ---------------------------------------------------------------------------
  -- person_field_values
  ---------------------------------------------------------------------------
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

  ---------------------------------------------------------------------------
  -- person_context_links — optional observation of where this person came from
  ---------------------------------------------------------------------------
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
    'person_id',         _person_id,
    'identifiers_added', _ident_count,
    'field_values_added', _fv_count,
    'context_link_id',   _link_id
  );
END;
$function$;

COMMENT ON FUNCTION public.person_create_full(
  text, text, text, text, text, boolean, jsonb, jsonb, text, text, uuid, text
) IS
'Atomic person creation (Phase 1, item 226). Creates persons + person_identifiers + '
'person_field_values + an optional person_context_links observation in ONE transaction. '
'SECURITY INVOKER — RLS is authoritative. value_normalized must be pre-normalized by '
'src/lib/persons/identifiers-normalize.ts; this function does not reimplement it.';

REVOKE ALL ON FUNCTION public.person_create_full(
  text, text, text, text, text, boolean, jsonb, jsonb, text, text, uuid, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.person_create_full(
  text, text, text, text, text, boolean, jsonb, jsonb, text, text, uuid, text
) TO authenticated;
