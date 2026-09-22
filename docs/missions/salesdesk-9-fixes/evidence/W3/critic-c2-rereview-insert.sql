BEGIN;
DO $$
DECLARE
  v_person uuid; v_author uuid;
BEGIN
  SELECT id INTO v_person FROM public.persons LIMIT 1;
  SELECT id INTO v_author FROM public.profiles LIMIT 1;
  BEGIN
    INSERT INTO public.sales_interactions (
      id, kind, status, person_id, author_id, salesperson_id, title, body
    ) VALUES (
      gen_random_uuid(), 'request', 'open', v_person, v_author, NULL,
      '[CRITIC-C2-RR] insert', 'probe'
    );
    RAISE EXCEPTION 'EXPECTED_FAIL_GOT_OK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%RESPONSIBLE_REQUIRED%' THEN
      RAISE NOTICE 'C2_INSERT_OK %', SQLERRM;
    ELSE
      RAISE;
    END IF;
  END;
END $$;
ROLLBACK;