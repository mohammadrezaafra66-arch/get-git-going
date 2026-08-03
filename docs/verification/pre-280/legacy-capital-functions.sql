CREATE OR REPLACE FUNCTION public._archive_prior_allocations_on_active()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active = true AND (TG_OP='INSERT' OR OLD.is_active = false) THEN
    UPDATE public.customer_capital_allocations
       SET status = 'archived', updated_at = now()
     WHERE capital_snapshot_id <> NEW.id AND status NOT IN ('archived');
    UPDATE public.salesperson_capital_allocations
       SET status = 'archived', updated_at = now()
     WHERE capital_snapshot_id <> NEW.id AND status NOT IN ('archived');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._validate_allocation_amounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.held_amount + NEW.consumed_amount > NEW.final_amount THEN
    RAISE EXCEPTION 'held_amount(%) + consumed_amount(%) از final_amount(%) بیشتر است',
      NEW.held_amount, NEW.consumed_amount, NEW.final_amount;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_customer_capital_allocations(p_salesperson_allocation_id uuid)
 RETURNS TABLE(salesperson_allocation_id uuid, capital_snapshot_id uuid, capital_date date, salesperson_id uuid, salesperson_final_amount numeric, customer_id uuid, customer_score numeric, total_customer_score numeric, system_suggested_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc record;
  v_total numeric;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text,'manager'::text,'accountant'::text]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.capital_snapshot_id, s.capital_date, s.salesperson_id, s.final_amount
    INTO v_alloc
  FROM public.salesperson_capital_allocations s
  WHERE s.id = p_salesperson_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_allocation not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(COALESCE(ccp.credit_score,0)), 0) INTO v_total
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true;

  RETURN QUERY
  SELECT
    v_alloc.id,
    v_alloc.capital_snapshot_id,
    v_alloc.capital_date,
    v_alloc.salesperson_id,
    v_alloc.final_amount,
    c.id,
    COALESCE(ccp.credit_score, 0)::numeric,
    v_total,
    CASE
      WHEN v_total > 0 AND COALESCE(ccp.credit_score,0) > 0
        THEN ROUND(v_alloc.final_amount * COALESCE(ccp.credit_score,0)::numeric / v_total)
      ELSE 0
    END
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true
  ORDER BY COALESCE(ccp.credit_score,0) DESC, c.id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_salesperson_capital_allocations(p_capital_snapshot_id uuid)
 RETURNS TABLE(capital_snapshot_id uuid, capital_date date, daily_final_capital numeric, salesperson_id uuid, score numeric, total_score numeric, system_suggested_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales';

  RETURN QUERY
  SELECT
    v_snap.id,
    v_snap.capital_date,
    v_snap.final_capital,
    es.employee_id AS salesperson_id,
    es.monthly_score AS score,
    v_total AS total_score,
    CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (es.monthly_score / v_total))
      ELSE 0
    END AS system_suggested_amount
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'
  ORDER BY es.monthly_score DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_allocation_not_overridable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.final_amount IS DISTINCT FROM NEW.system_suggested_amount THEN
      RAISE EXCEPTION
        'سقف سرمایهٔ کارشناس قابل تغییر دستی نیست و باید برابر مقدار محاسبه‌شدهٔ سیستم (%) باشد.',
        NEW.system_suggested_amount
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- held_amount / consumed_amount / status must stay updatable: they are the
  -- day-to-day lifecycle of an allocation, not the allocation decision itself.
  IF NEW.system_suggested_amount IS DISTINCT FROM OLD.system_suggested_amount
     OR NEW.final_amount IS DISTINCT FROM OLD.final_amount THEN
    RAISE EXCEPTION
      'سقف محاسبه‌شدهٔ کارشناس پس از ثبت قابل ویرایش نیست (تصمیم D8-1).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_customer_capital_allocations(p_salesperson_allocation_id uuid, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc record;
  v_total numeric;
  v_item jsonb;
  v_customer_id uuid;
  v_final numeric;
  v_reason text;
  v_score numeric;
  v_suggested numeric;
  v_existing record;
  v_action text;
  v_row_id uuid;
  v_count int := 0;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text,'manager'::text,'accountant'::text]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.capital_snapshot_id, s.capital_date, s.salesperson_id, s.final_amount
    INTO v_alloc
  FROM public.salesperson_capital_allocations s
  WHERE s.id = p_salesperson_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_allocation not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(COALESCE(ccp.credit_score,0)), 0) INTO v_total
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_customer_id := (v_item->>'customer_id')::uuid;
    v_final := COALESCE((v_item->>'final_amount')::numeric, 0);
    v_reason := NULLIF(btrim(COALESCE(v_item->>'override_reason','')), '');

    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'customer_id required' USING ERRCODE = '22023';
    END IF;
    IF v_final < 0 THEN
      RAISE EXCEPTION 'final_amount must be >= 0' USING ERRCODE = '22023';
    END IF;

    -- verify customer belongs to this salesperson (active); allow missing/zero score
    SELECT COALESCE(ccp.credit_score, 0)::numeric INTO v_score
    FROM public.customers c
    LEFT JOIN public.customer_credit_profile ccp
      ON ccp.customer_id = c.id AND ccp.is_active = true
    WHERE c.id = v_customer_id
      AND c.responsible_id = v_alloc.salesperson_id
      AND c.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer % is not eligible for this salesperson', v_customer_id USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 AND v_score > 0 THEN ROUND(v_alloc.final_amount * v_score / v_total)
      ELSE 0
    END;

    -- detect existing for action classification
    SELECT id INTO v_existing
    FROM public.customer_capital_allocations
    WHERE salesperson_allocation_id = v_alloc.id AND customer_id = v_customer_id;

    INSERT INTO public.customer_capital_allocations (
      salesperson_allocation_id, capital_snapshot_id, capital_date,
      salesperson_id, customer_id,
      customer_score, score_source, total_customer_score,
      system_suggested_amount, final_amount, override_reason,
      status, created_by, approved_by
    ) VALUES (
      v_alloc.id, v_alloc.capital_snapshot_id, v_alloc.capital_date,
      v_alloc.salesperson_id, v_customer_id,
      v_score, 'customer_credit_profile.credit_score', v_total,
      v_suggested, v_final, v_reason,
      'approved', auth.uid(), auth.uid()
    )
    ON CONFLICT (salesperson_allocation_id, customer_id) DO UPDATE
      SET customer_score = EXCLUDED.customer_score,
          total_customer_score = EXCLUDED.total_customer_score,
          system_suggested_amount = EXCLUDED.system_suggested_amount,
          final_amount = EXCLUDED.final_amount,
          override_reason = EXCLUDED.override_reason,
          status = 'approved',
          approved_by = auth.uid(),
          updated_at = now()
    RETURNING id INTO v_row_id;

    IF v_existing.id IS NULL THEN
      v_action := 'create';
    ELSIF ROUND(v_final) <> ROUND(v_suggested) THEN
      v_action := 'override';
    ELSE
      v_action := 'update';
    END IF;

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (
      auth.uid(),
      'customer_capital_allocation',
      v_row_id::text,
      v_action,
      jsonb_build_object(
        'salesperson_allocation_id', v_alloc.id,
        'capital_snapshot_id', v_alloc.capital_snapshot_id,
        'capital_date', v_alloc.capital_date,
        'salesperson_id', v_alloc.salesperson_id,
        'customer_id', v_customer_id,
        'customer_score', v_score,
        'total_customer_score', v_total,
        'suggested', v_suggested,
        'final', v_final,
        'override_reason', v_reason
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_salesperson_capital_allocations(p_capital_snapshot_id uuid, p_allocations jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
  v_actor uuid := auth.uid();
  v_count integer := 0;
  v_item jsonb;
  v_sp uuid;
  v_requested numeric;
  v_score numeric;
  v_suggested numeric;
  v_existing public.salesperson_capital_allocations%ROWTYPE;
  v_alloc_id uuid;
BEGIN
  -- NOTE: the previous definition cast to `public.text[]`, which is not a real
  -- type (text lives in pg_catalog), so this line raised
  -- `type "public.text[]" does not exist` on EVERY call. That is why
  -- salesperson_capital_allocations has 0 rows: this path never worked. Fixed
  -- to text[] here rather than faithfully reproducing a fatal typo.
  IF NOT public.has_any_role(v_actor, ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_sp        := NULLIF(v_item->>'salesperson_id','')::uuid;
    v_requested := (v_item->>'final_amount')::numeric;   -- NULL when omitted

    IF v_sp IS NULL THEN
      RAISE EXCEPTION 'salesperson_id required' USING ERRCODE = '22023';
    END IF;

    SELECT es.monthly_score INTO v_score
    FROM public.employee_scores es
    JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'
    WHERE es.employee_id = v_sp;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'user % is not a salesperson with score', v_sp USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (v_score / v_total))
      ELSE 0
    END;

    -- D8-1: a supplied amount that differs from the computed one is refused,
    -- not quietly replaced.
    IF v_requested IS NOT NULL AND ROUND(v_requested) <> v_suggested THEN
      RAISE EXCEPTION
        'سقف سرمایهٔ کارشناس قابل تغییر دستی نیست. مقدار محاسبه‌شدهٔ سیستم % است (مقدار ارسالی: %).',
        v_suggested, ROUND(v_requested)
        USING ERRCODE = '42501';
    END IF;

    IF (v_item ? 'override_reason') AND NULLIF(v_item->>'override_reason','') IS NOT NULL THEN
      RAISE EXCEPTION
        'ثبت «دلیل override» دیگر پذیرفته نمی‌شود؛ سقف سرمایه از تصمیم D8-1 به بعد فقط محاسبه‌شدنی است.'
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_existing
    FROM public.salesperson_capital_allocations
    WHERE capital_snapshot_id = p_capital_snapshot_id AND salesperson_id = v_sp;

    IF FOUND THEN
      UPDATE public.salesperson_capital_allocations
        SET score = v_score,
            total_score = v_total,
            system_suggested_amount = v_suggested,
            final_amount = v_suggested,
            override_reason = NULL,
            status = 'approved',
            approved_by = v_actor,
            updated_at = now()
        WHERE id = v_existing.id
        RETURNING id INTO v_alloc_id;
    ELSE
      INSERT INTO public.salesperson_capital_allocations(
        capital_snapshot_id, capital_date, salesperson_id,
        score, total_score, system_suggested_amount, final_amount,
        override_reason, status, created_by, approved_by
      ) VALUES (
        p_capital_snapshot_id, v_snap.capital_date, v_sp,
        v_score, v_total, v_suggested, v_suggested,
        NULL, 'approved', v_actor, v_actor
      ) RETURNING id INTO v_alloc_id;
    END IF;

    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (v_actor, 'salesperson_capital_allocation', v_alloc_id, 'allocation_saved',
            jsonb_build_object('salesperson_id', v_sp,
                               'system_suggested_amount', v_suggested,
                               'final_amount', v_suggested,
                               'capital_snapshot_id', p_capital_snapshot_id));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_customer_capital_alloc_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF ROUND(NEW.final_amount) <> ROUND(NEW.system_suggested_amount)
     AND (NEW.override_reason IS NULL OR length(btrim(NEW.override_reason)) = 0) THEN
    RAISE EXCEPTION 'override_reason required when final_amount differs from system_suggested_amount'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$
;
