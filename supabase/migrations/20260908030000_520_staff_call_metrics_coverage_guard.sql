SET client_encoding='UTF8';

-- 520 · گاردِ پوششِ نگاشت داخلی‌ها، و نیمهٔ ساخته‌نشدهٔ آن (C-1)
--
-- ═══ نقصی که اندازه گرفته شد ═══════════════════════════════════════════════
-- مهاجرت ۵۱۷ سوییچ‌اوور از KPI دستی به KPI مشتق‌شده از `call_logs` را مشروط
-- کرد به این شرط:
--
--     SELECT count(*) INTO _mapped FROM call_log_extensions WHERE employee_id IS NOT NULL;
--     IF _mapped = 0 THEN RETURN ... 'switched_over', false ...
--
-- یعنی «حداقل یک نگاشت وجود دارد». مالک برای آزمایشِ کارکردِ لیست انتخاب،
-- **یک** داخلی (۴۰۳) را به یک کارمند آزمایشی نسبت داد. اندازه‌گیریِ
-- ۲۰۲۶-۰۹-۰۸ روی همین پایگاه:
--
--     call_log_extensions           : ۹ ردیف، ۱ نگاشت‌شده، ۸ بی‌نگاشت
--     داخلی‌های دارای تماس در ۲۰۲۶-۰۹-۰۷ : ۱۰ داخلی، ۹ بی‌نگاشت
--     derive_staff_call_metrics('2026-09-07')
--         -> {"switched_over": true, "mapped_extensions": 1, "rows_written": 0}
--
-- **یک ردیف آزمایشی درِ گارد را باز کرد.** «حداقل یک نگاشت» با «نگاشت کامل»
-- یکی نیست.
--
-- اینکه صفر ردیف نوشته شد اتفاقی بود، نه محافظت: importer در زمانِ import
-- مقدار `call_logs.employee_id` را می‌چسباند، و هر ۱۵۰۹ ردیف موجود — از جمله
-- هر ۷۷ ردیفِ خودِ داخلی ۴۰۳ — پیش از وجودِ آن نگاشت وارد شده‌اند، پس
-- `employee_id` همه NULL است. اولین importِ بعد از نگاشت آن را می‌چسباند و
-- آن‌وقت گارد باز است در حالی که ۱ از ۱۰ داخلی پوشش دارد.
--
-- ═══ سه ویژگی که محمولِ جدید دارد و قبلی نداشت ═════════════════════════════
-- ۱) **پنجره‌ای** — دقیقاً همان روزی را می‌سنجد که دارد مشتق می‌شود، با همان
--    عبارتِ پنجره‌ای که خودِ INSERT دارد ((started_at AT TIME ZONE 'Asia/Tehran')::date).
-- ۲) **وزن‌دار به ترافیک** — میزی که تماسی نمی‌زند (۴۰۸، ۴۰۹، ۴۴۵ امروز)
--    نمی‌تواند سوییچ‌اوور را تا ابد نگه دارد.
-- ۳) **با یک ردیف آزمایشی ارضا نمی‌شود** — شرط این است که *هیچ* داخلیِ
--    دارای ترافیک بی‌نگاشت نماند.
--
-- و به‌جای `switched_over: true, rows_written: 0` که مثل موفقیت خوانده می‌شود،
-- فهرست `blocked_by` برمی‌گردد.
--
-- ═══ نیمه‌ای که هرگز ساخته نشد ═════════════════════════════════════════════
-- ۵۱۷ نوشت «تا وقتی هیچ داخلی‌ای employee_id نداشته باشد ... ثبت دستی ادامه
-- دارد» — ولی هیچ‌جا ثبت دستی را متوقف نمی‌کرد. اندازه‌گیری‌شده: تنها تریگر
-- روی staff_daily_performance_metrics همان `staff_daily_perf_updated_at`
-- (مهرِ زمان) بود، و صفحهٔ ثبت دستی هیچ ارجاعی به switched_over یا
-- call_log_extensions نداشت. یعنی وقتی سوییچ‌اوور واقعاً رخ می‌داد، ثبت دستی
-- بی‌صدا روی مقادیر مشتق‌شده می‌نوشت و بالعکس.
--
-- ═══ گارد کجا زندگی می‌کند، و چرا آنجا ═════════════════════════════════════
-- **در تریگر، نه فقط در RPC و نه فقط در UI.**
--   · فقط UI کافی نیست: مجوزدهیِ سمت‌کاربر تنها، طبق قاعدهٔ ۶ پروژه رد است.
--   · فقط بدنهٔ RPC کافی نیست: RLSِ همین جدول به admin/manager/accountant
--     اجازهٔ INSERT/UPDATE مستقیم می‌دهد و PostgREST جدول را مستقیم عرضه
--     می‌کند، پس یک مسیر نوشتنیِ دورزننده واقعاً وجود دارد (P7 در گزارش).
--
-- **نامتقارنیِ نویسندگانِ مشروع** — دقیقاً همان چیزی که امروز یک‌بار رگرسیون
-- ساخت. نویسندگانِ زندهٔ این جدول شمرده شدند (pg_get_functiondef روی همهٔ
-- توابع) و دقیقاً دو تا هستند:
--     upsert_staff_daily_performance_metric(...)  ← مسیر ثبت دستی، باید گارد بخورد
--     derive_staff_call_metrics(date)             ← خودِ سوییچ‌اوور، نباید گارد بخورد
-- pg_cron روی این پایگاه وجود ندارد (cron.job نیست)، پس نویسندهٔ زمان‌بندی‌شدهٔ
-- سومی در کار نیست. تابعِ مشتق‌کننده با یک پرچمِ محدود به تراکنش
-- (`afrakala.deriving_call_metrics`) خودش را معرفی می‌کند و بلافاصله پس از
-- نوشتن آن را خاموش می‌کند. مهاجرت‌ها و service_role که JWT ندارند هم عبور
-- می‌کنند، چون تابع پوشش فقط وقتی نقش را بررسی می‌کند که `auth.uid()` وجود
-- داشته باشد.
--
-- ═══ چیزی که عمداً دست‌نخورده ماند ═════════════════════════════════════════
-- گاردِ سختِ تاریخِ go-live عیناً همان است: **رد می‌کند (22003)، فیلتر نمی‌کند**،
-- و ۱۱ ردیف دستیِ پیش از go-live باید بایت‌به‌بایت همان بمانند
-- (md5 = e2d3576ed91b42bc3e73bd785f5de993، اندازه‌گیری‌شده قبل و بعد).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ۱) محمولِ پوشش — یک منبعِ راست برای هر سه مصرف‌کننده (تابع مشتق‌کننده،
--    تریگرِ ثبت دستی، و صفحهٔ ثبت دستی)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_call_metrics_coverage(_for_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid        uuid := auth.uid();
  _go_live    date;
  _date       date := COALESCE(_for_date, public.tehran_today());
  _total      integer := 0;
  _unmapped   integer := 0;
  _calls      integer := 0;
  _blocked    jsonb   := '[]'::jsonb;
BEGIN
  -- بررسی نقش فقط وقتی یک subjectِ JWT وجود دارد. نویسندهٔ پشت‌صحنه
  -- (مهاجرت، service_role، خودِ تریگر در تراکنشِ سرور) uid ندارد و باید عبور
  -- کند؛ anon اصلاً EXECUTE ندارد. همان مجموعه‌ای که سیاست
  -- sdpm_select_privileged دارد.
  IF _uid IS NOT NULL
     AND NOT public.has_any_role(_uid,
           ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای مشاهدهٔ وضعیت نگاشت داخلی‌ها'
      USING ERRCODE = '42501';
  END IF;

  SELECT NULLIF(btrim(s.value), '')::date
    INTO _go_live
    FROM public.shop_settings s
   WHERE s.key = 'issabel_import_since_date';

  -- نبودِ تنظیمات یعنی «هنوز سوییچ‌اوور نداریم»، نه استثنا: این تابع را تریگرِ
  -- ثبت دستی هم صدا می‌زند و یک پیکربندیِ ناقص نباید ثبت دستی را قفل کند.
  IF _go_live IS NULL THEN
    RETURN jsonb_build_object(
      'covered', false, 'reason', 'no_go_live_date',
      'for_date', _date, 'go_live', NULL,
      'extensions_in_window', 0, 'unmapped_extensions', 0,
      'unmapped_calls', 0, 'blocked_by', '[]'::jsonb);
  END IF;

  IF _date < _go_live THEN
    RETURN jsonb_build_object(
      'covered', false, 'reason', 'before_go_live',
      'for_date', _date, 'go_live', _go_live,
      'extensions_in_window', 0, 'unmapped_extensions', 0,
      'unmapped_calls', 0, 'blocked_by', '[]'::jsonb);
  END IF;

  -- پنجره: عیناً همان عبارتی که INSERTِ تابع مشتق‌کننده استفاده می‌کند.
  -- ردیف‌های با extension تهی (امروز ۱۱۰۹ ردیف، پاهای ترانکِ ورودی) قابل نسبت
  -- دادن به هیچ داخلی‌ای نیستند؛ اگر شمرده شوند گارد هرگز باز نمی‌شود.
  SELECT count(*) FILTER (WHERE TRUE),
         count(*) FILTER (WHERE w.employee_id IS NULL),
         COALESCE(SUM(w.calls) FILTER (WHERE w.employee_id IS NULL), 0)
    INTO _total, _unmapped, _calls
    FROM (
      SELECT cl.extension, e.employee_id, count(*) AS calls
        FROM public.call_logs cl
        LEFT JOIN public.call_log_extensions e ON e.extension = cl.extension
       WHERE cl.extension IS NOT NULL
         AND (cl.started_at AT TIME ZONE 'Asia/Tehran')::date = _date
       GROUP BY cl.extension, e.employee_id
    ) w;

  SELECT COALESCE(jsonb_agg(x.extension ORDER BY x.extension), '[]'::jsonb)
    INTO _blocked
    FROM (
      SELECT DISTINCT cl.extension
        FROM public.call_logs cl
        LEFT JOIN public.call_log_extensions e ON e.extension = cl.extension
       WHERE cl.extension IS NOT NULL
         AND (cl.started_at AT TIME ZONE 'Asia/Tehran')::date = _date
         AND e.employee_id IS NULL
    ) x;

  -- پنجرهٔ بی‌ترافیک «پوشش‌داده‌شده» نیست. اگر بود، روزی که import شکست خورده
  -- ثبت دستی را هم قفل می‌کرد و آن روز از هر دو منبع خالی می‌ماند.
  IF _total = 0 THEN
    RETURN jsonb_build_object(
      'covered', false, 'reason', 'no_call_data',
      'for_date', _date, 'go_live', _go_live,
      'extensions_in_window', 0, 'unmapped_extensions', 0,
      'unmapped_calls', 0, 'blocked_by', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'covered',              (_unmapped = 0),
    'reason',               CASE WHEN _unmapped = 0 THEN 'covered' ELSE 'unmapped_extensions' END,
    'for_date',             _date,
    'go_live',              _go_live,
    'extensions_in_window', _total,
    'unmapped_extensions',  _unmapped,
    'unmapped_calls',       _calls,
    'blocked_by',           _blocked);
END;
$function$;

COMMENT ON FUNCTION public.staff_call_metrics_coverage(date) IS
  'C-1 · آیا نگاشتِ داخلی‌ها برای یک روز مشخص کامل است؟ پنجره‌ای، وزن‌دار به '
  'ترافیک، و با یک ردیف آزمایشی ارضا نمی‌شود. مصرف‌کننده‌ها: '
  'derive_staff_call_metrics، تریگرِ ثبت دستی، و صفحهٔ ثبت دستی.';

REVOKE ALL ON FUNCTION public.staff_call_metrics_coverage(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_call_metrics_coverage(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_call_metrics_coverage(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_call_metrics_coverage(date) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- ۲) تابع مشتق‌کننده — همان امضا، تا CREATE OR REPLACE جایگزین کند نه overload
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
  _cov     jsonb;
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

  -- گارد سخت: رد کردن، نه فیلتر کردن. عیناً همان‌که ۵۱۷ داشت.
  IF _date < _go_live THEN
    RAISE EXCEPTION
      'استخراج آمار تماس برای % رد شد چون پیش از تاریخ شروع (%) است. ردیف‌های دستیِ پیش از go-live بازنویسی نمی‌شوند.',
      _date, _go_live
      USING ERRCODE = '22003';
  END IF;

  _cov := public.staff_call_metrics_coverage(_date);

  -- سوییچ‌اوور هنوز رخ نداده. خروجی می‌گوید **چه چیزی** جلویش را گرفته، نه یک
  -- `switched_over: true, rows_written: 0` که مثل موفقیت خوانده می‌شود.
  IF NOT (_cov->>'covered')::boolean THEN
    RETURN jsonb_build_object(
      'switched_over',        false,
      'reason',               _cov->>'reason',
      'for_date',             _date,
      'go_live',              _go_live,
      'rows_written',         0,
      'extensions_in_window', _cov->'extensions_in_window',
      'unmapped_extensions',  _cov->'unmapped_extensions',
      'unmapped_calls',       _cov->'unmapped_calls',
      'blocked_by',           _cov->'blocked_by');
  END IF;

  -- به تریگرِ ثبت دستی می‌گوید این نوشتن همان نوشتنِ موردنظر است. محدود به
  -- تراکنش، و بلافاصله پس از INSERT خاموش می‌شود.
  PERFORM set_config('afrakala.deriving_call_metrics', 'on', true);

  INSERT INTO public.staff_daily_performance_metrics AS m
    (metric_date, staff_user_id, inbound_calls_count, outbound_calls_count, talk_time_minutes)
  SELECT _date,
         COALESCE(cl.employee_id, e.employee_id),
         count(*) FILTER (WHERE cl.direction = 'inbound')::int,
         count(*) FILTER (WHERE cl.direction = 'outbound')::int,
         COALESCE(ROUND(SUM(cl.duration_seconds) / 60.0), 0)::int
    FROM public.call_logs cl
    LEFT JOIN public.call_log_extensions e ON e.extension = cl.extension
   -- `cl.employee_id` را importer در زمانِ import می‌چسباند، پس روی ردیف‌هایی
   -- که پیش از نگاشت وارد شده‌اند تهی است. نگاشتِ زندهٔ داخلی fallback است، نه
   -- جایگزین: هر ردیفی که قبلاً نسبت داده شده بود دقیقاً همان نسبت را نگه
   -- می‌دارد. گاردِ پوشش تضمین می‌کند e.employee_id برای هر داخلیِ این پنجره
   -- موجود است، پس هیچ ردیفی بی‌صدا حذف نمی‌شود.
   WHERE COALESCE(cl.employee_id, e.employee_id) IS NOT NULL
     AND (cl.started_at AT TIME ZONE 'Asia/Tehran')::date = _date
   GROUP BY COALESCE(cl.employee_id, e.employee_id)
  ON CONFLICT (metric_date, staff_user_id) DO UPDATE
     SET inbound_calls_count  = EXCLUDED.inbound_calls_count,
         outbound_calls_count = EXCLUDED.outbound_calls_count,
         talk_time_minutes    = EXCLUDED.talk_time_minutes,
         updated_at           = now();
  -- ستون‌های sales_amount / profit_amount عمداً دست‌نخورده می‌مانند؛ منبعشان
  -- این تابع نیست.

  GET DIAGNOSTICS _rows = ROW_COUNT;

  PERFORM set_config('afrakala.deriving_call_metrics', 'off', true);

  RETURN jsonb_build_object(
    'switched_over',        true,
    'reason',               'covered',
    'for_date',             _date,
    'go_live',              _go_live,
    'rows_written',         _rows,
    'extensions_in_window', _cov->'extensions_in_window',
    'mapped_extensions',    _cov->'extensions_in_window',
    'blocked_by',           '[]'::jsonb);
END;
$function$;

COMMENT ON FUNCTION public.derive_staff_call_metrics(date) IS
  'C-7/C-1 · استخراج شمار تماس و دقایق مکالمهٔ هر کارمند از call_logs برای یک روز. '
  'برای تاریخِ پیش از issabel_import_since_date استثنا می‌اندازد و نمی‌نویسد. '
  'تا وقتی هر داخلیِ دارای تماس در همان روز به یک کارمند نسبت داده نشده باشد '
  'هیچ نمی‌نویسد و فهرست blocked_by را برمی‌گرداند؛ ثبت دستی تا آن لحظه ادامه دارد.';

REVOKE ALL ON FUNCTION public.derive_staff_call_metrics(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.derive_staff_call_metrics(date) FROM anon;
REVOKE ALL ON FUNCTION public.derive_staff_call_metrics(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.derive_staff_call_metrics(date) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- ۳) نیمهٔ ساخته‌نشده — گاردِ ثبت دستی، در لایه‌ای که هیچ مسیر نوشتنی دورش نمی‌زند
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_call_metrics_manual_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _cov jsonb;
BEGIN
  -- نوشتنِ خودِ تابع مشتق‌کننده. تنها راهِ روشن‌کردنِ این پرچم SQLِ مستقیم است؛
  -- این گارد جلوی مسیرِ برنامه را می‌گیرد، نه جلوی superuser را.
  IF COALESCE(current_setting('afrakala.deriving_call_metrics', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  -- فقط وقتی اهمیت دارد که واقعاً ستون‌های تماس نوشته می‌شوند. ویرایشِ فروش و
  -- سود روی ردیفی که مقادیر تماسش دست‌نخورده می‌ماند آزاد است.
  IF TG_OP = 'UPDATE'
     AND NEW.inbound_calls_count  IS NOT DISTINCT FROM OLD.inbound_calls_count
     AND NEW.outbound_calls_count IS NOT DISTINCT FROM OLD.outbound_calls_count
     AND NEW.talk_time_minutes    IS NOT DISTINCT FROM OLD.talk_time_minutes THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     AND COALESCE(NEW.inbound_calls_count, 0)  = 0
     AND COALESCE(NEW.outbound_calls_count, 0) = 0
     AND COALESCE(NEW.talk_time_minutes, 0)    = 0 THEN
    RETURN NEW;
  END IF;

  _cov := public.staff_call_metrics_coverage(NEW.metric_date);

  IF (_cov->>'covered')::boolean THEN
    RAISE EXCEPTION
      'ثبت دستی آمار تماس برای % مجاز نیست: نگاشت داخلی‌ها برای این روز کامل است و آمار تماس از CDR محاسبه می‌شود. فروش و سود همچنان دستی ثبت می‌شوند.',
      NEW.metric_date
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.staff_call_metrics_manual_guard() IS
  'C-1 · وقتی نگاشت داخلی‌های یک روز کامل است، ثبت دستیِ سه ستون تماس را رد '
  'می‌کند. در تریگر است نه در RPC، چون RLS همین جدول به admin/manager/accountant '
  'نوشتنِ مستقیم می‌دهد و PostgREST جدول را مستقیم عرضه می‌کند.';

DROP TRIGGER IF EXISTS trg_staff_call_metrics_manual_guard
  ON public.staff_daily_performance_metrics;

CREATE TRIGGER trg_staff_call_metrics_manual_guard
  BEFORE INSERT OR UPDATE ON public.staff_daily_performance_metrics
  FOR EACH ROW EXECUTE FUNCTION public.staff_call_metrics_manual_guard();

COMMIT;
