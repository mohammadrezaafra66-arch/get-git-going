-- S1 RE-REVIEW independent C6 probe after migration 548.
-- ALL inside one txn then ROLLBACK. Expect assignee_can_steal_author=f.
SET client_min_messages TO notice;

BEGIN;

CREATE TEMP TABLE _s1_rr_ctx ON COMMIT DROP AS
SELECT
  (SELECT user_id FROM public.user_roles WHERE role::text = 'sales' ORDER BY user_id LIMIT 1) AS sales_a,
  (SELECT user_id FROM public.user_roles WHERE role::text = 'sales' ORDER BY user_id OFFSET 1 LIMIT 1) AS sales_b,
  (SELECT id FROM public.persons LIMIT 1) AS person_id,
  (SELECT id FROM public.customers LIMIT 1) AS customer_id;

CREATE TEMP TABLE _s1_rr_result (
  assignee_can_steal_author boolean,
  author_after uuid,
  author_expected uuid,
  steal_err text,
  authenticated_has_delete boolean
) ON COMMIT DROP;

DO $$
DECLARE
  a uuid; b uuid; p uuid; c uuid;
  rid uuid;
  author_after uuid;
  escalated boolean := false;
  steal_err text := NULL;
  del_priv boolean;
BEGIN
  SELECT sales_a, sales_b, person_id, customer_id INTO a, b, p, c FROM _s1_rr_ctx;
  IF a IS NULL OR b IS NULL OR p IS NULL OR a = b THEN
    RAISE EXCEPTION 'S1 RR probe precondition failed: sales_a=% sales_b=% person=%', a, b, p;
  END IF;

  RAISE NOTICE 'S1 RR ctx sales_a=% sales_b=% person=%', a, b, p;

  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.sales_interactions (
    person_id, customer_id, kind, body, author_id, salesperson_id, status, source
  ) VALUES (
    p, c, 'note', 's1-rr-548-steal-probe', a, NULL, 'open', 'manual'
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

  RESET ROLE;
  SELECT has_table_privilege('authenticated', 'public.sales_interactions', 'DELETE')
    INTO del_priv;

  INSERT INTO _s1_rr_result
  VALUES (escalated, author_after, a, steal_err, del_priv);

  IF author_after IS DISTINCT FROM a THEN
    RAISE EXCEPTION 'S1 RR: author_id changed despite lock (after=%)', author_after;
  END IF;
  IF escalated THEN
    RAISE EXCEPTION 'S1 RR: assignee_can_steal_author still true';
  END IF;
END $$;

SELECT * FROM _s1_rr_result;

ROLLBACK;
