SET client_encoding='UTF8';

-- ============================================================================
-- 493 - notification_queue accepts the daily accrual summary type.
-- ============================================================================
--
-- WHY THIS IS A SEPARATE MIGRATION FROM 492
-- ---------------------------------------------------------------------------
-- 492 shipped notify_accountants_daily_accrual_summary writing
-- type='daily_accrual_summary'. The first live run of it failed:
--
--   ERROR: new row for relation "notification_queue" violates check constraint
--          "notification_queue_type_check"
--
-- notification_queue carries a type CHECK that neither the mission brief nor the
-- groundwork research mentioned -- the research documented the table's columns and
-- its 1,692 rows but not this constraint. Measured after the failure:
--
--   CHECK (type = ANY (ARRAY['stock_alert','system','task','payment',
--                            'sale_price_change','birthday','quote_rejected']))
--
-- 492 was already applied to the live database and its ledger row already
-- recorded, so CLAUDE.md rule 6 ("never edit an existing migration file") applies:
-- the fix is a new migration, not a rewrite of that one. The function itself is
-- correct and is not changed.
--
-- SAFE: all 1,692 existing rows carry type='sale_price_change', the only value in
-- use, so widening the list cannot invalidate a single row.
-- ============================================================================

ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_type_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_type_check
  CHECK (type = ANY (ARRAY[
    'stock_alert', 'system', 'task', 'payment',
    'sale_price_change', 'birthday', 'quote_rejected',
    'daily_accrual_summary'
  ]));

COMMENT ON CONSTRAINT notification_queue_type_check ON public.notification_queue IS
  'هفت نوع پیشین به‌علاوهٔ خلاصهٔ روزانهٔ اسناد تعهدی (D-32، موج ۶).';
