SET client_encoding='UTF8';

-- ============================================================================================
-- 542 - three measured read paths closed: definer views (R1), the Didar key in shop_settings
--       (R2), and profile status that the database never enforced (R3)
--
-- Source: docs/research/security/security3-measurement-2026-09-14.md (branch
-- feature/security3-measurement), section 6, rows R1 / R2 / R3. Every number below was
-- re-measured on a restore of afrakala-db-20260913-post-release-696.dump (ledger 696, top
-- 20260913111000) before this file was written; see
-- docs/research/security/security-fix-542-2026-09-14.md for the before/after tables.
--
-- Shape of the file: one DO block per finding. Each block reads the LIVE definition first
-- (AGENTS.md database rule 4), refuses to continue if the live object is not the shape this
-- file was written against, and does nothing if the change is already in place. A second run
-- therefore performs no DDL at all and reports "changed 0" in every NOTICE.
--
-- Nothing here writes, updates or deletes a data row.
--
-- --- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO -------------------------------------------
--   * It does not switch the R1 views to security_invoker=true. Two of them are read only by
--     SECURITY DEFINER RPCs (get_account_balances, get_payables_list/summary/detail,
--     compute_daily_capital) and the other three by pages whose users would then be subject
--     to the base tables' RLS; proving that the accountant loses nothing under invoker rights
--     is a separate piece of work. A positive role predicate keeps the definer semantics, so
--     every caller that passes today's guard AND holds a listed role reads exactly what it
--     read before.
--   * It does not revoke SELECT on the views. e2e/security/viewer-restrictions.spec.ts expects
--     every RESTRICTED_VIEWS endpoint to answer < 400 with zero rows.
--   * It does not touch v_customer_credit_exposure, v_promotion_suggestions or
--     product_computed_prices_public. They have the same class of guard but are not the five
--     views of R1; they are listed as still open in the report.
--   * It does not rotate, print or move the Didar key. Rotation is the owner's job.
--   * It does not ban anyone in GoTrue. An inactive account can still obtain a JWT; what
--     changes is that the database stops treating that JWT as carrying its roles.
--   * It does not change is_viewer_only, has_role(uuid,app_role) or
--     has_any_role(uuid,app_role[]). The two app_role overloads delegate to the text
--     overloads (measured), so replacing the text bodies in place covers all four without
--     creating or dropping a signature.
-- ============================================================================================


