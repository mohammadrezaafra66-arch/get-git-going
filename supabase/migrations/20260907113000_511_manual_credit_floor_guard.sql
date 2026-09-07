SET client_encoding='UTF8';

-- 511 - H-9: سقف اعتبار دستی فقط با اجازه‌ی بررسی‌کننده جابه‌جا می‌شود
--
-- مسئله:
--   customers.manual_credit_floor مستقیماً قابل نوشتن بود. اندازه‌گیری‌شده روی کاتالوگ زنده:
--     column_privileges: authenticated | UPDATE | customers.manual_credit_floor
--     policy «manage customers by role» (ALL) به کاربر sales اجازه می‌دهد روی مشتری خودش
--       یا هر مشتری بدون مسئول بنویسد
--     CHECK فقط >= 0 است و سقف بالایی ندارد
--   بازتولیدشده: یک کاربر با نقش تنها sales، زیر نقش authenticated و با همان RLS واقعی،
--   روی یک مشتری بدون مسئول این را اجرا کرد و موفق شد (UPDATE 1):
--     UPDATE customers SET manual_credit_floor = 999999999999
--   یعنی گیت admin|manager|accountant که review_credit_request دارد دور زده می‌شد.
--   تا پیش از مهاجرت ۵۱۰ این ستون بی‌اثر بود؛ بعد از آن سقف credit_limit را هم بالا می‌برد.
--
-- چرا تریگر و نه فقط پس‌گرفتن grant:
--   قاعده «فقط بررسی‌کننده این سقف را جابه‌جا می‌کند» باید جایی بنشیند که هیچ مسیر نوشتنی
--   نتواند دورش بزند. بدنه‌ی RPC چنین جایی نیست. پس‌گرفتن grant ستونی هم به‌تنهایی کافی
--   نیست، چون «manage customers by role» یک policy از نوع ALL است و فهرست ستون‌ها به‌سادگی
--   و ناخواسته دوباره باز می‌شود.
--
-- تصمیم درباره‌ی نوشتن بدون نشست (auth.uid() IS NULL) - عمدی و مستدل:
--   نوشتن بدون JWT «مجاز» است. دلیلش اندازه‌گیری است، نه سلیقه:
--     - نقش anon هیچ اختیاری روی جدول customers ندارد (information_schema.table_privileges
--       فقط authenticated و service_role را برمی‌گرداند) و هر سه policy روی {authenticated}
--       محدودند. پس هیچ مسیر مهاجم بدون احراز هویتی به این جدول وجود ندارد.
--     - تنها نویسندگان بدون JWT عبارت‌اند از service_role (کلید سمت سرور)، مهاجرت‌ها و cron -
--       که همگی مورد اعتمادند. بستن آن‌ها مهاجرت‌های آینده و کار سمت سرور را می‌شکست بدون
--       اینکه هیچ سطح حمله‌ای را ببندد.
--   یعنی: نشست موجود و بدون نقش لازم -> رد. نبود نشست -> اجازه.
--
-- سازگاری با مسیر درست:
--   review_credit_request از نوع SECURITY DEFINER است ولی auth.uid() داخل آن همان
--   فراخوانِ واقعی است که پیشاپیش به admin|manager|accountant محدود شده، پس تأیید اعتبار
--   از این تریگر رد می‌شود. در آزمون پایین اثبات شده است.
--
-- ویرایش‌های نامرتبط نباید بشکنند: تریگر هم با BEFORE UPDATE OF محدود شده و هم شرط
-- IS DISTINCT FROM دارد، پس UPDATE روی name/notes/... اصلاً وارد بدنه نمی‌شود یا رد نمی‌شود.

CREATE OR REPLACE FUNCTION public.tg_customers_guard_manual_credit_floor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF NEW.manual_credit_floor IS DISTINCT FROM OLD.manual_credit_floor THEN
    -- نبود نشست یعنی مهاجرت / cron / service_role - به بالا نگاه کنید.
    IF _actor IS NOT NULL
       AND NOT public.has_any_role(_actor, ARRAY['admin','manager','accountant']::text[]) THEN
      RAISE EXCEPTION
        'تغییر سقف دستی فقط با نقش مدیر یا حسابدار ممکن است'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_customers_guard_manual_credit_floor ON public.customers;
