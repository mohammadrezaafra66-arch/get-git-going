SET client_encoding='UTF8';

-- 509 — OG-64: در دامنه‌ی تخصیص، CURRENT_DATE جای خود را به tehran_today() می‌دهد
--
-- مسئله:
--   TimeZone دیتابیس UTC است، پس CURRENT_DATE یعنی «امروز به وقت UTC». تهران
--   UTC+3:30 است، بنابراین از ساعت ۲۰:۳۰ UTC تا نیمه‌شب، تاریخ تهران یک روز جلوتر
--   از CURRENT_DATE است. اندازه‌گیری‌شده در لحظه‌ی ۲۲:۰۰ UTC:
--     ('2026-09-07 22:00:00+00' AT TIME ZONE 'UTC')::date        = 2026-09-07
--     ('2026-09-07 22:00:00+00' AT TIME ZONE 'Asia/Tehran')::date = 2026-09-08
--
--   اثر عملی روی میز کار تخصیص: فراخوانندهٔ واقعی
--   (src/routes/_app.accounting.allocation-workbench.tsx:265) تاریخ را با
--   format(new Date(), "yyyy-MM-dd") از مرورگر کاربر می‌سازد، یعنی «امروز به وقت
--   تهران»، و آن را به list_allocation_rows می‌فرستد؛ ولی پرچم is_unfunded داخل
--   تابع با CURRENT_DATE یعنی «امروز به وقت UTC» سنجیده می‌شود. در آن بازه‌ی
--   سه‌ونیم‌ساعته، قولی که به وقت تهران عقب‌افتاده است هنوز عقب‌افتاده علامت نمی‌خورد.
--
-- چه چیزی عوض می‌شود — فقط همین سه مورد در دامنه‌ی تخصیص:
--   1) allocation_rows.allocation_date  : DEFAULT CURRENT_DATE -> DEFAULT public.tehran_today()
--   2) list_allocation_rows             : سه instance
--   3) create_allocation_row            : دو instance
--
-- امضاها دست نمی‌خورند:
--   فقط عبارتِ DEFAULT یک پارامتر عوض می‌شود، نه نوع آن. پس CREATE OR REPLACE
--   واقعاً جایگزین می‌کند و overload نمی‌سازد؛ در انتهای همین فایل تعداد overload
--   هر تابع assert می‌شود تا این ادعا حدس نماند.
--
-- بدنه‌ها از روی تعریف زنده‌ی دیتابیس (pg_get_functiondef) برداشته شده‌اند و نه از
-- روی فایل مهاجرت قدیمی، چون دیتابیس گاهی بدنه‌ای متفاوت از git دارد و بازنویسی
-- نسخه‌ی git می‌تواند تغییرات دیگر را بی‌صدا برگرداند. تنها توکن عوض‌شده در هر بدنه
-- CURRENT_DATE است.

-- ---------------------------------------------------------------- 1) پیش‌فرض ستون
ALTER TABLE public.allocation_rows
  ALTER COLUMN allocation_date SET DEFAULT public.tehran_today();

