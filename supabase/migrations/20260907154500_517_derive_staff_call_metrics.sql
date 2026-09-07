SET client_encoding='UTF8';

-- 517 · استخراج آمار تماس کارکنان از call_logs (C-7)
--
-- ═══ چرا این ستون‌ها دو منبع دارند، و یک شکاف ۲۶ روزه ═══════════════════════
-- D-34 می‌گفت «ستون‌های تماس مشتق شوند». معنای امروزیِ آن، طبق D-57a:
-- **از go-live به بعد مشتق شوند**، نه «همیشه». پس این سه ستون
-- (inbound_calls_count / outbound_calls_count / talk_time_minutes) عملاً دو
-- منبع دارند و بین‌شان یک حفره است:
--
--     ۲۰۲۶-۰۷-۲۳ تا ۲۰۲۶-۰۸-۱۱  ->  ثبت دستی (۱۱ ردیف، ۸ نفر)
--     ۲۰۲۶-۰۸-۱۲ تا ۲۰۲۶-۰۹-۰۶  ->  هیچ داده‌ای از هیچ منبعی — حفرهٔ واقعی
--     ۲۰۲۶-۰۹-۰۷ به بعد          ->  مشتق از call_logs (CDR ایزابل)
--
-- آن حفره پر نمی‌شود: CDR پیش از go-live وارد نشده و ثبت دستی هم متوقف شده
-- بوده. اگر شش ماه بعد کسی این ستون را با دو منبع و یک حفره ببیند، این
-- پاراگراف تفاوتِ «باگ» و «تصمیم» را روشن می‌کند.
--
-- ═══ دو گاردی که این تابع دارد ═════════════════════════════════════════════
-- ۱) مرز go-live یک **رد کردن** است، نه یک فیلتر. تابع برای تاریخِ پیش از
--    go-live استثنا می‌اندازد و هیچ نمی‌نویسد. دلیلش یک اجرای بعدی است: یک
--    تابعی که صرفاً فیلتر می‌کند، با یک اسکریپت backfill یا یک cron بدتنظیم
--    می‌تواند تاریخ قدیمی‌تر بگیرد و ۱۱ ردیف دستی را بی‌صدا بازنویسی کند.
--    آن ۱۱ ردیف کار ثبت‌شدهٔ ۸ نفر است و نسخهٔ دومی ندارد.
--    مرز از همان ردیف تنظیماتی خوانده می‌شود که importer هم بدون آن اجرا
--    نمی‌شود — یک منبع راست، نه یک ثابت دوم.
-- ۲) سوییچ‌اوور مشروط است به وجود نگاشت واقعی. شمارش روی
--    `employee_id IS NOT NULL` است نه روی تعداد ردیف: امروز جدول ۹ ردیف
--    برچسب‌دار دارد که هیچ‌کدام کارمند ندارند، و یک تست `count(*) > 0` روی
--    همان‌ها رد می‌شد و KPI همه را صفر می‌کرد.
--    گارد داخل خودِ تابع است، نه در UI، تا هیچ مسیر نوشتنی دورش نزند.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ۱) اصلاح برچسب منبع KPI — واقعیتِ امروز، نه واقعیتِ آینده
-- ─────────────────────────────────────────────────────────────────────────────
-- `compute_employee_score` صریحاً می‌گوید:
--   «Calls / talk-minutes ALWAYS come from staff_daily_performance_metrics
--    (call_logs has no data and no automatic source exists)»
-- ولی ستون source برای این سه کلید `call_logs` را ادعا می‌کرد. برچسبی که فقط
-- در آینده درست می‌شود همان اشکال است در جهت مخالف، پس به واقعیت امروز اصلاح
-- می‌شود. وقتی نگاشت داخلی‌ها پر شد و سوییچ‌اوور رخ داد، این برچسب دوباره
-- بازبینی می‌شود.
UPDATE public.gamification_kpis
   SET source = 'staff_daily_performance_metrics',
       updated_at = now()
 WHERE key IN ('inbound_calls', 'outbound_calls', 'talk_minutes')
   AND source IS DISTINCT FROM 'staff_daily_performance_metrics';

