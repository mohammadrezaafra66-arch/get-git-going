-- Phase 6 — ثبت «پیش‌فاکتور رد شده با دلیل» و نمایش آن به خود کاربر (۱۵۲)
--
-- تصمیم ساده‌سازی طبق پلن: به‌جای جدول جدید، از `audit_logs` با
-- action = 'sales_quote_rejected' استفاده می‌شود.
--
-- مشکل: RLS جدول `audit_logs` فقط به admin اجازهٔ SELECT می‌دهد، پس کارشناس
-- نمی‌تواند ردهای خودش را ببیند. به‌جای بازکردن policy (که کل تاریخچهٔ کاربر را
-- افشا می‌کند)، یک تابع SECURITY DEFINER باریک می‌سازیم که فقط ردیف‌های
-- «رد پیش‌فاکتورِ خودِ کاربر» را برمی‌گرداند.

BEGIN;

-- ایندکس برای خواندن سریع ردهای یک کاربر (partial، فقط همین action).
CREATE INDEX IF NOT EXISTS idx_audit_logs_quote_rejected_actor
  ON public.audit_logs (actor_id, created_at DESC)
  WHERE action = 'sales_quote_rejected';

DROP FUNCTION IF EXISTS public.get_my_rejected_quotes(integer);

CREATE FUNCTION public.get_my_rejected_quotes(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  reason text,
  note text,
  customer_name text,
  final_amount numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.created_at,
    NULLIF(a.diff ->> 'reason', '')        AS reason,
    NULLIF(a.diff ->> 'note', '')          AS note,
    NULLIF(a.diff ->> 'customer_name', '') AS customer_name,
    NULLIF(a.diff ->> 'final_amount', '')::numeric AS final_amount
  FROM public.audit_logs a
  WHERE a.action = 'sales_quote_rejected'
    AND a.actor_id = auth.uid()
  ORDER BY a.created_at DESC
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_rejected_quotes(integer)
  TO anon, authenticated, service_role, postgres;

COMMIT;
