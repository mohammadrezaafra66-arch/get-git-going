CREATE OR REPLACE FUNCTION public.can_use_customer_capital_allocation(p_customer_id uuid, p_amount numeric)
 RETURNS TABLE(can_use boolean, available numeric, customer_allocation_id uuid, salesperson_allocation_id uuid, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _snap uuid; _cca record; _sca record;
  _c_held numeric; _c_cons numeric; _s_held numeric; _s_cons numeric;
  _c_avail numeric; _s_avail numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  _snap := public._latest_active_capital_setting();
  IF _snap IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'هیچ snapshot سرمایه فعال وجود ندارد'::text;
    RETURN;
  END IF;

  SELECT id, salesperson_id, final_limit
    INTO _cca
    FROM public.customer_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND customer_id = p_customer_id;
  IF _cca.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'مشتری در snapshot فعال تخصیص ندارد'::text;
    RETURN;
  END IF;
  IF _cca.salesperson_id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, _cca.id, NULL::uuid, 'کارشناس فروش برای مشتری تعیین نشده'::text;
    RETURN;
  END IF;

  SELECT id, allocated_capital INTO _sca
    FROM public.salesperson_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND salesperson_id = _cca.salesperson_id;
  IF _sca.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, _cca.id, NULL::uuid, 'کارشناس در snapshot فعال تخصیص ندارد'::text;
    RETURN;
  END IF;

  SELECT held, consumed INTO _c_held, _c_cons FROM public._capital_alloc_used('customer', _cca.id);
  SELECT held, consumed INTO _s_held, _s_cons FROM public._capital_alloc_used('salesperson', _sca.id);
  _c_avail := COALESCE(_cca.final_limit,0) - _c_held - _c_cons;
  _s_avail := COALESCE(_sca.allocated_capital,0) - _s_held - _s_cons;

  IF p_amount > _c_avail OR p_amount > _s_avail THEN
    RETURN QUERY SELECT false, LEAST(_c_avail,_s_avail), _cca.id, _sca.id,
      ('سهم سرمایه کافی نیست (مشتری: '||_c_avail||'، فروشنده: '||_s_avail||')')::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, LEAST(_c_avail,_s_avail), _cca.id, _sca.id, 'ok'::text;
END;
$function$