-- ============================================================================================
-- R1 - five SECURITY DEFINER views guarded only by "not viewer-only"
--
-- Measured (restore, BEFORE): all five have reloptions {} (no security_invoker), owner with
-- rolsuper/rolbypassrls, and a final predicate of either
--     WHERE NOT is_viewer_only(uid())
--     WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid())
-- A user with NO role is not viewer-only, so an inactive account with no user_roles row read
-- every row. The row counts are in the report.
--
-- Who legitimately reads each view (cited in the report):
--   vw_account_balances       only via get_account_balances(), which itself requires
--                             admin/manager/accountant. No src/ reference.
--   vw_supplier_payables      only via get_payables_* and compute_daily_capital(), all of which
--                             require admin/manager/accountant. No src/ reference. (On the
--                             production dump authenticated holds no SELECT on it at all; on
--                             the test database it does. The predicate is fixed either way.)
--   v_dynamic_customer_capital_balances / v_dynamic_salesperson_capital_balances
--                             src/hooks/capital/useDynamicCapital.ts:170,236, used only by
--                             /accounting/dynamic-capital (gate admin, accountant).
--   publish_recipients_view   /pricing/sale-lists/$listId/publish (gate admin, manager,
--                             accountant, sales, purchase_specialist).
--
-- Fix: the existing guard is kept and a positive role test is ANDed onto it. The view body is
-- taken from pg_get_viewdef and only its final WHERE is rewritten, so a database whose view
-- body differs from git keeps its own body.
-- ============================================================================================
DO $r1$
DECLARE
  t              record;
  v_oid          oid;
  v_def          text;
  v_new          text;
  v_opts_before  text[];
  v_acl_before   aclitem[];
  v_found_roles  text[];
  v_changed      int := 0;
  v_already      int := 0;
  -- final WHERE as pg_get_viewdef(oid, false) renders the two measured forms
  c_old_tail constant text :=
    '\s+WHERE\s+\(+((auth\.)?uid\(\)\s+IS\s+NOT\s+NULL\)\s+AND\s+\()?NOT\s+(public\.)?is_viewer_only\((auth\.)?uid\(\)\)\)+\s*;?\s*$';
  -- final WHERE once this migration has run
  c_new_tail constant text :=
    'NOT\s+(public\.)?is_viewer_only\((auth\.)?uid\(\)\)\)+\s+AND\s+(public\.)?has_any_role\((auth\.)?uid\(\),\s*ARRAY\[([^\]]*)\]\)\)*\s*;?\s*$';
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('vw_account_balances',                    ARRAY['admin','manager','accountant']),
      ('vw_supplier_payables',                   ARRAY['admin','manager','accountant']),
      ('v_dynamic_customer_capital_balances',    ARRAY['admin','manager','accountant']),
      ('v_dynamic_salesperson_capital_balances', ARRAY['admin','manager','accountant']),
      ('publish_recipients_view',                ARRAY['admin','manager','accountant','sales','purchase_specialist'])
    ) AS x(view_name, roles)
  LOOP
    v_oid := to_regclass('public.' || t.view_name);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '542/R1: view public.% does not exist', t.view_name;
    END IF;

    SELECT c.reloptions, c.relacl INTO v_opts_before, v_acl_before
      FROM pg_class c WHERE c.oid = v_oid AND c.relkind = 'v';
    IF NOT FOUND THEN
      RAISE EXCEPTION '542/R1: public.% is not a view', t.view_name;
    END IF;
    IF coalesce(array_to_string(v_opts_before, ','), '') ~* 'security_invoker\s*=\s*(true|on|1)' THEN
      RAISE EXCEPTION '542/R1: public.% already has security_invoker; this file was not written for that state', t.view_name;
    END IF;

    v_def := pg_get_viewdef(v_oid, false);

    IF v_def ~ c_new_tail THEN
      v_found_roles := ARRAY(
        SELECT m[1] FROM regexp_matches((regexp_match(v_def, c_new_tail))[5], '''([a-z_]+)''', 'g') AS m
        ORDER BY 1);
      IF v_found_roles IS DISTINCT FROM ARRAY(SELECT unnest(t.roles) ORDER BY 1) THEN
        RAISE EXCEPTION '542/R1: public.% already carries a role test for %, expected %',
          t.view_name, v_found_roles, t.roles;
      END IF;
      v_already := v_already + 1;
      CONTINUE;
    END IF;

    IF v_def !~ c_old_tail THEN
      RAISE EXCEPTION '542/R1: public.% does not end in the measured viewer guard; live tail: %',
        t.view_name, right(v_def, 160);
    END IF;

    v_new := regexp_replace(v_def, c_old_tail,
      E'\n  WHERE auth.uid() IS NOT NULL AND NOT public.is_viewer_only(auth.uid())'
      || ' AND public.has_any_role(auth.uid(), ARRAY['
      || (SELECT string_agg(quote_literal(r), ',') FROM unnest(t.roles) r)
      || ']::text[])');

    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', t.view_name, v_new);

    -- CREATE OR REPLACE must not have moved the ACL or the options
    IF (SELECT c.relacl FROM pg_class c WHERE c.oid = v_oid) IS DISTINCT FROM v_acl_before
       OR (SELECT c.reloptions FROM pg_class c WHERE c.oid = v_oid) IS DISTINCT FROM v_opts_before THEN
      RAISE EXCEPTION '542/R1: replacing public.% changed its ACL or reloptions', t.view_name;
    END IF;
    IF pg_get_viewdef(v_oid, false) !~ c_new_tail THEN
      RAISE EXCEPTION '542/R1: public.% did not take the new predicate', t.view_name;
    END IF;

    v_changed := v_changed + 1;
    RAISE NOTICE '542/R1: public.% now requires one of %', t.view_name, t.roles;
  END LOOP;

  RAISE NOTICE '542/R1: views changed %, already in place %, total 5', v_changed, v_already;
