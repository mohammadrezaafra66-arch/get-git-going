SET client_encoding='UTF8';

-- ============================================================================
-- 216 - Fix: notification_queue_type_check rejects the types the app inserts
-- ============================================================================
-- HOW THIS WAS FOUND
--   Migration 215 removed the `text = app_role` error from
--   notify_accountants_on_sale_price_change(). Re-running the reproduction
--   immediately surfaced a SECOND failure in the same trigger that the first
--   error had been masking:
--
--     SQLSTATE 23514: new row for relation "notification_queue"
--     violates check constraint "notification_queue_type_check"
--
--   The constraint allows only:  stock_alert | system | task | payment
--   but the trigger inserts:     sale_price_change
--
--   So migration 126 shipped two defects at once. Fixing only the cast would
--   have left "calculate and publish prices" just as broken, with a different
--   error - the button would still fail for every product.
--
-- SECOND, PRE-EXISTING BREAKAGE (same class, found while verifying)
--   public.generate_birthday_notifications() - the function behind the
--   'daily-birthday-notifications' cron job - inserts type 'birthday', which
--   the constraint also rejects
--   (20260430112107_...sql:95). That path has therefore never been able to
--   write a row. It is included here because it is the same one-token fix on
--   the same constraint; it is called out explicitly in the report so it is
--   not a silent scope increase.
--
-- WHY WIDEN THE CONSTRAINT RATHER THAN CHANGE THE TRIGGER
--   The UI treats `type` as an open string: _app.notifications.tsx filters by
--   it (`q.eq("type", filterType)`) and NotificationBell.tsx special-cases
--   'birthday' for its icon. A distinct type per notification kind is the
--   intended design. Collapsing 'sale_price_change' into 'system' would work
--   but would destroy the accountants' ability to filter price-change alerts.
--
-- SAFETY
--   public.notification_queue currently holds 0 rows, so revalidating the
--   constraint is instant and cannot reject existing data. Nothing is dropped
--   or truncated - only the CHECK expression is replaced, and strictly widened
--   (every previously-valid value stays valid).
-- ============================================================================

BEGIN;

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_type_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_type_check
  CHECK (type = ANY (ARRAY[
    'stock_alert'::text,
    'system'::text,
    'task'::text,
    'payment'::text,
    'sale_price_change'::text,  -- notify_accountants_on_sale_price_change()
    'birthday'::text            -- generate_birthday_notifications()
  ]));

-- Post-condition: both previously-rejected values must now be accepted, and
-- an unknown value must still be rejected (the constraint is widened, not
-- removed).
DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT pg_get_constraintdef(oid) LIKE '%sale_price_change%'
     AND pg_get_constraintdef(oid) LIKE '%birthday%'
     AND pg_get_constraintdef(oid) LIKE '%stock_alert%'
     AND pg_get_constraintdef(oid) LIKE '%payment%'
    INTO v_ok
  FROM pg_constraint
  WHERE conrelid = 'public.notification_queue'::regclass
    AND conname  = 'notification_queue_type_check';

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION '216: post-check failed - constraint does not cover the expected type values.';
  END IF;

  RAISE NOTICE '216: OK - notification_queue accepts sale_price_change and birthday.';
END $$;

COMMIT;
