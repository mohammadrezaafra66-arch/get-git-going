SET client_encoding='UTF8';

-- 437 — person_create_inline turns p_accounting_code into a REAL Asan identifier.
--
-- ============================================================================
-- THE DEFECT
-- ============================================================================
-- Reported from the production laptop on 2026-09-05: a customer was created
-- through the customer form with «کد حسابداری» = 114067, and the receipt wizard
-- then refused to find that code.
--
-- The two sides read different tables, and nothing joins them:
--
--   CustomerForm  ──p_accounting_code──►  person_create_inline
--                                            └──► customers.accounting_code   (mirror only)
--
--   DocumentWizard «کد آسان یا شمارهٔ موبایل»
--                 ──► person_identifiers WHERE kind='asan_person_code'         (never written)
--
-- and `require_asan_code` (migration 340) then refuses the document anyway,
-- deliberately, because it reads ONLY person_identifiers. Migration 340's own
-- header names this exact row as the reason for that decision:
--
--   "one test customer has customers.accounting_code = 114067 and no identifier
--    row at all -- and the Asan export reads the identifier, so a fallback would
--    let a document be created that the export then refuses."
--
-- So 340 is right and stays as it is. What is wrong is that the ONLY way the
-- customer form can supply a code writes the mirror and not the identifier.
--
-- Propagation today covers two directions and not the third:
--   308/310  identifier written  -> mirror updated
--   309      mirror row inserted -> pulls the identifier, if one exists
--   (none)   mirror written by a caller with no identifier -> nothing
--
-- SupplierForm already avoids the hole by pushing the code into p_identifiers
-- itself (see its comment: "the Asan code rides the same path as the phone").
-- CustomerForm, QuickAddCustomerDialog and the external-parties screen do not —
-- they pass p_accounting_code, which only ever reached a mirror column.
--
-- ============================================================================
-- THE FIX
-- ============================================================================
-- Derive the identifier inside the RPC, so it is fixed once for every caller
-- rather than three times in the UI: when p_accounting_code carries a value and
-- the caller has NOT already supplied an asan_person_code of its own, append
-- one to the identifier array handed to person_create_full.
--
-- Consequences of routing it through person_create_full rather than inserting
-- here, all of them wanted:
--   - trg_person_identifiers_normalize validates and normalises the value, so
--     leading zeros collapse into one uniqueness form ('0114067' and '114067'
--     cannot become two codes) while value_raw keeps what was typed — which is
--     what the wizard matches on first. Note that a code in Persian digits never
--     reaches this point either way: the CHECK constraint
--     customers_accounting_code_format ('^[A-Za-z0-9_-]{1,30}$') rejects the
--     mirror INSERT a few lines later, exactly as it did before 437. Measured,
--     not assumed — the first run of the verification script failed there.
--   - a code already held by someone else raises the existing Persian message
--     «این شناسه قبلاً در سیستم ثبت شده است: …» and the whole creation rolls
--     back, instead of creating a customer whose documents would be refused
--     later by require_asan_code.
--   - migration 309's BEFORE INSERT trigger fills the mirror, and the explicit
--     p_accounting_code on the INSERT still wins — same value either way.
--
-- NOT changed here, on purpose:
--   - `_fields->>'accounting_code'` (the accounting_party branch's fallback) is
--     not read. No caller supplies the code only that way today, and widening
--     the source of an identifier is not a shape this migration should guess at.
--   - require_asan_code and its no-fallback rule (340 D6) are untouched.
--   - existing rows are NOT backfilled. Mirrors can hold stale codes — migration
--     310 documents a real supplier that carried a test code for exactly that
--     reason — so turning today's mirrors into identifiers in bulk is a data
--     decision for the owner, not a side effect of a function fix.
--
-- Signature is unchanged, so CREATE OR REPLACE genuinely replaces and cannot
-- overload (rule 5). Live definition was read first (rule 4) and matched
-- migration 414 byte for byte; this file is that definition plus the block
-- marked «437» and the two new DECLARE lines.
--
-- Rollback: docs/verification/437-down.sql

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
  -- 437
  _identifiers  jsonb := COALESCE(p_identifiers, '[]'::jsonb);
  _asan         text  := NULLIF(btrim(COALESCE(p_accounting_code, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF p_context_kind IS NULL OR btrim(p_context_kind) = '' THEN
    RAISE EXCEPTION 'زمینهٔ ایجاد شخص الزامی است.' USING ERRCODE = '22023';
  END IF;

  -- 437 — the Asan code becomes an identifier, not just a mirror column.
  -- Skipped when the caller already sent one (SupplierForm does), so the two
  -- paths can never insert two codes for one person and trip
  -- uq_person_identifiers_asan_one_per_person.
  -- The jsonb_typeof guard leaves a malformed p_identifiers alone so
  -- person_create_full still reports it with its own message.
  IF _asan IS NOT NULL
     AND jsonb_typeof(_identifiers) = 'array'
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(_identifiers) AS e
       WHERE e->>'kind' = 'asan_person_code'
         AND btrim(COALESCE(e->>'value_raw', '')) <> ''
     ) THEN
    _identifiers := _identifiers || jsonb_build_array(
      jsonb_build_object(
        'kind',       'asan_person_code',
        'value_raw',  _asan,
        'is_primary', true,
        'status',     'provisional'
      )
    );
  END IF;

  _res := public.person_create_full(
    p_display_name,
    p_kind,
    NULL,
    p_visibility_scope,
    p_notes,
    true,
    _identifiers,   -- 437: was p_identifiers
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

    -- D8-2 (migration 269): mirror the supplier/customer reuse pattern that the
    -- two branches above already use -- this branch was the only one that
    -- INSERTed unconditionally, which is how a person could end up with two
    -- external parties. Only ACTIVE rows count, matching the partial index
    -- uq_external_parties_person_active: a person whose only external party has
    -- been disabled may legitimately get a new one.
    SELECT id INTO _legacy_id
      FROM public.external_parties
     WHERE person_id = _person_id AND is_active;

    IF _legacy_id IS NULL THEN
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
    ELSE
      _reused := true;
    END IF;
  END IF;
  -- Any other context_kind creates the person only. That is correct: not every
  -- context has (or needs) a legacy mirror table.

  -- 414 — EVERY person is a customer by default, whatever context created them.
  -- Guarded by NOT EXISTS so the 'customer' branch above is a no-op here and a
  -- re-run never duplicates. _legacy_table/_legacy_id are deliberately NOT touched:
  -- they describe the context the caller asked for, and the return contract that
  -- six UI call sites read must keep meaning that.
  -- No person_context_links row is written for this implicit customer role, on
  -- purpose: can_read_person_scoped() reads that table, so adding a link would
  -- widen who can READ the person. That is a security change and does not belong
  -- in a data-shape migration.
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE person_id = _person_id) THEN
    INSERT INTO public.customers (name, phone, city, notes, person_id)
    VALUES (
      btrim(p_display_name),
      _phone,
      NULLIF(btrim(COALESCE(p_city, '')), ''),
      NULLIF(btrim(COALESCE(p_notes, '')), ''),
      _person_id
    );
  END IF;

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
$function$;

COMMENT ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text, jsonb) IS
  'Creates a person plus its legacy mirror row in one transaction. Migration 437: p_accounting_code is registered as an asan_person_code identifier (unless the caller already sent one), because require_asan_code and the ledger wizard read person_identifiers, not the mirror columns.';
