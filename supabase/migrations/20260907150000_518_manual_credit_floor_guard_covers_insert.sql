SET client_encoding='UTF8';

-- 518 - F-1 تکمیل: گارد سقف دستی باید مسیر INSERT را هم بگیرد
--
-- مسئله:
--   مهاجرت ۵۱۱ گارد را به شکل BEFORE UPDATE OF manual_credit_floor نصب کرد، و همین
--   مسیر INSERT را کاملاً باز می‌گذاشت. اندازه‌گیری‌شده روی کاتالوگ زنده:
--     column_privileges: authenticated | INSERT | customers.manual_credit_floor
--     policy «manage customers by role» از نوع ALL است، پس INSERT را هم پوشش می‌دهد و
--       به sales اجازه می‌دهد روی مشتری خودش یا هر مشتری بدون مسئول بنویسد
--   بازتولیدشده پیش از این مهاجرت: یک کاربر با نقش تنها sales، زیر نقش authenticated و
--   با همان RLS واقعی، مشتری تازه‌ای ساخت که از همان ابتدا
--   manual_credit_floor = 888888888888 داشت. تریگر اصلاً شلیک نمی‌کرد، و
--   run_daily_capital_allocation از مهاجرت ۵۱۰ به بعد این کف را رعایت می‌کند — یعنی
--   همان بالا بردن سقف اعتبار، فقط از راه یک فعل دیگر.
--
--   درس تکراری همین پروژه: قاعده‌ای که روی یک مسیر برقرار است و مسیر دیگر دورش می‌زند.
--   دلیل اینکه این گارد از ابتدا در تریگر گذاشته شد نه در بدنه‌ی RPC همین بود؛ تریگرِ
--   فقط-UPDATE همان اشتباه یک پله پایین‌تر است.
--
-- شرط دو فعل یکی نیست، و اشتباه گرفتنشان ساختِ مشتری را می‌شکند:
--   UPDATE: وقتی مقدار «تغییر» کند  -> IS DISTINCT FROM
--   INSERT: چیزی برای تغییر کردن نیست -> وقتی مقدار ورودی NULL نباشد
--   یک INSERT معمولی بدون کف — یعنی هر ساخت مشتری عادی — باید برای sales کار کند.
--
-- نکته‌ی فنی: در بند رویداد، UPDATE OF <ستون> معادل INSERT ندارد، پس آزمون ستون برای
-- حالت INSERT به بدنه منتقل شده است. همچنین در پلپگ‌اسکیوال رکورد OLD در INSERT مقدار
-- ندارد و صرفِ خواندن OLD.<ستون> خطا می‌دهد؛ به همین دلیل ابتدا روی TG_OP شاخه می‌زنیم
-- و تنها در شاخه‌ی UPDATE به OLD دست می‌زنیم.
--
-- مهاجرت ۵۱۱ ویرایش نشد؛ این فایل شماره‌ی تازه دارد و تریگر را جایگزین می‌کند.
-- متن پیام عیناً همان نسخه‌ی مالک است و تغییر نکرده.

CREATE OR REPLACE FUNCTION public.tg_customers_guard_manual_credit_floor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor   uuid := auth.uid();
  _touched boolean;
BEGIN
  -- شاخه‌بندی پیش از هر ارجاع به OLD: در INSERT رکورد OLD مقداردهی نشده است.
  IF TG_OP = 'INSERT' THEN
    _touched := NEW.manual_credit_floor IS NOT NULL;
  ELSE
    _touched := NEW.manual_credit_floor IS DISTINCT FROM OLD.manual_credit_floor;
  END IF;

  -- نبود نشست یعنی مهاجرت / cron / service_role — استدلالش در سربرگ مهاجرت ۵۱۱ است:
  -- نقش anon هیچ اختیاری روی این جدول ندارد، پس مسیر بدون احراز هویت وجود ندارد.
  IF _touched
     AND _actor IS NOT NULL
     AND NOT public.has_any_role(_actor, ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION
      'تغییر سقف دستی فقط با نقش مدیر یا حسابدار ممکن است'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_customers_guard_manual_credit_floor ON public.customers;
CREATE TRIGGER trg_customers_guard_manual_credit_floor
  BEFORE INSERT OR UPDATE OF manual_credit_floor ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_customers_guard_manual_credit_floor();

-- --------------------------------------------------------------- مجوزها
-- با نقش supabase_admin که مالک تابع است اجرا می‌شود؛ REVOKE ای که نقش postgres روی
-- تابعِ متعلق به supabase_admin صادر کند بی‌صدا بی‌اثر است. نتیجه‌ی proacl پایین assert
-- می‌شود، نه صرفِ اجرا شدن REVOKE.
REVOKE ALL ON FUNCTION public.tg_customers_guard_manual_credit_floor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tg_customers_guard_manual_credit_floor()
  TO authenticated, service_role;

-- --------------------------------------------------------------- assertها
DO $do$
DECLARE
  _n integer;
  _def text;
BEGIN
  -- الف) تریگر هر دو فعل را پوشش می‌دهد
  SELECT pg_get_triggerdef(t.oid) INTO _def FROM pg_trigger t
   WHERE t.tgrelid='public.customers'::regclass
     AND t.tgname='trg_customers_guard_manual_credit_floor'
     AND NOT t.tgisinternal;
  IF _def IS NULL THEN
    RAISE EXCEPTION 'F-1: تریگر گارد پیدا نشد';
  END IF;
  IF _def NOT LIKE '%INSERT%' OR _def NOT LIKE '%UPDATE OF manual_credit_floor%' THEN
    RAISE EXCEPTION 'F-1: تریگر هر دو فعل را پوشش نمی‌دهد: %', _def;
  END IF;

  -- ب) بدنه هر دو شاخه را دارد و OLD را فقط در شاخه‌ی UPDATE می‌خواند
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='tg_customers_guard_manual_credit_floor';
  IF _def NOT LIKE '%TG_OP%' OR _def NOT LIKE '%IS DISTINCT FROM%'
     OR _def NOT LIKE '%IS NOT NULL%' THEN
    RAISE EXCEPTION 'F-1: بدنه شرط هر دو فعل را ندارد';
  END IF;

  -- ج) متن پیام مالک دست‌نخورده است
  IF _def NOT LIKE '%تغییر سقف دستی فقط با نقش مدیر یا حسابدار ممکن است%' THEN
    RAISE EXCEPTION 'F-1: متن فارسی پیام عوض شده است';
  END IF;

  -- د) یک نسخه از تابع، و anon/PUBLIC بدون اجازه‌ی اجرا
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='tg_customers_guard_manual_credit_floor';
  IF _n <> 1 THEN RAISE EXCEPTION 'تابع گارد % نسخه دارد', _n; END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='tg_customers_guard_manual_credit_floor'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR p.proacl::text ~ '(^|,)=X/');
  IF _n <> 0 THEN RAISE EXCEPTION 'OG-61: anon يا PUBLIC اجازه‌ی اجرا دارد'; END IF;

  RAISE NOTICE 'F-1: هر چهار assert برقرار است.';
END
$do$;
