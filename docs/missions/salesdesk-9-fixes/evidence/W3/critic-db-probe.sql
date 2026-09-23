-- W3 critic independent DB spot-check (read + rolled-back probes only)
\echo === mig_versions_565_571 ===
SELECT version FROM supabase_migrations.schema_migrations
 WHERE version BETWEEN '20260922040000' AND '20260922040600'
 ORDER BY 1;

\echo === status_check_def ===
SELECT pg_get_constraintdef(oid) AS status_check
  FROM pg_constraint
 WHERE conrelid = 'public.sales_interactions'::regclass
   AND conname = 'sales_interactions_status_check';

\echo === seed_sayer_hex ===
SELECT encode(convert_to(title, 'UTF8'), 'hex') AS title_hex, is_active
  FROM public.deal_lost_reasons
 WHERE title = convert_from(decode('d8b3d8a7db8cd8b1', 'hex'), 'UTF8');

\echo === notify_title_pos ===
SELECT position(
  convert_from(decode('d985d98620d985d8b3d8a6d988d98420d8b4d8afd985', 'hex'), 'UTF8')
  IN pg_get_functiondef('public.notify_sales_interaction_assigned()'::regprocedure)
) AS title_pos;

\echo === columns_and_tables ===
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sales_interactions'
   AND column_name IN ('won_at','lost_at','lost_reason_id','lost_reason_note','lost_reason_other','salesperson_id')
 ORDER BY 1;
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sales_quotes' AND column_name='interaction_id';
SELECT to_regclass('public.sales_interaction_items') AS items_tbl;
SELECT to_regclass('public.deal_lost_reasons') AS lost_reasons_tbl;

\echo === role_permissions_w3 ===
SELECT module, role_name, can_view, can_create, can_update, can_export
  FROM public.role_permissions
 WHERE module IN ('sales-deals-for-others','deal-lost-reasons','deal-lost-report')
 ORDER BY module, role_name;

\echo === still_null_request ===
SELECT count(*) AS still_null_request
  FROM public.sales_interactions
 WHERE kind = 'request' AND salesperson_id IS NULL;

\echo === C2_INSERT_null_salesperson ===
BEGIN;
DO $$
DECLARE
  v_person uuid;
  v_author uuid;
BEGIN
  SELECT id INTO v_person FROM public.persons LIMIT 1;
  SELECT id INTO v_author FROM public.profiles LIMIT 1;
  BEGIN
    INSERT INTO public.sales_interactions (
      id, kind, status, person_id, author_id, salesperson_id, title, body
    ) VALUES (
      gen_random_uuid(), 'request', 'open', v_person, v_author, NULL,
      '[CRITIC-W3] c2', 'probe'
    );
    RAISE EXCEPTION 'EXPECTED_FAIL_GOT_OK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%RESPONSIBLE_REQUIRED%' THEN
      RAISE NOTICE 'C2_OK %', SQLERRM;
    ELSE
      RAISE;
    END IF;
  END;
END $$;
ROLLBACK;

\echo === C8_lost_without_reason ===
BEGIN;
DO $$
DECLARE
  v_person uuid;
  v_author uuid;
  v_id uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_person FROM public.persons LIMIT 1;
  SELECT id INTO v_author FROM public.profiles LIMIT 1;
  INSERT INTO public.sales_interactions (
    id, kind, status, person_id, author_id, salesperson_id, title, body
  ) VALUES (
    v_id, 'request', 'open', v_person, v_author, v_author,
    '[CRITIC-W3] c8', 'probe'
  );
  BEGIN
    UPDATE public.sales_interactions SET status = 'lost' WHERE id = v_id;
    RAISE EXCEPTION 'EXPECTED_FAIL_GOT_OK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%LOST_REASON_REQUIRED%' THEN
      RAISE NOTICE 'C8_OK %', SQLERRM;
    ELSE
      RAISE;
    END IF;
  END;
END $$;
ROLLBACK;

\echo === compute_employee_score_unchanged_probe ===
SELECT proname, length(prosrc) AS src_len
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'compute_employee_score';
