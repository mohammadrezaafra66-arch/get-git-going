BEGIN;
CREATE TEMP TABLE _s1_ctx ON COMMIT DROP AS
SELECT
  (SELECT user_id FROM public.user_roles WHERE role::text = 'sales' ORDER BY user_id LIMIT 1) AS sales_a,
  (SELECT user_id FROM public.user_roles WHERE role::text = 'sales' ORDER BY user_id OFFSET 1 LIMIT 1) AS sales_b,
  (SELECT id FROM public.persons LIMIT 1) AS person_id,
  (SELECT id FROM public.customers LIMIT 1) AS customer_id;
DO $$
DECLARE a uuid; b uuid; p uuid; c uuid; rid uuid; author_after uuid; escalated boolean := false; steal_err text := NULL;
BEGIN
  SELECT sales_a, sales_b, person_id, customer_id INTO a, b, p, c FROM _s1_ctx;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  INSERT INTO public.sales_interactions (person_id, customer_id, kind, body, author_id, salesperson_id, status, source)
  VALUES (p, c, 'note', '548-down-steal', a, NULL, 'open', 'manual') RETURNING id INTO rid;
  UPDATE public.sales_interactions SET salesperson_id = b WHERE id = rid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  BEGIN
    UPDATE public.sales_interactions SET author_id = b WHERE id = rid;
    SELECT author_id INTO author_after FROM public.sales_interactions WHERE id = rid;
    escalated := (author_after = b);
  EXCEPTION WHEN OTHERS THEN
    steal_err := SQLERRM; escalated := false;
    SELECT author_id INTO author_after FROM public.sales_interactions WHERE id = rid;
  END;
  RAISE NOTICE 'AFTER_DOWN assignee_can_steal_author=% author_after=% steal_err=%', escalated, author_after, steal_err;
END $$;
ROLLBACK;
