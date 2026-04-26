-- RPC 1: claim next pending item atomically
CREATE OR REPLACE FUNCTION public.claim_next_quote_send_queue_item()
RETURNS public.sales_quote_send_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quote_send_queue;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  WITH next_item AS (
    SELECT id
    FROM public.sales_quote_send_queue
    WHERE status = 'pending'
      AND scheduled_at <= now()
      AND attempts < max_attempts
    ORDER BY scheduled_at ASC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sales_quote_send_queue q
  SET status = 'processing',
      locked_at = now(),
      attempts = q.attempts + 1,
      updated_at = now()
  FROM next_item
  WHERE q.id = next_item.id
  RETURNING q.* INTO _row;

  RETURN _row;
END;
$$;

-- RPC 2: complete a queue item
CREATE OR REPLACE FUNCTION public.complete_quote_send_queue_item(
  p_queue_id uuid,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS public.sales_quote_send_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quote_send_queue;
  _action text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.sales_quote_send_queue WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'رکورد یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_success THEN
    UPDATE public.sales_quote_send_queue
    SET status = 'sent',
        processed_at = now(),
        last_error = NULL,
        locked_at = NULL,
        updated_at = now()
    WHERE id = p_queue_id
    RETURNING * INTO _row;
    _action := 'sales_quote_send_queue_sent';
  ELSE
    IF _row.attempts >= _row.max_attempts THEN
      UPDATE public.sales_quote_send_queue
      SET status = 'failed',
          processed_at = now(),
          last_error = p_error,
          locked_at = NULL,
          updated_at = now()
      WHERE id = p_queue_id
      RETURNING * INTO _row;
      _action := 'sales_quote_send_queue_failed';
    ELSE
      UPDATE public.sales_quote_send_queue
      SET status = 'pending',
          locked_at = NULL,
          last_error = p_error,
          scheduled_at = now() + interval '2 minutes',
          updated_at = now()
      WHERE id = p_queue_id
      RETURNING * INTO _row;
      _action := 'sales_quote_send_queue_retry_scheduled';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'sales_quote_send_queue', _row.id::text, _action,
    jsonb_build_object(
      'quote_id', _row.quote_id,
      'attempts', _row.attempts,
      'max_attempts', _row.max_attempts,
      'status', _row.status,
      'last_error', _row.last_error,
      'scheduled_at', _row.scheduled_at,
      'processed_at', _row.processed_at
    ));

  RETURN _row;
END;
$$;

-- RPC 3: release stale locks
CREATE OR REPLACE FUNCTION public.release_stale_quote_send_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _count integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  WITH released AS (
    UPDATE public.sales_quote_send_queue
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        locked_at = NULL,
        last_error = 'Processing lock expired',
        processed_at = CASE WHEN attempts >= max_attempts THEN now() ELSE processed_at END,
        updated_at = now()
    WHERE status = 'processing'
      AND locked_at IS NOT NULL
      AND locked_at < now() - interval '10 minutes'
    RETURNING id
  )
  SELECT count(*) INTO _count FROM released;

  RETURN _count;
END;
$$;