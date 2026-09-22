-- Revert 575 activity reminder fields
DROP FUNCTION IF EXISTS public.materialize_due_activity_reminders();

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
    'daily_accrual_summary'::text,
    'sales_interaction_assigned'::text
  ]));

ALTER TABLE public.sales_interactions DROP COLUMN IF EXISTS reminder_fired_at;
ALTER TABLE public.sales_interactions DROP COLUMN IF EXISTS reminder_enabled;
