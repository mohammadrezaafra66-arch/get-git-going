-- 371 — re-assert migration 370's end state by IDENTITY rather than by COUNT.
--
-- WHY THIS EXISTS. The independent review of migration 370 attacked 370's own `DO $chk$` gate and
-- proved it could print "370 OK: 8 guard-class views, 0 anon privileges, 2 security_invoker,
-- authenticated intact" over three materially wrong end states. Each was demonstrated inside
-- BEGIN … ROLLBACK against the live catalogue:
--
--   (2a) security_invoker set on the WRONG two views. The gate asserted `n_invoker = 2` across the
--        whole guard class and never checked WHICH two. The reviewer put the flag on
--        publish_recipients_view and vw_account_balances — precisely the two that 370's own
--        measurement says break readers (accountant 24 -> 1, sales 1 -> 0) — removed it from the two
--        intended views, and the gate still said OK. Check 1 (`n_guard = 8`) had the same shape:
--        it counted the guard class without comparing it to the list 370 was written against.
--
--   (2b) anon reading through a PUBLIC grant. The gate queried
--        information_schema.role_table_grants … grantee = 'anon', which asks "is there a row naming
--        anon", not "can anon read this". A GRANT to PUBLIC gives anon the privilege while leaving
--        that query at zero. The reviewer showed `gate check-2 sees anon grants: 0` alongside
--        `has_table_privilege(anon, SELECT) = true` on the same object, gate still green.
--        No PUBLIC grant exists today — relacl carries none — but a gate that cannot see this class
--        of mistake is not a gate.
--
--   (2c) `authenticated` losing a view the gate does not cover. Check 4's array listed only 4 of the
--        6 revoked views, omitting publish_recipients_view and vw_account_balances. The reviewer
--        revoked authenticated's SELECT on publish_recipients_view and the gate still said
--        "authenticated intact" — the very comment attached to that check reads "If this fails,
--        every signed-in user just lost these views."
--
-- 370 is already applied and committed, and this repository does not edit an applied migration
-- (AGENTS.md rule 6). So the corrected gate ships as its own migration.
--
-- WHAT THIS MIGRATION CHANGES: nothing. It creates, drops and alters no object. It asserts, and it
-- raises if the assertion fails. Applying it to a healthy database is a no-op that prints a NOTICE.
-- Applying it to a database where 370 has drifted, been partially rolled back, or been re-granted
-- by a later CREATE VIEW (see OG-25) fails loudly and names the object.
--
-- ROLLBACK: docs/verification/371-down.sql (a documented no-op).

SET client_encoding = 'UTF8';

DO $chk$
DECLARE
  v            text;
  p            text;
  actual       text[];
  invoker_on   text[];
  guard_views  text[] := ARRAY[
    'product_computed_prices_public',
    'publish_recipients_view',
    'v_dynamic_customer_capital_balances',
    'v_dynamic_salesperson_capital_balances',
    'v_promotion_suggestions',
    'vw_account_balances',
    'vw_customer_receivables',
    'vw_supplier_payables'
  ];
  -- the six that held an anon grant before 370. The other two never did.
  revoked_views text[] := ARRAY[
    'product_computed_prices_public',
    'publish_recipients_view',
    'v_dynamic_customer_capital_balances',
    'v_dynamic_salesperson_capital_balances',
    'v_promotion_suggestions',
    'vw_account_balances'
  ];
  -- the only two 370 was permitted to put security_invoker on, chosen by measurement:
  -- they are the only guard-class views where no authenticated reader's row count changes.
  invoker_views text[] := ARRAY[
    'product_computed_prices_public',
    'v_promotion_suggestions'
  ];
  privs        text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. the guard class is exactly the eight views 370 was written against —
  --    compared as a SET, not as a count. Fixes (2a) on check 1.
  ---------------------------------------------------------------------------
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO actual
    FROM pg_class c
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
   WHERE nsp.nspname = 'public'
     AND c.relkind = 'v'
     AND pg_get_viewdef(c.oid) ILIKE '%is_viewer_only%';

  IF actual IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(guard_views) x) THEN
    RAISE EXCEPTION '371: the is_viewer_only view class has changed. expected %, found %',
      (SELECT array_agg(x ORDER BY x) FROM unnest(guard_views) x), actual;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. anon can do NOTHING on any of the eight — tested with has_table_privilege,
  --    which accounts for grants made to PUBLIC or via a role anon inherits.
  --    Fixes (2b).
  ---------------------------------------------------------------------------
  FOREACH v IN ARRAY guard_views LOOP
    FOREACH p IN ARRAY privs LOOP
      IF has_table_privilege('anon', format('public.%I', v)::regclass, p) THEN
        RAISE EXCEPTION '371: anon still holds % on public.% (effective privilege, not just a named grant)', p, v;
      END IF;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 3. security_invoker is on exactly the two intended views, BY NAME, and on
  --    none of the other six. Fixes (2a) on check 3.
  ---------------------------------------------------------------------------
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO invoker_on
    FROM pg_class c
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
   WHERE nsp.nspname = 'public'
     AND c.relkind = 'v'
     AND c.relname = ANY (guard_views)
     AND c.reloptions::text ILIKE '%security_invoker=true%';

  IF invoker_on IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(invoker_views) x) THEN
    RAISE EXCEPTION '371: security_invoker is on the wrong guard-class views. expected %, found %',
      (SELECT array_agg(x ORDER BY x) FROM unnest(invoker_views) x), invoker_on;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. `authenticated` still holds SELECT on ALL SIX revoked views — not the
  --    four 370 happened to list. This is the role the whole application runs
  --    as; if it fails, every signed-in user just lost the view. Fixes (2c).
  ---------------------------------------------------------------------------
  FOREACH v IN ARRAY revoked_views LOOP
    IF NOT has_table_privilege('authenticated', format('public.%I', v)::regclass, 'SELECT') THEN
      RAISE EXCEPTION '371: authenticated lost SELECT on public.% — the revoke hit the wrong role', v;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 5. no view body was rewritten: all eight still carry the guard predicate.
  ---------------------------------------------------------------------------
  FOREACH v IN ARRAY guard_views LOOP
    IF NOT (SELECT pg_get_viewdef(format('public.%I', v)::regclass) ILIKE '%is_viewer_only(uid())%') THEN
      RAISE EXCEPTION '371: public.% no longer filters on NOT is_viewer_only(uid()) — its body was rewritten', v;
    END IF;
  END LOOP;

  RAISE NOTICE '371 OK: guard class matches by name; anon holds none of 7 privileges on any of the 8; security_invoker on exactly the 2 intended; authenticated holds SELECT on all 6 revoked; all 8 bodies intact';
END
$chk$;
