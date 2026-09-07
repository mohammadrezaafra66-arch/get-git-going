SET client_encoding='UTF8';

-- 510 - D-52: run_daily_capital_allocation هم باید سقف دستی اعتبار را رعایت کند
--
-- مسئله:
--   تصمیم D-52 نصفه پیاده شده بود. مهاجرت 506 فقط به
--   recompute_dynamic_capital_setting یاد داد که customers.manual_credit_floor را
--   رعایت کند. تابع دوم، run_daily_capital_allocation، هیچ ارجاعی به آن نداشت —
--   اندازه‌گیری‌شده از کاتالوگ زنده: 0 ارجاع در برابر 1 ارجاع.
--
--   نتیجه برای یک مشتری با سقف تأییدشده‌ی ۲٬۰۰۰٬۰۰۰٬۰۰۰ ریال:
--     recompute_dynamic_capital_setting -> final_limit = 2000000000, binding_constraint = manual_override
--     run_daily_capital_allocation      -> final_limit = 1247149593, binding_constraint = formula
--   و تنها اجرای فرمولی که کاربر می‌تواند راه بیندازد همین دومی است
--   (src/hooks/capital/useDynamicCapital.ts:101). پس وعده‌ی فارسی پای صفحه‌ی
--   درخواست‌های اعتبار — که فرمول سقف دستی را رعایت می‌کند — امروز نادرست بود.
--
-- روش:
--   بدنه از تعریف زنده (pg_get_functiondef) برداشته شده و فقط سه درج روی آن انجام
--   شده است؛ هر خط دیگر بایت‌به‌بایت همان چیزی است که دیتابیس امروز دارد. شکل گارد
--   عیناً از مهاجرت 506 تقلید شده تا سازوکار دومی برای سقف ساخته نشود:
--     ۱) ستون manual_floor روی جدول موقت _cust_alloc
--     ۲) خواندن customers.manual_credit_floor
--     ۳) اعمال کف، فقط وقتی از نتیجه‌ی فرمول بزرگ‌تر است و مشتری معوق ندارد
--
--   ترتیب عمداً همان است: کف بعد از سقفِ credit_limit اعمال می‌شود، پس
--   binding_constraint وقتی کف تعیین‌کننده باشد 'manual_override' می‌شود.
--
-- امضا دست نخورده است، پس CREATE OR REPLACE جایگزین می‌کند و overload نمی‌سازد؛
-- این ادعا در انتهای همین فایل assert می‌شود.