-- ------------------------------------------------------------ 2) list_allocation_rows
CREATE OR REPLACE FUNCTION public.list_allocation_rows(
  p_allocation_date date DEFAULT public.tehran_today(),
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, allocation_date date, payer_customer_id uuid, payer_person_id uuid,
              payer_name text, payer_quote_id uuid, beneficiary_person_id uuid,
              beneficiary_name text, beneficiary_purchase_id uuid, beneficiary_account_no text,
              amount numeric, priority text, status text, promised_at date, promised_note text,
              is_unfunded boolean, created_by uuid, created_at timestamp with time zone,
              updated_at timestamp with time zone, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _date  date := COALESCE(p_allocation_date, public.tehran_today());
  _lim   integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
  _off   integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.has_any_role(auth.uid(),
        ARRAY['admin', 'manager', 'accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.id,
         a.allocation_date,
         a.payer_customer_id,
         a.payer_person_id,
         pp.display_name,
         a.payer_quote_id,
         a.beneficiary_person_id,
         bp.display_name,
         a.beneficiary_purchase_id,
         a.beneficiary_account_no,
         a.amount,
         a.priority,
         a.status,
         a.promised_at,
         a.promised_note,
         -- A-4, owner decision D-21: a FLAG. Nothing is reallocated, nothing is suggested.
         -- OG-64: «امروز» یعنی امروزِ تهران، نه امروزِ UTC.
         (COALESCE(a.status = 'نمی‌خواد', false)
          OR (a.promised_at IS NOT NULL
              AND a.promised_at < public.tehran_today()
              AND a.status IS DISTINCT FROM 'واریز شد')),
         a.created_by,
         a.created_at,
         a.updated_at,
         count(*) OVER ()
    FROM public.allocation_rows a
    JOIN public.persons pp ON pp.id = a.payer_person_id
    JOIN public.persons bp ON bp.id = a.beneficiary_person_id
   WHERE a.allocation_date = _date
   ORDER BY CASE a.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1
                            WHEN 'normal' THEN 2 ELSE 3 END,
            a.amount DESC,
            a.created_at
   LIMIT _lim OFFSET _off;
END
$function$;

-- ----------------------------------------------------------- 3) create_allocation_row
CREATE OR REPLACE FUNCTION public.create_allocation_row(
  p_payer_customer_id uuid,
  p_beneficiary_person_id uuid,
  p_amount numeric,
  p_allocation_date date DEFAULT public.tehran_today(),
  p_priority text DEFAULT 'normal'::text,
  p_beneficiary_account_no text DEFAULT NULL::text,
  p_payer_quote_id uuid DEFAULT NULL::uuid,
  p_beneficiary_purchase_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor    uuid := auth.uid();
  _payer    uuid;
  _id       uuid;
  _acct     text := NULLIF(btrim(COALESCE(p_beneficiary_account_no, '')), '');
BEGIN
  IF NOT public.has_any_role(_actor, ARRAY['admin', 'accountant']::text[]) THEN
    RAISE EXCEPTION 'ثبت ردیف تخصیص فقط برای مدیر سیستم یا حسابدار مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  IF p_payer_customer_id IS NULL OR p_beneficiary_person_id IS NULL THEN
    RAISE EXCEPTION 'بدهکار و بستانکار هر دو الزامی هستند.' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'مبلغ تخصیص باید یک عدد صحیح بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
  END IF;

  IF p_priority IS NULL OR NOT (p_priority = ANY (ARRAY['low', 'normal', 'high', 'urgent'])) THEN
    RAISE EXCEPTION 'اولویت نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  SELECT c.person_id INTO _payer FROM public.customers c WHERE c.id = p_payer_customer_id;
  IF _payer IS NULL THEN
    RAISE EXCEPTION 'مشتری بدهکار پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_beneficiary_person_id AND is_active) THEN
    RAISE EXCEPTION 'شخص بستانکار پیدا نشد یا غیرفعال است.' USING ERRCODE = 'P0002';
  END IF;

  IF _payer = p_beneficiary_person_id THEN
    RAISE EXCEPTION 'بدهکار و بستانکار نمی‌توانند یک شخص باشند.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.allocation_rows (
    allocation_date, payer_customer_id, payer_quote_id,
    beneficiary_person_id, beneficiary_purchase_id, beneficiary_account_no,
    amount, priority, created_by)
  VALUES (
    COALESCE(p_allocation_date, public.tehran_today()), p_payer_customer_id, p_payer_quote_id,
    p_beneficiary_person_id, p_beneficiary_purchase_id, _acct,
    p_amount, p_priority, _actor)
  RETURNING id INTO _id;

  -- The audit row is written by trg_allocation_rows_audit_insert (migration 483), which fires
  -- on THIS insert as well as on a direct PostgREST insert. Writing it here too would double.

  RETURN _id;
END
$function$;

-- --------------------------------------------------------------- مجوزها
-- CREATE OR REPLACE مجوزهای قبلی را حفظ می‌کند، ولی طبق درس موج ۶ اینجا صریح
-- نوشته می‌شوند تا وضعیت نهایی حدس نباشد. این فایل با نقش supabase_admin اجرا
-- می‌شود که مالک هر دو تابع است — REVOKE ای که نقش postgres روی تابعِ متعلق به
-- supabase_admin صادر کند بی‌صدا بی‌اثر است.
REVOKE ALL ON FUNCTION public.list_allocation_rows(date, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_allocation_row(uuid, uuid, numeric, date, text, text, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_allocation_rows(date, integer, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_allocation_row(uuid, uuid, numeric, date, text, text, uuid, uuid)
  TO authenticated, service_role;

-- --------------------------------------------------------------- assertها
DO $$
DECLARE
  _n integer;
  _bad text;
BEGIN
  -- الف) هیچ CURRENT_DATE ای در این دو بدنه باقی نمانده باشد
  SELECT string_agg(p.proname, ', ') INTO _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('list_allocation_rows', 'create_allocation_row')
     AND pg_get_functiondef(p.oid) ~* 'current_date';
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'OG-64: هنوز CURRENT_DATE در این توابع هست: %', _bad;
  END IF;

  -- ب) پیش‌فرض ستون واقعاً عوض شده باشد
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='allocation_rows'
     AND column_name='allocation_date' AND column_default ILIKE '%tehran_today%';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'OG-64: پیش‌فرض allocation_date به tehran_today() تغییر نکرد';
  END IF;

  -- ج) overload ساخته نشده باشد — هر تابع باید دقیقاً یک نسخه داشته باشد
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='list_allocation_rows';
  IF _n <> 1 THEN RAISE EXCEPTION 'list_allocation_rows حالا % نسخه دارد', _n; END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_allocation_row';
  IF _n <> 1 THEN RAISE EXCEPTION 'create_allocation_row حالا % نسخه دارد', _n; END IF;

  -- د) anon یا PUBLIC مجوز اجرا نداشته باشد
  SELECT string_agg(p.proname, ', ') INTO _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('list_allocation_rows','create_allocation_row')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR p.proacl::text ~ '(^|,)=X/');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'OG-61: anon يا PUBLIC هنوز اجازه‌ی اجرا دارد: %', _bad;
  END IF;

  RAISE NOTICE 'OG-64: هر چهار assert دامنه‌ی تخصیص برقرار است.';
END
$$;