END
$r1$;


-- ============================================================================================
-- R2 - shop_settings exposes didar_api_key to every non-viewer
--
-- Measured (restore, BEFORE): 28 keys. Policy shop_settings_read_authed is PERMISSIVE SELECT
-- TO authenticated USING (true); the only other gate is the RESTRICTIVE viewer_restricted.
-- A sales user and an inactive account with no role both read the didar_api_key row.
-- src/lib/shop/settings.ts:56 selects every key and filters in the browser, and it is called
-- from /pricing/sale-lists/new and /pricing/sale-lists/$listId, which sales opens.
--
-- Who legitimately reads shop_settings:
--   sales, manager, accountant, admin   the SHOP_SETTING_KEYS list (src/lib/shop/settings.ts)
--   admin, manager, accountant          gamification_sales_source, accountant_daily_interest_rate,
--                                       purchase_score_* (gamification admin pages)
--   admin only                          didar_api_url, didar_api_key (/operations/didar,
--                                       gate admin; the page itself says the key is admin-only)
--   server                              issabel_* via supabaseAdmin (service_role, not RLS)
--   DB functions                        13 SECURITY DEFINER readers run as owner; the one
--                                       invoker reader (is_valid_audit_entity_type) does not
--                                       read the table
--
-- Fix: the always-true read policy is replaced by one that (a) requires a non-viewer role and
-- (b) never returns a key that names a credential. Admins keep every row, including the key,
-- through the existing shop_settings_write_admin policy, which is FOR ALL and therefore also
-- a SELECT policy. No client change is needed: settings.ts already discards unknown keys.
-- ============================================================================================
DO $r2$
DECLARE
  c_secret_pattern constant text := '(api_key|apikey|secret|token|password|passwd|private_key|credential)';
  v_has_old   boolean;
  v_has_new   boolean;
  v_admin_all boolean;
  v_changed   int := 0;
  v_hidden    int;
  v_hidden_keys text;
BEGIN
  IF to_regclass('public.shop_settings') IS NULL THEN
    RAISE EXCEPTION '542/R2: public.shop_settings does not exist';
  END IF;

  -- the admin read path this fix relies on must be present before anything is dropped
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'shop_settings'
       AND policyname = 'shop_settings_write_admin' AND permissive = 'PERMISSIVE'
       AND cmd = 'ALL' AND qual ~ '^has_role\((auth\.)?uid\(\), ''admin''')
    INTO v_admin_all;
  IF NOT v_admin_all THEN
    RAISE EXCEPTION '542/R2: shop_settings_write_admin (FOR ALL, has_role admin) not found; admins would lose the Didar settings';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shop_settings'
                   AND policyname = 'shop_settings_read_authed') INTO v_has_old;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shop_settings'
                   AND policyname = 'shop_settings_read_non_secret') INTO v_has_new;

  IF v_has_old THEN
    IF (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shop_settings'
          AND policyname = 'shop_settings_read_authed') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION '542/R2: shop_settings_read_authed is not the measured USING (true) policy';
    END IF;
    EXECUTE 'DROP POLICY shop_settings_read_authed ON public.shop_settings';
    v_changed := v_changed + 1;
  END IF;

  IF NOT v_has_new THEN
    EXECUTE format($p$
      CREATE POLICY shop_settings_read_non_secret ON public.shop_settings
        AS PERMISSIVE FOR SELECT TO authenticated
        USING (
          public.has_any_role(auth.uid(),
            ARRAY['admin','manager','accountant','sales','purchase_specialist','site']::text[])
          AND key !~* %L
        )$p$, c_secret_pattern);
    v_changed := v_changed + 1;
  END IF;

  SELECT count(*), coalesce(string_agg(key, ', ' ORDER BY key), '-')
    INTO v_hidden, v_hidden_keys
    FROM public.shop_settings WHERE key ~* c_secret_pattern;

  RAISE NOTICE '542/R2: policy statements executed %, keys now visible to admins only: % (%)',
    v_changed, v_hidden, v_hidden_keys;
