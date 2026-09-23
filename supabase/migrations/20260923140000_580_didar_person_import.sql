SET client_encoding = 'UTF8';

-- 580 — Didar contact import (Part A).
-- Separate from Asan: no Asan code, never update an existing person, mobile-only key.

--------------------------------------------------------------------------------
-- 1. persons.origin (D9)
--------------------------------------------------------------------------------
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS origin text;

UPDATE public.persons
   SET origin = 'manual'
 WHERE origin IS NULL;

ALTER TABLE public.persons
  ALTER COLUMN origin SET DEFAULT 'manual';

ALTER TABLE public.persons
  ALTER COLUMN origin SET NOT NULL;

DO $origin$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'persons_origin_check'
       AND conrelid = 'public.persons'::regclass
  ) THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT persons_origin_check
      CHECK (origin = ANY (ARRAY['manual'::text, 'asan_import'::text, 'didar_import'::text]));
  END IF;
END
$origin$;

COMMENT ON COLUMN public.persons.origin IS
  'How the person row was created. Didar import writes didar_import. Never changed when an Asan code is later attached.';

--------------------------------------------------------------------------------
-- 2. Staging tables (285/430 pattern)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.didar_import_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL DEFAULT 'persons',
  file_name     text,
  row_count     integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'staged',
  stats         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  committed_by  uuid REFERENCES auth.users(id),
  committed_at  timestamptz,
  CONSTRAINT didar_import_batches_kind_check
    CHECK (kind = 'persons'::text),
  CONSTRAINT didar_import_batches_status_check
    CHECK (status = ANY (ARRAY['staged'::text, 'committed'::text, 'discarded'::text]))
);

CREATE INDEX IF NOT EXISTS didar_import_batches_status_idx
  ON public.didar_import_batches (status, created_at DESC);

-- Register the forthcoming FK in person_merge BEFORE CREATE TABLE (migration 328).
-- Patch the LIVE definition (rule 5.2 / 287 pattern). Do not retype the function.
DO $reg$
DECLARE
  _oid    oid;
  _def    text;
  _orig   text;
  _anchor text := $a$'asan_import_person_rows.matched_person_id',                'generic',$a$;
  _line   text := $a$'didar_import_person_rows.matched_person_id',               'generic',$a$;
  _hits   integer;
  _q_before integer;
  _q_after  integer;
BEGIN
  SELECT p.oid INTO _oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'person_merge';
  IF _oid IS NULL THEN
    RAISE EXCEPTION '580: public.person_merge does not exist';
  END IF;

  _def := pg_get_functiondef(_oid);

  IF position($a$'didar_import_person_rows.matched_person_id'$a$ in _def) > 0 THEN
    RAISE NOTICE '580: didar_import_person_rows.matched_person_id already registered';
    RETURN;
  END IF;

  _hits := (length(_def) - length(replace(_def, _anchor, ''))) / length(_anchor);
  IF _hits <> 1 THEN
    RAISE EXCEPTION '580: asan_import anchor matched % times, expected 1 — person_merge changed shape', _hits;
  END IF;

  _orig := _def;
  _def  := replace(_def, _anchor, _anchor || E'\n    ' || _line);

  _q_before := length(_orig) - length(replace(_orig, '?', ''));
  _q_after  := length(_def)  - length(replace(_def,  '?', ''));
  IF _q_after <> _q_before THEN
    RAISE EXCEPTION '580: ? count changed % -> % — Persian text was corrupted', _q_before, _q_after;
  END IF;

  EXECUTE _def;
END
$reg$;

