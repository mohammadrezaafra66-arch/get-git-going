-- 414: every person is a customer by default, from every creation path.
--
-- WHY
--   The owner's decision, without exception: anyone entered into the system gets a
--   customers row -- from the person form, the supplier form, the accounting-party
--   form, or the Asan batch import. Before this, only p_context_kind='customer'
--   produced one, so 56 of 86 persons had none and could not be quoted or scored.
--
-- WHAT CHANGES
--   1. person_create_inline  -- ensures a customers row regardless of p_context_kind.
--      The supplier / accounting_party branches are untouched: a person can be both.
--   2. asan_commit_person_batch -- ensures one for every person it creates or matches.
--   3. Backfill for the persons that already exist without one.
--
-- BOTH functions keep their existing security posture. asan_commit_person_batch stays
-- SECURITY DEFINER with its admin/accountant gate; see the note inside it.
--
-- SAFETY: no DROP, no DELETE, no TRUNCATE. Every write is guarded by NOT EXISTS, so
-- the migration is idempotent and a re-run inserts nothing.

SET client_encoding='UTF8';

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

CREATE OR REPLACE FUNCTION public.asan_commit_person_batch(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r        record;
  _code     text;
  _mob      text;
  _land     text;
  _nid      text;
  _pid      uuid;
  _created  integer := 0;
  _updated  integer := 0;
  _skipped  integer := 0;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.asan_import_batches
                  WHERE id = p_batch_id AND status = 'staged') THEN
    RAISE EXCEPTION 'این دسته در وضعیت قابل ثبت نیست' USING ERRCODE = '22023';
  END IF;

  FOR _r IN
    SELECT * FROM public.asan_import_person_rows
     WHERE batch_id = p_batch_id
       AND classification IN ('new', 'update')
       AND decision = 'accept'
     ORDER BY row_number
  LOOP
    _code := public.normalize_identifier('asan_person_code', coalesce(_r.asan_code, ''), false);
    _mob  := public.normalize_identifier('mobile_e164', coalesce(_r.mobile_raw, ''), false);
    _land := public.normalize_identifier('landline', coalesce(_r.landline_raw, ''), false);
    _nid  := public.normalize_identifier('national_id_ir', coalesce(_r.national_id_raw, ''), false);

    IF _r.classification = 'new' THEN
      INSERT INTO public.persons (kind, display_name, notes)
      VALUES ('individual', btrim(_r.display_name), NULLIF(btrim(coalesce(_r.address, '')), ''))
      RETURNING id INTO _pid;
      _created := _created + 1;
    ELSE
      _pid := _r.matched_person_id;
      IF _pid IS NULL THEN
        _skipped := _skipped + 1;
        CONTINUE;
      END IF;
      -- Never overwrite a non-empty AfraKala value: the owner's data is often more current
      -- than Asan's. Only a NULL/blank field is filled in.
      UPDATE public.persons
         SET notes = coalesce(NULLIF(btrim(coalesce(notes, '')), ''), NULLIF(btrim(coalesce(_r.address, '')), ''))
       WHERE id = _pid;
      _updated := _updated + 1;
    END IF;

    -- 414 — the Asan import path must produce customers too. This function keeps its
    -- SECURITY DEFINER + admin/accountant gate deliberately: routing it through
    -- person_create_inline would turn it INVOKER and put RLS on a path that does not
    -- have it today. That is a security change; it is not this migration's job.
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE person_id = _pid) THEN
      INSERT INTO public.customers (name, phone, person_id)
      VALUES (btrim(_r.display_name),
              NULLIF(btrim(coalesce(_r.mobile_raw, '')), ''),
              _pid);
    END IF;

    -- identifiers are additive and idempotent: a value already present is left alone
    IF _code IS NOT NULL THEN
      INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
      SELECT _pid, 'asan_person_code', _code, _code, 'confirmed', false
       WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                          WHERE pi.kind = 'asan_person_code' AND pi.value_normalized = _code
                            AND pi.status <> 'revoked');
      -- an import against the real Asan file is what promotes a provisional code
      UPDATE public.person_identifiers
         SET status = 'confirmed', verified_at = now(), verified_by = auth.uid()
       WHERE kind = 'asan_person_code' AND value_normalized = _code AND status = 'provisional';
    END IF;

    IF _mob IS NOT NULL THEN
      INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
      SELECT _pid, 'mobile_e164', _r.mobile_raw, _mob, 'provisional', false
       WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                          WHERE pi.kind = 'mobile_e164' AND pi.value_normalized = _mob
                            AND pi.status <> 'revoked');
    END IF;

    IF _land IS NOT NULL THEN
      INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
      SELECT _pid, 'landline', _r.landline_raw, _land, 'provisional', false
       WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                          WHERE pi.person_id = _pid AND pi.kind = 'landline'
                            AND pi.value_normalized = _land AND pi.status <> 'revoked');
    END IF;

    IF _nid IS NOT NULL THEN
      INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
      SELECT _pid, 'national_id_ir', _r.national_id_raw, _nid, 'provisional', false
       WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                          WHERE pi.kind = 'national_id_ir' AND pi.value_normalized = _nid
                            AND pi.status <> 'revoked');
    END IF;

    -- Record which person this row produced. For a `new` row that is the only trace linking
    -- the staged line to what it created, and without it nothing downstream -- including
    -- teardown -- can find it again.
    UPDATE public.asan_import_person_rows
       SET applied_at = now(), classification = 'unchanged', matched_person_id = _pid
     WHERE id = _r.id;
  END LOOP;

  UPDATE public.asan_import_batches
     SET status = 'committed', committed_at = now(), committed_by = auth.uid(),
         stats = stats || jsonb_build_object('created', _created, 'updated', _updated,
                                             'skipped', _skipped)
   WHERE id = p_batch_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'asan_import', p_batch_id::text, 'asan_persons_imported',
          jsonb_build_object('created', _created, 'updated', _updated, 'skipped', _skipped));

  RETURN jsonb_build_object('created', _created, 'updated', _updated, 'skipped', _skipped);
END;
$function$;

-- ------------------------------------------------------------------ PART C: backfill
INSERT INTO public.customers (name, phone, person_id)
SELECT p.display_name,
       (SELECT i.value_normalized FROM public.person_identifiers i
         WHERE i.person_id = p.id AND i.kind = 'mobile_e164'
         ORDER BY i.is_primary DESC NULLS LAST LIMIT 1),
       p.id
  FROM public.persons p
 WHERE NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.person_id = p.id);

-- ------------------------------------------------------------------ VERIFY
DO $verify$
DECLARE
  v_orphans integer;
  v_total   integer;
BEGIN
  SELECT count(*) INTO v_orphans
    FROM public.persons p
   WHERE NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.person_id = p.id);
  IF v_orphans <> 0 THEN
    RAISE EXCEPTION '414: % persons still have no customers row', v_orphans;
  END IF;

  SELECT count(*) INTO v_total FROM public.persons;
  IF v_total = 0 THEN
    RAISE EXCEPTION '414: no persons at all -- the check above would pass vacuously';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
     WHERE n.nspname = 'public' AND pr.proname = 'asan_commit_person_batch'
       AND pr.prosecdef IS TRUE
  ) THEN
    RAISE EXCEPTION '414: asan_commit_person_batch lost SECURITY DEFINER';
  END IF;

  RAISE NOTICE '414: every one of % persons now has a customers row', v_total;
END
$verify$;
