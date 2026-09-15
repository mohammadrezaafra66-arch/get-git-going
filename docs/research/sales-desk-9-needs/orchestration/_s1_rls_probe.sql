-- S1 RLS behavioral probes — ALL inside one transaction then ROLLBACK.
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
  seen int;
  nq_before int;
  nq_after int;
  author_after uuid;
  escalated boolean := false;
  cross_read int;
BEGIN
  SELECT sales_a, sales_b, person_id, customer_id INTO a, b, p, c FROM _s1_ctx;
  IF a IS NULL OR p IS NULL THEN
    RAISE EXCEPTION 'S1 probe precondition failed: sales_a=% person=%', a, p;
  END IF;
  IF b IS NULL THEN
    RAISE NOTICE 'S1 WARN: only one sales user; cross/escalation limited';
    b := a;
  END IF;

  RAISE NOTICE 'S1 ctx sales_a=% sales_b=% person=% customer=%', a, b, p, c;

  -- Become authenticated JWT subject sales_a
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.sales_interactions (
    person_id, customer_id, kind, body, author_id, salesperson_id, status, source
  ) VALUES (
    p, c, 'note', 's1-probe-own', a, NULL, 'open', 'manual'
  ) RETURNING id INTO rid;
  RAISE NOTICE 'S1 insert_own ok id=%', rid;

  -- Cross-read as sales_b
  IF b IS DISTINCT FROM a THEN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', b::text, 'role', 'authenticated')::text,
      true
    );
    SELECT count(*) INTO cross_read FROM public.sales_interactions WHERE id = rid;
    RAISE NOTICE 'S1 cross_read_other_author count=%', cross_read;
  ELSE
    cross_read := -1;
    RAISE NOTICE 'S1 cross_read skipped';
  END IF;

  -- Assignee steals author_id
  IF b IS DISTINCT FROM a THEN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', a::text, 'role', 'authenticated')::text,
      true
    );
    UPDATE public.sales_interactions SET salesperson_id = b WHERE id = rid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', b::text, 'role', 'authenticated')::text,
      true
    );
    UPDATE public.sales_interactions SET author_id = b WHERE id = rid;
    SELECT author_id INTO author_after FROM public.sales_interactions WHERE id = rid;
    escalated := (author_after = b);
    RAISE NOTICE 'S1 assignee_can_steal_author=% author_after=%', escalated, author_after;
  END IF;

  -- DELETE as current jwt user who can see row
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text,
    true
  );
  -- ensure a can UPDATE/see: set both to a via RESET below if needed
  RESET ROLE;
  UPDATE public.sales_interactions
     SET author_id = a, salesperson_id = a
   WHERE id = rid;

  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text,
    true
  );
  DELETE FROM public.sales_interactions WHERE id = rid;
  GET DIAGNOSTICS seen = ROW_COUNT;
  RAISE NOTICE 'S1 delete_as_author row_count=%', seen;

  -- Direct notification_queue INSERT as authenticated
  BEGIN
    INSERT INTO public.notification_queue (
      user_id, title, body, type, reference_type, reference_id
    ) VALUES (
      a, 's1-forge', 'forge', 'sales_interaction_assigned', 'sales_interaction', rid
    );
    RAISE NOTICE 'S1 direct_nq_insert_ok=true';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'S1 direct_nq_insert_ok=false err=%', SQLERRM;
  END;

  -- Forge author_id on INSERT
  BEGIN
    INSERT INTO public.sales_interactions (
      person_id, kind, body, author_id, status, source
    ) VALUES (
      p, 'note', 's1-forge-author', CASE WHEN b IS DISTINCT FROM a THEN b ELSE '00000000-0000-4000-8000-000000000099'::uuid END,
      'open', 'manual'
    );
    RAISE NOTICE 'S1 forge_author_insert_ok=true';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'S1 forge_author_insert_ok=false err=%', SQLERRM;
  END;

  -- Assign notify (count as table owner after RESET)
  IF b IS DISTINCT FROM a THEN
    RESET ROLE;
    SELECT count(*) INTO nq_before
      FROM public.notification_queue
     WHERE type = 'sales_interaction_assigned' AND reference_id = rid;

    SET LOCAL ROLE authenticated;
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', a::text, 'role', 'authenticated')::text,
      true
    );
    UPDATE public.sales_interactions SET salesperson_id = b WHERE id = rid;

    RESET ROLE;
    SELECT count(*) INTO nq_after
      FROM public.notification_queue
     WHERE type = 'sales_interaction_assigned' AND reference_id = rid;
    RAISE NOTICE 'S1 assign_notify_delta=%', nq_after - nq_before;
  END IF;

  -- RPC create forces author_id=auth.uid even if... (RPC has no author param) — call and check
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text,
    true
  );
  rid := public.sales_interaction_create(p, 'note', 's1-rpc', NULL, c, b, NULL, NULL, 'manual', 'open');
  RESET ROLE;
  SELECT author_id INTO author_after FROM public.sales_interactions WHERE id = rid;
  RAISE NOTICE 'S1 rpc_create author_id=% expect=% match=%', author_after, a, (author_after = a);

END $$;

ROLLBACK;
