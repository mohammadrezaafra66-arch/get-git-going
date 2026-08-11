-- Phase 8.5 (اصلاح وابسته) — رفع باگ `notify_on_stock_available`
--
-- کشف‌شده هنگام تست ۸.۵: تابع به `spt.name` ارجاع می‌دهد ولی جدول
-- `sale_price_types` ستون `name` ندارد (ستون واقعی `title` است). خطا در
-- بلوک EXCEPTION آن بلعیده می‌شود (`RAISE WARNING ... RETURN NEW`)، پس کل حلقهٔ
-- اطلاع‌رسانی هرگز اجرا نشده و «اعلان موجود شدن کالا به کارشناس» همیشه بی‌اثر بوده.
--
-- چرا اینجا: فاز ۸.۵ همگام‌سازی خودکار `stock_status` را اضافه می‌کند، یعنی از
-- این پس همین تریگر مرتب آتش می‌گیرد. طبق پلن، اتصال `stock_status` مهم است
-- «چون کل UI فعلی و نوتیف موجود شدن بر آن سوار است» — پس بدون این اصلاح،
-- خروجی فاز ۸.۵ روی کاغذ درست ولی در عمل خاموش می‌ماند.
--
-- روش: به‌جای بازتایپ کل بدنه (که رشته‌های فارسی را در معرض خرابی encoding
-- قرار می‌دهد)، فقط همان یک شناسه با replace() عوض می‌شود — همان تکنیک
-- migration 202. بقیهٔ بایت‌های تابع دست‌نخورده می‌ماند.

BEGIN;

DO $mig$
DECLARE
  _oid oid;
  _def text;
BEGIN
  SELECT p.oid INTO _oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'notify_on_stock_available'
  LIMIT 1;

  IF _oid IS NULL THEN
    RAISE NOTICE 'notify_on_stock_available not found; nothing to fix.';
    RETURN;
  END IF;

  _def := pg_get_functiondef(_oid);

  IF _def LIKE '%spt.name%' THEN
    EXECUTE replace(_def, 'spt.name', 'spt.title');
    RAISE NOTICE 'notify_on_stock_available: spt.name -> spt.title applied.';
  ELSE
    RAISE NOTICE 'notify_on_stock_available already fixed; no change.';
  END IF;
END
$mig$;

COMMIT;
