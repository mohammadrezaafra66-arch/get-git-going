SET client_encoding='UTF8';

-- =====================================================================================
-- 443 -- unwired wave 1, agent C.
--
-- Two functions that C-9 and C-11 were supposed to surface in the UI DO NOT WORK and
-- never have. Both fail the same way: a PL/pgSQL OUT parameter shares its name with a
-- column of the table the body queries, so the reference is ambiguous and the function
-- raises before returning a single row. Measured on afrakala, 2026-09-05:
--
--   SELECT * FROM public.manual_daily_metrics_totals(<staff_uuid>, now() - '365 days');
--   ERROR:  column reference "sales_amount" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--   CONTEXT: PL/pgSQL function manual_daily_metrics_totals(uuid,timestamp with time zone)
--            line 3 at SQL statement
--
--   SELECT * FROM public.mi_get_seller_favorite_products(30, 5);   -- as `authenticated`
--   ERROR:  column reference "product_id" is ambiguous
--   CONTEXT: PL/pgSQL function mi_get_seller_favorite_products(integer,integer)
--            line 8 at RETURN QUERY
--
-- Nothing in `src` or `server` called either one, so nothing was broken on screen --
-- which is exactly why it went unnoticed. A card cannot be wired to a function that
-- throws on every call, so the fix ships with the wiring.
--
-- Both are CREATE OR REPLACE with the IDENTICAL signature read from pg_get_functiondef
-- before editing (project rule 4), so no overload is created and rule 5 does not apply.
-- Only the ambiguous references are qualified; no logic, filter, ordering, clamp or
-- permission check is touched.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1) manual_daily_metrics_totals -- qualify every summed column with the table alias.
--    OUT params: sales_amount, profit_amount, inbound_calls, outbound_calls, talk_minutes
--    Colliding table columns: sales_amount, profit_amount.
--    (INTO targets are always variables, so the INTO list needs no change.)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manual_daily_metrics_totals(
  p_employee_id uuid,
  p_from timestamp with time zone,
  OUT sales_amount numeric,
  OUT profit_amount numeric,
  OUT inbound_calls integer,
  OUT outbound_calls integer,
  OUT talk_minutes numeric
)
RETURNS record
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  SELECT COALESCE(SUM(m.sales_amount), 0),
         COALESCE(SUM(m.profit_amount), 0),
         COALESCE(SUM(m.inbound_calls_count), 0)::int,
         COALESCE(SUM(m.outbound_calls_count), 0)::int,
         COALESCE(SUM(m.talk_time_minutes), 0)::numeric
    INTO sales_amount, profit_amount, inbound_calls, outbound_calls, talk_minutes
    FROM public.staff_daily_performance_metrics m
   WHERE m.staff_user_id = p_employee_id
     AND m.metric_date >= p_from::date;
END;
$function$;

-- -------------------------------------------------------------------------------------
-- 2) mi_get_seller_favorite_products -- the only ambiguous reference is the bare
--    `product_id` inside the latest_price sub-select; every other column in the body is
--    already qualified. Alias the CTE there and qualify it.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mi_get_seller_favorite_products(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  product_id uuid,
  name text,
  sku text,
  brand jsonb,
  category jsonb,
  stock_status text,
  interaction_count integer,
  last_interaction_at timestamp with time zone,
  current_price numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH sales_users AS (
    SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'sales'::text
  ),
  agg AS (
    SELECT e.product_id AS pid,
           COUNT(*)::int AS interaction_count,
           MAX(e.created_at) AS last_interaction_at
    FROM product_interaction_events e
    JOIN sales_users su ON su.user_id = e.user_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  latest_price AS (
    SELECT DISTINCT ON (h.product_id) h.product_id AS pid, h.new_sale_price
    FROM product_sale_price_history h
    WHERE h.product_id IN (SELECT a2.pid FROM agg a2)
    ORDER BY h.product_id, h.created_at DESC
  )
  SELECT
    p.id AS product_id,
    p.name, p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    a.interaction_count,
    a.last_interaction_at,
    lp.new_sale_price AS current_price
  FROM agg a
  JOIN products p ON p.id = a.pid AND p.is_active = true
  LEFT JOIN latest_price lp ON lp.pid = a.pid
  ORDER BY a.interaction_count DESC, a.last_interaction_at DESC
  LIMIT v_limit;
END;
$function$;

-- -------------------------------------------------------------------------------------
-- 3) Permission audit for the five routes wired into the menu in this wave.
--
--    public.has_dynamic_permission FAILS OPEN: when NO role_permissions row exists for a
--    module at all, the `view` fallback returns
--      has_any_role(_user_id, ARRAY['admin','manager','accountant','sales','viewer'])
--    -- i.e. every role. A route whose module has no rows is therefore visible to
--    everyone the moment it is put in a menu.
--
--    Measured before writing this migration: the three modules the new routes resolve to
--    -- `roles` (/api-keys, /presence, /admin/system-health), `purchases`
--    (/operations/purchase-advisor) and `dashboard` (/gamification/achievements) --
--    already carry a complete row per role_name, so the fallback is NOT reached and no
--    INSERT is needed. That is a finding, not an omission, and this block is what keeps
--    it true: if any of those modules ever loses its rows, this assertion is the record
--    of what the menu wiring assumed.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
  m text;
  n integer;
BEGIN
  FOREACH m IN ARRAY ARRAY['roles', 'purchases', 'dashboard'] LOOP
    SELECT count(*) INTO n FROM public.role_permissions rp WHERE rp.module = m;
    IF n = 0 THEN
      RAISE EXCEPTION
        'role_permissions has no rows for module %, so has_dynamic_permission would fail open for the routes wired to it', m;
    END IF;
    RAISE NOTICE 'role_permissions module % -> % rows', m, n;
  END LOOP;
END $$;
