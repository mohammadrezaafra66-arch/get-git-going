SET client_encoding='UTF8';

-- 448 (B-3, B-4, B-5, B-5b): drop four functions whose successors are the live path.
--
--   B-3  create_dynamic_scoring_parameter(text,text,numeric,text)
--        superseded by create_dynamic_scoring_parameter_v2(text,text,text,numeric,text),
--        wired at src/routes/_app.sales.credit-rules.tsx:218.
--   B-4  get_product_sale_price(uuid,uuid)
--        superseded by the product_computed_prices path.
--   B-5  get_workflow_setting(text)
--        superseded by the plural get_workflow_settings(), wired at
--        src/hooks/settings/useWorkflowSettings.ts:35.
--   B-5b handle_new_user()
--        attached to NOTHING. auth.users carries exactly two triggers
--        (on_auth_user_created, on_auth_user_created_afrakala) and BOTH run
--        handle_new_auth_user(). Measured: auth_users=41 profiles=41 without=0.
--        Attaching this one would be actively harmful: its INSERT INTO
--        public.profiles has no ON CONFLICT, so it would raise duplicate-key on
--        every signup, and it grants a hardcoded 'viewer' role that the real
--        trigger deliberately withholds from pending users.
--
-- Zero-reference verified 2026-09-05 across all four frontend call idioms and
-- every database catalogue in every schema. No CASCADE: a missed dependency
-- aborts the migration instead of being destroyed with the function.

-- B-5b guard: refuse to drop handle_new_user if anything ever attached it.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE p.proname = 'handle_new_user';
  IF n <> 0 THEN
    RAISE EXCEPTION '448: handle_new_user is attached to % trigger(s); refusing to drop', n;
  END IF;
END $$;

DROP FUNCTION public.create_dynamic_scoring_parameter(text, text, numeric, text);
DROP FUNCTION public.get_product_sale_price(uuid, uuid);
DROP FUNCTION public.get_workflow_setting(text);
DROP FUNCTION public.handle_new_user();

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname IN
    ('create_dynamic_scoring_parameter','get_product_sale_price',
     'get_workflow_setting','handle_new_user');
  IF n <> 0 THEN RAISE EXCEPTION '448: expected 0 remaining, found %', n; END IF;

  -- successors must survive
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname IN
    ('create_dynamic_scoring_parameter_v2','get_workflow_settings','handle_new_auth_user');
  IF n <> 3 THEN RAISE EXCEPTION '448: successors missing, expected 3 found %', n; END IF;

  -- the two real signup triggers must still be attached and still point at handle_new_auth_user
  SELECT count(*) INTO n FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal AND ns.nspname = 'auth' AND c.relname = 'users'
    AND p.proname = 'handle_new_auth_user';
  IF n <> 2 THEN RAISE EXCEPTION '448: expected 2 auth.users triggers, found %', n; END IF;
END $$;
