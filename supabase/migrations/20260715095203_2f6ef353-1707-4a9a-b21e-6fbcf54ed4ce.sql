
-- Manual penalty creation for admin/manager to seed penalty tests
CREATE OR REPLACE FUNCTION public.create_manual_penalty(
  p_user_id uuid,
  p_type text,
  p_severity text,
  p_description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت کارت قرمز را ندارید.' USING ERRCODE = 'P0001';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'کاربر هدف نامعتبر است.' USING ERRCODE = 'P0001';
  END IF;

  IF p_type NOT IN (
    'no_response_primary','no_response_secondary','no_confirm_store',
    'repeated_invalid_answer','frequent_delay','frequent_price_edit',
    'wrong_inquiry','free_product_attempt'
  ) THEN
    RAISE EXCEPTION 'نوع تخلف نامعتبر است.' USING ERRCODE = 'P0001';
  END IF;

  IF p_severity NOT IN ('low','medium','high') THEN
    RAISE EXCEPTION 'شدت نامعتبر است.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.performance_penalties(user_id, type, severity, description, created_by, is_active, inquiry_id)
  VALUES (p_user_id, p_type, p_severity, NULLIF(TRIM(COALESCE(p_description, '')), ''), auth.uid(), true, NULL)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_manual_penalty(uuid, text, text, text) TO authenticated;
