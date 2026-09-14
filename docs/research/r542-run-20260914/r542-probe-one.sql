-- r542: one persona, one READ ONLY REPEATABLE READ transaction, ROLLBACK.
-- Expects psql variables :pname and :uid. Prints no identifier and no setting value.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- owner baseline in the SAME snapshot the persona reads, so live traffic cannot fake a control change
SELECT set_config('r542.persona', :'pname', true) IS NOT NULL AS a,
       set_config('r542.uid', :'uid', true) IS NOT NULL AS b,
       set_config('r542.base',
            'base_bank_accounts=' || (SELECT count(*) FROM public.bank_accounts)
         || '|base_ccad=' || (SELECT count(*) FROM public.customer_capital_allocations_dynamic)
         || '|base_scad=' || (SELECT count(*) FROM public.salesperson_capital_allocations_dynamic)
         || '|base_audit_logs=' || (SELECT count(*) FROM public.audit_logs)
         || '|base_shop_settings=' || (SELECT count(*) FROM public.shop_settings)
         || '|base_didar_key_nonempty=' || (SELECT EXISTS (SELECT 1 FROM public.shop_settings
                                               WHERE key = 'didar_api_key' AND coalesce(btrim(value), '') NOT IN ('', 'null', '""')))
         || '|persona_status=' || coalesce((SELECT status FROM public.profiles WHERE id = (:'uid')::uuid), '<none>')
         || '|persona_roles=' || coalesce((SELECT string_agg(role::text, '+' ORDER BY role::text) FROM public.user_roles WHERE user_id = (:'uid')::uuid), '-'),
         true) IS NOT NULL AS c,
       set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role', 'authenticated')::text, true) IS NOT NULL AS d
\gset s_

SET LOCAL ROLE authenticated;

DO $probe$
DECLARE
  r    text;
  n    bigint;
  b    boolean;
  line text;
BEGIN
  line := 'r542_probe|persona=' || current_setting('r542.persona')
       || '|uid_resolved=' || (auth.uid() IS NOT NULL)
       || '|uid_match=' || (auth.uid()::text IS NOT DISTINCT FROM current_setting('r542.uid'))
       || '|current_user=' || current_user
       || '|' || current_setting('r542.base');

  FOREACH r IN ARRAY ARRAY['vw_account_balances', 'v_dynamic_customer_capital_balances',
                           'v_dynamic_salesperson_capital_balances', 'publish_recipients_view',
                           'vw_supplier_payables', 'audit_logs', 'shop_settings']
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', r) INTO n;
      line := line || '|' || r || '=' || n;
    EXCEPTION WHEN insufficient_privilege THEN
      line := line || '|' || r || '=ERR42501';
    END;
  END LOOP;

  -- true/false only; the value itself is never selected into anything that is printed
  BEGIN
    SELECT EXISTS (SELECT 1 FROM public.shop_settings WHERE key = 'didar_api_key') INTO b;
    line := line || '|didar_key_row_visible=' || b;
    SELECT EXISTS (SELECT 1 FROM public.shop_settings
                    WHERE key = 'didar_api_key' AND coalesce(btrim(value), '') NOT IN ('', 'null', '""')) INTO b;
    line := line || '|didar_key_readable=' || b;
  EXCEPTION WHEN insufficient_privilege THEN
    line := line || '|didar_key_readable=ERR42501';
  END;

  BEGIN
    line := line || '|has_role_admin=' || public.has_role(auth.uid(), 'admin'::text);
  EXCEPTION WHEN insufficient_privilege THEN
    line := line || '|has_role_admin=ERR42501';
  END;

  RAISE NOTICE '%', line;
END
$probe$;

ROLLBACK;
