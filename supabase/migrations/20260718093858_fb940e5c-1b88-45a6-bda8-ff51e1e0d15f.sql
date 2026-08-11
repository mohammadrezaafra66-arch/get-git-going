-- Limit messenger inquiry price cache validity to 3 days.
-- Existing rows created with the previous 7-day window are capped as well,
-- so products answered more than 3 days ago can be inquired again immediately.

UPDATE public.inquiry_price_cache
SET valid_until = created_at + interval '3 days'
WHERE valid_until > created_at + interval '3 days';

CREATE OR REPLACE FUNCTION public.create_inquiry(
  p_group_id uuid,
  p_product_id uuid,
  p_assigned_to uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_msg_id uuid;
BEGIN
  IF NOT public.is_messenger_group_member(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'شما عضو این گروه نیستید.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.products
    WHERE id = p_product_id
      AND COALESCE(is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'محصول انتخاب‌شده در کاتالوگ وجود ندارد یا غیرفعال است.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inquiries
    WHERE product_id = p_product_id
      AND group_id = p_group_id
      AND status IN ('pending', 'warning_5min', 'danger_8min', 'critical_10min', 'transfer_available', 'transferred')
  ) THEN
    RAISE EXCEPTION 'برای این محصول در این گروه یک استعلام باز وجود دارد.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inquiry_price_cache
    WHERE product_id = p_product_id
      AND valid_until > now()
  ) THEN
    RAISE EXCEPTION 'این محصول قیمت معتبر دارد، لطفاً استعلام ثبت نکنید.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.messenger_group_members
    WHERE group_id = p_group_id
      AND user_id = p_assigned_to
      AND role = 'purchaser'
  ) THEN
    RAISE EXCEPTION 'مسئول خرید انتخاب‌شده در این گروه دارای نقش خریدار نیست.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.messenger_messages(group_id, sender_id, content, type)
  VALUES (p_group_id, auth.uid(), '', 'inquiry')
  RETURNING id INTO v_msg_id;

  INSERT INTO public.inquiries(product_id, group_id, requested_by, assigned_to, status, message_id)
  VALUES (p_product_id, p_group_id, auth.uid(), p_assigned_to, 'pending', v_msg_id)
  RETURNING id INTO v_id;

  INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by)
  VALUES (v_id, NULL, 'pending', auth.uid());

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_inquiry(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inquiry(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reply_inquiry(
  p_inquiry_id uuid,
  p_price bigint,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inquiry public.inquiries%ROWTYPE;
  v_new_status public.inquiry_status;
  v_valid_until timestamptz;
BEGIN
  SELECT * INTO v_inquiry
  FROM public.inquiries
  WHERE id = p_inquiry_id;

  IF v_inquiry.id IS NULL THEN
    RAISE EXCEPTION 'استعلام یافت نشد.' USING ERRCODE = 'P0001';
  END IF;

  IF v_inquiry.assigned_to != auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.messenger_group_members
      WHERE group_id = v_inquiry.group_id
        AND user_id = auth.uid()
        AND role = 'purchaser'
    ) THEN
      RAISE EXCEPTION 'فقط مسئول خرید مجاز به ثبت قیمت است.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF now() - v_inquiry.created_at <= interval '10 minutes' THEN
    v_new_status := 'completed_on_time';
  ELSE
    v_new_status := 'completed_late';
  END IF;

  INSERT INTO public.inquiry_replies(inquiry_id, user_id, price, note)
  VALUES (p_inquiry_id, auth.uid(), p_price, p_note);

  v_valid_until := now() + interval '3 days';

  INSERT INTO public.inquiry_price_cache(product_id, price, valid_until, created_by)
  VALUES (v_inquiry.product_id, p_price, v_valid_until, auth.uid());

  UPDATE public.inquiries
  SET status = v_new_status,
      answered_at = now(),
      closed_at = now()
  WHERE id = p_inquiry_id;

  INSERT INTO public.inquiry_status_history(inquiry_id, from_status, to_status, changed_by)
  VALUES (p_inquiry_id, v_inquiry.status, v_new_status, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reply_inquiry(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_inquiry(uuid, bigint, text) TO authenticated, service_role;