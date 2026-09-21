-- Before C2 apply: can INSERT request with salesperson_id NULL?
BEGIN;
DO $probe$
DECLARE
  v_person uuid;
  v_author uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_person FROM public.persons LIMIT 1;
  SELECT id INTO v_author FROM public.profiles LIMIT 1;
  IF v_person IS NULL OR v_author IS NULL THEN
    RAISE EXCEPTION 'probe setup missing person/profile';
  END IF;

  INSERT INTO public.sales_interactions (
    person_id, kind, body, author_id, salesperson_id, status, source
  ) VALUES (
    v_person, 'request', 'c2-before-probe', v_author, NULL, 'open', 'manual'
  ) RETURNING id INTO v_id;

  RAISE NOTICE 'C2_BEFORE_INSERT_OK id=%', v_id;
END
$probe$;
ROLLBACK;
