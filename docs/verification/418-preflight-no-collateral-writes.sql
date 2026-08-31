BEGIN;
DO $p$
DECLARE
  b_audit int; b_stock int; b_notifq int; b_ccb int; b_ccad int; b_ledger int; b_tasks int;
  a_audit int; a_stock int; a_notifq int; a_ccb int; a_ccad int; a_ledger int; a_tasks int;
  _n int; _still_null int;
BEGIN
  SELECT count(*) INTO b_audit  FROM public.audit_logs;
  SELECT count(*) INTO b_stock  FROM public.stock_movements;
  SELECT count(*) INTO b_notifq FROM public.notification_queue;
  SELECT count(*) INTO b_ccb    FROM public.customer_credit_balance;
  SELECT count(*) INTO b_ccad   FROM public.customer_capital_allocations_dynamic;
  SELECT count(*) INTO b_ledger FROM public.capital_allocation_ledger;
  SELECT count(*) INTO b_tasks  FROM public.tasks;

  -- THE EXACT BACKFILL, rolled back. Nothing is kept.
  WITH ev AS (
    SELECT a.entity_id, a.created_at,
           row_number() OVER (PARTITION BY a.entity_id ORDER BY a.created_at) AS rn
    FROM public.audit_logs a
    WHERE a.entity_type='sales_quotes' AND a.action='sales_quote_status_changed'
      AND a.diff->>'new_status'='accepted'
  )
  UPDATE public.sales_quotes q
     SET accepted_at = e.created_at
    FROM ev e
   WHERE e.entity_id = q.id::text AND e.rn = 1
     AND q.status = 'accepted' AND q.accepted_at IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;

  SELECT count(*) INTO a_audit  FROM public.audit_logs;
  SELECT count(*) INTO a_stock  FROM public.stock_movements;
  SELECT count(*) INTO a_notifq FROM public.notification_queue;
  SELECT count(*) INTO a_ccb    FROM public.customer_credit_balance;
  SELECT count(*) INTO a_ccad   FROM public.customer_capital_allocations_dynamic;
  SELECT count(*) INTO a_ledger FROM public.capital_allocation_ledger;
  SELECT count(*) INTO a_tasks  FROM public.tasks;
  SELECT count(*) INTO _still_null FROM public.sales_quotes WHERE status='accepted' AND accepted_at IS NULL;

  RAISE NOTICE 'rows updated              : %  [want 9]', _n;
  RAISE NOTICE 'still NULL after          : %  [want 0]', _still_null;
  RAISE NOTICE 'audit_logs        delta   : %', a_audit  - b_audit;
  RAISE NOTICE 'stock_movements   delta   : %', a_stock  - b_stock;
  RAISE NOTICE 'notification_queue delta  : %', a_notifq - b_notifq;
  RAISE NOTICE 'customer_credit_balance   : %', a_ccb    - b_ccb;
  RAISE NOTICE 'capital_allocations_dyn   : %', a_ccad   - b_ccad;
  RAISE NOTICE 'capital_allocation_ledger : %', a_ledger - b_ledger;
  RAISE NOTICE 'tasks             delta   : %', a_tasks  - b_tasks;
END
$p$;
ROLLBACK;
