Pager usage is off.
Output format is unaligned.
CREATE OR REPLACE FUNCTION public.upsert_dynamic_parameter_weight(_parameter_id uuid, _new_weight numeric, _new_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_before jsonb;
  v_cur_weight numeric;
  v_cur_valid_from date;
  v_cur_row_id uuid;
  v_today date := CURRENT_DATE;
  v_month date := date_trunc('month', CURRENT_DATE)::date;
  v_setting record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'accountant')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _new_weight IS NULL OR _new_weight < 0 OR _new_weight > 1 THEN
    RAISE EXCEPTION 'INVALID_WEIGHT';
  END IF;

  SELECT jsonb_build_object(
    'is_active', p.is_active,
    'weight', (SELECT w.weight FROM public.dynamic_parameter_weights w
               WHERE w.parameter_id = p.id AND w.valid_to IS NULL
               ORDER BY w.valid_from DESC LIMIT 1)
  )
  INTO v_before
  FROM public.dynamic_scoring_parameters p
  WHERE p.id = _parameter_id;

  IF v_before IS NULL THEN RAISE EXCEPTION 'PARAMETER_NOT_FOUND'; END IF;

  UPDATE public.dynamic_scoring_parameters
     SET is_active = _new_is_active, updated_at = now()
   WHERE id = _parameter_id;

  SELECT id, weight, valid_from
    INTO v_cur_row_id, v_cur_weight, v_cur_valid_from
    FROM public.dynamic_parameter_weights
   WHERE parameter_id = _parameter_id AND valid_to IS NULL
   ORDER BY valid_from DESC LIMIT 1;

  IF v_cur_row_id IS NULL THEN
    INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
    VALUES (_parameter_id, _new_weight, v_month, v_uid);
  ELSIF v_cur_weight <> _new_weight THEN
    IF v_cur_valid_from = v_month THEN
      UPDATE public.dynamic_parameter_weights
         SET weight = _new_weight, created_by = v_uid
       WHERE id = v_cur_row_id;
    ELSE
      UPDATE public.dynamic_parameter_weights SET valid_to = v_month - 1 WHERE id = v_cur_row_id;
      INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
      VALUES (_parameter_id, _new_weight, v_month, v_uid);
    END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'dynamic_scoring_parameter', _parameter_id, 'parameter_weight_upserted',
          jsonb_build_object('before', v_before,
                             'after', jsonb_build_object('is_active', _new_is_active, 'weight', _new_weight)));

  SELECT capital_date, total_capital, notes
    INTO v_setting
    FROM public.daily_capital_settings
   WHERE capital_date = v_today
   ORDER BY created_at DESC LIMIT 1;

  IF v_setting.capital_date IS NOT NULL THEN
    BEGIN
      PERFORM public.run_daily_capital_allocation(
        v_setting.capital_date, v_setting.total_capital,
        COALESCE(v_setting.notes, 'auto-rerun after weight change'));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
      VALUES (v_uid, 'dynamic_scoring_parameter', _parameter_id, 'auto_reallocation_failed',
              jsonb_build_object('error', SQLERRM));
    END;
  END IF;
END;
$function$

