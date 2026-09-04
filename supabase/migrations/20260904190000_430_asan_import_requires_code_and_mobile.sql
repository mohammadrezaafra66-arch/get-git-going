SET client_encoding = 'UTF8';

-- 430 — a person imported from Asan always arrives with an Asan code AND a mobile
--       number, and importing the same file twice never creates a second copy.
--
-- WHY THIS LIVES IN THE DATABASE
--   The import page's own docstring says it: "every rule that matters lives in the
--   database, not here" (`src/routes/_app.admin.asan-import.tsx:40-46`). A form check
--   is a courtesy; PostgREST is a supported client and a staged batch can be committed
--   without the page ever loading.
--
-- WHY NOT A CHECK CONSTRAINT
--   A CHECK on `person_identifiers` cannot enforce PRESENCE. It only ever fires on a row
--   that is being inserted, and the whole defect is that no row is inserted: a blank cell
--   normalises to NULL, `IF _code IS NOT NULL` is false, and the identifier is silently
--   skipped while the person and the `customers` mirror are created anyway. There is
--   nothing for a child-table constraint to refuse. Presence therefore belongs to the
--   commit RPC, which is the only writer to `persons` on this path.
--
-- WHAT CHANGES
--   1. `asan_person_import_rejection(...)` — one place that decides whether a staged row
--      may be imported, and produces the exact sentence the accountant reads. Both the
--      classify and the commit RPC call it, so the preview and the enforcement can never
--      disagree.
--   2. `asan_classify_person_batch` — after classifying, writes that sentence to
--      `apply_note` for every row that would be refused, so the page can warn BEFORE the
--      user presses "ثبت نهایی" instead of after.
--   3. `asan_commit_person_batch` — refuses those rows, counts them (`skipped`, plus a new
--      `rejected` and the list of reasons in `stats`), and re-resolves identity at commit
--      time.
--
-- WHY RE-RESOLVE IDENTITY AT COMMIT TIME
--   Classification is a snapshot taken before the commit loop runs, and nothing kept it
--   honest afterwards. Two batches staged from the same file and classified before either
--   was committed both said `new`, so committing both created the person twice; two rows of
--   ONE batch carrying the same code did the same, and the second person then received no
--   identifier at all because the `WHERE NOT EXISTS` guard suppressed the duplicate insert
--   — a person imported with no Asan code, from inside a single file. Looking the row up
--   again by code, then by mobile, immediately before writing costs one indexed read and
--   closes both.
--
-- WHAT DOES NOT CHANGE
--   The role gate, the batch-status gate, the "never overwrite a non-empty AfraKala value"
--   rule, the customers mirror from 414, the additive identifier writes, and the
--   `update`-with-no-match skip all behave exactly as before. `require_asan_code` and
--   `create_sales_quote_with_items` are untouched: their strings are consumed elsewhere.

---------------------------------------------------------------------------------------
-- 1. The single decision point.
---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asan_person_import_rejection(
  p_asan_code  text,
  p_mobile_raw text,
  p_person_id  uuid,
  p_row_number integer
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _code     text := public.normalize_identifier('asan_person_code', coalesce(p_asan_code, ''), false);
  _mob      text := public.normalize_identifier('mobile_e164', coalesce(p_mobile_raw, ''), false);
  _has_code boolean;
  _has_mob  boolean;
BEGIN
  -- "Arrives with" is about the person, not about the cell. A row that updates someone who
  -- already holds the identifier is complete; only a person left WITHOUT one is refused.
  -- A malformed value is the same as a missing one: normalize_identifier returns NULL for
  -- both, and an Asan code that is not digits has never been usable downstream.
  _has_code := _code IS NOT NULL OR (p_person_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.person_identifiers pi
     WHERE pi.person_id = p_person_id AND pi.kind = 'asan_person_code' AND pi.status <> 'revoked'));

  _has_mob := _mob IS NOT NULL OR (p_person_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.person_identifiers pi
     WHERE pi.person_id = p_person_id AND pi.kind = 'mobile_e164' AND pi.status <> 'revoked'));

  IF _has_code AND _has_mob THEN
    RETURN NULL;
  END IF;

  IF NOT _has_code AND NOT _has_mob THEN
    RETURN format('ردیف %s: کد حساب آسان و شماره موبایل هر دو الزامی‌اند؛ این ردیف وارد نشد.', p_row_number);
  END IF;

  IF NOT _has_code THEN
    RETURN format('ردیف %s: کد حساب آسان الزامی است؛ این ردیف وارد نشد.', p_row_number);
  END IF;

  RETURN format('ردیف %s: شماره موبایل الزامی است؛ این ردیف وارد نشد.', p_row_number);
END;
$function$;

