-- =====================================================================
-- 152 - Phase 3: enforce receipt allocation limits at the database level
-- =====================================================================
-- Until now allocation limits existed ONLY in PaymentReceiptForm.tsx. Anything
-- reaching payment_receipt_links another way -- a direct PostgREST call, a
-- future import, a bug -- could over-allocate money silently.
--
-- A CHECK constraint cannot express either rule: both have to look at other
-- rows. Row triggers are the realistic mechanism.
--
-- TWO GUARDS, because one is not enough:
--
--   (1) BEFORE INSERT OR UPDATE ON payment_receipt_links
--       - total allocations for a receipt may not exceed that receipt's amount
--       - an allocation may not exceed the target document's remaining balance
--       Remaining balance uses APPROVED receipts only, exactly matching the
--       rule PaymentReceiptForm.tsx displays (it sums links whose receipt
--       status is 'approved'). Using a stricter rule here would reject
--       allocations the form itself just told the accountant were available --
--       a guard that rejects legitimate work is worse than no guard.
--
--   (2) BEFORE UPDATE ON payment_receipts, when status becomes 'approved'
--       Guard (1) alone leaves a real hole: while receipts are pending_review
--       their allocations do not count toward any balance, so N pending
--       receipts can each claim the full balance and every one of them can
--       then be approved. That is money posted twice. Guard (2) re-checks at
--       the moment an allocation actually starts counting, which is the only
--       point where over-allocation becomes real.
--
-- CONCURRENCY
--   Both guards take row locks BEFORE reading the sums they validate against,
--   so two transactions cannot both read a stale "remaining" and both pass:
--     - guard (1) locks payment_receipts (the receipt) FOR UPDATE first, then
--       the target document row FOR UPDATE. Two concurrent inserts for the SAME
--       receipt serialise on the receipt lock; the second one's SUM therefore
--       sees the first one's committed row. Two concurrent allocations against
--       the SAME document serialise on the document lock.
--     - guard (2) locks each target document FOR UPDATE, iterating in a
--       canonical id order.
--   Lock order is always receipt-then-document, so the ordinary cases cannot
--   deadlock. A deadlock remains theoretically reachable if two transactions
--   each insert several links touching the same two documents in opposite
--   orders; PostgreSQL detects that and aborts one transaction with a deadlock
--   error. That fails safe -- the insert is rejected, no money is written.
--
-- The client-side validation stays. This is defense in depth, not a
-- replacement.
--
-- Error messages are Persian and quote the real figures, because
-- PaymentReceiptForm.tsx surfaces linkErr.message straight to the accountant.
-- ERRCODE 23514 (check_violation) keeps PostgREST returning 400, not 500.
--
-- APPLY WITH:
--   psql -U supabase_admin -d afrakala --single-transaction -v ON_ERROR_STOP=1 \
--        -f 20260724120000_152_enforce_allocation_limits.sql
-- No BEGIN/COMMIT here on purpose: an inner COMMIT would close psql's
-- --single-transaction wrapper early.
--
-- ROLLBACK:
--   DROP TRIGGER trg_payment_receipt_links_enforce_limits ON public.payment_receipt_links;
--   DROP TRIGGER trg_payment_receipts_enforce_allocation_on_approve ON public.payment_receipts;
--   DROP FUNCTION public.enforce_payment_receipt_link_limits();
--   DROP FUNCTION public.enforce_receipt_approval_allocation_limits();
-- =====================================================================

SET client_encoding TO 'UTF8';

-- ---------------------------------------------------------------------
-- Guard 1: per-link limits
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payment_receipt_link_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt_amount   numeric;
  v_allocated_other  numeric;
  v_doc_total        numeric;
  v_doc_paid_other   numeric;
  v_doc_number       text;
