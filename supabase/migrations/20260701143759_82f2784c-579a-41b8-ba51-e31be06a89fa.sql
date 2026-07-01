CREATE OR REPLACE FUNCTION public.upsert_dynamic_parameter_weight(
  _parameter_id uuid,
  _new_weight numeric,
  _new_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_before jsonb;
  v_cur_weight numeric;
  v_cur_valid_from date;
  v_cur_row_id uuid;
  v_today date := CURRENT_DATE;
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
    VALUES (_parameter_id, _new_weight, v_today, v_uid);
  ELSIF v_cur_weight <> _new_weight THEN
    IF v_cur_valid_from = v_today THEN
      UPDATE public.dynamic_parameter_weights
         SET weight = _new_weight, created_by = v_uid
       WHERE id = v_cur_row_id;
    ELSE
      UPDATE public.dynamic_parameter_weights SET valid_to = v_today WHERE id = v_cur_row_id;
      INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
      VALUES (_parameter_id, _new_weight, v_today, v_uid);
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
$$;

REVOKE ALL ON FUNCTION public.upsert_dynamic_parameter_weight(uuid, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_dynamic_parameter_weight(uuid, numeric, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.create_dynamic_scoring_parameter(text, text, numeric, text);

CREATE FUNCTION public.create_dynamic_scoring_parameter(
  _code text,
  _label_fa text,
  _weight numeric,
  _direction text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_today date := CURRENT_DATE;
  v_next_order int;
  v_setting record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'accountant')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _code IS NULL OR btrim(_code) = '' THEN RAISE EXCEPTION 'INVALID_CODE'; END IF;
  IF _weight IS NULL OR _weight < 0 OR _weight > 1 THEN RAISE EXCEPTION 'INVALID_WEIGHT'; END IF;
  IF _direction NOT IN ('positive','negative') THEN RAISE EXCEPTION 'INVALID_DIRECTION'; END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_next_order
    FROM public.dynamic_scoring_parameters WHERE entity_type = 'customer';

  INSERT INTO public.dynamic_scoring_parameters(entity_type, code, label_fa, name, direction, is_active, display_order, weight_default)
  VALUES ('customer', btrim(_code), NULLIF(btrim(_label_fa), ''),
          COALESCE(NULLIF(btrim(_label_fa), ''), btrim(_code)), _direction, true, v_next_order, _weight)
  RETURNING id INTO v_id;

  INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
  VALUES (v_id, _weight, v_today, v_uid);

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'dynamic_scoring_parameter', v_id, 'parameter_created',
          jsonb_build_object('code', _code, 'weight', _weight, 'direction', _direction));

  SELECT capital_date, total_capital, notes INTO v_setting
    FROM public.daily_capital_settings WHERE capital_date = v_today
   ORDER BY created_at DESC LIMIT 1;

  IF v_setting.capital_date IS NOT NULL THEN
    BEGIN
      PERFORM public.run_daily_capital_allocation(
        v_setting.capital_date, v_setting.total_capital,
        COALESCE(v_setting.notes, 'auto-rerun after new parameter'));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
      VALUES (v_uid, 'dynamic_scoring_parameter', v_id, 'auto_reallocation_failed',
              jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_dynamic_scoring_parameter(text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dynamic_scoring_parameter(text, text, numeric, text) TO authenticated;

ALTER TABLE public.dynamic_parameter_weights REPLICA IDENTITY FULL;
ALTER TABLE public.dynamic_scoring_parameters REPLICA IDENTITY FULL;
ALTER TABLE public.customer_capital_allocations_dynamic REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.dynamic_parameter_weights;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.dynamic_scoring_parameters;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_capital_allocations_dynamic;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;