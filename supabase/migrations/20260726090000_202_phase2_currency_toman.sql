-- Phase 2 — یکسان‌سازی واحد پول به تومان
-- کل مقادیر DB از قبل تومان است؛ تنها متن پیام‌های خطای تریگرها هنوز «ریال» می‌گفت.
-- این migration فقط رشتهٔ واحد را در بدنهٔ توابع اصلاح می‌کند؛ هیچ عدد/رکوردی تغییر نمی‌کند.

BEGIN;

DO $mig$
DECLARE
  r record;
  def text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN (
        'enforce_payment_receipt_link_limits',
        'enforce_receipt_approval_allocation_limits'
      )
  LOOP
    def := pg_get_functiondef(r.oid);
    IF def LIKE '%ریال%' THEN
      EXECUTE replace(def, 'ریال', 'تومان');
    END IF;
  END LOOP;
END
$mig$;

COMMIT;
