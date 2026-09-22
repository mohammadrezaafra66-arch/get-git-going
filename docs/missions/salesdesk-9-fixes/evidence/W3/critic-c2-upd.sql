BEGIN;
DO $$
DECLARE
  v_person uuid; v_author uuid; v_id uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_person FROM public.persons LIMIT 1;
  SELECT id INTO v_author FROM public.profiles LIMIT 1;
  INSERT INTO public.sales_interactions (id, kind, status, person_id, author_id, salesperson_id, title, body)
  VALUES (v_id, 'request', 'open', v_person, v_author, v_author, '[CRITIC] c2-upd', 'x');
  BEGIN
    UPDATE public.sales_interactions SET salesperson_id = NULL WHERE id = v_id;
    RAISE EXCEPTION 'EXPECTED_FAIL_GOT_OK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%RESPONSIBLE_REQUIRED%' THEN RAISE NOTICE 'C2_UPD_NULL_OK %', SQLERRM;
    ELSE RAISE; END IF;
  END;
END $$;
ROLLBACK;