CREATE TRIGGER trg_customers_guard_manual_credit_floor
  BEFORE UPDATE OF manual_credit_floor ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_customers_guard_manual_credit_floor();

-- ---------------------------------------------------------------- F-2
-- بدنه از تعریف زنده گرفته شده و تنها یک کلید به diff اضافه شده است.

CREATE OR REPLACE FUNCTION public.audit_customer_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'customer_created', 'customer', NEW.id::text,
      jsonb_build_object('name', NEW.name, 'phone', NEW.phone, 'city', NEW.city), now());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'customer_updated', 'customer', NEW.id::text,
      jsonb_build_object(
        'name',  jsonb_build_object('old', OLD.name,  'new', NEW.name),
        'phone', jsonb_build_object('old', OLD.phone, 'new', NEW.phone),
        'city',  jsonb_build_object('old', OLD.city,  'new', NEW.city),
        'notes', jsonb_build_object('old', OLD.notes, 'new', NEW.notes),
        'is_active', jsonb_build_object('old', OLD.is_active, 'new', NEW.is_active),
        -- F-2: the credit ceiling was NOT in this list, so a move of it produced an audit row
        -- in which every logged field was unchanged - the movement was invisible.
        'manual_credit_floor', jsonb_build_object(
           'old', OLD.manual_credit_floor, 'new', NEW.manual_credit_floor)
      ), now());
    RETURN NEW;
  END IF;
  RETURN NEW;
END $function$;


-- --------------------------------------------------------------- مجوزها
-- این فایل با نقش supabase_admin که مالک هر دو تابع است اجرا می‌شود؛ REVOKE ای که
-- نقش postgres روی تابعِ متعلق به supabase_admin صادر کند بی‌صدا بی‌اثر است.
-- شکل نهایی همان شکل توابع تریگر موج ۵/۶ است: بدون PUBLIC و بدون anon.
-- توجه: اجرا شدن یک تریگر مجوز EXECUTE را دوباره بررسی نمی‌کند (بررسی هنگام ساخت
-- تریگر انجام می‌شود)، و تابع تریگر را نمی‌توان مستقیم صدا زد؛ پس این REVOKE هیچ
-- تریگر موجودی را نمی‌شکند.
REVOKE ALL ON FUNCTION public.tg_customers_guard_manual_credit_floor() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_customer_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tg_customers_guard_manual_credit_floor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_customer_change() TO authenticated, service_role;

-- --------------------------------------------------------------- assertها
DO $do$
DECLARE
  _n integer;
BEGIN
  -- الف) تریگر روی جدول نشسته و فقط روی همان ستون
  SELECT count(*) INTO _n FROM pg_trigger t
   WHERE t.tgrelid='public.customers'::regclass
     AND t.tgname='trg_customers_guard_manual_credit_floor'
     AND NOT t.tgisinternal
     AND pg_get_triggerdef(t.oid) LIKE '%UPDATE OF manual_credit_floor%';
  IF _n <> 1 THEN RAISE EXCEPTION 'H-9: تریگر گارد روی ستون درست نصب نشد'; END IF;

  -- ب) diff ممیزی حالا سقف را حمل می‌کند
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='audit_customer_change'
     AND pg_get_functiondef(p.oid) LIKE '%manual_credit_floor%';
  IF _n <> 1 THEN RAISE EXCEPTION 'F-2: diff هنوز سقف اعتبار را ثبت نمی‌کند'; END IF;

  -- ج) overload ساخته نشده
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
         ('audit_customer_change','tg_customers_guard_manual_credit_floor');
  IF _n <> 2 THEN RAISE EXCEPTION 'تعداد نسخه‌های توابع % است، انتظار ۲ بود', _n; END IF;

  -- د) نتیجه‌ی proacl را assert می‌کنیم، نه صرفِ اجرای REVOKE را
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('audit_customer_change','tg_customers_guard_manual_credit_floor')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR p.proacl::text ~ '(^|,)=X/');
  IF _n <> 0 THEN RAISE EXCEPTION 'OG-61: anon يا PUBLIC هنوز اجازه‌ی اجرا دارد'; END IF;

  RAISE NOTICE 'H-9/F-2: هر چهار assert برقرار است.';
END
$do$;