CREATE TABLE IF NOT EXISTS public.didar_import_person_rows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          uuid NOT NULL REFERENCES public.didar_import_batches(id) ON DELETE CASCADE,
  row_number        integer NOT NULL,
  didar_id          text,
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
  apply_note        text,
  applied_at        timestamptz,
  CONSTRAINT didar_import_person_rows_classification_check
    CHECK (classification = ANY (ARRAY['new'::text, 'incomplete'::text, 'conflict'::text])),
  CONSTRAINT didar_import_person_rows_decision_check
    CHECK (decision = ANY (ARRAY['pending'::text, 'accept'::text, 'skip'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_didar_import_person_rows_batch_row
  ON public.didar_import_person_rows (batch_id, row_number);
CREATE INDEX IF NOT EXISTS didar_import_person_rows_class_idx
  ON public.didar_import_person_rows (batch_id, classification);

--------------------------------------------------------------------------------
-- 3. Accept ban (conflict / incomplete) — trigger, so a direct PATCH is refused
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_didar_person_row_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.decision = 'accept'
     AND COALESCE(NEW.classification IN ('conflict', 'incomplete'), false) THEN
    RAISE EXCEPTION 'ردیف ناقص یا دارای تعارض را نمی‌توان تأیید کرد'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_didar_person_row_guard ON public.didar_import_person_rows;
CREATE TRIGGER trg_didar_person_row_guard
  BEFORE INSERT OR UPDATE ON public.didar_import_person_rows
  FOR EACH ROW EXECUTE FUNCTION public.tg_didar_person_row_guard();

--------------------------------------------------------------------------------
-- 4. RLS — admin + accountant
--------------------------------------------------------------------------------
ALTER TABLE public.didar_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.didar_import_person_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS didar_batches_rw ON public.didar_import_batches;
CREATE POLICY didar_batches_rw ON public.didar_import_batches FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]));

DROP POLICY IF EXISTS didar_person_rows_rw ON public.didar_import_person_rows;
CREATE POLICY didar_person_rows_rw ON public.didar_import_person_rows FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]));

DROP POLICY IF EXISTS viewer_restricted ON public.didar_import_batches;
CREATE POLICY viewer_restricted ON public.didar_import_batches AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

