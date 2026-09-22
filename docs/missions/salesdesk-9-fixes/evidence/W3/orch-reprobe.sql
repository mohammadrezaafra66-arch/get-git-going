-- Orchestrator independent re-probe (B-7)
\echo === versions ===
SELECT version FROM supabase_migrations.schema_migrations
 WHERE version LIKE '2026092204%' ORDER BY 1;

\echo === seed hex ===
SELECT encode(convert_to(title, 'UTF8'), 'hex') AS title_hex
  FROM public.deal_lost_reasons;

\echo === notify title pos ===
SELECT position(
  convert_from(decode('d985d98620d985d8b3d8a6d988d98420d8b4d8afd985', 'hex'), 'UTF8')
  IN pg_get_functiondef('public.notify_sales_interaction_assigned()'::regprocedure)
) AS title_pos;

\echo === columns ===
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sales_interactions'
   AND column_name IN ('won_at','lost_at','lost_reason_id','lost_reason_note','lost_reason_other')
 ORDER BY 1;

SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sales_quotes' AND column_name='interaction_id';

\echo === items table ===
SELECT to_regclass('public.sales_interaction_items') AS items_tbl;

\echo === responsible trigger fail ===
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
      '[TEST-9FIX] orch-c2', 'probe'
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
