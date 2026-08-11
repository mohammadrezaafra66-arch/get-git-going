SET client_encoding='UTF8';

-- =============================================================================
-- 242 — Phase 8.5: every external party has a person
-- =============================================================================
--
-- DECISION 3 (owner-approved, binding)
--   external_parties gets the treatment suppliers got in Phase 6: creation
--   routes through the person RPC, existing NULLs are backfilled, and
--   person_id becomes NOT NULL.
--
-- CONTEXT KIND: 'accounting_party', NOT a new 'external_party'
--   The brief says to accept context_kind='external_party' "(if it does not
--   already)". It does already, under a different name. The live data settles
--   it: person_context_links currently holds customer=12, supplier=15 and
--   accounting_party=1, and that one accounting_party row IS the existing
--   external party, created by the Phase 7 backfill in migration 236. Its
--   ref_table is already 'external_parties'.
--   'external_party' is also not in person_context_links_context_kind_check, so
--   adding it would mean widening that CHECK to introduce a SECOND name for a
--   concept the schema already names — splitting the one existing row from
--   every future row, for nothing. Rule 14 says do not create a parallel
--   concept when an implementation exists. Reusing accounting_party.
--
-- CREATION PATHS AUDITED (grep discipline, per the brief)
--   Every `.from("external_parties")` call site in src/ was classified:
--     _app.accounting.external-parties.tsx:250  INSERT  <- the ONLY creation path
--     _app.accounting.external-parties.tsx:237  UPDATE  (edit existing)
--     _app.accounting.external-parties.tsx:74   UPDATE  (is_active toggle)
--     _app.accounting.external-parties.tsx:60   SELECT
--     _app.accounting.payment-vouchers.tsx:138  SELECT
--     PaymentReceiptForm.tsx:585, 655, 873      SELECT
--   The receipt state-2 / «کد آسان» flow only ever SELECTS an existing party;
--   it does not create one. So it is untouched by this change, and the brief's
--   warning not to break it is satisfied by not going near it.
--   No SQL function INSERTs into external_parties either (checked against
--   pg_proc.prosrc).
--
-- BACKFILL SIZE: zero rows. external_parties holds exactly 1 row and it already
--   has a person_id (migration 236 filled it). The backfill below is written to
--   handle the general case anyway, and reports linked-vs-created, because a
--   migration that only works on today's data is not a migration.
--
-- UNIQUENESS: external_parties.person_id is deliberately NOT made unique.
--   Decision 1 covered customers and suppliers only. An external accounting
--   party is a role, and the same human can plausibly appear as a second
--   accounting counterparty without that being a duplicate identity. Flagged
--   for the owner in the Phase 8 report rather than decided here.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. person_create_inline learns the accounting_party context.
--
--    Same shape as the supplier/customer branches added in 232: a per-table
--    WHITELIST, so an unknown key in p_legacy_fields is ignored rather than
--    trusted. The external_parties columns a form can set are national_id,
--    accounting_code and notes; full_name comes from p_display_name and phone
--    from the identifier list, exactly as the other two branches do it.
--
--    No reuse branch here, unlike customers/suppliers in 240: there is no
--    uniqueness constraint on external_parties.person_id to protect against,
--    and a person is allowed more than one accounting-party role.
--
--    RULE 5: signature unchanged, so this replaces rather than overloads.
-- -----------------------------------------------------------------------------
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
$function$;

COMMENT ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text, jsonb) IS
  'Phase 3 (229), extended in Phase 6.1 (232), made idempotent per person+context in Phase 8.3 (240), and taught the accounting_party context in Phase 8.5 (242). Atomically creates a person, its identifiers, the legacy mirror row (suppliers / customers / external_parties) and the context link. p_legacy_fields carries form fields that live only on the legacy row and is applied through a per-table whitelist - unknown keys are ignored.';

REVOKE ALL ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text, jsonb) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Backfill any external_parties row still missing a person.
--
--    Identity matching mirrors person_import_batch: match on the normalized
--    mobile when the party has a phone, otherwise create a fresh person from
--    the name. With 8.4's global contact uniqueness now in force, matching MUST
--    link rather than create when the number already exists — creating would
--    hit uq_person_identifiers_contact_global. The linked/created split is
--    reported below so that behaviour is observed, not assumed.
-- -----------------------------------------------------------------------------
DO $backfill$
DECLARE
  _r        record;
  _pid      uuid;
  _norm     text;
  _linked   int := 0;
  _created  int := 0;
  _total    int := 0;
BEGIN
  FOR _r IN SELECT id, full_name, phone, national_id
            FROM public.external_parties WHERE person_id IS NULL
  LOOP
    _total := _total + 1;
    _pid   := NULL;
    _norm  := NULL;

    IF NULLIF(btrim(COALESCE(_r.phone, '')), '') IS NOT NULL THEN
      BEGIN
        _norm := public.normalize_identifier('mobile_e164', _r.phone, false);
      EXCEPTION WHEN OTHERS THEN
        _norm := NULL;
      END;
    END IF;

    IF _norm IS NOT NULL THEN
      SELECT i.person_id INTO _pid
      FROM public.person_identifiers i
      WHERE i.kind = 'mobile_e164'
        AND i.value_normalized = _norm
        AND i.status <> 'revoked'
      LIMIT 1;
    END IF;

    IF _pid IS NOT NULL THEN
      _linked := _linked + 1;
    ELSE
      INSERT INTO public.persons (kind, display_name, visibility_scope, is_active, notes)
      VALUES ('individual', btrim(_r.full_name), 'internal_general', true,
              'ساخته‌شده در پرکردن فاز ۸.۵ (۲۴۲) از رکورد طرف حساب خارجی بدون شخص.')
      RETURNING id INTO _pid;

      IF _norm IS NOT NULL THEN
        INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
        VALUES (_pid, 'mobile_e164', btrim(_r.phone), 'provisional', true);
      END IF;

      _created := _created + 1;
    END IF;

    UPDATE public.external_parties SET person_id = _pid WHERE id = _r.id;

    INSERT INTO public.person_context_links
      (person_id, context_kind, ref_table, ref_id, started_at)
    VALUES (_pid, 'accounting_party', 'external_parties', _r.id, now())
    ON CONFLICT DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Backfill: % rows processed, % linked to an existing person, % new persons created.',
    _total, _linked, _created;
END $backfill$;

-- -----------------------------------------------------------------------------
-- 3. Prove zero NULLs, then enforce.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM public.external_parties WHERE person_id IS NULL;
  IF _n > 0 THEN
    RAISE EXCEPTION 'پرکردن ناتمام ماند: % طرف حساب خارجی هنوز شخص ندارد.', _n;
  END IF;
  RAISE NOTICE 'Verified: 0 external_parties rows without a person.';
END $verify$;

ALTER TABLE public.external_parties ALTER COLUMN person_id SET NOT NULL;

COMMENT ON COLUMN public.external_parties.person_id IS
  'فاز ۸.۵ (۲۴۲): هر طرف حساب خارجی باید به یک شخص در پروندهٔ یکپارچهٔ اشخاص وصل باشد. برخلاف مشتری و تأمین‌کننده، این ستون عمداً یکتا نیست: طرف حساب خارجی یک «نقش» است و یک شخص می‌تواند بیش از یک نقش طرف‌حسابی داشته باشد. تصمیم ۱ فاز ۸ فقط مشتری و تأمین‌کننده را پوشش می‌داد.';

NOTIFY pgrst, 'reload schema';
