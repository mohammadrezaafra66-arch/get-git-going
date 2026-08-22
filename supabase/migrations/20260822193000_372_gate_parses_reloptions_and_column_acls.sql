-- 372 — supersede migration 371's gate: parse `security_invoker` instead of string-matching it,
--       and sweep column-level ACLs.
--
-- WHY THIS EXISTS. The second independent review defeated gate 371 — the gate written specifically
-- to be un-foolable — using the same defect class it was created to close.
--
--   (6) `security_invoker` spelled `on` instead of `true`. 371 compares the reloption with
--       `ILIKE '%security_invoker=true%'`. PostgreSQL 15 stores the boolean literally as written,
--       so `ALTER VIEW … SET (security_invoker = on)` produces `{security_invoker=on}` and the
--       string match misses it. The reviewer put that on `publish_recipients_view` and 371 printed
--       "371 OK". This is not cosmetic — the flag is fully effective at that spelling and drops
--       accountant from 24 rows to 1, which is exactly the reader 371 exists to protect.
--       `on`, `1`, `yes` and `t` are all the same family. Server: PostgreSQL 15.6.
--
--   (7) Column-level grants. Check 2's error text advertises "effective privilege, not just a named
--       grant", but `has_table_privilege` does not see `pg_attribute.attacl`. The reviewer granted
--       anon SELECT on a single column of `vw_account_balances`, the gate stayed green, and anon
--       read `current_balance = 10289000000.00`. Latent rather than live — there are zero column
--       ACLs on the eight today — but a gate that cannot see this class is not a gate.
--
-- 371 is applied and committed, and this repository does not edit an applied migration
-- (AGENTS.md rule 6), so the corrected gate ships here. This migration SUPERSEDES 371's assertion:
-- everything 371 checks is re-checked below, with the two holes closed. 371 is left in place; it is
-- harmless and still true, just weaker.
--
-- WHAT THIS MIGRATION CHANGES: nothing. It creates, drops and alters no object. Applying it to a
-- healthy database prints a NOTICE. Applying it to a drifted one fails loudly and names the object.
--
-- ROLLBACK: docs/verification/372-down.sql (a documented no-op).

SET client_encoding = 'UTF8';

DO $chk$
DECLARE
  v            text;
  p            text;
  col          text;
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
  revoked_views text[] := ARRAY[
    'product_computed_prices_public',
    'publish_recipients_view',
    'v_dynamic_customer_capital_balances',
    'v_dynamic_salesperson_capital_balances',
    'v_promotion_suggestions',
    'vw_account_balances'
  ];
  invoker_views text[] := ARRAY[
    'product_computed_prices_public',
    'v_promotion_suggestions'
  ];
  privs        text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. the guard class is exactly the eight views, compared as a SET.
  ---------------------------------------------------------------------------
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO actual
    FROM pg_class c
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
   WHERE nsp.nspname = 'public'
     AND c.relkind = 'v'
     AND pg_get_viewdef(c.oid) ILIKE '%is_viewer_only%';

  IF actual IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(guard_views) x) THEN
    RAISE EXCEPTION '372: the is_viewer_only view class has changed. expected %, found %',
      (SELECT array_agg(x ORDER BY x) FROM unnest(guard_views) x), actual;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. anon can do NOTHING on any of the eight — table privileges …
  ---------------------------------------------------------------------------
  FOREACH v IN ARRAY guard_views LOOP
    FOREACH p IN ARRAY privs LOOP
      IF has_table_privilege('anon', format('public.%I', v)::regclass, p) THEN
        RAISE EXCEPTION '372: anon still holds % on public.%', p, v;
      END IF;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 2b. … and COLUMN privileges. `has_table_privilege` is blind to pg_attribute.attacl,
  --     so a single-column grant to anon would otherwise pass every check above while
  --     leaving the bank balance readable. Closes review finding (7).
  ---------------------------------------------------------------------------
  FOR v, col IN
    SELECT c.relname, a.attname
      FROM pg_class c
      JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE nsp.nspname = 'public'
       AND c.relname = ANY (guard_views)
  LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
      IF has_column_privilege('anon', format('public.%I', v)::regclass, col, p) THEN
        RAISE EXCEPTION '372: anon holds column privilege % on public.%.% — a column-level grant bypasses the table-level revoke', p, v, col;
      END IF;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 3. security_invoker is on exactly the two intended views — read through
  --    pg_options_to_table and cast to boolean, so `true`, `on`, `1`, `yes` and
  --    `t` all normalise to the same answer. Closes review finding (6).
  ---------------------------------------------------------------------------
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO invoker_on
    FROM pg_class c
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
   WHERE nsp.nspname = 'public'
     AND c.relkind = 'v'
     AND c.relname = ANY (guard_views)
     AND (
       SELECT o.option_value::boolean
         FROM pg_options_to_table(c.reloptions) o
        WHERE o.option_name = 'security_invoker'
     ) IS TRUE;

  IF invoker_on IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(invoker_views) x) THEN
    RAISE EXCEPTION '372: security_invoker is on the wrong guard-class views. expected %, found %',
      (SELECT array_agg(x ORDER BY x) FROM unnest(invoker_views) x), invoker_on;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. `authenticated` still holds SELECT on all six revoked views.
  ---------------------------------------------------------------------------
  FOREACH v IN ARRAY revoked_views LOOP
    IF NOT has_table_privilege('authenticated', format('public.%I', v)::regclass, 'SELECT') THEN
      RAISE EXCEPTION '372: authenticated lost SELECT on public.% — the revoke hit the wrong role', v;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 5. no view body was rewritten.
  ---------------------------------------------------------------------------
  FOREACH v IN ARRAY guard_views LOOP
    IF NOT (SELECT pg_get_viewdef(format('public.%I', v)::regclass) ILIKE '%is_viewer_only(uid())%') THEN
      RAISE EXCEPTION '372: public.% no longer filters on NOT is_viewer_only(uid()) — its body was rewritten', v;
    END IF;
  END LOOP;

  RAISE NOTICE '372 OK: guard class matches by name; anon holds no table OR column privilege on any of the 8; security_invoker parsed (not string-matched) and on exactly the 2 intended; authenticated holds SELECT on all 6 revoked; all 8 bodies intact';
END
$chk$;
