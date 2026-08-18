-- 336-down.sql -- rollback for migration 336 (task 1.1)
-- Recreates the dead posting path exactly as captured from the live database
-- on 2026-08-18 BEFORE the drop, via pg_get_functiondef / pg_get_triggerdef.
-- Apply with: docker cp + psql -f   (contains Persian; never pipe)
SET client_encoding='UTF8';
BEGIN;

-- 1. the no-op function
CREATE OR REPLACE FUNCTION public.post_receipt_journal(_receipt_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- NEUTRALIZED (migration 149). Model B (post_receipt_accounting) is the
  -- authoritative ledger path. This former Path A wrote
  -- account_kind='accounting_code', which the journal_lines CHECK forbids, and
  -- it duplicated posting. Kept (not dropped) with its trigger
  -- trg_payment_receipts_post_journal intact for history; it now does nothing,
  -- so the approve UPDATE succeeds and only Path B posts.
  RETURN NULL;
END;
$function$;

-- 2. the trigger that fired it
CREATE TRIGGER trg_payment_receipts_post_journal AFTER INSERT OR UPDATE OF status ON public.payment_receipts FOR EACH ROW EXECUTE FUNCTION trg_post_receipt_on_approve();

COMMIT;
