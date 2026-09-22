SET client_encoding = 'UTF8';

-- =============================================================================
-- 557 — Paginated person_merge_candidates_overview
-- =============================================================================
-- Large pending queues (hundreds of pairs) make the merge review page hang when
-- every side's identifiers/aliases/contexts are loaded at once. Limit/offset
-- keeps each response small; UI pages 20 / 25 / 50.
-- =============================================================================

DROP FUNCTION IF EXISTS public.person_merge_candidates_overview();

CREATE OR REPLACE FUNCTION public.person_merge_candidates_overview(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid    uuid := auth.uid();
  _limit  integer;
  _offset integer;
  _total  integer := 0;
  _items  jsonb := '[]'::jsonb;
  _cand   record;
  _a      jsonb;
  _b      jsonb;
  _block  text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'مشاهدهٔ صف ادغام فقط برای مدیر سیستم یا مدیر مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 25), 50));
  _offset := GREATEST(0, COALESCE(p_offset, 0));

  SELECT count(*)::integer
    INTO _total
  FROM public.person_merge_candidates c
  JOIN public.persons pa ON pa.id = c.person_id_a
  JOIN public.persons pb ON pb.id = c.person_id_b
  WHERE c.status = 'pending'
    AND pa.is_active AND pb.is_active;

  FOR _cand IN
    SELECT c.id, c.person_id_a, c.person_id_b, c.reason, c.detail, c.created_at
    FROM public.person_merge_candidates c
    JOIN public.persons pa ON pa.id = c.person_id_a
    JOIN public.persons pb ON pb.id = c.person_id_b
    WHERE c.status = 'pending'
      AND pa.is_active AND pb.is_active
    ORDER BY c.created_at
    LIMIT _limit
    OFFSET _offset
  LOOP
    _a := public._person_merge_side(_cand.person_id_a);
    _b := public._person_merge_side(_cand.person_id_b);

    _block := NULL;
    IF (_a->>'has_customer')::boolean AND (_b->>'has_customer')::boolean THEN
      _block := 'both_customer';
    ELSIF (_a->>'has_supplier')::boolean AND (_b->>'has_supplier')::boolean THEN
      _block := 'both_supplier';
    END IF;

    _items := _items || jsonb_build_object(
      'candidate_id',   _cand.id,
      'reason',         _cand.reason,
      'detail',         _cand.detail,
      'created_at',     _cand.created_at,
      'a',              _a,
      'b',              _b,
      'blocked_reason', _block
    );
  END LOOP;

  RETURN jsonb_build_object(
    'items',  _items,
    'total',  _total,
    'limit',  _limit,
    'offset', _offset
  );
END;
$function$;

COMMENT ON FUNCTION public.person_merge_candidates_overview(integer, integer) IS
  'Phase 8.1 + 557. Paginated pending merge pairs with both sides identity evidence. p_limit capped at 50. Admin/manager only.';

REVOKE ALL ON FUNCTION public.person_merge_candidates_overview(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_merge_candidates_overview(integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