BEGIN
  -- Lock the receipt FIRST (always this order) so concurrent inserts for the
  -- same receipt serialise here instead of both reading a stale total.
  SELECT amount
    INTO v_receipt_amount
    FROM public.payment_receipts
   WHERE id = NEW.receipt_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فیش پرداخت مورد نظر یافت نشد.'
      USING ERRCODE = '23503';
  END IF;

  -- Rule 1: sum of this receipt's allocations may not exceed the receipt amount.
  -- NEW.id is already populated here (column defaults are applied before BEFORE
  -- triggers run), so the same predicate works for INSERT and UPDATE.
  SELECT COALESCE(SUM(amount), 0)
    INTO v_allocated_other
    FROM public.payment_receipt_links
   WHERE receipt_id = NEW.receipt_id
     AND id <> NEW.id;

  IF v_allocated_other + NEW.amount > v_receipt_amount THEN
    RAISE EXCEPTION
      'مجموع تخصیص‌های این فیش برابر % ریال می‌شود که از مبلغ خود فیش (% ریال) بیشتر است.',
      to_char(v_allocated_other + NEW.amount, 'FM999,999,999,999'),
      to_char(v_receipt_amount, 'FM999,999,999,999')
      USING ERRCODE = '23514';
  END IF;

  -- Rule 2: the allocation may not exceed the target document's remaining
  -- balance. Remaining counts APPROVED receipts only -- the same rule the form
  -- shows the accountant.
  IF NEW.quote_id IS NOT NULL THEN
    SELECT final_amount, quote_number
      INTO v_doc_total, v_doc_number
      FROM public.sales_quotes
     WHERE id = NEW.quote_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'پیش‌فاکتور مورد نظر یافت نشد.'
        USING ERRCODE = '23503';
    END IF;

    SELECT COALESCE(SUM(l.amount), 0)
      INTO v_doc_paid_other
      FROM public.payment_receipt_links l
      JOIN public.payment_receipts r ON r.id = l.receipt_id
     WHERE l.quote_id = NEW.quote_id
       AND l.id <> NEW.id
       AND r.status = 'approved';

    IF v_doc_paid_other + NEW.amount > v_doc_total THEN
      RAISE EXCEPTION
        'مبلغ تخصیص‌یافته (% ریال) از مانده پیش‌فاکتور % بیشتر است. مانده قابل تخصیص: % ریال.',
        to_char(NEW.amount, 'FM999,999,999,999'),
        v_doc_number,
        to_char(GREATEST(v_doc_total - v_doc_paid_other, 0), 'FM999,999,999,999')
        USING ERRCODE = '23514';
    END IF;

  ELSIF NEW.invoice_id IS NOT NULL THEN
    -- Invoices are a dead parallel design (0 rows) but the column still exists
    -- and the XOR CHECK still permits it, so the guard covers it symmetrically.
    -- Remaining mirrors vw_customer_receivables: total - deposit - approved.
    SELECT total_amount - COALESCE(deposit_amount, 0), number
      INTO v_doc_total, v_doc_number
      FROM public.invoices
     WHERE id = NEW.invoice_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'فاکتور مورد نظر یافت نشد.'
        USING ERRCODE = '23503';
    END IF;

    SELECT COALESCE(SUM(l.amount), 0)
      INTO v_doc_paid_other
      FROM public.payment_receipt_links l
      JOIN public.payment_receipts r ON r.id = l.receipt_id
     WHERE l.invoice_id = NEW.invoice_id
       AND l.id <> NEW.id
       AND r.status = 'approved';

    IF v_doc_paid_other + NEW.amount > v_doc_total THEN
      RAISE EXCEPTION
        'مبلغ تخصیص‌یافته (% ریال) از مانده فاکتور % بیشتر است. مانده قابل تخصیص: % ریال.',
        to_char(NEW.amount, 'FM999,999,999,999'),
        v_doc_number,
        to_char(GREATEST(v_doc_total - v_doc_paid_other, 0), 'FM999,999,999,999')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payment_receipt_links_enforce_limits ON public.payment_receipt_links;
