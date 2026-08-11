SET client_encoding='UTF8';

-- ============================================================================
-- 330 — Condition 3, part 2: the four triggers on tables that SURVIVE the
--       invoices drop.
-- ============================================================================
--
-- These are the sharp ones. All four are triggers on payment_receipts /
-- payment_receipt_links -- tables that are NOT going away -- so unlike the invoice-only
-- functions they would not disappear with the table. They would keep firing and fail at
-- RUNTIME on the next receipt write, long after the DROP migration reported success.
--
-- Baseline measured live before writing: payment_receipt_links holds 3 rows and ZERO with
-- a non-null invoice_id; public.invoices holds 0 rows. Every invoice branch below is
-- therefore unreachable today, which is what makes these edits provably
-- behaviour-preserving rather than estimated -- the same argument migration 327 used and
-- then confirmed with a byte-for-byte old-vs-new posting test.
--
-- ---------------------------------------------------------------------------
-- The one judgement call, stated plainly
-- ---------------------------------------------------------------------------
-- In the two MONEY GUARDS the invoice branch is not dead weight, it is a CAP: it stops an
-- allocation exceeding the document's remaining balance. payment_receipt_links.invoice_id
-- still exists and its XOR CHECK still permits it, so simply deleting that branch would
-- leave a still-creatable row with NO cap at all. These two therefore REJECT the invoice
-- path explicitly instead. That is strictly tighter than today and never looser.
--
-- recompute_employee_scores_on_receipt is the opposite case and is called out in its own
-- comment: invoices was its ONLY way to resolve an employee, so it has never awarded a
-- point. It is left inert rather than repointed at sales_quotes, because repointing would
-- start moving real scores -- a product decision, not a cleanup side effect.
--
-- All four are patched from their LIVE definitions in docs/verification/pre-330/
-- (AGENTS.md rule 4), each anchor asserted to match exactly once, and each verified to
-- have exactly one overload (rule 5).
--
-- Down-script: docs/verification/330-down.sql
-- ============================================================================

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
      'مجموع تخصیص‌های این فیش برابر % تومان می‌شود که از مبلغ خود فیش (% تومان) بیشتر است.',
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
        'مبلغ تخصیص‌یافته (% تومان) از مانده پیش‌فاکتور % بیشتر است. مانده قابل تخصیص: % تومان.',
        to_char(NEW.amount, 'FM999,999,999,999'),
        v_doc_number,
        to_char(GREATEST(v_doc_total - v_doc_paid_other, 0), 'FM999,999,999,999')
        USING ERRCODE = '23514';
    END IF;

  ELSIF NEW.invoice_id IS NOT NULL THEN
    -- 330: the invoice branch used to read the invoices table to cap the allocation.
    -- It is NOT simply deleted: payment_receipt_links.invoice_id still exists and the
    -- XOR CHECK still permits it, so deleting the branch would remove a MONEY CAP from a
    -- row that can still be created. Rejecting outright is strictly tighter than the old
    -- behaviour and never looser. Zero rows use this path (measured: 0 links with a
    -- non-null invoice_id), the invoice UI was removed by migration 323, and the table is
    -- scheduled for removal.
    RAISE EXCEPTION 'تخصیص فیش به «فاکتور» دیگر پشتیبانی نمی‌شود؛ زیرسیستم فاکتور بازنشسته شده است. از پیش‌فاکتور استفاده کنید.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

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
          'با تأیید این فیش، مجموع پرداخت‌های تأییدشده پیش‌فاکتور % برابر % تومان می‌شود که از مبلغ کل آن (% تومان) بیشتر است.',
          v_doc_number,
          to_char(v_paid_other + r.amount, 'FM999,999,999,999'),
          to_char(v_doc_total, 'FM999,999,999,999')
          USING ERRCODE = '23514';
      END IF;

    ELSIF r.invoice_id IS NOT NULL THEN
    -- 330: the invoice branch used to read the invoices table to cap the allocation.
    -- It is NOT simply deleted: payment_receipt_links.invoice_id still exists and the
    -- XOR CHECK still permits it, so deleting the branch would remove a MONEY CAP from a
    -- row that can still be created. Rejecting outright is strictly tighter than the old
    -- behaviour and never looser. Zero rows use this path (measured: 0 links with a
    -- non-null invoice_id), the invoice UI was removed by migration 323, and the table is
    -- scheduled for removal.
    RAISE EXCEPTION 'تخصیص فیش به «فاکتور» دیگر پشتیبانی نمی‌شود؛ زیرسیستم فاکتور بازنشسته شده است. از پیش‌فاکتور استفاده کنید.'
      USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _whitelist text[] := ARRAY['approved','verified','confirmed','posted'];
  _old_status text;
  _new_status text;
  _receipt_id uuid;
  _should_run boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _new_status := NEW.status;
    _receipt_id := NEW.id;
    _should_run := (_new_status = ANY(_whitelist));
  ELSIF TG_OP = 'DELETE' THEN
    _old_status := OLD.status;
    _receipt_id := OLD.id;
    _should_run := (_old_status = ANY(_whitelist));
  ELSE -- UPDATE
    _old_status := OLD.status;
    _new_status := NEW.status;
    _receipt_id := COALESCE(NEW.id, OLD.id);
    _should_run := (_old_status IS DISTINCT FROM _new_status)
                   AND ( (_old_status = ANY(_whitelist)) OR (_new_status = ANY(_whitelist)) );
  END IF;

  IF NOT _should_run THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 330: this loop resolved the salesperson by joining payment_receipt_links to
  -- the invoices table. That was the function's ONLY way to find anyone, and there are zero
  -- links with a non-null invoice_id, so this trigger has never awarded a single point.
  -- The join is removed here because it would fail at runtime once invoices is dropped.
  --
  -- NOT repointed at sales_quotes on purpose. Doing so would switch this trigger from
  -- "never fires" to "fires for 50 live quotes", creating employee_score_events and
  -- moving real scores. That is a product decision, not a side effect of a cleanup
  -- migration. Until it is made, receipt-status scoring stays inert -- exactly as it has
  -- been in practice all along. The sibling trigger
  -- recompute_employee_scores_on_receipt_link DOES have a working quote branch and is
  -- unaffected.

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_receipt_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _emp uuid;
  _invoice_id uuid;
  _quote_id uuid;
  _link_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _invoice_id := NEW.invoice_id;
    _quote_id := NEW.quote_id;
    _link_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    _invoice_id := OLD.invoice_id;
    _quote_id := OLD.quote_id;
    _link_id := OLD.id;
  ELSE
    _invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
    _quote_id := COALESCE(NEW.quote_id, OLD.quote_id);
    _link_id := COALESCE(NEW.id, OLD.id);
  END IF;

  -- NOTE: resolution uses public.has_role(uuid, app_role) rather than a direct
  -- JOIN on user_roles.role. user_roles.role is TEXT, so the original invoice
  -- branch's `ur.role = 'sales'::app_role` raised `text = app_role` at runtime —
  -- a latent bug that never fired only because no receipt link ever existed.
  -- has_role is the codebase's proven role check and handles NULL gracefully.
  -- 330: the invoice-linked branch (salesperson = invoice creator) was removed; it read
  -- the invoices table, which is being retired, and no link has ever had a non-null
  -- invoice_id. The quote branch below is the live path and is untouched. _invoice_id is
  -- still read from the row and still reported in the event payload, so the payload shape
  -- does not change.
  IF _quote_id IS NOT NULL THEN
    -- Quote-linked: salesperson is the quote's salesperson.
    SELECT q.salesperson_id INTO _emp
    FROM public.sales_quotes q
    WHERE q.id = _quote_id
      AND public.has_role(q.salesperson_id, 'sales'::public.app_role);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF _emp IS NOT NULL THEN
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (
        _emp,
        'receipt_link_'||lower(TG_OP),
        'payment_receipt_links',
        _link_id::text,
        jsonb_build_object('op', TG_OP, 'invoice_id', _invoice_id, 'quote_id', _quote_id)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

-- ---------------------------------------------------------------------------
-- Assertions, inside the same transaction.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE _refs int; _dup int; _live int;
BEGIN
  SELECT count(*) INTO _refs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('enforce_payment_receipt_link_limits','enforce_receipt_approval_allocation_limits',
                       'recompute_employee_scores_on_receipt','recompute_employee_scores_on_receipt_link')
     AND pg_get_functiondef(p.oid) ~* 'public\.invoices';
  IF _refs <> 0 THEN
    RAISE EXCEPTION '330: % of the four still reference public.invoices', _refs;
  END IF;

  SELECT count(*) INTO _dup
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('enforce_payment_receipt_link_limits','enforce_receipt_approval_allocation_limits',
                       'recompute_employee_scores_on_receipt','recompute_employee_scores_on_receipt_link');
  IF _dup <> 4 THEN
    RAISE EXCEPTION '330: expected exactly 4 functions (no overloads), found %', _dup;
  END IF;

  -- All four triggers must still be attached; a rewrite that silently detaches one would
  -- disable a money guard without any error.
  SELECT count(*) INTO _live
    FROM pg_trigger t JOIN pg_proc pr ON pr.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND pr.proname IN ('enforce_payment_receipt_link_limits','enforce_receipt_approval_allocation_limits',
                        'recompute_employee_scores_on_receipt','recompute_employee_scores_on_receipt_link');
  IF _live <> 4 THEN
    RAISE EXCEPTION '330: expected 4 attached triggers, found %', _live;
  END IF;

  RAISE NOTICE '330 OK: 4 rewritten, 0 references to invoices, 4 triggers still attached';
END
$do$;
