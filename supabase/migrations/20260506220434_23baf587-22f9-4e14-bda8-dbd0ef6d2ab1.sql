
-- Phase 21.4: ممنوعیت صدور فاکتور برای مشتری دارای مانده معوق
-- Backend-enforced: RPC + Trigger روی invoices هنگام تعهد واقعی (commitment/issue/hold).
-- sales_quotes در این فاز خارج از enforcement است (customer_id ندارد).

-- 1) RPC کنترلی
CREATE OR REPLACE FUNCTION public.can_issue_customer_invoice(p_customer_id uuid)
RETURNS TABLE(
  can_issue boolean,
  customer_id uuid,
  overdue_amount numeric,
  overdue_count integer,
  oldest_due_date date,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_amount numeric := 0;
  v_count  integer := 0;
  v_oldest date;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id الزامی است' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(outstanding_amount),0)::numeric,
         COUNT(*)::int,
         MIN(due_date)
    INTO v_amount, v_count, v_oldest
  FROM public.vw_customer_receivables
  WHERE customer_id = p_customer_id
    AND is_overdue = true
    AND outstanding_amount > 0;

  IF v_count = 0 THEN
    RETURN QUERY SELECT true, p_customer_id, 0::numeric, 0, NULL::date, NULL::text;
  ELSE
    RETURN QUERY SELECT
      false,
      p_customer_id,
      v_amount,
      v_count,
      v_oldest,
      'این مشتری دارای مانده معوق است و تا زمان تسویه، امکان صدور فاکتور یا پیش‌فاکتور جدید ندارد.'::text;
  END IF;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_issue_customer_invoice(uuid) IS
'Phase 21.4: بررسی مجاز بودن صدور فاکتور/پیش‌فاکتور برای یک مشتری بر اساس مانده معوق در vw_customer_receivables. read-only و SECURITY DEFINER.';

-- 2) Trigger enforcement روی invoices هنگام تعهد واقعی
--    Block اگر:
--      INSERT با commitment_confirmed=true یا invoice_type='pre_invoice'
--      UPDATE که commitment_confirmed را از false→true می‌کند
--    draft ساده (بدون تعهد) بلاک نمی‌شود.
CREATE OR REPLACE FUNCTION public.enforce_no_overdue_on_commitment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_check_required boolean := false;
  v_can boolean;
  v_amount numeric;
  v_count integer;
  v_oldest date;
  v_reason text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.commitment_confirmed,false) = true
       OR COALESCE(NEW.invoice_type,'') = 'pre_invoice' THEN
      v_check_required := true;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.commitment_confirmed,false) = true
       AND COALESCE(OLD.commitment_confirmed,false) = false THEN
      v_check_required := true;
    END IF;
  END IF;

  IF NOT v_check_required THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT can_issue, overdue_amount, overdue_count, oldest_due_date, reason
    INTO v_can, v_amount, v_count, v_oldest, v_reason
  FROM public.can_issue_customer_invoice(NEW.customer_id);

  IF v_can = false THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES (auth.uid(), 'invoice_issuance_blocked_overdue', 'invoice',
            COALESCE(NEW.id::text, NEW.customer_id::text),
            jsonb_build_object(
              'customer_id', NEW.customer_id,
              'overdue_amount', v_amount,
              'overdue_count', v_count,
              'oldest_due_date', v_oldest,
              'invoice_type', NEW.invoice_type,
              'commitment_confirmed', NEW.commitment_confirmed
            ));
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_enforce_no_overdue_on_commitment ON public.invoices;
CREATE TRIGGER trg_enforce_no_overdue_on_commitment
BEFORE INSERT OR UPDATE OF commitment_confirmed, invoice_type, customer_id
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_no_overdue_on_commitment();
