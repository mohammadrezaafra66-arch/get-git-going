-- =====================================================================
-- 135a - Scope the invoice gamification trigger to real scoring columns
-- =====================================================================
--
-- WHY THIS MIGRATION EXISTS
--
-- trg_invoices_recompute_employee_score was created in
-- 20260430201059_cbcd6677-f87a-4842-a3ac-5a710470edd6.sql as:
--
--     AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW
--
-- It carries no column list, so it fires on EVERY update of any invoice
-- column. Each fire runs calculate_employee_score() and inserts a row into
-- employee_score_events with event_type = 'invoice_update'.
--
-- Migration 20260722150000_135_invoice_accounting_markers.sql adds four
-- purely clerical columns to public.invoices:
--
--     accounting_registered_at, accounting_registered_by,
--     accounting_sent_at,       accounting_sent_by
--
-- Without this migration, every click on the accounting markers in the UI
-- would recompute an employee's score and append a bogus gamification
-- event. Accounting bookkeeping must not affect sales scoring.
--
-- ---------------------------------------------------------------------
-- WHICH COLUMNS ACTUALLY AFFECT THE SCORE
--
-- public.calculate_employee_score(uuid) reads public.invoices in three
-- places only. The columns it depends on are:
--
--     created_by    - employee attribution; every query filters on it
--     total_amount  - summed for total_sales and the collected blend
--     created_at    - buckets rows into daily/weekly/monthly periods
--     status        - collected amount excludes ('draft','cancelled')
--
-- Row count also matters (deals_registered), but that only changes on
-- INSERT or DELETE, which stay in scope below.
--
-- The four accounting marker columns are read nowhere in
-- calculate_employee_score nor in recompute_employee_scores_on_invoice,
-- so they cannot influence any KPI and are safely excluded.
--
-- ---------------------------------------------------------------------
-- ROLLBACK
--
-- To restore the previous unscoped behaviour:
--
--     DROP TRIGGER IF EXISTS trg_invoices_recompute_employee_score
--       ON public.invoices;
--
--     CREATE TRIGGER trg_invoices_recompute_employee_score
--       AFTER INSERT OR UPDATE OR DELETE ON public.invoices
--       FOR EACH ROW
--       EXECUTE FUNCTION public.recompute_employee_scores_on_invoice();
--
-- Note: rolling back re-enables the pollution described above.
--
-- ---------------------------------------------------------------------
-- SCOPE NOTE
--
-- The trigger function public.recompute_employee_scores_on_invoice() is
-- intentionally NOT modified here. Only the trigger binding changes.
-- =====================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_invoices_recompute_employee_score ON public.invoices;

CREATE TRIGGER trg_invoices_recompute_employee_score
  AFTER INSERT OR DELETE OR UPDATE OF
    created_by,
    total_amount,
    created_at,
    status
  ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_employee_scores_on_invoice();

COMMIT;
