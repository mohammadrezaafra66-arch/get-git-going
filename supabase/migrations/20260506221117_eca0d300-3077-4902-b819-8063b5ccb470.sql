
-- Phase 21.4C: RPC امن برای ثبت audit بلاک صدور فاکتور بابت معوقه
-- جایگزین audit_logs.insert مستقیم از frontend.
-- guard: تابع داخلاً دوباره از can_issue_customer_invoice چک می‌کند تا فقط
--        وقتی واقعاً مشتری معوقه دارد لاگ ثبت شود (جلوگیری از لاگ جعلی).
CREATE OR REPLACE FUNCTION public.log_invoice_issuance_blocked_overdue(
  p_customer_id uuid,
  p_overdue_amount numeric,
  p_overdue_count integer,
  p_oldest_due_date date,
  p_invoice_type text DEFAULT NULL,
  p_commitment_confirmed boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id الزامی است' USING ERRCODE = '22023';
  END IF;

  -- محافظت در برابر لاگ جعلی: فقط اگر مشتری واقعاً معوقه دارد، ثبت شود
  SELECT can_issue INTO v_can
  FROM public.can_issue_customer_invoice(p_customer_id);
  IF v_can IS DISTINCT FROM false THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    v_uid,
    'invoice_issuance_blocked_overdue',
    'invoice',
    p_customer_id::text,
    jsonb_build_object(
      'customer_id', p_customer_id,
      'invoice_type', p_invoice_type,
      'commitment_confirmed', p_commitment_confirmed,
      'overdue_amount', p_overdue_amount,
      'overdue_count', p_overdue_count,
      'oldest_due_date', p_oldest_due_date,
      'source', 'ui_pre_check'
    )
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.log_invoice_issuance_blocked_overdue(uuid, numeric, integer, date, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_invoice_issuance_blocked_overdue(uuid, numeric, integer, date, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.log_invoice_issuance_blocked_overdue(uuid, numeric, integer, date, text, boolean) IS
'Phase 21.4C: ثبت قابل اتکای audit بلاک صدور فاکتور بابت معوقه. جایگزین audit_logs.insert مستقیم از frontend. داخلاً وضعیت معوقه را revalidate می‌کند تا لاگ جعلی ثبت نشود.';