DROP POLICY IF EXISTS viewer_restricted ON public.didar_import_person_rows;
CREATE POLICY viewer_restricted ON public.didar_import_person_rows AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.didar_import_batches TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.didar_import_person_rows TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 5. Classify
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.didar_classify_person_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _r     record;
  _mob   text;
  _pid   uuid;
  _name  text;
  _seen  text[];
  _stats jsonb;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.didar_import_batches WHERE id = p_batch_id) THEN
    RAISE EXCEPTION 'دسته پیدا نشد' USING ERRCODE = '22023';
  END IF;

  _seen := ARRAY[]::text[];

  FOR _r IN
    SELECT * FROM public.didar_import_person_rows
     WHERE batch_id = p_batch_id
     ORDER BY row_number
  LOOP
    IF btrim(coalesce(_r.mobile_raw, '')) = '' THEN
      UPDATE public.didar_import_person_rows
         SET classification = 'incomplete',
             matched_person_id = NULL,
             match_reason = NULL,
             conflict_reason = NULL,
             apply_note = format('ردیف %s: شماره موبایل الزامی است', _r.row_number)
       WHERE id = _r.id;
      CONTINUE;
    END IF;

    _mob := public.normalize_identifier('mobile_e164', coalesce(_r.mobile_raw, ''), false);

    IF _mob IS NULL THEN
      UPDATE public.didar_import_person_rows
         SET classification = 'incomplete',
             matched_person_id = NULL,
             match_reason = NULL,
             conflict_reason = NULL,
             apply_note = format('ردیف %s: شماره موبایل نامعتبر است', _r.row_number)
       WHERE id = _r.id;
      CONTINUE;
    END IF;

    SELECT pi.person_id, p.display_name
      INTO _pid, _name
      FROM public.person_identifiers pi
      JOIN public.persons p ON p.id = pi.person_id
     WHERE pi.kind = 'mobile_e164'
       AND pi.value_normalized = _mob
       AND pi.status <> 'revoked'
     LIMIT 1;

    IF _pid IS NOT NULL THEN
      UPDATE public.didar_import_person_rows
         SET classification = 'conflict',
             matched_person_id = _pid,
             match_reason = 'mobile',
             conflict_reason = format('این موبایل قبلاً برای «%s» ثبت شده است', coalesce(_name, 'شخص موجود')),
             apply_note = format('این موبایل قبلاً برای «%s» ثبت شده است', coalesce(_name, 'شخص موجود'))
       WHERE id = _r.id;
      CONTINUE;
    END IF;

    IF _mob = ANY (_seen) THEN
      UPDATE public.didar_import_person_rows
         SET classification = 'conflict',
             matched_person_id = NULL,
             match_reason = 'mobile',
             conflict_reason = 'این موبایل در همین فایل تکراری است',
             apply_note = 'این موبایل در همین فایل تکراری است'
       WHERE id = _r.id;
      CONTINUE;
    END IF;

    _seen := array_append(_seen, _mob);

    UPDATE public.didar_import_person_rows
       SET classification = 'new',
           matched_person_id = NULL,
           match_reason = NULL,
           conflict_reason = NULL,
           apply_note = NULL
     WHERE id = _r.id;
  END LOOP;

  SELECT coalesce(jsonb_object_agg(classification, n), '{}'::jsonb) INTO _stats
    FROM (
      SELECT classification, count(*) AS n
        FROM public.didar_import_person_rows
       WHERE batch_id = p_batch_id
       GROUP BY classification
    ) s;

  UPDATE public.didar_import_batches
     SET stats = _stats
   WHERE id = p_batch_id;

  RETURN _stats;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.didar_classify_person_batch(uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 6. Commit — new + accept only; never Asan code; never update an existing person
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.didar_commit_person_batch(p_batch_id uuid, p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _r        record;
  _mob      text;
  _land     text;
  _nid      text;
  _pid      uuid;
  _exists   uuid;
  _name     text;
  _created  integer := 0;
  _skipped  integer := 0;
  _remaining integer := 0;
  _lim      integer;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.didar_import_batches
     WHERE id = p_batch_id AND status IN ('staged', 'committed')
  ) THEN
    RAISE EXCEPTION 'این دسته در وضعیت قابل ثبت نیست' USING ERRCODE = '22023';
  END IF;

  _lim := COALESCE(NULLIF(p_limit, 0), 500);
  IF _lim < 1 THEN
    _lim := 500;
  END IF;

  FOR _r IN
    SELECT *
      FROM public.didar_import_person_rows
     WHERE batch_id = p_batch_id
       AND classification = 'new'
       AND decision = 'accept'
       AND applied_at IS NULL
     ORDER BY row_number
     LIMIT _lim
  LOOP
    _mob := public.normalize_identifier('mobile_e164', coalesce(_r.mobile_raw, ''), false);
    IF _mob IS NULL THEN
      _skipped := _skipped + 1;
      UPDATE public.didar_import_person_rows
         SET apply_note = format('ردیف %s: شماره موبایل نامعتبر است', _r.row_number)
       WHERE id = _r.id;
      CONTINUE;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('didar-mobile:' || _mob));

    SELECT pi.person_id INTO _exists
      FROM public.person_identifiers pi
     WHERE pi.kind = 'mobile_e164'
       AND pi.value_normalized = _mob
       AND pi.status <> 'revoked'
     LIMIT 1;

    IF _exists IS NOT NULL THEN
      _skipped := _skipped + 1;
      UPDATE public.didar_import_person_rows
         SET classification = 'conflict',
             matched_person_id = _exists,
             match_reason = 'mobile',
             decision = 'skip',
             apply_note = 'این موبایل قبلاً برای «شخص موجود» ثبت شده است'
       WHERE id = _r.id;
      CONTINUE;
    END IF;

    _name := coalesce(
      NULLIF(btrim(coalesce(_r.display_name, '')), ''),
      NULLIF(btrim(coalesce(_r.didar_id, '')), ''),
      'بدون نام'
    );

    INSERT INTO public.persons (kind, display_name, notes, origin, created_by)
    VALUES (
      'individual',
      _name,
      NULLIF(btrim(coalesce(_r.address, '')), ''),
      'didar_import',
      auth.uid()
    )
    RETURNING id INTO _pid;

    INSERT INTO public.person_identifiers (
      person_id, kind, value_raw, value_normalized, status, is_primary, created_by
    ) VALUES (
      _pid, 'mobile_e164', _r.mobile_raw, _mob, 'provisional', true, auth.uid()
    );

    _land := public.normalize_identifier('landline', coalesce(_r.landline_raw, ''), false);
    IF _land IS NOT NULL THEN
      INSERT INTO public.person_identifiers (
        person_id, kind, value_raw, value_normalized, status, is_primary, created_by
      )
      SELECT _pid, 'landline', _r.landline_raw, _land, 'provisional', false, auth.uid()
       WHERE NOT EXISTS (
         SELECT 1 FROM public.person_identifiers pi
          WHERE pi.person_id = _pid AND pi.kind = 'landline'
            AND pi.value_normalized = _land AND pi.status <> 'revoked'
       );
    END IF;

    _nid := public.normalize_identifier('national_id_ir', coalesce(_r.national_id_raw, ''), false);
    IF _nid IS NOT NULL THEN
      INSERT INTO public.person_identifiers (
        person_id, kind, value_raw, value_normalized, status, is_primary, created_by
      )
      SELECT _pid, 'national_id_ir', _r.national_id_raw, _nid, 'provisional', false, auth.uid()
       WHERE NOT EXISTS (
         SELECT 1 FROM public.person_identifiers pi
          WHERE pi.kind = 'national_id_ir' AND pi.value_normalized = _nid
            AND pi.status <> 'revoked'
       );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE person_id = _pid) THEN
      INSERT INTO public.customers (name, phone, address, person_id, didar_contact_id)
      VALUES (
        _name,
        NULLIF(btrim(coalesce(_r.mobile_raw, '')), ''),
        NULLIF(btrim(coalesce(_r.address, '')), ''),
        _pid,
        NULLIF(btrim(coalesce(_r.didar_id, '')), '')
      );
    ELSE
      UPDATE public.customers
         SET didar_contact_id = coalesce(didar_contact_id, NULLIF(btrim(coalesce(_r.didar_id, '')), ''))
       WHERE person_id = _pid;
    END IF;

    UPDATE public.didar_import_person_rows
       SET applied_at = now(),
           matched_person_id = _pid,
           apply_note = NULL
     WHERE id = _r.id;

    _created := _created + 1;
  END LOOP;

  SELECT count(*) INTO _remaining
    FROM public.didar_import_person_rows
   WHERE batch_id = p_batch_id
     AND classification = 'new'
     AND decision = 'accept'
     AND applied_at IS NULL;

  IF _remaining = 0 THEN
    UPDATE public.didar_import_batches
       SET status = 'committed',
           committed_at = coalesce(committed_at, now()),
           committed_by = coalesce(committed_by, auth.uid()),
           stats = coalesce(stats, '{}'::jsonb)
                   || jsonb_build_object('created', coalesce((stats->>'created')::int, 0) + _created,
                                         'skipped', coalesce((stats->>'skipped')::int, 0) + _skipped)
     WHERE id = p_batch_id;
  ELSE
    UPDATE public.didar_import_batches
       SET stats = coalesce(stats, '{}'::jsonb)
                   || jsonb_build_object('created', coalesce((stats->>'created')::int, 0) + _created,
                                         'skipped', coalesce((stats->>'skipped')::int, 0) + _skipped,
                                         'remaining', _remaining)
     WHERE id = p_batch_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    auth.uid(),
    'didar_import',
    p_batch_id::text,
    'didar_persons_imported',
    jsonb_build_object('created', _created, 'skipped', _skipped, 'remaining', _remaining)
  );

  RETURN jsonb_build_object(
    'created', _created,
    'skipped', _skipped,
    'remaining', _remaining
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.didar_commit_person_batch(uuid, integer) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 7. Module seed — every role; view/create only admin + accountant (D1)
--------------------------------------------------------------------------------
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name, 'didar-import',
       r.role_name IN ('admin','accountant'),
       r.role_name IN ('admin','accountant'),
       r.role_name IN ('admin','accountant'),
       false,
       r.role_name IN ('admin','accountant'),
       r.role_name IN ('admin','accountant'),
       false
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'didar-import'
 );

DO $chk$
DECLARE n integer; roles integer;
BEGIN
  SELECT count(DISTINCT role_name) INTO roles FROM public.role_permissions;
  SELECT count(*) INTO n FROM public.role_permissions WHERE module = 'didar-import';
  IF n <> roles THEN
    RAISE EXCEPTION 'didar-import must have a row for all % roles, found %', roles, n;
  END IF;

  SELECT count(*) INTO n FROM public.role_permissions
   WHERE module = 'didar-import' AND can_view AND role_name NOT IN ('admin','accountant');
  IF n <> 0 THEN
    RAISE EXCEPTION '% non-privileged roles can view didar-import', n;
  END IF;
END
$chk$;

INSERT INTO supabase_migrations.schema_migrations (version, inserted_at)
SELECT '20260923140000', now()
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260923140000'
 );
