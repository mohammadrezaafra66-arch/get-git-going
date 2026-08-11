-- =====================================================================
-- مورد ۱۳۵ — مارکرهای «ثبت شد» و «ارسال شد» پیش‌فاکتور
-- =====================================================================
--
-- افزایشی و بدون تبدیل داده. ستون‌ها nullable هستند و رکوردهای موجود
-- دست‌نخورده می‌مانند (هر دو مارکر برایشان خالی است).
--
-- FK ستون‌های *_by به auth.users(id) است، نه profiles — چون الگوی غالب
-- همین جدول این است: invoices_created_by_fkey و invoices_issued_by_fkey
-- هر دو به auth.users(id) اشاره می‌کنند.
--
-- ⚠️ نکتهٔ عملیاتی: تریگر trg_invoices_recompute_employee_score روی
--    AFTER INSERT OR DELETE OR UPDATE (بدون محدودیت ستون) تعریف شده است.
--    بنابراین هر تیک مارکر باعث اجرای calculate_employee_score و درج یک
--    رویداد 'invoice_update' در employee_score_events می‌شود. این migration
--    عمداً آن تریگر را تغییر نمی‌دهد (خارج از دامنهٔ این مورد است).
-- =====================================================================

BEGIN;

-- ۱) ستون‌های مارکر ----------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS accounting_registered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS accounting_registered_by uuid NULL,
  ADD COLUMN IF NOT EXISTS accounting_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS accounting_sent_by uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_accounting_registered_by_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_accounting_registered_by_fkey
      FOREIGN KEY (accounting_registered_by) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_accounting_sent_by_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_accounting_sent_by_fkey
      FOREIGN KEY (accounting_sent_by) REFERENCES auth.users(id);
  END IF;
END $$;

-- ۲) ایندکس‌ها ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoices_accounting_registered_at
  ON public.invoices (accounting_registered_at);

CREATE INDEX IF NOT EXISTS idx_invoices_accounting_sent_at
  ON public.invoices (accounting_sent_at);

-- ۳) RPC امن ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_invoice_accounting_marker(
  p_invoice_id uuid,
  p_marker text,
  p_checked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_uid uuid := auth.uid();
  v_action text;
BEGIN
  IF p_marker IS NULL OR p_marker NOT IN ('registered', 'sent') THEN
    RAISE EXCEPTION 'نوع علامت نامعتبر است؛ فقط registered یا sent مجاز است';
  END IF;

  SELECT * INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'پیش‌فاکتور یافت نشد';
  END IF;

  IF p_checked THEN
    IF NOT public.has_any_role(
      v_uid, ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]
    ) THEN
      RAISE EXCEPTION 'دسترسی غیرمجاز برای ثبت علامت حسابداری';
    END IF;

    -- هر دو املا مسدود می‌شود: جدول invoices روی status هیچ constraint ای
    -- ندارد و توابع موجود پروژه از 'cancelled' استفاده می‌کنند در حالی که
    -- مستندات 'canceled' می‌نویسد.
    IF COALESCE(v_invoice.status, '') IN ('canceled', 'cancelled') THEN
      RAISE EXCEPTION 'برای پیش‌فاکتور لغوشده نمی‌توان علامت جدید ثبت کرد';
    END IF;
  ELSE
    IF NOT public.has_any_role(
      v_uid, ARRAY['admin'::app_role, 'accountant'::app_role]
    ) THEN
      RAISE EXCEPTION 'فقط مدیر سیستم یا حسابدار می‌تواند علامت را لغو کند';
    END IF;
  END IF;

  IF p_marker = 'registered' THEN
    UPDATE public.invoices
       SET accounting_registered_at = CASE WHEN p_checked THEN now() ELSE NULL END,
           accounting_registered_by = CASE WHEN p_checked THEN v_uid ELSE NULL END
     WHERE id = p_invoice_id;

    v_action := CASE WHEN p_checked
                     THEN 'invoice_accounting_registered_checked'
                     ELSE 'invoice_accounting_registered_unchecked' END;
  ELSE
    UPDATE public.invoices
       SET accounting_sent_at = CASE WHEN p_checked THEN now() ELSE NULL END,
           accounting_sent_by = CASE WHEN p_checked THEN v_uid ELSE NULL END
     WHERE id = p_invoice_id;

    v_action := CASE WHEN p_checked
                     THEN 'invoice_accounting_sent_checked'
                     ELSE 'invoice_accounting_sent_unchecked' END;
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    v_uid,
    'invoice',
    p_invoice_id::text,
    v_action,
    jsonb_build_object('marker', p_marker, 'checked', p_checked)
  );

  RETURN jsonb_build_object('ok', true, 'marker', p_marker, 'checked', p_checked);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_invoice_accounting_marker(uuid, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_invoice_accounting_marker(uuid, text, boolean)
  TO authenticated;

COMMIT;
