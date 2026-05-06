
-- Phase 21.3C: ثبت اصلاح وزن‌های settlement_speed و late_payments در migration
-- مطابق تصمیم تاییدشده فاز 21.3:
--   purchase_history=0.25, payment_history=0.25,
--   settlement_speed=0.15, late_payments=0.15,
--   recent_activity=0.10, outstanding_ratio=0.10  (مجموع=1.00)
-- Idempotent: فقط در صورت وجود ردیف، وزن صحیح را تنظیم می‌کند.

UPDATE public.credit_scoring_rules SET weight = 0.25, is_active = true WHERE parameter_name = 'purchase_history';
UPDATE public.credit_scoring_rules SET weight = 0.25, is_active = true WHERE parameter_name = 'payment_history';
UPDATE public.credit_scoring_rules SET weight = 0.15, is_active = true WHERE parameter_name = 'settlement_speed';
UPDATE public.credit_scoring_rules SET weight = 0.15, is_active = true WHERE parameter_name = 'late_payments';
UPDATE public.credit_scoring_rules SET weight = 0.10, is_active = true WHERE parameter_name = 'recent_activity';
UPDATE public.credit_scoring_rules SET weight = 0.10, is_active = true WHERE parameter_name = 'outstanding_ratio';

-- اعتبارسنجی: مجموع وزن‌های فعال باید 1.00 باشد
DO $$
DECLARE
  v_sum numeric;
BEGIN
  SELECT COALESCE(SUM(weight),0) INTO v_sum
  FROM public.credit_scoring_rules
  WHERE is_active = true
    AND parameter_name IN ('purchase_history','payment_history','settlement_speed','late_payments','recent_activity','outstanding_ratio');
  IF ROUND(v_sum, 4) <> 1.0000 THEN
    RAISE EXCEPTION 'Phase 21.3C: مجموع وزن‌های فعال باید 1.00 باشد، مقدار فعلی: %', v_sum;
  END IF;
END $$;
