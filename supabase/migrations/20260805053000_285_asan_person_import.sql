-- 285: staging-then-approve import of Asan persons.
--
-- Research R3.4 found there is NO staging-then-approve pattern in this codebase to extend:
-- PersonImportForm commits row by row with a 5-row preview, so a failed row is reported after
-- earlier rows are already written. That shape cannot express "propose 488 rows, let a human
-- accept some", which is what this phase needs. So the pattern is built here, once, and phase
-- 3.4 reuses it for products.
--
-- Two rules from the brief are enforced in the database rather than the UI, because a direct
-- PostgREST call must not be able to dodge them:
--   * a `conflict` row can never be applied;
--   * an update never overwrites a non-empty AfraKala value with an Asan one.
--
-- Rollback: docs/verification/285-down.sql
SET client_encoding='UTF8';

-- ------------------------------------------------------------------ batches ----
CREATE TABLE IF NOT EXISTS public.asan_import_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL,
  file_name     text,
  row_count     integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'staged',
  stats         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  committed_by  uuid REFERENCES auth.users(id),
  committed_at  timestamptz,
  CONSTRAINT asan_import_batches_kind_check   CHECK (kind = ANY (ARRAY['persons'::text, 'products'::text])),
  CONSTRAINT asan_import_batches_status_check CHECK (status = ANY (ARRAY['staged'::text, 'committed'::text, 'discarded'::text]))
);

CREATE INDEX IF NOT EXISTS asan_import_batches_kind_status_idx
  ON public.asan_import_batches (kind, status, created_at DESC);

-- -------------------------------------------------------------- person rows ----
CREATE TABLE IF NOT EXISTS public.asan_import_person_rows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          uuid NOT NULL REFERENCES public.asan_import_batches(id) ON DELETE CASCADE,
  row_number        integer NOT NULL,
  asan_code         text,
  display_name      text,
  mobile_raw        text,
  landline_raw      text,
  national_id_raw   text,
  address           text,
  classification    text NOT NULL DEFAULT 'new',
  matched_person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  match_reason      text,
  conflict_reason   text,
  decision          text NOT NULL DEFAULT 'pending',
  applied_at        timestamptz,
  apply_note        text,
  CONSTRAINT asan_import_person_rows_classification_check
    CHECK (classification = ANY (ARRAY['new'::text, 'update'::text, 'conflict'::text, 'unchanged'::text])),
  CONSTRAINT asan_import_person_rows_decision_check
    CHECK (decision = ANY (ARRAY['pending'::text, 'accept'::text, 'skip'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asan_import_person_rows_batch_row
  ON public.asan_import_person_rows (batch_id, row_number);
CREATE INDEX IF NOT EXISTS asan_import_person_rows_class_idx
  ON public.asan_import_person_rows (batch_id, classification);

-- ------------------------------------------------------------------- guards ----
-- A conflict must never be applied. In a trigger, not the RPC, so a direct PATCH that flips
-- decision to 'accept' is refused too (rule 2.5).
CREATE OR REPLACE FUNCTION public.tg_asan_person_row_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.decision = 'accept' AND NEW.classification = 'conflict' THEN
    RAISE EXCEPTION 'ردیف دارای تعارض را نمی‌توان تأیید کرد؛ ابتدا تعارض را حل کنید'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_asan_person_row_guard ON public.asan_import_person_rows;
CREATE TRIGGER trg_asan_person_row_guard
  BEFORE INSERT OR UPDATE ON public.asan_import_person_rows
  FOR EACH ROW EXECUTE FUNCTION public.tg_asan_person_row_guard();

-- ------------------------------------------------------------------- RLS ----
ALTER TABLE public.asan_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asan_import_person_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asan_batches_rw ON public.asan_import_batches;
CREATE POLICY asan_batches_rw ON public.asan_import_batches FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]));

DROP POLICY IF EXISTS asan_person_rows_rw ON public.asan_import_person_rows;
CREATE POLICY asan_person_rows_rw ON public.asan_import_person_rows FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]));

DROP POLICY IF EXISTS viewer_restricted ON public.asan_import_batches;
CREATE POLICY viewer_restricted ON public.asan_import_batches AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid())) WITH CHECK (NOT public.is_viewer_only(auth.uid()));

DROP POLICY IF EXISTS viewer_restricted ON public.asan_import_person_rows;
CREATE POLICY viewer_restricted ON public.asan_import_person_rows AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid())) WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- ----------------------------------------------------------- classification ----
-- Runs over a staged batch and decides what each row is. Separate from the parser so the
-- rule lives in one place and can be re-run after a person is merged or a code is corrected.
CREATE OR REPLACE FUNCTION public.asan_classify_person_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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

  SELECT jsonb_object_agg(classification, n) INTO _stats
    FROM (SELECT classification, count(*) AS n
            FROM public.asan_import_person_rows WHERE batch_id = p_batch_id
           GROUP BY classification) s;

  UPDATE public.asan_import_batches
     SET stats = coalesce(_stats, '{}'::jsonb)
   WHERE id = p_batch_id;

  RETURN coalesce(_stats, '{}'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.asan_classify_person_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_classify_person_batch(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------ commit ----
CREATE OR REPLACE FUNCTION public.asan_commit_person_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION public.asan_commit_person_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_commit_person_batch(uuid) TO authenticated, service_role;

-- ------------------------------------------------------- module permissions ----
-- Seeded for EVERY role. has_dynamic_permission falls back to granting 'view' to
-- admin/manager/accountant/sales/viewer when a module has no row at all (rule 2.5), so
-- absence would have opened this module to everyone.
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name, 'asan-import',
       r.role_name IN ('admin','accountant'), r.role_name IN ('admin','accountant'),
       r.role_name IN ('admin','accountant'), r.role_name = 'admin',
       r.role_name IN ('admin','accountant'), r.role_name IN ('admin','accountant'),
       r.role_name = 'admin'
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                    WHERE rp.role_name = r.role_name AND rp.module = 'asan-import');

DO $chk$
DECLARE n integer; roles integer;
BEGIN
  SELECT count(DISTINCT role_name) INTO roles FROM public.role_permissions;
  SELECT count(*) INTO n FROM public.role_permissions WHERE module = 'asan-import';
  IF n <> roles THEN
    RAISE EXCEPTION 'asan-import must have a row for all % roles, found %', roles, n;
  END IF;

  SELECT count(*) INTO n FROM public.role_permissions
   WHERE module = 'asan-import' AND can_view AND role_name NOT IN ('admin','accountant');
  IF n <> 0 THEN RAISE EXCEPTION '% non-privileged roles can view asan-import', n; END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF n <> 0 THEN RAISE EXCEPTION '% tables in public have RLS disabled', n; END IF;
END
$chk$;
