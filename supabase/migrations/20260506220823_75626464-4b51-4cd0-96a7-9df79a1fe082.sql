
-- Phase 21.4B: حذف audit insert غیرقابل‌اتکا از trigger blocker.
-- علت: INSERT + RAISE EXCEPTION در یک invocation با هم rollback می‌شوند،
-- پس audit_log باقی نمی‌ماند و ادعای ثبت قطعی غلط بود.
-- منطق بلاک تغییری نمی‌کند؛ فقط INSERT داخل trigger حذف می‌شود.
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
    -- توجه: هرگونه INSERT به audit_logs اینجا با همین RAISE rollback می‌شود.
    -- بنابراین audit ثبت بلاک باید سمت UI / فاز جدا با مکانیزم non-transactional انجام شود.
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.enforce_no_overdue_on_commitment() IS
'Phase 21.4B: trigger بلاک‌کننده صدور/تعهد فاکتور برای مشتری دارای مانده معوق. audit ثبت بلاک داخل trigger ممکن نیست (rollback)، باید سمت کلاینت یا فاز جدا انجام شود.';
