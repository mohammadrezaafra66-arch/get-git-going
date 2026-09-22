SET client_encoding TO 'UTF8';

-- ============================================================================
-- 575 — activity reminder columns + read-time materialize RPC (Wave 4 D6)
-- ============================================================================
-- NO pg_cron. NotificationBell (30s poll) calls materialize_due_activity_reminders().
-- Adds: reminder_enabled, reminder_fired_at
-- Widens notification_queue_type_check with sales_activity_reminder
-- Persian via convert_from(decode(hex)) — AGENTS.md
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/575_activity_reminder_fields.sql
-- ============================================================================

SET lock_timeout = '60s';

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS reminder_fired_at timestamptz NULL;

COMMENT ON COLUMN public.sales_interactions.reminder_enabled IS
  'In-app reminder when due_has_time; Wave 4 D6 mig 575.';

COMMENT ON COLUMN public.sales_interactions.reminder_fired_at IS
  'Set when reminder materialized into notification_queue; Wave 4 D6.';

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
    'sales_interaction_assigned'::text,
    'sales_activity_reminder'::text
  ]));

CREATE OR REPLACE FUNCTION public.materialize_due_activity_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r record;
  n int := 0;
  v_title text;
  v_body text;
  v_default_title text := convert_from(decode('db8cd8a7d8afd8a2d988d8b120d981d8b9d8a7d984db8cd8aa', 'hex'), 'UTF8');
  v_default_body text := convert_from(decode('d985d988d8b9d8af20d981d8b9d8a7d984db8cd8aa20d981d8b1d8a720d8b1d8b3db8cd8afd98720d8a7d8b3d8aa', 'hex'), 'UTF8');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT si.id, si.title, si.body, si.due_at, si.salesperson_id, si.deal_id
      FROM public.sales_interactions si
     WHERE si.salesperson_id = auth.uid()
       AND si.reminder_enabled = true
       AND si.due_has_time = true
       AND si.done_at IS NULL
       AND si.reminder_fired_at IS NULL
       AND si.due_at IS NOT NULL
       AND si.due_at <= now()
     LIMIT 20
  LOOP
    v_title := coalesce(nullif(btrim(r.title), ''), v_default_title);
    v_body := coalesce(nullif(btrim(r.body), ''), v_default_body);

    INSERT INTO public.notification_queue (
      user_id, title, body, type, reference_type, reference_id
    ) VALUES (
      r.salesperson_id,
      v_title,
      v_body,
      'sales_activity_reminder',
      'sales_interaction',
      r.id
    );

    UPDATE public.sales_interactions
       SET reminder_fired_at = now()
     WHERE id = r.id;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$fn$;

COMMENT ON FUNCTION public.materialize_due_activity_reminders() IS
  'Wave 4 D6: read-time reminder enqueue for NotificationBell poll. No pg_cron.';

GRANT EXECUTE ON FUNCTION public.materialize_due_activity_reminders()
  TO authenticated;