END
$r2$;


-- ============================================================================================
-- R3 - profile status is not enforced by the database
--
-- Measured (restore, BEFORE): has_role / has_any_role / is_board_manager / is_hr_manager read
-- user_roles only, and has_dynamic_permission's admin shortcut does the same. 183 policies call
-- has_role, 239 has_any_role, 24 has_dynamic_permission, 7 is_board_manager and 5 is_hr_manager
-- (pg_policies rows on the restore). An inactive admin read audit_logs exactly as an active
-- admin did. 7 non-active accounts on the dump can still sign in (5 of them hold admin).
--
-- Worse, profiles carries "users update own profile" USING (uid() = id) and authenticated holds
-- UPDATE on profiles.status; validate_profile_status only checks the value is one of four
-- words. An inactive user could therefore set their own status back to 'active'. Enforcing
-- status without closing that would be decoration, so it is closed here too.
--
-- Who legitimately needs access while not active: nobody. _app.tsx sends a non-active profile
-- to /pending-approval, which reads only the user's own profile row (uid() = id, unchanged).
-- Every legitimate status change goes through approve_pending_user, quick_approve_user,
-- reject_pending_user, deactivate_user or reactivate_user: all SECURITY DEFINER, owner
-- supabase_admin, all gated by has_role(auth.uid(), 'admin').
--
-- Column: profiles.status = 'active', not profiles.is_active. On the test database the four
-- 'pending' profiles carry is_active = true; status is what the app gate reads.
--
-- For every user whose profile is active, each new body is the old body ANDed with a true
-- condition, so an active admin, manager, accountant or sales user gets identical answers.
--
-- COST, measured on the restore: these helpers are evaluated once per row by most policies
-- (e.g. audit_logs "admins read audit logs" is has_role(uid(), 'admin') without a SELECT
-- wrapper), so a second lookup is paid per row. Interleaved timings of count(*) as an active
-- admin on audit_logs (116095 rows): old body 3.8 s, JOIN form 7.0 s, the two-EXISTS form used
-- here 6.0 s. Paginated reads scan far fewer rows. The general remedy is to wrap hot policy
-- calls as (SELECT has_role(auth.uid(), ...)) so they run once per statement; that is policy
-- work outside this file.
-- ============================================================================================
DO $r3$
DECLARE
  f            record;
  v_oid        oid;
  v_live       text;
  v_def        text;
  v_changed    int := 0;
  v_already    int := 0;
  c_null_check constant text := E'  IF _user_id IS NULL THEN\n    RETURN false;\n  END IF;\n';
  c_marker     constant text := '542/R3';
