-- 1. Add 'notified' to stock_alert_status enum
ALTER TYPE public.stock_alert_status ADD VALUE IF NOT EXISTS 'notified';

-- 2. notification_queue table
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'stock_alert' CHECK (type IN ('stock_alert','system','task','payment')),
  reference_type text,
  reference_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nq_user ON public.notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_nq_user_unread ON public.notification_queue(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_nq_created ON public.notification_queue(created_at DESC);

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nq_select_own_or_admin ON public.notification_queue;
CREATE POLICY nq_select_own_or_admin ON public.notification_queue
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS nq_update_own ON public.notification_queue;
CREATE POLICY nq_update_own ON public.notification_queue
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No INSERT/DELETE policy: only SECURITY DEFINER trigger inserts.

-- 3. Trigger function for stock_status change
CREATE OR REPLACE FUNCTION public.notify_on_stock_available()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_prices text;
  v_count int := 0;
BEGIN
  IF NEW.stock_status IS DISTINCT FROM OLD.stock_status
     AND NEW.stock_status = 'available'
     AND OLD.stock_status IN ('unavailable','limited','unknown') THEN

    -- Build price summary string (latest per sale_price_type)
    SELECT string_agg(
             COALESCE(spt.name, 'قیمت') || ': ' || to_char(h.new_sale_price, 'FM999,999,999,999'),
             E'\n'
           )
      INTO v_prices
    FROM (
      SELECT DISTINCT ON (sale_price_type_id)
             sale_price_type_id, new_sale_price
      FROM public.product_sale_price_history
      WHERE product_id = NEW.id
      ORDER BY sale_price_type_id, created_at DESC
    ) h
    LEFT JOIN public.sale_price_types spt ON spt.id = h.sale_price_type_id;

    FOR v_req IN
      SELECT id, salesperson_id, customer_name, customer_phone
      FROM public.stock_alert_requests
      WHERE product_id = NEW.id
        AND status = 'open'
        AND salesperson_id IS NOT NULL
      LIMIT 100
    LOOP
      INSERT INTO public.notification_queue(user_id, title, body, type, reference_type, reference_id)
      VALUES (
        v_req.salesperson_id,
        'موجود شدن کالا',
        'محصول «' || COALESCE(NEW.name, '') || '» موجود شد.' || E'\n' ||
        'مشتری: ' || v_req.customer_name || ' (' || v_req.customer_phone || ')' ||
        CASE WHEN v_prices IS NOT NULL THEN E'\n\nقیمت‌ها:\n' || v_prices ELSE '' END,
        'stock_alert',
        'stock_alert_request',
        v_req.id
      );

      UPDATE public.stock_alert_requests
        SET status = 'notified', updated_at = now()
        WHERE id = v_req.id;

      INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
      VALUES ('stock_alert_request', v_req.id::text, 'stock_alert_notified', auth.uid(),
              jsonb_build_object('product_id', NEW.id, 'salesperson_id', v_req.salesperson_id));

      v_count := v_count + 1;
    END LOOP;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't break the product update if notification fails
  RAISE WARNING 'notify_on_stock_available failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_stock_available ON public.products;
CREATE TRIGGER trg_notify_on_stock_available
AFTER UPDATE OF stock_status ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_stock_available();

-- 4. RPCs
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notification_queue
    SET is_read = true, read_at = now()
    WHERE id = p_notification_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.notification_queue
    SET is_read = true, read_at = now()
    WHERE user_id = auth.uid() AND is_read = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;