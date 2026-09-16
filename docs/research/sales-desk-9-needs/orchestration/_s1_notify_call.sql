BEGIN;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}',
    true
  );
  BEGIN
    PERFORM public.notify_sales_interaction_assigned();
    RAISE NOTICE 'S1 direct_notify_call_ok=true';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'S1 direct_notify_call_ok=false err=%', SQLERRM;
  END;
END $$;
ROLLBACK;
