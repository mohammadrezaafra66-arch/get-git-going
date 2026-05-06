-- FX.2E: Secure RPC for updating market rate source mappings with built-in audit
CREATE OR REPLACE FUNCTION public.update_market_rate_source_mapping(
  p_mapping_id uuid,
  p_source_symbol text,
  p_normalize_multiplier numeric,
  p_is_enabled boolean,
  p_note text
)
RETURNS public.market_rate_source_mappings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.market_rate_source_mappings;
  v_new public.market_rate_source_mappings;
  v_source_code text;
  v_indicator_code text;
  v_sym text;
  v_note text;
  v_suspect_activation boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied: only admin/manager can update mappings';
  END IF;

  v_sym := btrim(coalesce(p_source_symbol, ''));
  IF length(v_sym) = 0 THEN
    RAISE EXCEPTION 'source_symbol cannot be empty';
  END IF;
  IF length(v_sym) > 100 THEN
    RAISE EXCEPTION 'source_symbol too long (max 100)';
  END IF;
  IF p_normalize_multiplier IS NULL OR p_normalize_multiplier <= 0 THEN
    RAISE EXCEPTION 'normalize_multiplier must be > 0';
  END IF;
  v_note := coalesce(p_note, '');
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'note too long (max 500)';
  END IF;

  SELECT * INTO v_old FROM public.market_rate_source_mappings WHERE id = p_mapping_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'mapping not found';
  END IF;

  IF p_is_enabled = true AND v_old.is_enabled = false
     AND (coalesce(v_old.note,'') ~ 'نیاز به تأیید' OR coalesce(v_old.note,'') ~ 'مبهم') THEN
    v_suspect_activation := true;
  END IF;

  UPDATE public.market_rate_source_mappings
  SET source_symbol = v_sym,
      normalize_multiplier = p_normalize_multiplier,
      is_enabled = p_is_enabled,
      note = NULLIF(v_note, ''),
      updated_at = now()
  WHERE id = p_mapping_id
  RETURNING * INTO v_new;

  SELECT code INTO v_source_code FROM public.market_rate_sources WHERE id = v_new.source_id;
  SELECT code INTO v_indicator_code FROM public.market_indicators WHERE id = v_new.indicator_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'market_rate_mapping_updated',
    'market_rate_source_mapping',
    v_new.id,
    v_uid,
    jsonb_build_object(
      'source_code', v_source_code,
      'indicator_code', v_indicator_code,
      'suspect_activation', v_suspect_activation,
      'before', jsonb_build_object(
        'source_symbol', v_old.source_symbol,
        'normalize_multiplier', v_old.normalize_multiplier,
        'is_enabled', v_old.is_enabled,
        'note', v_old.note
      ),
      'after', jsonb_build_object(
        'source_symbol', v_new.source_symbol,
        'normalize_multiplier', v_new.normalize_multiplier,
        'is_enabled', v_new.is_enabled,
        'note', v_new.note
      )
    )
  );

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.update_market_rate_source_mapping(uuid, text, numeric, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_market_rate_source_mapping(uuid, text, numeric, boolean, text) TO authenticated;