-- ─────────────────────────────────────────────────────────────────────────────
-- ۲) خودِ استخراج
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.derive_staff_call_metrics(_for_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _go_live date;
  _date    date := COALESCE(_for_date, public.tehran_today());
  _mapped  integer;
  _rows    integer := 0;
BEGIN
  -- همان ردیف تنظیماتی که importer هم بدون آن اجرا نمی‌شود.
  SELECT NULLIF(btrim(s.value), '')::date
    INTO _go_live
    FROM public.shop_settings s
   WHERE s.key = 'issabel_import_since_date';

  IF _go_live IS NULL THEN
    RAISE EXCEPTION
      'تاریخ شروع (issabel_import_since_date) تنظیم نشده است؛ استخراج آمار تماس اجرا نمی‌شود.'
      USING ERRCODE = '22004';
  END IF;

  -- گارد سخت: رد کردن، نه فیلتر کردن.
  IF _date < _go_live THEN
    RAISE EXCEPTION
      'استخراج آمار تماس برای % رد شد چون پیش از تاریخ شروع (%) است. ردیف‌های دستیِ پیش از go-live بازنویسی نمی‌شوند.',
      _date, _go_live
      USING ERRCODE = '22003';
  END IF;

  SELECT count(*)
    INTO _mapped
    FROM public.call_log_extensions
   WHERE employee_id IS NOT NULL;

  -- سوییچ‌اوور هنوز رخ نداده: چیزی نوشته نمی‌شود و ثبت دستی ادامه دارد.
  IF _mapped = 0 THEN
    RETURN jsonb_build_object(
      'switched_over', false,
      'reason',        'no_mapped_extensions',
      'for_date',      _date,
      'go_live',       _go_live,
      'rows_written',  0
    );
  END IF;

  INSERT INTO public.staff_daily_performance_metrics AS m
    (metric_date, staff_user_id, inbound_calls_count, outbound_calls_count, talk_time_minutes)
  SELECT _date,
         cl.employee_id,
         count(*) FILTER (WHERE cl.direction = 'inbound')::int,
         count(*) FILTER (WHERE cl.direction = 'outbound')::int,
         COALESCE(ROUND(SUM(cl.duration_seconds) / 60.0), 0)::int
    FROM public.call_logs cl
   WHERE cl.employee_id IS NOT NULL
     AND (cl.started_at AT TIME ZONE 'Asia/Tehran')::date = _date
   GROUP BY cl.employee_id
  ON CONFLICT (metric_date, staff_user_id) DO UPDATE
     SET inbound_calls_count  = EXCLUDED.inbound_calls_count,
         outbound_calls_count = EXCLUDED.outbound_calls_count,
         talk_time_minutes    = EXCLUDED.talk_time_minutes,
         updated_at           = now();
  -- ستون‌های sales_amount / profit_amount عمداً دست‌نخورده می‌مانند؛ منبعشان
  -- این تابع نیست.

  GET DIAGNOSTICS _rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'switched_over',     true,
    'for_date',          _date,
    'go_live',           _go_live,
    'rows_written',      _rows,
    'mapped_extensions', _mapped
  );
END;
$function$;

COMMENT ON FUNCTION public.derive_staff_call_metrics(date) IS
  'C-7 · استخراج شمار تماس و دقایق مکالمهٔ هر کارمند از call_logs برای یک روز. '
  'برای تاریخِ پیش از issabel_import_since_date استثنا می‌اندازد و نمی‌نویسد. '
  'تا وقتی هیچ داخلی‌ای employee_id نداشته باشد هیچ نمی‌نویسد و ثبت دستی ادامه دارد.';

REVOKE ALL ON FUNCTION public.derive_staff_call_metrics(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.derive_staff_call_metrics(date) FROM anon;
REVOKE ALL ON FUNCTION public.derive_staff_call_metrics(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.derive_staff_call_metrics(date) TO service_role;

COMMIT;
