-- Wire /sales/credit-rules to the active dynamic scoring system.
-- Adds two SECURITY DEFINER RPCs so admin/manager/accountant can manage
-- dynamic_scoring_parameters + dynamic_parameter_weights atomically with audit logging.

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
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

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'PARAMETER_NOT_FOUND';
  END IF;

  -- Toggle active flag
  UPDATE public.dynamic_scoring_parameters
     SET is_active = _new_is_active,
         updated_at = now()
   WHERE id = _parameter_id;

  -- Weight versioning
  SELECT id, weight, valid_from
    INTO v_cur_row_id, v_cur_weight, v_cur_valid_from
    FROM public.dynamic_parameter_weights
   WHERE parameter_id = _parameter_id AND valid_to IS NULL
   ORDER BY valid_from DESC
   LIMIT 1;

  IF v_cur_row_id IS NULL THEN
    -- no open weight row → just insert new
    INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
    VALUES (_parameter_id, _new_weight, v_today, v_uid);
  ELSIF v_cur_weight <> _new_weight THEN
    IF v_cur_valid_from = v_today THEN
      -- same-day edit: update in place to avoid violating valid_to>valid_from
      UPDATE public.dynamic_parameter_weights
         SET weight = _new_weight, created_by = v_uid
       WHERE id = v_cur_row_id;
    ELSE
      UPDATE public.dynamic_parameter_weights
         SET valid_to = v_today
       WHERE id = v_cur_row_id;
      INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
      VALUES (_parameter_id, _new_weight, v_today, v_uid);
    END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (
    v_uid,
    'dynamic_scoring_parameter',
    _parameter_id,
    'parameter_weight_upserted',
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object('is_active', _new_is_active, 'weight', _new_weight)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_dynamic_parameter_weight(uuid, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_dynamic_parameter_weight(uuid, numeric, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_dynamic_scoring_parameter(
  _code text,
  _label_fa text,
  _weight numeric,
  _direction text DEFAULT 'positive'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_order integer;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'accountant')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _code IS NULL OR btrim(_code) = '' THEN
    RAISE EXCEPTION 'INVALID_CODE';
  END IF;
  IF _weight IS NULL OR _weight < 0 OR _weight > 1 THEN
    RAISE EXCEPTION 'INVALID_WEIGHT';
  END IF;
  IF _direction NOT IN ('positive','negative') THEN
    RAISE EXCEPTION 'INVALID_DIRECTION';
  END IF;

  v_label := COALESCE(NULLIF(btrim(_label_fa), ''), _code);

  SELECT COALESCE(MAX(display_order), 0) + 10
    INTO v_order
    FROM public.dynamic_scoring_parameters
   WHERE entity_type = 'customer';

  INSERT INTO public.dynamic_scoring_parameters(
    entity_type, code, label_fa, direction, is_active, display_order, created_by
  ) VALUES (
    'customer', btrim(_code), v_label, _direction, true, v_order, v_uid
  ) RETURNING id INTO v_id;

  INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
  VALUES (v_id, _weight, CURRENT_DATE, v_uid);

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (
    v_uid,
    'dynamic_scoring_parameter',
    v_id,
    'parameter_created',
    jsonb_build_object('code', _code, 'label_fa', v_label, 'weight', _weight, 'direction', _direction)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_dynamic_scoring_parameter(text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dynamic_scoring_parameter(text, text, numeric, text) TO authenticated;