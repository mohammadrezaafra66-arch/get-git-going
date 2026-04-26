CREATE OR REPLACE FUNCTION public.requeue_failed_quote_send_item(p_queue_id uuid)
RETURNS public.sales_quote_send_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quote_send_queue;
  _old public.sales_quote_send_queue;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _old FROM public.sales_quote_send_queue WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'رکورد یافت نشد.' USING ERRCODE = 'P0002';
  END IF;
  IF _old.status <> 'failed' THEN
    RAISE EXCEPTION 'فقط رکوردهای ناموفق قابل بازگردانی هستند.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sales_quote_send_queue
  SET status = 'pending',
      scheduled_at = now(),
      locked_at = NULL,
      processed_at = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE id = p_queue_id
  RETURNING * INTO _row;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'sales_quote_send_queue', _row.id::text, 'sales_quote_send_queue_requeued',
    jsonb_build_object(
      'quote_id', _row.quote_id,
      'attempts', _row.attempts,
      'max_attempts', _row.max_attempts,
      'old_status', _old.status,
      'new_status', _row.status
    ));

  RETURN _row;
END;
$$;