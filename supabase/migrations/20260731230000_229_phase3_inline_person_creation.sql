SET client_encoding='UTF8';

-- =============================================================================
-- 229 — Phase 3: Inline person creation from transaction forms
-- =============================================================================
--
-- WHY THIS IS MORE THAN "just another RPC"
--
--   The Phase 3 business flow is:
--     PurchaseForm -> "+ supplier" -> create -> dropdown refreshed -> selected
--
--   That flow CANNOT work with a persons-only insert. Verified before writing:
--     purchases.supplier_id  ->  FK to suppliers(id)
--     PurchaseForm dropdown  ->  SELECT id, name FROM suppliers
--     suppliers.person_id    ->  did not exist
--
--   A new `persons` row is invisible to that dropdown, unselectable, and the
--   purchase cannot be saved. So inline creation must write the person AND the
--   legacy row, atomically, bridged by person_id. That is a deliberate, approved
--   slice of the later dual-write/ID-mapping work pulled forward — it is the
--   only way Phase 3 delivers a working flow rather than a modal that dead-ends.
--
--   `customers.person_id` already existed (added long before this work).
--   `suppliers.person_id` is added here for symmetry.
--
-- ATOMICITY
--   person_create_inline delegates person+identifiers to person_create_full
--   (no second creation path — rule 14), then inserts the legacy row and the
--   context link in the same function body = one transaction. Any failure rolls
--   back everything, so a half-created supplier can never exist.
--
-- SECURITY INVOKER
--   RLS stays authoritative, and the existing table policies line up:
--     purchases INSERT  = admin/manager   ) so a purchase-form user creating a
--     suppliers INSERT  = admin/manager/accountant )  supplier is always allowed
--     sales_quotes INSERT = admin/manager/sales )  and a quote-form user
--     customers INSERT  = admin/manager/sales   )  creating a customer likewise
--   No privilege elevation is required or granted.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. suppliers.person_id — the missing bridge
-- -----------------------------------------------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id);

CREATE INDEX IF NOT EXISTS suppliers_person_id_idx
  ON public.suppliers (person_id);

COMMENT ON COLUMN public.suppliers.person_id IS
'Bridge to the unified person record (item 229). Nullable: legacy suppliers '
'predate the persons model and are backfilled in a later phase. Mirrors '
'customers.person_id.';


-- -----------------------------------------------------------------------------
-- 2. person_create_inline
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.person_create_inline(
  text, text, text, jsonb, text, text, text, text
);

CREATE FUNCTION public.person_create_inline(
  p_display_name     text,
  p_context_kind     text,
  p_kind             text  DEFAULT 'individual',
  p_identifiers      jsonb DEFAULT '[]'::jsonb,
  p_visibility_scope text  DEFAULT 'internal_general',
  p_city             text  DEFAULT NULL,
  p_notes            text  DEFAULT NULL,
  p_accounting_code  text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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

  ---------------------------------------------------------------------------
  -- Person + identifiers. Reuses the Phase 1 RPC so there is exactly ONE
  -- person-creation code path. value_normalized is computed by the Phase 2
  -- trigger, not supplied here.
  --
  -- The context link is intentionally NOT created by this call: it must point
  -- at the legacy row, which does not exist yet. It is opened further down.
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

COMMENT ON FUNCTION public.person_create_inline(
  text, text, text, jsonb, text, text, text, text
) IS
'Inline person creation from a transaction form (item 229). Creates the person, '
'its identifiers, the legacy mirror row (suppliers/customers) and a provenance '
'context link in ONE transaction, so the new party is immediately selectable in '
'the form that created it. SECURITY INVOKER — RLS is authoritative.';

REVOKE ALL ON FUNCTION public.person_create_inline(
  text, text, text, jsonb, text, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.person_create_inline(
  text, text, text, jsonb, text, text, text, text
) TO authenticated;
