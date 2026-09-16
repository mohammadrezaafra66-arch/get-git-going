SET client_encoding='UTF8';
-- Reverse of 547: drop trigger/fn; restore CHECK to 493 list (without sales_interaction_assigned).

DROP TRIGGER IF EXISTS trg_notify_sales_interaction_assigned ON public.sales_interactions;
DROP FUNCTION IF EXISTS public.notify_sales_interaction_assigned();

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_type_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_type_check
  CHECK (type = ANY (ARRAY[
    'stock_alert'::text,
    'system'::text,
    'task'::text,
    'payment'::text,
    'sale_price_change'::text,
    'birthday'::text,
    'quote_rejected'::text,
    'daily_accrual_summary'::text
  ]));
