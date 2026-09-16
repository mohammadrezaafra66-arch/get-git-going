-- 548 E4: assignee steal author_id probe — ALL inside one txn then ROLLBACK.
-- Expect after 548: assignee_can_steal_author=f (trigger blocks).
BEGIN;

CREATE TEMP TABLE _s1_ctx ON COMMIT DROP AS
SELECT
  (SELECT user_id FROM public.user_roles WHERE role::text = 'sales' ORDER BY user_id LIMIT 1) AS sales_a,
  (SELECT user_id FROM public.user_roles WHERE role::text = 'sales' ORDER BY user_id OFFSET 1 LIMIT 1) AS sales_b,
  (SELECT id FROM public.persons LIMIT 1) AS person_id,
  (SELECT id FROM public.customers LIMIT 1) AS customer_id;

DO $$
DECLARE
  a uuid; b uuid; p uuid; c uuid;
  rid uuid;
  author_after uuid;
  escalated boolean := false;
  steal_err text := NULL;
  del_priv boolean;
BEGIN
  SELECT sales_a, sales_b, person_id, customer_id INTO a, b, p, c FROM _s1_ctx;
  IF a IS NULL OR b IS NULL OR p IS NULL OR a = b THEN
    RAISE EXCEPTION '548 probe precondition failed: sales_a=% sales_b=% person=%', a, b, p;
  END IF;

  RAISE NOTICE '548 ctx sales_a=% sales_b=% person=%', a, b, p;

  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.sales_interactions (
    person_id, customer_id, kind, body, author_id, salesperson_id, status, source
  ) VALUES (
    p, c, 'note', '548-steal-probe', a, NULL, 'open', 'manual'
  ) RETURNING id INTO rid;

  UPDATE public.sales_interactions SET salesperson_id = b WHERE id = rid;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', b::text, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    UPDATE public.sales_interactions SET author_id = b WHERE id = rid;
    SELECT author_id INTO author_after FROM public.sales_interactions WHERE id = rid;
    escalated := (author_after = b);
  EXCEPTION WHEN OTHERS THEN
    steal_err := SQLERRM;
    escalated := false;
    SELECT author_id INTO author_after FROM public.sales_interactions WHERE id = rid;
  END;

  RAISE NOTICE 'S1 assignee_can_steal_author=% author_after=% steal_err=%',
    escalated, author_after, steal_err;

  IF author_after IS DISTINCT FROM a THEN
    RAISE EXCEPTION '548: author_id changed despite lock (after=%)', author_after;
  END IF;
  IF escalated THEN
    RAISE EXCEPTION '548: assignee_can_steal_author still true';
  END IF;

  RESET ROLE;
  SELECT has_table_privilege('authenticated', 'public.sales_interactions', 'DELETE')
    INTO del_priv;
  RAISE NOTICE '548 authenticated_has_delete=%', del_priv;
END $$;

ROLLBACK;
