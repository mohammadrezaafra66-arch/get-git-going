
-- 1) Restrict sale_price_types reads to authenticated users
DROP POLICY IF EXISTS sale_price_types_public_read ON public.sale_price_types;
CREATE POLICY sale_price_types_auth_read
  ON public.sale_price_types
  FOR SELECT
  TO authenticated
  USING (true);

-- 2) Server-side quiz scoring
-- Remove client insert path
DROP POLICY IF EXISTS aqa_insert_own ON public.academy_quiz_attempts;

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
  _quiz_id uuid,
  _answers jsonb
)
RETURNS TABLE(score integer, passed boolean, attempt_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _passing integer;
  _total integer := 0;
  _correct integer := 0;
  _score integer := 0;
  _passed boolean := false;
  _attempt_id uuid;
  r record;
  _ans int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT passing_score INTO _passing FROM public.academy_quizzes WHERE id = _quiz_id;
  IF _passing IS NULL THEN
    RAISE EXCEPTION 'quiz not found';
  END IF;

  FOR r IN
    SELECT id, correct_value FROM public.academy_quiz_questions WHERE quiz_id = _quiz_id
  LOOP
    _total := _total + 1;
    BEGIN
      _ans := (_answers ->> r.id::text)::int;
    EXCEPTION WHEN others THEN
      _ans := NULL;
    END;
    IF _ans IS NOT NULL AND _ans = r.correct_value THEN
      _correct := _correct + 1;
    END IF;
  END LOOP;

  IF _total > 0 THEN
    _score := round((_correct::numeric / _total::numeric) * 100);
  END IF;
  _passed := _score >= _passing;

  INSERT INTO public.academy_quiz_attempts (user_id, quiz_id, score, passed, answers)
  VALUES (_uid, _quiz_id, _score, _passed, _answers)
  RETURNING id INTO _attempt_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'academy_quiz_attempt',
    'academy_quiz',
    _quiz_id,
    _uid,
    jsonb_build_object('score', _score, 'passed', _passed, 'total', _total, 'correct', _correct)
  );

  RETURN QUERY SELECT _score, _passed, _attempt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_quiz_attempt(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, jsonb) TO authenticated;