COMMENT ON FUNCTION public.asan_person_import_rejection(text, text, uuid, integer) IS
  'NULL when a staged Asan person row may be imported, otherwise the Persian sentence naming why it was refused. Called by asan_classify_person_batch (preview) and asan_commit_person_batch (enforcement) so the two can never disagree.';

---------------------------------------------------------------------------------------
-- 2. Classify — unchanged, plus the preview of what commit will refuse.
---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asan_classify_person_batch(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r      record;
  _code   text;
  _mob    text;
  _pid    uuid;
  _n      uuid;
  _cnt    integer;
  _stats  jsonb;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR _r IN SELECT * FROM public.asan_import_person_rows WHERE batch_id = p_batch_id LOOP
    _code := public.normalize_identifier('asan_person_code', coalesce(_r.asan_code, ''), false);
    _mob  := public.normalize_identifier('mobile_e164', coalesce(_r.mobile_raw, ''), false);
    _pid  := NULL;

    -- 1. by Asan code: the strongest key, and the only one that means "same account"
    IF _code IS NOT NULL THEN
      SELECT pi.person_id INTO _pid FROM public.person_identifiers pi
       WHERE pi.kind = 'asan_person_code' AND pi.value_normalized = _code
         AND pi.status <> 'revoked' LIMIT 1;
    END IF;

    IF _pid IS NOT NULL THEN
      UPDATE public.asan_import_person_rows
         SET classification = CASE
               WHEN EXISTS (
                 SELECT 1 FROM public.persons p
                  WHERE p.id = _pid
                    AND p.display_name IS NOT DISTINCT FROM _r.display_name
               ) AND (_mob IS NULL OR EXISTS (
                 SELECT 1 FROM public.person_identifiers pi
                  WHERE pi.person_id = _pid AND pi.kind = 'mobile_e164'
                    AND pi.value_normalized = _mob AND pi.status <> 'revoked'
               )) THEN 'unchanged' ELSE 'update' END,
             matched_person_id = _pid,
             match_reason = 'asan_code',
             conflict_reason = NULL
       WHERE id = _r.id;
      CONTINUE;
    END IF;

    -- 2. by mobile. A match here with NO Asan code is an update; a match where the person
    --    already holds a DIFFERENT Asan code is a conflict, never an overwrite.
    IF _mob IS NOT NULL THEN
      SELECT pi.person_id INTO _pid FROM public.person_identifiers pi
       WHERE pi.kind = 'mobile_e164' AND pi.value_normalized = _mob
         AND pi.status <> 'revoked' LIMIT 1;

      IF _pid IS NOT NULL THEN
        SELECT count(*) INTO _cnt FROM public.person_identifiers pi
         WHERE pi.person_id = _pid AND pi.kind = 'asan_person_code'
           AND pi.status <> 'revoked' AND pi.value_normalized IS DISTINCT FROM _code;
        UPDATE public.asan_import_person_rows
           SET classification = CASE WHEN _cnt > 0 THEN 'conflict' ELSE 'update' END,
               matched_person_id = _pid,
               match_reason = 'mobile',
               conflict_reason = CASE WHEN _cnt > 0
                 THEN 'این شخص از قبل کد حساب آسان دیگری دارد' ELSE NULL END
         WHERE id = _r.id;
        CONTINUE;
      END IF;
    END IF;

    -- 3. by display name. Name alone is the weakest signal, and R2.6 measured it as the
    --    weakest in practice too (Asan names carry qualifiers AfraKala's do not), so a name
    --    hit is ALWAYS a conflict for a human to judge -- never a silent update.
    -- Two statements rather than one: there is no min(uuid) aggregate in Postgres, and
    -- reaching for one fails at runtime rather than at CREATE time.
    SELECT count(*) INTO _cnt FROM public.persons p
     WHERE _r.display_name IS NOT NULL AND btrim(_r.display_name) <> ''
       AND p.display_name = btrim(_r.display_name);
    IF _cnt > 0 THEN
      SELECT p.id INTO _n FROM public.persons p
       WHERE p.display_name = btrim(_r.display_name)
       ORDER BY p.id LIMIT 1;
      UPDATE public.asan_import_person_rows
         SET classification = 'conflict', matched_person_id = _n, match_reason = 'name',
             conflict_reason = 'تطابق فقط بر اساس نام؛ کد حساب و موبایل مطابقت ندارند'
       WHERE id = _r.id;
      CONTINUE;
    END IF;

    -- 4. nothing matched
    UPDATE public.asan_import_person_rows
       SET classification = 'new', matched_person_id = NULL, match_reason = NULL,
           conflict_reason = NULL
     WHERE id = _r.id;
  END LOOP;

  -- 430 — tell the user before the commit, not after. One statement over the whole batch
  -- rather than a branch inside each of the four arms above, so the preview is derived from
  -- the classification that was actually stored. Rows already applied keep their note.
  UPDATE public.asan_import_person_rows r
     SET apply_note = public.asan_person_import_rejection(
           r.asan_code, r.mobile_raw, r.matched_person_id, r.row_number)
   WHERE r.batch_id = p_batch_id
     AND r.applied_at IS NULL;

  SELECT jsonb_object_agg(classification, n) INTO _stats
    FROM (SELECT classification, count(*) AS n
            FROM public.asan_import_person_rows WHERE batch_id = p_batch_id
           GROUP BY classification) s;

  SELECT coalesce(_stats, '{}'::jsonb)
         || jsonb_build_object('incomplete',
              (SELECT count(*) FROM public.asan_import_person_rows
                WHERE batch_id = p_batch_id AND apply_note IS NOT NULL))
    INTO _stats;

  UPDATE public.asan_import_batches
     SET stats = _stats
   WHERE id = p_batch_id;

  RETURN _stats;
END;
$function$;

---------------------------------------------------------------------------------------
-- 3. Commit — the enforcement point.
---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asan_commit_person_batch(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r          record;
  _code       text;
  _mob        text;
  _land       text;
  _nid        text;
  _pid        uuid;
  _reject     text;
  _created    integer := 0;
  _updated    integer := 0;
  _skipped    integer := 0;
  _rejected   integer := 0;
  _reasons    jsonb   := '[]'::jsonb;
  _summary    text;
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

    -- 430 — re-resolve identity HERE, not from the classification snapshot. See the header.
    _pid := _r.matched_person_id;
    IF _pid IS NULL AND _code IS NOT NULL THEN
      SELECT pi.person_id INTO _pid FROM public.person_identifiers pi
       WHERE pi.kind = 'asan_person_code' AND pi.value_normalized = _code
         AND pi.status <> 'revoked' LIMIT 1;
    END IF;
    IF _pid IS NULL AND _mob IS NOT NULL THEN
      SELECT pi.person_id INTO _pid FROM public.person_identifiers pi
       WHERE pi.kind = 'mobile_e164' AND pi.value_normalized = _mob
         AND pi.status <> 'revoked' LIMIT 1;
    END IF;

    -- An `update` row whose match has since disappeared is skipped rather than turned into
    -- a new person. Unchanged behaviour, moved below the re-resolution so a row that can
    -- still be found by its identifiers is not lost.
    IF _r.classification = 'update' AND _pid IS NULL THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    -- 430 — A-1 / A-2. Refused rows are COUNTED and NAMED, never silently dropped.
    _reject := public.asan_person_import_rejection(_r.asan_code, _r.mobile_raw, _pid, _r.row_number);
    IF _reject IS NOT NULL THEN
      _rejected := _rejected + 1;
      _skipped  := _skipped + 1;
      -- Bounded: a 488-row file of nothing but bad rows must not push a megabyte of text
      -- into `stats`. The count is always exact; the list is the first 200 reasons.
      IF _rejected <= 200 THEN
        _reasons := _reasons || to_jsonb(_reject);
      END IF;
      UPDATE public.asan_import_person_rows
         SET apply_note = _reject
       WHERE id = _r.id;
      CONTINUE;
    END IF;

    IF _pid IS NULL THEN
      INSERT INTO public.persons (kind, display_name, notes)
      VALUES ('individual', btrim(_r.display_name), NULLIF(btrim(coalesce(_r.address, '')), ''))
      RETURNING id INTO _pid;
      _created := _created + 1;
    ELSE
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
       SET applied_at = now(), classification = 'unchanged', matched_person_id = _pid,
           apply_note = NULL
     WHERE id = _r.id;
  END LOOP;

  IF _rejected > 0 THEN
    _summary := format('%s ردیف به دلیل نداشتن کد آسان یا شماره موبایل وارد نشد.', _rejected);
  END IF;

  UPDATE public.asan_import_batches
     SET status = 'committed', committed_at = now(), committed_by = auth.uid(),
         stats = stats || jsonb_build_object('created', _created, 'updated', _updated,
                                             'skipped', _skipped, 'rejected', _rejected,
                                             'rejections', _reasons, 'summary', _summary)
   WHERE id = p_batch_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'asan_import', p_batch_id::text, 'asan_persons_imported',
          jsonb_build_object('created', _created, 'updated', _updated, 'skipped', _skipped,
                             'rejected', _rejected));

  RETURN jsonb_build_object('created', _created, 'updated', _updated, 'skipped', _skipped,
                            'rejected', _rejected, 'rejections', _reasons,
                            'summary', _summary);
END;
$function$;