CREATE OR REPLACE FUNCTION public.run_daily_capital_allocation(p_capital_date date, p_total_capital numeric, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_setting_id uuid;
  v_sp_count int := 0;
  v_cust_count int := 0;
  v_total_allocated numeric := 0;
  v_sum_sp_score numeric;
  v_sp record;
  v_sum_cust_score numeric;
  v_remainder numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no session';
  END IF;

  IF NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'accountant')) THEN
    RAISE EXCEPTION 'unauthorized: requires admin or accountant role';
  END IF;

  IF p_total_capital IS NULL OR p_total_capital <= 0 THEN
    RAISE EXCEPTION 'invalid total_capital: must be > 0';
  END IF;

  BEGIN
    INSERT INTO public.daily_capital_settings(capital_date, total_capital, scoring_mode, notes, created_by)
    VALUES (p_capital_date, p_total_capital, 'auto', p_notes, v_caller)
    RETURNING id INTO v_setting_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'capital allocation already exists for date %', p_capital_date;
  END;

  CREATE TEMP TABLE _sp_alloc(
    salesperson_id uuid PRIMARY KEY,
    weighted_score numeric NOT NULL DEFAULT 0,
    share_ratio numeric NOT NULL DEFAULT 0,
    raw_amount numeric NOT NULL DEFAULT 0,
    floor_amount numeric NOT NULL DEFAULT 0,
    fractional numeric NOT NULL DEFAULT 0,
    allocated_capital numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  INSERT INTO _sp_alloc(salesperson_id, weighted_score)
  SELECT ur.user_id,
         COALESCE((public.calculate_dynamic_score('salesperson', ur.user_id, p_capital_date) ->> 'weighted_score')::numeric, 0)
  FROM public.user_roles ur
  WHERE ur.role = 'sales'
  GROUP BY ur.user_id;

  SELECT COALESCE(SUM(weighted_score), 0) INTO v_sum_sp_score FROM _sp_alloc;
  SELECT COUNT(*) INTO v_sp_count FROM _sp_alloc;

  IF v_sum_sp_score > 0 THEN
    UPDATE _sp_alloc SET
      share_ratio  = weighted_score / v_sum_sp_score,
      raw_amount   = (weighted_score / v_sum_sp_score) * p_total_capital,
      floor_amount = FLOOR((weighted_score / v_sum_sp_score) * p_total_capital),
      fractional   = ((weighted_score / v_sum_sp_score) * p_total_capital)
                     - FLOOR((weighted_score / v_sum_sp_score) * p_total_capital)
    WHERE true;

    SELECT p_total_capital - COALESCE(SUM(floor_amount),0) INTO v_remainder FROM _sp_alloc;
    UPDATE _sp_alloc SET allocated_capital = floor_amount WHERE true;

    IF v_remainder > 0 THEN
      WITH ranked AS (
        SELECT salesperson_id
        FROM _sp_alloc
        WHERE weighted_score > 0
        ORDER BY fractional DESC, weighted_score DESC, salesperson_id
        LIMIT v_remainder::int
      )
      UPDATE _sp_alloc a
      SET allocated_capital = a.floor_amount + 1
      FROM ranked r
      WHERE a.salesperson_id = r.salesperson_id;
    END IF;
  END IF;

  INSERT INTO public.salesperson_capital_allocations_dynamic(
    capital_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
  )
  SELECT v_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
  FROM _sp_alloc;

  CREATE TEMP TABLE _cust_alloc(
    customer_id uuid PRIMARY KEY,
    salesperson_id uuid NOT NULL,
    weighted_score numeric NOT NULL DEFAULT 0,
    share_ratio numeric NOT NULL DEFAULT 0,
    raw_allocation numeric NOT NULL DEFAULT 0,
    credit_limit numeric,
    manual_floor numeric,          -- D-52: the approved override, NULL when there is none
    has_overdue boolean NOT NULL DEFAULT false,
    has_profile boolean NOT NULL DEFAULT false,
    final_limit numeric NOT NULL DEFAULT 0,
    binding_constraint text NOT NULL DEFAULT 'formula'
  ) ON COMMIT DROP;

  CREATE TEMP TABLE IF NOT EXISTS _sp_cust(
    customer_id uuid PRIMARY KEY,
    weighted_score numeric NOT NULL DEFAULT 0,
    floor_amount numeric NOT NULL DEFAULT 0,
    fractional numeric NOT NULL DEFAULT 0,
    raw_allocation numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;
  TRUNCATE _sp_cust;

  FOR v_sp IN
    SELECT salesperson_id, allocated_capital
    FROM _sp_alloc
    WHERE allocated_capital > 0
  LOOP
    TRUNCATE _sp_cust;

    INSERT INTO _sp_cust(customer_id, weighted_score)
    SELECT c.id,
           COALESCE((public.calculate_dynamic_score('customer', c.id, p_capital_date) ->> 'weighted_score')::numeric, 0)
    FROM public.customers c
    WHERE c.responsible_id = v_sp.salesperson_id
      AND COALESCE(c.is_active, true) = true;

    SELECT COALESCE(SUM(weighted_score),0) INTO v_sum_cust_score FROM _sp_cust;

    IF v_sum_cust_score > 0 THEN
      UPDATE _sp_cust SET
        floor_amount = FLOOR((weighted_score / v_sum_cust_score) * v_sp.allocated_capital),
        fractional   = ((weighted_score / v_sum_cust_score) * v_sp.allocated_capital)
                       - FLOOR((weighted_score / v_sum_cust_score) * v_sp.allocated_capital)
      WHERE true;

      SELECT v_sp.allocated_capital - COALESCE(SUM(floor_amount),0) INTO v_remainder FROM _sp_cust;
      UPDATE _sp_cust SET raw_allocation = floor_amount WHERE true;

      IF v_remainder > 0 THEN
        WITH ranked AS (
          SELECT customer_id
          FROM _sp_cust
          WHERE weighted_score > 0
          ORDER BY fractional DESC, weighted_score DESC, customer_id
          LIMIT v_remainder::int
        )
        UPDATE _sp_cust c
        SET raw_allocation = c.floor_amount + 1
        FROM ranked r
        WHERE c.customer_id = r.customer_id;
      END IF;
    END IF;

    INSERT INTO _cust_alloc(
      customer_id, salesperson_id, weighted_score, share_ratio, raw_allocation
    )
    SELECT
      sc.customer_id,
      v_sp.salesperson_id,
      sc.weighted_score,
      CASE WHEN v_sum_cust_score > 0 THEN sc.weighted_score / v_sum_cust_score ELSE 0 END,
      sc.raw_allocation
    FROM _sp_cust sc;
  END LOOP;

  UPDATE _cust_alloc ca
  SET credit_limit = ccp.credit_limit,
      has_overdue = COALESCE(ccp.has_overdue, false),
      has_profile = true
  FROM public.customer_credit_profile ccp
  WHERE ccp.customer_id = ca.customer_id;

  -- D-52 ADDITION 1 of 2 - identical in shape to migration 506's addition to
  -- recompute_dynamic_capital_setting. Pull the approved manual override in.
  UPDATE _cust_alloc ca
     SET manual_floor = c.manual_credit_floor
    FROM public.customers c
   WHERE c.id = ca.customer_id
     AND c.manual_credit_floor IS NOT NULL;

  UPDATE _cust_alloc SET
    final_limit = CASE
      WHEN has_overdue THEN 0
      WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN credit_limit
      ELSE raw_allocation
    END,
    binding_constraint = CASE
      WHEN has_overdue THEN 'overdue'
      WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN 'credit_limit'
      ELSE 'formula'
    END
  WHERE true;

  -- D-52 ADDITION 2 of 2 - THE FLOOR, mirroring migration 506 exactly.
  -- It raises final_limit and never lowers it (manual_floor > final_limit), so an override
  -- smaller than what the formula already gives is a no-op rather than a cut. has_overdue
  -- still wins: a customer in arrears keeps a ceiling of zero.
  UPDATE _cust_alloc
     SET final_limit = manual_floor,
         binding_constraint = 'manual_override'
   WHERE manual_floor IS NOT NULL
     AND NOT has_overdue
     AND manual_floor > final_limit;

  SELECT COUNT(*), COALESCE(SUM(final_limit),0) INTO v_cust_count, v_total_allocated FROM _cust_alloc;

  INSERT INTO public.customer_capital_allocations_dynamic(
    capital_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
    raw_allocation, final_limit, binding_constraint
  )
  SELECT v_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
         raw_allocation, final_limit, binding_constraint
  FROM _cust_alloc;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (
    v_caller,
    'create',
    'daily_capital_setting',
    v_setting_id::text,
    jsonb_build_object(
      'capital_date', p_capital_date,
      'total_capital', p_total_capital,
      'salespersons_count', v_sp_count,
      'customers_count', v_cust_count,
      'total_allocated_to_customers', v_total_allocated,
      'scoring_mode', 'auto'
    )
  );

  RETURN jsonb_build_object(
    'setting_id', v_setting_id,
    'capital_date', p_capital_date,
    'total_capital', p_total_capital,
    'salespersons_count', v_sp_count,
    'customers_count', v_cust_count,
    'total_allocated_to_customers', v_total_allocated
  );
END;
$function$;


-- --------------------------------------------------------------- مجوزها
-- CREATE OR REPLACE مجوزهای قبلی را حفظ می‌کند، ولی اینجا صریح نوشته می‌شوند تا
-- وضعیت نهایی حدس نباشد. این فایل با نقش supabase_admin اجرا می‌شود که مالک تابع
-- است — REVOKE ای که نقش postgres روی تابعِ متعلق به supabase_admin صادر کند
-- بی‌صدا بی‌اثر است.
REVOKE ALL ON FUNCTION public.run_daily_capital_allocation(date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_daily_capital_allocation(date, numeric, text)
  TO authenticated, service_role;

-- --------------------------------------------------------------- assertها
DO $do$
DECLARE
  _n integer;
BEGIN
  -- الف) تابع حالا سقف دستی را می‌شناسد
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='run_daily_capital_allocation'
     AND pg_get_functiondef(p.oid) LIKE '%manual_credit_floor%';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'D-52: run_daily_capital_allocation هنوز manual_credit_floor را نمی‌خواند';
  END IF;

  -- ب) و binding_constraint را روی manual_override می‌گذارد
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='run_daily_capital_allocation'
     AND pg_get_functiondef(p.oid) LIKE '%manual_override%';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'D-52: binding_constraint روی manual_override تنظیم نمی‌شود';
  END IF;

  -- ج) overload ساخته نشده باشد
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='run_daily_capital_allocation';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'run_daily_capital_allocation حالا % نسخه دارد', _n;
  END IF;

  -- د) anon يا PUBLIC اجازه‌ی اجرا نداشته باشد
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='run_daily_capital_allocation'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR p.proacl::text ~ '(^|,)=X/');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'OG-61: anon يا PUBLIC هنوز اجازه‌ی اجرای این تابع را دارد';
  END IF;

  RAISE NOTICE 'D-52: هر چهار assert برقرار است.';
END
$do$;
