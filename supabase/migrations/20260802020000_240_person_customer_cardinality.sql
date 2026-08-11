SET client_encoding='UTF8';

-- =============================================================================
-- 240 — Phase 8.3: one person = one customer, one person = one supplier
-- =============================================================================
--
-- DECISION 1 (owner-approved, binding)
--   customers.person_id and suppliers.person_id become UNIQUE. A person may
--   never hold two customer records or two supplier records.
--
--   Accepted trade-off, stated by the owner: a real-world entity that wants two
--   separate accounts cannot have them. In exchange, credit becomes
--   unambiguous — one person, one customer, one credit line — which is the
--   precondition migration 237 said had to be met before credit could be keyed
--   on person at all.
--
-- WHY A PLAIN UNIQUE CONSTRAINT AND NOT A PARTIAL INDEX ON ACTIVE ROWS
--   Both tables carry is_active, so a partial index was the obvious candidate.
--   It was rejected on evidence, not on theory:
--     * There are no soft-deleted rows. All 12 customers and all 15 suppliers
--       are is_active = true.
--     * Nothing soft-deletes them. No SQL function body and no TypeScript path
--       sets is_active = false on either table; the column is only ever read.
--     * suppliers.status ('active' / 'pending') is an approval workflow state,
--       not a deletion marker.
--   So a partial index would buy no flexibility that is actually used, and it
--   would cost correctness downstream: it permits one inactive plus one active
--   customer per person, which means a credit function resolving a person to a
--   customer could still find two rows unless every such lookup remembered to
--   filter is_active. Checkpoint 8.6 depends on that resolution being
--   single-valued. A plain constraint makes Decision 1 true unconditionally.
--
--   If soft-deletion is introduced later, this constraint must be revisited
--   deliberately — that is a feature, not an oversight.
--
-- SIDE EFFECT HANDLED BELOW
--   person_create_inline unconditionally INSERTs a customer/supplier row. Under
--   uniqueness, calling it twice for the same person in the same context would
--   now fail with a bare unique_violation. It is changed to reuse the existing
--   legacy row and return its id.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Belt and braces: refuse to proceed if any duplicate exists.
--    Checkpoint 8.2 cleared these, but a constraint migration must never
--    depend on a check that ran in an earlier session.
-- -----------------------------------------------------------------------------
DO $precheck$
DECLARE _c int; _s int; _cn int; _sn int;
BEGIN
  SELECT COUNT(*) INTO _c FROM (
    SELECT 1 FROM public.customers GROUP BY person_id HAVING COUNT(*) > 1) x;
  SELECT COUNT(*) INTO _s FROM (
    SELECT 1 FROM public.suppliers GROUP BY person_id HAVING COUNT(*) > 1) x;
  SELECT COUNT(*) INTO _cn FROM public.customers WHERE person_id IS NULL;
  SELECT COUNT(*) INTO _sn FROM public.suppliers WHERE person_id IS NULL;

  IF _c > 0 OR _s > 0 THEN
    RAISE EXCEPTION
      'اعمال یکتایی ممکن نیست: % شخص دارای بیش از یک مشتری و % شخص دارای بیش از یک تأمین‌کننده است. ابتدا این موارد باید ادغام شوند.',
      _c, _s;
  END IF;

  IF _cn > 0 OR _sn > 0 THEN
    RAISE EXCEPTION
      'ردیف بدون شخص یافت شد (مشتری: %، تأمین‌کننده: %). این وضعیت از فاز ۶ نباید ممکن باشد.',
      _cn, _sn;
  END IF;

  RAISE NOTICE 'Pre-check passed: 0 duplicate person_id, 0 null person_id on both tables.';
END $precheck$;

-- -----------------------------------------------------------------------------
-- 2. The constraints.
--
--    ADD CONSTRAINT ... UNIQUE rather than CREATE UNIQUE INDEX, so the rule is
--    visible in \d output as a named table constraint and can carry a COMMENT.
--    CONCURRENTLY is not available inside a transaction and is not needed: 12
--    and 15 rows respectively.
-- -----------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD CONSTRAINT uq_customers_person_id UNIQUE (person_id);

ALTER TABLE public.suppliers
  ADD CONSTRAINT uq_suppliers_person_id UNIQUE (person_id);

COMMENT ON CONSTRAINT uq_customers_person_id ON public.customers IS
  'فاز ۸ (تصمیم ۱): هر شخص فقط یک پروندهٔ مشتری دارد. این قانون باعث می‌شود اعتبار هر شخص یکتا و بدون ابهام باشد — یک شخص، یک مشتری، یک خط اعتباری. اگر روزی حذف نرم (is_active=false) به این جدول اضافه شود، این محدودیت باید آگاهانه بازبینی شود.';

COMMENT ON CONSTRAINT uq_suppliers_person_id ON public.suppliers IS
  'فاز ۸ (تصمیم ۱): هر شخص فقط یک پروندهٔ تأمین‌کننده دارد. سابقهٔ خرید و پرداخت هر شخص در یک پرونده می‌ماند و در دو پرونده تقسیم نمی‌شود.';

-- -----------------------------------------------------------------------------
-- 3. person_create_inline: reuse the legacy row instead of inserting a second.
--
--    The body below is the live definition read with pg_get_functiondef
--    (snapshot: docs/verification/pre-phase8/person_create_inline-before-240.sql).
--    The ONLY changes are:
--      a) the two INSERTs become "look up first, insert only if absent"
--      b) the context link INSERT becomes idempotent, because reusing a legacy
--         row means the (person, context, ref) link already exists and
--         uq_pcl_active_ref would reject a second one
--      c) the return payload gains 'legacy_reused' so a caller can tell
--    No other behaviour, whitelist or field mapping is touched.
--
--    RULE 5: the signature is unchanged, so this is a true replacement and
--    creates no overload. Verified: exactly 1 person_create_inline exists.
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
    -- Phase 8.3: one person = one supplier. Reuse rather than violate.
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
    -- Phase 8.3: one person = one customer. Reuse rather than violate.
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
  END IF;
  -- Any other context_kind creates the person only. That is correct: not every
  -- context has (or needs) a legacy mirror table.

  ---------------------------------------------------------------------------
  -- Provenance. Idempotent since 8.3: when the legacy row is reused, the
  -- matching active context link already exists and uq_pcl_active_ref would
  -- reject a duplicate. ON CONFLICT DO NOTHING covers that case without
  -- masking a genuinely invalid context_kind, which still fails on
  -- person_context_links_context_kind_check.
  ---------------------------------------------------------------------------
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
  'Phase 3 (229), extended in Phase 6.1 (232), made idempotent per person+context in Phase 8.3 (240). Atomically creates a person, its identifiers, the legacy supplier/customer mirror row and the context link. Since 240 the legacy row is REUSED when the person already has one, because uq_customers_person_id / uq_suppliers_person_id enforce one person = one customer/supplier; the returned legacy_reused flag says which happened. p_legacy_fields carries form fields that live only on the legacy row and is applied through a per-table whitelist - unknown keys are ignored.';

REVOKE ALL ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_create_inline(text, text, text, jsonb, text, text, text, text, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