BEGIN
  -- ---- the four one-line SQL helpers: replaced only if the live body is the measured one ----
  FOR f IN
    SELECT * FROM (VALUES
      ('public.has_role(uuid,text)',
       'has_role(_user_id uuid, _role text)',
       $old$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role)$old$,
       $new$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role)
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'active')   -- 542/R3
$new$),
      ('public.has_any_role(uuid,text[])',
       'has_any_role(_user_id uuid, _roles text[])',
       $old$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = ANY(_roles))$old$,
       $new$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = ANY(_roles))
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'active')   -- 542/R3
$new$),
      ('public.is_board_manager(uuid)',
       'is_board_manager(_user_id uuid)',
       $old$SELECT EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager','accountant') );$old$,
       $new$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager','accountant'))
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'active');   -- 542/R3
$new$),
      ('public.is_hr_manager(uuid)',
       'is_hr_manager(_user_id uuid)',
       $old$SELECT EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager') );$old$,
       $new$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager'))
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'active');   -- 542/R3
$new$)
    ) AS x(regproc, header, old_body, new_body)
  LOOP
    v_oid := to_regprocedure(f.regproc);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '542/R3: % does not exist', f.regproc;
    END IF;

    SELECT trim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) INTO v_live FROM pg_proc p WHERE p.oid = v_oid;

    IF v_live = trim(regexp_replace(f.new_body, '\s+', ' ', 'g')) THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;

    IF v_live IS DISTINCT FROM f.old_body THEN
      RAISE EXCEPTION '542/R3: live body of % is not the measured one; refusing to replace it. live: %',
        f.regproc, v_live;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
       WHERE p.oid = v_oid AND p.prosecdef AND p.provolatile = 's' AND l.lanname = 'sql'
         AND p.prorettype = 'boolean'::regtype
         AND p.proconfig = ARRAY['search_path=public'])
    THEN
      RAISE EXCEPTION '542/R3: % is not SQL / STABLE / SECURITY DEFINER / search_path=public as measured', f.regproc;
    END IF;

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%s RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER '
      'SET search_path TO %L AS %s',
      f.header, 'public', quote_literal(f.new_body));

    v_changed := v_changed + 1;
    RAISE NOTICE '542/R3: % now requires profiles.status = active', f.regproc;
  END LOOP;

  -- ---- has_dynamic_permission: one guard inserted after its NULL check, rest untouched ----
  v_oid := to_regprocedure('public.has_dynamic_permission(uuid,text,text)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '542/R3: public.has_dynamic_permission(uuid,text,text) does not exist';
  END IF;
  v_def := pg_get_functiondef(v_oid);

  IF position(c_marker IN v_def) > 0 THEN
    v_already := v_already + 1;
  ELSE
    IF (length(v_def) - length(replace(v_def, c_null_check, ''))) / length(c_null_check) <> 1 THEN
      RAISE EXCEPTION '542/R3: has_dynamic_permission does not contain its measured NULL check exactly once';
    END IF;
    v_def := replace(v_def, c_null_check, c_null_check
      || E'\n  -- 542/R3: a profile that is not active holds no permission, admin or otherwise.\n'
      || E'  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.status = ''active'') THEN\n'
      || E'    RETURN false;\n'
      || E'  END IF;\n');
    EXECUTE v_def;
    v_changed := v_changed + 1;
    RAISE NOTICE '542/R3: has_dynamic_permission(uuid,text,text) now requires profiles.status = active';
  END IF;

  -- ---- a user may not change their own status or is_active ----
  IF to_regprocedure('public.tg_profiles_guard_status_change()') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.tg_profiles_guard_status_change()
        RETURNS trigger
        LANGUAGE plpgsql
        SET search_path TO 'public'
      AS $body$
      BEGIN
        -- 542/R3. Status moves only through the admin RPCs (approve_pending_user,
        -- quick_approve_user, reject_pending_user, deactivate_user, reactivate_user). Those are
        -- SECURITY DEFINER, so inside them current_user is their owner, not authenticated.
        -- A direct write from an end-user session is refused unless that user is an active admin.
        IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.is_active IS DISTINCT FROM OLD.is_active)
           AND current_user IN ('authenticated', 'anon')
           AND NOT public.has_role(auth.uid(), 'admin'::text)
        THEN
          RAISE EXCEPTION 'profile status can only be changed by an active administrator'
            USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
      END
      $body$
    $fn$;
    v_changed := v_changed + 1;
  ELSE
    v_already := v_already + 1;
  END IF;

  IF has_function_privilege('anon', 'public.tg_profiles_guard_status_change()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tg_profiles_guard_status_change()', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 WHERE p.oid = 'public.tg_profiles_guard_status_change()'::regprocedure
                   AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
  THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.tg_profiles_guard_status_change() FROM PUBLIC, anon, authenticated';
    v_changed := v_changed + 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
                   AND tgname = 'profiles_guard_status_change' AND NOT tgisinternal) THEN
    EXECUTE 'CREATE TRIGGER profiles_guard_status_change BEFORE UPDATE ON public.profiles '
            'FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_guard_status_change()';
    v_changed := v_changed + 1;
  ELSE
    v_already := v_already + 1;
  END IF;

  RAISE NOTICE '542/R3: statements executed %, already in place %; profiles not active: %, of which hold a role: %',
    v_changed, v_already,
    (SELECT count(*) FROM public.profiles WHERE status IS DISTINCT FROM 'active'),
    (SELECT count(DISTINCT p.id) FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.status IS DISTINCT FROM 'active');
END
$r3$;
