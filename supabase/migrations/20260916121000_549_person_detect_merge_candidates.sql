SET client_encoding='UTF8';

-- 549 — Continuous person-merge candidate detection + dismiss discipline.
--
-- Migration 234 seeded person_merge_candidates once from shared identifiers.
-- After Phase 8 the queue stayed empty. This migration:
--   1. person_detect_merge_candidates() — refill from shared identifiers and
--      same normalized display_name (stronger when either side lacks mobile/Asan)
--   2. Triggers on persons / person_identifiers to keep the queue warm
--   3. person_merge_candidates_pending_count() for nav badge
--   4. person_merge_dismiss requires a non-empty reason for strong pairs
--
-- No auto-merge. Humans still decide on /persons/merge.

--------------------------------------------------------------------------------
-- 1. Detector
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_detect_merge_candidates(
  p_person_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _inserted int := 0;
  _n int;
BEGIN
  -- Shared non-revoked identifiers across two active (or any) persons.
  WITH pairs AS (
    SELECT
      LEAST(x.person_id, y.person_id) AS person_id_a,
      GREATEST(x.person_id, y.person_id) AS person_id_b,
      'shared_identifier'::text AS reason,
      ('شناسهٔ مشترک: ' || x.kind || ' = ' || x.value_normalized) AS detail
    FROM public.person_identifiers x
    JOIN public.person_identifiers y
      ON y.kind = x.kind
     AND y.value_normalized = x.value_normalized
     AND y.person_id <> x.person_id
     AND y.status <> 'revoked'
    WHERE x.status <> 'revoked'
      AND x.person_id < y.person_id
      AND (p_person_id IS NULL OR x.person_id = p_person_id OR y.person_id = p_person_id)
  )
  INSERT INTO public.person_merge_candidates (person_id_a, person_id_b, reason, detail)
  SELECT person_id_a, person_id_b, reason, detail FROM pairs
  ON CONFLICT (person_id_a, person_id_b) DO UPDATE
    SET reason = EXCLUDED.reason,
        detail = EXCLUDED.detail,
        status = CASE
                   WHEN public.person_merge_candidates.status IN ('merged') THEN public.person_merge_candidates.status
                   WHEN public.person_merge_candidates.status = 'dismissed'
                        AND public.person_merge_candidates.reason = EXCLUDED.reason
                     THEN public.person_merge_candidates.status
                   ELSE 'pending'
                 END,
        updated_at = now()
    WHERE public.person_merge_candidates.status = 'pending'
       OR (
            public.person_merge_candidates.status = 'dismissed'
            AND public.person_merge_candidates.reason IS DISTINCT FROM EXCLUDED.reason
          );
  GET DIAGNOSTICS _n = ROW_COUNT;
  _inserted := _inserted + _n;

  -- Same normalized display_name between two ACTIVE persons.
  WITH named AS (
    SELECT
      p.id,
      public.normalize_fa_text(p.display_name) AS nname,
      EXISTS (
        SELECT 1 FROM public.person_identifiers i
        WHERE i.person_id = p.id AND i.status <> 'revoked'
          AND i.kind IN ('mobile_e164', 'asan_person_code')
      ) AS has_hard_id
    FROM public.persons p
    WHERE p.is_active
      AND p.display_name IS NOT NULL
      AND btrim(p.display_name) <> ''
      AND public.normalize_fa_text(p.display_name) <> ''
  ),
  pairs AS (
    SELECT
      LEAST(a.id, b.id) AS person_id_a,
      GREATEST(a.id, b.id) AS person_id_b,
      CASE
        WHEN NOT a.has_hard_id OR NOT b.has_hard_id THEN 'same_name_incomplete'
        ELSE 'same_name'
      END AS reason,
      CASE
        WHEN NOT a.has_hard_id OR NOT b.has_hard_id THEN
          'نام نرمال یکسان («' || a.nname || '») و حداقل یکی بدون موبایل/کد آسان'
        ELSE
          'نام نرمال یکسان («' || a.nname || '») — بررسی دستی'
      END AS detail
    FROM named a
    JOIN named b ON b.nname = a.nname AND b.id > a.id
    WHERE p_person_id IS NULL OR a.id = p_person_id OR b.id = p_person_id
  )
  INSERT INTO public.person_merge_candidates (person_id_a, person_id_b, reason, detail)
  SELECT person_id_a, person_id_b, reason, detail FROM pairs
  ON CONFLICT (person_id_a, person_id_b) DO UPDATE
    SET reason = CASE
                   WHEN public.person_merge_candidates.reason = 'shared_identifier' THEN public.person_merge_candidates.reason
                   ELSE EXCLUDED.reason
                 END,
        detail = CASE
                   WHEN public.person_merge_candidates.reason = 'shared_identifier' THEN public.person_merge_candidates.detail
                   ELSE EXCLUDED.detail
                 END,
        status = CASE
                   WHEN public.person_merge_candidates.status = 'merged' THEN 'merged'
                   WHEN public.person_merge_candidates.reason = 'shared_identifier' THEN public.person_merge_candidates.status
                   WHEN public.person_merge_candidates.status = 'dismissed'
                        AND public.person_merge_candidates.reason = EXCLUDED.reason
                     THEN 'dismissed'
                   ELSE 'pending'
                 END,
        updated_at = now()
    WHERE public.person_merge_candidates.status IN ('pending', 'dismissed')
      AND public.person_merge_candidates.reason IS DISTINCT FROM 'shared_identifier';
  GET DIAGNOSTICS _n = ROW_COUNT;
  _inserted := _inserted + _n;

  RETURN jsonb_build_object(
    'touched', _inserted,
    'pending', (SELECT count(*) FROM public.person_merge_candidates WHERE status = 'pending')
  );
END;
$function$;

COMMENT ON FUNCTION public.person_detect_merge_candidates(uuid) IS
  'Refills person_merge_candidates from shared identifiers and same normalized names. p_person_id scopes to pairs involving that person; NULL = full scan. Never merges.';

REVOKE ALL ON FUNCTION public.person_detect_merge_candidates(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.person_detect_merge_candidates(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.person_detect_merge_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.person_detect_merge_candidates(uuid) TO service_role;

--------------------------------------------------------------------------------
-- 2. Pending count (nav badge)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_merge_candidates_pending_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
  FROM public.person_merge_candidates
  WHERE status = 'pending';
$function$;

COMMENT ON FUNCTION public.person_merge_candidates_pending_count() IS
  'Count of pending person_merge_candidates rows for admin/manager nav badge.';

REVOKE ALL ON FUNCTION public.person_merge_candidates_pending_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.person_merge_candidates_pending_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.person_merge_candidates_pending_count() TO authenticated;

--------------------------------------------------------------------------------
-- 3. Triggers — keep queue warm without a cron dependency
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_person_detect_merge_candidates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _pid uuid;
BEGIN
  IF TG_TABLE_NAME = 'persons' THEN
    _pid := NEW.id;
  ELSE
    _pid := NEW.person_id;
  END IF;
  PERFORM public.person_detect_merge_candidates(_pid);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_persons_detect_merge ON public.persons;
CREATE TRIGGER trg_persons_detect_merge
  AFTER INSERT OR UPDATE OF display_name, is_active ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_person_detect_merge_candidates();

DROP TRIGGER IF EXISTS trg_person_identifiers_detect_merge ON public.person_identifiers;
CREATE TRIGGER trg_person_identifiers_detect_merge
  AFTER INSERT OR UPDATE OF kind, value_normalized, status, person_id ON public.person_identifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_person_detect_merge_candidates();

--------------------------------------------------------------------------------
-- 4. Dismiss — strong pairs need an explicit reason
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_merge_dismiss(p_candidate_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.person_merge_candidates%ROWTYPE;
  _reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'رد کردن پیشنهاد ادغام فقط برای مدیر سیستم یا مدیر مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.person_merge_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'پیشنهاد ادغام پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF _row.status <> 'pending' THEN
    RAISE EXCEPTION 'این پیشنهاد قبلاً بررسی شده است (وضعیت فعلی: %).', _row.status
      USING ERRCODE = '22023';
  END IF;

  -- Strong suspicions may not be waved away without a written reason.
  IF _row.reason IN ('shared_identifier', 'same_name_incomplete') AND _reason IS NULL THEN
    RAISE EXCEPTION
      'برای رد این جفت (دلیل: %) نوشتن توضیح الزامی است.'
      , _row.reason
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.person_merge_candidates
  SET status      = 'dismissed',
      detail      = COALESCE(detail, '')
                    || CASE WHEN _reason IS NULL
                            THEN '' ELSE E'\n' || 'دلیل رد: ' || _reason END,
      reviewed_by = _uid,
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = p_candidate_id;

  RETURN jsonb_build_object(
    'candidate_id', p_candidate_id,
    'status',       'dismissed'
  );
END;
$function$;

COMMENT ON FUNCTION public.person_merge_dismiss(uuid, text) IS
  'Marks a merge candidate dismissed. Migration 549: shared_identifier / same_name_incomplete require a non-empty reason.';

--------------------------------------------------------------------------------
-- 5. Initial fill + self-check
--------------------------------------------------------------------------------
DO $$
DECLARE
  _res jsonb;
  _pending int;
BEGIN
  _res := public.person_detect_merge_candidates(NULL);
  _pending := (_res->>'pending')::int;
  RAISE NOTICE '549 OK: detect touched=% pending=%', _res->>'touched', _pending;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'person_merge_candidates_pending_count'
  ) THEN
    RAISE EXCEPTION '549: pending_count function missing';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