CREATE TRIGGER trg_payment_receipt_links_enforce_limits
  BEFORE INSERT OR UPDATE OF amount, receipt_id, invoice_id, quote_id
  ON public.payment_receipt_links
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payment_receipt_link_limits();

-- ---------------------------------------------------------------------
-- Guard 2: re-check at approval, when allocations start counting
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_receipt_approval_allocation_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r                RECORD;
  v_doc_total      numeric;
  v_doc_number     text;
  v_paid_other     numeric;
BEGIN
  -- Iterate in a canonical id order so concurrent approvals take the document
  -- locks in the same sequence.
  FOR r IN
    SELECT l.quote_id, l.invoice_id, l.amount
      FROM public.payment_receipt_links l
     WHERE l.receipt_id = NEW.id
     ORDER BY l.quote_id NULLS LAST, l.invoice_id NULLS LAST
  LOOP
    IF r.quote_id IS NOT NULL THEN
      SELECT final_amount, quote_number
        INTO v_doc_total, v_doc_number
        FROM public.sales_quotes
       WHERE id = r.quote_id
         FOR UPDATE;

      SELECT COALESCE(SUM(l.amount), 0)
        INTO v_paid_other
        FROM public.payment_receipt_links l
        JOIN public.payment_receipts pr ON pr.id = l.receipt_id
       WHERE l.quote_id = r.quote_id
         AND l.receipt_id <> NEW.id
         AND pr.status = 'approved';

      IF v_paid_other + r.amount > v_doc_total THEN
        RAISE EXCEPTION
          'با تأیید این فیش، مجموع پرداخت‌های تأییدشده پیش‌فاکتور % برابر % ریال می‌شود که از مبلغ کل آن (% ریال) بیشتر است.',
          v_doc_number,
          to_char(v_paid_other + r.amount, 'FM999,999,999,999'),
          to_char(v_doc_total, 'FM999,999,999,999')
          USING ERRCODE = '23514';
      END IF;

    ELSIF r.invoice_id IS NOT NULL THEN
      SELECT total_amount - COALESCE(deposit_amount, 0), number
        INTO v_doc_total, v_doc_number
        FROM public.invoices
       WHERE id = r.invoice_id
         FOR UPDATE;

      SELECT COALESCE(SUM(l.amount), 0)
        INTO v_paid_other
        FROM public.payment_receipt_links l
        JOIN public.payment_receipts pr ON pr.id = l.receipt_id
       WHERE l.invoice_id = r.invoice_id
         AND l.receipt_id <> NEW.id
         AND pr.status = 'approved';

      IF v_paid_other + r.amount > v_doc_total THEN
        RAISE EXCEPTION
          'با تأیید این فیش، مجموع پرداخت‌های تأییدشده فاکتور % برابر % ریال می‌شود که از مانده آن (% ریال) بیشتر است.',
          v_doc_number,
          to_char(v_paid_other + r.amount, 'FM999,999,999,999'),
          to_char(v_doc_total, 'FM999,999,999,999')
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payment_receipts_enforce_allocation_on_approve ON public.payment_receipts;
CREATE TRIGGER trg_payment_receipts_enforce_allocation_on_approve
  BEFORE UPDATE OF status
  ON public.payment_receipts
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')
  EXECUTE FUNCTION public.enforce_receipt_approval_allocation_limits();

COMMENT ON FUNCTION public.enforce_payment_receipt_link_limits() IS
  'Phase 3: rejects a receipt allocation that exceeds the receipt amount or the target document''s remaining balance. Locks the receipt then the document FOR UPDATE so concurrent inserts cannot both pass.';

COMMENT ON FUNCTION public.enforce_receipt_approval_allocation_limits() IS
  'Phase 3: re-checks allocation totals when a receipt is approved, closing the window where several pending receipts each claim the same remaining balance.';
